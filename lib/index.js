"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Logger_1 = require("mediasoup-client/lib/Logger");
const errors_1 = require("mediasoup-client/lib/errors");
const Worker_1 = require("./Worker");
const logger = new Logger_1.Logger('aiortc');
// Worker singleton.
let worker;
/**
 * Expose version.
 */
exports.version = '__VERSION__';
/**
 * Run the Worker.
 */
async function runWorker({ logLevel = 'error' } = {}) {
    logger.debug('runWorker()');
    if (isWorkerRunning())
        throw new errors_1.InvalidStateError('worker already running');
    worker = new Worker_1.Worker({ logLevel });
    worker.on('@close', () => { worker = undefined; });
    return new Promise((resolve, reject) => {
        worker.on('@success', () => {
            resolve();
        });
        worker.on('@failure', reject);
    });
}
exports.runWorker = runWorker;
/**
 * Close the Worker.
 */
function closeWorker() {
    logger.debug('closeWorker()');
    if (!isWorkerRunning())
        logger.debug('closeWorker() | worker not running');
    if (worker)
        worker.close();
}
exports.closeWorker = closeWorker;
/**
 * Create a mediasoup-client HandlerFactory.
 */
async function createHandlerFactory() {
    logger.debug('createHandlerFactory()');
    if (!isWorkerRunning())
        throw new errors_1.InvalidStateError('worker not running');
    return worker.createHandlerFactory();
}
exports.createHandlerFactory = createHandlerFactory;
function isWorkerRunning() {
    return worker && !worker.closed;
}
