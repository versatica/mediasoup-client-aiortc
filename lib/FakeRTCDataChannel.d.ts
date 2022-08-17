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
    get binaryType(): BinaryType;
    set binaryType(value: BinaryType);
    get priority(): RTCPriorityType;
    set priority(value: RTCPriorityType);
    get onopen(): any;
    set onopen(listener: any);
    get onclosing(): any;
    set onclosing(listener: any);
    get onclose(): any;
    set onclose(listener: any);
    get onmessage(): any;
    set onmessage(listener: any);
    get onbufferedamountlow(): any;
    set onbufferedamountlow(listener: any);
    get onerror(): any;
    set onerror(listener: any);
    close(): void;
    /**
     * We extend the definition of send() to allow Node Buffer. However
     * ArrayBufferView and Blob do not exist in Node.
     */
    send(data: string | ArrayBuffer | Buffer | ArrayBufferView | Blob): void;
    private _handleWorkerNotifications;
}
//# sourceMappingURL=FakeRTCDataChannel.d.ts.map