"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const uuid_1 = require("uuid");
const event_target_shim_1 = require("event-target-shim");
class AiortcMediaStream extends event_target_shim_1.EventTarget {
    constructor(tracks) {
        super();
        this._tracks = new Map();
        this._id = uuid_1.v4();
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
        this.dispatchEvent({ type: '@close' });
        for (const track of this._tracks.values()) {
            track.stop();
        }
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
