import * as sdpTransform from 'sdp-transform';
import { FakeMediaStreamTrack } from 'fake-mediastreamtrack';
import { Logger } from 'mediasoup-client/lib/Logger';
import { UnsupportedError } from 'mediasoup-client/lib/errors';
import * as utils from 'mediasoup-client/lib/utils';
import * as ortc from 'mediasoup-client/lib/ortc';
import * as sdpCommonUtils from 'mediasoup-client/lib/handlers/sdp/commonUtils';
import * as sdpUnifiedPlanUtils from 'mediasoup-client/lib/handlers/sdp/unifiedPlanUtils';
import {
	HandlerFactory,
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
	MediaKind,
	IceParameters,
	DtlsRole,
	RtpCapabilities,
	RtpParameters,
	SctpCapabilities,
	SctpStreamParameters
} from 'mediasoup-client/lib/types';
import { WorkerLogLevel, WorkerSendOptions, Worker } from './Worker';
import { FakeRTCStatsReport } from './FakeRTCStatsReport';

const logger = new Logger('aiortc');

const SCTP_NUM_STREAMS = { OS: 65535, MIS: 65535 };

export class Aiortc extends HandlerInterface
{
	// Log level for spawned Workers.
	private readonly _workerLogLevel: WorkerLogLevel;
	// Handler direction.
	private _direction: 'send' | 'recv';
	// Remote SDP handler.
	private _remoteSdp: RemoteSdp;
	// Generic sending RTP parameters for audio and video.
	private _sendingRtpParametersByKind: { [key: string]: RtpParameters };
	// Generic sending RTP parameters for audio and video suitable for the SDP
	// remote answer.
	private _sendingRemoteRtpParametersByKind: { [key: string]: RtpParameters };
	// Worker instance.
	private _worker: Worker;
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
	 * Creates a factory function.
	 */
	static createFactory(logLevel?: WorkerLogLevel): HandlerFactory
	{
		return (): Aiortc => new Aiortc(logLevel);
	}

	constructor(logLevel?: WorkerLogLevel)
	{
		super();

		this._workerLogLevel = logLevel || 'none';
	}

	get name(): string
	{
		return 'Aiortc';
	}

	close(): void
	{
		logger.debug('close()');

		// Deregister sending tracks events and emit 'ended' in remote tracks.
		for (const track of this._mapLocalIdTracks.values())
		{
			if (track.data.remote)
			{
				track.remoteStop();
			}
			else
			{
				track.removeEventListener(
					'@enabledchange', track.data.enabledChangeListener);
			}
		}

		// Close the worker.
		if (this._worker)
			this._worker.close();
	}

	async getNativeRtpCapabilities(): Promise<RtpCapabilities>
	{
		logger.debug('getNativeRtpCapabilities()');

		const worker = new Worker({ logLevel: this._workerLogLevel });

		try
		{
			await new Promise((resolve, reject) =>
			{
				worker.on('open', resolve);
				worker.on('failed', reject);
			});

			const sdp = await worker.getRtpCapabilities();
			const sdpObject = sdpTransform.parse(sdp);
			const caps = sdpCommonUtils.extractRtpCapabilities({ sdpObject });

			worker.close();

			return caps;
		}
		catch (error)
		{
			logger.error('getNativeRtpCapabilities | failed: %o', error);

			worker.close();

			throw error;
		}
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

		this._worker = new Worker(
			{
				rtcConfiguration : { iceServers },
				logLevel         : this._workerLogLevel
			});

		this._worker.on('error', (error: Error) =>
		{
			logger.error('worker error: %s', error.toString());
		});

		this._worker.on('iceconnectionstatechange', (state: RTCIceConnectionState) =>
		{
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
		});
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
		this._waitForReady();

		return this._worker.getTransportStats();
	}

