FROM ubuntu:24.04

# Install dependencies.
RUN set -x \
	&& apt-get update \
	&& apt-get install --yes \
		clang pkg-config bash-completion wget curl screen python3-pip python3-yaml \
		zlib1g-dev libgss-dev libssl-dev libxml2-dev gdb

# Install node 24.
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
	&& apt-get install --yes nodejs

# Enable core dumps.
RUN set -x \
	&& echo "mkdir -p /tmp/cores && chmod 777 /tmp/cores && echo \"/tmp/cores/core.%e.sig%s.%p\" > /proc/sys/kernel/core_pattern && ulimit -c unlimited" >> ~/.bashrc

ENV LANG="C.UTF-8"

WORKDIR "/mediasoup-client-aiortc"

CMD ["bash"]
