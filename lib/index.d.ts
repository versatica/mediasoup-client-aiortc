import { Worker, WorkerSettings, WorkerLogLevel } from './Worker';
import { AiortcMediaStream } from './AiortcMediaStream';
import { AiortcMediaStreamConstraints, AiortcMediaTrackConstraints } from './media';
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
 * Expose AiortcMediaStream class and related types.
 */
export { AiortcMediaStream, AiortcMediaStreamConstraints, AiortcMediaTrackConstraints };
//# sourceMappingURL=index.d.ts.map