import argparse
import traceback
import asyncio
from os import getpid
from typing import Any, Dict
from aiortc import RTCConfiguration, RTCIceServer, RTCPeerConnection
from aiortc.contrib.media import MediaPlayer, MediaStreamTrack
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
    args = parser.parse_args()

    """
    Argument handling
    """
    if args.logLevel and args.logLevel != "none":
        Logger.setLogLevel(args.logLevel)

    Logger.debug("worker: starting mediasoup-client aiortc worker")

    """
    Initialization
    """
    # dictionary of players indexed by id
    players: Dict[str, MediaPlayer] = ({})
    # dictionary of handlers indexed by id
    handlers: Dict[str, Handler] = ({})
    # dictionary of receiving tracks indexed by id
    recvTracks = dict()  # type: Dict[str, MediaStreamTrack]

    # get/create event loop
    loop = asyncio.get_event_loop()

    # create channel
    channel = Channel(loop, READ_FD, WRITE_FD)

    def getTrack(playerId: str, kind: str) -> MediaStreamTrack:
        player = players[playerId]
        track = player.audio if kind == "audio" else player.video
        if not track:
            raise Exception("no track found")

        return track

    def addRemoteTrack(track: MediaStreamTrack) -> None:
        recvTracks[track.id] = track

    def getRemoteTrack(trackId: str, kind: str) -> MediaStreamTrack:
        track = recvTracks.get(trackId)
        if not track:
            raise Exception("no track found")
        if track.kind != kind:
            raise Exception("no matching track.kind")

        return track

    async def processRequest(request: Request) -> Any:
        Logger.debug(f"worker: processRequest() [method:{request.method}]")

        if request.method == "dump":
            result = {
                "pid": getpid(),
                "players": [],
                "handlers": []
            }

            for playerId, player in players.items():
                playerDump = {
                    "id": playerId
                }  # type: Dict[str, Any]
                if player.audio:
                    playerDump["audioTrack"] = {
                        "id": player.audio.id,
                        "kind": player.audio.kind,
                        "readyState": player.audio.readyState
                    }
                if player.video:
                    playerDump["videoTrack"] = {
                        "id": player.video.id,
                        "kind": player.video.kind,
                        "readyState": player.video.readyState
                    }
                result["players"].append(playerDump)  # type: ignore

            for handler in handlers.values():
                result["handlers"].append(handler.dump())  # type: ignore

            return result

        elif request.method == "createPlayer":
            internal = request.internal
            playerId = internal["playerId"]
            data = request.data
            player = MediaPlayer(
                data["file"],
                data["format"] if "format" in data else None,
                data["options"] if "options" in data else None
            )

            # store the player in the map
            players[playerId] = player

            result = {}
            if player.audio:
                result["audioTrackId"] = player.audio.id
            if player.video:
                result["videoTrackId"] = player.video.id
            return result

        elif request.method == "getRtpCapabilities":
            pc = RTCPeerConnection()
            pc.addTransceiver("audio", "sendonly")
            pc.addTransceiver("video", "sendonly")
            offer = await pc.createOffer()
            await pc.close()
            return offer.sdp

        elif request.method == "createHandler":
            internal = request.internal
            handlerId = internal["handlerId"]
            data = request.data

            # use RTCConfiguration if given
            jsonRtcConfiguration = data.get("rtcConfiguration")
            rtcConfiguration = None

            if jsonRtcConfiguration and "iceServers" in jsonRtcConfiguration:
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

            handler = Handler(
                handlerId,
                channel,
                loop,
                getTrack,
                addRemoteTrack,
                getRemoteTrack,
                rtcConfiguration
            )

            handlers[handlerId] = handler
            return

        else:
            internal = request.internal
            handler = handlers.get(internal["handlerId"])
            if handler is None:
                raise Exception("hander not found")

            return await handler.processRequest(request)

    async def processNotification(notification: Notification) -> None:
        Logger.debug(f"worker: processNotification() [event:{notification.event}]")

        if notification.event == "player.close":
            internal = notification.internal
            playerId = internal["playerId"]
            player = players.get(playerId)
            if player is None:
                return

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
            if player is None:
                return

            if kind == "audio" and player.audio:
                player.audio.stop()
            elif kind == "video" and player.video:
                player.video.stop()

        elif notification.event == "handler.close":
            internal = notification.internal
            handlerId = internal["handlerId"]
            handler = handlers.get(handlerId)
            if handler is None:
                return

            await handler.close()
            del handlers[handlerId]

        else:
            internal = notification.internal
            handler = handlers.get(internal["handlerId"])
            if handler is None:
                return

            await handler.processNotification(notification)

    async def run(channel: Channel) -> None:
        Logger.debug("worker: run()")

        # tell the Node process that we are running
        await channel.notify(str(getpid()), "running")

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
                            f"worker: request '{request.method}' failed: {errorStr}"
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
                            f"worker: notification '{notification.event}' failed: {errorStr}"
                        )
                        if not isinstance(error, TypeError):
                            traceback.print_tb(error.__traceback__)

            except Exception:
                break

        Logger.debug("worker: run() done")

    async def shutdown() -> None:
        Logger.debug("worker: shutdown()")

        # close channel
        await channel.close()

        # close all players
        for player in players.values():
            if player.audio:
                player.audio.stop()
            if player.video:
                player.video.stop()
        players.clear()

        # close all handlers
        for handler in handlers.values():
            await handler.close()
        handlers.clear()

        # stop the loop (just in case)
        loop.stop()

        Logger.debug("worker: shutdown() done")

    try:
        loop.run_until_complete(
            run(channel)
        )
    # reached after calling channel closure
    except RuntimeError:
        pass
    finally:
        loop.run_until_complete(
            shutdown()
        )
