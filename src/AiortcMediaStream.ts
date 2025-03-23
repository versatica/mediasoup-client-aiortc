import { v4 as uuidv4 } from 'uuid';
import { FakeMediaStreamTrack } from 'fake-mediastreamtrack';

export type AiortcMediaStreamTrack = FakeMediaStreamTrack<{
	playerId?: string;
	remote: boolean;
}>;

export interface AiortcMediaStreamEventMap extends MediaStreamEventMap {
	close: Event;
}

export class AiortcMediaStream extends EventTarget implements MediaStream {
	readonly #id: string;
	readonly #tracks: Map<string, AiortcMediaStreamTrack> = new Map();
	// Events.
	#onaddtrack:
		| ((this: AiortcMediaStream, ev: MediaStreamTrackEvent) => any)
		| null = null;
	#onremovetrack:
		| ((this: AiortcMediaStream, ev: MediaStreamTrackEvent) => any)
		| null = null;
	// Custom events.
	#onclose: ((this: AiortcMediaStream, ev: Event) => any) | null = null;

	constructor(tracks: AiortcMediaStreamTrack[]) {
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

	get onaddtrack():
		| ((this: MediaStream, ev: MediaStreamTrackEvent) => any)
		| null {
		return this.#onaddtrack as
			| ((this: MediaStream, ev: MediaStreamTrackEvent) => any)
			| null;
	}

	set onaddtrack(
		handler: ((this: MediaStream, ev: MediaStreamTrackEvent) => any) | null
	) {
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
			| ((this: MediaStream, ev: MediaStreamTrackEvent) => any)
			| null;
	}

	set onremovetrack(
		handler: ((this: MediaStream, ev: MediaStreamTrackEvent) => any) | null
	) {
		if (this.#onremovetrack) {
			this.removeEventListener('removetrack', this.#onremovetrack);
		}

		this.#onremovetrack = handler;

		if (handler) {
			this.addEventListener('removetrack', handler);
		}
	}

	get onclose(): ((this: MediaStream, ev: Event) => any) | null {
		return this.#onclose as ((this: MediaStream, ev: Event) => any) | null;
	}

	set onclose(handler: ((this: MediaStream, ev: Event) => any) | null) {
		if (this.#onclose) {
			this.removeEventListener('close', this.#onclose);
		}

		this.#onclose = handler;

		if (handler) {
			this.addEventListener('close', handler);
		}
	}

	override addEventListener<K extends keyof AiortcMediaStreamEventMap>(
		type: K,
		listener: (
			this: AiortcMediaStream,
			ev: AiortcMediaStreamEventMap[K]
		) => any,
		options?: boolean | AddEventListenerOptions
	): void {
		super.addEventListener(type, listener as EventListener, options);
	}

	override removeEventListener<K extends keyof AiortcMediaStreamEventMap>(
		type: K,
		listener: (
			this: AiortcMediaStream,
			ev: AiortcMediaStreamEventMap[K]
		) => any,
		options?: boolean | EventListenerOptions
	): void {
		super.removeEventListener(type, listener as EventListener, options);
	}

	/**
	 * Custom method to close associated MediaPlayers in aiortc.
	 */
	close(): void {
		this.dispatchEvent(new Event('close'));

		for (const track of this.#tracks.values()) {
			track.stop();
		}
	}

	getAudioTracks(): AiortcMediaStreamTrack[] {
		return Array.from(this.#tracks.values()).filter(
			track => track.kind === 'audio'
		);
	}

	getVideoTracks(): AiortcMediaStreamTrack[] {
		return Array.from(this.#tracks.values()).filter(
			track => track.kind === 'video'
		);
	}

	getTracks(): AiortcMediaStreamTrack[] {
		return Array.from(this.#tracks.values());
	}

	getTrackById(trackId: string): AiortcMediaStreamTrack | null {
		return this.#tracks.get(trackId) ?? null;
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	addTrack(track: AiortcMediaStreamTrack): void {
		throw new Error('not implemented');
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	removeTrack(track: AiortcMediaStreamTrack): void {
		throw new Error('not implemented');
	}

	clone(): MediaStream {
		throw new Error('not implemented');
	}
}
