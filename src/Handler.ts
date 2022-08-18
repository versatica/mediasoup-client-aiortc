import { v4 as uuidv4 } from 'uuid';
import * as sdpTransform from 'sdp-transform';
import { FakeMediaStreamTrack } from 'fake-mediastreamtrack';
import { Logger } from 'mediasoup-client/lib/Logger';
import { UnsupportedError } from 'mediasoup-client/lib/errors';
import * as utils from 'mediasoup-client/lib/utils';
import * as ortc from 'mediasoup-client/lib/ortc';
import * as sdpCommonUtils from 'mediasoup-client/lib/handlers/sdp/commonUtils';
import * as sdpUnifiedPlanUtils from 'mediasoup-client/lib/handlers/sdp/unifiedPlanUtils';
import {
	HandlerInterface,
	HandlerRunOptions,
	HandlerSendOptions,
	HandlerSendResult,
	HandlerReceiveOptions,
	HandlerReceiveResult,
	HandlerSendDataChannelOptions,
	HandlerSendDataChannelResult,
	HandlerReceiveDataChannelOptions,
	HandlerReceiveDataChannelResult
} from 'mediasoup-client/lib/handlers/HandlerInterface';
import { RemoteSdp } from 'mediasoup-client/lib/handlers/sdp/RemoteSdp';
import {
	IceParameters,
	DtlsRole,
	RtpCapabilities,
	RtpParameters,
	SctpCapabilities,
	SctpStreamParameters
} from 'mediasoup-client/lib/types';
import { Channel } from './Channel';
import { FakeRTCStatsReport } from './FakeRTCStatsReport';
import { FakeRTCDataChannel } from './FakeRTCDataChannel';

const logger = new Logger('aiortc:Handler');

const SCTP_NUM_STREAMS = { OS: 65535, MIS: 65535 };

export class Handler extends HandlerInterface
{
	// Internal data.
	private readonly _internal: { handlerId: string };
	// Channel instance.
	private readonly _channel: Channel;
	// Closed flag.
	private _closed = false;
	// Running flag. It means that the handler has been told to the worker.
	private _running = false;
	// Handler direction.
	private _direction: 'send' | 'recv';
	// Remote SDP handler.
	private _remoteSdp: RemoteSdp;
	// Generic sending RTP parameters for audio and video.
	private _sendingRtpParametersByKind: { [key: string]: RtpParameters };
	// Generic sending RTP parameters for audio and video suitable for the SDP
	// remote answer.
	private _sendingRemoteRtpParametersByKind: { [key: string]: RtpParameters };
	// Map of sending and receiving tracks indexed by localId.
	private readonly _mapLocalIdTracks: Map<string, FakeMediaStreamTrack> = new Map();
	// Map of MID indexed by local ids.
	private readonly _mapLocalIdMid: Map<string, string> = new Map();
	// Got transport local and remote parameters.
	private _transportReady = false;
	// Whether a DataChannel m=application section has been created.
	private _hasDataChannelMediaSection = false;
	// Next DataChannel id.
	private _nextSendSctpStreamId = 0;

	/**
	 * Addicional events.
	 *
	 * @emits @close
	 */
	constructor(
		{
			internal,
			channel
		}:
		{
			internal: { handlerId: string };
			channel: Channel;
		}
	)
	{
		super();

		this._internal = internal;
		this._channel = channel;
	}

	get closed(): boolean
	{
		return this._closed;
	}

	get name(): string
	{
		return 'Aiortc';
	}

	close(): void
	{
		logger.debug('close()');

		if (this._closed)
			return;

		this._closed = true;

		// Deregister sending tracks events and emit 'ended' in remote tracks.
		for (const track of this._mapLocalIdTracks.values())
		{
			if (track.data.remote)
				track.remoteStop();
		}

		// Remove notification subscriptions.
		this._channel.removeAllListeners(this._internal.handlerId);

		// If running notify the worker.
		if (this._running)
			this._channel.notify('handler.close', this._internal);

		// Tell the parent.
		this.emit('@close');
	}

	async getNativeRtpCapabilities(): Promise<RtpCapabilities>
	{
		logger.debug('getNativeRtpCapabilities()');

		const sdp = await this._channel.request('getRtpCapabilities');

		const sdpObject = sdpTransform.parse(sdp);
		const caps = sdpCommonUtils.extractRtpCapabilities({ sdpObject });

		return caps;
	}

