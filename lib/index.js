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
 * Load the module. Spawn the worker subprocess.
 */
async function load({ logLevel = 'error' } = {}) {
    logger.debug('load()');
    if (isModuleLoaded())
        throw new errors_1.InvalidStateError('already loaded');
    worker = new Worker_1.Worker({ logLevel });
    worker.on('@close', () => { worker = undefined; });
    return new Promise((resolve, reject) => {
        worker.on('@success', resolve);
        worker.on('@failure', reject);
    });
}
exports.load = load;
/**
 * Unload the module. Close the worker subprocess.
 */
function unload() {
    logger.debug('unload()');
    if (!isModuleLoaded())
        logger.debug('unload() | module not loaded');
    if (worker)
        worker.close();
}
exports.unload = unload;
/**
 * Create a mediasoup-client HandlerFactory.
 */
function createHandlerFactory() {
    logger.debug('createHandlerFactory()');
    assertModuleLoaded();
    return worker.createHandlerFactory();
}
exports.createHandlerFactory = createHandlerFactory;
function isModuleLoaded() {
    return worker && !worker.closed;
}
function assertModuleLoaded() {
    if (!isModuleLoaded())
        throw new errors_1.InvalidStateError('module not loaded');
}
