"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiortcMediaStream = exports.Worker = exports.createWorker = exports.version = void 0;
const Logger_1 = require("mediasoup-client/lib/Logger");
const Worker_1 = require("./Worker");
Object.defineProperty(exports, "Worker", { enumerable: true, get: function () { return Worker_1.Worker; } });
const AiortcMediaStream_1 = require("./AiortcMediaStream");
Object.defineProperty(exports, "AiortcMediaStream", { enumerable: true, get: function () { return AiortcMediaStream_1.AiortcMediaStream; } });
const logger = new Logger_1.Logger('aiortc');
/**
 * Expose version.
 */
exports.version = '3.7.1';
/**
 * Expose Worker factory.
 */
async function createWorker({ logLevel = 'error' } = {}) {
    logger.debug('createWorker()');
    const worker = new Worker_1.Worker({ logLevel });
    return new Promise((resolve, reject) => {
        worker.on('@success', () => resolve(worker));
        worker.on('@failure', reject);
    });
}
exports.createWorker = createWorker;
