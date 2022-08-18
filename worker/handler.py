from typing import Any, Dict, Optional
import base64
import asyncio
from aiortc import (
    RTCConfiguration,
    RTCDataChannel,
    RTCPeerConnection,
    RTCRtpTransceiver,
    RTCSessionDescription,
    RTCStatsReport
)

from channel import Request, Notification, Channel
from logger import Logger


class Handler:
    def __init__(
        self,
        handlerId: str,
        channel: Channel,
        loop: asyncio.AbstractEventLoop,
        getTrack,
        addRemoteTrack,
        getRemoteTrack,
        configuration: Optional[RTCConfiguration] = None
    ) -> None:
        self._handlerId = handlerId
        self._channel = channel
        self._pc = RTCPeerConnection(configuration or None)
        # dictionary of sending transceivers mapped by given localId
        self._sendTransceivers = dict()  # type: Dict[str, RTCRtpTransceiver]
        # dictionary of dataChannelds mapped by internal id
        self._dataChannels = dict()  # type: Dict[str, RTCDataChannel]
        # function returning a sending track given a player id and a kind
        self._getTrack = getTrack
        # function to store a receiving track
        self._addRemoteTrack = addRemoteTrack
        # function returning a receiving track
        self._getRemoteTrack = getRemoteTrack

        @self._pc.on("track")  # type: ignore
        def on_track(track) -> None:
            Logger.debug(f"handler: ontrack [kind:{track.kind}, id:{track.id}]")

            # store it
            self._addRemoteTrack(track)

        @self._pc.on("signalingstatechange")  # type: ignore
        async def on_signalingstatechange() -> None:
            Logger.debug(
                f"handler: signalingstatechange [state:{self._pc.signalingState}]"
            )
            await self._channel.notify(
                self._handlerId,
                "signalingstatechange",
                self._pc.signalingState
            )

        @self._pc.on("icegatheringstatechange")  # type: ignore
        async def on_icegatheringstatechange() -> None:
            Logger.debug(
                f"handler: icegatheringstatechange [state:{self._pc.iceGatheringState}]"
            )
            await self._channel.notify(
                self._handlerId,
                "icegatheringstatechange",
                self._pc.iceGatheringState
            )

        @self._pc.on("iceconnectionstatechange")  # type: ignore
        async def on_iceconnectionstatechange() -> None:
            Logger.debug(
                f"handler: iceconnectionstatechange [state:{self._pc.iceConnectionState}]"
            )
            await self._channel.notify(
                self._handlerId,
                "iceconnectionstatechange",
                self._pc.iceConnectionState
            )

        async def checkDataChannelsBufferedAmount() -> None:
            while True:
                await asyncio.sleep(1)
                for dataChannelId, dataChannel in self._dataChannels.items():
                    await self._channel.notify(dataChannelId, "bufferedamount", dataChannel.bufferedAmount)

        self._dataChannelsBufferedAmountTask = loop.create_task(
            checkDataChannelsBufferedAmount()
        )

    async def close(self) -> None:
        # stop the periodic task
        self._dataChannelsBufferedAmountTask.cancel()

        # close peerconnection
        await self._pc.close()

    def dump(self) -> Any:
        result = {
            "id": self._handlerId,
            "signalingState": self._pc.signalingState,
            "iceConnectionState": self._pc.iceConnectionState,
            "iceGatheringState": self._pc.iceGatheringState,
            "transceivers": [],
            "sendTransceivers": []
        }

        for transceiver in self._pc.getTransceivers():
            transceiverInfo = {
                "mid": transceiver.mid,
                "stopped": transceiver.stopped,
                "kind": transceiver.kind,
                "currentDirection": transceiver.currentDirection,
                "direction": transceiver.direction,
                "sender": {
                    "trackId": transceiver.sender.track.id if transceiver.sender.track else None
                },
                "receiver": {
                    "trackId": transceiver.receiver.track.id if transceiver.receiver.track else None
                }
            }
            result["transceivers"].append(transceiverInfo)

        for localId, transceiver in self._sendTransceivers.items():
            sendTransceiverInfo = {
                "localId": localId,
                "mid": transceiver.mid
            }
            result["sendTransceivers"].append(sendTransceiverInfo)

        return result

    async def processRequest(self, request: Request) -> Any:
        if request.method == "handler.getLocalDescription":
            localDescription = self._pc.localDescription
            if (localDescription is not None):
                return {
                    "type": localDescription.type,
                    "sdp": localDescription.sdp
                }
            else:
                return None

        elif request.method == "handler.createOffer":
            offer = await self._pc.createOffer()
            return {
                "type": offer.type,
                "sdp": offer.sdp
            }

        elif request.method == "handler.createAnswer":
            answer = await self._pc.createAnswer()
            return {
                "type": answer.type,
                "sdp": answer.sdp
            }

        elif request.method == "handler.setLocalDescription":
            data = request.data
            if isinstance(data, RTCSessionDescription):
                raise TypeError("request data not a RTCSessionDescription")

            description = RTCSessionDescription(**data)
            await self._pc.setLocalDescription(description)

        elif request.method == "handler.setRemoteDescription":
            data = request.data
            if isinstance(data, RTCSessionDescription):
                raise TypeError("request data not a RTCSessionDescription")

            description = RTCSessionDescription(**data)
            await self._pc.setRemoteDescription(description)

        elif request.method == "handler.getMid":
            data = request.data
            localId = data.get("localId")
            if localId is None:
                raise TypeError("missing data.localId")

            # raise on purpose if the key is not found
            transceiver = self._sendTransceivers[localId]
            return transceiver.mid

        elif request.method == "handler.addTrack":
            data = request.data
            localId = data.get("localId")
            if localId is None:
                raise TypeError("missing data.localId")

            kind = data["kind"]
            playerId = data.get("playerId")
            recvTrackId = data.get("recvTrackId")

            # sending a track got from a MediaPlayer
            if playerId:
                track = self._getTrack(playerId, kind)
                transceiver = self._pc.addTransceiver(track)

            # sending a track which is a remote/receiving track
            elif recvTrackId:
                track = self._getRemoteTrack(recvTrackId, kind)
                transceiver = self._pc.addTransceiver(track)

            else:
                raise TypeError("missing data.playerId or data.recvTrackId")

            # store transceiver in the dictionary
            self._sendTransceivers[localId] = transceiver

        elif request.method == "handler.removeTrack":
            data = request.data
            localId = data.get("localId")
            if localId is None:
                raise TypeError("missing data.localId")

            transceiver = self._sendTransceivers[localId]
            transceiver.direction = "inactive"
            transceiver.sender.replaceTrack(None)

            # NOTE: do not remove transceiver from the dictionary

        elif request.method == "handler.replaceTrack":
            data = request.data
            localId = data.get("localId")
            if localId is None:
                raise TypeError("missing data.localId")

            kind = data["kind"]
            playerId = data.get("playerId")
            recvTrackId = data.get("recvTrackId")
            transceiver = self._sendTransceivers[localId]

            # sending a track got from a MediaPlayer
            if playerId:
                track = self._getTrack(playerId, kind)

            # sending a track which is a remote/receiving track
            elif recvTrackId:
                track = self._getRemoteTrack(recvTrackId, kind)

            else:
                raise TypeError("missing data.playerId or data.recvTrackId")

            transceiver.sender.replaceTrack(track)

        elif request.method == "handler.setTrackDirection":
            data = request.data
            localId = data.get("localId")
            direction = data.get("direction")

            if localId is None:
                raise TypeError("missing data.localId")
            if direction is None:
                raise TypeError("missing data.direction")

            transceiver = self._sendTransceivers[localId]
            transceiver.direction = direction

        elif request.method == "handler.getTransportStats":
            result = {}
            stats = await self._pc.getStats()
            for key in stats:
                type = stats[key].type
                if type == "inbound-rtp":
                    result[key] = self._serializeInboundStats(stats[key])
                elif type == "outbound-rtp":
                    result[key] = self._serializeOutboundStats(stats[key])
                elif type == "remote-inbound-rtp":
                    result[key] = self._serializeRemoteInboundStats(stats[key])
                elif type == "remote-outbound-rtp":
                    result[key] = self._serializeRemoteOutboundStats(stats[key])
                elif type == "transport":
                    result[key] = self._serializeTransportStats(stats[key])

            return result

        elif request.method == "handler.getSenderStats":
            data = request.data
            mid = data.get("mid")
            if mid is None:
                raise TypeError("missing data.mid")

            transceiver = self._getTransceiverByMid(mid)
            sender = transceiver.sender
            result = {}
            stats = await sender.getStats()
            for key in stats:
                type = stats[key].type
                if type == "outbound-rtp":
                    result[key] = self._serializeOutboundStats(stats[key])
                elif type == "remote-inbound-rtp":
                    result[key] = self._serializeRemoteInboundStats(stats[key])
                elif type == "transport":
                    result[key] = self._serializeTransportStats(stats[key])

            return result

        elif request.method == "handler.getReceiverStats":
            data = request.data
            mid = data.get("mid")
            if mid is None:
                raise TypeError("missing data.mid")

            transceiver = self._getTransceiverByMid(mid)
            receiver = transceiver.receiver
            result = {}
            stats = await receiver.getStats()
            for key in stats:
                type = stats[key].type
                if type == "inbound-rtp":
                    result[key] = self._serializeInboundStats(stats[key])
                elif type == "remote-outbound-rtp":
                    result[key] = self._serializeRemoteOutboundStats(stats[key])
                elif type == "transport":
                    result[key] = self._serializeTransportStats(stats[key])

            return result

        elif request.method == "handler.createDataChannel":
            internal = request.internal
            dataChannelId = internal.get("dataChannelId")
            data = request.data
            id = data.get("id")
            ordered = data.get("ordered")
            maxPacketLifeTime = data.get("maxPacketLifeTime")
            maxRetransmits = data.get("maxRetransmits")
            label = data.get("label")
            protocol = data.get("protocol")
            dataChannel = self._pc.createDataChannel(
                negotiated=True,
                id=id,
                ordered=ordered,
                maxPacketLifeTime=maxPacketLifeTime,
                maxRetransmits=maxRetransmits,
                label=label,
                protocol=protocol
            )

            # store datachannel in the dictionary
            self._dataChannels[dataChannelId] = dataChannel

            @dataChannel.on("open")  # type: ignore
            async def on_open() -> None:
                await self._channel.notify(dataChannelId, "open")

            @dataChannel.on("closing")  # type: ignore
            async def on_closing() -> None:
                await self._channel.notify(dataChannelId, "closing")

            @dataChannel.on("close")  # type: ignore
            async def on_close() -> None:
                # NOTE: After calling dataChannel.close() aiortc emits "close" event
                # on the dataChannel. Probably it shouldn't do it. So caution.
                try:
                    del self._dataChannels[dataChannelId]
                    await self._channel.notify(dataChannelId, "close")
                except KeyError:
                    pass

            @dataChannel.on("message")  # type: ignore
            async def on_message(message) -> None:
                if isinstance(message, str):
                    await self._channel.notify(dataChannelId, "message", message)
                if isinstance(message, bytes):
                    message_bytes = base64.b64encode(message)
                    await self._channel.notify(
                        dataChannelId, "binary", str(message_bytes))

            @dataChannel.on("bufferedamountlow")  # type: ignore
            async def on_bufferedamountlow() -> None:
                await self._channel.notify(dataChannelId, "bufferedamountlow")

            return {
                "streamId": dataChannel.id,
                "ordered": dataChannel.ordered,
                "maxPacketLifeTime": dataChannel.maxPacketLifeTime,
                "maxRetransmits": dataChannel.maxRetransmits,
                "label": dataChannel.label,
                "protocol": dataChannel.protocol,
                # status fields
                "readyState": dataChannel.readyState,
                "bufferedAmount": dataChannel.bufferedAmount,
                "bufferedAmountLowThreshold": dataChannel.bufferedAmountLowThreshold
            }

        else:
            raise TypeError("unknown request method")

    async def processNotification(self, notification: Notification) -> None:
        if notification.event == "enableTrack":
            Logger.warning("handler: enabling track not implemented")

        elif notification.event == "disableTrack":
            Logger.warning("handler: disabling track not implemented")

        elif notification.event == "datachannel.send":
            internal = notification.internal
            dataChannelId = internal.get("dataChannelId")
            if dataChannelId is None:
                raise TypeError("missing internal.dataChannelId")

            data = notification.data
            dataChannel = self._dataChannels[dataChannelId]
            dataChannel.send(data)

            # Good moment to update bufferedAmount in Node.js side
            await self._channel.notify(
                dataChannelId, "bufferedamount", dataChannel.bufferedAmount
            )

        elif notification.event == "datachannel.sendBinary":
            internal = notification.internal
            dataChannelId = internal.get("dataChannelId")
            if dataChannelId is None:
                raise TypeError("missing internal.dataChannelId")

            data = notification.data
            dataChannel = self._dataChannels[dataChannelId]
            dataChannel.send(base64.b64decode(data))

            # Good moment to update bufferedAmount in Node.js side
            await self._channel.notify(
                dataChannelId, "bufferedamount", dataChannel.bufferedAmount
            )

        elif notification.event == "datachannel.close":
            internal = notification.internal
            dataChannelId = internal.get("dataChannelId")
            if dataChannelId is None:
                raise TypeError("missing internal.dataChannelId")

            dataChannel = self._dataChannels.get(dataChannelId)
            if dataChannel is None:
                return

            # NOTE: After calling dataChannel.close() aiortc emits "close" event
            # on the dataChannel. Probably it shouldn't do it. So caution.
            try:
                del self._dataChannels[dataChannelId]
            except KeyError:
                pass

            dataChannel.close()

        elif notification.event == "datachannel.setBufferedAmountLowThreshold":
            internal = notification.internal
            dataChannelId = internal.get("dataChannelId")
            if dataChannelId is None:
                raise TypeError("missing internal.dataChannelId")

            value = notification.data
            dataChannel = self._dataChannels[dataChannelId]
            dataChannel.bufferedAmountLowThreshold = value

        else:
            raise TypeError("unknown notification event")

    """
    Helper functions
    """

    def _getTransceiverByMid(self, mid: str) -> Optional[RTCRtpTransceiver]:
        return next(
            filter(lambda x: x.mid == mid, self._pc.getTransceivers()), None
        )

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
            "jitter": stats.jitter
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
            "trackId": stats.trackId
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
            "fractionLost": stats.fractionLost
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
            # RTCRemoteOutboundRtpStreamStats
            "remoteTimestamp": stats.remoteTimestamp.timestamp()
        }

    def _serializeTransportStats(self, stats: RTCStatsReport) -> Dict[str, Any]:
        return {
            # RTCStats
            "timestamp": stats.timestamp.timestamp(),
            "type": stats.type,
            "id": stats.id,
            # RTCTransportStats
            "packetsSent": stats.packetsSent,
            "packetsReceived": stats.packetsReceived,
            "bytesSent": stats.bytesSent,
            "bytesReceived": stats.bytesReceived,
            "iceRole": stats.iceRole,
            "dtlsState": stats.dtlsState
        }
