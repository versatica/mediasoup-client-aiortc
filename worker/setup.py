import setuptools

setuptools.setup(
    name="mediasoup-client-aiortc",
    version="3.11.2",
    description="mediasoup-client handler for aiortc Python library",
    url="https://github.com/versatica/mediasoup-client-aiortc",
    author="José Luis Millán Villegas, Iñaki Baz Castillo",
    author_email="jmillan@aliax.net, ibc@aliax.net",
    license="ISC",
    packages=setuptools.find_packages(),
    install_requires=[
        "aiortc>=1.10.1",
        "pynetstring"
    ],
)
