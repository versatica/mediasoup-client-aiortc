import { Device, types as mediasoupClientTypes } from 'mediasoup-client';
import { FakeMediaStreamTrack } from 'fake-mediastreamtrack';
import { createWorker } from '../';
import { Worker } from '../Worker';
import * as fakeParameters from './fakeParameters';

type TestContext = {
	worker?: Worker;
	device?: mediasoupClientTypes.Device;
	loadedDevice?: mediasoupClientTypes.Device;
	connectedSendTransport?: mediasoupClientTypes.Transport;
	connectedRecvTransport?: mediasoupClientTypes.Transport;
	audioProducer?: mediasoupClientTypes.Producer;
	audioConsumer?: mediasoupClientTypes.Consumer;
};

const TEST_TIMEOUT = 30000;

const ctx: TestContext = {};

beforeEach(async () => {
	ctx.worker = await createWorker({ logLevel: 'debug' });

	ctx.device = new Device({
		handlerFactory: ctx.worker!.createHandlerFactory(),
	});

	ctx.loadedDevice = new Device({
		handlerFactory: ctx.worker!.createHandlerFactory(),
	});

	const routerRtpCapabilities = fakeParameters.generateRouterRtpCapabilities();

	// Only load loadedDevice.
	await ctx.loadedDevice.load({ routerRtpCapabilities });

	const { id, iceParameters, iceCandidates, dtlsParameters, sctpParameters } =
		fakeParameters.generateTransportRemoteParameters();

	ctx.connectedSendTransport = ctx.loadedDevice.createSendTransport<{
		foo: number;
	}>({
		id,
		iceParameters,
		iceCandidates,
		dtlsParameters,
		sctpParameters,
	});

	ctx.connectedSendTransport.on(
		'connect',
		// eslint-disable-next-line no-shadow, @typescript-eslint/no-unused-vars
		({ dtlsParameters }, callback /* errback */) => {
			setTimeout(callback);
		},
	);

	ctx.connectedSendTransport.on(
		'produce',
		// eslint-disable-next-line no-shadow, @typescript-eslint/no-unused-vars
		({ kind, rtpParameters, appData }, callback /* errback */) => {
			// eslint-disable-next-line no-shadow
			const { id } = fakeParameters.generateProducerRemoteParameters();

			setTimeout(() => callback({ id }));
		},
	);

	ctx.connectedSendTransport.on(
		'producedata',
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		({ sctpStreamParameters, label, protocol, appData }, callback, errback) => {
			// eslint-disable-next-line no-shadow
			const { id } = fakeParameters.generateDataProducerRemoteParameters();

			setTimeout(() => callback({ id }));
		},
	);

	ctx.connectedRecvTransport = ctx.loadedDevice.createRecvTransport({
		id,
		iceParameters,
		iceCandidates,
		dtlsParameters,
		sctpParameters,
	});

	ctx.connectedRecvTransport.on(
		'connect',
		// eslint-disable-next-line no-shadow, @typescript-eslint/no-unused-vars
		({ dtlsParameters }, callback /* errback */) => {
			setTimeout(callback);
		},
	);

	const stream = await ctx.worker!.getUserMedia({
		audio: { source: 'file', file: 'src/test/data/small.mp4' },
		video: { source: 'file', file: 'src/test/data/small.mp4' },
	});
	const audioTrack = stream.getTracks()[0];

	ctx.audioProducer = await ctx.connectedSendTransport.produce({
		track: audioTrack,
	});

	const audioConsumerRemoteParameters =
		fakeParameters.generateConsumerRemoteParameters({
			codecMimeType: 'audio/opus',
		});

	ctx.audioConsumer = await ctx.connectedRecvTransport.consume({
		id: audioConsumerRemoteParameters.id,
		producerId: audioConsumerRemoteParameters.producerId,
		kind: audioConsumerRemoteParameters.kind,
		rtpParameters: audioConsumerRemoteParameters.rtpParameters,
	});
}, TEST_TIMEOUT);

