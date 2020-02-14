import asyncio
import json
import socket
from asyncio import StreamReader, StreamWriter
from typing import Any, Dict, Optional

import pynetstring


def object_from_string(message_str) -> Optional[Dict[str, Any]]:
    message = json.loads(message_str)
    if "method" in message:
        if "id" in message:
            return message
        else:
            print("invalid messsage, missing 'method' and 'event' fields")
            return None

    elif "event" in message:
        return message

    else:
        print("invalid messsage, missing 'method' and 'event' fields")
        return None


class Channel:
    def __init__(self, loop, readfd, writefd) -> None:
        self._loop = loop
        self._readfd = readfd
        self._writefd = writefd
        self._reader = None  # type: StreamReader
        self._writer = None  # type: StreamWriter
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
        self._reader, writer = await asyncio.open_connection(sock=rsock, loop=self._loop)

        wsock = socket.socket(
            socket.AF_UNIX, socket.SOCK_STREAM, 0, self._writefd)
        reader, self._writer = await asyncio.open_connection(sock=wsock, loop=self._loop)

        self._connected = True

    async def close(self) -> None:
        if self._writer is not None:
            await self.send(None)
            self._writer.close()
            self._reader = None
            self._writer = None

    async def receive(self) -> Optional[Dict[str, Any]]:
        await self._connect()

        try:
            # retrieve chunks of 50 bytes
            data = await self._reader.read(50)
            decoded_list = self._nsDecoder.feed(data)
            for item in decoded_list:
                return object_from_string(item.decode("utf8"))

        except asyncio.IncompleteReadError:
            pass

        return None

    async def send(self, descr) -> None:
        await self._connect()

        # TODO: Where does it come from?
        if descr is None:
            print("skip empty message...")
            return

        data = descr.encode("utf8")
        data = pynetstring.encode(data)

        self._writer.write(data)

    async def notify(self, targetId: str, event: str, data=None):
        if data:
            await self.send(json.dumps({"targetId": targetId, "event": event, "data": data}))

        else:
            await self.send(json.dumps({"targetId": targetId, "event": event}))
