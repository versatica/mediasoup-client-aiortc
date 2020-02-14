"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const event_target_shim_1 = require("event-target-shim");
const Logger_1 = require("mediasoup-client/lib/Logger");
const errors_1 = require("mediasoup-client/lib/errors");
const logger = new Logger_1.Logger('aiortc:FakeRTCDataChannel');
class FakeRTCDataChannel extends event_target_shim_1.EventTarget {
    constructor({ id, ordered = true, maxPacketLifeTime = null, maxRetransmits = null, label = '', protocol = '' }) {
        super();
        this._negotiated = true; // mediasoup just uses negotiated DataChannels.
        this._readyState = 'connecting';
        this._bufferedAmount = 0;
        this._bufferedAmountLowThreshold = 0;
        this._binaryType = 'blob';
        // NOTE: Deprecated as per spec, but still required by TS/ RTCDataChannel.
        this._priority = 'high';
        // Other custom members.
        this._bufferedamountlowFired = false;
        logger.debug(`constructor() [id:${id}, ordered:${ordered}, maxPacketLifeTime:${maxPacketLifeTime}, maxRetransmits:${maxRetransmits}, label:${label}, protocol:${protocol}`);
        this._id = id;
        this._ordered = ordered;
        this._maxPacketLifeTime = maxPacketLifeTime;
        this._maxRetransmits = maxRetransmits;
        this._label = label;
        this._protocol = protocol;
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
        // TODO: Let's see if aiortc implements this.
    }
    get binaryType() {
        return this._binaryType;
    }
    set binaryType(value) {
        this._binaryType = value;
        // TODO: Let's see if aiortc implements this.
    }
    get priority() {
        return this._priority;
    }
    set priority(value) {
        this._priority = value;
    }
    close() {
        // NOTE: We do not use readyState 'closing'.
        if (['closing', 'closed'].includes(this._readyState))
            return;
        this._readyState = 'closed';
        // Notify the handler so it will close the aiortc's RTCDataChannel.
        this.dispatchEvent({ type: '@close' });
    }
    /**
     * We extend the definition of send() to allow Node Buffer.
     */
    send(data) {
        if (this._readyState !== 'open')
            throw new errors_1.InvalidStateError('not open');
        // Notify the handler so it will send the data.
        this.dispatchEvent({ type: '@send', data });
    }
    /**
     * Custom method to tell the FakeRTCDataChannel that readyState has changed
     * in the aiortc's RTCDataChannel.
     */
    setReadyState(readyState) {
        const previousReadyState = this._readyState;
        this._readyState = readyState;
        // Dispatch event if needed.
        if (this._readyState !== previousReadyState) {
            switch (this._readyState) {
                case 'open':
                    this.dispatchEvent({ type: 'open' });
                    break;
                case 'closing':
                    this.dispatchEvent({ type: 'closing' });
                    break;
                case 'closed':
                    this.dispatchEvent({ type: 'close' });
                    break;
            }
        }
        // Dispatch 'bufferedamountlow' if needed.
        if (!this._bufferedamountlowFired &&
            this._bufferedAmount < this._bufferedAmountLowThreshold) {
            this._bufferedamountlowFired = true;
            this.dispatchEvent({ type: 'bufferedamountlow' });
        }
        else if (this._bufferedamountlowFired &&
            this._bufferedAmount >= this._bufferedAmountLowThreshold) {
            this._bufferedamountlowFired = false;
        }
    }
    /**
     * Custom method to tell the FakeRTCDataChannel that a message has been
     * received from the remote.
     */
    receiveMessage(data) {
        // Dispatch 'message' event.
        this.dispatchEvent({ type: 'message', data });
    }
    /**
     * Custom method to tell the FakeRTCDataChannel that bufferedAmount has
     * changed in the aiortc's RTCDataChannel.
     */
    setBufferedAmount(value) {
        this._bufferedAmount = value;
        // Dispatch 'bufferedamountlow' if needed.
        if (!this._bufferedamountlowFired &&
            this._bufferedAmount < this._bufferedAmountLowThreshold) {
            this._bufferedamountlowFired = true;
            this.dispatchEvent({ type: 'bufferedamountlow' });
        }
        else if (this._bufferedamountlowFired &&
            this._bufferedAmount >= this._bufferedAmountLowThreshold) {
            this._bufferedamountlowFired = false;
        }
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
// Custom event to notify the handler.
event_target_shim_1.defineEventAttribute(FakeRTCDataChannel.prototype, '@send');
event_target_shim_1.defineEventAttribute(FakeRTCDataChannel.prototype, '@close');
