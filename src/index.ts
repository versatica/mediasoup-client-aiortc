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
 * Load the module. Spawn the worker subprocess.
 */
export async function load(
	{ logLevel = 'error' }:
	WorkerSettings = {}
): Promise<void>
{
	logger.debug('load()');

	if (isModuleLoaded())
		throw new InvalidStateError('already loaded');

	worker = new Worker({ logLevel });

	worker.on('@close', () => { worker = undefined; });

	return new Promise((resolve, reject) =>
	{
		worker.on('@success', resolve);
		worker.on('@failure', reject);
	});
}

/**
 * Unload the module. Close the worker subprocess.
 */
export function unload(): void
{
	logger.debug('unload()');

	if (!isModuleLoaded())
		logger.debug('unload() | module not loaded');

	if (worker)
		worker.close();
}

/**
 * Create a mediasoup-client HandlerFactory.
 */
export function createHandlerFactory(): HandlerFactory
{
	logger.debug('createHandlerFactory()');

	assertModuleLoaded();

	return worker.createHandlerFactory();
}

function isModuleLoaded(): boolean
{
	return worker && !worker.closed;
}

function assertModuleLoaded(): void
{
	if (!isModuleLoaded())
		throw new InvalidStateError('module not loaded');
}
