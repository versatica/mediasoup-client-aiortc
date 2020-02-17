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
	private _binaryType = 'blob';
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

	set binaryType(value: string)
	{
		this._binaryType = value;

		// TODO: Let's see how to deal with this. aiortc does not implement this
		// since this just makes sense in JS. We should use this setting when
		// 'message' event is fired (we should generate a "Blob" if "blob" and an
		// ArrayBuffer if "arraybuffer").
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
	 * We extend the definition of send() to allow Node Buffer.
	 */
	send(data: string | Blob | ArrayBuffer | ArrayBufferView | Buffer): void
	{
		if (this._readyState !== 'open')
			throw new InvalidStateError('not open');

		this._channel.notify('datachannel.send', this._internal, data);
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
					// TODO: Must handle binary messages and produce a Blob or an
					// ArrayBuffer depending on this._binaryType.

					this.dispatchEvent({ type: 'message', data });

					break;
				}

				case 'bufferedamountlow':
				{
					this.dispatchEvent({ type: 'bufferedamountlow' });

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
