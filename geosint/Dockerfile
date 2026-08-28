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
    python3 \
    python3-pip \
    unzip

RUN --mount=type=cache,target=/var/cache/pip \
    python3 -m pip install --no-compile --ignore-installed --force-reinstall --upgrade pip setuptools wheel && \
    python3 -m pip install --no-compile --ignore-installed --force-reinstall \
    flask \
    gunicorn

RUN mkdir -p /opt/geosint/static/vendor/leaflet && \
    curl -fsSL -o /tmp/leaflet.zip https://github.com/Leaflet/Leaflet/releases/download/v1.9.4/leaflet.zip && \
    unzip -qo /tmp/leaflet.zip -d /tmp/leaflet && \
    cp /tmp/leaflet/dist/leaflet.js /tmp/leaflet/dist/leaflet.css /opt/geosint/static/vendor/leaflet/ && \
    cp -R /tmp/leaflet/dist/images /opt/geosint/static/vendor/leaflet/images && \
    rm -rf /tmp/leaflet /tmp/leaflet.zip

RUN mkdir -p /opt/geosint/static/vendor/pannellum && \
    curl -fsSL -o /tmp/pannellum.zip https://github.com/mpetroff/pannellum/releases/download/2.5.6/pannellum-2.5.6.zip && \
    unzip -qo /tmp/pannellum.zip -d /tmp/pannellum && \
    cp /tmp/pannellum/pannellum/pannellum.js \
    /tmp/pannellum/pannellum/pannellum.css \
    /tmp/pannellum/pannellum/COPYING /opt/geosint/static/vendor/pannellum/ && \
    rm -rf /tmp/pannellum /tmp/pannellum.zip

RUN mkdir -p /opt/geosint/static/vendor/maplibre && \
    curl -fsSL -o /opt/geosint/static/vendor/maplibre/maplibre-gl.js \
    https://unpkg.com/maplibre-gl@5.9.0/dist/maplibre-gl.js && \
    curl -fsSL -o /opt/geosint/static/vendor/maplibre/maplibre-gl.css \
    https://unpkg.com/maplibre-gl@5.9.0/dist/maplibre-gl.css

RUN mkdir -p /opt/geosint/static/vendor/use-gesture && \
    curl -fsSL -o /opt/geosint/static/vendor/use-gesture/use-gesture.mjs \
    https://esm.sh/@use-gesture/vanilla@10.3.1/es2022/vanilla.bundle.mjs

RUN mkdir -p /opt/geosint/static/vendor/lucide && \
    curl -fsSL -o /opt/geosint/static/vendor/lucide/lucide.min.js \
    https://unpkg.com/lucide@1.34.0/dist/umd/lucide.min.js && \
    sed -i '/sourceMappingURL/d' /opt/geosint/static/vendor/lucide/lucide.min.js

WORKDIR /opt/geosint

COPY --chown=0:0 --chmod=0444 wsgi.py gunicorn.conf.py /opt/geosint/
COPY --chmod=755 init /challenge/.init
COPY --chown=0:0 templates/ /opt/geosint/templates/
COPY --chown=0:0 static/css/ /opt/geosint/static/css/
COPY --chown=0:0 static/js/ /opt/geosint/static/js/

COPY --chown=0:0 --from=pwmcollege/glow /usr/local/bin/glow /usr/local/bin/glow

COPY --chown=0:0 --from=0xfluffyfluff/fluffys-extensions /run/challenge/share/code/extensions /run/challenge/share/code/extensions

COPY bash.bashrc /opt/bash/bash.bashrc

RUN printf '\n[ "$UID" -eq 1000 ] && . /opt/bash/bash.bashrc\n' >> /etc/bash.bashrc && \
    chmod 0555 /opt/geosint && \
    find /opt/geosint/templates /opt/geosint/static -type d -exec chmod 0555 {} + && \
    find /opt/geosint/templates /opt/geosint/static -type f -exec chmod 0444 {} + && \
    if id ubuntu &>/dev/null; then userdel -f -r ubuntu; fi && \
    ln -sfn /usr/bin/python3 /usr/local/bin/python && \
    ln -sfn /usr/bin/pip3 /usr/local/bin/pip && \
    ln -sfn /etc/bash.bashrc /etc/bashrc && \
    mkdir -p -m 0700 /var/log/gunicorn && \
    find / -xdev -type f -perm -4000 -exec chmod u-s {} \; && \
    rm -rf /usr/share/doc/* /usr/share/info/* /usr/share/locale/* /tmp/* /tmp/.[!.]* /tmp/..?*
