import { Logger } from 'mediasoup-client/lib/Logger';
import { HandlerFactory } from 'mediasoup-client/lib/handlers/HandlerInterface';
import { Worker, WorkerSettings } from './Worker';

const logger = new Logger('aiortc');

/**
 * Expose version.
 */
export const version = '__VERSION__';

/**
 * Create a Worker.
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
 * Create a mediasoup-client HandlerFactory.
 */
export function createHandlerFactory(worker: Worker): HandlerFactory
{
	logger.debug('createHandlerFactory()');

	return worker.createHandlerFactory();
}
