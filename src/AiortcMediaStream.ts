import uuidv4 from 'uuid/v4';
import { EventTarget, defineEventAttribute } from 'event-target-shim';
import { FakeMediaStreamTrack } from 'fake-mediastreamtrack';

export class AiortcMediaStream extends EventTarget implements MediaStream
{
	private readonly _id: string;
	private readonly _tracks: Map<string, FakeMediaStreamTrack> = new Map();

	// Event listeners. These are cosmetic public members to make TS happy.
	// NOTE: We never emit these events.
	public onaddtrack: (this: MediaStream, ev: Event) => any;
	public onremovetrack: (this: MediaStream, ev: Event) => any;

	constructor(tracks: FakeMediaStreamTrack[])
	{
		super();

		this._id = uuidv4();

		for (const track of tracks)
		{
			this._tracks.set(track.id, track);
		}
	}

	get id(): string
	{
		return this._id;
	}

	get active(): boolean
	{
		return Array.from(this._tracks.values())
			.some((track) => track.readyState === 'live');
	}

	/**
	 * Custom method to close associated MediaPlayers in aiortc.
	 */
	close(): void
	{
		for (const track of this._tracks.values())
		{
			track.stop();
		}

		this.dispatchEvent({ type: '@close' });
	}

	getAudioTracks(): FakeMediaStreamTrack[]
	{
		return Array.from(this._tracks.values())
			.filter((track) => track.kind === 'audio');
	}

	getVideoTracks(): FakeMediaStreamTrack[]
	{
		return Array.from(this._tracks.values())
			.filter((track) => track.kind === 'video');
	}

	getTracks(): FakeMediaStreamTrack[]
	{
		return Array.from(this._tracks.values());
	}

	getTrackById(trackId: string): FakeMediaStreamTrack | undefined
	{
		return this._tracks.get(trackId);
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	addTrack(track: FakeMediaStreamTrack): void
	{
		throw new Error('not implemented');
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	removeTrack(track: FakeMediaStreamTrack): void
	{
		throw new Error('not implemented');
	}

	clone(): MediaStream
	{
		throw new Error('not implemented');
	}
}

// Define EventTarget properties.
// NOTE: These are not implemented/dispatched.
defineEventAttribute(AiortcMediaStream.prototype, 'addtrack');
defineEventAttribute(AiortcMediaStream.prototype, 'removetrack');
// Custom EventTarget properties.
defineEventAttribute(AiortcMediaStream.prototype, '@close');
