const { toBeType } = require('jest-tobetype');
const pkg = require('../package.json');
const { version } = require('../');
const { Worker } = require('../lib/Worker');

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
	// eslint-disable-next-line no-shadow
	const worker = new Worker();

	expect(worker.getState()).toBe('connecting');
	worker.close();
});

test('create a worker with wrong settings and emits "failed"', async () =>
{
	// eslint-disable-next-line no-shadow
	const worker = new Worker({ rtcConfiguration: 'justbecause' });

	await new Promise((resolve) => worker.once('failed', resolve));

	expect(worker.getState()).toBe('closed');
	worker.close();
}, 5000);

test('create a worker and emits "open" once connected', async () =>
{
	worker = new Worker();

	await new Promise((resolve) => worker.once('open', resolve));

	expect(worker.getState()).toBe('open');
}, 5000);

test('worker.getRtpCapabilities() returns a string', async () =>
{
	const capabilities = await worker.getRtpCapabilities();

	expect(capabilities).toBeType('string');
}, 5000);

test('worker.getLocalDescription() returns undefined right away', async () =>
{
	// eslint-disable-next-line no-shadow
	const localDescription = await worker.getLocalDescription();

	expect(localDescription).toBeType('undefined');
}, 3000);

test('worker.addTrack() with wrong SendOptions throws', async () =>
{
	await expect(worker.addTrack({}))
		.rejects
		.toThrow(TypeError);
}, 3000);

test('worker.addTrack() with correct SendOptions returns string', async () =>
{
	const result =
		await worker.addTrack({ kind: 'audio', sourceType: 'device' });

	expect(result).toBeType('object');
	expect(result.trackId).toBeType('string');

	audioTrackId = result.trackId;
}, 3000);

test('worker.createOffer() returns a RTCSessionDescription', async () =>
{
	localDescription = await worker.createOffer();

	expect(localDescription).toBeType('object');
	expect(localDescription.type).toBe('offer');
	expect(localDescription.sdp).toBeType('string');
}, 3000);

test('worker.setLocalDescription() succeeds', async () =>
{
	await worker.setLocalDescription(localDescription);
}, 8000);

test('worker.getLocalDescription() returns a RTCSessionDescription', async () =>
{
	localDescription = await worker.getLocalDescription();

	expect(localDescription).toBeType('object');
	expect(localDescription.type).toBeType('string');
	expect(localDescription.sdp).toBeType('string');
}, 3000);

test('worker.setRemoteDescription() succeeds', async () =>
{
	await worker.setRemoteDescription({ type: 'answer', sdp: localDescription.sdp });
}, 3000);

test('worker.getTransportStats() succeeds', async () =>
{
	const stats = await worker.getTransportStats();

	expect(stats).toBeType('object');
	for (const report of stats.values())
	{
		expect(report).toBeType('object');
		expect(report.timestamp).toBeType('number');
		expect(report.type).toBeType('string');
		expect(report.id).toBeType('string');
	}
}, 3000);

test('worker.getSenderStats() succeeds', async () =>
{
	const stats = await worker.getSenderStats(audioTrackId);

	expect(stats).toBeType('object');
	for (const report of stats.values())
	{
		expect(report).toBeType('object');
		expect(report.timestamp).toBeType('number');
		expect(report.type).toBeType('string');
		expect(report.id).toBeType('string');
	}
}, 3000);

test('worker.removeTrack() with an invalid trackId throws', async () =>
{
	await expect(worker.removeTrack('justbecause'))
		.rejects
		.toThrow(Error);
}, 3000);

test('worker.removeTrack() with a valid trackId does not throw', async () =>
{
	await worker.removeTrack(audioTrackId);
}, 3000);

test('worker.close() succeeds', () =>
{
	worker.close();

	expect(worker.getState()).toBe('closed');
});
