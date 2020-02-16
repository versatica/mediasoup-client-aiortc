/// <reference types="node" />
import { EventTarget } from 'event-target-shim';
import { Channel } from './Channel';
export declare type FakeRTCDataChannelOptions = {
    id: number;
    ordered?: boolean;
    maxPacketLifeTime?: number | null;
    maxRetransmits?: number | null;
    label?: string;
    protocol?: string;
};
export declare class FakeRTCDataChannel extends EventTarget implements RTCDataChannel {
    private readonly _internal;
    private readonly _channel;
    private _id;
    private _negotiated;
    private _ordered;
    private _maxPacketLifeTime;
    private _maxRetransmits;
    private _label;
    private _protocol;
    private _readyState;
    private _bufferedAmount;
    private _bufferedAmountLowThreshold;
    private _binaryType;
    private _priority;
    onopen: (this: RTCDataChannel, ev: Event) => any;
    onclosing: (this: RTCDataChannel, ev: Event) => any;
    onclose: (this: RTCDataChannel, ev: Event) => any;
    onmessage: (this: RTCDataChannel, ev: MessageEvent) => any;
    onbufferedamountlow: (this: RTCDataChannel, ev: Event) => any;
    onerror: (this: RTCDataChannel, ev: RTCErrorEvent) => any;
    constructor(internal: {
        dataChannelId: string;
    }, channel: Channel, { id, ordered, maxPacketLifeTime, maxRetransmits, label, protocol }: FakeRTCDataChannelOptions);
    readonly id: number;
    readonly negotiated: boolean;
    readonly ordered: boolean;
    readonly maxPacketLifeTime: number | null;
    readonly maxRetransmits: number | null;
    readonly label: string;
    readonly protocol: string;
    readonly readyState: RTCDataChannelState;
    readonly bufferedAmount: number;
    bufferedAmountLowThreshold: number;
    binaryType: string;
    priority: RTCPriorityType;
    close(): void;
    /**
     * We extend the definition of send() to allow Node Buffer.
     */
    send(data: string | Blob | ArrayBuffer | ArrayBufferView | Buffer): void;
}
//# sourceMappingURL=FakeRTCDataChannel.d.ts.map