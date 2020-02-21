import { EnhancedEventEmitter } from 'mediasoup-client/lib/EnhancedEventEmitter';
export declare class Channel extends EnhancedEventEmitter {
    private _closed;
    private readonly _sendSocket;
    private readonly _recvSocket;
    private _nextId;
    private readonly _sents;
    private _recvBuffer?;
    constructor({ sendSocket, recvSocket, pid }: {
        sendSocket: any;
        recvSocket: any;
        pid: number;
    });
    close(): void;
    request(method: string, internal?: object, data?: any): Promise<any>;
    notify(event: string, internal?: object, data?: any): any;
    private _processMessage;
}
//# sourceMappingURL=Channel.d.ts.map