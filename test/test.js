const { createWorker } = require('../');

test('reproduce aiortc issue 301', async () =>
{
	const worker = await createWorker({ logLevel: 'debug' });
	const stream = await worker.getUserMedia(
		{
			audio : { source: 'file', file: 'test/small.mp4' },
			video : { source: 'file', file: 'test/small.mp4' }
		});
	const audioTrack = stream.getTracks()[0];
	// eslint-disable-next-line no-unused-vars
	const videoTrack = stream.getTracks()[1];

	// This will invoke processNotification("player.stopTrack") in worker.py
	// for the player.audio track
	audioTrack.stop();

	await new Promise((resolve) => setTimeout(resolve, 50));

	// This will invoke in worker.py:
	//
	// 1. processNotification("player.stopTrack") for player.video track
	// 2. processNotification("player.close") that will call stop() in
	//    both player.audio and player.video
	//
	// It does not invoke "player.stopTrack" for player.audio track because it
	// was already stopped (above in audioTrack.stop())
	stream.close();

	// This will invoke processRequest("dump") in worker.py
	// We need this for this test because, at this point, the issue is that the
	// Python process is blocked *after* player.video.stop() so we won't get any
	// response to the "dump" request here and this test will fail
	await worker.dump();

	// This never happens because we get frozen in the previous await
	// await worker.dump()
	worker.close();
}, 2000);
