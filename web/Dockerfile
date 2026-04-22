FROM ubuntu:24.04

ARG CHROME_CHANNEL=stable
ARG GECKODRIVER_VER=0.36.0

ENV PYTHONUNBUFFERED=1 \
    PIP_BREAK_SYSTEM_PACKAGES=1 \
    DEBIAN_FRONTEND=noninteractive \
    CHROME_BIN=/usr/bin/chromium \
    GECKO_BIN=/usr/local/bin/firefox

RUN apt-get update && \
    apt-get install --no-install-recommends -y \
    software-properties-common \
    && rm -rf /var/lib/apt/lists/*

RUN add-apt-repository -y ppa:mozillateam/ppa && \
    add-apt-repository -y ppa:xtradeb/apps

RUN cat <<'EOF' > /etc/apt/preferences.d/mozilla-firefox
Package: *
Pin: release o=LP-PPA-mozillateam
Pin-Priority: 1001

Package: firefox
Pin: version 1:1snap*
Pin-Priority: -1
EOF

RUN apt-get update && \
    apt-get install -y \
    bat \
    binutils \
    build-essential \
    ca-certificates \
    chromium \
    chromium-driver \
    cmake \
    curl \
    dnsutils \
    fd-find \
    file \
    firefox \
    firefox-esr \
    fish \
    git \
    gnupg \
    htop \
    iproute2 \
    iputils-ping \
    iptables \
    jq \
    less \
    libasound2t64 \
    libatk-bridge2.0-0t64 \
    libatk1.0-0t64 \
    libcups2t64 \
    libdrm2 \
    libffi-dev \
    libgtk-3-0t64 \
    libnss3 \
    libpcap-dev \
    libssl-dev \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libxss1 \
    lsb-release \
    lsof \
    lz4 \
    moreutils \
    ncurses-bin \
    ncurses-term \
    neovim \
    netcat-openbsd \
    nftables \
    nmap \
    openssl \
    p7zip-full \
    parallel \
    psmisc \
    pv \
    python3 \
    python3-dev \
    python3-pip \
    python3-venv \
    rename \
    ripgrep \
    rsync \
    socat \
    sudo \
    tcpdump \
    tmux \
    traceroute \
    tree \
    unar \
    unzip \
    vim \
    wget \
    whois \
    zip \
    zsh \
    zstd \
    && rm -rf /var/lib/apt/lists/*

RUN wget -q -O - "https://github.com/mozilla/geckodriver/releases/download/v${GECKODRIVER_VER}/geckodriver-v${GECKODRIVER_VER}-$([ \"$(dpkg --print-architecture)\" = \"arm64\" ] && printf '%s' linux-aarch64 || printf '%s' linux64).tar.gz" | tar xz -C /usr/local/bin

RUN pip install --no-cache-dir --ignore-installed blinker \
    beautifulsoup4 \
    flask \
    git+https://github.com/Gallopsled/pwntools#egg=pwntools \
    git+https://github.com/pwncollege/dojjail#egg=dojjail \
    gunicorn \
    html5lib \
    ipython \
    psutil \
    pycryptodome \
    requests \
    selenium

RUN umask 077 && \
    mkdir -p /opt/ca /etc/ssl/private /etc/ssl/certs && \
    openssl genrsa -out /opt/ca/internalCA.key 4096 && \
    openssl req -x509 -new -nodes -key /opt/ca/internalCA.key -sha256 -days 3650 \
    -subj "/CN=Internal CA" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,digitalSignature,keyCertSign,cRLSign" \
    -out /opt/ca/internalCA.crt && \
    openssl genrsa -out /opt/ca/internal.key.pem 2048 && \
    openssl req -new -key /opt/ca/internal.key.pem -subj "/CN=cdn.internal" -out /opt/ca/internal.csr.pem && \
    printf "subjectAltName=DNS:cdn.internal,DNS:challenge.internal\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth" > /opt/ca/san.cnf && \
    openssl x509 -req -in /opt/ca/internal.csr.pem \
    -CA /opt/ca/internalCA.crt -CAkey /opt/ca/internalCA.key -CAcreateserial \
    -out /etc/ssl/certs/internal.cert.pem -days 825 -sha256 \
    -extfile /opt/ca/san.cnf && \
    cp /opt/ca/internal.key.pem /etc/ssl/private/internal.key.pem && \
    cp /opt/ca/internalCA.crt /usr/local/share/ca-certificates/internalCA.crt && \
    update-ca-certificates && \
    cat /usr/local/share/ca-certificates/internalCA.crt >> $(python3 -m certifi) && \
    rm -rf /opt/ca

ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt \
    SSL_CERT_DIR=/etc/ssl/certs \
    REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt

COPY --chown=0:0 --chmod=554 ./build/cdn /opt/cdn/server
COPY --chown=0:0 --chmod=444 ./build/mime_overrides.json /opt/cdn/mime_overrides.json
ADD --chown=0:0 --chmod=444 https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4 /opt/cdn/@tailwindcss/browser@4

COPY --chown=0:0 --chmod=774 ./build/fetch_inter.sh /tmp/fetch_inter.sh
RUN /tmp/fetch_inter.sh 4.1 && \
    rm -f /tmp/fetch_inter.sh

COPY bash.bashrc /opt/bash/bash.bashrc

RUN printf '\n[ "$UID" -eq 1000 ] && . /opt/bash/bash.bashrc\n' >> /etc/bash.bashrc && \
    ln -s /etc/bash.bashrc /etc/bashrc && \
    if id ubuntu; then userdel -f -r ubuntu; fi && \
    chown -R 0:0 /usr/bin /usr/local/bin && \
    find / -xdev -type f -perm -4000 -exec chmod u-s {} \; && \
    find /opt/cdn -type d -exec chmod 755 {} \; && \
    ln -s /usr/bin/python3 /usr/bin/python && \
    ln -s /usr/bin/python /usr/local/bin/python && \
    ln -s /usr/bin/python3 /usr/local/bin/python3 && \
    ln -s /usr/bin/pip /usr/local/bin/pip && \
    ln -s /usr/bin/pip3 /usr/local/bin/pip3

ADD --chown=0:0 --chmod=6755 https://github.com/pwncollege/exec-suid/releases/latest/download/exec-suid /usr/bin/exec-suid

ADD --chown=0:0 --chmod=6755 https://github.com/pwncollege/exec-suid/releases/download/v0.1.5/exec-suid /opt/exec-suid
