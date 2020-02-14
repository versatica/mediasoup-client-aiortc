import { EventTarget, defineEventAttribute } from 'event-target-shim';
import { Logger } from 'mediasoup-client/lib/Logger';
import { InvalidStateError } from 'mediasoup-client/lib/errors';

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
	// Other custom members.
	private _bufferedamountlowFired = false;

	constructor(
		{
			id,
			ordered = true,
			maxPacketLifeTime = null,
			maxRetransmits = null,
			label = '',
			protocol = ''
		}: FakeRTCDataChannelOptions
	)
	{
		super();

		logger.debug(`constructor() [id:${id}, ordered:${ordered}, maxPacketLifeTime:${maxPacketLifeTime}, maxRetransmits:${maxRetransmits}, label:${label}, protocol:${protocol}`);

		this._id = id;
		this._ordered = ordered;
		this._maxPacketLifeTime = maxPacketLifeTime;
		this._maxRetransmits = maxRetransmits;
		this._label = label;
		this._protocol = protocol;
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

		// TODO: Let's see if aiortc implements this.
	}

	get binaryType(): string
	{
		return this._binaryType;
	}

	set binaryType(value: string)
	{
		this._binaryType = value;

		// TODO: Let's see if aiortc implements this.
	}

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
		// NOTE: We do not use readyState 'closing'.

		if ([ 'closing', 'closed' ].includes(this._readyState))
			return;

		this._readyState = 'closed';

		// Notify the handler so it will close the aiortc's RTCDataChannel.
		this.dispatchEvent({ type: '@close' });
	}

	/**
	 * We extend the definition of send() to allow Node Buffer.
	 */
	send(data: string | Blob | ArrayBuffer | ArrayBufferView | Buffer): void
	{
		if (this._readyState !== 'open')
			throw new InvalidStateError('not open');

		// Notify the handler so it will send the data.
		this.dispatchEvent({ type: '@send', data } as MessageEvent);
	}

	/**
	 * Custom method to tell the FakeRTCDataChannel that readyState has changed
	 * in the aiortc's RTCDataChannel.
	 */
	setReadyState(readyState: RTCDataChannelState): void
	{
		const previousReadyState = this._readyState;

		this._readyState = readyState;

		// Dispatch event if needed.
		if (this._readyState !== previousReadyState)
		{
			switch (this._readyState)
			{
				case 'open':
					this.dispatchEvent({ type: 'open' });
					break;
				case 'closing':
					this.dispatchEvent({ type: 'closing' });
					break;
				case 'closed':
					this.dispatchEvent({ type: 'close' });
					break;
			}
		}

		// Dispatch 'bufferedamountlow' if needed.
		if (
			!this._bufferedamountlowFired &&
			this._bufferedAmount < this._bufferedAmountLowThreshold
		)
		{
			this._bufferedamountlowFired = true;
			this.dispatchEvent({ type: 'bufferedamountlow' });
		}
		else if (
			this._bufferedamountlowFired &&
			this._bufferedAmount >= this._bufferedAmountLowThreshold
		)
		{
			this._bufferedamountlowFired = false;
		}
	}

	/**
	 * Custom method to tell the FakeRTCDataChannel that a message has been
	 * received from the remote.
	 */
	receiveMessage(data: string | Blob | ArrayBuffer | ArrayBufferView | Buffer): void
	{
		// Dispatch 'message' event.
		this.dispatchEvent({ type: 'message', data } as MessageEvent);
	}

	/**
	 * Custom method to tell the FakeRTCDataChannel that bufferedAmount has
	 * changed in the aiortc's RTCDataChannel.
	 */
	setBufferedAmount(value: number): void
	{
		this._bufferedAmount = value;

		// Dispatch 'bufferedamountlow' if needed.
		if (
			!this._bufferedamountlowFired &&
			this._bufferedAmount < this._bufferedAmountLowThreshold
		)
		{
			this._bufferedamountlowFired = true;
			this.dispatchEvent({ type: 'bufferedamountlow' });
		}
		else if (
			this._bufferedamountlowFired &&
			this._bufferedAmount >= this._bufferedAmountLowThreshold
		)
		{
			this._bufferedamountlowFired = false;
		}
	}
}

// Define EventTarget properties.
defineEventAttribute(FakeRTCDataChannel.prototype, 'open');
defineEventAttribute(FakeRTCDataChannel.prototype, 'closing');
defineEventAttribute(FakeRTCDataChannel.prototype, 'close');
defineEventAttribute(FakeRTCDataChannel.prototype, 'message');
defineEventAttribute(FakeRTCDataChannel.prototype, 'bufferedamountlow');
defineEventAttribute(FakeRTCDataChannel.prototype, 'error');
// Custom event to notify the handler.
defineEventAttribute(FakeRTCDataChannel.prototype, '@send');
defineEventAttribute(FakeRTCDataChannel.prototype, '@close');
