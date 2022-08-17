"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Worker = void 0;
const uuid_1 = require("uuid");
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const Logger_1 = require("mediasoup-client/lib/Logger");
const EnhancedEventEmitter_1 = require("mediasoup-client/lib/EnhancedEventEmitter");
const Channel_1 = require("./Channel");
const media = __importStar(require("./media"));
const Handler_1 = require("./Handler");
// Whether the Python subprocess should log via PIPE to Node.js or directly to
// stdout and stderr.
const PYTHON_LOG_VIA_PIPE = process.env.PYTHON_LOG_TO_STDOUT !== 'true';
const logger = new Logger_1.Logger('aiortc:Worker');
class Worker extends EnhancedEventEmitter_1.EnhancedEventEmitter {
    /**
     * @emits died - (error: Error)
     * @emits @success
     * @emits @failure - (error: Error)
     */
    constructor({ logLevel }) {
        super();
        // Closed flag.
        this._closed = false;
        // Handlers set.
        this._handlers = new Set();
        logger.debug('constructor() [logLevel:%o]', logLevel);
        const spawnBin = process.env.PYTHON3 || 'python3';
        const spawnArgs = [];
        spawnArgs.push('-u'); // Unbuffered stdio.
        spawnArgs.push(path.join(__dirname, '..', 'worker', 'worker.py'));
        if (logLevel)
            spawnArgs.push(`--logLevel=${logLevel}`);
        logger.debug('spawning worker process: %s %s', spawnBin, spawnArgs.join(' '));
        this._child = (0, child_process_1.spawn)(
        // command
        spawnBin, 
        // args
        spawnArgs, 
        // options
        {
            detached: false,
            // fd 0 (stdin)   : Just ignore it.
            // fd 1 (stdout)  : Pipe it for 3rd libraries that log their own stuff.
            // fd 2 (stderr)  : Same as stdout.
            // fd 3 (channel) : Producer Channel fd.
            // fd 4 (channel) : Consumer Channel fd.
            stdio: [
                'ignore',
                PYTHON_LOG_VIA_PIPE ? 'pipe' : 'inherit',
                PYTHON_LOG_VIA_PIPE ? 'pipe' : 'inherit',
                'pipe',
                'pipe'
            ]
        });
        this._pid = this._child.pid;
        this._channel = new Channel_1.Channel({
            sendSocket: this._child.stdio[3],
            recvSocket: this._child.stdio[4],
            pid: this._pid
        });
        let spawnDone = false;
        // Listen for 'running' notification.
        this._channel.once(String(this._pid), (event) => {
            if (!spawnDone && event === 'running') {
                spawnDone = true;
                logger.debug('worker process running [pid:%s]', this._pid);
                this.emit('@success');
            }
        });
        this._child.on('exit', (code, signal) => {
            this._child = undefined;
            this.close();
            if (!spawnDone) {
                spawnDone = true;
                if (code === 42) {
                    logger.error('worker process failed due to wrong settings [pid:%s]', this._pid);
                    this.emit('@failure', new TypeError('wrong settings'));
                }
                else {
                    logger.error('worker process failed unexpectedly [pid:%s, code:%s, signal:%s]', this._pid, code, signal);
                    this.emit('@failure', new Error(`[pid:${this._pid}, code:${code}, signal:${signal}]`));
                }
            }
            else {
                logger.error('worker process died unexpectedly [pid:%s, code:%s, signal:%s]', this._pid, code, signal);
                this.safeEmit('died', new Error(`[pid:${this._pid}, code:${code}, signal:${signal}]`));
            }
        });
        this._child.on('error', (error) => {
            this._child = undefined;
            this.close();
            if (!spawnDone) {
                spawnDone = true;
                logger.error('worker process failed [pid:%s]: %s', this._pid, error.message);
                this.emit('@failure', error);
            }
            else {
                logger.error('worker process error [pid:%s]: %s', this._pid, error.message);
                this.safeEmit('died', error);
            }
        });
        if (PYTHON_LOG_VIA_PIPE) {
            // Be ready for 3rd party worker libraries logging to stdout.
            this._child.stdout.on('data', (buffer) => {
                for (const line of buffer.toString('utf8').split('\n')) {
                    if (line)
                        logger.debug(`(stdout) ${line}`);
                }
            });
            // In case of a worker bug, mediasoup will log to stderr.
            this._child.stderr.on('data', (buffer) => {
                for (const line of buffer.toString('utf8').split('\n')) {
                    if (line)
                        logger.error(`(stderr) ${line}`);
                }
            });
        }
    }
    /**
     * Worker process identifier (PID).
     */
    get pid() {
        return this._pid;
    }
    /**
     * Whether the Worker is closed.
     */
    get closed() {
        return this._closed;
    }
    /**
     * Close the Worker.
     */
    close() {
        logger.debug('close()');
        if (this._closed)
            return;
        this._closed = true;
        // Kill the worker process.
        if (this._child) {
            // Remove event listeners but leave a fake 'error' hander to avoid
            // propagation.
            if (PYTHON_LOG_VIA_PIPE) {
                this._child.stdout.removeAllListeners();
                this._child.stderr.removeAllListeners();
            }
            this._child.removeAllListeners('exit');
            this._child.removeAllListeners('error');
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            this._child.on('error', () => { });
            this._child = undefined;
        }
        // Close every Handler.
        for (const handler of this._handlers) {
            handler.close();
        }
        this._handlers.clear();
        // Close the Channel instance.
        this._channel.close();
    }
    async dump() {
        logger.debug('dump()');
        return this._channel.request('dump');
    }
    /**
     * Create a AiortcMediaStream with audio/video tracks.
     */
    async getUserMedia(constraints) {
        logger.debug('getUserMedia() [constraints:%o]', constraints);
        return media.getUserMedia(this._channel, constraints);
    }
    /**
     * Create a mediasoup-client HandlerFactory.
     */
    createHandlerFactory() {
        logger.debug('createHandlerFactory()');
        return () => {
            const internal = { handlerId: (0, uuid_1.v4)() };
            const handler = new Handler_1.Handler({
                internal,
                channel: this._channel
            });
            this._handlers.add(handler);
            handler.on('@close', () => this._handlers.delete(handler));
            return handler;
        };
    }
}
exports.Worker = Worker;
