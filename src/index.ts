import { Logger } from 'mediasoup-client/lib/Logger';
import {
	Worker,
	WorkerSettings,
	WorkerLogLevel
} from './Worker';
import { AiortcMediaStream } from './AiortcMediaStream';
import {
	AiortcMediaStreamConstraints,
	AiortcMediaTrackConstraints
} from './media';

const logger = new Logger('aiortc');

/**
 * Expose version.
 */
export const version = '__MEDIASOUP_CLIENT_AIORTC_VERSION__';

/**
 * Expose Worker factory.
 */
export async function createWorker(
	{ logLevel = 'error' }:	WorkerSettings = {}
): Promise<Worker>
{
	logger.debug('createWorker()');

	const worker = new Worker({ logLevel });

	return new Promise<Worker>((resolve, reject) =>
	{
		worker.on('@success', () => resolve(worker));
		worker.on('@failure', reject);
	});
}

/**
 * Expose Worker class and related types.
 */
export {
	Worker,
	type WorkerSettings,
	type WorkerLogLevel
};

/**
 * Expose AiortcMediaStream class and related types.
 */
export {
	AiortcMediaStream,
	type AiortcMediaStreamConstraints,
	type AiortcMediaTrackConstraints
};
