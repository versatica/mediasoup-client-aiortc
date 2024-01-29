import { Logger } from './Logger';
import { Worker, WorkerSettings, WorkerLogLevel } from './Worker';
import { AiortcMediaStream } from './AiortcMediaStream';
import {
	AiortcMediaStreamConstraints,
	AiortcMediaTrackConstraints,
} from './media';

const logger = new Logger();

/**
 * Expose Worker factory.
 */
export async function createWorker({
	logLevel = 'error',
}: WorkerSettings = {}): Promise<Worker> {
	logger.debug('createWorker()');

	const worker = new Worker({ logLevel });

	return new Promise<Worker>((resolve, reject) => {
		worker.on('@success', () => resolve(worker));
		worker.on('@failure', reject);
	});
}

/**
 * Expose Worker class and related types.
 */
export { Worker };
export type { WorkerSettings, WorkerLogLevel };

/**
 * Expose AiortcMediaStream class and related types.
 */
export { AiortcMediaStream };
export type { AiortcMediaStreamConstraints, AiortcMediaTrackConstraints };
