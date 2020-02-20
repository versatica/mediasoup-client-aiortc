"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const v4_1 = __importDefault(require("uuid/v4"));
const event_target_shim_1 = require("event-target-shim");
class FakeMediaStream extends event_target_shim_1.EventTarget {
    constructor(tracks) {
        super();
        this._tracks = new Map();
        this._id = v4_1.default();
        for (const track of tracks) {
            this._tracks.set(track.id, track);
        }
    }
    get id() {
        return this._id;
    }
    get active() {
        return Array.from(this._tracks.values())
            .some((track) => track.readyState === 'live');
    }
    getAudioTracks() {
        return Array.from(this._tracks.values())
            .filter((track) => track.kind === 'audio');
    }
    getVideoTracks() {
        return Array.from(this._tracks.values())
            .filter((track) => track.kind === 'video');
    }
    getTracks() {
        return Array.from(this._tracks.values());
    }
    getTrackById(trackId) {
        return this._tracks.get(trackId);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    addTrack(track) {
        throw new Error('not implemented');
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    removeTrack(track) {
        throw new Error('not implemented');
    }
    clone() {
        throw new Error('not implemented');
    }
}
exports.FakeMediaStream = FakeMediaStream;