afterEach(async () => {
	ctx.worker?.close();

	if (ctx.worker?.subprocessClosed === false) {
		await new Promise<void>(resolve =>
			ctx.worker?.on('subprocessclose', resolve),
		);
	}
}, TEST_TIMEOUT);

test(
	'create a Worker succeeds',
	async () => {
		const worker = await createWorker({ logLevel: 'debug' });

		expect(typeof worker.pid).toBe('number');
		expect(worker.closed).toBe(false);

		worker.close();

		await new Promise<void>(resolve => worker.on('subprocessclose', resolve));
	},
	TEST_TIMEOUT,
);

test(
	'worker.dump() succeeds with empty fields',
	async () => {
		const worker = await createWorker({ logLevel: 'debug' });
		const dump = await worker.dump();

		expect(dump).toEqual({
			pid: worker.pid,
			players: [],
			handlers: [],
		});

		worker.close();

		await new Promise<void>(resolve => worker.on('subprocessclose', resolve));
	},
	TEST_TIMEOUT,
);

test(
	'worker.getUserMedia() succeeds',
	async () => {
		const worker = await createWorker({ logLevel: 'debug' });
		const stream = await worker.getUserMedia({
			audio: { source: 'file', file: 'src/test/data/small.mp4' },
			video: { source: 'file', file: 'src/test/data/small.mp4' },
		});
		const audioTrack = stream.getTracks()[0];
		const videoTrack = stream.getTracks()[1];

		await expect(worker.dump()).resolves.toEqual({
			pid: worker.pid,
			players: [
				{
					id: audioTrack.data.playerId,
					audioTrack: {
						id: audioTrack.id,
						kind: 'audio',
						readyState: 'live',
					},
					videoTrack: {
						id: videoTrack.id,
						kind: 'video',
						readyState: 'live',
					},
				},
			],
			handlers: [],
		});

		audioTrack.stop();

		await expect(worker.dump()).resolves.toEqual({
			pid: worker.pid,
			players: [
				{
					id: audioTrack.data.playerId,
					audioTrack: {
						id: audioTrack.id,
						kind: 'audio',
						readyState: 'ended',
					},
					videoTrack: {
						id: videoTrack.id,
						kind: 'video',
						readyState: 'live',
					},
				},
			],
			handlers: [],
		});

		stream.close();

		await expect(worker.dump()).resolves.toEqual({
			pid: worker.pid,
			players: [],
			handlers: [],
		});

		worker.close();

		await new Promise<void>(resolve => worker.on('subprocessclose', resolve));
	},
	TEST_TIMEOUT * 2,
);

test('create a Device with worker.createHandlerFactory() as argument succeeds', () => {
	const device = new Device({
		handlerFactory: ctx.worker!.createHandlerFactory(),
	});

	expect(device.handlerName).toBe('Aiortc');
	expect(device.loaded).toBe(false);
});

test(
	'device.load() succeeds',
	async () => {
		// Assume we get the router RTP capabilities.
		const routerRtpCapabilities =
			fakeParameters.generateRouterRtpCapabilities();

		await expect(ctx.device!.load({ routerRtpCapabilities })).resolves.toBe(
			undefined,
		);

		expect(ctx.device!.loaded).toBe(true);
	},
	TEST_TIMEOUT,
);

test('device.rtpCapabilities getter succeeds', () => {
	expect(typeof ctx.loadedDevice!.rtpCapabilities).toBe('object');
});

test('device.sctpCapabilities getter succeeds', () => {
	expect(typeof ctx.loadedDevice!.sctpCapabilities).toBe('object');
});

test('device.createSendTransport() for sending media succeeds', () => {
	// Assume we create a transport in the server and get its remote parameters.
	const { id, iceParameters, iceCandidates, dtlsParameters, sctpParameters } =
		fakeParameters.generateTransportRemoteParameters();

	const sendTransport = ctx.loadedDevice!.createSendTransport({
		id,
		iceParameters,
		iceCandidates,
		dtlsParameters,
		sctpParameters,
		appData: { baz: 'BAZ' },
	});

	expect(sendTransport.id).toBe(id);
	expect(sendTransport.closed).toBe(false);
	expect(sendTransport.direction).toBe('send');
	expect(typeof sendTransport.handler).toBe('object');
	expect(sendTransport.connectionState).toBe('new');
	expect(sendTransport.appData).toEqual({ baz: 'BAZ' });
});

