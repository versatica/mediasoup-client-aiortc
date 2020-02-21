import { Worker } from './Worker';
import { FakeMediaStream } from './FakeMediaStream';
export declare type MediaStreamOptions = {
    audio?: MediaStreamTrackOptions;
    video?: MediaStreamTrackOptions;
};
export declare type MediaStreamTrackOptions = {
    source: 'device' | 'file' | 'url';
    device?: string;
    file?: string;
    url?: string;
    format?: string;
    options?: object;
};
export declare function createMediaStream(worker: Worker, options?: MediaStreamOptions): Promise<FakeMediaStream>;
//# sourceMappingURL=media.d.ts.map