import argparse
import traceback
import asyncio
import json
import signal
import sys
from os import getpid
from aiortc import RTCConfiguration, RTCIceServer

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
    # run event loop
    loop = asyncio.get_event_loop()

    # create channel
    channel = Channel(loop, READ_FD, WRITE_FD)

    # create handler
    try:
        handler = Handler(channel, loop, rtcConfiguration)
    except Exception as error:
        Logger.error(
            f"invalid RTCConfiguration: {error.__class__.__name__}: {error}"
        )
        sys.exit(42)

    def shutdown():
        loop.stop()

    async def run(channel: Channel, handler: Handler) -> None:
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
                        result = await handler.processRequest(request)
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
                        await handler.processNotification(notification)
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