test('device.createRecvTransport() for receiving media succeeds', () => {
	// Assume we create a transport in the server and get its remote parameters.
	const { id, iceParameters, iceCandidates, dtlsParameters, sctpParameters } =
		fakeParameters.generateTransportRemoteParameters();

	const recvTransport = ctx.loadedDevice!.createRecvTransport({
		id,
		iceParameters,
		iceCandidates,
		dtlsParameters,
		sctpParameters,
	});

	expect(recvTransport.id).toBe(id);
	expect(recvTransport.closed).toBe(false);
	expect(recvTransport.direction).toBe('recv');
	expect(typeof recvTransport.handler).toBe('object');
	expect(recvTransport.connectionState).toBe('new');
	expect(recvTransport.appData).toEqual({});
});

test(
	'transport.produce() succeeds',
	async () => {
		const stream = await ctx.worker!.getUserMedia({
			audio: { source: 'file', file: 'src/test/data/small.mp4' },
			video: { source: 'file', file: 'src/test/data/small.mp4' },
		});
		const audioTrack = stream.getTracks()[0];
		const videoTrack = stream.getTracks()[1];
		let connectEventNumTimesCalled = 0;
		let produceEventNumTimesCalled = 0;

		// Pause the audio track before creating its Producer.
		audioTrack.enabled = false;

		ctx.connectedSendTransport!.prependListener(
			'connect',
			() => ++connectEventNumTimesCalled,
		);

		ctx.connectedSendTransport!.prependListener(
			'produce',
			() => ++produceEventNumTimesCalled,
		);

		let codecs;
		let headerExtensions;
		let encodings;
		let rtcp;

		// Use stopTracks: false.
		const audioProducer = await ctx.connectedSendTransport!.produce({
			track: audioTrack,
			stopTracks: false,
			appData: { foo: 'FOO' },
		});

		// 'connect' event should not have been called since it was in beforeEach
		//  already.
		expect(connectEventNumTimesCalled).toBe(0);
		expect(produceEventNumTimesCalled).toBe(1);
		expect(audioProducer.closed).toBe(false);
		expect(audioProducer.kind).toBe('audio');
		expect(audioProducer.track).toBe(audioTrack);
		expect(typeof audioProducer.rtpParameters).toBe('object');
		expect(typeof audioProducer.rtpParameters.mid).toBe('string');
		expect(audioProducer.rtpParameters.codecs.length).toBe(1);

		codecs = audioProducer.rtpParameters.codecs;

		expect(codecs.length).toBe(1);
		expect(codecs[0].mimeType).toBe('audio/opus');

		headerExtensions = audioProducer.rtpParameters.headerExtensions;

		expect(headerExtensions!.length).toBe(2);
		expect(headerExtensions![0].uri).toBe(
			'urn:ietf:params:rtp-hdrext:ssrc-audio-level',
		);
		expect(headerExtensions![1].uri).toBe(
			'urn:ietf:params:rtp-hdrext:sdes:mid',
		);

		encodings = audioProducer.rtpParameters.encodings;

		expect(Array.isArray(encodings)).toBe(true);
		expect(encodings!.length).toBe(1);
		expect(typeof encodings![0]).toBe('object');
		expect(Object.keys(encodings![0])).toEqual(['ssrc', 'dtx']);
		expect(typeof encodings![0].ssrc).toBe('number');

		rtcp = audioProducer.rtpParameters.rtcp;

		expect(typeof rtcp).toBe('object');
		expect(typeof rtcp!.cname).toBe('string');

		expect(audioProducer.paused).toBe(true);
		expect(audioProducer.maxSpatialLayer).toBe(undefined);
		expect(audioProducer.appData).toEqual({ foo: 'FOO' });

		const dump1 = await ctx.worker!.dump();
		let handler = dump1.handlers[0];

		expect(handler.signalingState).toBe('stable');
		expect(handler.iceConnectionState).toBe('checking');
		expect(handler.sendTransceivers.length).toBe(2);
		expect(handler.sendTransceivers).toEqual(
			expect.arrayContaining([
				{
					mid: '0',
					localId: ctx.audioProducer!.track!.id,
				},
				{
					mid: '1',
					localId: audioProducer.track!.id,
				},
			]),
		);
		expect(handler.transceivers.length).toBe(2);
		expect(handler.transceivers[0]).toMatchObject({
			mid: '0',
			kind: 'audio',
			stopped: false,
			sender: {
				trackId: ctx.audioProducer!.track!.id,
			},
		});
		expect(handler.transceivers[1]).toMatchObject({
			mid: '1',
			kind: 'audio',
			stopped: false,
			sender: {
				trackId: audioProducer.track!.id,
			},
		});

		// Note that stopTracks is not given so it's true by default.
		const videoProducer = await ctx.connectedSendTransport!.produce({
			track: videoTrack,
		});

		expect(connectEventNumTimesCalled).toBe(0);
		expect(produceEventNumTimesCalled).toBe(2);
		expect(videoProducer.closed).toBe(false);
		expect(videoProducer.kind).toBe('video');
		expect(videoProducer.track).toBe(videoTrack);
		expect(typeof videoProducer.rtpParameters.mid).toBe('string');
		expect(videoProducer.rtpParameters.codecs.length).toBe(2);

		codecs = videoProducer.rtpParameters.codecs;

		expect(codecs.length).toBe(2);
		expect(codecs[0].mimeType).toBe('video/VP8');
		expect(codecs[1].mimeType).toBe('video/rtx');

		headerExtensions = videoProducer.rtpParameters.headerExtensions;

		expect(headerExtensions!.length).toBe(2);
		expect(headerExtensions![0].uri).toBe(
			'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time',
		);
		expect(headerExtensions![1].uri).toBe(
			'urn:ietf:params:rtp-hdrext:sdes:mid',
		);

		encodings = videoProducer.rtpParameters.encodings;

		expect(Array.isArray(encodings)).toBe(true);
		expect(encodings!.length).toBe(1);
		expect(typeof encodings![0]).toBe('object');
		expect(typeof encodings![0].ssrc).toBe('number');
		expect(typeof encodings![0].rtx).toBe('object');
		expect(Object.keys(encodings![0].rtx!)).toEqual(['ssrc']);
		expect(typeof encodings![0].rtx!.ssrc).toBe('number');

		rtcp = videoProducer.rtpParameters.rtcp;

		expect(typeof rtcp).toBe('object');
		expect(typeof rtcp!.cname).toBe('string');

		expect(videoProducer.paused).toBe(false);
		expect(videoProducer.maxSpatialLayer).toBe(undefined);
		expect(videoProducer.appData).toEqual({});

		const dump2 = await ctx.worker!.dump();

		handler = dump2.handlers[0];

		expect(handler.signalingState).toBe('stable');
		expect(handler.iceConnectionState).toBe('checking');
		expect(handler.sendTransceivers.length).toBe(3);
		expect(handler.sendTransceivers).toEqual(
			expect.arrayContaining([
				{
					mid: '0',
					localId: ctx.audioProducer!.track!.id,
				},
				{
					mid: '1',
					localId: audioProducer.track!.id,
				},
				{
					mid: '2',
					localId: videoProducer.track!.id,
				},
			]),
		);
		expect(handler.transceivers.length).toBe(3);
		expect(handler.transceivers[0]).toMatchObject({
			mid: '0',
			kind: 'audio',
			stopped: false,
			sender: {
				trackId: ctx.audioProducer!.track!.id,
			},
		});
		expect(handler.transceivers[1]).toMatchObject({
			mid: '1',
			kind: 'audio',
			stopped: false,
			sender: {
				trackId: audioProducer.track!.id,
			},
		});
		expect(handler.transceivers[2]).toMatchObject({
			mid: '2',
			kind: 'video',
			stopped: false,
			sender: {
				trackId: videoProducer.track!.id,
			},
		});
	},
	TEST_TIMEOUT,
);

