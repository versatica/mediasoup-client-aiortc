import { HandlerFactory } from 'mediasoup-client/lib/handlers/HandlerInterface';
import { WorkerSettings } from './Worker';
/**
 * Expose version.
 */
export declare const version = "__VERSION__";
/**
 * Run the Worker.
 */
export declare function runWorker({ logLevel }?: WorkerSettings): Promise<void>;
/**
 * Close the Worker.
 */
export declare function closeWorker(): void;
/**
 * Create a mediasoup-client HandlerFactory.
 */
export declare function createHandlerFactory(): Promise<HandlerFactory>;
//# sourceMappingURL=index.d.ts.map