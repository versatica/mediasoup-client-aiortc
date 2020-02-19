import { EventTarget, defineEventAttribute } from 'event-target-shim';
import { Logger } from 'mediasoup-client/lib/Logger';
import { InvalidStateError } from 'mediasoup-client/lib/errors';
import { Channel } from './Channel';

const logger = new Logger('aiortc:FakeRTCDataChannel');

export type FakeRTCDataChannelOptions =
{
	id: number;
	ordered?: boolean;
	maxPacketLifeTime?: number | null;
	maxRetransmits?: number | null;
	label?: string;
	protocol?: string;
};

export class FakeRTCDataChannel extends EventTarget implements RTCDataChannel
{
	// Internal data
	private readonly _internal: { dataChannelId: string };
	// Channel.
	private readonly _channel: Channel;
	// Members for RTCDataChannel standard public getters/setters.
	private _id: number;
	private _negotiated = true; // mediasoup just uses negotiated DataChannels.
	private _ordered: boolean;
	private _maxPacketLifeTime: number | null;
	private _maxRetransmits: number | null;
	private _label: string;
	private _protocol: string;
	private _readyState: RTCDataChannelState = 'connecting';
	private _bufferedAmount = 0;
	private _bufferedAmountLowThreshold = 0;
	private _binaryType = 'arraybuffer';
	// NOTE: Deprecated as per spec, but still required by TS/ RTCDataChannel.
	private _priority: RTCPriorityType = 'high';
	// NOTE: Event listeners. These are cosmetic public members to make TS happy.
	// They are overrided at the bottom with defineEventAttribute().
	public onopen: (this: RTCDataChannel, ev: Event) => any;
	public onclosing: (this: RTCDataChannel, ev: Event) => any;
	public onclose: (this: RTCDataChannel, ev: Event) => any;
	public onmessage: (this: RTCDataChannel, ev: MessageEvent) => any;
	public onbufferedamountlow: (this: RTCDataChannel, ev: Event) => any;
	// NOTE: onerror not used.
	public onerror: (this: RTCDataChannel, ev: RTCErrorEvent) => any;

	constructor(
		internal:
		{
			dataChannelId: string;
		},
		channel: Channel,
		{
			id,
			ordered = true,
			maxPacketLifeTime = null,
			maxRetransmits = null,
			label = '',
			protocol = ''
		}: FakeRTCDataChannelOptions,
		status:
		{
			readyState: RTCDataChannelState;
			bufferedAmount: number;
			bufferedAmountLowThreshold: number;
		}
	)
	{
		super();

		logger.debug(`constructor() [id:${id}, ordered:${ordered}, maxPacketLifeTime:${maxPacketLifeTime}, maxRetransmits:${maxRetransmits}, label:${label}, protocol:${protocol}`);

		this._internal = internal;
		this._channel = channel;
		this._id = id;
		this._ordered = ordered;
		this._maxPacketLifeTime = maxPacketLifeTime;
		this._maxRetransmits = maxRetransmits;
		this._label = label;
		this._protocol = protocol;
		this._readyState = status.readyState;
		this._bufferedAmount = status.bufferedAmount;
		this._bufferedAmountLowThreshold = status.bufferedAmountLowThreshold;

		this._handleWorkerNotifications();
	}

	get id(): number
	{
		return this._id;
	}

	get negotiated(): boolean
	{
		return this._negotiated;
	}

	get ordered(): boolean
	{
		return this._ordered;
	}

	get maxPacketLifeTime(): number | null
	{
		return this._maxPacketLifeTime;
	}

	get maxRetransmits(): number | null
	{
		return this._maxRetransmits;
	}

	get label(): string
	{
		return this._label;
	}

	get protocol(): string
	{
		return this._protocol;
	}

	get readyState(): RTCDataChannelState
	{
		return this._readyState;
	}

	// TODO: This always returns 0.
	get bufferedAmount(): number
	{
		return this._bufferedAmount;
	}

	get bufferedAmountLowThreshold(): number
	{
		return this._bufferedAmountLowThreshold;
	}