test(
	'transport.consume() succeeds',
	async () => {
		const audioConsumerRemoteParameters =
			fakeParameters.generateConsumerRemoteParameters({
				codecMimeType: 'audio/opus',
			});
		const videoConsumerRemoteParameters =
			fakeParameters.generateConsumerRemoteParameters({
				codecMimeType: 'video/VP8',
			});

		let codecs;
		let headerExtensions;
		let encodings;
		let rtcp;

		const audioConsumer = await ctx.connectedRecvTransport!.consume({
			id: audioConsumerRemoteParameters.id,
			producerId: audioConsumerRemoteParameters.producerId,
			kind: audioConsumerRemoteParameters.kind,
			rtpParameters: audioConsumerRemoteParameters.rtpParameters,
			appData: { bar: 'BAR' },
		});

		expect(audioConsumer.id).toBe(audioConsumerRemoteParameters.id);
		expect(audioConsumer.producerId).toBe(
			audioConsumerRemoteParameters.producerId,
		);
		expect(audioConsumer.closed).toBe(false);
		expect(audioConsumer.kind).toBe('audio');
		expect(typeof audioConsumer.track).toBe('object');
		expect(typeof audioConsumer.rtpParameters).toBe('object');
		expect(audioConsumer.rtpParameters.mid).toBe(undefined);
		expect(audioConsumer.rtpParameters.codecs.length).toBe(1);

		codecs = audioConsumer.rtpParameters.codecs;

		expect(codecs[0]).toEqual({
			mimeType: 'audio/opus',
			payloadType: 100,
			clockRate: 48000,
			channels: 2,
			rtcpFeedback: [],
			parameters: {
				useinbandfec: 1,
				foo: 'bar',
			},
		});

		headerExtensions = audioConsumer.rtpParameters.headerExtensions;

		expect(headerExtensions).toEqual([]);

		encodings = audioConsumer.rtpParameters.encodings;

		expect(Array.isArray(encodings)).toBe(true);
		expect(encodings!.length).toBe(1);
		expect(typeof encodings![0]).toBe('object');
		expect(Object.keys(encodings![0])).toEqual(['ssrc', 'dtx']);
		expect(typeof encodings![0].ssrc).toBe('number');

		rtcp = ctx.audioProducer!.rtpParameters.rtcp;

		expect(typeof rtcp).toBe('object');
		expect(typeof rtcp!.cname).toBe('string');

		expect(audioConsumer.paused).toBe(false);
		expect(audioConsumer.appData).toEqual({ bar: 'BAR' });

		const videoConsumer = await ctx.connectedRecvTransport!.consume({
			id: videoConsumerRemoteParameters.id,
			producerId: videoConsumerRemoteParameters.producerId,
			kind: videoConsumerRemoteParameters.kind,
			rtpParameters: videoConsumerRemoteParameters.rtpParameters,
		});

		expect(videoConsumer.id).toBe(videoConsumerRemoteParameters.id);
		expect(videoConsumer.producerId).toBe(
			videoConsumerRemoteParameters.producerId,
		);
		expect(videoConsumer.closed).toBe(false);
		expect(videoConsumer.kind).toBe('video');
		expect(typeof videoConsumer.track).toBe('object');
		expect(typeof videoConsumer.rtpParameters).toBe('object');
		expect(videoConsumer.rtpParameters.mid).toBe(undefined);
		expect(videoConsumer.rtpParameters.codecs.length).toBe(2);

		codecs = videoConsumer.rtpParameters.codecs;

		expect(codecs[0]).toEqual({
			mimeType: 'video/VP8',
			payloadType: 101,
			clockRate: 90000,
			rtcpFeedback: [
				{ type: 'nack', parameter: '' },
				{ type: 'nack', parameter: 'pli' },
				{ type: 'ccm', parameter: 'fir' },
				{ type: 'goog-remb', parameter: '' },
			],
			parameters: {
				'x-google-start-bitrate': 1500,
			},
		});

		expect(codecs[1]).toEqual({
			mimeType: 'video/rtx',
			payloadType: 102,
			clockRate: 90000,
			rtcpFeedback: [],
			parameters: {
				apt: 101,
			},
		});

		headerExtensions = videoConsumer.rtpParameters.headerExtensions;

		expect(headerExtensions).toEqual([
			{
				uri: 'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time',
				id: 3,
				encrypt: false,
				parameters: {},
			},
		]);

		encodings = videoConsumer.rtpParameters.encodings;

		expect(Array.isArray(encodings)).toBe(true);
		expect(encodings!.length).toBe(1);
		expect(typeof encodings![0]).toBe('object');
		expect(Object.keys(encodings![0])).toEqual(['ssrc', 'rtx', 'dtx']);
		expect(typeof encodings![0].ssrc).toBe('number');
		expect(typeof encodings![0].rtx).toBe('object');
		expect(Object.keys(encodings![0].rtx!)).toEqual(['ssrc']);
		expect(typeof encodings![0].rtx!.ssrc).toBe('number');

		rtcp = videoConsumer.rtpParameters.rtcp;

		expect(typeof rtcp).toBe('object');
		expect(typeof rtcp!.cname).toBe('string');

		expect(videoConsumer.paused).toBe(false);
		expect(videoConsumer.appData).toEqual({});
	},
	TEST_TIMEOUT,
);

