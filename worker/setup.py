import setuptools

setuptools.setup(
    name="mediasoup-client-aiortc",
    version="3.7.1",
    description="mediasoup-client handler for aiortc Python library",
    url="http://github.com/versatica/mediasoup-client-aiortc",
    author="José Luis Millán Villegas, Iñaki Baz Castillo",
    author_email="jmillan@aliax.net, ibc@aliax.net",
    license="MIT",
    packages=setuptools.find_packages(),
    install_requires=[
        "aiortc>=0.9.28",
        "pynetstring"
    ],
)
