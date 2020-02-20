import { HandlerFactory } from 'mediasoup-client/lib/handlers/HandlerInterface';
import { WorkerSettings } from './Worker';
/**
 * Expose version.
 */
export declare const version = "__VERSION__";
/**
 * Load the module. Spawn the worker subprocess.
 */
export declare function load({ logLevel }?: WorkerSettings): Promise<void>;
/**
 * Unload the module. Close the worker subprocess.
 */
export declare function unload(): void;
/**
 * Create a mediasoup-client HandlerFactory.
 */
export declare function createHandlerFactory(): HandlerFactory;
//# sourceMappingURL=index.d.ts.map