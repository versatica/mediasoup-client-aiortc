import { Logger } from 'mediasoup-client/lib/Logger';
import { HandlerFactory } from 'mediasoup-client/lib/handlers/HandlerInterface';
import {
	Worker,
	WorkerSettings,
	WorkerLogLevel
} from './Worker';
import {
	createMediaStream,
	MediaStreamOptions,
	MediaStreamTrackOptions
} from './media';

const logger = new Logger('aiortc');

/**
 * Expose version.
 */
export const version = '__VERSION__';

/**
 * Expose Worker factory.
 */
export async function createWorker(
	{ logLevel = 'error' }:
	WorkerSettings = {}
): Promise<Worker>
{
	logger.debug('createWorker()');

	const worker = new Worker({ logLevel });

	return new Promise((resolve, reject) =>
	{
		worker.on('@success', () => resolve(worker));
		worker.on('@failure', reject);
	});
}

/**
 * Expose Worker related type.
 */
export {
	WorkerSettings,
	WorkerLogLevel
};

/**
 * Exponse a function to create a HandlerFactory.
 */
export function createHandlerFactory(worker: Worker): HandlerFactory
{
	logger.debug('createHandlerFactory()');

	return worker.createHandlerFactory();
}

/**
 * Expose FakeMediaStream factory and related types.
 */
export {
	createMediaStream,
	MediaStreamOptions,
	MediaStreamTrackOptions
};
