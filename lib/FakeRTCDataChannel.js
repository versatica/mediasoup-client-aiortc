"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const event_target_shim_1 = require("event-target-shim");
const Logger_1 = require("mediasoup-client/lib/Logger");
const logger = new Logger_1.Logger('aiortc:FakeRTCDataChannel');
class FakeRTCDataChannel extends event_target_shim_1.EventTarget {
    constructor(internal, channel, { id, ordered = true, maxPacketLifeTime = null, maxRetransmits = null, label = '', protocol = '' }) {
        super();
        this._negotiated = true; // mediasoup just uses negotiated DataChannels.
        this._readyState = 'connecting';
        this._bufferedAmount = 0;
        this._bufferedAmountLowThreshold = 0;
        this._binaryType = 'blob';
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
    set binaryType(value) {
        this._binaryType = value;
        // TODO: Let's see how to deal with this. aiortc does not implement this
        // since this just makes sense in JS. We should use this setting when
        // 'message' event is fired (we should generate a "Blob" if "blob" and an
        // ArrayBuffer if "arraybuffer").
    }
    // NOTE: Deprecated in the spec but required by RTCDataChannel TS definition.
    get priority() {
        return this._priority;
    }
    set priority(value) {
        this._priority = value;
    }
    close() {
        if (['closing', 'closed'].includes(this._readyState))
            return;
        this._readyState = 'closed';
        // Remove notification subscriptions.
        this._channel.removeAllListeners(this._internal.dataChannelId);
        this._channel.notify('datachannel.close', this._internal);
    }
    /**
     * We extend the definition of send() to allow Node Buffer.
     */
    send(data) {
        // TODO: Is seems that aiortc only emits 'open' for the first DataChannel.
        // if (this._readyState !== 'open')
        // throw new InvalidStateError('not open');
        this._channel.notify('datachannel.send', this._internal, data);
    }
    _handleWorkerNotifications() {
        this._channel.on(this._internal.dataChannelId, (event, data) => {
            switch (event) {
                case 'open':
                    {
                        this._readyState = 'open';
                        this.dispatchEvent({ type: 'open' });
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
                        this.dispatchEvent({ type: 'close' });
                        break;
                    }
                case 'message':
                    {
                        // TODO: Must handle binary messages and produce a Blob or an
                        // ArrayBuffer depending on this._binaryType.
                        this.dispatchEvent({ type: 'message', data });
                        break;
                    }
                case 'bufferedamountlow':
                    {
                        this.dispatchEvent({ type: 'bufferedamountlow' });
                        break;
                    }
                case 'error':
                    {
                        // NOTE: aiortc does not emit 'error'. In theory this should be a
                        // RTCErrorEvent, but anyway.
                        this.dispatchEvent({ type: 'error' });
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
// Define EventTarget properties.
event_target_shim_1.defineEventAttribute(FakeRTCDataChannel.prototype, 'open');
event_target_shim_1.defineEventAttribute(FakeRTCDataChannel.prototype, 'closing');
event_target_shim_1.defineEventAttribute(FakeRTCDataChannel.prototype, 'close');
event_target_shim_1.defineEventAttribute(FakeRTCDataChannel.prototype, 'message');
event_target_shim_1.defineEventAttribute(FakeRTCDataChannel.prototype, 'bufferedamountlow');
event_target_shim_1.defineEventAttribute(FakeRTCDataChannel.prototype, 'error');
