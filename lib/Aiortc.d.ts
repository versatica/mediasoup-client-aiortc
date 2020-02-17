import { HandlerFactory, HandlerInterface, HandlerRunOptions, HandlerSendOptions, HandlerSendResult, HandlerReceiveOptions, HandlerReceiveResult, HandlerSendDataChannelOptions, HandlerSendDataChannelResult, HandlerReceiveDataChannelOptions, HandlerReceiveDataChannelResult } from 'mediasoup-client/lib/handlers/HandlerInterface';
import { IceParameters, RtpCapabilities, SctpCapabilities } from 'mediasoup-client/lib/types';
import { WorkerLogLevel } from './Worker';
import { FakeRTCStatsReport } from './FakeRTCStatsReport';
export declare class Aiortc extends HandlerInterface {
    private readonly _workerLogLevel;
    private _direction;
    private _remoteSdp;
    private _sendingRtpParametersByKind;
    private _sendingRemoteRtpParametersByKind;
    private _worker;
    private readonly _mapLocalIdTracks;
    private readonly _mapLocalIdMid;
    private _transportReady;
    private _hasDataChannelMediaSection;
    private _nextSendSctpStreamId;
    /**
     * Creates a factory function.
     */
    static createFactory(logLevel?: WorkerLogLevel): HandlerFactory;
    constructor(logLevel?: WorkerLogLevel);
    readonly name: string;
    close(): void;
    getNativeRtpCapabilities(): Promise<RtpCapabilities>;
    getNativeSctpCapabilities(): Promise<SctpCapabilities>;
    run({ direction, iceParameters, iceCandidates, dtlsParameters, sctpParameters, iceServers, iceTransportPolicy, // eslint-disable-line @typescript-eslint/no-unused-vars
    additionalSettings, // eslint-disable-line @typescript-eslint/no-unused-vars
    proprietaryConstraints, // eslint-disable-line @typescript-eslint/no-unused-vars
    extendedRtpCapabilities }: HandlerRunOptions): void;
    updateIceServers(iceServers: RTCIceServer[]): Promise<void>;
    restartIce(iceParameters: IceParameters): Promise<void>;
    getTransportStats(): Promise<FakeRTCStatsReport>;
    send({ track, encodings, codecOptions }: HandlerSendOptions): Promise<HandlerSendResult>;
    stopSending(localId: string): Promise<void>;
    replaceTrack(localId: string, track: MediaStreamTrack): Promise<void>;
    setMaxSpatialLayer(localId: string, spatialLayer: number): Promise<void>;
    setRtpEncodingParameters(localId: string, params: any): Promise<void>;
    getSenderStats(localId: string): Promise<FakeRTCStatsReport>;
    sendDataChannel({ ordered, maxPacketLifeTime, maxRetransmits, label, protocol, priority }: HandlerSendDataChannelOptions): Promise<HandlerSendDataChannelResult>;
    receive({ trackId, kind, rtpParameters }: HandlerReceiveOptions): Promise<HandlerReceiveResult>;
    stopReceiving(localId: string): Promise<void>;
    getReceiverStats(localId: string): Promise<FakeRTCStatsReport>;
    receiveDataChannel(options: HandlerReceiveDataChannelOptions): Promise<HandlerReceiveDataChannelResult>;
    private _setupTransport;
    private _assertSendDirection;
    private _assertRecvDirection;
    private _waitForReady;
}
//# sourceMappingURL=Aiortc.d.ts.map