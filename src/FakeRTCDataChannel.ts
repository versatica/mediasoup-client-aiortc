import { Logger } from './Logger';
import { Channel } from './Channel';
import { InvalidStateError } from './errors';

const logger = new Logger('FakeRTCDataChannel');

export type FakeRTCDataChannelOptions = {
	id: number;
	ordered?: boolean;
	maxPacketLifeTime?: number | null;
	maxRetransmits?: number | null;
	label?: string;
	protocol?: string;
};

/**
 * https://github.com/versatica/mediasoup-client-aiortc/issues/24
 */
export class FakeRTCDataChannel extends EventTarget implements RTCDataChannel {
	// Internal data.
	readonly #internal: { handlerId: string; dataChannelId: string };
	// Channel.
	readonly #channel: Channel;
	// Members for RTCDataChannel standard public getters/setters.
	readonly #id: number;
	readonly #negotiated = true; // mediasoup just uses negotiated DataChannels.
	readonly #ordered: boolean;
	readonly #maxPacketLifeTime: number | null;
	readonly #maxRetransmits: number | null;
	readonly #label: string;
	readonly #protocol: string;
	#readyState: RTCDataChannelState = 'connecting';
	#bufferedAmount;
	#bufferedAmountLowThreshold;
	#binaryType: BinaryType = 'arraybuffer';
	// Events.
	#onopen: ((this: RTCDataChannel, ev: Event) => void) | null = null;
	#onclosing: ((this: RTCDataChannel, ev: Event) => void) | null = null;
	#onclose: ((this: RTCDataChannel, ev: Event) => void) | null = null;
	#onmessage: ((this: RTCDataChannel, ev: Event) => void) | null = null;
	#onbufferedamountlow: ((this: RTCDataChannel, ev: Event) => void) | null =
		null;
	#onerror: ((this: RTCDataChannel, ev: Event) => void) | null = null;

	constructor(
		internal: { handlerId: string; dataChannelId: string },
		channel: Channel,
		{
			id,
			ordered = true,
			maxPacketLifeTime = null,
			maxRetransmits = null,
			label = '',
			protocol = '',
		}: FakeRTCDataChannelOptions,
		status: {
			readyState: RTCDataChannelState;
			bufferedAmount: number;
			bufferedAmountLowThreshold: number;
		}
	) {
		super();

		logger.debug(
			`constructor() [id:${id}, ordered:${ordered}, maxPacketLifeTime:${maxPacketLifeTime}, maxRetransmits:${maxRetransmits}, label:${label}, protocol:${protocol}`
		);

		this.#internal = internal;
		this.#channel = channel;
		this.#id = id;
		this.#ordered = ordered;
		this.#maxPacketLifeTime = maxPacketLifeTime;
		this.#maxRetransmits = maxRetransmits;
		this.#label = label;
		this.#protocol = protocol;
		this.#readyState = status.readyState;
		this.#bufferedAmount = status.bufferedAmount;
		this.#bufferedAmountLowThreshold = status.bufferedAmountLowThreshold;

		this.handleWorkerNotifications();
	}

	get id(): number {
		return this.#id;
	}

	get negotiated(): boolean {
		return this.#negotiated;
	}

	get ordered(): boolean {
		return this.#ordered;
	}

	get maxPacketLifeTime(): number | null {
		return this.#maxPacketLifeTime;
	}

	get maxRetransmits(): number | null {
		return this.#maxRetransmits;
	}

	get label(): string {
		return this.#label;
	}

	get protocol(): string {
		return this.#protocol;
	}

	get readyState(): RTCDataChannelState {
		return this.#readyState;
	}

	get bufferedAmount(): number {
		return this.#bufferedAmount;
	}

	get bufferedAmountLowThreshold(): number {
		return this.#bufferedAmountLowThreshold;
	}

