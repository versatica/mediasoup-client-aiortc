"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const v4_1 = __importDefault(require("uuid/v4"));
const event_target_shim_1 = require("event-target-shim");
class AiortcMediaStream extends event_target_shim_1.EventTarget {
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
    /**
     * Custom method to close associated MediaPlayers in aiortc.
     */
    close() {
        for (const track of this._tracks.values()) {
            track.stop();
        }
        this.dispatchEvent({ type: '@close' });
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
exports.AiortcMediaStream = AiortcMediaStream;
// Define EventTarget properties.
// NOTE: These are not implemented/dispatched.
event_target_shim_1.defineEventAttribute(AiortcMediaStream.prototype, 'addtrack');
event_target_shim_1.defineEventAttribute(AiortcMediaStream.prototype, 'removetrack');
// Custom EventTarget properties.
event_target_shim_1.defineEventAttribute(AiortcMediaStream.prototype, '@close');
