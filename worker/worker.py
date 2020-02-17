import argparse
import asyncio
import json
import signal
import sys
from os import getpid
from typing import Any, Dict, Optional, Union
from pyee import AsyncIOEventEmitter
from aiortc import (
    MediaStreamTrack,
    RTCConfiguration,
    RTCDataChannel,
    RTCPeerConnection,
    RTCRtpTransceiver,
    RTCSessionDescription,
    RTCStatsReport,
)
from aiortc.contrib.media import MediaPlayer
from logger import rootLogger, debugLogger, errorLogger
from channel import Channel

# File descriptors to communicate with the Node.js process
READ_FD = 3
WRITE_FD = 4


# Missing options arguments for PC creation
class Handler(AsyncIOEventEmitter):
    def __init__(self, channel: Channel, configuration: Optional[RTCConfiguration] = None) -> None:
        super().__init__()
        self._pc = RTCPeerConnection(configuration or None)
        self._channel = channel
        # dictionary of transceivers mapped by track id
        self._transceivers = dict()  # type: Dict[str, RTCRtpTransceiver]
        # dictionary of dataChannelds mapped by internal id
        self._dataChannels = dict()  # type: Dict[str, RTCDataChannel]

        @self._pc.on("track")
        def on_track(track):
            debugLogger.debug("ontrack [kind:%s, id:%s]" %
                              (track.kind, track.id))
            # store transceiver in the dictionary
            for transceiver in self._pc.getTransceivers():
                if transceiver.receiver._track is not None:
                    if transceiver.receiver._track.id == track.id:
                        self._transceivers[track.id] = transceiver

        @self._pc.on("iceconnectionstatechange")
        async def on_iceconnectionstatechange():
            debugLogger.debug("iceconnectionstatechange [state:%s]" %
                              self._pc.iceConnectionState)
            self.emit("iceconnectionstatechange", self._pc.iceConnectionState)

        @self._pc.on("icegatheringstatechange")
        async def on_icegatheringstatechange():
            debugLogger.debug("icegatheringstatechange [state:%s]" %
                              self._pc.iceGatheringState)
            self.emit("icegatheringstatechange", self._pc.iceGatheringState)

        @self._pc.on("signalingstatechange")
        async def on_signalingstatechange():
            debugLogger.debug(
                "signalingstatechange [state:%s]" % self._pc.signalingState)
            self.emit("signalingstatechange", self._pc.signalingState)

    async def close(self) -> None:
        # stop tracks
        for sender in self._pc.getSenders():
            if sender.track is not None:
                sender.track.stop()

        # close peerconnection
        await self._pc.close()

    async def getRtpCapabilities(self) -> str:
        pc = RTCPeerConnection()
        pc.addTransceiver("audio", "sendonly")
        pc.addTransceiver("video", "sendonly")
        offer = await pc.createOffer()
        await pc.close()
        return offer.sdp

    def getLocalDescription(self) -> Union[RTCSessionDescription, None]:
        return self._pc.localDescription

    def addTrack(self, kind: str, sourceType: str, sourceValue: Optional[str]) -> str:
        track = self._getTrack(kind, sourceType, sourceValue)
        transceiver = self._pc.addTransceiver(track)
        # store transceiver in the dictionary
        self._transceivers[track.id] = transceiver
        return track.id

    def removeTrack(self, trackId: str) -> None:
        try:
            transceiver = self._transceivers[trackId]
        except KeyError:
            raise Exception(
                "no transceiver for the given trackId: '%s'" % trackId)

        transceiver.direction = "inactive"
        transceiver.sender.track.stop()
        transceiver.sender.replaceTrack(None)
        del self._transceivers[trackId]

    async def setLocalDescription(self, description: RTCSessionDescription) -> None:
        await self._pc.setLocalDescription(description)

    async def setRemoteDescription(self, description: RTCSessionDescription) -> None:
        await self._pc.setRemoteDescription(description)

    async def createOffer(self) -> RTCSessionDescription:
        return await self._pc.createOffer()

    async def createAnswer(self) -> RTCSessionDescription:
        return await self._pc.createAnswer()

    def getMid(self, trackId: str) -> str:
        try:
            transceiver = self._transceivers[trackId]
        except KeyError:
            raise Exception(
                "no transceiver for the given trackId: '%s'" % trackId)

        return transceiver.mid

    def enableTrack(self, trackId: str) -> None:
        # try:
        #     transceiver = self._transceivers[trackId]
        # except KeyError:
        #     raise Exception("no transceiver for the given trackId: '%s'" % trackId)

        errorLogger.warning("enabling track not implemented")

    def disableTrack(self, trackId: str) -> None:
        # try:
        #     transceiver = self._transceivers[trackId]
        # except KeyError:
        #     raise Exception("no transceiver for the given trackId: '%s'" % trackId)

        errorLogger.warning("disabling track not implemented")

    def createDataChannel(
        self,
        internalId: str,
        id: str,
        ordered: bool,
        maxPacketLifeTime: None,
        maxRetransmits: None,
        label: str,
        protocol: str
    ) -> Any:
        dataChannel = self._pc.createDataChannel(
            negotiated=True,
            id=id,
            ordered=ordered,
            maxPacketLifeTime=maxPacketLifeTime,
            maxRetransmits=maxRetransmits,
            label=label,
            protocol=protocol
        )

        @dataChannel.on("open")
        async def on_open():
            await self._channel.notify(internalId, "open")

        @dataChannel.on("close")
        async def on_close():
            await self._channel.notify(internalId, "close")

        @dataChannel.on("message")
        async def on_message(message):
            if type(message).__name__ == 'str':
                await self._channel.notify(internalId, "stringmessage", message)
            elif type(message).__name__ == 'bytes':
                errorLogger.warning("binary message reception not implemented")

        self._dataChannels[internalId] = dataChannel

        return {
            "streamId": dataChannel.id,
            "ordered": dataChannel.ordered,
            "maxPacketLifeTime": dataChannel.maxPacketLifeTime,
            "maxRetransmits": dataChannel.maxRetransmits,
            "label": dataChannel.label,
            "protocol": dataChannel.protocol,
            "readyState": dataChannel.readyState,
            "bufferedAmount": dataChannel.bufferedAmount,
            "bufferedAmountLowThreshold": dataChannel.bufferedAmountLowThreshold
        }

    def send(self, dataChannelId: str, data=None) -> None:
        try:
            dataChannel = self._dataChannels[dataChannelId]
        except KeyError:
            raise Exception(
                "no dataChannel for the given dataChannelId: '%s'" % dataChannelId)

        dataChannel.send(data)

    def closeDataChannel(self, dataChannelId: str) -> None:
        try:
            dataChannel = self._dataChannels[dataChannelId]
        except KeyError:
            raise Exception(
                "no dataChannel for the given dataChannelId: '%s'" % dataChannelId)

        dataChannel.close()

    def setBufferedAmountLowThreshold(self, dataChannelId: str, value: int) -> None:
        try:
            dataChannel = self._dataChannels[dataChannelId]
        except KeyError:
            raise Exception(
                "no dataChannel for the given dataChannelId: '%s'" % dataChannelId)

        dataChannel.bufferedAmountLowThreshold = value

    async def getTransportStats(self) -> Dict[str, Any]:
        statsJson = {}
        stats = await self._pc.getStats()
        for key in stats:
            type = stats[key].type
            if type == "inbound-rtp":
                statsJson[key] = self._serializeInboundStats(stats[key])
            elif type == "outbound-rtp":
                statsJson[key] = self._serializeOutboundStats(stats[key])
            elif type == "remote-inbound-rtp":
                statsJson[key] = self._serializeRemoteInboundStats(stats[key])
            elif type == "remote-outbound-rtp":
                statsJson[key] = self._serializeRemoteOutboundStats(stats[key])
            elif type == "transport":
                statsJson[key] = self._serializeTransportStats(stats[key])

        return statsJson

    async def getSenderStats(self, trackId: str) -> Dict[str, Any]:
        try:
            transceiver = self._transceivers[trackId]
        except KeyError:
            raise Exception(
                "no transceiver for the given trackId: '%s'" % trackId)

        sender = transceiver.sender
        statsJson = {}
        stats = await sender.getStats()
        for key in stats:
            type = stats[key].type
            if type == "outbound-rtp":
                statsJson[key] = self._serializeOutboundStats(stats[key])
            elif type == "remote-inbound-rtp":
                statsJson[key] = self._serializeRemoteInboundStats(stats[key])

        return statsJson

    async def getReceiverStats(self, trackId: str) -> Dict[str, Any]:
        try:
            transceiver = self._transceivers[trackId]
        except KeyError:
            raise Exception(
                "no transceiver for the given trackId: '%s'" % trackId)

        receiver = transceiver.receiver
        statsJson = {}
        stats = await receiver.getStats()
        for key in stats:
            type = stats[key].type
            if type == "inbound-rtp":
                statsJson[key] = self._serializeOutboundStats(stats[key])
            elif type == "remote-outbound-rtp":
                statsJson[key] = self._serializeRemoteInboundStats(stats[key])

        return statsJson

    """
    Helper functions
    """

    def _serializeInboundStats(self, stats: RTCStatsReport) -> Dict[str, Any]:
        return {
            # RTCStats
            "timestamp": stats.timestamp.timestamp(),
            "type": stats.type,
            "id": stats.id,
            # RTCStreamStats
            "ssrc": stats.ssrc,
            "kind": stats.kind,
            "transportId": stats.transportId,
            # RTCReceivedRtpStreamStats
            "packetsReceived": stats.packetsReceived,
            "packetsLost": stats.packetsLost,
            "jitter": stats.jitter,
        }

    def _serializeOutboundStats(self, stats: RTCStatsReport) -> Dict[str, Any]:
        return {
            # RTCStats
            "timestamp": stats.timestamp.timestamp(),
            "type": stats.type,
            "id": stats.id,
            # RTCStreamStats
            "ssrc": stats.ssrc,
            "kind": stats.kind,
            "transportId": stats.transportId,
            # RTCSentRtpStreamStats
            "packetsSent": stats.packetsSent,
            "bytesSent": stats.bytesSent,
            # RTCOutboundRtpStreamStats
            "trackId": stats.trackId,
        }

    def _serializeRemoteInboundStats(self, stats: RTCStatsReport) -> Dict[str, Any]:
        return {
            # RTCStats
            "timestamp": stats.timestamp.timestamp(),
            "type": stats.type,
            "id": stats.id,
            # RTCStreamStats
            "ssrc": stats.ssrc,
            "kind": stats.kind,
            "transportId": stats.transportId,
            # RTCReceivedRtpStreamStats
            "packetsReceived": stats.packetsReceived,
            "packetsLost": stats.packetsLost,
            "jitter": stats.jitter,
            # RTCRemoteInboundRtpStreamStats
            "roundTripTime": stats.roundTripTime,
            "fractionLost": stats.fractionLost,
        }

    def _serializeRemoteOutboundStats(self, stats: RTCStatsReport) -> Dict[str, Any]:
        return {
            # RTCStats
            "timestamp": stats.timestamp.timestamp(),
            "type": stats.type,
            "id": stats.id,
            # RTCStreamStats
            "ssrc": stats.ssrc,
            "kind": stats.kind,
            "transportId": stats.transportId,
            # RTCSentRtpStreamStats
            "packetsSent": stats.packetsSent,
            "bytesSent": stats.bytesSent,
            "jitter": stats.jitter,
            # RTCRemoteOutboundRtpStreamStats
            "remoteTimestamp": stats.remoteTimestamp.timestamp(),
        }

    def _serializeTransportStats(self, stats: RTCStatsReport) -> Dict[str, Any]:
        return {
            # RTCStats
            "timestamp": stats.timestamp.timestamp(),
            "type": stats.type,
            "id": stats.id,
            # RTCTransportStats,
            "packetsSent": stats.packetsSent,
            "packetsReceived": stats.packetsReceived,
            "bytesSent": stats.bytesSent,
            "bytesReceived": stats.bytesReceived,
            "iceRole": stats.iceRole,
            "dtlsState": stats.dtlsState,
        }

    # TODO: complete.
    def _getTrack(self, kind: str, sourceType: str, sourceValue: Optional[str]) -> MediaStreamTrack:
        # check for other OS: https://aiortc.readthedocs.io/en/latest/helpers.html
        if (kind == "audio"):
            player = MediaPlayer("none:0", format="avfoundation")
            return player.audio
        if (kind == "video"):
            player = MediaPlayer("default:none", format="avfoundation", options={
                "framerate": "30", "video_size": "640x480"
            })
            return player.video