	set bufferedAmountLowThreshold(value: number) {
		this.#bufferedAmountLowThreshold = value;

		this.#channel.notify(
			'datachannel.setBufferedAmountLowThreshold',
			this.#internal,
			value
		);
	}

	get binaryType(): BinaryType {
		return this.#binaryType;
	}

	// NOTE: Just 'arraybuffer' is valid for Node.js.
	set binaryType(value: BinaryType) {
		logger.warn('binaryType setter not implemented, using "arraybuffer"');
	}

	get onopen(): ((this: RTCDataChannel, ev: Event) => void) | null {
		return this.#onopen;
	}

	set onopen(handler: ((this: RTCDataChannel, ev: Event) => void) | null) {
		if (this.#onopen) {
			this.removeEventListener('open', this.#onopen);
		}

		this.#onopen = handler;

		if (handler) {
			this.addEventListener('open', handler);
		}
	}

	get onclosing(): ((this: RTCDataChannel, ev: Event) => void) | null {
		return this.#onclosing;
	}

	set onclosing(handler: ((this: RTCDataChannel, ev: Event) => void) | null) {
		if (this.#onclosing) {
			this.removeEventListener('closing', this.#onclosing);
		}

		this.#onclosing = handler;

		if (handler) {
			this.addEventListener('closing', handler);
		}
	}

	get onclose(): ((this: RTCDataChannel, ev: Event) => void) | null {
		return this.#onclose;
	}

	set onclose(handler: ((this: RTCDataChannel, ev: Event) => void) | null) {
		if (this.#onclose) {
			this.removeEventListener('close', this.#onclose);
		}

		this.#onclose = handler;

		if (handler) {
			this.addEventListener('close', handler);
		}
	}

	get onmessage(): ((this: RTCDataChannel, ev: Event) => void) | null {
		return this.#onmessage;
	}

	set onmessage(handler: ((this: RTCDataChannel, ev: Event) => void) | null) {
		if (this.#onmessage) {
			this.removeEventListener('message', this.#onmessage);
		}

		this.#onmessage = handler;

		if (handler) {
			this.addEventListener('message', handler);
		}
	}

	get onbufferedamountlow():
		((this: RTCDataChannel, ev: Event) => void) | null {
		return this.#onbufferedamountlow;
	}

	set onbufferedamountlow(
		handler: ((this: RTCDataChannel, ev: Event) => void) | null
	) {
		if (this.#onbufferedamountlow) {
			this.removeEventListener('bufferedamountlow', this.#onbufferedamountlow);
		}

		this.#onbufferedamountlow = handler;

		if (handler) {
			this.addEventListener('bufferedamountlow', handler);
		}
	}

	get onerror(): ((this: RTCDataChannel, ev: Event) => void) | null {
		return this.#onerror;
	}

	set onerror(handler: ((this: RTCDataChannel, ev: Event) => void) | null) {
		if (this.#onerror) {
			this.removeEventListener('error', this.#onerror);
		}

		this.#onerror = handler;

		if (handler) {
			this.addEventListener('error', handler);
		}
	}

	override addEventListener<K extends keyof RTCDataChannelEventMap>(
		type: K,
		listener: (this: FakeRTCDataChannel, ev: RTCDataChannelEventMap[K]) => void,
		options?: boolean | AddEventListenerOptions
	): void {
		super.addEventListener(type, listener as EventListener, options);
	}

	override removeEventListener<K extends keyof RTCDataChannelEventMap>(
		type: K,
		listener: (this: FakeRTCDataChannel, ev: RTCDataChannelEventMap[K]) => void,
		options?: boolean | EventListenerOptions
	): void {
		super.removeEventListener(type, listener as EventListener, options);
	}

	close(): void {
		if (['closing', 'closed'].includes(this.#readyState)) {
			return;
		}

		this.#readyState = 'closed';

		// Remove notification subscriptions.
		this.#channel.removeAllListeners(this.#internal.dataChannelId);

		// Notify the worker.
		this.#channel.notify('datachannel.close', this.#internal);
	}

	/**
	 * We extend the definition of send() to allow Node Buffer. However
	 * ArrayBufferView and Blob do not exist in Node.
	 */
	send(data: string | ArrayBuffer | Buffer | ArrayBufferView | Blob): void {
		if (this.#readyState !== 'open') {
			throw new InvalidStateError('not open');
		}

		if (typeof data === 'string') {
			this.#channel.notify('datachannel.send', this.#internal, data);
		} else if (data instanceof ArrayBuffer) {
			const buffer = Buffer.from(data);

			this.#channel.notify(
				'datachannel.sendBinary',
				this.#internal,
				buffer.toString('base64')
			);
		} else if (data instanceof Buffer) {
			this.#channel.notify(
				'datachannel.sendBinary',
				this.#internal,
				data.toString('base64')
			);
		} else {
			throw new TypeError('invalid data type');
		}
	}

	private handleWorkerNotifications(): void {
		this.#channel.on(
			this.#internal.dataChannelId,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(event: string, data?: any) => {
				switch (event) {
					case 'open': {
						this.#readyState = 'open';

						this.dispatchEvent(new Event('open'));

						break;
					}

					case 'closing':
					case 'close': {
						if (this.#readyState === 'closed') {
							break;
						}

						this.#readyState = 'closed';

						// Remove notification subscriptions.
						this.#channel.removeAllListeners(this.#internal.dataChannelId);

						this.dispatchEvent(new Event('close'));

						break;
					}

					case 'message': {
						this.dispatchEvent(new MessageEvent('message', { data }));

						break;
					}

					case 'binary': {
						const buffer = Buffer.from(data, 'utf-8');
						const arrayBuffer = new ArrayBuffer(buffer.length);
						const view = new Uint8Array(arrayBuffer);

						for (let i = 0; i < buffer.length; ++i) {
							view[i] = buffer[i]!;
						}

						this.dispatchEvent(
							new MessageEvent('message', { data: arrayBuffer })
						);

						break;
					}

					case 'bufferedamountlow': {
						this.dispatchEvent(new Event('bufferedamountlow'));

						break;
					}

					case 'bufferedamount': {
						this.#bufferedAmount = data as number;

						break;
					}

					case 'error': {
						// NOTE: aiortc does not emit 'error'. In theory this should be a
						// RTCErrorEvent, but anyway.

						this.dispatchEvent(new Event('error'));

						break;
					}

					default: {
						logger.error('ignoring unknown event "%s"', event);
					}
				}
			}
		);
	}
}
