import { HandlerFactory } from 'mediasoup-client/lib/handlers/HandlerInterface';
import { createWorker, Worker, WorkerSettings, WorkerLogLevel } from './Worker';
import { createMediaStream, FakeMediaStreamOptions, FakeMediaStreamKindOptions } from './media';
import { FakeMediaStream } from './FakeMediaStream';
/**
 * Expose version.
 */
export declare const version = "__VERSION__";
/**
 * Expose Worker factory and related types.
 */
export { createWorker, Worker, WorkerSettings, WorkerLogLevel };
/**
 * Exponse a function to create a HandlerFactory.
 */
export declare function createHandlerFactory(worker: Worker): HandlerFactory;
/**
 * Expose FakeMediaStream factory and related types.
 */
export { createMediaStream, FakeMediaStream, FakeMediaStreamOptions, FakeMediaStreamKindOptions };
//# sourceMappingURL=index.d.ts.map