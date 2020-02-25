const { toBeType } = require('jest-tobetype');
const { createWorker } = require('../');

expect.extend({ toBeType });

let worker;

test('create a Worker succeeds', async () =>
{
	worker = await createWorker({ logLevel: 'debug' });

	expect(worker.pid).toBeType('number');
	expect(worker.closed).toBe(false);
}, 2000);

test('worker.getUserMedia() succeeds', async () =>
{
	const stream = await worker.getUserMedia(
		{
			audio : { source: 'file', file: 'test/small.mp4' },
			video : { source: 'file', file: 'test/small.mp4' }
		});
	const audioTrack = stream.getTracks()[0];
	const videoTrack = stream.getTracks()[1];

	await expect(worker.dump())
		.resolves
		.toEqual(
			{
				pid     : worker.pid,
				players :
				[
					{
						id         : audioTrack.data.playerId,
						audioTrack :
						{
							id         : audioTrack.data.nativeTrackId,
							kind       : 'audio',
							readyState : 'live'
						},
						videoTrack :
						{
							id         : videoTrack.data.nativeTrackId,
							kind       : 'video',
							readyState : 'live'
						}
					}
				],
				handlers : []
			});

	// TODO: Uncomment this test once this bug is fixed in aiortc:
	//   https://github.com/aiortc/aiortc/issues/301

	// audioTrack.stop();

	// await expect(worker.dump())
	// 	.resolves
	// 	.toEqual(
	// 	{
	// 		pid      : worker.pid,
	// 		players  :
	// 		[
	// 			{
	// 				id         : audioTrack.data.playerId,
	// 				audioTrack :
	// 				{
	// 					id         : audioTrack.data.nativeTrackId,
	// 					kind       : 'audio',
	// 					readyState : 'ended'
	// 				},
	// 				videoTrack :
	// 				{
	// 					id         : videoTrack.data.nativeTrackId,
	// 					kind       : 'video',
	// 					readyState : 'live'
	// 				}
	// 			}
	// 		],
	// 		handlers : []
	// 	});

	stream.close();

	await expect(worker.dump())
		.resolves
		.toEqual(
		{
			pid      : worker.pid,
			players  : [],
			handlers : []
		});
}, 4000);

test('worker.close() succeeds', async () =>
{
	worker.close();

	expect(worker.closed).toBe(true);
}, 500);