	async getNativeSctpCapabilities(): Promise<SctpCapabilities>
	{
		logger.debug('getNativeSctpCapabilities()');

		return {
			numStreams : SCTP_NUM_STREAMS
		};
	}

	run(
		{
			direction,
			iceParameters,
			iceCandidates,
			dtlsParameters,
			sctpParameters,
			iceServers,
			iceTransportPolicy, // eslint-disable-line @typescript-eslint/no-unused-vars
			additionalSettings, // eslint-disable-line @typescript-eslint/no-unused-vars
			proprietaryConstraints, // eslint-disable-line @typescript-eslint/no-unused-vars
			extendedRtpCapabilities
		}: HandlerRunOptions
	): void
	{
		logger.debug('run()');

		this._direction = direction;

		// aiortc only supports "sha-256" hash algorithm.
		dtlsParameters.fingerprints = dtlsParameters.fingerprints.filter((f) => f.algorithm ==='sha-256');

		this._remoteSdp = new RemoteSdp(
			{
				iceParameters,
				iceCandidates,
				dtlsParameters,
				sctpParameters
			});

		this._sendingRtpParametersByKind =
		{
			audio : ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
			video : ortc.getSendingRtpParameters('video', extendedRtpCapabilities)
		};

		this._sendingRemoteRtpParametersByKind =
		{
			audio : ortc.getSendingRemoteRtpParameters('audio', extendedRtpCapabilities),
			video : ortc.getSendingRemoteRtpParameters('video', extendedRtpCapabilities)
		};

		const options =
		{
			rtcConfiguration : { iceServers }
		};

		// Notify the worker so it will create a handler.
		this._channel.request('createHandler', this._internal, options)
			.catch((error) =>
			{
				logger.error(`handler creation in the worker failed: ${error}`);

				this.close();
			});

		// Set the running flag.
		this._running = true;

		this._handleWorkerNotifications();
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async updateIceServers(iceServers: RTCIceServer[]): Promise<void>
	{
		throw new UnsupportedError('not implemented');
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async restartIce(iceParameters: IceParameters): Promise<void>
	{
		throw new UnsupportedError('not implemented');
	}

	async getTransportStats(): Promise<FakeRTCStatsReport>
	{
		const data = await this._channel.request(
			'handler.getTransportStats', this._internal);

		return new FakeRTCStatsReport(data);
	}

	async send(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		{ track, encodings, codecOptions, codec }: HandlerSendOptions
	): Promise<HandlerSendResult>
	{
		this._assertSendDirection();

		logger.debug(
			'send() [kind:%s, track.id:%s, track.data:%o]',
			track.kind, track.id, (track as FakeMediaStreamTrack).data);

		const localId = track.id;
		const kind = track.kind;
		const { playerId, remote } = (track as FakeMediaStreamTrack).data;

		if (playerId)
		{
			await this._channel.request(
				'handler.addTrack', this._internal, { localId, playerId, kind });
		}
		else if (remote)
		{
			await this._channel.request(
				'handler.addTrack',
				this._internal,
				{ localId, recvTrackId: track.id, kind });
		}
		else
		{
			throw new TypeError(
				'invalid track, missing data.playerId or data.remote');
		}

		const sendingRtpParameters =
			utils.clone(this._sendingRtpParametersByKind[track.kind], {});

		// This may throw.
		sendingRtpParameters.codecs =
			ortc.reduceCodecs(sendingRtpParameters.codecs, codec);

		const sendingRemoteRtpParameters =
			this._sendingRemoteRtpParametersByKind[track.kind];

		// This may throw.
		sendingRemoteRtpParameters.codecs =
			ortc.reduceCodecs(sendingRemoteRtpParameters.codecs, codec);

		let offer = await this._channel.request(
			'handler.createOffer', this._internal);

		let localSdpObject = sdpTransform.parse(offer.sdp);

		if (!this._transportReady)
			await this._setupTransport({ localDtlsRole: 'server', localSdpObject });

		logger.debug(
			'send() | calling handler.setLocalDescription() [offer:%o]',
			offer);

		await this._channel.request(
			'handler.setLocalDescription',
			this._internal,
			offer as RTCSessionDescription);

		// Get the MID and the corresponding m= section.
		const mid = await this._channel.request(
			'handler.getMid', this._internal, { localId });

		offer = await this._channel.request(
			'handler.getLocalDescription', this._internal);

		localSdpObject = sdpTransform.parse(offer.sdp);

		const offerMediaObject = localSdpObject.media.find((m) => (
			String(m.mid) === String(mid)
		));

		// Set MID.
		sendingRtpParameters.mid = mid;

		// Set RTCP CNAME.
		sendingRtpParameters.rtcp.cname =
			sdpCommonUtils.getCname({ offerMediaObject });

		// Set RTP encodings by parsing the SDP offer.
		sendingRtpParameters.encodings =
			sdpUnifiedPlanUtils.getRtpEncodings({ offerMediaObject });

		this._remoteSdp.send(
			{
				offerMediaObject,
				reuseMid            : '', // May be in the future.
				offerRtpParameters  : sendingRtpParameters,
				answerRtpParameters : sendingRemoteRtpParameters,
				codecOptions,
				extmapAllowMixed    : false
			});

		const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };

		logger.debug(
			'send() | calling handler.setRemoteDescription() [answer:%o]',
			answer);

		await this._channel.request(
			'handler.setRemoteDescription',
			this._internal,
			answer as RTCSessionDescription);

		// Store the original track into our map and listen for events.
		this._mapLocalIdTracks.set(localId, track as FakeMediaStreamTrack);

		track.addEventListener('@enabledchange', () =>
		{
			// Ensure we are still sending this track.
			if (
				this._mapLocalIdTracks.get(localId) !== track ||
				track.readyState === 'ended'
			)
			{
				return;
			}

			if (track.enabled)
			{
				this._channel.notify(
					'handler.enableTrack', this._internal, { localId });
			}
			else
			{
				this._channel.notify(
					'handler.disableTrack', this._internal, { localId });
			}
		});

		// Store the MID into the map.
		this._mapLocalIdMid.set(localId, mid);

		return {
			localId,
			rtpParameters : sendingRtpParameters
		};
	}

	async stopSending(localId: string): Promise<void>
	{
		this._assertSendDirection();

		logger.debug('stopSending() [localId:%s]', localId);

		// Remove the original track from our map and its events.
		const track = this._mapLocalIdTracks.get(localId);

		if (!track)
			throw new Error('associated track not found');

		this._mapLocalIdTracks.delete(localId);

		// Remove the MID from the map.
		const mid = this._mapLocalIdMid.get(localId);

		if (!mid)
			throw new Error('associated MID not found');

		this._mapLocalIdMid.delete(localId);

		await this._channel.request(
			'handler.removeTrack', this._internal, { localId });

		this._remoteSdp.disableMediaSection(mid);

		const offer =
			await this._channel.request('handler.createOffer', this._internal);

		logger.debug(
			'stopSending() | calling handler.setLocalDescription() [offer:%o]',
			offer);

		await this._channel.request(
			'handler.setLocalDescription',
			this._internal,
			offer as RTCSessionDescription);

		const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };

		logger.debug(
			'stopSending() | calling handler.setRemoteDescription() [answer:%o]',
			answer);

		await this._channel.request(
			'handler.setRemoteDescription',
			this._internal,
			answer as RTCSessionDescription);
	}

