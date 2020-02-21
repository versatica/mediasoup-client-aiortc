import { Channel } from './Channel';
import { AppMediaStream } from './AppMediaStream';
export declare type AppMediaStreamConstraints = {
    audio?: AppMediaTrackConstraints | boolean;
    video?: AppMediaTrackConstraints | boolean;
};
export declare type AppMediaTrackConstraints = {
    source: 'device' | 'file' | 'url';
    device?: string;
    file?: string;
    url?: string;
    format?: string;
    options?: object;
};
export declare function getAppMedia(channel: Channel, constraints?: AppMediaStreamConstraints): Promise<AppMediaStream>;
//# sourceMappingURL=media.d.ts.map