# TODO

## mediasoup-client-aiortc

* Rebuild the test (copy it from mediasoup-client project).

* Missing `replaceTrack()` API and others.
  

## aiortc

Things that must be verified, asked or even reported in aiortc project.

* CRITICAL: Python zombie process. `await pc.close()` does not complete if its sending tracks were `stopped()` before.
  - Issue: https://github.com/aiortc/aiortc/issues/283

* Crash when using MediaPlayer.
  - Issue: https://github.com/aiortc/aiortc/issues/274

* Missing `track.enabled = xxx` setter to pause sending RTP (or generate silence or black video with less bitrate).
  - Issue: https://github.com/aiortc/aiortc/issues/264
  - Workaround: store the legit track and replace it via `sender.replaceTrack()` with the base audio or video track (that sends nothing).

* Tons of keyframes after receiving a PLI.
  - Issue: https://github.com/aiortc/aiortc/issues/275
  - Fixed in `aiortc` "master" branch.
