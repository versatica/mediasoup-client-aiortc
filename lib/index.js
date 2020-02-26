"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Logger_1 = require("mediasoup-client/lib/Logger");
const Worker_1 = require("./Worker");
exports.Worker = Worker_1.Worker;
const AiortcMediaStream_1 = require("./AiortcMediaStream");
exports.AiortcMediaStream = AiortcMediaStream_1.AiortcMediaStream;
const logger = new Logger_1.Logger('aiortc');
/**
 * Expose version.
 */
exports.version = '3.2.5';
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
