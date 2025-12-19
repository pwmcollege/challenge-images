# syntax=docker/dockerfile:1

FROM ubuntu:22.04

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
    alsa-oss \
    ansible \
    apache2 \
    apache2-utils \
    apparmor \
    aria2 \
    arj \
    ash \
    aspell \
    aspell-en \
    at \
    bacula-console \
    base58 \
    basez \
    bash \
    bat \
    binutils \
    dc \
    bpftrace \
    bsdextrautils \
    bsd-mailx \
    busybox \
    bzip2 \
    cabal-install \
    cdist \
    certbot \
    clamav \
    composer \
    cowsay \
    coreutils \
    cpio \
    cpulimit \
    crash \
    cron \
    csh \
    csvtool \
    cups \
    curl \
    daemontools \
    dash \
    dbus \
    debianutils \
    dialog \
    diffutils \
    distcc \
    dmidecode \
    dmsetup \
    dnsutils \
    dnf \
    docker.io \
    dosbox \
    dotnet-sdk-8.0 \
    e2fsprogs \
    eb-utils \
    ed \
    efax \
    elvish \
    emacs-nox \
    enscript \
    espeak \
    expect \
    facter \
    file \
    findutils \
    fish \
    fping \
    gawk \
    gcc \
    gdb \
    genisoimage \
    gettext \
    ghc \
    ginac-tools \
    gimp \
    git \
    gnucobol \
    grc \
    grep \
    groff-base \
    gzip \
    hping3 \
    highlight \
    iamerican \
    iftop \
    inetutils-ftp \
    iproute2 \
    ispell \
    jq \
    joe \
    kbd \
    krb5-user \
    ksh \
    latexmk \
    less \
    libc-bin \
    libcap2-bin \
    libdate-manip-perl \
    libglib2.0-dev-bin \
    libimage-exiftool-perl \
    libmonitoring-plugin-perl \
    libnet-cups-perl \
    libvirt-clients \
    libwww-perl \
    lftp \
    links \
    linux-tools-generic \
    logsave \
    lua5.4 \
    ltrace \
    mailcap \
    make \
    man-db \
    mariadb-client \
    mawk \
    minicom \
    mosquitto \
    monitoring-plugins \
    monitoring-plugins-basic \
    monitoring-plugins-contrib \
    monitoring-plugins-standard \
    mtr-tiny \
    multitime \
    nano \
    nasm \
    ncdu \
    ncftp \
    ncurses-bin \
    neofetch \
    net-tools \
    netcat-openbsd \
    nftables \
    nmap \
    nodejs \
    npm \
    ntpsec-ntpdate \
    octave \
    openjdk-11-jdk-headless \
    openjdk-11-jre-headless \
    openjdk-8-jdk-headless \
    openvpn \
    openssh-client \
    openssl \
    original-awk \
    p7zip-full \
    pandoc \
    passwd \
    perl \
    pexec \
    php-cli \
    policykit-1 \
    posh \
    postgresql-client \
    puppet \
    procps \
    putty-tools \
    python-is-python3 \
    python2 \
    python-setuptools \
    python3-pip \
    python3-setuptools \
    rake \
    rc \
    restic \
    rlwrap \
    rpm \
    rsync \
    ruby \
    ruby-ascii85 \
    ruby-bundler \
    ruby-byebug \
    pry \
    ruby-redcarpet \
    samba-client \
    sash \
    scanmem \
    screen \
    scrot \
    sed \
    sharutils \
    slsh \
    snapd \
    socat \
    sqlite3 \
    sqlmap \
    squashfs-tools \
    sshpass \
    strace \
    sudo \
    sysstat \
    systemd \
    tasksh \
    taskwarrior \
    tcl \
    tk \
    tcpdump \
    tdb-tools \
    telnet \
    texlive-binaries \
    texlive-latex-base \
    texlive-luatex \
    texlive-xetex \
    tftp-hpa \
    time \
    tmate \
    tmux \
    torsocks \
    unzip \
    urjtag \
    util-linux \
    valgrind \
    varnish \
    vim-nox \
    wireshark \
    w3m \
    wget \
    whiptail \
    x11-apps \
    x11-xserver-utils \
    xdg-user-dirs \
    xdotool \
    xpad \
    xxd \
    xz-utils \
    yash \
    zathura \
    zip \
    zsh \
    zypper; \
    ln -sf /usr/libexec/man-db/zsoelim /usr/bin/zsoelim; \
    ln -sf /usr/bin/torsocks /usr/bin/torify; \
    ln -sf /usr/bin/pdb3 /usr/bin/pdb; \
    ln -sf /usr/bin/resolvectl /usr/bin/systemd-resolve; \
    rm -f /usr/sbin/policy-rc.d; \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/*

RUN curl -sS https://bootstrap.pypa.io/pip/2.7/get-pip.py -o /tmp/get-pip.py; \
    python2 /tmp/get-pip.py; \
    rm /tmp/get-pip.py; \
    easyi=/usr/lib/python2.7/dist-packages/easy_install.py; \
    sed -i '1i #!/usr/bin/python2' "${easyi}"; \
    chmod +x "${easyi}"; \
    ln -sf "$easyi" /usr/bin/easy_install

RUN cd /tmp; \
    curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"; \
    unzip awscliv2.zip; \
    ./aws/install

RUN echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list && curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg && apt-get update -y && apt-get install google-cloud-cli -y

RUN curl -fSL "https://chefdownload-community.chef.io/stable/chef/download?p=ubuntu&pv=22.04&m=x86_64&v=14.15.6" -o /tmp/chef.deb; \
    dpkg -i /tmp/chef.deb

RUN curl -fsSL https://install.julialang.org | bash -s -- -y && \
    ln -sf /root/.juliaup/bin/julia /usr/local/bin/julia && \
    ln -sf /root/.juliaup/bin/juliaup /usr/local/bin/juliaup && \
    chmod 755 /root && \
    chmod 644 /root/.julia/juliaup/*.json

RUN cd /tmp; \
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"; \
    install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl; \
    rm -rf /tmp/*

RUN pip3 install pykickstart

RUN ln -s /lib64/ld-linux-x86-64.so.2 /usr/bin/ld.so

ENV PATH="/usr/lib/nagios/plugins:/usr/games:${PATH}"

RUN ln -s /etc/bash.bashrc /etc/bashrc && \
    if id ubuntu; then userdel -f -r ubuntu; fi && \
    chown -R 0:0 /usr/bin /usr/local/bin && \
    find / -xdev -type f -perm -4000 -exec chmod u-s {} \;

ADD --chown=0:0 --chmod=6755 http://github.com/pwncollege/exec-suid/releases/latest/download/exec-suid /usr/bin/exec-suid
