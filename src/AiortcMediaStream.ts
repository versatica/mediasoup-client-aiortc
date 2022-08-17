import { v4 as uuidv4 } from 'uuid';
import {
	EventTarget,
	Event,
	getEventAttributeValue,
	setEventAttributeValue
} from 'event-target-shim';
import { FakeMediaStreamTrack } from 'fake-mediastreamtrack';

export class AiortcMediaStream extends EventTarget implements MediaStream
{
	private readonly _id: string;
	private readonly _tracks: Map<string, FakeMediaStreamTrack> = new Map();

	// Event listeners. These are cosmetic public members to make TS happy.
	// NOTE: We never emit these events.
	// public onaddtrack: (this: AiortcMediaStream, ev: Event) => any;
	// public onremovetrack: (this: MediaStream, ev: Event) => any;

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

	get onaddtrack(): any
	{
		return getEventAttributeValue(this, 'addtrack');
	}

	set onaddtrack(listener)
	{
		setEventAttributeValue(this, 'addtrack', listener);
	}

	get onremovetrack(): any
	{
		return getEventAttributeValue(this, 'removetrack');
	}

	set onremovetrack(listener)
	{
		setEventAttributeValue(this, 'removetrack', listener);
	}

	/**
	 * Custom method to close associated MediaPlayers in aiortc.
	 */
	close(): void
	{
		this.dispatchEvent(new Event('@close'));

		for (const track of this._tracks.values())
		{
			track.stop();
		}
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