	async send(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		{ track, encodings, codecOptions }: HandlerSendOptions
	): Promise<HandlerSendResult>
	{
		this._assertSendDirection();
		this._waitForReady();

		logger.debug(
			'send() [kind:%s, track.id:%s, track.data:%o]',
			track.kind, track.id, (track as FakeMediaStreamTrack).data);

		const { sourceType, sourceValue } = (track as FakeMediaStreamTrack).data;
		const { trackId } = await this._worker.addTrack(
			{
				kind : track.kind as MediaKind,
				sourceType,
				sourceValue
			} as WorkerSendOptions);
		const localId = trackId;
		let offer = await this._worker.createOffer();
		let localSdpObject = sdpTransform.parse(offer.sdp);
		const sendingRtpParameters =
			utils.clone(this._sendingRtpParametersByKind[track.kind]);

		if (!this._transportReady)
			await this._setupTransport({ localDtlsRole: 'server', localSdpObject });

		logger.debug(
			'send() | calling worker.setLocalDescription() [offer:%o]',
			offer);

		await this._worker.setLocalDescription(offer as RTCSessionDescription);

		// Get the MID and the corresponding m= section.
		const mid = await this._worker.getMid(trackId);

		offer = await this._worker.getLocalDescription();
		localSdpObject = sdpTransform.parse(offer.sdp);

		const offerMediaObject = localSdpObject.media.find((m) => (
			String(m.mid) === String(mid)
		));

		// Set RTCP CNAME.
		sendingRtpParameters.rtcp.cname =
			sdpCommonUtils.getCname({ offerMediaObject });

		// Set RTP encodings by parsing the SDP offer.
		sendingRtpParameters.encodings =
			sdpUnifiedPlanUtils.getRtpEncodings({ offerMediaObject });

		this._remoteSdp.send(
			{
				offerMediaObject,
				reuseMid            : false, // May be in the future.
				offerRtpParameters  : sendingRtpParameters,
				answerRtpParameters : this._sendingRemoteRtpParametersByKind[track.kind],
				codecOptions,
				extmapAllowMixed    : false
			});

		const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };

		logger.debug(
			'send() | calling worker.setRemoteDescription() [answer:%o]',
			answer);

		await this._worker.setRemoteDescription(answer as RTCSessionDescription);

		// Store the original track into our map and listen for events.
		this._mapLocalIdTracks.set(localId, track as FakeMediaStreamTrack);

		(track as FakeMediaStreamTrack).data.enabledChangeListener = (): void =>
		{
			logger.debug('sending track %s', track.enabled ? 'enabled' : 'disabled');

			if (track.enabled)
				this._worker.enableTrack(trackId);
			else
				this._worker.disableTrack(trackId);
		};

		track.addEventListener(
			'@enabledchange',
			(track as FakeMediaStreamTrack).data.enabledChangeListener);

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
		this._waitForReady();

		logger.debug('stopSending() [localId:%s]', localId);

		// Remove the original track from our map and its events.
		const track = this._mapLocalIdTracks.get(localId);

		if (!track)
			throw new Error('associated track not found');

		this._mapLocalIdTracks.delete(localId);
		track.removeEventListener(
			'@enabledchange', track.data.enabledChangeListener);

		// Remove the MID from the map.
		const mid = this._mapLocalIdMid.get(localId);

		if (!mid)
			throw new Error('associated MID not found');

		this._mapLocalIdMid.delete(localId);

		const trackId = localId;

		await this._worker.removeTrack(trackId);

		this._remoteSdp.disableMediaSection(mid);

		const offer = await this._worker.createOffer();

		logger.debug(
			'stopSending() | calling worker.setLocalDescription() [offer:%o]',
			offer);

		await this._worker.setLocalDescription(offer as RTCSessionDescription);

