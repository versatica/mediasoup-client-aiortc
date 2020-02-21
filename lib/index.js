"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Logger_1 = require("mediasoup-client/lib/Logger");
const Worker_1 = require("./Worker");
const logger = new Logger_1.Logger('aiortc');
/**
 * Expose version.
 */
exports.version = '3.1.2';
/**
 * Create a Worker.
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
/**
 * Create a mediasoup-client HandlerFactory.
 */
function createHandlerFactory(worker) {
    logger.debug('createHandlerFactory()');
    return worker.createHandlerFactory();
}
exports.createHandlerFactory = createHandlerFactory;
