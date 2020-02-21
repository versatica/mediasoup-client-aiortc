import { Channel } from './Channel';
import { AiortcMediaStream } from './AiortcMediaStream';
export declare type AiortcMediaStreamConstraints = {
    audio?: AiortcMediaTrackConstraints | boolean;
    video?: AiortcMediaTrackConstraints | boolean;
};
export declare type AiortcMediaTrackConstraints = {
    source: 'device' | 'file' | 'url';
    device?: string;
    file?: string;
    url?: string;
    format?: string;
    options?: object;
};
export declare function getUserMedia(channel: Channel, constraints?: AiortcMediaStreamConstraints): Promise<AiortcMediaStream>;
//# sourceMappingURL=media.d.ts.map