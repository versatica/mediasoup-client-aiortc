import { EventTarget } from 'event-target-shim';
import { FakeMediaStreamTrack } from 'fake-mediastreamtrack';
export declare class AiortcMediaStream extends EventTarget implements MediaStream {
    private readonly _id;
    private readonly _tracks;
    constructor(tracks: FakeMediaStreamTrack[]);
    get id(): string;
    get active(): boolean;
    get onaddtrack(): any;
    set onaddtrack(listener: any);
    get onremovetrack(): any;
    set onremovetrack(listener: any);
    /**
     * Custom method to close associated MediaPlayers in aiortc.
     */
    close(): void;
    getAudioTracks(): FakeMediaStreamTrack[];
    getVideoTracks(): FakeMediaStreamTrack[];
    getTracks(): FakeMediaStreamTrack[];
    getTrackById(trackId: string): FakeMediaStreamTrack | undefined;
    addTrack(track: FakeMediaStreamTrack): void;
    removeTrack(track: FakeMediaStreamTrack): void;
    clone(): MediaStream;
}
//# sourceMappingURL=AiortcMediaStream.d.ts.map