	set bufferedAmountLowThreshold(value: number)
	{
		this._bufferedAmountLowThreshold = value;

		this._channel.notify(
			'datachannel.setBufferedAmountLowThreshold', this._internal, value);
	}

	get binaryType(): string
	{
		return this._binaryType;
	}

	// NOTE: Just 'arraybuffer' is valid for Node.js.
	set binaryType(value: string)
	{
		logger.warn('binaryType setter not implemented, using "arraybuffer"');
	}

	// NOTE: Deprecated in the spec but required by RTCDataChannel TS definition.
	get priority(): RTCPriorityType
	{
		return this._priority;
	}

	set priority(value: RTCPriorityType)
	{
		this._priority = value;
	}

	close(): void
	{
		if ([ 'closing', 'closed' ].includes(this._readyState))
			return;

		this._readyState = 'closed';

		// Remove notification subscriptions.
		this._channel.removeAllListeners(this._internal.dataChannelId);

		this._channel.notify('datachannel.close', this._internal);
	}

	/**
	 * We extend the definition of send() to allow Node Buffer. However
	 * ArrayBufferView and Blob do not exist in Node.
	 */
	send(data: string | ArrayBuffer | Buffer | ArrayBufferView | Blob): void
	{
		if (this._readyState !== 'open')
			throw new InvalidStateError('not open');

		if (typeof data === 'string')
		{
			this._channel.notify('datachannel.send', this._internal, data);
		}
		else if (data instanceof ArrayBuffer)
		{
			const buffer = new Buffer(data);

			this._channel.notify(
				'datachannel.sendBinary', this._internal, buffer.toString('base64'));
		}
		else if (data instanceof Buffer)
		{
			this._channel.notify(
				'datachannel.sendBinary', this._internal, data.toString('base64'));
		}
		else
		{
			throw new TypeError('invalid data type');
		}
	}

	private _handleWorkerNotifications(): void
	{
		this._channel.on(this._internal.dataChannelId, (event: string, data?: any) =>
		{
			switch (event)
			{
				case 'open':
				{
					this._readyState = 'open';

					this.dispatchEvent({ type: 'open' });

					break;
				}

				case 'closing':
				case 'close':
				{
					if (this._readyState === 'closed')
						break;

					this._readyState = 'closed';

					// Remove notification subscriptions.
					this._channel.removeAllListeners(this._internal.dataChannelId);

					this.dispatchEvent({ type: 'close' });

					break;
				}

				case 'message':
				{
					this.dispatchEvent({ type: 'message', data });

					break;
				}

				case 'binary':
				{
					const buffer = new Buffer(data, 'utf-8');
					const arrayBuffer = new ArrayBuffer(buffer.length);
					const view = new Uint8Array(arrayBuffer);

					for (let i = 0; i < buffer.length; ++i)
					{
						view[i] = buffer[i];
					}

					this.dispatchEvent({ type: 'message', data: arrayBuffer });

					break;
				}

				case 'bufferedamountlow':
				{
					this.dispatchEvent({ type: 'bufferedamountlow' });

					break;
				}

				case 'bufferedamount':
				{
					// TODO: We should periodically (or triggered by X) this event in
					// Python side to update it in JS.

					this._bufferedAmount = data as number;

					break;
				}

				case 'error':
				{
					// NOTE: aiortc does not emit 'error'. In theory this should be a
					// RTCErrorEvent, but anyway.

					this.dispatchEvent({ type: 'error' });

					break;
				}

				default:
				{
					logger.error('ignoring unknown event "%s"', event);
				}
			}
		});
	}
}

// Define EventTarget properties.
defineEventAttribute(FakeRTCDataChannel.prototype, 'open');
defineEventAttribute(FakeRTCDataChannel.prototype, 'closing');
defineEventAttribute(FakeRTCDataChannel.prototype, 'close');
defineEventAttribute(FakeRTCDataChannel.prototype, 'message');
defineEventAttribute(FakeRTCDataChannel.prototype, 'bufferedamountlow');
defineEventAttribute(FakeRTCDataChannel.prototype, 'error');