test(
	'transport.produceData() succeeds',
	async () => {
		const dataProducer = await ctx.connectedSendTransport!.produceData({
			ordered: false,
			maxPacketLifeTime: 5555,
			label: 'FOO',
			protocol: 'BAR',
			appData: { foo: 'FOO' },
		});

		expect(dataProducer.closed).toBe(false);
		expect(typeof dataProducer.sctpStreamParameters).toBe('object');
		expect(typeof dataProducer.sctpStreamParameters.streamId).toBe('number');
		expect(dataProducer.sctpStreamParameters.ordered).toBe(false);
		expect(dataProducer.sctpStreamParameters.maxPacketLifeTime).toBe(5555);
		expect(dataProducer.sctpStreamParameters.maxRetransmits).toBe(undefined);
		expect(dataProducer.label).toBe('FOO');
		expect(dataProducer.protocol).toBe('BAR');
	},
	TEST_TIMEOUT,
);

test(
	'transport.consumeData() succeeds',
	async () => {
		const dataConsumerRemoteParameters =
			fakeParameters.generateDataConsumerRemoteParameters();

		const dataConsumer = await ctx.connectedRecvTransport!.consumeData({
			id: dataConsumerRemoteParameters.id,
			dataProducerId: dataConsumerRemoteParameters.dataProducerId,
			sctpStreamParameters: dataConsumerRemoteParameters.sctpStreamParameters,
			label: 'FOO',
			protocol: 'BAR',
			appData: { bar: 'BAR' },
		});

		expect(dataConsumer.id).toBe(dataConsumerRemoteParameters.id);
		expect(dataConsumer.dataProducerId).toBe(
			dataConsumerRemoteParameters.dataProducerId,
		);
		expect(dataConsumer.closed).toBe(false);
		expect(typeof dataConsumer.sctpStreamParameters).toBe('object');
		expect(typeof dataConsumer.sctpStreamParameters.streamId).toBe('number');
		expect(dataConsumer.label).toBe('FOO');
		expect(dataConsumer.protocol).toBe('BAR');
	},
	TEST_TIMEOUT,
);

