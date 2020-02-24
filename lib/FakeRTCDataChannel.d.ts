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
        handlerId: string;
        dataChannelId: string;
    }, channel: Channel, { id, ordered, maxPacketLifeTime, maxRetransmits, label, protocol }: FakeRTCDataChannelOptions, status: {
        readyState: RTCDataChannelState;
        bufferedAmount: number;
        bufferedAmountLowThreshold: number;
    });
    get id(): number;
    get negotiated(): boolean;
    get ordered(): boolean;
    get maxPacketLifeTime(): number | null;
    get maxRetransmits(): number | null;
    get label(): string;
    get protocol(): string;
    get readyState(): RTCDataChannelState;
    get bufferedAmount(): number;
    get bufferedAmountLowThreshold(): number;
    set bufferedAmountLowThreshold(value: number);
    get binaryType(): string;
    set binaryType(value: string);
    get priority(): RTCPriorityType;
    set priority(value: RTCPriorityType);
    close(): void;
    /**
     * We extend the definition of send() to allow Node Buffer. However
     * ArrayBufferView and Blob do not exist in Node.
     */
    send(data: string | ArrayBuffer | Buffer | ArrayBufferView | Blob): void;
    private _handleWorkerNotifications;
}
//# sourceMappingURL=FakeRTCDataChannel.d.ts.map