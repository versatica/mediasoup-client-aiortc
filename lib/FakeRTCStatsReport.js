"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FakeRTCStatsReport = void 0;
class FakeRTCStatsReport extends Map {
    /**
     * Given data must be an object whose keys are the id of each RTCStats and
     * their values the corresponding RTCStats objects.
     */
    constructor(data) {
        super();
        // Fill this map with the given data object.
        for (const key of Object.keys(data)) {
            this.set(key, data[key]);
        }
    }
}
exports.FakeRTCStatsReport = FakeRTCStatsReport;
