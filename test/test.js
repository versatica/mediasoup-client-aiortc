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
	// for the player.audio track (which was already stopped)
	worker._channel.notify(
		'player.stopTrack', { playerId: audioTrack.data.playerId }, { kind: 'audio' });

	// This will invoke processNotification("player.stopTrack") in worker.py
	// for the player.video track
	// HERE THE PROBLEM: this notification runs code in worker.py that never ends
	worker._channel.notify(
		'player.stopTrack', { playerId: videoTrack.data.playerId }, { kind: 'video' });

	// This will invoke processRequest("dump") in worker.py
	// We need this for this test because, at this point, the issue is that the
	// Python process is blocked *after* player.video.stop() so we won't get any
	// response to the "dump" request here and this test will fail
	await worker.dump();

	// This never happens because we get frozen in the previous await
	// await worker.dump()
	worker.close();
}, 2000);
