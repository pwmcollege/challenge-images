# syntax=docker/dockerfile:1

FROM ubuntu:22.04 AS build-kernel

ARG LINUX_VERSION=6.17

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    bc \
    bison \
    flex \
    libncurses-dev \
    libssl-dev \
    libelf-dev \
    && rm -rf /var/lib/apt/lists/*

ADD https://github.com/torvalds/linux.git#v$LINUX_VERSION /usr/src/linux-$LINUX_VERSION
RUN ln -s /usr/src/linux-$LINUX_VERSION /usr/src/linux
WORKDIR /usr/src/linux-$LINUX_VERSION

RUN make defconfig

COPY <<'EOF' allconfig
CONFIG_9P_FS=y
CONFIG_9P_FS_POSIX_ACL=y
CONFIG_9P_FS_SECURITY=y
CONFIG_BALLOON_COMPACTION=y
CONFIG_CRYPTO_DEV_VIRTIO=y
CONFIG_DEBUG_FS=y
CONFIG_DEBUG_INFO=y
CONFIG_DEBUG_INFO_BTF=y
CONFIG_DEBUG_INFO_DWARF4=y
CONFIG_DEBUG_INFO_REDUCED=n
CONFIG_DEBUG_INFO_SPLIT=n
CONFIG_DEVPTS_FS=y
CONFIG_DRM_VIRTIO_GPU=y
CONFIG_FRAME_POINTER=y
CONFIG_GDB_SCRIPTS=y
CONFIG_HW_RANDOM_VIRTIO=y
CONFIG_HYPERVISOR_GUEST=y
CONFIG_IKCONFIG=y
CONFIG_IKCONFIG_PROC=y
CONFIG_NET_9P=y
CONFIG_NET_9P_DEBUG=n
CONFIG_NET_9P_VIRTIO=y
CONFIG_PARAVIRT=y
CONFIG_PCI=y
CONFIG_PCI_HOST_GENERIC=y
CONFIG_USER_NS=y
CONFIG_VIRTIO_BALLOON=y
CONFIG_VIRTIO_BLK=y
CONFIG_VIRTIO_BLK_SCSI=y
CONFIG_VIRTIO_CONSOLE=y
CONFIG_VIRTIO_INPUT=y
CONFIG_VIRTIO_NET=y
CONFIG_VIRTIO_PCI=y
CONFIG_VIRTIO_PCI_LEGACY=y
EOF

RUN make KCONFIG_ALLCONFIG=allconfig olddefconfig && \
    make -j"$(nproc)"


# Intentionally keep all of the intermediate build artifacts in this image
# so that the kernel can be incrementally recompiled
FROM build-kernel AS dev-kernel

WORKDIR /

RUN apt-get update && apt-get install -y --no-install-recommends \
    dbus \
    iproute2 \
    kmod \
    openssh-server \
    qemu-system \
    systemd-sysv \
    && rm -rf /var/lib/apt/lists/*

COPY <<'EOF' /etc/ssh/sshd_config.d/vm.conf
PasswordAuthentication yes
PermitEmptyPasswords yes
PermitRootLogin yes
EOF

COPY <<'EOF' /etc/ssh/ssh_config.d/vm.conf
Host vm
    HostName localhost
    Port 22
    ControlMaster auto
    ControlPath /tmp/ssh_mux_%h_%p_%r
    ControlPersist 10m
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
    LogLevel ERROR
EOF

COPY --chmod=755 <<'EOF' /usr/local/bin/vm
#!/bin/sh
subcommand="$1"
shift
if [ ! -x "/usr/local/bin/vm-$subcommand" ]; then
    echo "Unknown subcommand: $subcommand" >&2
    exit 1
fi
exec "/usr/local/bin/vm-$subcommand" "$@"
EOF

COPY --chmod=4755 <<'EOF' /usr/local/bin/vm-start
#!/usr/bin/exec-suid --real --environ=none -- /bin/sh
start-stop-daemon \
    --start \
    --quiet \
    --background \
    --make-pidfile \
    --pidfile /var/run/vm.pid \
    --startas /bin/sh -- -c 'exec /usr/local/bin/vm-boot >/var/log/vm.log 2>&1'
EOF

COPY --chmod=755 <<'EOF' /usr/local/bin/vm-boot
#!/bin/sh

if [ -e /dev/kvm ]; then
    KVM_OPT="-enable-kvm"
else
    KVM_OPT=""
fi

DISK_PATH="/tmp/disk.img"
if [ ! -f "$DISK_PATH" ]; then
    truncate -s 1G "$DISK_PATH"
fi

exec /usr/bin/qemu-system-x86_64 \
    -kernel /usr/src/linux/arch/x86/boot/bzImage \
    -fsdev local,id=rootfs,path=/,security_model=passthrough,multidevs=remap \
    -device virtio-9p-pci,fsdev=rootfs,mount_tag=/dev/root \
    -device e1000,netdev=net0 \
    -netdev user,id=net0,hostfwd=tcp::23-:22 \
    -drive file="$DISK_PATH",format=raw,if=none,id=virtiodisk \
    -device virtio-blk-pci,drive=virtiodisk \
    -m 2G \
    -smp 2 \
    -nographic \
    -monitor none \
    -append "root=/dev/root rw rootfstype=9p rootflags=trans=virtio,msize=512000 console=ttyS0 init=/lib/systemd/systemd systemd.unit=multi-user.target" \
    $KVM_OPT
EOF

RUN mkdir -p /etc/systemd/network /etc/systemd/system/multi-user.target.wants /run/systemd/resolve/

COPY <<'EOF' /etc/systemd/network/20-eth0.network
[Match]
Name=eth0

[Network]
DHCP=yes
EOF

COPY <<'EOF' /etc/sysctl.d/99-vm.conf
fs.protected_fifos = 1
fs.protected_hardlinks = 1
fs.protected_regular = 2
fs.protected_symlinks = 1
EOF

COPY <<'EOF' /etc/systemd/system/set-vm-hostname.service
[Unit]
Description=vm hostname
Before=multi-user.target

[Service]
Type=oneshot
ExecStart=/bin/hostname vm

[Install]
WantedBy=multi-user.target
EOF

RUN echo vm > /etc/hostname && \
    ln -sf /etc/resolv.conf /run/systemd/resolve/resolv.conf && \
    ln -sf /etc/systemd/system/set-vm-hostname.service /etc/systemd/system/multi-user.target.wants/set-vm-hostname.service && \
    ln -sf /lib/systemd/system/systemd-networkd.service /etc/systemd/system/multi-user.target.wants/systemd-networkd.service && \
    ln -sf /lib/systemd/system/systemd-resolved.service /etc/systemd/system/multi-user.target.wants/systemd-resolved.service && \
    ln -sf /lib/systemd/system/ssh.service /etc/systemd/system/multi-user.target.wants/ssh.service

COPY --chmod=4755 <<'EOF' /usr/local/bin/vm-stop
#!/usr/bin/exec-suid --real --environ=none -- /bin/sh
start-stop-daemon \
    --stop \
    --quiet \
    --pidfile /var/run/vm.pid
EOF

COPY --chmod=755 <<'EOF' /usr/local/bin/vm-connect
#!/bin/sh
exec /usr/bin/ssh -p 23 -t vm /bin/bash -l
EOF

COPY --chmod=755 <<'EOF' /usr/local/bin/vm-exec
#!/bin/sh
exec /usr/bin/ssh -p 23 vm "$@"
EOF

COPY --chmod=755 <<'EOF' /usr/local/bin/vm-logs
#!/bin/sh
if [ ! -f /var/log/vm.log ]; then
    if [ "$UID" -ne 0 ]; then
        echo "Start the vm first!"
        exit 1
    else
        touch /var/log/vm.log
    fi
fi
tail -f /var/log/vm.log
EOF

FROM dev-kernel AS runtime

SHELL ["/bin/bash", "-ceov", "pipefail"]

ENV DEBIAN_FRONTEND=noninteractive
ENV LC_CTYPE=C.UTF-8

RUN <<EOF
    rm -f /etc/apt/apt.conf.d/docker-clean
    echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache
    (set +o pipefail; yes | unminimize)
    apt-get clean && rm -rf /var/lib/apt/lists/*
EOF

RUN printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d; \
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

RUN chmod u+s /usr/bin/sudo /usr/local/bin/vm-start /usr/local/bin/vm-stop

COPY --chmod=440 <<'EOF' /etc/sudoers.d/hacker
hacker ALL=(root) NOPASSWD: ALL
EOF

RUN useradd -m hacker
