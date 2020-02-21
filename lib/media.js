"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const os = __importStar(require("os"));
const v4_1 = __importDefault(require("uuid/v4"));
const fake_mediastreamtrack_1 = require("fake-mediastreamtrack");
const Logger_1 = require("mediasoup-client/lib/Logger");
const utils_1 = require("mediasoup-client/lib/utils");
const FakeMediaStream_1 = require("./FakeMediaStream");
const logger = new Logger_1.Logger('aiortc:media');
async function createMediaStream(worker, options = {}) {
    logger.debug('createMediaStream() [options:%o]', options);
    options = utils_1.clone(options);
    const channel = worker.channel;
    const { audio, video } = options;
    let audioPlayerInternal;
    let videoPlayerInternal;
    let audioPlayerOptions;
    let videoPlayerOptions;
    const tracks = [];
    if (!audio && !video)
        throw new TypeError('at least audio or video options must be given');
    if (audio) {
        audioPlayerInternal = { playerId: v4_1.default() };
        switch (audio.source) {
            case 'device':
                {
                    if (os.platform() === 'darwin') {
                        audioPlayerOptions =
                            {
                                source: 'device',
                                file: audio.device || 'none:0',
                                format: audio.format || 'avfoundation',
                                options: audio.options || {}
                            };
                    }
                    else {
                        audioPlayerOptions =
                            {
                                source: 'device',
                                file: audio.device || 'hw:0',
                                format: audio.format || 'alsa',
                                options: audio.options || {}
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
                            source: 'file',
                            file: audio.file
                        };
                    break;
                }
            case 'url':
                {
                    if (!audio.url)
                        throw new TypeError('missing audio.url');
                    audioPlayerOptions =
                        {
                            source: 'url',
                            file: audio.url
                        };
                    break;
                }
            default:
                {
                    throw new TypeError(`invalid audio.source "${audio.source}"`);
                }
        }
    }
    if (video) {
        videoPlayerInternal = { playerId: v4_1.default() };
        switch (video.source) {
            case 'device':
                {
                    if (os.platform() === 'darwin') {
                        videoPlayerOptions =
                            {
                                source: 'device',
                                file: video.device || 'default:none',
                                format: video.format || 'avfoundation',
                                // eslint-disable-next-line @typescript-eslint/camelcase
                                options: video.options || { framerate: '30', video_size: '640x480' }
                            };
                    }
                    else {
                        videoPlayerOptions =
                            {
                                source: 'device',
                                file: video.device || '/dev/video0',
                                format: video.format || 'v4l2',
                                // eslint-disable-next-line @typescript-eslint/camelcase
                                options: video.options || { framerate: '30', video_size: '640x480' }
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
                            source: 'file',
                            file: video.file
                        };
                    break;
                }
            case 'url':
                {
                    if (!video.url)
                        throw new TypeError('missing video.url');
                    videoPlayerOptions =
                        {
                            source: 'url',
                            file: video.url
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
    const areSamePlayer = (audioPlayerInternal &&
        videoPlayerInternal &&
        ['file', 'url'].includes(audioPlayerOptions.source) &&
        audioPlayerOptions.source === videoPlayerOptions.source &&
        audioPlayerOptions.file === videoPlayerOptions.file);
    if (audioPlayerInternal) {
        await channel.request('createPlayer', audioPlayerInternal, audioPlayerOptions);
    }
    if (videoPlayerInternal) {
        // If the video player fails and we created an audio player, close it.
        try {
            if (!areSamePlayer) {
                await channel.request('createPlayer', videoPlayerInternal, videoPlayerOptions);
            }
        }
        catch (error) {
            if (audioPlayerInternal)
                channel.notify('player.close', audioPlayerInternal);
            throw error;
        }
    }
    if (audioPlayerInternal) {
        const track = new fake_mediastreamtrack_1.FakeMediaStreamTrack({
            kind: 'audio',
            data: { playerId: audioPlayerInternal.playerId }
        });
        track.addEventListener('@stop', () => {
            channel.notify('player.stopTrack', audioPlayerInternal, { kind: 'audio' });
        });
        tracks.push(track);
    }
    if (videoPlayerInternal) {
        const track = new fake_mediastreamtrack_1.FakeMediaStreamTrack({
            kind: 'video',
            data: { playerId: videoPlayerInternal.playerId }
        });
        track.addEventListener('@stop', () => {
            channel.notify('player.stopTrack', videoPlayerInternal, { kind: 'video' });
        });
        tracks.push(track);
    }
    return new FakeMediaStream_1.FakeMediaStream({
        tracks,
        onClose: () => {
            if (audioPlayerInternal)
                channel.notify('player.close', audioPlayerInternal);
            if (videoPlayerInternal && !areSamePlayer)
                channel.notify('player.close', videoPlayerInternal);
        }
    });
}
exports.createMediaStream = createMediaStream;
