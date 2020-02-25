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
const utils_1 = require("mediasoup-client/lib/utils");
const AiortcMediaStream_1 = require("./AiortcMediaStream");
async function getUserMedia(channel, constraints = {}) {
    constraints = utils_1.clone(constraints);
    let { audio, video } = constraints;
    let audioPlayerInternal;
    let videoPlayerInternal;
    let audioPlayerOptions;
    let videoPlayerOptions;
    const tracks = [];
    if (!audio && !video)
        throw new TypeError('at least audio or video constraints must be given');
    if (audio) {
        audioPlayerInternal = { playerId: v4_1.default() };
        if (audio === true)
            audio = { source: 'device' };
        switch (audio.source) {
            case 'device':
                {
                    if (os.platform() === 'darwin') {
                        audioPlayerOptions =
                            {
                                source: 'device',
                                file: audio.device || 'none:0',
                                format: audio.format || 'avfoundation',
                                options: audio.options
                            };
                    }
                    else {
                        audioPlayerOptions =
                            {
                                source: 'device',
                                file: audio.device || 'hw:0',
                                format: audio.format || 'alsa',
                                options: audio.options
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
        if (video === true)
            video = { source: 'device' };
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
    let result = {
        audioTrackId: undefined,
        videoTrackId: undefined
    };
    if (audioPlayerInternal) {
        result = await channel.request('createPlayer', audioPlayerInternal, audioPlayerOptions);
        if (!result.audioTrackId)
            throw new Error('no audioTrackId in result');
        audioPlayerInternal.audioTrackId = result.audioTrackId;
    }
    if (videoPlayerInternal) {
        // If both audio and video share same file/url, do not create a video
        // player and set the same playerId in both.
        if (areSamePlayer) {
            videoPlayerInternal.playerId = audioPlayerInternal.playerId;
        }
        else {
            try {
                result = await channel.request('createPlayer', videoPlayerInternal, videoPlayerOptions);
            }
            catch (error) {
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
    if (audioPlayerInternal) {
        const track = new fake_mediastreamtrack_1.FakeMediaStreamTrack({
            id: audioPlayerInternal.audioTrackId,
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
            id: videoPlayerInternal.videoTrackId,
            kind: 'video',
            data: { playerId: videoPlayerInternal.playerId }
        });
        track.addEventListener('@stop', () => {
            channel.notify('player.stopTrack', videoPlayerInternal, { kind: 'video' });
        });
        tracks.push(track);
    }
    const stream = new AiortcMediaStream_1.AiortcMediaStream(tracks);
    stream.addEventListener('@close', () => {
        if (audioPlayerInternal)
            channel.notify('player.close', audioPlayerInternal);
        if (videoPlayerInternal && !areSamePlayer)
            channel.notify('player.close', videoPlayerInternal);
    });
    return stream;
}
exports.getUserMedia = getUserMedia;
