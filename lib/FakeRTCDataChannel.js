"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FakeRTCDataChannel = void 0;
const event_target_shim_1 = require("event-target-shim");
const Logger_1 = require("mediasoup-client/lib/Logger");
const errors_1 = require("mediasoup-client/lib/errors");
const logger = new Logger_1.Logger('aiortc:FakeRTCDataChannel');
class FakeRTCDataChannel extends event_target_shim_1.EventTarget {
    constructor(internal, channel, { id, ordered = true, maxPacketLifeTime = null, maxRetransmits = null, label = '', protocol = '' }, status) {
        super();
        this._negotiated = true; // mediasoup just uses negotiated DataChannels.
        this._readyState = 'connecting';
        this._bufferedAmount = 0;
        this._bufferedAmountLowThreshold = 0;
        this._binaryType = 'arraybuffer';
        // NOTE: Deprecated as per spec, but still required by TS/ RTCDataChannel.
        this._priority = 'high';
        logger.debug(`constructor() [id:${id}, ordered:${ordered}, maxPacketLifeTime:${maxPacketLifeTime}, maxRetransmits:${maxRetransmits}, label:${label}, protocol:${protocol}`);
        this._internal = internal;
        this._channel = channel;
        this._id = id;
        this._ordered = ordered;
        this._maxPacketLifeTime = maxPacketLifeTime;
        this._maxRetransmits = maxRetransmits;
        this._label = label;
        this._protocol = protocol;
        this._readyState = status.readyState;
        this._bufferedAmount = status.bufferedAmount;
        this._bufferedAmountLowThreshold = status.bufferedAmountLowThreshold;
        this._handleWorkerNotifications();
    }
    get id() {
        return this._id;
    }
    get negotiated() {
        return this._negotiated;
    }
    get ordered() {
        return this._ordered;
    }
    get maxPacketLifeTime() {
        return this._maxPacketLifeTime;
    }
    get maxRetransmits() {
        return this._maxRetransmits;
    }
    get label() {
        return this._label;
    }
    get protocol() {
        return this._protocol;
    }
    get readyState() {
        return this._readyState;
    }
    get bufferedAmount() {
        return this._bufferedAmount;
    }
    get bufferedAmountLowThreshold() {
        return this._bufferedAmountLowThreshold;
    }
    set bufferedAmountLowThreshold(value) {
        this._bufferedAmountLowThreshold = value;
        this._channel.notify('datachannel.setBufferedAmountLowThreshold', this._internal, value);
    }
    get binaryType() {
        return this._binaryType;
    }
    // NOTE: Just 'arraybuffer' is valid for Node.js.
    set binaryType(value) {
        logger.warn('binaryType setter not implemented, using "arraybuffer"');
    }
    // NOTE: Deprecated in the spec but required by RTCDataChannel TS definition.
    get priority() {
        return this._priority;
    }
    set priority(value) {
        this._priority = value;
    }
    get onopen() {
        return (0, event_target_shim_1.getEventAttributeValue)(this, 'open');
    }
    set onopen(listener) {
        (0, event_target_shim_1.setEventAttributeValue)(this, 'open', listener);
    }
    get onclosing() {
        return (0, event_target_shim_1.getEventAttributeValue)(this, 'closing');
    }
    set onclosing(listener) {
        (0, event_target_shim_1.setEventAttributeValue)(this, 'closing', listener);
    }
    get onclose() {
        return (0, event_target_shim_1.getEventAttributeValue)(this, 'close');
    }
    set onclose(listener) {
        (0, event_target_shim_1.setEventAttributeValue)(this, 'close', listener);
    }
    get onmessage() {
        return (0, event_target_shim_1.getEventAttributeValue)(this, 'message');
    }
    set onmessage(listener) {
        (0, event_target_shim_1.setEventAttributeValue)(this, 'message', listener);
    }
    get onbufferedamountlow() {
        return (0, event_target_shim_1.getEventAttributeValue)(this, 'bufferedamountlow');
    }
    set onbufferedamountlow(listener) {
        (0, event_target_shim_1.setEventAttributeValue)(this, 'bufferedamountlow', listener);
    }
    get onerror() {
        return (0, event_target_shim_1.getEventAttributeValue)(this, 'error');
    }
    set onerror(listener) {
        (0, event_target_shim_1.setEventAttributeValue)(this, 'error', listener);
    }
    close() {
        if (['closing', 'closed'].includes(this._readyState))
            return;
        this._readyState = 'closed';
        // Remove notification subscriptions.
        this._channel.removeAllListeners(this._internal.dataChannelId);
        // Notify the worker.
        this._channel.notify('datachannel.close', this._internal);
    }
    /**
     * We extend the definition of send() to allow Node Buffer. However
     * ArrayBufferView and Blob do not exist in Node.
     */
    send(data) {
        if (this._readyState !== 'open')
            throw new errors_1.InvalidStateError('not open');
        if (typeof data === 'string') {
            this._channel.notify('datachannel.send', this._internal, data);
        }
        else if (data instanceof ArrayBuffer) {
            const buffer = Buffer.from(data);
            this._channel.notify('datachannel.sendBinary', this._internal, buffer.toString('base64'));
        }
        else if (data instanceof Buffer) {
            this._channel.notify('datachannel.sendBinary', this._internal, data.toString('base64'));
        }
        else {
            throw new TypeError('invalid data type');
        }
    }
    _handleWorkerNotifications() {
        this._channel.on(this._internal.dataChannelId, (event, data) => {
            switch (event) {
                case 'open':
                    {
                        this._readyState = 'open';
                        this.dispatchEvent(new event_target_shim_1.Event('open'));
                        break;
                    }
                case 'closing':
                case 'close':
                    {
                        if (this._readyState === 'closed')
                            break;
                        this._readyState = 'closed';
                        // Remove notification subscriptions.
                        this._channel.removeAllListeners(this._internal.dataChannelId);
                        this.dispatchEvent(new event_target_shim_1.Event('close'));
                        break;
                    }
                case 'message':
                    {
                        // @ts-ignore
                        this.dispatchEvent(new event_target_shim_1.Event('message', { data }));
                        break;
                    }
                case 'binary':
                    {
                        const buffer = Buffer.from(data, 'utf-8');
                        const arrayBuffer = new ArrayBuffer(buffer.length);
                        const view = new Uint8Array(arrayBuffer);
                        for (let i = 0; i < buffer.length; ++i) {
                            view[i] = buffer[i];
                        }
                        // @ts-ignore
                        this.dispatchEvent(new event_target_shim_1.Event('message', { data: arrayBuffer }));
                        break;
                    }
                case 'bufferedamountlow':
                    {
                        this.dispatchEvent(new event_target_shim_1.Event('bufferedamountlow'));
                        break;
                    }
                case 'bufferedamount':
                    {
                        this._bufferedAmount = data;
                        break;
                    }
                case 'error':
                    {
                        // NOTE: aiortc does not emit 'error'. In theory this should be a
                        // RTCErrorEvent, but anyway.
                        this.dispatchEvent(new event_target_shim_1.Event('error'));
                        break;
                    }
                default:
                    {
                        logger.error('ignoring unknown event "%s"', event);
                    }
            }
        });
    }
}
exports.FakeRTCDataChannel = FakeRTCDataChannel;
