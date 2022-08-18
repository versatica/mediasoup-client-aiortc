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
exports.Handler = void 0;
const uuid_1 = require("uuid");
const sdpTransform = __importStar(require("sdp-transform"));
const fake_mediastreamtrack_1 = require("fake-mediastreamtrack");
const Logger_1 = require("mediasoup-client/lib/Logger");
const errors_1 = require("mediasoup-client/lib/errors");
const utils = __importStar(require("mediasoup-client/lib/utils"));
const ortc = __importStar(require("mediasoup-client/lib/ortc"));
const sdpCommonUtils = __importStar(require("mediasoup-client/lib/handlers/sdp/commonUtils"));
const sdpUnifiedPlanUtils = __importStar(require("mediasoup-client/lib/handlers/sdp/unifiedPlanUtils"));
const HandlerInterface_1 = require("mediasoup-client/lib/handlers/HandlerInterface");
const RemoteSdp_1 = require("mediasoup-client/lib/handlers/sdp/RemoteSdp");
const FakeRTCStatsReport_1 = require("./FakeRTCStatsReport");
const FakeRTCDataChannel_1 = require("./FakeRTCDataChannel");
const logger = new Logger_1.Logger('aiortc:Handler');
const SCTP_NUM_STREAMS = { OS: 65535, MIS: 65535 };
class Handler extends HandlerInterface_1.HandlerInterface {
    /**
     * Addicional events.
     *
     * @emits @close
     */
    constructor({ internal, channel }) {
        super();
        // Closed flag.
        this._closed = false;
        // Running flag. It means that the handler has been told to the worker.
        this._running = false;
        // Map of sending and receiving tracks indexed by localId.
        this._mapLocalIdTracks = new Map();
        // Map of MID indexed by local ids.
        this._mapLocalIdMid = new Map();
        // Got transport local and remote parameters.
        this._transportReady = false;
        // Whether a DataChannel m=application section has been created.
        this._hasDataChannelMediaSection = false;
        // Next DataChannel id.
        this._nextSendSctpStreamId = 0;
        this._internal = internal;
        this._channel = channel;
    }
    get closed() {
        return this._closed;
    }
    get name() {
        return 'Aiortc';
    }
    close() {
        logger.debug('close()');
        if (this._closed)
            return;
        this._closed = true;
        // Deregister sending tracks events and emit 'ended' in remote tracks.
        for (const track of this._mapLocalIdTracks.values()) {
            if (track.data.remote)
                track.remoteStop();
        }
        // Remove notification subscriptions.
        this._channel.removeAllListeners(this._internal.handlerId);
        // If running notify the worker.
        if (this._running)
            this._channel.notify('handler.close', this._internal);
        // Tell the parent.
        this.emit('@close');
    }
    async getNativeRtpCapabilities() {
        logger.debug('getNativeRtpCapabilities()');
        const sdp = await this._channel.request('getRtpCapabilities');
        const sdpObject = sdpTransform.parse(sdp);
        const caps = sdpCommonUtils.extractRtpCapabilities({ sdpObject });
        return caps;
    }
    async getNativeSctpCapabilities() {
        logger.debug('getNativeSctpCapabilities()');
        return {
            numStreams: SCTP_NUM_STREAMS
        };
    }
    run({ direction, iceParameters, iceCandidates, dtlsParameters, sctpParameters, iceServers, iceTransportPolicy, // eslint-disable-line @typescript-eslint/no-unused-vars
    additionalSettings, // eslint-disable-line @typescript-eslint/no-unused-vars
    proprietaryConstraints, // eslint-disable-line @typescript-eslint/no-unused-vars
    extendedRtpCapabilities }) {
        logger.debug('run()');
        this._direction = direction;
        // aiortc only supports "sha-256" hash algorithm.
        dtlsParameters.fingerprints = dtlsParameters.fingerprints.filter((f) => f.algorithm === 'sha-256');
        this._remoteSdp = new RemoteSdp_1.RemoteSdp({
            iceParameters,
            iceCandidates,
            dtlsParameters,
            sctpParameters
        });
        this._sendingRtpParametersByKind =
            {
                audio: ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
                video: ortc.getSendingRtpParameters('video', extendedRtpCapabilities)
            };
        this._sendingRemoteRtpParametersByKind =
            {
                audio: ortc.getSendingRemoteRtpParameters('audio', extendedRtpCapabilities),
                video: ortc.getSendingRemoteRtpParameters('video', extendedRtpCapabilities)
            };
        const options = {
            rtcConfiguration: { iceServers }
        };
        // Notify the worker so it will create a handler.
        this._channel.request('createHandler', this._internal, options)
            .catch((error) => {
            logger.error(`handler creation in the worker failed: ${error}`);
            this.close();
        });
        // Set the running flag.
        this._running = true;
        this._handleWorkerNotifications();
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async updateIceServers(iceServers) {
        throw new errors_1.UnsupportedError('not implemented');
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async restartIce(iceParameters) {
        throw new errors_1.UnsupportedError('not implemented');
    }
    async getTransportStats() {
        const data = await this._channel.request('handler.getTransportStats', this._internal);
        return new FakeRTCStatsReport_1.FakeRTCStatsReport(data);
    }
    async send(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    { track, encodings, codecOptions, codec }) {
        this._assertSendDirection();
        logger.debug('send() [kind:%s, track.id:%s, track.data:%o]', track.kind, track.id, track.data);
        const localId = track.id;
        const kind = track.kind;
        const { playerId, remote } = track.data;
        if (playerId) {
            await this._channel.request('handler.addTrack', this._internal, { localId, playerId, kind });
        }
        else if (remote) {
            await this._channel.request('handler.addTrack', this._internal, { localId, recvTrackId: track.id, kind });
        }
        else {
            throw new TypeError('invalid track, missing data.playerId or data.remote');
        }
        const sendingRtpParameters = utils.clone(this._sendingRtpParametersByKind[track.kind], {});
        // This may throw.
        sendingRtpParameters.codecs =
            ortc.reduceCodecs(sendingRtpParameters.codecs, codec);
        const sendingRemoteRtpParameters = this._sendingRemoteRtpParametersByKind[track.kind];
        // This may throw.
        sendingRemoteRtpParameters.codecs =
            ortc.reduceCodecs(sendingRemoteRtpParameters.codecs, codec);
        let offer = await this._channel.request('handler.createOffer', this._internal);
        let localSdpObject = sdpTransform.parse(offer.sdp);
        if (!this._transportReady)
            await this._setupTransport({ localDtlsRole: 'server', localSdpObject });
        logger.debug('send() | calling handler.setLocalDescription() [offer:%o]', offer);
        await this._channel.request('handler.setLocalDescription', this._internal, offer);
        // Get the MID and the corresponding m= section.
        const mid = await this._channel.request('handler.getMid', this._internal, { localId });
        offer = await this._channel.request('handler.getLocalDescription', this._internal);
        localSdpObject = sdpTransform.parse(offer.sdp);
        const offerMediaObject = localSdpObject.media.find((m) => (String(m.mid) === String(mid)));
        // Set MID.
        sendingRtpParameters.mid = mid;
        // Set RTCP CNAME.
        sendingRtpParameters.rtcp.cname =
            sdpCommonUtils.getCname({ offerMediaObject });
        // Set RTP encodings by parsing the SDP offer.
        sendingRtpParameters.encodings =
            sdpUnifiedPlanUtils.getRtpEncodings({ offerMediaObject });
        this._remoteSdp.send({
            offerMediaObject,
            reuseMid: '',
            offerRtpParameters: sendingRtpParameters,
            answerRtpParameters: sendingRemoteRtpParameters,
            codecOptions,
            extmapAllowMixed: false
        });
        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
        logger.debug('send() | calling handler.setRemoteDescription() [answer:%o]', answer);
        await this._channel.request('handler.setRemoteDescription', this._internal, answer);
        // Store the original track into our map and listen for events.
        this._mapLocalIdTracks.set(localId, track);
        track.addEventListener('@enabledchange', () => {
            // Ensure we are still sending this track.
            if (this._mapLocalIdTracks.get(localId) !== track ||
                track.readyState === 'ended') {
                return;
            }
            if (track.enabled) {
                this._channel.notify('handler.enableTrack', this._internal, { localId });
            }
            else {
                this._channel.notify('handler.disableTrack', this._internal, { localId });
            }
        });
        // Store the MID into the map.
        this._mapLocalIdMid.set(localId, mid);
        return {
            localId,
            rtpParameters: sendingRtpParameters
        };
    }
    async stopSending(localId) {
        this._assertSendDirection();
        logger.debug('stopSending() [localId:%s]', localId);
        // Remove the original track from our map and its events.
        const track = this._mapLocalIdTracks.get(localId);
        if (!track)
            throw new Error('associated track not found');
        this._mapLocalIdTracks.delete(localId);
        // Remove the MID from the map.
        const mid = this._mapLocalIdMid.get(localId);
        if (!mid)
            throw new Error('associated MID not found');
        this._mapLocalIdMid.delete(localId);
        await this._channel.request('handler.removeTrack', this._internal, { localId });
        this._remoteSdp.disableMediaSection(mid);
        const offer = await this._channel.request('handler.createOffer', this._internal);
        logger.debug('stopSending() | calling handler.setLocalDescription() [offer:%o]', offer);
        await this._channel.request('handler.setLocalDescription', this._internal, offer);
        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
        logger.debug('stopSending() | calling handler.setRemoteDescription() [answer:%o]', answer);
        await this._channel.request('handler.setRemoteDescription', this._internal, answer);
    }
    async pauseSending(localId) {
        this._assertSendDirection();
        logger.debug('pauseSending() [localId:%s]', localId);
        const track = this._mapLocalIdTracks.get(localId);
        if (!track)
            throw new Error('associated track not found');
        const mid = this._mapLocalIdMid.get(localId);
        if (!mid)
            throw new Error('associated MID not found');
        await this._channel.request('handler.setTrackDirection', this._internal, { localId, direction: 'inactive' });
        const offer = await this._channel.request('handler.createOffer', this._internal);
        logger.debug('pauseSending() | calling handler.setLocalDescription() [offer:%o]', offer);
        await this._channel.request('handler.setLocalDescription', this._internal, offer);
        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
        logger.debug('pauseSending() | calling handler.setRemoteDescription() [answer:%o]', answer);
        await this._channel.request('handler.setRemoteDescription', this._internal, answer);
    }
    async resumeSending(localId) {
        this._assertSendDirection();
        logger.debug('resumeSending() [localId:%s]', localId);
        const track = this._mapLocalIdTracks.get(localId);
        if (!track)
            throw new Error('associated track not found');
        const mid = this._mapLocalIdMid.get(localId);
        if (!mid)
            throw new Error('associated MID not found');
        await this._channel.request('handler.setTrackDirection', this._internal, { localId, direction: 'sendonly' });
        const offer = await this._channel.request('handler.createOffer', this._internal);
        logger.debug('resumeSending() | calling handler.setLocalDescription() [offer:%o]', offer);
        await this._channel.request('handler.setLocalDescription', this._internal, offer);
        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
        logger.debug('stopSending() | calling handler.setRemoteDescription() [answer:%o]', answer);
        await this._channel.request('handler.setRemoteDescription', this._internal, answer);
    }
    async replaceTrack(localId, track) {
        this._assertSendDirection();
        if (track) {
            logger.debug('replaceTrack() [localId:%s, track.id:%s]', localId, track.id);
        }
        else {
            logger.debug('replaceTrack() [localId:%s, no track]', localId);
            throw new errors_1.UnsupportedError('replaceTrack() with null track not implemented');
        }
        const mid = this._mapLocalIdMid.get(localId);
        if (!mid)
            throw new Error('associated MID not found');
        const kind = track.kind;
        const { playerId, remote } = track.data;
        if (playerId) {
            await this._channel.request('handler.replaceTrack', this._internal, { localId, playerId, kind });
        }
        else if (remote) {
            await this._channel.request('handler.replaceTrack', this._internal, { localId, recvTrackId: track.id, kind });
        }
        else {
            throw new TypeError('invalid track, missing data.player or data.remote');
        }
        // Store the new original track into our map and listen for events.
        this._mapLocalIdTracks.set(localId, track);
        track.addEventListener('@enabledchange', () => {
            // Ensure we are still sending this track.
            if (this._mapLocalIdTracks.get(localId) !== track ||
                track.readyState === 'ended') {
                return;
            }
            if (track.enabled) {
                this._channel.notify('handler.enableTrack', this._internal, { localId });
            }
            else {
                this._channel.notify('handler.disableTrack', this._internal, { localId });
            }
        });
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async setMaxSpatialLayer(localId, spatialLayer) {
        throw new errors_1.UnsupportedError('not implemented');
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async setRtpEncodingParameters(localId, params) {
        throw new errors_1.UnsupportedError('not implemented');
    }
    async getSenderStats(localId) {
        this._assertSendDirection();
        const mid = this._mapLocalIdMid.get(localId);
        if (!mid)
            throw new Error('associated MID not found');
        const data = await this._channel.request('handler.getSenderStats', this._internal, { mid });
        return new FakeRTCStatsReport_1.FakeRTCStatsReport(data);
    }
    async sendDataChannel({ ordered, maxPacketLifeTime, maxRetransmits, label, protocol }) {
        this._assertSendDirection();
        const internal = {
            handlerId: this._internal.handlerId,
            dataChannelId: (0, uuid_1.v4)()
        };
        const options = {
            negotiated: true,
            id: this._nextSendSctpStreamId,
            ordered,
            maxPacketLifeTime: maxPacketLifeTime || null,
            maxRetransmits: maxRetransmits || null,
            label,
            protocol
        };
        logger.debug('sendDataChannel() [options:%o]', options);
        const result = await this._channel.request('handler.createDataChannel', internal, options);
        const dataChannel = new FakeRTCDataChannel_1.FakeRTCDataChannel(internal, this._channel, 
        // options.
        {
            id: result.streamId,
            ordered: result.ordered,
            maxPacketLifeTime: result.maxPacketLifeTime,
            maxRetransmits: result.maxRetransmits,
            label: result.label,
            protocol: result.protocol
        }, 
        // status.
        {
            readyState: result.readyState,
            bufferedAmount: result.bufferedAmount,
            bufferedAmountLowThreshold: result.bufferedAmountLowThreshold
        });
        // Increase next id.
        this._nextSendSctpStreamId =
            ++this._nextSendSctpStreamId % SCTP_NUM_STREAMS.MIS;
        // If this is the first DataChannel we need to create the SDP answer with
        // m=application section.
        if (!this._hasDataChannelMediaSection) {
            const offer = await this._channel.request('handler.createOffer', this._internal);
            const localSdpObject = sdpTransform.parse(offer.sdp);
            const offerMediaObject = localSdpObject.media
                .find((m) => m.type === 'application');
            if (!this._transportReady)
                await this._setupTransport({ localDtlsRole: 'server', localSdpObject });
            logger.debug('sendDataChannel() | calling handler.setLocalDescription() [offer:%o]', offer);
            await this._channel.request('handler.setLocalDescription', this._internal, offer);
            this._remoteSdp.sendSctpAssociation({ offerMediaObject });
            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
            logger.debug('sendDataChannel() | calling handler.setRemoteDescription() [answer:%o]', answer);
            await this._channel.request('handler.setRemoteDescription', this._internal, answer);
            this._hasDataChannelMediaSection = true;
        }
        const sctpStreamParameters = {
            streamId: result.streamId,
            ordered: result.ordered,
            maxPacketLifeTime: result.maxPacketLifeTime || undefined,
            maxRetransmits: result.maxRetransmits || undefined
        };
        return { dataChannel, sctpStreamParameters };
    }
    async receive(optionsList) {
        this._assertRecvDirection();
        const results = [];
        const mapLocalId = new Map();
        for (const options of optionsList) {
            const { trackId, kind, rtpParameters } = options;
            logger.debug('receive() [trackId:%s, kind:%s]', trackId, kind);
            const localId = rtpParameters.mid || String(this._mapLocalIdMid.size);
            mapLocalId.set(trackId, localId);
            this._remoteSdp.receive({
                mid: localId,
                kind,
                offerRtpParameters: rtpParameters,
                streamId: rtpParameters.rtcp.cname,
                trackId
            });
        }
        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
        logger.debug('receive() | calling handler.setRemoteDescription() [offer:%o]', offer);
        await this._channel.request('handler.setRemoteDescription', this._internal, offer);
        let answer = await this._channel.request('handler.createAnswer', this._internal);
        const localSdpObject = sdpTransform.parse(answer.sdp);
        for (const options of optionsList) {
            const { trackId, rtpParameters } = options;
            const localId = mapLocalId.get(trackId);
            const answerMediaObject = localSdpObject.media
                .find((m) => String(m.mid) === localId);
            // May need to modify codec parameters in the answer based on codec
            // parameters in the offer.
            sdpCommonUtils.applyCodecParameters({
                offerRtpParameters: rtpParameters,
                answerMediaObject
            });
        }
        answer =
            {
                type: 'answer',
                sdp: sdpTransform.write(localSdpObject)
            };
        if (!this._transportReady)
            await this._setupTransport({ localDtlsRole: 'client', localSdpObject });
        logger.debug('receive() | calling handler.setLocalDescription() [answer:%o]', answer);
        await this._channel.request('handler.setLocalDescription', this._internal, answer);
        // Create fake remote tracks to be returned.
        for (const options of optionsList) {
            const { trackId, kind } = options;
            const localId = mapLocalId.get(trackId);
            const track = new fake_mediastreamtrack_1.FakeMediaStreamTrack({
                kind,
                id: trackId,
                data: { remote: true } // This let's us know that this is remote.
            });
            // Store the remote track into the map.
            this._mapLocalIdTracks.set(localId, track);
            // Store the MID into the map.
            this._mapLocalIdMid.set(localId, localId);
            results.push({ localId, track });
        }
        return results;
    }
    async stopReceiving(localIds) {
        this._assertRecvDirection();
        for (const localId of localIds) {
            logger.debug('stopReceiving() [localId:%s]', localId);
            // Remove the remote track from the map and make it emit 'ended'.
            const track = this._mapLocalIdTracks.get(localId);
            if (!track)
                throw new Error('associated track not found');
            this._mapLocalIdTracks.delete(localId);
            track.remoteStop();
            const mid = this._mapLocalIdMid.get(localId);
            if (!mid)
                throw new Error('associated MID not found');
            this._remoteSdp.closeMediaSection(mid);
        }
        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
        logger.debug('stopReceiving() | calling handler.setRemoteDescription() [offer:%o]', offer);
        await this._channel.request('handler.setRemoteDescription', this._internal, offer);
        const answer = await this._channel.request('handler.createAnswer', this._internal);
        logger.debug('stopReceiving() | calling handler.setLocalDescription() [answer:%o]', answer);
        await this._channel.request('handler.setLocalDescription', this._internal, answer);
    }
    async pauseReceiving(localIds) {
        this._assertRecvDirection();
        for (const localId of localIds) {
            logger.debug('pauseReceiving() [localId:%s]', localId);
            const track = this._mapLocalIdTracks.get(localId);
            if (!track)
                throw new Error('associated track not found');
            const mid = this._mapLocalIdMid.get(localId);
            if (!mid)
                throw new Error('associated MID not found');
            await this._channel.request('handler.setTrackDirection', this._internal, { localId, direction: 'inactive' });
        }
        const offer = await this._channel.request('handler.createOffer', this._internal);
        logger.debug('pauseReceiving() | calling handler.setRemoteDescription() [offer:%o]', offer);
        await this._channel.request('handler.setRemoteDescription', this._internal, offer);
        const answer = await this._channel.request('handler.createAnswer', this._internal);
        logger.debug('pauseReceiving() | calling handler.setLocalDescription() [answer:%o]', answer);
        await this._channel.request('handler.setLocalDescription', this._internal, answer);
    }
    async resumeReceiving(localIds) {
        this._assertRecvDirection();
        for (const localId of localIds) {
            logger.debug('pauseReceiving() [localId:%s]', localId);
            const track = this._mapLocalIdTracks.get(localId);
            if (!track)
                throw new Error('associated track not found');
            const mid = this._mapLocalIdMid.get(localId);
            if (!mid)
                throw new Error('associated MID not found');
            await this._channel.request('handler.setTrackDirection', this._internal, { localId, direction: 'recvonly' });
        }
        const offer = await this._channel.request('handler.createOffer', this._internal);
        logger.debug('resumeReceiving() | calling handler.setRemoteDescription() [offer:%o]', offer);
        await this._channel.request('handler.setRemoteDescription', this._internal, offer);
        const answer = await this._channel.request('handler.createAnswer', this._internal);
        logger.debug('resumeReceiving() | calling handler.setLocalDescription() [answer:%o]', answer);
        await this._channel.request('handler.setLocalDescription', this._internal, answer);
    }
    async getReceiverStats(localId) {
        this._assertRecvDirection();
        const mid = this._mapLocalIdMid.get(localId);
        if (!mid)
            throw new Error('associated MID not found');
        const data = await this._channel.request('handler.getReceiverStats', this._internal, { mid });
        return new FakeRTCStatsReport_1.FakeRTCStatsReport(data);
    }
    async receiveDataChannel({ sctpStreamParameters, label, protocol }) {
        this._assertRecvDirection();
        const { streamId, ordered, maxPacketLifeTime, maxRetransmits } = sctpStreamParameters;
        const internal = {
            handlerId: this._internal.handlerId,
            dataChannelId: (0, uuid_1.v4)()
        };
        const options = {
            negotiated: true,
            id: streamId,
            ordered,
            maxPacketLifeTime: maxPacketLifeTime || null,
            maxRetransmits: maxRetransmits || null,
            label,
            protocol
        };
        logger.debug('receiveDataChannel() [options:%o]', options);
        const result = await this._channel.request('handler.createDataChannel', internal, options);
        const dataChannel = new FakeRTCDataChannel_1.FakeRTCDataChannel(internal, this._channel, 
        // options.
        {
            id: result.streamId,
            ordered: result.ordered,
            maxPacketLifeTime: result.maxPacketLifeTime,
            maxRetransmits: result.maxRetransmits,
            label: result.label,
            protocol: result.protocol
        }, 
        // status.
        {
            readyState: result.readyState,
            bufferedAmount: result.bufferedAmount,
            bufferedAmountLowThreshold: result.bufferedAmountLowThreshold
        });
        // If this is the first DataChannel we need to create the SDP offer with
        // m=application section.
        if (!this._hasDataChannelMediaSection) {
            this._remoteSdp.receiveSctpAssociation();
            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
            logger.debug('receiveDataChannel() | calling handler.setRemoteDescription() [offer:%o]', offer);
            await this._channel.request('handler.setRemoteDescription', this._internal, offer);
            const answer = await this._channel.request('handler.createAnswer', this._internal);
            if (!this._transportReady) {
                const localSdpObject = sdpTransform.parse(answer.sdp);
                await this._setupTransport({ localDtlsRole: 'client', localSdpObject });
            }
            logger.debug('receiveDataChannel() | calling handler.setRemoteDescription() [answer:%o]', answer);
            await this._channel.request('handler.setLocalDescription', this._internal, answer);
            this._hasDataChannelMediaSection = true;
        }
        return { dataChannel };
    }
    async _setupTransport({ localDtlsRole, localSdpObject }) {
        if (!localSdpObject) {
            const offer = await this._channel.request('handler.getLocalDescription', this._internal);
            localSdpObject = sdpTransform.parse(offer.sdp);
        }
        // Get our local DTLS parameters.
        const dtlsParameters = sdpCommonUtils.extractDtlsParameters({ sdpObject: localSdpObject });
        // Set our DTLS role.
        dtlsParameters.role = localDtlsRole;
        // Update the remote DTLS role in the SDP.
        this._remoteSdp.updateDtlsRole(localDtlsRole === 'client' ? 'server' : 'client');
        // Need to tell the remote transport about our parameters.
        await new Promise((resolve, reject) => {
            this.safeEmit('@connect', { dtlsParameters }, resolve, reject);
        });
        this._transportReady = true;
    }
    _assertSendDirection() {
        if (this._direction !== 'send') {
            throw new Error('method can just be called for handlers with "send" direction');
        }
    }
    _assertRecvDirection() {
        if (this._direction !== 'recv') {
            throw new Error('method can just be called for handlers with "recv" direction');
        }
    }
    _handleWorkerNotifications() {
        this._channel.on(this._internal.handlerId, (event, data) => {
            switch (event) {
                case 'signalingstatechange':
                    {
                        // Do nothing.
                        break;
                    }
                case 'icegatheringstatechange':
                    {
                        // Do nothing.
                        break;
                    }
                case 'iceconnectionstatechange':
                    {
                        const state = data;
                        switch (state) {
                            case 'checking':
                                this.emit('@connectionstatechange', 'connecting');
                                break;
                            case 'connected':
                            case 'completed':
                                this.emit('@connectionstatechange', 'connected');
                                break;
                            case 'failed':
                                this.emit('@connectionstatechange', 'failed');
                                break;
                            case 'disconnected':
                                this.emit('@connectionstatechange', 'disconnected');
                                break;
                            case 'closed':
                                this.emit('@connectionstatechange', 'closed');
                                break;
                        }
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
exports.Handler = Handler;
