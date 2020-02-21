import asyncio
import json
import socket
import pynetstring
from asyncio import StreamReader, StreamWriter
from typing import Any, Dict, Optional, Union

from logger import Logger


def object_from_string(message_str) -> Optional[Dict[str, Any]]:
    message = json.loads(message_str)

    if "method" in message:
        if "id" in message:
            return message
        else:
            Logger.error("channel: invalid request, missing 'id' field")
            return None

    elif "event" in message:
        return message

    else:
        Logger.error(
            "channel: invalid messsage, missing 'method' and 'event' fields"
        )
        return None


"""
Channel class
"""


class Channel:
    def __init__(self, loop, readfd, writefd) -> None:
        self._loop = loop
        self._readfd = readfd
        self._writefd = writefd
        self._reader = Union[StreamReader, None]
        self._writer = Union[StreamWriter, None]
        self._nsDecoder = pynetstring.Decoder()
        self._connected = False

    async def _connect(self) -> None:
        if (self._connected):
            return

        """
        Create the sender and receivers
        """
        rsock = socket.socket(
            socket.AF_UNIX, socket.SOCK_STREAM, 0, self._readfd)
        self._reader, writer = await asyncio.open_connection(
            sock=rsock, loop=self._loop)

        wsock = socket.socket(
            socket.AF_UNIX, socket.SOCK_STREAM, 0, self._writefd)
        reader, self._writer = await asyncio.open_connection(
            sock=wsock, loop=self._loop)

        self._connected = True

    async def close(self) -> None:
        if self._writer is not None:
            self._writer.close()

    async def receive(self) -> Optional[Dict[str, Any]]:
        await self._connect()

        try:
            # retrieve chunks of 50 bytes
            data = await self._reader.read(50)
            if len(data) == 0:
                Logger.debug("channel: socket closed, exiting")
                raise Exception("socket closed")

            decoded_list = self._nsDecoder.feed(data)
            for item in decoded_list:
                return object_from_string(item.decode("utf8"))

        except asyncio.IncompleteReadError:
            pass

        return None

    async def send(self, descr) -> None:
        await self._connect()

        data = descr.encode("utf8")
        data = pynetstring.encode(data)

        self._writer.write(data)

    async def notify(self, targetId: str, event: str, data=None) -> None:
        try:
            if data is not None:
                await self.send(
                    json.dumps({"targetId": targetId, "event": event, "data": data})
                )
            else:
                await self.send(
                    json.dumps({"targetId": targetId, "event": event})
                )

        except Exception as error:
            errorStr = f"{error.__class__.__name__}: {error}"
            Logger.warning(
                f"channel: notify() failed [targetId:{targetId}, event:{event}]]: {errorStr}"
            )


"""
Request class
"""


class Request:
    def __init__(self, id: str, method: str, internal=None, data=None) -> None:
        self._id = id
        self.method = method
        self.internal = internal
        self.data = data

    def setChannel(self, channel: Channel):
        self._channel = channel

    async def succeed(self, data=None) -> None:
        if data is not None:
            await self._channel.send(json.dumps({
                "id": self._id,
                "accepted": True,
                "data": data
            }, sort_keys=True))
        else:
            await self._channel.send(json.dumps({
                "id": self._id,
                "accepted": True
            }, sort_keys=True))

    async def failed(self, error) -> None:
        errorType = "Error"
        if isinstance(error, TypeError):
            errorType = "TypeError"

        await self._channel.send(json.dumps({
            "id": self._id,
            "error": errorType,
            "reason": f"{error.__class__.__name__}: {error}"
        }, sort_keys=True))


"""
Notification class
"""


class Notification:
    def __init__(self, event: str, internal=None, data=None) -> None:
        self.event = event
        self.internal = internal
        self.data = data
