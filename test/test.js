const { createWorker } = require('../');

let worker;

test('create a Worker succeeds', async () =>
{
	worker = await createWorker({ logLevel: 'debug' });
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

	// This will invoke processNotification("player.stopTrack") in worker.py
	audioTrack.stop();

	await new Promise(resolve => setTimeout(resolve, 50));

	// This will invoke processNotification("player.close") in worker.py
	stream.close();

	// This will invoke processRequest("dump") in worker.py
	await worker.dump();
}, 4000);

test('worker.close() succeeds', async () =>
{
	worker.close();

	expect(worker.closed).toBe(true);
}, 500);
