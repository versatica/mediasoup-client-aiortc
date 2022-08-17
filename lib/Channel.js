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
exports.Channel = void 0;
// @ts-ignore
const netstring = __importStar(require("netstring"));
const Logger_1 = require("mediasoup-client/lib/Logger");
const EnhancedEventEmitter_1 = require("mediasoup-client/lib/EnhancedEventEmitter");
const errors_1 = require("mediasoup-client/lib/errors");
// netstring length for a 4194304 bytes payload.
const NS_MESSAGE_MAX_LEN = 4194313;
const NS_PAYLOAD_MAX_LEN = 4194304;
const logger = new Logger_1.Logger('aiortc:Channel');
class Channel extends EnhancedEventEmitter_1.EnhancedEventEmitter {
    constructor({ sendSocket, recvSocket, pid }) {
        super();
        // Closed flag.
        this._closed = false;
        // Next id for requests sent to the worker process.
        this._nextId = 0;
        // Map of pending sent requests.
        this._sents = new Map();
        logger.debug('constructor()');
        this._sendSocket = sendSocket;
        this._recvSocket = recvSocket;
        // Read Channel responses/notifications from the worker.
        this._recvSocket.on('data', (buffer) => {
            if (!this._recvBuffer) {
                this._recvBuffer = buffer;
            }
            else {
                this._recvBuffer = Buffer.concat([this._recvBuffer, buffer], this._recvBuffer.length + buffer.length);
            }
            if (this._recvBuffer.length > NS_PAYLOAD_MAX_LEN) {
                logger.error('receiving buffer is full, discarding all data into it');
                // Reset the buffer and exit.
                this._recvBuffer = null;
                return;
            }
            while (true) // eslint-disable-line no-constant-condition
             {
                let nsPayload;
                try {
                    nsPayload = netstring.nsPayload(this._recvBuffer);
                }
                catch (error) {
                    logger.error('invalid netstring data received from the worker process: %s', String(error));
                    // Reset the buffer and exit.
                    this._recvBuffer = undefined;
                    return;
                }
                // Incomplete netstring message.
                if (nsPayload === -1)
                    return;
                // We only expect JSON messages (Channel messages).
                // 123 = '{' (a Channel JSON messsage).
                if (nsPayload[0] === 123) {
                    this._processMessage(JSON.parse(nsPayload));
                }
                else {
                    // eslint-disable-next-line no-console
                    console.warn(`worker[pid:${pid}] unexpected data: %s`, nsPayload.toString('utf8', 1));
                }
                // Remove the read payload from the buffer.
                this._recvBuffer =
                    this._recvBuffer.slice(netstring.nsLength(this._recvBuffer));
                if (!this._recvBuffer.length) {
                    this._recvBuffer = undefined;
                    return;
                }
            }
        });
        this._sendSocket.on('end', () => (logger.debug('send Channel ended by the worker process')));
        this._sendSocket.on('error', (error) => (logger.error('send Channel error: %s', String(error))));
        this._recvSocket.on('end', () => (logger.debug('receive Channel ended by the worker process')));
        this._recvSocket.on('error', (error) => (logger.error('receive Channel error: %s', String(error))));
    }
    close() {
        logger.debug('close()');
        if (this._closed)
            return;
        this._closed = true;
        // Close every pending sent.
        for (const sent of this._sents.values()) {
            sent.close();
        }
        // Remove event listeners but leave a fake 'error' hander to avoid
        // propagation.
        this._sendSocket.removeAllListeners('end');
        this._sendSocket.removeAllListeners('error');
        this._sendSocket.on('error', () => { });
        this._recvSocket.removeAllListeners('end');
        this._recvSocket.removeAllListeners('error');
        this._recvSocket.on('error', () => { });
        // Destroy the socket after a while to allow pending incoming messages.
        setTimeout(() => {
            try {
                this._sendSocket.destroy();
            }
            catch (error) { }
            try {
                this._recvSocket.destroy();
            }
            catch (error) { }
        }, 200);
    }
    async request(method, internal, data) {
        this._nextId < 4294967295 ? ++this._nextId : (this._nextId = 1);
        const id = this._nextId;
        logger.debug('request() [method:%s, id:%s]', method, id);
        if (this._closed)
            throw new errors_1.InvalidStateError('Channel closed');
        const request = { id, method, internal, data };
        const ns = netstring.nsWrite(JSON.stringify(request));
        if (Buffer.byteLength(ns) > NS_MESSAGE_MAX_LEN) {
            throw new Error(`Channel request too big [length:${Buffer.byteLength(ns)}]`);
        }
        // This may throw if closed or remote side ended.
        // Terminate with \r\n since we are expecting for it on the python side.
        this._sendSocket.write(ns);
        return new Promise((pResolve, pReject) => {
            const timeout = 1000 * (15 + (0.1 * this._sents.size));
            const sent = {
                id: id,
                method: method,
                resolve: (data2) => {
                    if (!this._sents.delete(id))
                        return;
                    clearTimeout(sent.timer);
                    pResolve(data2);
                },
                reject: (error) => {
                    if (!this._sents.delete(id))
                        return;
                    clearTimeout(sent.timer);
                    pReject(error);
                },
                timer: setTimeout(() => {
                    if (!this._sents.delete(id))
                        return;
                    pReject(new Error('Channel request timeout'));
                }, timeout),
                close: () => {
                    clearTimeout(sent.timer);
                    pReject(new errors_1.InvalidStateError('Channel closed'));
                }
            };
            // Add sent stuff to the map.
            this._sents.set(id, sent);
        });
    }
    notify(event, internal, data) {
        logger.debug('notify() [event:%s]', event);
        if (this._closed) {
            logger.warn('notify() | Channel closed');
            return;
        }
        const notification = { event, internal, data };
        const ns = netstring.nsWrite(JSON.stringify(notification));
        if (Buffer.byteLength(ns) > NS_MESSAGE_MAX_LEN) {
            logger.error('notify() | notification too big [length:%s]', Buffer.byteLength(ns));
            return;
        }
        // This may throw if closed or remote side ended.
        // Terminate with \r\n since we are expecting for it on the python side.
        try {
            this._sendSocket.write(ns);
        }
        catch (error) {
            logger.warn('notify() | failed: %s', String(error));
        }
    }
    _processMessage(msg) {
        // If a response retrieve its associated request.
        if (msg.id) {
            const sent = this._sents.get(msg.id);
            if (!sent) {
                logger.error('received response does not match any sent request [id:%s]', msg.id);
                return;
            }
            if (msg.accepted) {
                logger.debug('request succeeded [method:%s, id:%s]', sent.method, sent.id);
                sent.resolve(msg.data);
            }
            else if (msg.error) {
                logger.warn('request failed [method:%s, id:%s]: %s', sent.method, sent.id, msg.reason);
                switch (msg.error) {
                    case 'TypeError':
                        sent.reject(new TypeError(msg.reason));
                        break;
                    default:
                        sent.reject(new Error(msg.reason));
                }
            }
            else {
                logger.error('received response is not accepted nor rejected [method:%s, id:%s]', sent.method, sent.id);
            }
        }
        // If a notification emit it to the corresponding entity.
        else if (msg.event) {
            this.emit(msg.targetId, msg.event, msg.data);
        }
        // Otherwise unexpected message.
        else {
            logger.error('received message is not a response nor a notification');
        }
    }
}
exports.Channel = Channel;
