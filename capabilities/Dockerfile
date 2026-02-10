FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y \
    gdb \
    gzip \
    nodejs \
    npm \
    perl \
    php-cli \
    python3 \
    python3-pip \
    ruby-full \
    tcl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN ln -sf /usr/bin/python3 /usr/local/bin/python && \
    ln -sf /usr/bin/python3 ln -sf /usr/bin/python