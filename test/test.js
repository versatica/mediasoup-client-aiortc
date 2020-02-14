const { toBeType } = require('jest-tobetype');
const pkg = require('../package.json');
const aiortc = require('../');
const { version, Worker } = aiortc;
const { workerSettings, sendOptions } = aiortc.types;

expect.extend({ toBeType });

let worker;
let audioTrackId;
let localDescription;


test('mediasoup-client-aiortc exposes a version property', () =>
{
	expect(version).toBeType('string');
	expect(version).toBe(pkg.version);
}, 500);

test('create a worker and getState() returns "connecting" right away', () =>
{
	const workerSettings = {};

	const worker = new Worker(workerSettings);

	expect(worker.getState()).toBe('connecting');
	worker.close();
})

test('create a worker with wrong settings and emits "failure"', async () =>
{
	const workerSettings = { rtcConfiguration: 'justbecause' };

	const worker = new Worker(workerSettings);

	async function waitForWorkerToBeReady() {
		await new Promise((resolve, reject) =>
			{
				worker.once('failure', () => resolve);
			});
		expect(worker.getState()).toBe('closed');
		done();
	}

	waitForWorkerToBeReady();
	worker.close();
})

test('create a worker and emits "open" once connected', async () =>
{
	const workerSettings = {};

	worker = new Worker(workerSettings);

	async function waitForWorkerToBeReady() {
		await new Promise((resolve, reject) =>
		{
			worker.once('open', resolve);
		});
	}

	await waitForWorkerToBeReady();
	expect(worker.getState()).toBe('open');
})

test('worker.getRtpCapabilities() returns a string', async () =>
{
	const capabilities = await worker.getRtpCapabilities();

	expect(capabilities).toBeType('string');
})

test('worker.getLocalDescription() returns "undefined" right away', async () =>
{
	const localDescription = await worker.getLocalDescription();

	expect(localDescription).toBeType('undefined');
})

test('worker.addTrack() with wrong SendOptions throws', async () =>
{
	const sendOptions = {};

	try {
		await worker.addTrack(sendOptions);
	} catch (e) {
		expect(e).toBeType('object');
	}
})

test('worker.addTrack() with correct SendOptions returns string', async () =>
{
	const sendOptions = { kind: 'audio', sourceType: 'device' };

	const result = await worker.addTrack(sendOptions);

	expect(result).toBeType('object')
	expect(result.trackId).toBeType('string')

	audioTrackId = result.trackId;

}, 10000)

test('worker.createOffer() returns a RTCSessionDescription', async () =>
{
	localDescription = await worker.createOffer({ iceRestart: false });

	expect(localDescription).toBeType('object');
	expect(localDescription.type).toBe('offer');
	expect(localDescription.sdp).toBeType('string');
})

test('worker.setLocalDescription() succeeds', async () =>
{
	await worker.setLocalDescription(localDescription);
}, 10000)

test('worker.getLocalDescription() returns a RTCSessionDescription', async () =>
{
	localDescription = await worker.getLocalDescription();

	expect(localDescription).toBeType('object');
	expect(localDescription.type).toBeType('string');
	expect(localDescription.sdp).toBeType('string');
}, 10000)

test('worker.setRemoteDescription() succeeds', async () =>
{
	await worker.setRemoteDescription({ type: 'answer', sdp: localDescription.sdp });
}, 10000)

test('worker.removeTrack() with an invalid "trackId" throws', async () =>
{
	await expect(worker.removeTrack('justbecause'))
		.rejects
		.toThrow(Error);
}, 10000)

test('worker.removeTrack() with a valid "trackId" does not throw', async () =>
{
	await worker.removeTrack(audioTrackId);
})

test('worker.close() succeeds', async () =>
{
	worker.close();

	expect(worker.getState()).toBe('closed');
})
