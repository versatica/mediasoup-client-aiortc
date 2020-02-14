import { Aiortc } from './Aiortc';
import { WorkerLogLevel } from './Worker';

const createFactory = Aiortc.createFactory;

/**
 * Expose createFactory() and WorkerLogLevel.
 */
export { createFactory, WorkerLogLevel };

/**
 * Expose version.
 */
export const version = '__VERSION__';
