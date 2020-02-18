# TODO

## mediasoup-client-aiortc

* Implement different options for `sourceType` and `sourceValue`.

* Why is there a `Handler` class in `worker.py` and why does requests and notifications call `handler.xxx()` instead of directly doing the stuff? Do we really need such a `Handler` class and `handler` singleton?
  - __main__ creates a `Channel` (instance) and a `Handler` (instance) and calls `run(channel, handler)`. `run` is just responsible of receiving requests, checking the requests arguments, calling corresponding `Handler` instance, retrieving the result of the method and sending back to the channel. I find good reason for having `Handler` and `Channel` clases.

* DataChannel.
  - No "error" event implemented in aiortc.
  - We do not update `dc.bufferedAmount` in JS. We may notify its native value from py to JS for each sent message, received message, 'bufferedamountlow' event, etc. 
  - Let's figure out how to deal with binary messages for sending and receiving, we should encode them somehow to JSON serializable text.
  - Let's figure out how to deal with `binaryType` stuff (aiortc does not implement it since it just makes sense in JS).
  - Need tests.
  

## aiortc

Things that must be verified, asked or even reported in aiortc project.

* Internal track ID does not correspond with track ID in remote offer:
  - Issue: https://github.com/aiortc/aiortc/issues/269

* `Aiortc.js` uses always `this._setupTransport({ localDtlsRole: 'server'` because aiortc fails to honor given DTLS role in the remote SDP offer and assumes it must always be 'server':
  - Issue: https://github.com/aiortc/aioice/issues/15

* Must report lack of `track.enabled = xxx` to pause sending RTP (or generate silence or black video with less bitrate).
  - Issue: https://github.com/aiortc/aiortc/issues/264
  - Workaround: store the legit track and replace the track via `replaceTrack()` with the base audio or video track (that sends nothing).

* Do not close transport on 'setRemoteDescription' if media and data are bundled
  - PR: https://github.com/aiortc/aiortc/pull/271