test(
	'transport.produce() with a receiving track succeeds',
	async () => {
		const audioTrack = ctx.audioConsumer!.track as FakeMediaStreamTrack;

		expect(audioTrack.data.remote).toBe(true);

		const audioProducer = await ctx.connectedSendTransport!.produce({
			track: audioTrack,
		});

		expect(audioProducer.kind).toBe('audio');
		expect(audioProducer.track).toBe(audioTrack);
	},
	TEST_TIMEOUT,
);

test(
	'transport.getStats() succeeds',
	async () => {
		const stats = await ctx.connectedSendTransport!.getStats();

		expect(typeof stats).toBe('object');
	},
	TEST_TIMEOUT,
);

test(
	'producer.replaceTrack() succeeds',
	async () => {
		const stream = await ctx.worker!.getUserMedia({
			audio: { source: 'file', file: 'src/test/data/small.mp4' },
			video: { source: 'file', file: 'src/test/data/small.mp4' },
		});
		const newAudioTrack = stream.getTracks()[0];

		// Have the audio Producer paused.
		ctx.audioProducer!.pause();

		const audioProducerPreviousTrack = ctx.audioProducer!.track;

		await expect(
			ctx.audioProducer!.replaceTrack({ track: newAudioTrack }),
		).resolves.toBe(undefined);

		expect(audioProducerPreviousTrack!.readyState).toBe('ended');
		expect(ctx.audioProducer!.track!.readyState).toBe('live');
		expect(ctx.audioProducer!.track).not.toBe(audioProducerPreviousTrack);
		expect(ctx.audioProducer!.track).toBe(newAudioTrack);
		// Producer was already paused.
		expect(ctx.audioProducer!.paused).toBe(true);

		// Reset the audio paused state.
		ctx.audioProducer!.resume();

		const dump = await ctx.worker!.dump();
		const handler = dump.handlers[0];

		expect(handler.sendTransceivers.length).toBe(1);
		// NOTE: We cannot check the new trackIds since handler.py still uses the
		// original track ids as index in the sending transceivers map.
		expect(handler.sendTransceivers).toMatchObject([{ mid: '0' }]);
		expect(handler.transceivers.length).toBe(1);
		expect(handler.transceivers[0]).toMatchObject({
			mid: '0',
			kind: 'audio',
			stopped: false,
			sender: {
				trackId: ctx.audioProducer!.track!.id,
			},
		});
	},
	TEST_TIMEOUT,
);

