import { Aiortc } from './Aiortc';
import { WorkerLogLevel, Worker } from './Worker';

const createFactory = Aiortc.createFactory;

/**
 * Expose createFactory() and WorkerLogLevel.
 */
export { createFactory, WorkerLogLevel, Worker };

/**
 * Expose version.
 */
export const version = '__VERSION__';
