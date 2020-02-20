import argparse
import traceback
import asyncio
import json
import signal
import sys
from os import getpid
from typing import Any, Dict, Optional
from aiortc import  RTCConfiguration, RTCPeerConnection
from aiortc.contrib.media import MediaPlayer
from channel import Request, Notification, Channel
from handler import Handler
from logger import Logger


# File descriptors to communicate with the Node.js process
READ_FD = 3
WRITE_FD = 4


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="aiortc mediasoup-client handler")
    parser.add_argument(
        "--logLevel", "-l", choices=["debug", "warn", "error", "none"])
    parser.add_argument(
        "--rtcConfiguration", "-c", help="RTCConfiguration string")
    args = parser.parse_args()

    """
    Argument handling
    """
    if args.logLevel and args.logLevel != "none":
        Logger.setLogLevel(args.logLevel)

    Logger.debug("starting mediasoup-client aiortc worker")

    # use RTCConfiguration if given
    rtcConfiguration = None

    if args.rtcConfiguration:
        jsonRtcConfiguration = json.loads(args.rtcConfiguration)
        if "iceServers" in jsonRtcConfiguration:
            iceServers = []
            for entry in jsonRtcConfiguration["iceServers"]:
                iceServer = RTCIceServer(
                    urls=entry.get("urls"),
                    username=entry.get("username"),
                    credential=entry.get("credential"),
                    credentialType=entry.get("credentialType")
                )
                iceServers.append(iceServer)
            rtcConfiguration = RTCConfiguration(iceServers)

    """
    Initialization
    """
    # dictionary of players indexed by id
    players = dict()  # type: Dict[str, MediaPlayer]
    # dictionary of handlers indexed by id
    handlers = dict()  # type: Dict[str, Handler]

    # run event loop
    loop = asyncio.get_event_loop()

    # create channel
    channel = Channel(loop, READ_FD, WRITE_FD)

    def shutdown():
        loop.stop()

    def getHandler(handlerId: str):
        return handlers.get(handlerId)

    def getTrack(playerId: str, kind: str):
        player = players.get(playerId)
        return player.audio if kind == "audio" else player.video

    async def processRequest(request: Request) -> Any:
        Logger.debug(f"processRequest() [method:{request.method}]")

        if request.method == "createHandler":
            internal = request.internal
            handlerId = internal["handler"]
            data = request.data
            handler = Handler(channel, loop, getTrack, data["rtcConfiguration"])

            handlers[handlerId] = handler

        if request.method == "createPlayer":
            internal = request.internal
            playerId = internal["playerId"]
            data = request.data
            player = MediaPlayer(
                data["file"],
                data["format"] if "format" in data else None,
                data["options"] if "options" in data else None
            )

            players[playerId] = player

        if request.method == "getRtpCapabilities":
            pc = RTCPeerConnection()
            pc.addTransceiver("audio", "sendonly")
            pc.addTransceiver("video", "sendonly")
            offer = await pc.createOffer()
            await pc.close()
            return offer.sdp

        elif request.method == "handler.getLocalDescription":
            internal = data.internal
            handler = getHandler(internal["handlerId"])
            return await handler.processRequest(request)

        elif request.method == "handler.addTrack":
            internal = data.internal
            handler = getHandler(internal["handlerId"])
            return await handler.processRequest(request)

        elif request.method == "handler.removeTrack":
            internal = data.internal
            handler = getHandler(internal["handlerId"])
            return await handler.processRequest(request)

        elif request.method == "handler.setLocalDescription":
            internal = data.internal
            handler = getHandler(internal["handlerId"])
            return await handler.processRequest(request)

        elif request.method == "handler.setRemoteDescription":
            internal = data.internal
            handler = getHandler(internal["handlerId"])
            return await handler.processRequest(request)

        elif request.method == "handler.createOffer":
            internal = data.internal
            handler = getHandler(internal["handlerId"])
            return await handler.processRequest(request)

        elif request.method == "handler.createAnswer":
            internal = data.internal
            handler = getHandler(internal["handlerId"])
            return await handler.processRequest(request)

        elif request.method == "handler.getMid":
            internal = data.internal
            handler = getHandler(internal["handlerId"])
            return await handler.processRequest(request)

        elif request.method == "handler.getTransportStats":
            internal = data.internal
            handler = getHandler(internal["handlerId"])
            return await handler.processRequest(request)

        elif request.method == "handler.getSenderStats":
            internal = data.internal
            handler = getHandler(internal["handlerId"])
            return await handler.processRequest(request)

        elif request.method == "handler.getReceiverStats":
            internal = data.internal
            handler = getHandler(internal["handlerId"])
            return await handler.processRequest(request)

        elif request.method == "handler.createDataChannel":
            internal = data.internal
            handler = getHandler(internal["handlerId"])
            return await handler.processRequest(request)

        else:
            raise TypeError(
                f"unknown notification with method '{request.method}' received"
            )

    async def processNotification(notification: Notification) -> None:
        Logger.debug(f"processNotification() [event:{notification.event}]")

        if notification.event == "handler.close":
            internal = notification.internal
            handlerId = internal["handlerId"]
            handler = handlers.get(handlerId)

            handler.close()

            del handlers[handlerId]

        if notification.event == "player.close":
            internal = notification.internal
            playerId = internal["playerId"]
            player = players.get(playerId)

            if player.audio:
                player.audio.stop()
            if player.video:
                player.video.stop()

            del players[playerId]

        elif notification.event == "player.stopTrack":
            internal = notification.internal
            playerId = internal["playerId"]
            data = notification.data
            kind = data["kind"]

            player = players.get(playerId)

            if kind == "audio":
                player.audio.stop()
            else:
                player.video.stop()

        elif notification.event == "handler.enableTrack":
            Logger.warning("enabling track not implemented")

        elif notification.event == "handler.disableTrack":
            Logger.warning("disabling track not implemented")

        elif notification.event == "datachannel.send":
            internal = notification.internal
            handler = getHandler(internal["handlerId"])
            return await handler.processNotification(notification)

        elif notification.event == "datachannel.sendBinary":
            internal = notification.internal
            handler = getHandler(internal["handlerId"])
            return await handler.processNotification(notification)

        elif notification.event == "datachannel.close":
            internal = notification.internal
            handler = getHandler(internal["handlerId"])
            return await handler.processNotification(notification)

        elif notification.event == "datachannel.setBufferedAmountLowThreshold":
            internal = notification.internal
            handler = getHandler(internal["handlerId"])
            return await handler.processNotification(notification)

        else:
            raise TypeError(
                f"unknown notification with event '{notification.event}' received"
            )

    async def run(channel: Channel, handler: Handler) -> None:
        # tell the Node process that we are running
        await channel.notify(getpid(), "running")

        while True:
            try:
                obj = await channel.receive()

                if obj is None:
                    continue

                elif "method" in obj:
                    request = Request(**obj)
                    request.setChannel(channel)
                    try:
                        result = await processRequest(request)
                        await request.succeed(result)
                    except Exception as error:
                        errorStr = f"{error.__class__.__name__}: {error}"
                        Logger.error(
                            f"request '{request.method}' failed: {errorStr}"
                        )
                        if not isinstance(error, TypeError):
                            traceback.print_tb(error.__traceback__)
                        await request.failed(error)

                elif "event" in obj:
                    notification = Notification(**obj)
                    try:
                        await processNotification(notification)
                    except Exception as error:
                        errorStr = f"{error.__class__.__name__}: {error}"
                        Logger.error(
                            f"notification '{notification.event}' failed: {errorStr}"
                        )
                        if not isinstance(error, TypeError):
                            traceback.print_tb(error.__traceback__)

            except Exception:
                break

    # signal handler
    loop.add_signal_handler(signal.SIGINT, shutdown)
    loop.add_signal_handler(signal.SIGTERM, shutdown)

    try:
        loop.run_until_complete(
            run(channel, handler)
        )
    # reached after calling loop.stop() or channel failure
    except RuntimeError:
        pass
    finally:
        # TODO: we force loop closure, otherwise RTCPeerConnection may not close
        # and we may end up with a zoombie process
        loop.close()
        # TODO: Ideally we should gracefully close instances as follows
        # loop.run_until_complete(handler.close())
        # loop.run_until_complete(channel.close())
