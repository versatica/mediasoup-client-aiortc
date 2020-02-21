import * as os from 'os';
import uuidv4 from 'uuid/v4';
import { FakeMediaStreamTrack } from 'fake-mediastreamtrack';
import { clone } from 'mediasoup-client/lib/utils';
import { Channel } from './Channel';
import { AppMediaStream } from './AppMediaStream';

export type AppMediaStreamConstraints =
{
	audio?: AppMediaTrackConstraints | boolean;
	video?: AppMediaTrackConstraints | boolean;
}

export type AppMediaTrackConstraints =
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
};

type MediaPlayerOptions =
{
	source: 'device' | 'file' | 'url';
	file: string;
	format?: string;
	options?: object;
};

export async function getAppMedia(
	channel: Channel,
	constraints: AppMediaStreamConstraints = {}
): Promise<AppMediaStream>
{
	constraints = clone(constraints) as AppMediaStreamConstraints;

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
						// eslint-disable-next-line @typescript-eslint/camelcase
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
						// eslint-disable-next-line @typescript-eslint/camelcase
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

	if (audioPlayerInternal)
	{
		await channel.request(
			'createPlayer', audioPlayerInternal, audioPlayerOptions);
	}

	if (videoPlayerInternal)
	{
		// If the video player fails and we created an audio player, close it.
		try
		{
			if (!areSamePlayer)
			{
				await channel.request(
					'createPlayer', videoPlayerInternal, videoPlayerOptions);
			}
		}
		catch (error)
		{
			if (audioPlayerInternal)
				channel.notify('player.close', audioPlayerInternal);

			throw error;
		}
	}

	if (audioPlayerInternal)
	{
		const track = new FakeMediaStreamTrack(
			{
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

	const stream = new AppMediaStream(tracks);

	stream.addEventListener('@close', () =>
	{
		if (audioPlayerInternal)
			channel.notify('player.close', audioPlayerInternal);

		if (videoPlayerInternal && !areSamePlayer)
			channel.notify('player.close', videoPlayerInternal);
	});

	return stream;
}
