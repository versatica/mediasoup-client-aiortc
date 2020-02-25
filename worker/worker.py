import argparse
import traceback
import asyncio
from os import getpid
from typing import Any, Dict
from aiortc.contrib.media import MediaPlayer, MediaStreamTrack
from channel import Request, Notification, Channel
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

    async def processRequest(request: Request) -> Any:
        Logger.debug(f"worker: processRequest() [method:{request.method}]")

        if request.method == "dump":
            # NOTE: this method does much more but, for this test unit, no need
            # to do anything
            return

            # result = {
            #     "pid": getpid(),
            #     "players": []
            # }

            # for playerId, player in players.items():
            #     playerDump = {
            #         "id": playerId
            #     }  # type: Dict[str, Any]
            #     if player.audio:
            #         playerDump["audioTrack"] = {
            #             "id": player.audio.id,
            #             "kind": player.audio.kind,
            #             "readyState": player.audio.readyState
            #         }
            #     if player.video:
            #         playerDump["videoTrack"] = {
            #             "id": player.video.id,
            #             "kind": player.video.kind,
            #             "readyState": player.video.readyState
            #         }
            #     result["players"].append(playerDump)  # type: ignore

            # return result

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
                result["audioNativeTrackId"] = player.audio.id
            if player.video:
                result["videoNativeTrackId"] = player.video.id
            return result

        else:
            raise TypeError(
                f"unknown request with method '{request.method}' received"
            )

    def processNotification(notification: Notification) -> None:
        Logger.debug(f"worker: processNotification() [event:{notification.event}]")

        if notification.event == "player.close":
            internal = notification.internal
            playerId = internal["playerId"]
            player = players.get(playerId)
            if player is None:
                return

            if player.audio:
                Logger.debug(f"calling player.audio.stop()...")
                player.audio.stop()
                Logger.debug(f"player.audio.stop() done")
            if player.video:
                Logger.debug(f"calling player.video.stop()...")
                player.video.stop()
                Logger.debug(f"player.video.stop() done")

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
                Logger.debug(f"calling player.audio.stop()...")
                player.audio.stop()
                Logger.debug(f"player.audio.stop() done")
            elif kind == "video" and player.video:
                Logger.debug(f"calling player.video.stop()...")
                player.video.stop()
                Logger.debug(f"player.video.stop() done")

        else:
            raise TypeError(
                f"unknown notification with event '{notification.event}' received"
            )

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
                        Logger.debug(
                            f"worker: request '{request.method}' succeeded"
                        )
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
                        processNotification(notification)
                        Logger.debug(
                            f"worker: notification '{notification.event}' succeeded"
                        )
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