	async pauseSending(localId: string): Promise<void>
	{
		this._assertSendDirection();

		logger.debug('pauseSending() [localId:%s]', localId);

		const track = this._mapLocalIdTracks.get(localId);

		if (!track)
			throw new Error('associated track not found');

		const mid = this._mapLocalIdMid.get(localId);

		if (!mid)
			throw new Error('associated MID not found');

		await this._channel.request(
			'handler.setTrackDirection',
			this._internal,
			{ localId, direction: 'inactive' });

		const offer = await this._channel.request('handler.createOffer', this._internal);

		logger.debug(
			'pauseSending() | calling handler.setLocalDescription() [offer:%o]',
			offer);

		await this._channel.request(
			'handler.setLocalDescription',
			this._internal,
			offer as RTCSessionDescription);

		const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };

		logger.debug(
			'pauseSending() | calling handler.setRemoteDescription() [answer:%o]',
			answer);

		await this._channel.request(
			'handler.setRemoteDescription',
			this._internal,
			answer as RTCSessionDescription);
	}

	async resumeSending(localId: string): Promise<void>
	{
		this._assertSendDirection();

		logger.debug('resumeSending() [localId:%s]', localId);

		const track = this._mapLocalIdTracks.get(localId);

		if (!track)
			throw new Error('associated track not found');

		const mid = this._mapLocalIdMid.get(localId);

		if (!mid)
			throw new Error('associated MID not found');

		await this._channel.request(
			'handler.setTrackDirection',
			this._internal,
			{ localId, direction: 'sendonly' });

		const offer = await this._channel.request('handler.createOffer', this._internal);

		logger.debug(
			'resumeSending() | calling handler.setLocalDescription() [offer:%o]',
			offer);

		await this._channel.request(
			'handler.setLocalDescription',
			this._internal,
			offer as RTCSessionDescription);

		const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };

		logger.debug(
			'stopSending() | calling handler.setRemoteDescription() [answer:%o]',
			answer);

		await this._channel.request(
			'handler.setRemoteDescription',
			this._internal,
			answer as RTCSessionDescription);
	}

	async replaceTrack(
		localId: string, track: MediaStreamTrack | null
	): Promise<void>
	{
		this._assertSendDirection();

		if (track)
		{
			logger.debug(
				'replaceTrack() [localId:%s, track.id:%s]', localId, track.id);
		}
		else
		{
			logger.debug('replaceTrack() [localId:%s, no track]', localId);

			throw new UnsupportedError(
				'replaceTrack() with null track not implemented');
		}

		const mid = this._mapLocalIdMid.get(localId);

		if (!mid)
			throw new Error('associated MID not found');

		const kind = track.kind;
		const { playerId, remote } = (track as FakeMediaStreamTrack).data;

		if (playerId)
		{
			await this._channel.request(
				'handler.replaceTrack', this._internal, { localId, playerId, kind });
		}
		else if (remote)
		{
			await this._channel.request(
				'handler.replaceTrack',
				this._internal,
				{ localId, recvTrackId: track.id, kind });
		}
		else
		{
			throw new TypeError(
				'invalid track, missing data.player or data.remote');
		}

		// Store the new original track into our map and listen for events.
		this._mapLocalIdTracks.set(localId, track as FakeMediaStreamTrack);

		track.addEventListener('@enabledchange', () =>
		{
			// Ensure we are still sending this track.
			if (
				this._mapLocalIdTracks.get(localId) !== track ||
				track.readyState === 'ended'
			)
			{
				return;
			}

			if (track.enabled)
			{
				this._channel.notify(
					'handler.enableTrack', this._internal, { localId });
			}
			else
			{
				this._channel.notify(
					'handler.disableTrack', this._internal, { localId });
			}
		});
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setMaxSpatialLayer(localId: string, spatialLayer: number): Promise<void>
	{
		throw new UnsupportedError('not implemented');
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async setRtpEncodingParameters(localId: string, params: any): Promise<void>
	{
		throw new UnsupportedError('not implemented');
	}

	async getSenderStats(localId: string): Promise<FakeRTCStatsReport>
	{
		this._assertSendDirection();

		const mid = this._mapLocalIdMid.get(localId);

		if (!mid)
			throw new Error('associated MID not found');

		const data = await this._channel.request(
			'handler.getSenderStats', this._internal, { mid });

		return new FakeRTCStatsReport(data);
	}

	async sendDataChannel(
		{
			ordered,
			maxPacketLifeTime,
			maxRetransmits,
			label,
			protocol
		}: HandlerSendDataChannelOptions
	): Promise<HandlerSendDataChannelResult>
	{
		this._assertSendDirection();

		const internal =
		{
			handlerId     : this._internal.handlerId,
			dataChannelId : uuidv4()
		};

		const options =
		{
			negotiated        : true,
			id                : this._nextSendSctpStreamId,
			ordered,
			maxPacketLifeTime : maxPacketLifeTime || null, // Important.
			maxRetransmits    : maxRetransmits || null, // Important.
			label,
			protocol
		};

		logger.debug('sendDataChannel() [options:%o]', options);

		const result = await this._channel.request(
			'handler.createDataChannel', internal, options);

		const dataChannel = new FakeRTCDataChannel(
			internal,
			this._channel,
			// options.
			{
				id                : result.streamId,
				ordered           : result.ordered,
				maxPacketLifeTime : result.maxPacketLifeTime,
				maxRetransmits    : result.maxRetransmits,
				label             : result.label,
				protocol          : result.protocol
			},
			// status.
			{
				readyState                 : result.readyState,
				bufferedAmount             : result.bufferedAmount,
				bufferedAmountLowThreshold : result.bufferedAmountLowThreshold
			}
		);

		// Increase next id.
		this._nextSendSctpStreamId =
			++this._nextSendSctpStreamId % SCTP_NUM_STREAMS.MIS;

		// If this is the first DataChannel we need to create the SDP answer with
		// m=application section.
		if (!this._hasDataChannelMediaSection)
		{
			const offer = await this._channel.request(
				'handler.createOffer', this._internal);

			const localSdpObject = sdpTransform.parse(offer.sdp);
			const offerMediaObject = localSdpObject.media
				.find((m: any) => m.type === 'application');

			if (!this._transportReady)
				await this._setupTransport({ localDtlsRole: 'server', localSdpObject });

			logger.debug(
				'sendDataChannel() | calling handler.setLocalDescription() [offer:%o]',
				offer);

			await this._channel.request(
				'handler.setLocalDescription',
				this._internal,
				offer as RTCSessionDescription);

			this._remoteSdp.sendSctpAssociation({ offerMediaObject });

			const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };

			logger.debug(
				'sendDataChannel() | calling handler.setRemoteDescription() [answer:%o]',
				answer);

			await this._channel.request(
				'handler.setRemoteDescription',
				this._internal,
				answer as RTCSessionDescription);

			this._hasDataChannelMediaSection = true;
		}

		const sctpStreamParameters: SctpStreamParameters =
		{
			streamId          : result.streamId,
			ordered           : result.ordered,
			maxPacketLifeTime : result.maxPacketLifeTime || undefined,
			maxRetransmits    : result.maxRetransmits || undefined
		};

		return { dataChannel, sctpStreamParameters };
	}

	async receive(optionsList: HandlerReceiveOptions[]): Promise<HandlerReceiveResult[]>
	{
		this._assertRecvDirection();

		const results: HandlerReceiveResult[] = [];
		const mapLocalId: Map<string, string> = new Map();

		for (const options of optionsList)
		{
			const { trackId, kind, rtpParameters } = options;

			logger.debug('receive() [trackId:%s, kind:%s]', trackId, kind);

			const localId = rtpParameters.mid || String(this._mapLocalIdMid.size);

			mapLocalId.set(trackId, localId);

			this._remoteSdp!.receive(
				{
					mid                : localId,
					kind,
					offerRtpParameters : rtpParameters,
					streamId           : rtpParameters.rtcp!.cname!,
					trackId
				});
		}

		const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };

		logger.debug(
			'receive() | calling handler.setRemoteDescription() [offer:%o]',
			offer);

		await this._channel.request(
			'handler.setRemoteDescription',
			this._internal,
			offer as RTCSessionDescription);

		let answer = await this._channel.request(
			'handler.createAnswer', this._internal);

		const localSdpObject = sdpTransform.parse(answer.sdp);

		for (const options of optionsList)
		{
			const { trackId, rtpParameters } = options;
			const localId = mapLocalId.get(trackId);
			const answerMediaObject = localSdpObject.media
				.find((m: any) => String(m.mid) === localId);

			// May need to modify codec parameters in the answer based on codec
			// parameters in the offer.
			sdpCommonUtils.applyCodecParameters(
				{
					offerRtpParameters : rtpParameters,
					answerMediaObject
				});
		}

		answer =
		{
			type : 'answer',
			sdp  : sdpTransform.write(localSdpObject)
		} as RTCSessionDescription;

		if (!this._transportReady)
			await this._setupTransport({ localDtlsRole: 'client', localSdpObject });

		logger.debug(
			'receive() | calling handler.setLocalDescription() [answer:%o]',
			answer);

		await this._channel.request(
			'handler.setLocalDescription',
			this._internal,
			answer as RTCSessionDescription);

		// Create fake remote tracks to be returned.
		for (const options of optionsList)
		{
			const { trackId, kind } = options;
			const localId = mapLocalId.get(trackId);

			const track = new FakeMediaStreamTrack(
				{
					kind,
					id   : trackId,
					data : { remote: true } // This let's us know that this is remote.
				});

			// Store the remote track into the map.
			this._mapLocalIdTracks.set(localId, track);

			// Store the MID into the map.
			this._mapLocalIdMid.set(localId, localId);

			results.push({ localId,	track });
		}

		return results;
	}

	async stopReceiving(localIds: string[]): Promise<void>
	{
		this._assertRecvDirection();

		for (const localId of localIds)
		{
			logger.debug('stopReceiving() [localId:%s]', localId);

			// Remove the remote track from the map and make it emit 'ended'.
			const track = this._mapLocalIdTracks.get(localId);

			if (!track)
				throw new Error('associated track not found');

			this._mapLocalIdTracks.delete(localId);
			track.remoteStop();

			const mid = this._mapLocalIdMid.get(localId);

			if (!mid)
				throw new Error('associated MID not found');

			this._remoteSdp.closeMediaSection(mid);
		}

		const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };

		logger.debug(
			'stopReceiving() | calling handler.setRemoteDescription() [offer:%o]',
			offer);

		await this._channel.request(
			'handler.setRemoteDescription',
			this._internal,
			offer as RTCSessionDescription);

		const answer = await this._channel.request(
			'handler.createAnswer', this._internal);

		logger.debug(
			'stopReceiving() | calling handler.setLocalDescription() [answer:%o]',
			answer);

		await this._channel.request(
			'handler.setLocalDescription',
			this._internal,
			answer as RTCSessionDescription);
	}

	async pauseReceiving(localIds: string[]): Promise<void>
	{
		this._assertRecvDirection();

		for (const localId of localIds)
		{
			logger.debug('pauseReceiving() [localId:%s]', localId);

			const track = this._mapLocalIdTracks.get(localId);

			if (!track)
				throw new Error('associated track not found');

			const mid = this._mapLocalIdMid.get(localId);

			if (!mid)
				throw new Error('associated MID not found');

			await this._channel.request(
				'handler.setTrackDirection',
				this._internal,
				{ localId, direction: 'inactive' });
		}

		const offer = await this._channel.request('handler.createOffer', this._internal);

		logger.debug(
			'pauseReceiving() | calling handler.setRemoteDescription() [offer:%o]',
			offer);

		await this._channel.request(
			'handler.setRemoteDescription',
			this._internal,
			offer as RTCSessionDescription);

		const answer = await this._channel.request(
			'handler.createAnswer', this._internal);

		logger.debug(
			'pauseReceiving() | calling handler.setLocalDescription() [answer:%o]',
			answer);

		await this._channel.request(
			'handler.setLocalDescription',
			this._internal,
			answer as RTCSessionDescription);
	}

	async resumeReceiving(localIds: string[]): Promise<void>
	{
		this._assertRecvDirection();

		for (const localId of localIds)
		{
			logger.debug('pauseReceiving() [localId:%s]', localId);

			const track = this._mapLocalIdTracks.get(localId);

			if (!track)
				throw new Error('associated track not found');

			const mid = this._mapLocalIdMid.get(localId);

			if (!mid)
				throw new Error('associated MID not found');

			await this._channel.request(
				'handler.setTrackDirection',
				this._internal,
				{ localId, direction: 'recvonly' });
		}

		const offer = await this._channel.request('handler.createOffer', this._internal);

		logger.debug(
			'resumeReceiving() | calling handler.setRemoteDescription() [offer:%o]',
			offer);

		await this._channel.request(
			'handler.setRemoteDescription',
			this._internal,
			offer as RTCSessionDescription);

		const answer = await this._channel.request(
			'handler.createAnswer', this._internal);

		logger.debug(
			'resumeReceiving() | calling handler.setLocalDescription() [answer:%o]',
			answer);

		await this._channel.request(
			'handler.setLocalDescription',
			this._internal,
			answer as RTCSessionDescription);
	}

	async getReceiverStats(localId: string): Promise<FakeRTCStatsReport>
	{
		this._assertRecvDirection();

		const mid = this._mapLocalIdMid.get(localId);

		if (!mid)
			throw new Error('associated MID not found');

		const data = await this._channel.request(
			'handler.getReceiverStats', this._internal, { mid });

		return new FakeRTCStatsReport(data);
	}

	async receiveDataChannel(
		{ sctpStreamParameters, label, protocol }: HandlerReceiveDataChannelOptions
	): Promise<HandlerReceiveDataChannelResult>
	{
		this._assertRecvDirection();

		const {
			streamId,
			ordered,
			maxPacketLifeTime,
			maxRetransmits
		}: SctpStreamParameters = sctpStreamParameters;

		const internal =
		{
			handlerId     : this._internal.handlerId,
			dataChannelId : uuidv4()
		};

		const options =
		{
			negotiated        : true,
			id                : streamId,
			ordered,
			maxPacketLifeTime : maxPacketLifeTime || null, // Important.
			maxRetransmits    : maxRetransmits || null, // Important.
			label,
			protocol
		};

		logger.debug('receiveDataChannel() [options:%o]', options);

		const result = await this._channel.request(
			'handler.createDataChannel', internal, options);

		const dataChannel = new FakeRTCDataChannel(
			internal,
			this._channel,
			// options.
			{
				id                : result.streamId,
				ordered           : result.ordered,
				maxPacketLifeTime : result.maxPacketLifeTime,
				maxRetransmits    : result.maxRetransmits,
				label             : result.label,
				protocol          : result.protocol
			},
			// status.
			{
				readyState                 : result.readyState,
				bufferedAmount             : result.bufferedAmount,
				bufferedAmountLowThreshold : result.bufferedAmountLowThreshold
			}
		);

		// If this is the first DataChannel we need to create the SDP offer with
		// m=application section.
		if (!this._hasDataChannelMediaSection)
		{
			this._remoteSdp.receiveSctpAssociation();

			const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };

			logger.debug(
				'receiveDataChannel() | calling handler.setRemoteDescription() [offer:%o]',
				offer);

			await this._channel.request(
				'handler.setRemoteDescription',
				this._internal,
				offer as RTCSessionDescription);

			const answer = await this._channel.request(
				'handler.createAnswer', this._internal);

			if (!this._transportReady)
			{
				const localSdpObject = sdpTransform.parse(answer.sdp);

				await this._setupTransport({ localDtlsRole: 'client', localSdpObject });
			}

			logger.debug(
				'receiveDataChannel() | calling handler.setRemoteDescription() [answer:%o]',
				answer);

			await this._channel.request(
				'handler.setLocalDescription',
				this._internal,
				answer as RTCSessionDescription);

			this._hasDataChannelMediaSection = true;
		}

		return { dataChannel };
	}

	private async _setupTransport(
		{
			localDtlsRole,
			localSdpObject
		}:
		{
			localDtlsRole: DtlsRole;
			localSdpObject?: any;
		}
	): Promise<void>
	{
		if (!localSdpObject)
		{
			const offer = await this._channel.request(
				'handler.getLocalDescription', this._internal);

			localSdpObject = sdpTransform.parse(offer.sdp);
		}

		// Get our local DTLS parameters.
		const dtlsParameters =
			sdpCommonUtils.extractDtlsParameters({ sdpObject: localSdpObject });

		// Set our DTLS role.
		dtlsParameters.role = localDtlsRole;

		// Update the remote DTLS role in the SDP.
		this._remoteSdp.updateDtlsRole(
			localDtlsRole === 'client' ? 'server' : 'client');

		// Need to tell the remote transport about our parameters.
		await new Promise<void>((resolve, reject) =>
		{
			this.safeEmit(
				'@connect',
				{ dtlsParameters },
				resolve,
				reject
			);
		});

		this._transportReady = true;
	}

	private _assertSendDirection(): void
	{
		if (this._direction !== 'send')
		{
			throw new Error(
				'method can just be called for handlers with "send" direction');
		}
	}

	private _assertRecvDirection(): void
	{
		if (this._direction !== 'recv')
		{
			throw new Error(
				'method can just be called for handlers with "recv" direction');
		}
	}

	private _handleWorkerNotifications(): void
	{
		this._channel.on(this._internal.handlerId, (event: string, data?: any) =>
		{
			switch (event)
			{
				case 'signalingstatechange':
				{
					// Do nothing.

					break;
				}

				case 'icegatheringstatechange':
				{
					// Do nothing.

					break;
				}

				case 'iceconnectionstatechange':
				{
					const state = data as RTCIceConnectionState;

					switch (state)
					{
						case 'checking':
							this.emit('@connectionstatechange', 'connecting');
							break;
						case 'connected':
						case 'completed':
							this.emit('@connectionstatechange', 'connected');
							break;
						case 'failed':
							this.emit('@connectionstatechange', 'failed');
							break;
						case 'disconnected':
							this.emit('@connectionstatechange', 'disconnected');
							break;
						case 'closed':
							this.emit('@connectionstatechange', 'closed');
							break;
					}

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
