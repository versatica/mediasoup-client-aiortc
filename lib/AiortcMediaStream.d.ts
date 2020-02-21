import { EventTarget } from 'event-target-shim';
import { FakeMediaStreamTrack } from 'fake-mediastreamtrack';
export declare class AiortcMediaStream extends EventTarget implements MediaStream {
    private readonly _id;
    private readonly _tracks;
    onaddtrack: (this: MediaStream, ev: Event) => any;
    onremovetrack: (this: MediaStream, ev: Event) => any;
    constructor(tracks: FakeMediaStreamTrack[]);
    readonly id: string;
    readonly active: boolean;
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