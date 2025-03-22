import { v4 as uuidv4 } from 'uuid';
import { FakeMediaStreamTrack } from 'fake-mediastreamtrack';

export class AiortcMediaStream extends EventTarget implements MediaStream {
	readonly #id: string;
	readonly #tracks: Map<string, FakeMediaStreamTrack> = new Map();
	// Events.
	#onaddtrack: ((this: AiortcMediaStream, ev: Event) => any) | null = null;
	#onremovetrack: ((this: AiortcMediaStream, ev: Event) => any) | null = null;

	constructor(tracks: FakeMediaStreamTrack[]) {
		super();

		this.#id = uuidv4();

		for (const track of tracks) {
			this.#tracks.set(track.id, track);
		}
	}

	get id(): string {
		return this.#id;
	}

	get active(): boolean {
		return Array.from(this.#tracks.values()).some(
			track => track.readyState === 'live'
		);
	}

	get onaddtrack(): ((this: MediaStream, ev: Event) => any) | null {
		return this.#onaddtrack as ((this: MediaStream, ev: Event) => any) | null;
	}

	set onaddtrack(handler: ((this: MediaStream, ev: Event) => any) | null) {
		if (this.#onaddtrack) {
			this.removeEventListener('addtrack', this.#onaddtrack);
		}

		this.#onaddtrack = handler;

		if (handler) {
			this.addEventListener('addtrack', handler);
		}
	}

	get onremovetrack():
		| ((this: MediaStream, ev: MediaStreamTrackEvent) => any)
		| null {
		return this.#onremovetrack as
			| ((this: MediaStream, ev: Event) => any)
			| null;
	}

	set onremovetrack(handler: ((this: MediaStream, ev: Event) => any) | null) {
		if (this.#onremovetrack) {
			this.removeEventListener('removetrack', this.#onremovetrack);
		}

		this.#onremovetrack = handler;

		if (handler) {
			this.addEventListener('removetrack', handler);
		}
	}

	/**
	 * Custom method to close associated MediaPlayers in aiortc.
	 */
	close(): void {
		this.dispatchEvent(new Event('@close'));

		for (const track of this.#tracks.values()) {
			track.stop();
		}
	}

	getAudioTracks(): FakeMediaStreamTrack[] {
		return Array.from(this.#tracks.values()).filter(
			track => track.kind === 'audio'
		);
	}

	getVideoTracks(): FakeMediaStreamTrack[] {
		return Array.from(this.#tracks.values()).filter(
			track => track.kind === 'video'
		);
	}

	getTracks(): FakeMediaStreamTrack[] {
		return Array.from(this.#tracks.values());
	}

	getTrackById(trackId: string): FakeMediaStreamTrack | null {
		return this.#tracks.get(trackId) ?? null;
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	addTrack(track: FakeMediaStreamTrack): void {
		throw new Error('not implemented');
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	removeTrack(track: FakeMediaStreamTrack): void {
		throw new Error('not implemented');
	}

	clone(): MediaStream {
		throw new Error('not implemented');
	}
}
