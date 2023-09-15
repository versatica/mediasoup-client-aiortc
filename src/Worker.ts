import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { Logger } from 'mediasoup-client/lib/Logger';
import { EnhancedEventEmitter } from 'mediasoup-client/lib/EnhancedEventEmitter';
import { HandlerFactory } from 'mediasoup-client/lib/handlers/HandlerInterface';
import { Channel } from './Channel';
import * as media from './media';
import { AiortcMediaStream } from './AiortcMediaStream';
import { Handler } from './Handler';

// Whether the Python subprocess should log via PIPE to Node.js or directly to
// stdout and stderr.
const PYTHON_LOG_VIA_PIPE = process.env.PYTHON_LOG_TO_STDOUT !== 'true';

const logger = new Logger('aiortc:Worker');

export type WorkerSettings =
{
	/**
	 * Logging level for logs generated by the Python subprocess.
	 */
	logLevel?: WorkerLogLevel;
};

export type WorkerLogLevel = 'debug' | 'warn' | 'error' | 'none';

export class Worker extends EnhancedEventEmitter
{
	// Python worker child process.
	#child?: ChildProcess;
	// Worker process PID.
	readonly #pid: number;
	// Channel instance.
	readonly #channel: Channel;
	// Closed flag.
	#closed = false;
	// Handlers set.
	readonly #handlers: Set<Handler> = new Set();

	/**
	 * @emits died - (error: Error)
	 * @emits @success
	 * @emits @failure - (error: Error)
	 */
	constructor({ logLevel }: WorkerSettings)
	{
		super();

		logger.debug('constructor() [logLevel:%o]', logLevel);

		const spawnBin = process.env.PYTHON || 'python3';
		const spawnArgs: string[] = [];

		spawnArgs.push('-u'); // Unbuffered stdio.

		spawnArgs.push(path.join(__dirname, '..', 'worker', 'worker.py'));

		if (logLevel)
		{
			spawnArgs.push(`--logLevel=${logLevel}`);
		}

		logger.debug(
			'spawning worker process: %s %s', spawnBin, spawnArgs.join(' '));

		this.#child = spawn(
			// command
			spawnBin,
			// args
			spawnArgs,
			// options
			{
				detached : false,
				// fd 0 (stdin)   : Just ignore it.
				// fd 1 (stdout)  : Pipe it for 3rd libraries that log their own stuff.
				// fd 2 (stderr)  : Same as stdout.
				// fd 3 (channel) : Channel fd.
				stdio :
				[
					'ignore',
					PYTHON_LOG_VIA_PIPE ? 'pipe' : 'inherit',
					PYTHON_LOG_VIA_PIPE ? 'pipe' : 'inherit',
					'pipe'
				]
			});

		this.#pid = this.#child.pid!;

		this.#channel = new Channel(
			{
				socket : this.#child.stdio[3],
				pid    : this.#pid
			});

		let spawnDone = false;

		// Listen for 'running' notification.
		this.#channel.once(String(this.#pid), (event: string) =>
		{
			if (!spawnDone && event === 'running')
			{
				spawnDone = true;

				logger.debug('worker process running [pid:%s]', this.#pid);

				this.emit('@success');
			}
		});

		this.#child.on('exit', (code, signal) =>
		{
			this.#child = undefined;
			this.close();

			if (!spawnDone)
			{
				spawnDone = true;

				if (code === 42)
				{
					logger.error(
						'worker process failed due to wrong settings [pid:%s]', this.#pid);

					this.emit('@failure', new TypeError('wrong settings'));
				}
				else
				{
					logger.error(
						'worker process failed unexpectedly [pid:%s, code:%s, signal:%s]',
						this.#pid, code, signal);

					this.emit(
						'@failure',
						new Error(`[pid:${this.#pid}, code:${code}, signal:${signal}]`));
				}
			}
			else
			{
				logger.error(
					'worker process died unexpectedly [pid:%s, code:%s, signal:%s]',
					this.#pid, code, signal);

				this.safeEmit(
					'died',
					new Error(`[pid:${this.#pid}, code:${code}, signal:${signal}]`));
			}
		});

		this.#child.on('error', (error) =>
		{
			this.#child = undefined;
			this.close();

			if (!spawnDone)
			{
				spawnDone = true;

				logger.error(
					'worker process failed [pid:%s]: %s', this.#pid, error.message);

				this.emit('@failure', error);
			}
			else
			{
				logger.error(
					'worker process error [pid:%s]: %s', this.#pid, error.message);

				this.safeEmit('died', error);
			}
		});

		if (PYTHON_LOG_VIA_PIPE)
		{
			// Be ready for 3rd party worker libraries logging to stdout.
			this.#child.stdout!.on('data', (buffer) =>
			{
				for (const line of buffer.toString('utf8').split('\n'))
				{
					if (line)
					{
						logger.debug(`(stdout) ${line}`);
					}
				}
			});

			// In case of a worker bug, mediasoup will log to stderr.
			this.#child.stderr!.on('data', (buffer) =>
			{
				for (const line of buffer.toString('utf8').split('\n'))
				{
					if (line)
					{
						logger.error(`(stderr) ${line}`);
					}
				}
			});
		}
	}

	/**
	 * Worker process identifier (PID).
	 */
	get pid(): number
	{
		return this.#pid;
	}

	/**
	 * Whether the Worker is closed.
	 */
	get closed(): boolean
	{
		return this.#closed;
	}

	/**
	 * Close the Worker.
	 */
	close(): void
	{
		logger.debug('close()');

		if (this.#closed)
		{
			return;
		}

		this.#closed = true;

		// Kill the worker process.
		if (this.#child)
		{
			// Remove event listeners but leave a fake 'error' hander to avoid
			// propagation.
			if (PYTHON_LOG_VIA_PIPE)
			{
				this.#child.stdout!.removeAllListeners();
				this.#child.stderr!.removeAllListeners();
			}
			this.#child.removeAllListeners('exit');
			this.#child.removeAllListeners('error');
			// eslint-disable-next-line @typescript-eslint/no-empty-function
			this.#child.on('error', () => {});
			this.#child = undefined;
		}

		// Close every Handler.
		for (const handler of this.#handlers)
		{
			handler.close();
		}
		this.#handlers.clear();

		// Close the Channel instance.
		this.#channel.close();
	}

	async dump(): Promise<any>
	{
		logger.debug('dump()');

		return this.#channel.request('dump');
	}

	/**
	 * Create a AiortcMediaStream with audio/video tracks.
	 */
	async getUserMedia(
		constraints: media.AiortcMediaStreamConstraints
	): Promise<AiortcMediaStream>
	{
		logger.debug('getUserMedia() [constraints:%o]', constraints);

		return media.getUserMedia(this.#channel, constraints);
	}

	/**
	 * Create a mediasoup-client HandlerFactory.
	 */
	createHandlerFactory(): HandlerFactory
	{
		logger.debug('createHandlerFactory()');

		return (): Handler =>
		{
			const internal = { handlerId: uuidv4() };
			const handler = new Handler(
				{
					internal,
					channel : this.#channel
				});

			this.#handlers.add(handler);
			handler.on('@close', () => this.#handlers.delete(handler));

			return handler;
		};
	}
}
