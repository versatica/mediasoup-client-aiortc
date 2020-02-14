# TODO

## mediasoup-client-aiortc

* Do DataChannel.

* Use `sourceType` for files and URLs.

## aiortc

Things that must be verified, asked or even reported in aiortc project.

* Must verify max number of SCTP streams (`OS` and `MIS`). For instance it's `OS: 1024, MIS: 1024` in Chrome (cannot renegotiate it later) and `OS: 16, MIS: 2048` in Firefox (which does allow later renegotiation).
  - In https://github.com/aiortc/aiortc/blob/master/src/aiortc/rtcsctptransport.py:
    `MAX_STREAMS = 65535`, and it seems to support renegotiation.

* Must report lack of `track.enabled = xxx` to pause sending RTP (or generate silence or black video with less bitrate).
  - Reported: https://github.com/aiortc/aiortc/issues/264
  - Store the legit track and replace the track `replaceTrack` with the base audio or video track.
