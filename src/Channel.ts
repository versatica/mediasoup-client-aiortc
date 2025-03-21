import { Duplex } from 'node:stream';
// @ts-expect-error --- netstring doesn't have types.
import * as netstring from 'netstring';
import { Logger } from './Logger';
import { EnhancedEventEmitter } from './enhancedEvents';
import { InvalidStateError } from './errors';

// netstring length for a 4194304 bytes payload.
const NS_MESSAGE_MAX_LEN = 4194313;
const NS_PAYLOAD_MAX_LEN = 4194304;

const logger = new Logger('Channel');

interface Sent {
	id: number;
	method: string;
	resolve: (data?: any) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
	close: () => void;
}

export class Channel extends EnhancedEventEmitter {
	// Closed flag.
	#closed = false;
	// Unix Socket instance for communicating with the worker process.
	readonly #socket: Duplex;
	// Next id for requests sent to the worker process.
	#nextId = 0;
	// Map of pending sent requests.
	readonly #sents: Map<number, Sent> = new Map();
	// Buffer for reading messages from the worker.
	#recvBuffer?: Buffer;

	constructor({ socket, pid }: { socket: any; pid: number }) {
		super();

		logger.debug('constructor()');

		this.#socket = socket as Duplex;

		// Read Channel responses/notifications from the worker.
		this.#socket.on('data', (buffer: Buffer) => {
			if (!this.#recvBuffer) {
				this.#recvBuffer = buffer;
			} else {
				this.#recvBuffer = Buffer.concat(
					[
						this.#recvBuffer as Uint8Array<ArrayBufferLike>,
						buffer as Uint8Array<ArrayBufferLike>,
					],
					this.#recvBuffer.length + buffer.length
				);
			}

			if (this.#recvBuffer.length > NS_PAYLOAD_MAX_LEN) {
				logger.error('receiving buffer is full, discarding all data into it');

				// Reset the buffer and exit.
				this.#recvBuffer = undefined;

				return;
			}

			while (true) {
				let nsPayload;

				try {
					nsPayload = netstring.nsPayload(this.#recvBuffer);
				} catch (error) {
					logger.error(
						'invalid netstring data received from the worker process: %s',
						String(error)
					);

					// Reset the buffer and exit.
					this.#recvBuffer = undefined;

					return;
				}

				// Incomplete netstring message.
				if (nsPayload === -1) {
					return;
				}

				// We only expect JSON messages (Channel messages).
				// 123 = '{' (a Channel JSON messsage).
				if (nsPayload[0] === 123) {
					this.processMessage(JSON.parse(nsPayload));
				} else {
					// eslint-disable-next-line no-console
					console.warn(
						`worker[pid:${pid}] unexpected data: %s`,
						nsPayload.toString('utf8', 1)
					);
				}

				// Remove the read payload from the buffer.
				this.#recvBuffer = this.#recvBuffer.slice(
					netstring.nsLength(this.#recvBuffer)
				);

				if (!this.#recvBuffer.length) {
					this.#recvBuffer = undefined;

					return;
				}
			}
		});

		this.#socket.on('end', () =>
			logger.debug('Channel ended by the worker process')
		);

		this.#socket.on('error', error =>
			logger.error('Channel error: %s', String(error))
		);
	}

	close(): void {
		if (this.#closed) {
			return;
		}

		logger.debug('close()');

		this.#closed = true;

		// Close every pending sent.
		for (const sent of this.#sents.values()) {
			sent.close();
		}

		// Remove event listeners but leave a fake 'error' hander to avoid
		// propagation.
		this.#socket.removeAllListeners('end');
		this.#socket.removeAllListeners('error');
		this.#socket.on('error', () => {});

		// Destroy the socket.
		try {
			this.#socket.destroy();
		} catch (error) {}
	}

	async request(method: string, internal?: object, data?: any): Promise<any> {
		if (this.#nextId < 4294967295) {
			++this.#nextId;
		} else {
			this.#nextId = 1;
		}

		const id = this.#nextId;

		logger.debug('request() [method:%s, id:%s]', method, id);

		if (this.#closed) {
			throw new InvalidStateError('Channel closed');
		}

		const request = { id, method, internal, data };
		const ns = netstring.nsWrite(JSON.stringify(request));

		if (Buffer.byteLength(ns) > NS_MESSAGE_MAX_LEN) {
			throw new Error(
				`Channel request too big [length:${Buffer.byteLength(ns)}]`
			);
		}

		// This may throw if closed or remote side ended.
		// Terminate with \r\n since we are expecting for it on the python side.
		this.#socket.write(ns);

		return new Promise((pResolve, pReject) => {
			const timeout = 2000 * (15 + 0.1 * this.#sents.size);
			const sent: Sent = {
				id: id,
				method: method,
				resolve: data2 => {
					if (!this.#sents.delete(id)) {
						return;
					}

					clearTimeout(sent.timer);
					pResolve(data2);
				},
				reject: error => {
					if (!this.#sents.delete(id)) {
						return;
					}

					clearTimeout(sent.timer);
					pReject(error);
				},
				timer: setTimeout(() => {
					if (!this.#sents.delete(id)) {
						return;
					}

					pReject(new Error('Channel request timeout'));
				}, timeout),
				close: () => {
					clearTimeout(sent.timer);
					pReject(new InvalidStateError('Channel closed'));
				},
			};

			// Add sent stuff to the map.
			this.#sents.set(id, sent);
		});
	}

	notify(event: string, internal?: object, data?: any): any {
		logger.debug('notify() [event:%s]', event);

		if (this.#closed) {
			logger.warn('notify() | Channel closed');

			return;
		}

		const notification = { event, internal, data };
		const ns = netstring.nsWrite(JSON.stringify(notification));

		if (Buffer.byteLength(ns) > NS_MESSAGE_MAX_LEN) {
			logger.error(
				'notify() | notification too big [length:%s]',
				Buffer.byteLength(ns)
			);

			return;
		}

		// This may throw if closed or remote side ended.
		// Terminate with \r\n since we are expecting for it on the python side.
		try {
			this.#socket.write(ns);
		} catch (error) {
			logger.warn('notify() | failed: %s', String(error));
		}
	}

	private processMessage(msg: any): void {
		// If a response retrieve its associated request.
		if (msg.id) {
			const sent = this.#sents.get(msg.id);

			if (!sent) {
				logger.error(
					'received response does not match any sent request [id:%s]',
					msg.id
				);

				return;
			}

			if (msg.accepted) {
				logger.debug(
					'request succeeded [method:%s, id:%s]',
					sent.method,
					sent.id
				);

				sent.resolve(msg.data);
			} else if (msg.error) {
				logger.warn(
					'request failed [method:%s, id:%s]: %s',
					sent.method,
					sent.id,
					msg.reason
				);

				switch (msg.error) {
					case 'TypeError': {
						sent.reject(new TypeError(msg.reason));

						break;
					}

					default: {
						sent.reject(new Error(msg.reason));
					}
				}
			} else {
				logger.error(
					'received response is not accepted nor rejected [method:%s, id:%s]',
					sent.method,
					sent.id
				);
			}
		}
		// If a notification emit it to the corresponding entity.
		else if (msg.event) {
			this.emit(msg.targetId, msg.event, msg.data);
		}
		// Otherwise unexpected message.
		else {
			logger.error('received message is not a response nor a notification');
		}
	}
}
