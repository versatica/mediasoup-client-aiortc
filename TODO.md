# TODO

## mediasoup-client-aiortc

* Regression: This is failing:

```py
async def on_message(message):
    if type(message).__name__ == 'str':
        await self._channel.notify(internalId, "stringmessage", message)
    elif type(message).__name__ == 'bytes':
        errorLogger.warning("binary message reception not implemented")
```

with:

`NameError: free variable 'type' referenced before assignment in enclosing scope`

* DataChannel.
  - No "error" event implemented in aiortc. OK.
  - We do not update `dc.bufferedAmount` in JS. We may notify its native value from Python to JS for each sent message, received message, 'bufferedamountlow' event, etc. 
  - Let's figure out how to deal with binary messages for sending and receiving, we should encode them somehow to JSON serializable text.
  - Let's figure out how to deal with `binaryType` stuff (aiortc does not implement it since it just makes sense in JS).
  - Need DataChannel tests.
  
* Integrate Python linter into `npm run lint`. So it must be in `npm-scripts.js` and must allow custom paths for the required Python executables via `env` (same as in "postinstall" task).


## aiortc

Things that must be verified, asked or even reported in aiortc project.

* Internal track ID does not correspond with track ID in remote offer.
  - Issue: https://github.com/aiortc/aiortc/issues/269

* Our `Aiortc.js` handler uses `this._setupTransport({ localDtlsRole: 'server'` always because aiortc does not implemente ICE Lite and assumes to be ICE controlled when it's SDP answerer. It then reacts to our ICE 487 "Role Conflict" response and switches to ICE controlling and becomes DTLS server.
  - Issue: https://github.com/aiortc/aioice/issues/15

* Missing `track.enabled = xxx` setter to pause sending RTP (or generate silence or black video with less bitrate).
  - Issue: https://github.com/aiortc/aiortc/issues/264
  - Workaround: store the legit track and replace it via `sender.replaceTrack()` with the base audio or video track (that sends nothing).

* Do not close transport on `pc.setRemoteDescription()` if media and data are bundled.
  - PR: https://github.com/aiortc/aiortc/pull/271
