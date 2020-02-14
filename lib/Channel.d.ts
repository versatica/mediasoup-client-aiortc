import { EnhancedEventEmitter } from './EnhancedEventEmitter';
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
    request(method: string, data?: any): Promise<any>;
    notify(event: string, data?: any): Promise<any>;
    private _processMessage;
}
//# sourceMappingURL=Channel.d.ts.map