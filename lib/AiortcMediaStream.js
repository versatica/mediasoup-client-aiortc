"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiortcMediaStream = void 0;
const uuid_1 = require("uuid");
const event_target_shim_1 = require("event-target-shim");
class AiortcMediaStream extends event_target_shim_1.EventTarget {
    // Event listeners. These are cosmetic public members to make TS happy.
    // NOTE: We never emit these events.
    // public onaddtrack: (this: AiortcMediaStream, ev: Event) => any;
    // public onremovetrack: (this: MediaStream, ev: Event) => any;
    constructor(tracks) {
        super();
        this._tracks = new Map();
        this._id = (0, uuid_1.v4)();
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
    get onaddtrack() {
        return (0, event_target_shim_1.getEventAttributeValue)(this, 'addtrack');
    }
    set onaddtrack(listener) {
        (0, event_target_shim_1.setEventAttributeValue)(this, 'addtrack', listener);
    }
    get onremovetrack() {
        return (0, event_target_shim_1.getEventAttributeValue)(this, 'removetrack');
    }
    set onremovetrack(listener) {
        (0, event_target_shim_1.setEventAttributeValue)(this, 'removetrack', listener);
    }
    /**
     * Custom method to close associated MediaPlayers in aiortc.
     */
    close() {
        this.dispatchEvent(new event_target_shim_1.Event('@close'));
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
