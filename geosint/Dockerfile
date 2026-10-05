FROM denoland/deno:latest AS build

WORKDIR /app/client

COPY client/package.json client/deno.json client/deno.lock ./
RUN --mount=type=cache,target=/deno-dir deno install --frozen

COPY client/ ./
RUN --mount=type=cache,target=/deno-dir deno task build

FROM ubuntu:26.04 AS runtime

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ENV DEBIAN_FRONTEND=noninteractive
ENV LC_CTYPE=C.UTF-8
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_CACHE_DIR=/var/cache/pip
ENV PIP_BREAK_SYSTEM_PACKAGES=1

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean && \
    apt-get update && \
    apt-get install --no-install-recommends -y \
    ca-certificates \
    curl \
    imagemagick \
    libheif-plugin-libde265 \
    python3 \
    python3-pip

RUN --mount=type=cache,target=/var/cache/pip \
    python3 -m pip install --no-compile --ignore-installed --force-reinstall --upgrade pip setuptools wheel && \
    python3 -m pip install --no-compile --ignore-installed --force-reinstall \
    flask \
    gunicorn

WORKDIR /opt/geosint/server

COPY --chown=0:0 --chmod=0444 server/wsgi.py server/media.py server/gunicorn.conf.py /opt/geosint/server/
COPY --chmod=755 server/init /challenge/.init
COPY --chown=0:0 --from=build /app/client/dist/ /opt/geosint/client/dist/

COPY --chown=0:0 --from=pwmcollege/glow /usr/local/bin/glow /usr/local/bin/glow

COPY bash.bashrc /opt/bash/bash.bashrc

RUN printf '\n[ "$UID" -eq 1000 ] && . /opt/bash/bash.bashrc\n' >> /etc/bash.bashrc && \
    chmod 0555 /opt/geosint && \
    find /opt/geosint/server /opt/geosint/client -type d -exec chmod 0555 {} + && \
    find /opt/geosint/server /opt/geosint/client -type f -exec chmod 0444 {} + && \
    if id ubuntu &>/dev/null; then userdel -f -r ubuntu; fi && \
    ln -sfn /usr/bin/python3 /usr/local/bin/python && \
    ln -sfn /usr/bin/pip3 /usr/local/bin/pip && \
    ln -sfn /etc/bash.bashrc /etc/bashrc && \
    mkdir -p -m 0700 /var/log/gunicorn && \
    find / -xdev -type f -perm -4000 -exec chmod u-s {} \; && \
    rm -rf /usr/share/doc/* /usr/share/info/* /usr/share/locale/* /tmp/* /tmp/.[!.]* /tmp/..?*
