FROM ubuntu:26.04

ARG CHROME_CHANNEL=stable
ARG GECKODRIVER_VER=0.36.0

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PIP_BREAK_SYSTEM_PACKAGES=1
ENV DEBIAN_FRONTEND=noninteractive
ENV CHROME_BIN=/usr/bin/chromium
ENV GECKO_BIN=/usr/local/bin/firefox

RUN apt-get update && \
    apt-get install --no-install-recommends -y \
    curl \
    gnupg \
    software-properties-common \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://pgp.mongodb.com/server-8.0.asc | \
    gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor && \
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" | \
    tee /etc/apt/sources.list.d/mongodb-org-8.0.list

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
    dnsutils \
    fd-find \
    file \
    firefox \
    firefox-esr \
    fish \
    git \
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
    mongodb-org \
    mysql-server \
    ncurses-bin \
    ncurses-term \
    neovim \
    netcat-openbsd \
    nftables \
    nginx \
    nmap \
    openssl \
    p7zip-full \
    parallel \
    php-cli \
    php-common \
    php-curl \
    php-fpm \
    php-mbstring \
    php-mongodb \
    php-mysql \
    php-pgsql \
    php-sqlite3 \
    php-xml \
    php-zip \
    postgresql \
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

RUN wget -q -O - "https://github.com/mozilla/geckodriver/releases/download/v${GECKODRIVER_VER}/geckodriver-v${GECKODRIVER_VER}-linux64.tar.gz" | tar xz -C /usr/local/bin

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

COPY --chown=0:0 --chmod=554 ./setup_ssl_certs.sh /tmp/setup_ssl_certs.sh
RUN /tmp/setup_ssl_certs.sh && \
    rm -f /tmp/setup_ssl_certs.sh

ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt \
    SSL_CERT_DIR=/etc/ssl/certs \
    REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt

COPY --chown=0:0 --chmod=554 ./cdn/server /opt/cdn/server
COPY --chown=0:0 --chmod=444 ./cdn/mime_overrides.json /opt/cdn/mime_overrides.json
ADD --chown=0:0 --chmod=444 https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4 /opt/cdn/@tailwindcss/browser@4

COPY --chown=0:0 --chmod=774 ./cdn/fetch_inter.sh /tmp/fetch_inter.sh
RUN /tmp/fetch_inter.sh 4.1 && \
    rm -f /tmp/fetch_inter.sh

COPY --chown=0:0 --from=pwmcollege/glow /usr/local/bin/glow /usr/local/bin/glow

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
