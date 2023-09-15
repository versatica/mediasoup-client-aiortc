import { v4 as uuidv4 } from 'uuid';
import * as sdpTransform from 'sdp-transform';
import { FakeMediaStreamTrack } from 'fake-mediastreamtrack';
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
import { Logger } from './Logger';
import { Channel } from './Channel';
import { FakeRTCStatsReport } from './FakeRTCStatsReport';
import { FakeRTCDataChannel } from './FakeRTCDataChannel';

const logger = new Logger('Handler');

const SCTP_NUM_STREAMS = { OS: 65535, MIS: 65535 };

export class Handler extends HandlerInterface
{
	// Internal data.
	readonly #internal: { handlerId: string };
	// Channel instance.
	readonly #channel: Channel;
	// Closed flag.
	#closed = false;
	// Running flag. It means that the handler has been told to the worker.
	#running = false;
	// Handler direction.
	#direction?: 'send' | 'recv';
	// Remote SDP handler.
	#remoteSdp?: RemoteSdp;
	// Generic sending RTP parameters for audio and video.
	#sendingRtpParametersByKind?: { [key: string]: RtpParameters };
	// Generic sending RTP parameters for audio and video suitable for the SDP
	// remote answer.
	#sendingRemoteRtpParametersByKind?: { [key: string]: RtpParameters };
	// Map of sending and receiving tracks indexed by localId.
	readonly #mapLocalIdTracks: Map<string, FakeMediaStreamTrack> = new Map();
	// Map of MID indexed by local ids.
	readonly #mapLocalIdMid: Map<string, string> = new Map();
	// Got transport local and remote parameters.
	#transportReady = false;
	// Whether a DataChannel m=application section has been created.
	#hasDataChannelMediaSection = false;
	// Next DataChannel id.
	#nextSendSctpStreamId = 0;

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

