import { HandlerFactory } from 'mediasoup-client/lib/handlers/HandlerInterface';
import { Worker, WorkerSettings, WorkerLogLevel } from './Worker';
import { createMediaStream, MediaStreamOptions, MediaStreamTrackOptions } from './media';
/**
 * Expose version.
 */
export declare const version = "__VERSION__";
/**
 * Expose Worker factory.
 */
export declare function createWorker({ logLevel }?: WorkerSettings): Promise<Worker>;
/**
 * Expose Worker related type.
 */
export { WorkerSettings, WorkerLogLevel };
/**
 * Exponse a function to create a HandlerFactory.
 */
export declare function createHandlerFactory(worker: Worker): HandlerFactory;
/**
 * Expose FakeMediaStream factory and related types.
 */
export { createMediaStream, MediaStreamOptions, MediaStreamTrackOptions };
//# sourceMappingURL=index.d.ts.map