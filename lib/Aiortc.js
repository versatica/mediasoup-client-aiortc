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
const Worker_1 = require("./Worker");
const logger = new Logger_1.Logger('aiortc');
const SCTP_NUM_STREAMS = { OS: 65535, MIS: 65535 };
class Aiortc extends HandlerInterface_1.HandlerInterface {
    constructor(logLevel) {
        super();
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
        this._workerLogLevel = logLevel || 'none';
    }
    /**
     * Creates a factory function.
     */
    static createFactory(logLevel) {
        return () => new Aiortc(logLevel);
    }
    get name() {
        return 'Aiortc';
    }
    close() {
        logger.debug('close()');
        // Deregister sending tracks events and emit 'ended' in remote tracks.
        for (const track of this._mapLocalIdTracks.values()) {
            if (track.data.remote) {
                track.remoteStop();
            }
            else {
                track.removeEventListener('@enabledchange', track.data.enabledChangeListener);
            }
        }
        // Close the worker.
        if (this._worker)
            this._worker.close();
    }
    getNativeRtpCapabilities() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('getNativeRtpCapabilities()');
            const worker = new Worker_1.Worker({ logLevel: this._workerLogLevel });
            try {
                yield new Promise((resolve, reject) => {
                    worker.on('open', resolve);
                    worker.on('failed', reject);
                });
                const sdp = yield worker.getRtpCapabilities();
                const sdpObject = sdpTransform.parse(sdp);
                const caps = sdpCommonUtils.extractRtpCapabilities({ sdpObject });
                worker.close();
                return caps;
            }
            catch (error) {
                logger.error('getNativeRtpCapabilities | failed: %o', error);
                worker.close();
                throw error;
            }
        });
    }
    getNativeSctpCapabilities() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('getNativeSctpCapabilities()');
            return {
                numStreams: SCTP_NUM_STREAMS
            };
        });
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
        this._worker = new Worker_1.Worker({
            rtcConfiguration: { iceServers },
            logLevel: this._workerLogLevel
        });
        this._worker.on('error', (error) => {
            logger.error('worker error: %s', error.toString());
        });
        this._worker.on('iceconnectionstatechange', (state) => {
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
        });
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    updateIceServers(iceServers) {
        return __awaiter(this, void 0, void 0, function* () {
            throw new errors_1.UnsupportedError('not implemented');
        });
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    restartIce(iceParameters) {
        return __awaiter(this, void 0, void 0, function* () {
            throw new errors_1.UnsupportedError('not implemented');
        });
    }
    getTransportStats() {
        return __awaiter(this, void 0, void 0, function* () {
            this._waitForReady();
            return this._worker.getTransportStats();
        });
    }
    send(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    { track, encodings, codecOptions }) {
        return __awaiter(this, void 0, void 0, function* () {
            this._assertSendDirection();
            this._waitForReady();
            logger.debug('send() [kind:%s, track.id:%s, track.data:%o]', track.kind, track.id, track.data);
            const { sourceType, sourceValue, format, options } = track.data;
            const { trackId } = yield this._worker.addTrack({
                kind: track.kind,
                sourceType,
                sourceValue,
                format,
                options
            });
            const localId = trackId;
            let offer = yield this._worker.createOffer();
            let localSdpObject = sdpTransform.parse(offer.sdp);
            const sendingRtpParameters = utils.clone(this._sendingRtpParametersByKind[track.kind]);
            if (!this._transportReady)
                yield this._setupTransport({ localDtlsRole: 'server', localSdpObject });
            logger.debug('send() | calling worker.setLocalDescription() [offer:%o]', offer);
            yield this._worker.setLocalDescription(offer);
            // Get the MID and the corresponding m= section.
            const mid = yield this._worker.getMid(trackId);
            offer = yield this._worker.getLocalDescription();
            localSdpObject = sdpTransform.parse(offer.sdp);
            const offerMediaObject = localSdpObject.media.find((m) => (String(m.mid) === String(mid)));
            // Set RTCP CNAME.
            sendingRtpParameters.rtcp.cname =
                sdpCommonUtils.getCname({ offerMediaObject });
            // Set RTP encodings by parsing the SDP offer.
            sendingRtpParameters.encodings =
                sdpUnifiedPlanUtils.getRtpEncodings({ offerMediaObject });
            this._remoteSdp.send({
                offerMediaObject,
                reuseMid: false,
                offerRtpParameters: sendingRtpParameters,
                answerRtpParameters: this._sendingRemoteRtpParametersByKind[track.kind],
                codecOptions,
                extmapAllowMixed: false
            });
            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
            logger.debug('send() | calling worker.setRemoteDescription() [answer:%o]', answer);
            yield this._worker.setRemoteDescription(answer);
            // Store the original track into our map and listen for events.
            this._mapLocalIdTracks.set(localId, track);
            track.data.enabledChangeListener = () => {
                logger.debug('sending track %s', track.enabled ? 'enabled' : 'disabled');
                if (track.enabled)
                    this._worker.enableTrack(trackId);
                else
                    this._worker.disableTrack(trackId);
            };
            track.addEventListener('@enabledchange', track.data.enabledChangeListener);
            // Store the MID into the map.
            this._mapLocalIdMid.set(localId, mid);
            return {
                localId,
                rtpParameters: sendingRtpParameters
            };
        });
    }
    stopSending(localId) {
        return __awaiter(this, void 0, void 0, function* () {
            this._assertSendDirection();
            this._waitForReady();
            logger.debug('stopSending() [localId:%s]', localId);
            // Remove the original track from our map and its events.
            const track = this._mapLocalIdTracks.get(localId);
            if (!track)
                throw new Error('associated track not found');
            this._mapLocalIdTracks.delete(localId);
            track.removeEventListener('@enabledchange', track.data.enabledChangeListener);
            // Remove the MID from the map.
            const mid = this._mapLocalIdMid.get(localId);
            if (!mid)
                throw new Error('associated MID not found');
            this._mapLocalIdMid.delete(localId);
            const trackId = localId;
            yield this._worker.removeTrack(trackId);
            this._remoteSdp.disableMediaSection(mid);
            const offer = yield this._worker.createOffer();
            logger.debug('stopSending() | calling worker.setLocalDescription() [offer:%o]', offer);
            yield this._worker.setLocalDescription(offer);
            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
            logger.debug('stopSending() | calling worker.setRemoteDescription() [answer:%o]', answer);
            yield this._worker.setRemoteDescription(answer);
        });
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    replaceTrack(localId, track) {
        return __awaiter(this, void 0, void 0, function* () {
            throw new errors_1.UnsupportedError('not implemented');
        });
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    setMaxSpatialLayer(localId, spatialLayer) {
        return __awaiter(this, void 0, void 0, function* () {
            throw new errors_1.UnsupportedError('not implemented');
        });
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    setRtpEncodingParameters(localId, params) {
        return __awaiter(this, void 0, void 0, function* () {
            throw new errors_1.UnsupportedError('not implemented');
        });
    }
    getSenderStats(localId) {
        return __awaiter(this, void 0, void 0, function* () {
            this._assertSendDirection();
            this._waitForReady();
            const mid = this._mapLocalIdMid.get(localId);
            if (!mid)
                throw new Error('associated MID not found');
            return this._worker.getSenderStats(mid);
        });
    }
    sendDataChannel({ ordered, maxPacketLifeTime, maxRetransmits, label, protocol, priority }) {
        return __awaiter(this, void 0, void 0, function* () {
            this._assertSendDirection();
            const options = {
                negotiated: true,
                streamId: this._nextSendSctpStreamId,
                ordered,
                maxPacketLifeTime,
                maxRetransmits,
                label,
                protocol,
                priority
            };
            logger.debug('sendDataChannel() [options:%o]', options);
            const dataChannel = yield this._worker.createDataChannel(options);
            // Increase next id.
            this._nextSendSctpStreamId =
                ++this._nextSendSctpStreamId % SCTP_NUM_STREAMS.MIS;
            // If this is the first DataChannel we need to create the SDP answer with
            // m=application section.
            if (!this._hasDataChannelMediaSection) {
                const offer = yield this._worker.createOffer();
                const localSdpObject = sdpTransform.parse(offer.sdp);
                const offerMediaObject = localSdpObject.media
                    .find((m) => m.type === 'application');
                if (!this._transportReady)
                    yield this._setupTransport({ localDtlsRole: 'server', localSdpObject });
                logger.debug('sendDataChannel() | calling worker.setLocalDescription() [offer:%o]', offer);
                yield this._worker.setLocalDescription(offer);
                this._remoteSdp.sendSctpAssociation({ offerMediaObject });
                const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                logger.debug('sendDataChannel() | calling worker.setRemoteDescription() [answer:%o]', answer);
                yield this._worker.setRemoteDescription(answer);
                this._hasDataChannelMediaSection = true;
            }
            const sctpStreamParameters = {
                streamId: options.streamId,
                ordered: options.ordered,
                maxPacketLifeTime: options.maxPacketLifeTime,
                maxRetransmits: options.maxRetransmits
            };
            return { dataChannel, sctpStreamParameters };
        });
    }
    receive({ trackId, kind, rtpParameters }) {
        return __awaiter(this, void 0, void 0, function* () {
            this._assertRecvDirection();
            this._waitForReady();
            logger.debug('receive() [trackId:%s, kind:%s]', trackId, kind);
            const localId = String(this._mapLocalIdMid.size);
            const mid = localId;
            this._remoteSdp.receive({
                mid,
                kind,
                offerRtpParameters: rtpParameters,
                streamId: rtpParameters.rtcp.cname,
                trackId
            });
            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
            logger.debug('receive() | calling worker.setRemoteDescription() [offer:%o]', offer);
            yield this._worker.setRemoteDescription(offer);
            let answer = yield this._worker.createAnswer();
            const localSdpObject = sdpTransform.parse(answer.sdp);
            const answerMediaObject = localSdpObject.media
                .find((m) => String(m.mid) === localId);
            // May need to modify codec parameters in the answer based on codec
            // parameters in the offer.
            sdpCommonUtils.applyCodecParameters({
                offerRtpParameters: rtpParameters,
                answerMediaObject
            });
            answer =
                {
                    type: 'answer',
                    sdp: sdpTransform.write(localSdpObject)
                };
            if (!this._transportReady)
                yield this._setupTransport({ localDtlsRole: 'client', localSdpObject });
            logger.debug('receive() | calling worker.setLocalDescription() [answer:%o]', answer);
            yield this._worker.setLocalDescription(answer);
            // Create a fake remote track to be returned.
            const track = new fake_mediastreamtrack_1.FakeMediaStreamTrack({
                kind,
                id: trackId,
                data: { remote: true } // This let's us know that this is remote.
            });
            // Store the remote track into the map.
            this._mapLocalIdTracks.set(localId, track);
            // Store the MID into the map.
            this._mapLocalIdMid.set(localId, mid);
            return { localId, track };
        });
    }
    stopReceiving(localId) {
        return __awaiter(this, void 0, void 0, function* () {
            this._assertRecvDirection();
            this._waitForReady();
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
            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
            logger.debug('stopReceiving() | calling worker.setRemoteDescription() [offer:%o]', offer);
            yield this._worker.setRemoteDescription(offer);
            const answer = yield this._worker.createAnswer();
            logger.debug('stopReceiving() | calling worker.setLocalDescription() [answer:%o]', answer);
            yield this._worker.setLocalDescription(answer);
        });
    }
    getReceiverStats(localId) {
        return __awaiter(this, void 0, void 0, function* () {
            this._assertRecvDirection();
            this._waitForReady();
            const mid = this._mapLocalIdMid.get(localId);
            if (!mid)
                throw new Error('associated MID not found');
            return this._worker.getReceiverStats(mid);
        });
    }
    receiveDataChannel({ sctpStreamParameters, label, protocol }) {
        return __awaiter(this, void 0, void 0, function* () {
            this._assertRecvDirection();
            const { streamId, ordered, maxPacketLifeTime, maxRetransmits } = sctpStreamParameters;
            const options = {
                negotiated: true,
                streamId,
                ordered,
                maxPacketLifeTime,
                maxRetransmits,
                label,
                protocol
            };
            logger.debug('receiveDataChannel() [options:%o]', options);
            const dataChannel = yield this._worker.createDataChannel(options);
            // If this is the first DataChannel we need to create the SDP offer with
            // m=application section.
            if (!this._hasDataChannelMediaSection) {
                this._remoteSdp.receiveSctpAssociation();
                const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                logger.debug('receiveDataChannel() | calling worker.setRemoteDescription() [offer:%o]', offer);
                yield this._worker.setRemoteDescription(offer);
                const answer = yield this._worker.createAnswer();
                if (!this._transportReady) {
                    const localSdpObject = sdpTransform.parse(answer.sdp);
                    yield this._setupTransport({ localDtlsRole: 'client', localSdpObject });
                }
                logger.debug('receiveDataChannel() | calling worker.setRemoteDescription() [answer:%o]', answer);
                yield this._worker.setLocalDescription(answer);
                this._hasDataChannelMediaSection = true;
            }
            return { dataChannel };
        });
    }
    _setupTransport({ localDtlsRole, localSdpObject }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!localSdpObject) {
                const offer = yield this._worker.getLocalDescription();
                localSdpObject = sdpTransform.parse(offer.sdp);
            }
            // Get our local DTLS parameters.
            const dtlsParameters = sdpCommonUtils.extractDtlsParameters({ sdpObject: localSdpObject });
            // Set our DTLS role.
            dtlsParameters.role = localDtlsRole;
            // Update the remote DTLS role in the SDP.
            this._remoteSdp.updateDtlsRole(localDtlsRole === 'client' ? 'server' : 'client');
            // Need to tell the remote transport about our parameters.
            yield this.safeEmitAsPromise('@connect', { dtlsParameters });
            this._transportReady = true;
        });
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
    _waitForReady() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._worker)
                throw new Error('called with worker member unset');
            switch (this._worker.getState()) {
                case 'connecting':
                    {
                        yield new Promise((resolve, reject) => {
                            this._worker.on('open', resolve);
                            this._worker.on('failed', reject);
                        });
                        break;
                    }
                case 'open':
                    {
                        return;
                    }
                case 'closed':
                    {
                        throw new Error('worker closed');
                    }
            }
        });
    }
}
exports.Aiortc = Aiortc;
