import { HandlerFactory } from 'mediasoup-client/lib/handlers/HandlerInterface';
import { Worker, WorkerSettings } from './Worker';
/**
 * Expose version.
 */
export declare const version = "__VERSION__";
/**
 * Create a Worker.
 */
export declare function createWorker({ logLevel }?: WorkerSettings): Promise<Worker>;
/**
 * Create a mediasoup-client HandlerFactory.
 */
export declare function createHandlerFactory(worker: Worker): HandlerFactory;
//# sourceMappingURL=index.d.ts.map