test(
	'producer.getStats() succeeds',
	async () => {
		const stats = await ctx.audioProducer!.getStats();

		expect(typeof stats).toBe('object');
	},
	TEST_TIMEOUT,
);

test(
	'consumer.getStats() succeeds',
	async () => {
		const stats = await ctx.audioConsumer!.getStats();

		expect(typeof stats).toBe('object');
	},
	TEST_TIMEOUT,
);

test('consumer.pause() succeed', async () => {
	ctx.audioConsumer!.pause();

	expect(ctx.audioConsumer!.paused).toBe(true);
});

test('consumer.resume() succeed', async () => {
	ctx.audioConsumer!.resume();

	expect(ctx.audioConsumer!.paused).toBe(false);
});

test('consumer.close() succeed', () => {
	ctx.audioConsumer!.close();

	expect(ctx.audioConsumer!.closed).toBe(true);
	expect(ctx.audioConsumer!.track.readyState).toBe('ended');
});

test(
	'producer.close() succeed',
	async () => {
		ctx.audioProducer!.close();

		expect(ctx.audioProducer!.closed).toBe(true);
		expect(ctx.audioProducer!.track!.readyState).toBe('ended');

		const dump = await ctx.worker!.dump();
		const handler = dump.handlers[0];

		expect(handler.sendTransceivers.length).toBe(1);
		expect(handler.sendTransceivers).toMatchObject([{ mid: '0' }]);
		expect(handler.transceivers.length).toBe(1);
		expect(handler.transceivers[0]).toMatchObject({
			mid: '0',
			kind: 'audio',
			stopped: false,
			sender: {
				trackId: null,
			},
		});
	},
	TEST_TIMEOUT,
);

test('worker.close() succeeds', () => {
	ctx.worker!.close();

	expect(ctx.worker!.closed).toBe(true);
});
