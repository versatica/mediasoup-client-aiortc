import { Worker, WorkerSettings, WorkerLogLevel } from './Worker';
import { AppMediaStream } from './AppMediaStream';
import { AppMediaStreamConstraints, AppMediaTrackConstraints } from './media';
/**
 * Expose version.
 */
export declare const version = "__VERSION__";
/**
 * Expose Worker factory.
 */
export declare function createWorker({ logLevel }?: WorkerSettings): Promise<Worker>;
/**
 * Expose Worker class and related types.
 */
export { Worker, WorkerSettings, WorkerLogLevel };
/**
 * Expose AppMediaStream class and related types.
 */
export { AppMediaStream, AppMediaStreamConstraints, AppMediaTrackConstraints };
//# sourceMappingURL=index.d.ts.map