		const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };

		logger.debug(
			'stopSending() | calling worker.setRemoteDescription() [answer:%o]',
			answer);

		await this._worker.setRemoteDescription(answer as RTCSessionDescription);
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async replaceTrack(localId: string, track: MediaStreamTrack): Promise<void>
	{
		throw new UnsupportedError('not implemented');
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
		this._waitForReady();

		return this._worker.getSenderStats(localId);
	}

	async sendDataChannel(
		{
			ordered,
			maxPacketLifeTime,
			maxRetransmits,
			label,
			protocol,
			priority
		}: HandlerSendDataChannelOptions
	): Promise<HandlerSendDataChannelResult>
	{
		this._assertSendDirection();

		const options =
		{
			negotiated : true,
			streamId   : this._nextSendSctpStreamId,
			ordered,
			maxPacketLifeTime,
			maxRetransmits,
			label,
			protocol,
			priority
		};

		logger.debug('sendDataChannel() [options:%o]', options);

		const dataChannel = await this._worker.createDataChannel(options);

		// Increase next id.
		this._nextSendSctpStreamId =
			++this._nextSendSctpStreamId % SCTP_NUM_STREAMS.MIS;

		// If this is the first DataChannel we need to create the SDP answer with
		// m=application section.
		if (!this._hasDataChannelMediaSection)
		{
			const offer = await this._worker.createOffer();
			const localSdpObject = sdpTransform.parse(offer.sdp);
			const offerMediaObject = localSdpObject.media
				.find((m: any) => m.type === 'application');

			if (!this._transportReady)
				await this._setupTransport({ localDtlsRole: 'server', localSdpObject });

			logger.debug(
				'sendDataChannel() | calling worker.setLocalDescription() [offer:%o]',
				offer);

			await this._worker.setLocalDescription(offer);

			this._remoteSdp.sendSctpAssociation({ offerMediaObject });

			const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };

			logger.debug(
				'sendDataChannel() | calling worker.setRemoteDescription() [answer:%o]',
				answer);

			await this._worker.setRemoteDescription(answer as RTCSessionDescription);

			this._hasDataChannelMediaSection = true;
		}

		const sctpStreamParameters: SctpStreamParameters =
		{
			streamId          : options.streamId,
			ordered           : options.ordered,
			maxPacketLifeTime : options.maxPacketLifeTime,
			maxRetransmits    : options.maxRetransmits
		};

		return { dataChannel, sctpStreamParameters };
	}

	async receive(
		{ trackId, kind, rtpParameters }: HandlerReceiveOptions
	): Promise<HandlerReceiveResult>
	{
		this._assertRecvDirection();
		this._waitForReady();

		logger.debug('receive() [trackId:%s, kind:%s]', trackId, kind);

		const localId = String(this._mapLocalIdMid.size);
		const mid = localId;

		this._remoteSdp.receive(
			{
				mid,
				kind,
				offerRtpParameters : rtpParameters,
				streamId           : rtpParameters.rtcp.cname,
				trackId
			});

		const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };

		logger.debug(
			'receive() | calling worker.setRemoteDescription() [offer:%o]',
			offer);

		await this._worker.setRemoteDescription(offer as RTCSessionDescription);

		let answer = await this._worker.createAnswer();
		const localSdpObject = sdpTransform.parse(answer.sdp);
		const answerMediaObject = localSdpObject.media
			.find((m: any) => String(m.mid) === localId);

		// May need to modify codec parameters in the answer based on codec
		// parameters in the offer.
		sdpCommonUtils.applyCodecParameters(
			{
				offerRtpParameters : rtpParameters,
				answerMediaObject
			});

		answer =
		{
			type : 'answer',
			sdp  : sdpTransform.write(localSdpObject)
		} as RTCSessionDescription;

		// NOTE: This should be localDtlsRole: 'client'. However aiortc fails to honor
		// given DTLS role and assumes it must always be 'server'.
		if (!this._transportReady)
			await this._setupTransport({ localDtlsRole: 'server', localSdpObject });

		logger.debug(
			'receive() | calling worker.setLocalDescription() [answer:%o]',
			answer);

		await this._worker.setLocalDescription(answer as RTCSessionDescription);

		// Create a fake remote track to be returned.
		const track = new FakeMediaStreamTrack(
			{
				kind,
				id   : trackId,
				data : { remote: true } // This let's us know that this is remote.
			});

		// Store the remote track into the map.
		this._mapLocalIdTracks.set(localId, track);

		// Store the MID into the map.
		this._mapLocalIdMid.set(localId, mid);

		return { localId, track };
	}

	async stopReceiving(localId: string): Promise<void>
	{
		this._assertRecvDirection();
		this._waitForReady();

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

		const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };

		logger.debug(
			'stopReceiving() | calling worker.setRemoteDescription() [offer:%o]',
			offer);

		await this._worker.setRemoteDescription(offer as RTCSessionDescription);

		const answer = await this._worker.createAnswer();

		logger.debug(
			'stopReceiving() | calling worker.setLocalDescription() [answer:%o]',
			answer);

		await this._worker.setLocalDescription(answer as RTCSessionDescription);
	}

	async getReceiverStats(localId: string): Promise<FakeRTCStatsReport>
	{
		this._assertRecvDirection();
		this._waitForReady();

		return this._worker.getReceiverStats(localId);
	}

	async receiveDataChannel(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		options: HandlerReceiveDataChannelOptions
	): Promise<HandlerReceiveDataChannelResult>
	{
		throw new UnsupportedError('not implemented');
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
			const offer = await this._worker.getLocalDescription();

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
		await this.safeEmitAsPromise('@connect', { dtlsParameters });

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

	private async _waitForReady(): Promise<void>
	{
		if (!this._worker)
			throw new Error('called with worker member unset');

		switch (this._worker.getState())
		{
			case 'connecting':
			{
				await new Promise((resolve, reject) =>
				{
					this._worker.on('open', resolve);
					this._worker.on('failed', reject);
				});

				break;
			}

			case 'open':
			{
				return;
			}

			case 'closed':
			{
				throw new Error('worker closed');
			}
		}
	}
}
