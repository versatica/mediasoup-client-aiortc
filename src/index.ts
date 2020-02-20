import { Logger } from 'mediasoup-client/lib/Logger';
import { InvalidStateError } from 'mediasoup-client/lib/errors';
import { HandlerFactory } from 'mediasoup-client/lib/handlers/HandlerInterface';
import { Worker, WorkerSettings } from './Worker';

const logger = new Logger('aiortc');

// Worker singleton.
let worker: Worker | undefined;

/**
 * Expose version.
 */
export const version = '__VERSION__';

/**
 * Run the Worker.
 */
export async function runWorker(
	{ logLevel = 'error' }:
	WorkerSettings = {}
): Promise<void>
{
	logger.debug('runWorker()');

	if (isWorkerRunning())
		throw new InvalidStateError('worker already running');

	worker = new Worker({ logLevel });

	worker.on('@close', () => { worker = undefined; });

	return new Promise((resolve, reject) =>
	{
		worker.on('@success', () =>
		{
			resolve();
		});

		worker.on('@failure', reject);
	});
}

/**
 * Close the Worker.
 */
export function closeWorker(): void
{
	logger.debug('closeWorker()');

	if (!isWorkerRunning())
		logger.debug('closeWorker() | worker not running');

	if (worker)
		worker.close();
}

/**
 * Create a mediasoup-client HandlerFactory.
 */
export function createHandlerFactory(): HandlerFactory
{
	logger.debug('createHandlerFactory()');

	if (!isWorkerRunning())
		throw new InvalidStateError('worker not running');

	return worker.createHandlerFactory();
}

function isWorkerRunning(): boolean
{
	return worker && !worker.closed;
}