async def run(channel, handler) -> None:
    pid = getpid()

    """
    Request class
    """
    class Request:
        def __init__(self, id: str, method: str, data=None, internal=None) -> None:
            self._id = id
            self.method = method
            self.data = data
            self.internal = internal

        async def succeed(self, data=None) -> None:
            if data:
                await channel.send(json.dumps({
                    "id": self._id,
                    "accepted": True,
                    "data": data
                }, sort_keys=True))
            else:
                await channel.send(json.dumps({
                    "id": self._id,
                    "accepted": True
                }, sort_keys=True))

        async def failed(self, error) -> None:
            errorType = "Error"
            if isinstance(error, TypeError):
                errorType = "TypeError"

            await channel.send(json.dumps({
                "id": self._id,
                "error": errorType,
                "reason": str(error)
            }, sort_keys=True))

    """
    Notification class
    """
    class Notification:
        def __init__(self, event: str, data=None, internal=None) -> None:
            self.event = event
            self.data = data
            self.internal = internal

    @handler.on("iceconnectionstatechange")
    async def on_iceconnectionstatechange(iceConnectionState):
        await channel.notify(pid, "iceconnectionstatechange", iceConnectionState)

    @handler.on("icegatheringstatechange")
    async def on_icegatheringstatechange(iceGatheringState):
        await channel.notify(pid, "icegatheringstatechange", iceGatheringState)

    @handler.on("signalingstatechange")
    async def on_signalingstatechange(signalingState):
        await channel.notify(pid, "signalingstatechange", signalingState)

    async def processRequest(request: Request) -> None:
        if request.method == "getRtpCapabilities":
            try:
                capabilities = await handler.getRtpCapabilities()
                await request.succeed(capabilities)
            except Exception as error:
                await request.failed(error)

        elif request.method == "getLocalDescription":
            try:
                localDescription = handler.getLocalDescription()

                result = None
                if (localDescription is not None):
                    result = {}
                    result["type"] = localDescription.type
                    result["sdp"] = localDescription.sdp

                await request.succeed(result)
            except Exception as error:
                await request.failed(error)

        elif request.method == "addTrack":
            """
            Check data object
            """
            if request.data is None:
                await request.failed(TypeError("missing 'data' field in request"))
                return

            data = request.data
            if "kind" not in data or "sourceType" not in data:
                await request.failed(TypeError("missing 'kind' or 'source' field in request data"))
                return

            if data["sourceType"] != "device" and "sourceValue" not in data:
                await request.failed(TypeError("missing 'sourceValue' field in request data"))
                return

            try:
                if "sourceValue" in data:
                    trackId = handler.addTrack(
                        data["kind"], data["sourceType"], data["sourceValue"])
                else:
                    trackId = handler.addTrack(
                        data["kind"], data["sourceType"], None)

                result = {}
                result["trackId"] = trackId

                await request.succeed(result)
            except Exception as error:
                await request.failed(error)

        elif request.method == "removeTrack":
            """
            Check data object
            """
            if request.data is None:
                errorLogger.error("missing 'data' field in request")
                return

            data = request.data
            if "trackId" not in data:
                await request.failed(TypeError("missing 'trackId' field in request data"))
                return

            try:
                handler.removeTrack(data["trackId"])
                await request.succeed()
            except Exception as error:
                await request.failed(error)

        elif request.method == "setLocalDescription":
            """
            Check data object
            """
            if request.data is None:
                errorLogger.error("missing 'data' field in request")
                return

            data = request.data
            if isinstance(data, RTCSessionDescription):
                await request.failed(TypeError("request data not a RTCSessionDescription"))
                return

            try:
                await handler.setLocalDescription(RTCSessionDescription(**data))
                await request.succeed()
            except Exception as error:
                await request.failed(error)

        elif request.method == "setRemoteDescription":
            """
            Check data object
            """
            if request.data is None:
                errorLogger.error("missing 'data' field in request")
                return

            data = request.data
            if isinstance(data, RTCSessionDescription):
                await request.failed(TypeError("request data not a RTCSessionDescription"))
                return

            try:
                await handler.setRemoteDescription(RTCSessionDescription(**data))
                await request.succeed()
            except Exception as error:
                await request.failed(error)

        elif request.method == "createOffer":
            try:
                offer = await handler.createOffer()
                result = {}
                result["type"] = offer.type
                result["sdp"] = offer.sdp

                await request.succeed(result)
            except Exception as error:
                await request.failed(error)

        elif request.method == "createAnswer":
            try:
                answer = await handler.createAnswer()
                result = {}
                result["type"] = answer.type
                result["sdp"] = answer.sdp

                await request.succeed(result)
            except Exception as error:
                await request.failed(error)

        elif request.method == "getMid":
            """
            Check data object
            """
            if request.data is None:
                errorLogger.error("missing 'data' field in request")
                return

            data = request.data
            if "trackId" not in data:
                await request.failed(TypeError("missing 'trackId' field in request data"))
                return

            try:
                mid = handler.getMid(data["trackId"])
                await request.succeed(mid)
            except Exception as error:
                await request.failed(error)

        elif request.method == "createDataChannel":
            """
            Check data object
            """
            if request.data is None:
                errorLogger.error("missing 'data' field in request")
                return

            if request.internal is None:
                errorLogger.error("missing 'data' field in request")
                return

            data = request.data
            internal = request.internal

            dataChannelInfo = None

            try:
                dataChannelInfo = handler.createDataChannel(
                    internalId=internal["dataChannelId"],
                    id=data["id"],
                    ordered=data["ordered"],
                    maxPacketLifeTime=data["maxPacketLifeTime"],
                    maxRetransmits=data["maxRetransmits"],
                    label=data["label"],
                    protocol=data["protocol"]
                )

                await request.succeed(dataChannelInfo)
            except Exception as error:
                await request.failed(error)

        elif request.method == "getTransportStats":
            try:
                stats = await handler.getTransportStats()
                await request.succeed(stats)
            except Exception as error:
                await request.failed(error)

        elif request.method == "getSenderStats":
            """
            Check data object
            """
            if request.data is None:
                errorLogger.error("missing 'data' field in request")
                return

            data = request.data
            if "trackId" not in data:
                await request.failed(TypeError("missing 'trackId' field in request data"))
                return

            try:
                stats = await handler.getSenderStats(data["trackId"])
                await request.succeed(stats)
            except Exception as error:
                await request.failed(error)

        elif request.method == "getReceiverStats":
            """
            Check data object
            """
            if request.data is None:
                errorLogger.error("missing 'data' field in request")
                return

            data = request.data
            if "trackId" not in data:
                await request.failed(TypeError("missing 'trackId' field in request data"))
                return

            try:
                stats = await handler.getReceiverStats(data["trackId"])
                await request.succeed(stats)
            except Exception as error:
                await request.failed(error)

        else:
            errorLogger.error("unknown method received: %s" % request.method)

    async def processNotification(notification: Notification) -> None:
        if notification.event == "enableTrack":
            """
            Check data object
            """
            if notification.data is None:
                errorLogger.error("missing 'data' field in notification")
                return

            data = notification.data
            if "trackId" not in data:
                errorLogger.error(
                    "missing 'trackId' field in notification data")
                return

            try:
                handler.enableTrack(data["trackId"])
            except Exception as error:
                errorLogger.error("enableTrack() failed: %s" % error)

        elif notification.event == "disableTrack":
            """
            Check data object
            """
            if notification.data is None:
                errorLogger.error("missing 'data' field in notification")
                return

            data = notification.data
            if "trackId" not in data:
                errorLogger.error(
                    "missing 'trackId' field in notification data")
                return

            try:
                handler.disableTrack(data["trackId"])
            except Exception as error:
                errorLogger.error("disableTrack() failed: %s" % error)

        elif notification.event == "datachannel.send":
            """
            Check data object
            """
            if notification.data is None:
                errorLogger.error("missing 'data' field in notification")
                return

            if notification.internal is None:
                errorLogger.error("missing 'data' field in notification")
                return

            data = notification.data
            internal = notification.internal

            try:
                handler.send(internal["dataChannelId"], data)
            except Exception as error:
                errorLogger.error("datachannel.send() failed: %s" % error)

        elif notification.event == "datachannel.close":
            """
            Check internal object
            """
            if notification.internal is None:
                errorLogger.error("missing 'data' field in notification")
                return

            internal = notification.internal

            try:
                handler.closeDataChannel(internal["dataChannelId"])
            except Exception as error:
                errorLogger.error("datachannel.close() failed: %s" % error)

        elif notification.event == "datachannel.setBufferedAmountLowThreshold":
            """
            Check data object
            """
            if notification.data is None:
                errorLogger.error("missing 'data' field in notification")
                return

            if notification.internal is None:
                errorLogger.error("missing 'data' field in notification")
                return

            value = notification.data
            internal = notification.internal

            try:
                handler.setBufferedAmountLowThreshold(
                    internal["dataChannelId"], value)
            except Exception as error:
                errorLogger.error("datachannel.close() failed: %s" % error)

    # tell the Node process that we are running
    await channel.notify(getpid(), "running")

    # consume channel
    while True:
        try:
            obj = await channel.receive()

            if obj is None:
                continue
            elif "method" in obj:
                await processRequest(Request(**obj))
            elif "event" in obj:
                await processNotification(Notification(**obj))

        except Exception:
            shutdown()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="aiortc mediasoup-client handler")
    parser.add_argument("--logLevel", "-l",
                        choices=["debug", "warn", "error", "none"])
    parser.add_argument("--rtcConfiguration", "-c",
                        help="RTCConfiguration string")
    args = parser.parse_args()

    """
    Argument handling
    """
    if args.logLevel and args.logLevel != "none":
        rootLogger.setLevel(args.logLevel.upper())
        debugLogger.setLevel(args.logLevel.upper())
        errorLogger.setLevel(args.logLevel.upper())

    debugLogger.debug("starting mediasoup-client aiortc worker")

    # use RTCConfiguration if given
    rtcConfiguration = None
    if args.rtcConfiguration:
        rtcConfiguration = args.rtcConfiguration

    """
    Initialization
    """
    # run event loop
    loop = asyncio.get_event_loop()

    # create channel
    channel = Channel(loop, READ_FD, WRITE_FD)

    # create handler
    try:
        handler = Handler(channel, rtcConfiguration)
    except Exception as error:
        debugLogger.error("invalid RTCConfiguration: %s" % error)
        sys.exit(42)

    """
    Signal handling
    """
    def shutdown():
        loop.close()

    # signal handler
    loop.add_signal_handler(signal.SIGINT, shutdown)
    loop.add_signal_handler(signal.SIGTERM, shutdown)

    try:
        loop.run_until_complete(
            run(channel=channel, handler=handler)
        )
    # reached here after loop.stop()
    except RuntimeError:
        pass
    finally:
        loop.run_until_complete(handler.close())
        loop.run_until_complete(channel.close())
