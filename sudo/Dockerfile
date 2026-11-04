FROM ubuntu:22.04 AS iftop-build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    libncurses-dev \
    libpcap0.8-dev \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /tmp/iftop /install && \
    curl -fsSL https://pdw.ex-parrot.com/iftop/download/iftop-1.0pre4.tar.gz | tar -xz -C /tmp/iftop --strip-components=1 && \
    cd /tmp/iftop && \
    CFLAGS="-O2 -fcommon -DALLOW_SUBSHELL" ./configure --prefix=/usr && \
    make -j"$(nproc)" && \
    make DESTDIR=/install install && \
    test -x /install/usr/sbin/iftop && \
    rm -rf /tmp/iftop

FROM ubuntu:22.04 AS dev-kernel

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    dbus \
    gnupg \
    iproute2 \
    initramfs-tools \
    libpam-systemd \
    kmod \
    linux-image-generic \
    openssh-server \
    qemu-system \
    systemd-sysv && \
    rm -rf /var/lib/apt/lists/*

RUN printf '%s\n' \
    9p \
    9pnet \
    9pnet_virtio \
    virtio \
    virtio_pci \
    virtio_ring \
    virtio_blk \
    > /etc/initramfs-tools/modules && \
    update-initramfs -u -k all

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
#!/usr/bin/exec-suid --real -- /bin/sh
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

KERNEL_PATH="/boot/vmlinuz"
INITRD_PATH="/boot/initrd.img"

exec /usr/bin/qemu-system-x86_64 \
    -accel kvm \
    -accel tcg \
    -kernel "$KERNEL_PATH" \
    -initrd "$INITRD_PATH" \
    -fsdev local,id=rootfs,path=/,security_model=passthrough,multidevs=remap \
    -device virtio-9p-pci,fsdev=rootfs,mount_tag=rootfs \
    -fsdev local,id=homefs,path=/home/hacker,security_model=passthrough \
    -device virtio-9p-pci,fsdev=homefs,mount_tag=homefs \
    -device e1000,netdev=net0 \
    -netdev user,id=net0,hostfwd=tcp::23-:22 \
    -m 2G \
    -smp "$(nproc)" \
    -nographic \
    -monitor none \
    -append "root=rootfs rw rootfstype=9p rootflags=trans=virtio,msize=512000 console=ttyS0 init=/lib/systemd/systemd systemd.unit=multi-user.target"
EOF

RUN mkdir -p /etc/systemd/network /etc/systemd/system/multi-user.target.wants /run/systemd/resolve/

COPY <<'EOF' /etc/systemd/network/20-eth0.network
[Match]
Name=en* eth*

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

COPY <<'EOF' /etc/systemd/system/mount-homefs.service
[Unit]
Description=Mount homefs
After=local-fs.target
Before=multi-user.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/mount -t 9p -o trans=virtio,version=9p2000.L,nosuid homefs /home/hacker

[Install]
WantedBy=multi-user.target
EOF

RUN echo vm > /etc/hostname && \
    ln -sf /etc/resolv.conf /run/systemd/resolve/resolv.conf && \
    ln -sf /etc/systemd/system/set-vm-hostname.service /etc/systemd/system/multi-user.target.wants/set-vm-hostname.service && \
    ln -sf /etc/systemd/system/mount-homefs.service /etc/systemd/system/multi-user.target.wants/mount-homefs.service && \
    ln -sf /lib/systemd/system/systemd-networkd.service /etc/systemd/system/multi-user.target.wants/systemd-networkd.service && \
    ln -sf /lib/systemd/system/systemd-resolved.service /etc/systemd/system/multi-user.target.wants/systemd-resolved.service && \
    ln -sf /lib/systemd/system/ssh.service /etc/systemd/system/multi-user.target.wants/ssh.service

COPY --chmod=4755 <<'EOF' /usr/local/bin/vm-stop
#!/usr/bin/exec-suid --real -- /bin/sh
start-stop-daemon \
    --stop \
    --quiet \
    --retry TERM/10/KILL/5 \
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

ADD --chown=0:0 --chmod=6755 http://github.com/pwncollege/exec-suid/releases/latest/download/exec-suid /usr/bin/exec-suid

FROM dev-kernel AS runtime

SHELL ["/bin/bash", "-ceov", "pipefail"]

ENV DEBIAN_FRONTEND=noninteractive
ENV LC_CTYPE=C.UTF-8

ARG NODE_VER=26

RUN <<EOF
    rm -f /etc/apt/apt.conf.d/docker-clean
    echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache
    (set +o pipefail; yes | unminimize)

    curl -fsSL https://deb.nodesource.com/setup_${NODE_VER}.x | bash -

    apt-get clean
    rm -rf /var/lib/apt/lists/*
EOF

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    acl \
    acr \
    alpine \
    alsa-oss \
    apache2 \
    apache2-utils \
    apparmor \
    aptitude \
    aria2 \
    arj \
    ash \
    aspell \
    aspell-en \
    asterisk \
    at \
    autoconf \
    automake \
    bacula-console \
    base58 \
    basez \
    bash \
    bat \
    binutils \
    borgbackup \
    bpftrace \
    bsd-mailx \
    bsdmainutils \
    busybox \
    bzip2 \
    cabal-install \
    cargo \
    cdist \
    certbot \
    clamav \
    clisp \
    cmake \
    composer \
    coreutils \
    cowsay \
    cpio \
    cpulimit \
    crash \
    cron \
    csh \
    csvtool \
    cups \
    daemontools \
    dash \
    dbus \
    dc \
    debianutils \
    dialog \
    diffutils \
    distcc \
    dmidecode \
    dmsetup \
    dnsutils \
    dnsmasq-base \
    docker.io \
    doas \
    dos2unix \
    dosbox \
    dstat \
    dnf \
    e2fsprogs \
    easy-rsa \
    eb-utils \
    ed \
    efax \
    elvish \
    emacs-nox \
    enscript \
    espeak \
    expect \
    fail2ban \
    ffmpeg \
    file \
    findutils \
    finger \
    firejail \
    fish \
    fping \
    fzf \
    g++ \
    gawk \
    gcc \
    gdb \
    genisoimage \
    gettext \
    ghc \
    gimp \
    ginac-tools \
    git \
    gnucobol \
    gnuplot-nox \
    golang-1.20-go \
    grc \
    grep \
    groff-base \
    guile-3.0 \
    gzip \
    hashcat \
    hping3 \
    highlight \
    iamerican \
    iftop \
    inetutils-ftp \
    inetutils-telnetd \
    iproute2 \
    isc-dhcp-client \
    ispell \
    joe \
    jq \
    kbd \
    krb5-user \
    ksh \
    latexmk \
    less \
    lftp \
    libc-bin \
    libcap2-bin \
    libdate-manip-perl \
    libglib2.0-dev-bin \
    libimage-exiftool-perl \
    libmonitoring-plugin-perl \
    libnet-cups-perl \
    libvirt-clients \
    libwww-perl \
    links \
    linux-tools-generic \
    logsave \
    ltrace \
    lua5.3 \
    mime-support \
    m4 \
    make \
    man-db \
    mariadb-client \
    mawk \
    mercurial \
    minicom \
    monitoring-plugins \
    monitoring-plugins-basic \
    nagios-plugins-contrib \
    monitoring-plugins-standard \
    mosh \
    mosquitto \
    mtr-tiny \
    multitime \
    mutt \
    mypy \
    nano \
    nasm \
    ncdu \
    ncftp \
    ncurses-bin \
    needrestart \
    neofetch \
    neovim \
    net-tools \
    netcat-openbsd \
    nftables \
    nginx-full \
    nmap \
    nodejs \
    node-typescript \
    ntpsec-ntpdate \
    octave \
    openjdk-11-jdk-headless \
    openjdk-11-jre-headless \
    openjdk-8-jdk-headless \
    openssh-client \
    openssl \
    openvpn \
    original-awk \
    p7zip-full \
    pandoc \
    passwd \
    pax \
    perl \
    pexec \
    php-cli \
    pipx \
    plymouth \
    pocl-opencl-icd \
    podman \
    policykit-1 \
    posh \
    postgresql-client \
    procmail \
    procps \
    pry \
    putty-tools \
    python-is-python3 \
    python-setuptools \
    python2 \
    python3-pip \
    python3-pygments \
    python3-poetry \
    python3-setuptools \
    qpdf \
    r-base-core \
    rake \
    ranger \
    rc \
    redis-server \
    redis-tools \
    restic \
    rlwrap \
    rpm \
    rsh-client \
    rsync \
    rsyslog \
    rtorrent \
    ruby \
    ruby-ascii85 \
    ruby-bundler \
    ruby-byebug \
    ruby-redcarpet \
    rustc \
    rustfmt \
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
    socket \
    sqlite3 \
    sqlmap \
    squashfs-tools \
    sshfs \
    sshpass \
    sshuttle \
    strace \
    sudo \
    sysstat \
    systemd \
    tasksh \
    taskwarrior \
    tcl \
    tcpdump \
    tcsh \
    tdb-tools \
    telnet \
    texlive-binaries \
    texlive-latex-base \
    texlive-luatex \
    texlive-xetex \
    tftp-hpa \
    time \
    tk \
    tmate \
    tmux \
    torsocks \
    tshark \
    unzip \
    urjtag \
    util-linux \
    valgrind \
    varnish \
    vim-nox \
    w3m \
    wget \
    whiptail \
    whois \
    wireguard-tools \
    wireshark \
    x11-apps \
    x11-xserver-utils \
    xdg-user-dirs \
    xdotool \
    xpad \
    xxd \
    xz-utils \
    yt-dlp \
    yash \
    yelp \
    zathura \
    zip \
    zsh \
    zypper && \
    for zsoelim in /usr/libexec/man-db/zsoelim /usr/lib/man-db/zsoelim; do \
    if [ -x "$zsoelim" ]; then ln -sf "$zsoelim" /usr/bin/zsoelim; break; fi; \
    done && \
    if [ -x /usr/sbin/tcpdump ]; then ln -sf /usr/sbin/tcpdump /usr/bin/tcpdump; fi && \
    ln -sf /usr/bin/torsocks /usr/bin/torify && \
    ln -sf /usr/bin/pdb3 /usr/bin/pdb && \
    ln -sf /usr/lib/go-1.20/bin/go /usr/bin/go && \
    ln -sf /usr/bin/resolvectl /usr/bin/systemd-resolve && \
    rm -f /usr/sbin/policy-rc.d && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN npm install --global --ignore-scripts yarn@1.22.22

COPY --from=iftop-build --chmod=0755 /install/usr/sbin/iftop /usr/sbin/iftop

RUN <<EOF
set -euo pipefail
root=/tmp/rpmbuild
mkdir -p "$root"/{BUILD,BUILDROOT,RPMS,SOURCES,SPECS,SRPMS}
cat >"$root/SPECS/debian-shell-provider.spec" <<'SPEC'
Name: debian-shell-provider
Version: 1.0
Release: 1
Summary: Register Debian shell interpreter for local RPM scriptlets
License: Public Domain
BuildArch: noarch
Provides: /bin/sh

%description
Register Debian shell path in RPM metadata for local RPM scriptlet dependency resolution.

%prep

%build

%install
mkdir -p %{buildroot}

%files
SPEC
    rpmbuild --define "_topdir $root" -bb "$root/SPECS/debian-shell-provider.spec"
    rpm --justdb --noscripts --nodeps -Uvh "$root/RPMS/noarch/debian-shell-provider-1.0-1.noarch.rpm"
    rpm -q --provides debian-shell-provider | grep -Fx /bin/sh
    rm -rf "$root"
EOF

COPY --chmod=755 install-snaps.sh /usr/local/bin/install-snaps.sh
RUN --security=insecure /usr/local/bin/install-snaps.sh && rm /usr/local/bin/install-snaps.sh

COPY --from=denoland/deno:bin /deno /usr/local/bin/deno

ENV PATH="/usr/share/easy-rsa:/usr/lib/nagios/plugins:/usr/games:${PATH}"

RUN <<EOF
    cd /tmp
    curl -sS https://bootstrap.pypa.io/pip/2.7/get-pip.py -o get-pip.py
    python2 get-pip.py
    easyi=/usr/lib/python2.7/dist-packages/easy_install.py
    sed -i '1i #!/usr/bin/python2' "${easyi}"
    chmod +x "${easyi}"
    ln -sf "$easyi" /usr/bin/easy_install

    cd /opt
    curl -fSL "https://julialang-s3.julialang.org/bin/linux/x64/1.12/julia-1.12.7-linux-x86_64.tar.gz" | tar -xzf -
    mv /opt/julia-1.12.7/ /opt/julia/
    ln -s /opt/julia/bin/julia /usr/local/bin/julia

    rm -rf /tmp/*
EOF

RUN <<EOF
    ln -s /lib64/ld-linux-x86-64.so.2 /usr/bin/ld.so

    pip3 install 'pykickstart==3.64'
    gem install fpm
EOF

COPY --chown=0:0 --from=pwmcollege/glow /usr/local/bin/glow /usr/local/bin/glow

COPY bash.bashrc /opt/bash/bash.bashrc

RUN printf '\n[ "$UID" -eq 1000 ] && . /opt/bash/bash.bashrc\n' >> /etc/bash.bashrc && \
    ln -s /etc/bash.bashrc /etc/bashrc && \
    if id ubuntu; then userdel -f -r ubuntu; fi && \
    chown -R 0:0 /usr/sbin /usr/bin /usr/local/bin /opt /snap && \
    find / -xdev -type f -perm -4000 -exec chmod u-s {} \;

RUN chmod u+s /usr/bin/exec-suid /usr/bin/sudo /usr/local/bin/vm-start /usr/local/bin/vm-stop

COPY --chmod=440 <<'EOF' /etc/sudoers.d/hacker
hacker ALL=(root) NOPASSWD: ALL
EOF

RUN useradd -m hacker
