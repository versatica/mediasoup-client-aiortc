import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { FakeMediaStreamTrack } from 'fake-mediastreamtrack';
import { clone } from 'mediasoup-client/lib/utils';
import { Channel } from './Channel';
import { AiortcMediaStream } from './AiortcMediaStream';

export type AiortcMediaStreamConstraints =
{
	audio?: AiortcMediaTrackConstraints | boolean;
	video?: AiortcMediaTrackConstraints | boolean;
}

export type AiortcMediaTrackConstraints =
{
	source: 'device' | 'file' | 'url';
	device?: string;
	file?: string;
	url?: string;
	format?: string;
	options?: object;
}

type MediaPlayerInternal =
{
	playerId: string;
	audioTrackId?: string;
	videoTrackId?: string;
};

type MediaPlayerOptions =
{
	source: 'device' | 'file' | 'url';
	file: string;
	format?: string;
	options?: object;
};

export async function getUserMedia(
	channel: Channel,
	constraints: AiortcMediaStreamConstraints = {}
): Promise<AiortcMediaStream>
{
	constraints = clone(constraints, {}) as AiortcMediaStreamConstraints;

	let { audio, video } = constraints;
	let audioPlayerInternal: MediaPlayerInternal;
	let videoPlayerInternal: MediaPlayerInternal;
	let audioPlayerOptions: MediaPlayerOptions;
	let videoPlayerOptions: MediaPlayerOptions;
	const tracks: FakeMediaStreamTrack[] = [];

	if (!audio && !video)
		throw new TypeError('at least audio or video constraints must be given');

	if (audio)
	{
		audioPlayerInternal = { playerId: uuidv4() };

		if (audio === true)
			audio = { source: 'device' };

		switch (audio.source)
		{
			case 'device':
			{
				if (os.platform() === 'darwin')
				{
					audioPlayerOptions =
					{
						source  : 'device',
						file    : audio.device || 'none:0',
						format  : audio.format || 'avfoundation',
						options : audio.options
					};
				}
				else
				{
					audioPlayerOptions =
					{
						source  : 'device',
						file    : audio.device || 'hw:0',
						format  : audio.format || 'alsa',
						options : audio.options
					};
				}

				break;
			}

			case 'file':
			{
				if (!audio.file)
					throw new TypeError('missing audio.file');

				audioPlayerOptions =
				{
					source : 'file',
					file   : audio.file
				};

				break;
			}

			case 'url':
			{
				if (!audio.url)
					throw new TypeError('missing audio.url');

				audioPlayerOptions =
				{
					source : 'url',
					file   : audio.url
				};

				break;
			}

			default:
			{
				throw new TypeError(`invalid audio.source "${audio.source}"`);
			}
		}
	}

	if (video)
	{
		videoPlayerInternal = { playerId: uuidv4() };

		if (video === true)
			video = { source: 'device' };

		switch (video.source)
		{
			case 'device':
			{
				if (os.platform() === 'darwin')
				{
					videoPlayerOptions =
					{
						source  : 'device',
						file    : video.device || 'default:none',
						format  : video.format || 'avfoundation',
						options : video.options || { framerate: '30', video_size: '640x480' }
					};
				}
				else
				{
					videoPlayerOptions =
					{
						source  : 'device',
						file    : video.device || '/dev/video0',
						format  : video.format || 'v4l2',
						options : video.options || { framerate: '30', video_size: '640x480' }
					};
				}

				break;
			}

			case 'file':
			{
				if (!video.file)
					throw new TypeError('missing video.file');

				videoPlayerOptions =
				{
					source : 'file',
					file   : video.file
				};

				break;
			}

			case 'url':
			{
				if (!video.url)
					throw new TypeError('missing video.url');

				videoPlayerOptions =
				{
					source : 'url',
					file   : video.url
				};

				break;
			}

			default:
			{
				throw new TypeError(`invalid video.source "${video.source}"`);
			}
		}
	}

	// If both players have source 'file' or 'url' and their file match, just
	// create a single MediaPlayer.
	const areSamePlayer =
	(
		audioPlayerInternal &&
		videoPlayerInternal &&
		[ 'file', 'url' ].includes(audioPlayerOptions.source) &&
		audioPlayerOptions.source === videoPlayerOptions.source &&
		audioPlayerOptions.file === videoPlayerOptions.file
	);

	let result:
	{
		audioTrackId?: string;
		videoTrackId?: string;
	} =
	{
		audioTrackId : undefined,
		videoTrackId : undefined
	};

	if (audioPlayerInternal)
	{
		result = await channel.request(
			'createPlayer', audioPlayerInternal, audioPlayerOptions);

		if (!result.audioTrackId)
			throw new Error('no audioTrackId in result');

		audioPlayerInternal.audioTrackId = result.audioTrackId;
	}

	if (videoPlayerInternal)
	{
		// If both audio and video share same file/url, do not create a video
		// player and set the same playerId in both.
		if (areSamePlayer)
		{
			videoPlayerInternal.playerId = audioPlayerInternal.playerId;
		}
		else
		{
			try
			{
				result = await channel.request(
					'createPlayer', videoPlayerInternal, videoPlayerOptions);
			}
			catch (error)
			{
				// If the video player fails and we created an audio player, close it.
				if (audioPlayerInternal)
					channel.notify('player.close', audioPlayerInternal);

				throw error;
			}
		}

		if (!result.videoTrackId)
			throw new Error('no videoTrackId in result');

		videoPlayerInternal.videoTrackId = result.videoTrackId;
	}

	if (audioPlayerInternal)
	{
		const track = new FakeMediaStreamTrack(
			{
				id   : audioPlayerInternal.audioTrackId,
				kind : 'audio',
				data : { playerId: audioPlayerInternal.playerId }
			});

		track.addEventListener('@stop', () =>
		{
			channel.notify(
				'player.stopTrack', audioPlayerInternal, { kind: 'audio' });
		});

		tracks.push(track);
	}

	if (videoPlayerInternal)
	{
		const track = new FakeMediaStreamTrack(
			{
				id   : videoPlayerInternal.videoTrackId,
				kind : 'video',
				data : { playerId: videoPlayerInternal.playerId }
			});

		track.addEventListener('@stop', () =>
		{
			channel.notify(
				'player.stopTrack', videoPlayerInternal, { kind: 'video' });
		});

		tracks.push(track);
	}

	const stream = new AiortcMediaStream(tracks);

	stream.addEventListener('@close', () =>
	{
		if (audioPlayerInternal)
			channel.notify('player.close', audioPlayerInternal);

		if (videoPlayerInternal && !areSamePlayer)
			channel.notify('player.close', videoPlayerInternal);
	});

	return stream;
}
