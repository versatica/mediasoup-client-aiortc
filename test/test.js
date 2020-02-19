const { toBeType } = require('jest-tobetype');
const pkg = require('../package.json');
const { version } = require('../');
const { Worker } = require('../lib/Worker');

expect.extend({ toBeType });

let worker;
let audioTrackId;
let localDescription;

// test('mediasoup-client-aiortc exposes a version property', () =>
// {
// 	expect(version).toBeType('string');
// 	expect(version).toBe(pkg.version);
// }, 500);

// test('create a worker and getState() returns "connecting" right away', async () =>
// {
// 	worker = new Worker(
// 		{
// 			logLevel         : 'debug',
// 			rtcConfiguration : { iceServers: [] }
// 		});

// 	expect(worker.getState()).toBe('connecting');
// 	worker.close();

// 	worker = new Worker(
// 		{
// 			logLevel         : 'debug',
// 			rtcConfiguration :
// 			{
// 				iceServers : [ { urls: [ 'stun:foo.com' ] } ]
// 			}
// 		});

// 	expect(worker.getState()).toBe('connecting');
// 	worker.close();
// });

test('create a worker and emits "open" once connected', async () =>
{
	worker = new Worker(
		{
			logLevel         : 'debug',
			rtcConfiguration : { iceServers: [] }
		});

	await new Promise((resolve) => worker.once('open', resolve));

	expect(worker.getState()).toBe('open');
}, 3000);

test('worker.getRtpCapabilities() succeeds', async () =>
{
	const capabilities = await worker.getRtpCapabilities();

	expect(capabilities).toBeType('string');
}, 3000);

test('worker.getLocalDescription() resolves with undefined right away', async () =>
{
	// eslint-disable-next-line no-shadow
	const localDescription = await worker.getLocalDescription();

	expect(localDescription).toBeType('undefined');
}, 3000);

test('worker.addTrack() with correct SendOptions succeeds', async () =>
{
	const result =
		await worker.addTrack({ kind: 'audio', sourceType: 'device' });

	expect(result).toBeType('object');
	expect(result.trackId).toBeType('string');

	audioTrackId = result.trackId;
}, 3000);

test('worker.addTrack() with wrong SendOptions throws TypeError', async () =>
{
	// Missing options.
	await expect(worker.addTrack())
		.rejects
		.toThrow(TypeError);

	// Missing kind.
	await expect(worker.addTrack({}))
		.rejects
		.toThrow(Error);

	// Missing sourceType.
	await expect(worker.addTrack({ kind: 'audio' }))
		.rejects
		.toThrow(Error);

	// Invalid kind.
	await expect(worker.addTrack({ kind: 'foo', sourceType: 'device' }))
		.rejects
		.toThrow(TypeError);

	// Invalid sourceType.
	await expect(worker.addTrack({ kind: 'audio', sourceType: 'foo' }))
		.rejects
		.toThrow(TypeError);
}, 3000);

test('worker.createOffer() resolves with a RTCSessionDescription', async () =>
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

test('worker.getLocalDescription() resolves with a RTCSessionDescription', async () =>
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

test('worker.removeTrack() with a valid trackId succeeds', async () =>
{
	await worker.removeTrack(audioTrackId);
}, 3000);

test('worker.removeTrack() with an unknown trackId throws', async () =>
{
	await expect(worker.removeTrack('justbecause'))
		.rejects
		.toThrow(Error);
}, 3000);

test('worker.close() succeeds', () =>
{
	worker.close();

	expect(worker.getState()).toBe('closed');
});
