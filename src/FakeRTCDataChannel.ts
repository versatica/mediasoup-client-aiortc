import {
	EventTarget,
	Event,
	getEventAttributeValue,
	setEventAttributeValue,
} from 'event-target-shim';
import { InvalidStateError } from 'mediasoup-client/lib/errors';
import { Logger } from './Logger';
import { Channel } from './Channel';

const logger = new Logger('FakeRTCDataChannel');

export type FakeRTCDataChannelOptions = {
	id: number;
	ordered?: boolean;
	maxPacketLifeTime?: number | null;
	maxRetransmits?: number | null;
	label?: string;
	protocol?: string;
};

// TODO: https://github.com/versatica/mediasoup-client-aiortc/issues/24
// @ts-ignore
export class FakeRTCDataChannel extends EventTarget implements RTCDataChannel {
	// Internal data.
	readonly #internal: { handlerId: string; dataChannelId: string };
	// Channel.
	readonly #channel: Channel;
	// Members for RTCDataChannel standard public getters/setters.
	#id: number;
	#negotiated = true; // mediasoup just uses negotiated DataChannels.
	#ordered: boolean;
	#maxPacketLifeTime: number | null;
	#maxRetransmits: number | null;
	#label: string;
	#protocol: string;
	#readyState: RTCDataChannelState = 'connecting';
	#bufferedAmount = 0;
	#bufferedAmountLowThreshold = 0;
	#binaryType: BinaryType = 'arraybuffer';
	// NOTE: Deprecated as per spec, but still required by TS/ RTCDataChannel.
	#priority: RTCPriorityType = 'high';

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

	// NOTE: Deprecated in the spec but required by RTCDataChannel TS definition.
	get priority(): RTCPriorityType {
		return this.#priority;
	}

	set priority(value: RTCPriorityType) {
		this.#priority = value;
	}

	get onopen(): any {
		return getEventAttributeValue(this, 'open');
	}

	set onopen(listener) {
		setEventAttributeValue(this, 'open', listener);
	}

	get onclosing(): any {
		return getEventAttributeValue(this, 'closing');
	}

	set onclosing(listener) {
		setEventAttributeValue(this, 'closing', listener);
	}

	get onclose(): any {
		return getEventAttributeValue(this, 'close');
	}

	set onclose(listener) {
		setEventAttributeValue(this, 'close', listener);
	}

	get onmessage(): any {
		return getEventAttributeValue(this, 'message');
	}

	set onmessage(listener) {
		setEventAttributeValue(this, 'message', listener);
	}

	get onbufferedamountlow(): any {
		return getEventAttributeValue(this, 'bufferedamountlow');
	}

	set onbufferedamountlow(listener) {
		setEventAttributeValue(this, 'bufferedamountlow', listener);
	}

	get onerror(): any {
		return getEventAttributeValue(this, 'error');
	}

	set onerror(listener) {
		setEventAttributeValue(this, 'error', listener);
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
						// @ts-ignore
						this.dispatchEvent(new MessageEvent('message', { data }));

						break;
					}

					case 'binary': {
						const buffer = Buffer.from(data, 'utf-8');
						const arrayBuffer = new ArrayBuffer(buffer.length);
						const view = new Uint8Array(arrayBuffer);

						for (let i = 0; i < buffer.length; ++i) {
							view[i] = buffer[i];
						}

						this.dispatchEvent(
							// @ts-ignore
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
