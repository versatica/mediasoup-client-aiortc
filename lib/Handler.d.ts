import { HandlerInterface, HandlerRunOptions, HandlerSendOptions, HandlerSendResult, HandlerReceiveOptions, HandlerReceiveResult, HandlerSendDataChannelOptions, HandlerSendDataChannelResult, HandlerReceiveDataChannelOptions, HandlerReceiveDataChannelResult } from 'mediasoup-client/lib/handlers/HandlerInterface';
import { IceParameters, RtpCapabilities, SctpCapabilities } from 'mediasoup-client/lib/types';
import { Channel } from './Channel';
import { FakeRTCStatsReport } from './FakeRTCStatsReport';
export declare class Handler extends HandlerInterface {
    private readonly _internal;
    private readonly _channel;
    private _closed;
    private _running;
    private _direction;
    private _remoteSdp;
    private _sendingRtpParametersByKind;
    private _sendingRemoteRtpParametersByKind;
    private readonly _mapLocalIdTracks;
    private readonly _mapLocalIdMid;
    private _transportReady;
    private _hasDataChannelMediaSection;
    private _nextSendSctpStreamId;
    /**
     * Addicional events.
     *
     * @emits @close
     */
    constructor({ internal, channel }: {
        internal: {
            handlerId: string;
        };
        channel: Channel;
    });
    get closed(): boolean;
    get name(): string;
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
    send({ track, encodings, codecOptions, codec }: HandlerSendOptions): Promise<HandlerSendResult>;
    stopSending(localId: string): Promise<void>;
    pauseSending(localId: string): Promise<void>;
    resumeSending(localId: string): Promise<void>;
    replaceTrack(localId: string, track: MediaStreamTrack | null): Promise<void>;
    setMaxSpatialLayer(localId: string, spatialLayer: number): Promise<void>;
    setRtpEncodingParameters(localId: string, params: any): Promise<void>;
    getSenderStats(localId: string): Promise<FakeRTCStatsReport>;
    sendDataChannel({ ordered, maxPacketLifeTime, maxRetransmits, label, protocol }: HandlerSendDataChannelOptions): Promise<HandlerSendDataChannelResult>;
    receive(optionsList: HandlerReceiveOptions[]): Promise<HandlerReceiveResult[]>;
    stopReceiving(localIds: string[]): Promise<void>;
    pauseReceiving(localIds: string[]): Promise<void>;
    resumeReceiving(localIds: string[]): Promise<void>;
    getReceiverStats(localId: string): Promise<FakeRTCStatsReport>;
    receiveDataChannel({ sctpStreamParameters, label, protocol }: HandlerReceiveDataChannelOptions): Promise<HandlerReceiveDataChannelResult>;
    private _setupTransport;
    private _assertSendDirection;
    private _assertRecvDirection;
    private _handleWorkerNotifications;
}
//# sourceMappingURL=Handler.d.ts.map