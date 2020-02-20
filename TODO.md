# TODO

## mediasoup-client-aiortc

* CRITICAL: Python process remains as zombie when Node.js process ends iof webcam was active.
  - Reason why we are calling `loop.close()` instead of gracefully closing `RTCPeerConnection`.
  - However, I (ibc) still see zombie processes from time to time.

* Properly close aiortc `Players` (all their tracks).
  - However it indeed crashes. For instance, if the same file is used for audio and video, closing the video track makes the Python process crash.

* Need DataChannel tests.
  

## aiortc

Things that must be verified, asked or even reported in aiortc project.

* Internal track ID does not correspond with track ID in remote offer.
  - Issue: https://github.com/aiortc/aiortc/issues/269
  - Done in `aiortc` master branch, not yet released.

* Our `Aiortc.js` handler uses `this._setupTransport({ localDtlsRole: 'server'` always because aiortc does not implemente ICE Lite and assumes to be ICE controlled when it's SDP answerer. It then reacts to our ICE 487 "Role Conflict" response and switches to ICE controlling and becomes DTLS server.
  - Issue: https://github.com/aiortc/aioice/issues/15

* Missing `track.enabled = xxx` setter to pause sending RTP (or generate silence or black video with less bitrate).
  - Issue: https://github.com/aiortc/aiortc/issues/264
  - Workaround: store the legit track and replace it via `sender.replaceTrack()` with the base audio or video track (that sends nothing).

* Do not close transport on `pc.setRemoteDescription()` if media and data are bundled.
  - PR: https://github.com/aiortc/aiortc/pull/271
  - Done in `aiortc` master branch, not yet released.

* Crash when using MediaPlayer.
  - Issue: https://github.com/aiortc/aiortc/issues/274
