"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const Logger_1 = require("mediasoup-client/src/Logger");
const EnhancedEventEmitter_1 = require("mediasoup-client/src/EnhancedEventEmitter");
const Channel_1 = require("./Channel");
const FakeRTCStatsReport_1 = require("./FakeRTCStatsReport");
// TODO.
const workerBin = '/usr/local/bin/python3';
const logger = new Logger_1.Logger('aiortc:Worker');
const workerLogger = new Logger_1.Logger('aiortc:Worker');
class Worker extends EnhancedEventEmitter_1.EnhancedEventEmitter {
    /**
     * @emits open
     * @emits failed - (error: Error)
     * @emits error - (error: Error)
     */
    constructor({ rtcConfiguration, logLevel = 'error' } = {}) {
        super();
        // State.
        this._state = 'closed';
        logger.debug('constructor()');
        const spawnBin = workerBin;
        const spawnArgs = [];
        spawnArgs.push('-u'); // Unbuffered stdio.
        spawnArgs.push(path.join(__dirname, '..', 'worker', 'worker.py'));
        if (logLevel)
            spawnArgs.push(`--logLevel=${logLevel}`);
        if (rtcConfiguration)
            spawnArgs.push(`--rtcConfiguration=${JSON.stringify(rtcConfiguration)}`);
        logger.debug('spawning worker process: %s %s', spawnBin, spawnArgs.join(' '));
        this._state = 'connecting';
        this._child = child_process_1.spawn(
        // command
        spawnBin, 
        // args
        spawnArgs, 
        // options
        {
            env: {
                MEDIASOUP_VERSION: '__MEDIASOUP_VERSION__'
            },
            detached: false,
            // fd 0 (stdin)   : Just ignore it.
            // fd 1 (stdout)  : Pipe it for 3rd libraries that log their own stuff.
            // fd 2 (stderr)  : Same as stdout.
            // fd 3 (channel) : Producer Channel fd.
            // fd 4 (channel) : Consumer Channel fd.
            stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe']
        });
        this._pid = this._child.pid;
        this._channel = new Channel_1.Channel({
            sendSocket: this._child.stdio[3],
            recvSocket: this._child.stdio[4],
            pid: this._pid
        });
        let spawnDone = false;
        // Listen for iceconnectionstatechange event.
        this._channel.on('iceconnectionstatechange', (iceConnectionState) => {
            this.emit('iceconnectionstatechange', iceConnectionState);
        });
        // Listen for 'open' notification.
        this._channel.once(String(this._pid), (event) => {
            if (!spawnDone && event === 'running') {
                spawnDone = true;
                logger.debug('worker process running [pid:%s]', this._pid);
                this._state = 'open';
                this.emit('open');
            }
        });
        this._child.on('exit', (code, signal) => {
            this._child = undefined;
            this.close();
            if (!spawnDone) {
                spawnDone = true;
                if (code === 42) {
                    logger.error('worker process failed due to wrong settings [pid:%s]', this._pid);
                    this.emit('failed', new TypeError('wrong settings'));
                }
                else {
                    logger.error('worker process failed unexpectedly [pid:%s, code:%s, signal:%s]', this._pid, code, signal);
                    this._state = 'closed';
                    this.emit('failed', new Error(`[pid:${this._pid}, code:${code}, signal:${signal}]`));
                }
            }
            else {
                logger.error('worker process died unexpectedly [pid:%s, code:%s, signal:%s]', this._pid, code, signal);
                this._state = 'closed';
                this.emit('error', new Error(`[pid:${this._pid}, code:${code}, signal:${signal}]`));
            }
        });
        this._child.on('error', (error) => {
            this._child = undefined;
            this.close();
            if (!spawnDone) {
                spawnDone = true;
                logger.error('worker process failed [pid:%s]: %s', this._pid, error.message);
                this._state = 'closed';
                this.emit('failed', error);
            }
            else {
                logger.error('worker process error [pid:%s]: %s', this._pid, error.message);
                this._state = 'closed';
                this.emit('error', error);
            }
        });
        // Be ready for 3rd party worker libraries logging to stdout.
        this._child.stdout.on('data', (buffer) => {
            for (const line of buffer.toString('utf8').split('\n')) {
                if (line)
                    workerLogger.debug(`(stdout) ${line}`);
            }
        });
        // In case of a worker bug, mediasoup will log to stderr.
        this._child.stderr.on('data', (buffer) => {
            for (const line of buffer.toString('utf8').split('\n')) {
                if (line)
                    workerLogger.error(`(stderr) ${line}`);
            }
        });
    }
    /**
     * Worker process identifier (PID).
     */
    get pid() {
        return this._pid;
    }
    /**
     * Close the Worker.
     */
    close() {
        logger.debug('close()');
        if (this._state === 'closed')
            return;
        this._state = 'closed';
        // Kill the worker process.
        if (this._child) {
            // Remove event listeners but leave a fake 'error' hander to avoid
            // propagation.
            this._child.removeAllListeners('exit');
            this._child.removeAllListeners('error');
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            this._child.on('error', () => { });
            this._child.kill('SIGTERM');
            this._child = undefined;
        }
        // Close the Channel instance.
        this._channel.close();
    }
    /**
     * Dump Worker.
     */
    dump() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('dump()');
            // TODO.
        });
    }
    getState() {
        return this._state;
    }
    getRtpCapabilities() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('getRtpCapabilities()');
            return this._channel.request('getRtpCapabilities');
        });
    }
    getLocalDescription() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('getLocalDescription()');
            return this._channel.request('getLocalDescription');
        });
    }
    setLocalDescription(desc) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('setLocalDescription()');
            return this._channel.request('setLocalDescription', desc);
        });
    }
    setRemoteDescription(desc) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('setRemoteDescription()');
            return this._channel.request('setRemoteDescription', desc);
        });
    }
    createOffer(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    { iceRestart } = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('setRemoteDescription()');
            return this._channel.request('createOffer');
        });
    }
    createAnswer() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('createAnswer()');
            return this._channel.request('createAnswer');
        });
    }
    addTrack(options) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('send() [options:%o]', options);
            return this._channel.request('addTrack', options);
        });
    }
    removeTrack(trackId) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug(`removeTrack() | [trackId:${trackId}]`);
            return this._channel.request('removeTrack', { trackId });
        });
    }
    getMid(trackId) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('getMid()');
            try {
                const mid = yield this._channel.request('getMid', { trackId });
                return mid;
            }
            catch (error) {
                return undefined;
            }
        });
    }
    enableTrack(trackId) {
        logger.debug(`enableTrack() | [trackId:${trackId}]`);
        this._channel.notify('enableTrack', { trackId });
    }
    disableTrack(trackId) {
        logger.debug(`disableTrack() | [trackId:${trackId}]`);
        this._channel.notify('disableTrack', { trackId });
    }
    getTransportStats() {
        return __awaiter(this, void 0, void 0, function* () {
            const data = yield this._channel.request('getTransportStats');
            return new FakeRTCStatsReport_1.FakeRTCStatsReport(data);
        });
    }
    getSenderStats(trackId) {
        return __awaiter(this, void 0, void 0, function* () {
            const data = yield this._channel.request('getSenderStats', { trackId });
            return new FakeRTCStatsReport_1.FakeRTCStatsReport(data);
        });
    }
    getReceiverStats(trackId) {
        return __awaiter(this, void 0, void 0, function* () {
            const data = yield this._channel.request('getReceiverStats', { trackId });
            return new FakeRTCStatsReport_1.FakeRTCStatsReport(data);
        });
    }
}
exports.Worker = Worker;
