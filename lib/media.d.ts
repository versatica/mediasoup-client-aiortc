import { Worker } from './Worker';
import { FakeMediaStream } from './FakeMediaStream';
export declare type FakeMediaStreamOptions = {
    audio?: FakeMediaStreamKindOptions;
    video?: FakeMediaStreamKindOptions;
};
export declare type FakeMediaStreamKindOptions = {
    source: 'device' | 'file' | 'url';
    device?: string;
    file?: string;
    url?: string;
    format?: string;
    options?: object;
};
export declare function createMediaStream(worker: Worker, options?: FakeMediaStreamOptions): Promise<FakeMediaStream>;
//# sourceMappingURL=media.d.ts.map