		this.#internal = internal;
		this.#channel = channel;
	}

	get closed(): boolean
	{
		return this.#closed;
	}

	get name(): string
	{
		return 'Aiortc';
	}

	close(): void
	{
		logger.debug('close()');

		if (this.#closed)
		{
			return;
		}

		this.#closed = true;

		// Deregister sending tracks events and emit 'ended' in remote tracks.
		for (const track of this.#mapLocalIdTracks.values())
		{
			if (track.data.remote)
			{
				track.remoteStop();
			}
		}

		// Remove notification subscriptions.
		this.#channel.removeAllListeners(this.#internal.handlerId);

		// If running notify the worker.
		if (this.#running)
		{
			this.#channel.notify('handler.close', this.#internal);
		}

		// Tell the parent.
		this.emit('@close');
	}

	async getNativeRtpCapabilities(): Promise<RtpCapabilities>
	{
		logger.debug('getNativeRtpCapabilities()');

		const sdp = await this.#channel.request('getRtpCapabilities');

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

		this.#direction = direction;

		// aiortc only supports "sha-256" hash algorithm.
		dtlsParameters.fingerprints = dtlsParameters.fingerprints.filter((f) => f.algorithm ==='sha-256');

		this.#remoteSdp = new RemoteSdp(
			{
				iceParameters,
				iceCandidates,
				dtlsParameters,
				sctpParameters
			});

		this.#sendingRtpParametersByKind =
		{
			audio : ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
			video : ortc.getSendingRtpParameters('video', extendedRtpCapabilities)
		};

		this.#sendingRemoteRtpParametersByKind =
		{
			audio : ortc.getSendingRemoteRtpParameters('audio', extendedRtpCapabilities),
			video : ortc.getSendingRemoteRtpParameters('video', extendedRtpCapabilities)
		};

		const options =
		{
			rtcConfiguration : { iceServers }
		};

		// Notify the worker so it will create a handler.
		this.#channel.request('createHandler', this.#internal, options)
			.catch((error) =>
			{
				logger.error(`handler creation in the worker failed: ${error}`);

				this.close();
			});

		// Set the running flag.
		this.#running = true;

		this.handleWorkerNotifications();
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
		const data = await this.#channel.request(
			'handler.getTransportStats', this.#internal);

		return new FakeRTCStatsReport(data);
	}

	async send(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		{ track, encodings, codecOptions, codec }: HandlerSendOptions
	): Promise<HandlerSendResult>
	{
		this.assertSendDirection();

		logger.debug(
			'send() [kind:%s, track.id:%s, track.data:%o]',
			track.kind, track.id, (track as FakeMediaStreamTrack).data);

		const localId = track.id;
		const kind = track.kind;
		const { playerId, remote } = (track as FakeMediaStreamTrack).data;

		if (playerId)
		{
			await this.#channel.request(
				'handler.addTrack', this.#internal, { localId, playerId, kind });
		}
		else if (remote)
		{
			await this.#channel.request(
				'handler.addTrack',
				this.#internal,
				{ localId, recvTrackId: track.id, kind });
		}
		else
		{
			throw new TypeError(
				'invalid track, missing data.playerId or data.remote');
		}

		const sendingRtpParameters =
			utils.clone(this.#sendingRtpParametersByKind![track.kind], {});

		// This may throw.
		sendingRtpParameters.codecs =
			ortc.reduceCodecs(sendingRtpParameters.codecs, codec);

		const sendingRemoteRtpParameters =
			this.#sendingRemoteRtpParametersByKind![track.kind];

		// This may throw.
		sendingRemoteRtpParameters.codecs =
			ortc.reduceCodecs(sendingRemoteRtpParameters.codecs, codec);

		let offer = await this.#channel.request(
			'handler.createOffer', this.#internal);

		let localSdpObject = sdpTransform.parse(offer.sdp);

		if (!this.#transportReady)
		{
			await this.setupTransport({ localDtlsRole: 'server', localSdpObject });
		}

		logger.debug(
			'send() | calling handler.setLocalDescription() [offer:%o]',
			offer);

		await this.#channel.request(
			'handler.setLocalDescription',
			this.#internal,
			offer as RTCSessionDescription);

		// Get the MID and the corresponding m= section.
		const mid = await this.#channel.request(
			'handler.getMid', this.#internal, { localId });

		offer = await this.#channel.request(
			'handler.getLocalDescription', this.#internal);

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

		this.#remoteSdp!.send(
			{
				offerMediaObject,
				reuseMid            : '', // May be in the future.
				offerRtpParameters  : sendingRtpParameters,
				answerRtpParameters : sendingRemoteRtpParameters,
				codecOptions,
				extmapAllowMixed    : false
			});

		const answer = { type: 'answer', sdp: this.#remoteSdp!.getSdp() };

		logger.debug(
			'send() | calling handler.setRemoteDescription() [answer:%o]',
			answer);

		await this.#channel.request(
			'handler.setRemoteDescription',
			this.#internal,
			answer as RTCSessionDescription);

		// Store the original track into our map and listen for events.
		this.#mapLocalIdTracks.set(localId, track as FakeMediaStreamTrack);

		track.addEventListener('@enabledchange', () =>
		{
			// Ensure we are still sending this track.
			if (
				this.#mapLocalIdTracks.get(localId) !== track ||
				track.readyState === 'ended'
			)
			{
				return;
			}

			if (track.enabled)
			{
				this.#channel.notify(
					'handler.enableTrack', this.#internal, { localId });
			}
			else
			{
				this.#channel.notify(
					'handler.disableTrack', this.#internal, { localId });
			}
		});

		// Store the MID into the map.
		this.#mapLocalIdMid.set(localId, mid);

		return {
			localId,
			rtpParameters : sendingRtpParameters
		};
	}

	async stopSending(localId: string): Promise<void>
	{
		this.assertSendDirection();

		logger.debug('stopSending() [localId:%s]', localId);

		// Remove the original track from our map and its events.
		const track = this.#mapLocalIdTracks.get(localId);

		if (!track)
		{
			throw new Error('associated track not found');
		}

		this.#mapLocalIdTracks.delete(localId);

		// Remove the MID from the map.
		const mid = this.#mapLocalIdMid.get(localId);

		if (!mid)
		{
			throw new Error('associated MID not found');
		}

		this.#mapLocalIdMid.delete(localId);

		await this.#channel.request(
			'handler.removeTrack', this.#internal, { localId });

		this.#remoteSdp!.disableMediaSection(mid);

		const offer =
			await this.#channel.request('handler.createOffer', this.#internal);

		logger.debug(
			'stopSending() | calling handler.setLocalDescription() [offer:%o]',
			offer);

		await this.#channel.request(
			'handler.setLocalDescription',
			this.#internal,
			offer as RTCSessionDescription);

		const answer = { type: 'answer', sdp: this.#remoteSdp!.getSdp() };

		logger.debug(
			'stopSending() | calling handler.setRemoteDescription() [answer:%o]',
			answer);

		await this.#channel.request(
			'handler.setRemoteDescription',
			this.#internal,
			answer as RTCSessionDescription);
	}

	async pauseSending(localId: string): Promise<void>
	{
		this.assertSendDirection();

		logger.debug('pauseSending() [localId:%s]', localId);

		const track = this.#mapLocalIdTracks.get(localId);

		if (!track)
		{
			throw new Error('associated track not found');
		}

		const mid = this.#mapLocalIdMid.get(localId);

		if (!mid)
		{
			throw new Error('associated MID not found');
		}

		await this.#channel.request(
			'handler.setTrackDirection',
			this.#internal,
			{ localId, direction: 'inactive' });

		const offer = await this.#channel.request('handler.createOffer', this.#internal);

		logger.debug(
			'pauseSending() | calling handler.setLocalDescription() [offer:%o]',
			offer);

		await this.#channel.request(
			'handler.setLocalDescription',
			this.#internal,
			offer as RTCSessionDescription);

		const answer = { type: 'answer', sdp: this.#remoteSdp!.getSdp() };

		logger.debug(
			'pauseSending() | calling handler.setRemoteDescription() [answer:%o]',
			answer);

		await this.#channel.request(
			'handler.setRemoteDescription',
			this.#internal,
			answer as RTCSessionDescription);
	}

	async resumeSending(localId: string): Promise<void>
	{
		this.assertSendDirection();

		logger.debug('resumeSending() [localId:%s]', localId);

		const track = this.#mapLocalIdTracks.get(localId);

		if (!track)
		{
			throw new Error('associated track not found');
		}

		const mid = this.#mapLocalIdMid.get(localId);

		if (!mid)
		{
			throw new Error('associated MID not found');
		}

		await this.#channel.request(
			'handler.setTrackDirection',
			this.#internal,
			{ localId, direction: 'sendonly' });

		const offer = await this.#channel.request('handler.createOffer', this.#internal);

		logger.debug(
			'resumeSending() | calling handler.setLocalDescription() [offer:%o]',
			offer);

		await this.#channel.request(
			'handler.setLocalDescription',
			this.#internal,
			offer as RTCSessionDescription);

		const answer = { type: 'answer', sdp: this.#remoteSdp!.getSdp() };

		logger.debug(
			'stopSending() | calling handler.setRemoteDescription() [answer:%o]',
			answer);

		await this.#channel.request(
			'handler.setRemoteDescription',
			this.#internal,
			answer as RTCSessionDescription);
	}

	async replaceTrack(
		localId: string, track: MediaStreamTrack | null
	): Promise<void>
	{
		this.assertSendDirection();

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

		const mid = this.#mapLocalIdMid.get(localId);

		if (!mid)
		{
			throw new Error('associated MID not found');
		}

		const kind = track.kind;
		const { playerId, remote } = (track as FakeMediaStreamTrack).data;

		if (playerId)
		{
			await this.#channel.request(
				'handler.replaceTrack', this.#internal, { localId, playerId, kind });
		}
		else if (remote)
		{
			await this.#channel.request(
				'handler.replaceTrack',
				this.#internal,
				{ localId, recvTrackId: track.id, kind });
		}
		else
		{
			throw new TypeError(
				'invalid track, missing data.player or data.remote');
		}

		// Store the new original track into our map and listen for events.
		this.#mapLocalIdTracks.set(localId, track as FakeMediaStreamTrack);

		track.addEventListener('@enabledchange', () =>
		{
			// Ensure we are still sending this track.
			if (
				this.#mapLocalIdTracks.get(localId) !== track ||
				track.readyState === 'ended'
			)
			{
				return;
			}

			if (track.enabled)
			{
				this.#channel.notify(
					'handler.enableTrack', this.#internal, { localId });
			}
			else
			{
				this.#channel.notify(
					'handler.disableTrack', this.#internal, { localId });
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
		this.assertSendDirection();

		const mid = this.#mapLocalIdMid.get(localId);

		if (!mid)
		{
			throw new Error('associated MID not found');
		}

		const data = await this.#channel.request(
			'handler.getSenderStats', this.#internal, { mid });

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
		this.assertSendDirection();

		const internal =
		{
			handlerId     : this.#internal.handlerId,
			dataChannelId : uuidv4()
		};

		const options =
		{
			negotiated        : true,
			id                : this.#nextSendSctpStreamId,
			ordered,
			maxPacketLifeTime : maxPacketLifeTime || null, // Important.
			maxRetransmits    : maxRetransmits || null, // Important.
			label,
			protocol
		};

		logger.debug('sendDataChannel() [options:%o]', options);

		const result = await this.#channel.request(
			'handler.createDataChannel', internal, options);

		const dataChannel = new FakeRTCDataChannel(
			internal,
			this.#channel,
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
		this.#nextSendSctpStreamId =
			++this.#nextSendSctpStreamId % SCTP_NUM_STREAMS.MIS;

		// If this is the first DataChannel we need to create the SDP answer with
		// m=application section.
		if (!this.#hasDataChannelMediaSection)
		{
			const offer = await this.#channel.request(
				'handler.createOffer', this.#internal);

			const localSdpObject = sdpTransform.parse(offer.sdp);
			const offerMediaObject = localSdpObject.media
				.find((m: any) => m.type === 'application');

			if (!this.#transportReady)
			{
				await this.setupTransport({ localDtlsRole: 'server', localSdpObject });
			}

			logger.debug(
				'sendDataChannel() | calling handler.setLocalDescription() [offer:%o]',
				offer);

			await this.#channel.request(
				'handler.setLocalDescription',
				this.#internal,
				offer as RTCSessionDescription);

			this.#remoteSdp!.sendSctpAssociation({ offerMediaObject });

			const answer = { type: 'answer', sdp: this.#remoteSdp!.getSdp() };

			logger.debug(
				'sendDataChannel() | calling handler.setRemoteDescription() [answer:%o]',
				answer);

			await this.#channel.request(
				'handler.setRemoteDescription',
				this.#internal,
				answer as RTCSessionDescription);

			this.#hasDataChannelMediaSection = true;
		}

		const sctpStreamParameters: SctpStreamParameters =
		{
			streamId          : result.streamId,
			ordered           : result.ordered,
			maxPacketLifeTime : result.maxPacketLifeTime || undefined,
			maxRetransmits    : result.maxRetransmits || undefined
		};

		return {
			// TODO: https://github.com/versatica/mediasoup-client-aiortc/issues/24
			// @ts-ignore
			dataChannel,
			sctpStreamParameters
		};
	}

	async receive(optionsList: HandlerReceiveOptions[]): Promise<HandlerReceiveResult[]>
	{
		this.assertRecvDirection();

		const results: HandlerReceiveResult[] = [];
		const mapLocalId: Map<string, string> = new Map();

		for (const options of optionsList)
		{
			const { trackId, kind, rtpParameters } = options;

			logger.debug('receive() [trackId:%s, kind:%s]', trackId, kind);

			const localId = rtpParameters.mid || String(this.#mapLocalIdMid.size);

			mapLocalId.set(trackId, localId);

			this.#remoteSdp!.receive(
				{
					mid                : localId,
					kind,
					offerRtpParameters : rtpParameters,
					streamId           : rtpParameters.rtcp!.cname!,
					trackId
				});
		}

		const offer = { type: 'offer', sdp: this.#remoteSdp!.getSdp() };

		logger.debug(
			'receive() | calling handler.setRemoteDescription() [offer:%o]',
			offer);

		await this.#channel.request(
			'handler.setRemoteDescription',
			this.#internal,
			offer as RTCSessionDescription);

		let answer = await this.#channel.request(
			'handler.createAnswer', this.#internal);

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

		if (!this.#transportReady)
		{
			await this.setupTransport({ localDtlsRole: 'client', localSdpObject });
		}

		logger.debug(
			'receive() | calling handler.setLocalDescription() [answer:%o]',
			answer);

		await this.#channel.request(
			'handler.setLocalDescription',
			this.#internal,
			answer as RTCSessionDescription);

		// Create fake remote tracks to be returned.
		for (const options of optionsList)
		{
			const { trackId, kind } = options;
			const localId = mapLocalId.get(trackId)!;

			const track = new FakeMediaStreamTrack(
				{
					kind,
					id   : trackId,
					data : { remote: true } // This let's us know that this is remote.
				});

			// Store the remote track into the map.
			this.#mapLocalIdTracks.set(localId, track);

			// Store the MID into the map.
			this.#mapLocalIdMid.set(localId, localId);

			results.push({ localId,	track });
		}

		return results;
	}

	async stopReceiving(localIds: string[]): Promise<void>
	{
		this.assertRecvDirection();

		for (const localId of localIds)
		{
			logger.debug('stopReceiving() [localId:%s]', localId);

			// Remove the remote track from the map and make it emit 'ended'.
			const track = this.#mapLocalIdTracks.get(localId);

			if (!track)
			{
				throw new Error('associated track not found');
			}

			this.#mapLocalIdTracks.delete(localId);
			track.remoteStop();

			const mid = this.#mapLocalIdMid.get(localId);

			if (!mid)
			{
				throw new Error('associated MID not found');
			}

			this.#remoteSdp!.closeMediaSection(mid);
		}

		const offer = { type: 'offer', sdp: this.#remoteSdp!.getSdp() };

		logger.debug(
			'stopReceiving() | calling handler.setRemoteDescription() [offer:%o]',
			offer);

		await this.#channel.request(
			'handler.setRemoteDescription',
			this.#internal,
			offer as RTCSessionDescription);

		const answer = await this.#channel.request(
			'handler.createAnswer', this.#internal);

		logger.debug(
			'stopReceiving() | calling handler.setLocalDescription() [answer:%o]',
			answer);

		await this.#channel.request(
			'handler.setLocalDescription',
			this.#internal,
			answer as RTCSessionDescription);
	}

	async pauseReceiving(localIds: string[]): Promise<void>
	{
		this.assertRecvDirection();

		for (const localId of localIds)
		{
			logger.debug('pauseReceiving() [localId:%s]', localId);

			const track = this.#mapLocalIdTracks.get(localId);

			if (!track)
			{
				throw new Error('associated track not found');
			}

			const mid = this.#mapLocalIdMid.get(localId);

			if (!mid)
			{
				throw new Error('associated MID not found');
			}

			await this.#channel.request(
				'handler.setTrackDirection',
				this.#internal,
				{ localId, direction: 'inactive' });
		}

		const offer = await this.#channel.request('handler.createOffer', this.#internal);

		logger.debug(
			'pauseReceiving() | calling handler.setRemoteDescription() [offer:%o]',
			offer);

		await this.#channel.request(
			'handler.setRemoteDescription',
			this.#internal,
			offer as RTCSessionDescription);

		const answer = await this.#channel.request(
			'handler.createAnswer', this.#internal);

		logger.debug(
			'pauseReceiving() | calling handler.setLocalDescription() [answer:%o]',
			answer);

		await this.#channel.request(
			'handler.setLocalDescription',
			this.#internal,
			answer as RTCSessionDescription);
	}

	async resumeReceiving(localIds: string[]): Promise<void>
	{
		this.assertRecvDirection();

		for (const localId of localIds)
		{
			logger.debug('pauseReceiving() [localId:%s]', localId);

			const track = this.#mapLocalIdTracks.get(localId);

			if (!track)
			{
				throw new Error('associated track not found');
			}

			const mid = this.#mapLocalIdMid.get(localId);

			if (!mid)
			{
				throw new Error('associated MID not found');
			}

			await this.#channel.request(
				'handler.setTrackDirection',
				this.#internal,
				{ localId, direction: 'recvonly' });
		}

		const offer = await this.#channel.request('handler.createOffer', this.#internal);

		logger.debug(
			'resumeReceiving() | calling handler.setRemoteDescription() [offer:%o]',
			offer);

		await this.#channel.request(
			'handler.setRemoteDescription',
			this.#internal,
			offer as RTCSessionDescription);

		const answer = await this.#channel.request(
			'handler.createAnswer', this.#internal);

		logger.debug(
			'resumeReceiving() | calling handler.setLocalDescription() [answer:%o]',
			answer);

		await this.#channel.request(
			'handler.setLocalDescription',
			this.#internal,
			answer as RTCSessionDescription);
	}

	async getReceiverStats(localId: string): Promise<FakeRTCStatsReport>
	{
		this.assertRecvDirection();

		const mid = this.#mapLocalIdMid.get(localId);

		if (!mid)
		{
			throw new Error('associated MID not found');
		}

		const data = await this.#channel.request(
			'handler.getReceiverStats', this.#internal, { mid });

		return new FakeRTCStatsReport(data);
	}

	async receiveDataChannel(
		{ sctpStreamParameters, label, protocol }: HandlerReceiveDataChannelOptions
	): Promise<HandlerReceiveDataChannelResult>
	{
		this.assertRecvDirection();

		const {
			streamId,
			ordered,
			maxPacketLifeTime,
			maxRetransmits
		}: SctpStreamParameters = sctpStreamParameters;

		const internal =
		{
			handlerId     : this.#internal.handlerId,
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

		const result = await this.#channel.request(
			'handler.createDataChannel', internal, options);

		const dataChannel = new FakeRTCDataChannel(
			internal,
			this.#channel,
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
		if (!this.#hasDataChannelMediaSection)
		{
			this.#remoteSdp!.receiveSctpAssociation();

			const offer = { type: 'offer', sdp: this.#remoteSdp!.getSdp() };

			logger.debug(
				'receiveDataChannel() | calling handler.setRemoteDescription() [offer:%o]',
				offer);

			await this.#channel.request(
				'handler.setRemoteDescription',
				this.#internal,
				offer as RTCSessionDescription);

			const answer = await this.#channel.request(
				'handler.createAnswer', this.#internal);

			if (!this.#transportReady)
			{
				const localSdpObject = sdpTransform.parse(answer.sdp);

				await this.setupTransport({ localDtlsRole: 'client', localSdpObject });
			}

			logger.debug(
				'receiveDataChannel() | calling handler.setRemoteDescription() [answer:%o]',
				answer);

			await this.#channel.request(
				'handler.setLocalDescription',
				this.#internal,
				answer as RTCSessionDescription);

			this.#hasDataChannelMediaSection = true;
		}

		// TODO: https://github.com/versatica/mediasoup-client-aiortc/issues/24
		// @ts-ignore
		return { dataChannel };
	}

	private async setupTransport(
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
			const offer = await this.#channel.request(
				'handler.getLocalDescription', this.#internal);

			localSdpObject = sdpTransform.parse(offer.sdp);
		}

		// Get our local DTLS parameters.
		const dtlsParameters =
			sdpCommonUtils.extractDtlsParameters({ sdpObject: localSdpObject });

		// Set our DTLS role.
		dtlsParameters.role = localDtlsRole;

		// Update the remote DTLS role in the SDP.
		this.#remoteSdp!.updateDtlsRole(
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

		this.#transportReady = true;
	}

	private assertSendDirection(): void
	{
		if (this.#direction !== 'send')
		{
			throw new Error(
				'method can just be called for handlers with "send" direction');
		}
	}

	private assertRecvDirection(): void
	{
		if (this.#direction !== 'recv')
		{
			throw new Error(
				'method can just be called for handlers with "recv" direction');
		}
	}

	private handleWorkerNotifications(): void
	{
		this.#channel.on(this.#internal.handlerId, (event: string, data?: any) =>
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
