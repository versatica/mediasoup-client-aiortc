# TODO

## mediasoup-client-aiortc

* CRITICAL: Python process remains as zombie when Node.js process ends iof webcam was active.
  - Reason why we are calling `loop.close()` instead of gracefully closing `RTCPeerConnection`.
  - However, I (ibc) still see zombie processes from time to time.

* Properly close aiortc `Players` (all their tracks).
  - However it indeed crashes. For instance, if the same file is used for audio and video, closing the video track makes the Python process crash.

* Rebuild the test (copy it from mediasoup-client project).

* `handler.py`: `close()` is async. However, `worker.py` is not doing `await handler.close()`. I expect it to fail in runtime.
  

## aiortc

Things that must be verified, asked or even reported in aiortc project.

* Missing `track.enabled = xxx` setter to pause sending RTP (or generate silence or black video with less bitrate).
  - Issue: https://github.com/aiortc/aiortc/issues/264
  - Workaround: store the legit track and replace it via `sender.replaceTrack()` with the base audio or video track (that sends nothing).

* Crash when using MediaPlayer.
  - Issue: https://github.com/aiortc/aiortc/issues/274
