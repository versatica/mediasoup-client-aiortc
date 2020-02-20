"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const v4_1 = __importDefault(require("uuid/v4"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const Logger_1 = require("mediasoup-client/lib/Logger");
const EnhancedEventEmitter_1 = require("mediasoup-client/lib/EnhancedEventEmitter");
const Channel_1 = require("./Channel");
const FakeRTCDataChannel_1 = require("./FakeRTCDataChannel");
const FakeRTCStatsReport_1 = require("./FakeRTCStatsReport");
// Whether the Python subprocess should log via PIPE to Node.js or directly to
// stdout and stderr.
const PYTHON_LOG_VIA_PIPE = process.env.PYTHON_LOG_TO_STDOUT !== 'true';
const logger = new Logger_1.Logger('aiortc:Worker');
class Worker extends EnhancedEventEmitter_1.EnhancedEventEmitter {
    /**
     * @emits open
     * @emits failed - (error: Error)
     * @emits error - (error: Error)
     */
    constructor({ rtcConfiguration, logLevel = 'none' } = {}) {
        super();
        // State.
        this._state = 'connecting';
        logger.debug('constructor() [rtcConfiguration:%o, logLevel:%o]', rtcConfiguration, logLevel);
        const spawnBin = process.env.PYTHON3 || 'python3';
        const spawnArgs = [];
        spawnArgs.push('-u'); // Unbuffered stdio.
        spawnArgs.push(path.join(__dirname, '..', 'worker', 'worker.py'));
        if (logLevel)
            spawnArgs.push(`--logLevel=${logLevel}`);
        if (rtcConfiguration && Array.isArray(rtcConfiguration.iceServers))
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
        const pid = this._child.pid;
        this._channel = new Channel_1.Channel({
            sendSocket: this._child.stdio[3],
            recvSocket: this._child.stdio[4]
        });
        let spawnDone = false;
        this._handleWorkerNotifications();
        // Listen for 'running' notification.
        this._channel.once(String(pid), (event) => {
            if (!spawnDone && event === 'running') {
                spawnDone = true;
                logger.debug('worker process running [pid:%s]', pid);
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
                    logger.error('worker process failed due to wrong settings [pid:%s]', pid);
                    this.emit('failed', new TypeError('wrong settings'));
                }
                else {
                    logger.error('worker process failed unexpectedly [pid:%s, code:%s, signal:%s]', pid, code, signal);
                    this.emit('failed', new Error(`[pid:${pid}, code:${code}, signal:${signal}]`));
                }
            }
            else {
                logger.error('worker process died unexpectedly [pid:%s, code:%s, signal:%s]', pid, code, signal);
                this.emit('error', new Error(`[pid:${pid}, code:${code}, signal:${signal}]`));
            }
        });
        this._child.on('error', (error) => {
            this._child = undefined;
            this.close();
            if (!spawnDone) {
                spawnDone = true;
                logger.error('worker process failed [pid:%s]: %s', pid, error.message);
                this.emit('failed', error);
            }
            else {
                logger.error('worker process error [pid:%s]: %s', pid, error.message);
                this.emit('error', error);
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
            if (PYTHON_LOG_VIA_PIPE) {
                this._child.stdout.removeAllListeners();
                this._child.stderr.removeAllListeners();
            }
            this._child.removeAllListeners('exit');
            this._child.removeAllListeners('error');
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            this._child.on('error', () => { });
            // NOTE: We don't need to kill the child but anyway.
            this._child.kill('SIGTERM');
            this._child = undefined;
        }
        // Close the Channel instance.
        this._channel.close();
    }
    getState() {
        return this._state;
    }
    async getRtpCapabilities() {
        logger.debug('getRtpCapabilities()');
        return this._channel.request('getRtpCapabilities');
    }
    async getLocalDescription() {
        logger.debug('getLocalDescription()');
        return this._channel.request('getLocalDescription');
    }
    async setLocalDescription(desc) {
        logger.debug('setLocalDescription()');
        return this._channel.request('setLocalDescription', undefined, desc);
    }
    async setRemoteDescription(desc) {
        logger.debug('setRemoteDescription()');
        return this._channel.request('setRemoteDescription', undefined, desc);
    }
    async createOffer(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    { iceRestart } = {}) {
        logger.debug('setRemoteDescription()');
        return this._channel.request('createOffer');
    }
    async createAnswer() {
        logger.debug('createAnswer()');
        return this._channel.request('createAnswer');
    }
    async addTrack(options) {
        logger.debug('send() [options:%o]', options);
        return this._channel.request('addTrack', undefined, options);
    }
    async removeTrack(trackId) {
        logger.debug(`removeTrack() | [trackId:${trackId}]`);
        return this._channel.request('removeTrack', undefined, { trackId });
    }
    async getMid(trackId) {
        logger.debug('getMid()');
        try {
            const mid = await this._channel.request('getMid', undefined, { trackId });
            return mid;
        }
        catch (error) {
            return undefined;
        }
    }
    enableTrack(trackId) {
        logger.debug(`enableTrack() | [trackId:${trackId}]`);
        this._channel.notify('enableTrack', undefined, { trackId });
    }
    disableTrack(trackId) {
        logger.debug(`disableTrack() | [trackId:${trackId}]`);
        this._channel.notify('disableTrack', undefined, { trackId });
    }
    async createDataChannel(options) {
        logger.debug('createDataChannel() [options:%o]', options);
        const internal = { dataChannelId: v4_1.default() };
        const { streamId, ordered, maxPacketLifeTime, maxRetransmits, label, protocol, readyState, bufferedAmount, bufferedAmountLowThreshold } = await this._channel.request('createDataChannel', internal, {
            id: options.streamId,
            ordered: options.ordered,
            maxPacketLifeTime: options.maxPacketLifeTime || null,
            maxRetransmits: options.maxRetransmits || null,
            label: options.label,
            protocol: options.protocol
        });
        return new FakeRTCDataChannel_1.FakeRTCDataChannel(internal, this._channel, {
            id: streamId,
            ordered,
            maxPacketLifeTime,
            maxRetransmits,
            label,
            protocol
        }, {
            readyState,
            bufferedAmount,
            bufferedAmountLowThreshold
        });
    }
    async getTransportStats() {
        const data = await this._channel.request('getTransportStats');
        return new FakeRTCStatsReport_1.FakeRTCStatsReport(data);
    }
    async getSenderStats(mid) {
        const data = await this._channel.request('getSenderStats', undefined, { mid });
        return new FakeRTCStatsReport_1.FakeRTCStatsReport(data);
    }
    async getReceiverStats(mid) {
        const data = await this._channel.request('getReceiverStats', undefined, { mid });
        return new FakeRTCStatsReport_1.FakeRTCStatsReport(data);
    }
    _handleWorkerNotifications() {
        this._channel.on(String(this._child.pid), (event, data) => {
            switch (event) {
                case 'iceconnectionstatechange':
                    {
                        this.emit('iceconnectionstatechange', data);
                        break;
                    }
            }
        });
    }
}
exports.Worker = Worker;
