# syntax=docker/dockerfile:1

FROM ubuntu:20.04

SHELL ["/bin/bash", "-ceov", "pipefail"]

ENV DEBIAN_FRONTEND=noninteractive
ENV LC_CTYPE=C.UTF-8

RUN <<EOF
    rm -f /etc/apt/apt.conf.d/docker-clean
    echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache
    (set +o pipefail; yes | unminimize)
    apt-get clean && rm -rf /var/lib/apt/lists/*
EOF

RUN set -euxo pipefail; \
    printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d; \
    chmod +x /usr/sbin/policy-rc.d; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
    acl \
    alpine \
    apache2-utils \
    apparmor \
    arj \
    ash \
    aspell \
    aspell-en \
    basez \
    bash \
    bat \
    bc \
    binutils \
    bsdextrautils \
    busybox \
    bzip2 \
    cabal-install \
    clamav \
    coreutils \
    cpio \
    cpulimit \
    csh \
    csvtool \
    cups \
    curl \
    daemontools \
    dash \
    debianutils \
    dialog \
    diffutils \
    distcc \
    dmsetup \
    dnsutils \
    dosbox \
    dpkg \
    e2fsprogs \
    ed \
    efax \
    elvish \
    emacs-nox \
    espeak \
    expect \
    file \
    findutils \
    fish \
    gawk \
    gdb \
    genisoimage \
    gettext \
    gimp \
    grep \
    groff-base \
    gzip \
    highlight \
    hping3 \
    iamerican \
    iproute2 \
    ispell \
    jq \
    ksh \
    less \
    libc-bin \
    libcap2-bin \
    libglib2.0-dev-bin \
    links \
    linux-tools-generic \
    logsave \
    lua5.4 \
    make \
    man-db \
    mawk \
    minicom \
    mosquitto \
    multitime \
    nasm \
    ncftp \
    ncurses-bin \
    net-tools \
    nftables \
    nmap \
    nodejs \
    ntpsec-ntpdate \
    openjdk-11-jdk-headless \
    openjdk-11-jre-headless \
    openssh-client \
    openssl \
    openvpn \
    original-awk \
    pandoc \
    passwd \
    perl \
    pexec \
    php-cli \
    procps \
    python-is-python3 \
    rc \
    restic \
    rlwrap \
    rsync \
    rtorrent \
    sash \
    scanmem \
    sed \
    sharutils \
    sqlite3 \
    squashfs-tools \
    sshpass \
    strace \
    sysstat \
    systemd \
    tcl \
    tftp-hpa \
    time \
    unzip \
    util-linux \
    varnish \
    vim-nox \
    w3m \
    wget \
    whiptail \
    x11-apps \
    x11-xserver-utils \
    xdotool \
    xxd \
    xz-utils \
    yash \
    zsh; \
    ln -sf /usr/libexec/man-db/zsoelim /usr/bin/zsoelim; \
    rm -f /usr/sbin/policy-rc.d; \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/*

RUN ln -s /etc/bash.bashrc /etc/bashrc && \
    if id ubuntu; then userdel -f -r ubuntu; fi && \
    chown -R 0:0 /usr/bin /usr/local/bin && \
    find / -xdev -type f -perm -4000 -exec chmod u-s {} \;

ADD --chown=0:0 --chmod=6755 http://github.com/pwncollege/exec-suid/releases/latest/download/exec-suid /usr/bin/exec-suid
