import { HandlerFactory } from 'mediasoup-client/lib/handlers/HandlerInterface';
import {
	createWorker,
	Worker,
	WorkerSettings,
	WorkerLogLevel
} from './Worker';
import {
	createMediaStream,
	FakeMediaStreamOptions,
	FakeMediaStreamKindOptions
} from './media';
import { FakeMediaStream } from './FakeMediaStream';

/**
 * Expose version.
 */
export const version = '__VERSION__';

/**
 * Expose Worker factory and related types.
 */
export {
	createWorker,
	Worker,
	WorkerSettings,
	WorkerLogLevel
};

/**
 * Exponse a function to create a HandlerFactory.
 */
export function createHandlerFactory(worker: Worker): HandlerFactory
{
	return worker.createHandlerFactory();
}

/**
 * Expose FakeMediaStream factory and related types.
 */
export {
	createMediaStream,
	FakeMediaStream,
	FakeMediaStreamOptions,
	FakeMediaStreamKindOptions
};
