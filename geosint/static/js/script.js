"use strict";

const el = {
    pano: document.getElementById("pano"),
    toast: document.getElementById("toast"),
    dock: document.getElementById("mapdock"),
    map: document.getElementById("map"),
    expand: document.getElementById("btn-expand"),
    coordEntry: document.getElementById("coord-entry"),
    coordToggle: document.getElementById("btn-coord"),
    coordApply: document.getElementById("btn-coord-apply"),
    coordInput: document.getElementById("coord-input"),
    zoomIn: document.getElementById("btn-zoom-in"),
    zoomOut: document.getElementById("btn-zoom-out"),
    panoIn: document.getElementById("btn-pano-in"),
    panoOut: document.getElementById("btn-pano-out"),
    panoControls: document.querySelector(".pano-controls"),
    loader: document.getElementById("loader"),
    loaderTitle: document.getElementById("loader-title"),
    loaderDetail: document.getElementById("loader-detail"),
    loaderBar: document.getElementById("loader-bar"),
    guess: document.getElementById("btn-guess"),
    reset: document.getElementById("btn-reset"),
    mapHide: document.getElementById("btn-map-hide"),
    mapShow: document.getElementById("btn-map-show"),
    curtain: document.getElementById("curtain"),
    distance: document.getElementById("result-distance"),
    flagField: document.getElementById("flag-field"),
    flag: document.getElementById("flag-box"),
    copy: document.getElementById("btn-copy"),
    next: document.getElementById("btn-next"),
};

let guessMap = null;
let resultMap = null;
let resultMarkers = [];
let viewer = null;
let photoMap = null;
let photoBounds = null;
let photoTouched = false;
let photoFitting = false;
let guessMarker = null;
let guessPressAt = null;
let framePending = null;
let mounted = false;
let state = null;
let busy = false;
let pinSeq = 0;

async function api(path, options) {
    const response = await fetch(path, options);
    let body = null;
    try {
        body = await response.json();
    } catch (e) {
        body = null;
    }
    return { ok: response.ok, status: response.status, body };
}

function renderIcons(root) {
    if (window.lucide) {
        window.lucide.createIcons({ nameAttr: "data-lucide", root });
    }
}

function setIcon(button, name) {
    button.innerHTML = '<i data-lucide="' + name + '" aria-hidden="true"></i>';
    renderIcons(button);
}

function toast(message) {
    el.toast.textContent = message;
    el.toast.classList.add("show", "bad");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () {
        el.toast.classList.remove("show");
    }, 3400);
}

function formatDistance(km) {
    if (km < 1) {
        return Math.round(km * 1000) + " m";
    }
    if (km < 100) {
        return km.toFixed(1) + " km";
    }
    return Math.round(km).toLocaleString() + " km";
}

function greatCircle(from, to) {
    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;
    const lat1 = from.lat * toRad;
    const lon1 = from.lon * toRad;
    const lat2 = to.lat * toRad;
    const lon2 = to.lon * toRad;
    const d =
        2 *
        Math.asin(
            Math.sqrt(
                Math.sin((lat2 - lat1) / 2) ** 2 +
                    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
            ),
        );
    if (!d) {
        return [
            [from.lat, from.lon],
            [to.lat, to.lon],
        ];
    }

    const points = [];
    let previousLon = null;
    let offset = 0;
    for (let i = 0; i <= 96; i++) {
        const f = i / 96;
        const a = Math.sin((1 - f) * d) / Math.sin(d);
        const b = Math.sin(f * d) / Math.sin(d);
        const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
        const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
        const z = a * Math.sin(lat1) + b * Math.sin(lat2);
        let lon = Math.atan2(y, x) * toDeg;
        if (previousLon !== null && Math.abs(lon + offset - previousLon) > 180) {
            offset += lon + offset > previousLon ? -360 : 360;
        }
        lon += offset;
        previousLon = lon;
        points.push([Math.atan2(z, Math.hypot(x, y)) * toDeg, lon]);
    }
    return points;
}

function bearing(from, to) {
    const toRad = Math.PI / 180;
    const dLon = (to.lon - from.lon) * toRad;
    const lat1 = from.lat * toRad;
    const lat2 = to.lat * toRad;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function offsetReadout(km, guess, answer) {
    if (km < 0.002) {
        return "On target.";
    }
    const compass = [
        "north",
        "north-east",
        "east",
        "south-east",
        "south",
        "south-west",
        "west",
        "north-west",
    ];
    const heading = compass[Math.round(bearing(answer, guess) / 45) % 8];
    return formatDistance(km) + " " + heading + " of the target.";
}

async function basemap(container) {
    const response = await fetch(
        "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    );
    if (!response.ok) {
        throw new Error("Basemap style returned " + response.status);
    }

    const map = new maplibregl.Map({
        container: container,
        style: await response.json(),
        center: [0, 20],
        zoom: 1,
        minZoom: 1,
        maxZoom: 18,
        attributionControl: false,
        dragRotate: false,
    });
    map.touchZoomRotate.disableRotation();

    await new Promise(function (resolve, reject) {
        const timer = setTimeout(function () {
            map.remove();
            reject(new Error("Basemap timed out"));
        }, 15000);
        map.once("load", function () {
            clearTimeout(timer);
            resolve();
        });
    });
    return map;
}

function createPin(light, dark, className) {
    const id = "pin-grad-" + pinSeq++;
    const wrapper = document.createElement("div");
    wrapper.className = className;
    wrapper.innerHTML =
        '<svg width="36" height="40" viewBox="0 0 36 40" aria-hidden="true">' +
        '<defs><linearGradient id="' +
        id +
        '" x1="0.2" y1="0" x2="0.8" y2="1">' +
        '<stop offset="0" stop-color="' +
        light +
        '"/><stop offset="1" stop-color="' +
        dark +
        '"/></linearGradient></defs>' +
        '<path d="M18 37.8 C20.2 34.3 26.3 29.2 29.37 25.15 A14 14 0 1 0 6.63 25.15' +
        ' C9.7 29.2 15.8 34.3 18 37.8 Z" fill="#fff"/>' +
        '<circle cx="18" cy="17" r="11" fill="url(#' +
        id +
        ')"/>' +
        '<circle cx="18" cy="13.4" r="3.3" fill="#fff"/>' +
        '<path d="M16.75 18.2 h2.5 L18 25.6 Z" fill="#fff"/>' +
        "</svg>";
    return wrapper;
}

function formatBytes(bytes) {
    if (bytes < 1024 * 1024) {
        return Math.round(bytes / 1024) + " KB";
    }
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function loaderProgress(loaded, total) {
    el.loaderBar.classList.remove("indeterminate");
    el.loaderBar.style.width = Math.round((loaded / total) * 100) + "%";
    el.loaderDetail.textContent = formatBytes(loaded) + " of " + formatBytes(total);
}

function loaderPending(detail) {
    el.loaderBar.classList.add("indeterminate");
    el.loaderBar.style.width = "";
    el.loaderDetail.textContent = detail;
}

function loaderDone() {
    el.loader.classList.add("done");
}

function loaderFailed(detail) {
    el.loader.classList.remove("done");
    el.loader.classList.add("failed");
    el.loaderBar.classList.remove("indeterminate");
    el.loaderBar.style.width = "100%";
    el.loaderTitle.textContent = "Could not load imagery";
    el.loaderDetail.textContent = detail;
}

function fetchMedia(url, onProgress) {
    return new Promise(function (resolve, reject) {
        const request = new XMLHttpRequest();
        request.open("GET", url);
        request.responseType = "blob";
        request.onprogress = function (event) {
            if (event.lengthComputable) {
                onProgress(event.loaded, event.total);
            }
        };
        request.onload = function () {
            if (request.status >= 200 && request.status < 300) {
                resolve(URL.createObjectURL(request.response));
            } else {
                reject(new Error("Server returned " + request.status));
            }
        };
        request.onerror = function () {
            reject(new Error("Request failed"));
        };
        request.send();
    });
}

async function fetchAll(urls) {
    const loaded = urls.map(function () {
        return 0;
    });
    const totals = urls.map(function () {
        return 0;
    });
    return Promise.all(
        urls.map(function (url, index) {
            return fetchMedia(url, function (bytes, total) {
                loaded[index] = bytes;
                totals[index] = total;
                const sum = function (a, b) {
                    return a + b;
                };
                loaderProgress(loaded.reduce(sum, 0), totals.reduce(sum, 0));
            });
        }),
    );
}

async function mountMedia(media) {
    el.panoControls.hidden = media.kind !== "pano";

    if (media.kind === "image") {
        const source = await fetchMedia(media.url, loaderProgress);
        loaderPending("Preparing view");
        const probe = new Image();
        probe.src = source;
        await probe.decode().catch(function () {});
        const bounds = [
            [0, 0],
            [probe.naturalHeight || 1024, probe.naturalWidth || 2048],
        ];
        photoMap = L.map(el.pano, {
            crs: L.CRS.Simple,
            maxZoom: 4,
            zoomSnap: 0,
            scrollWheelZoom: false,
            attributionControl: false,
            maxBounds: L.latLngBounds(bounds).pad(0.6),
            maxBoundsViscosity: 0.5,
        });

        el.pano.addEventListener(
            "wheel",
            function (event) {
                event.preventDefault();
                const pixels =
                    event.deltaMode === 1
                        ? event.deltaY * 16
                        : event.deltaMode === 2
                          ? event.deltaY * el.pano.clientHeight
                          : event.deltaY;
                photoMap.setZoomAround(
                    photoMap.mouseEventToContainerPoint(event),
                    photoMap.getZoom() - pixels / 220,
                    { animate: false },
                );
            },
            { passive: false },
        );
        L.imageOverlay(source, bounds).addTo(photoMap);
        photoBounds = bounds;
        photoTouched = false;
        photoMap.on("zoomstart movestart", function () {
            if (!photoFitting) {
                photoTouched = true;
            }
        });
        fitPhoto();
        loaderDone();
        return;
    }

    const config = {
        type: media.type,
        autoLoad: true,
        mouseZoom: false,
        showZoomCtrl: false,
        showFullscreenCtrl: false,
        compass: false,
        friction: 0.15,
        minHfov: 30,
        maxHfov: 120,
        yaw: 0,
        pitch: 0,
        hfov: 100,
    };

    if (media.type === "equirectangular") {
        config.panorama = await fetchMedia(media.url, loaderProgress);
    } else if (media.type === "cubemap") {
        config.cubeMap = await fetchAll(media.faces);
    } else {
        config.multiRes = media.multiRes;
        loaderPending("Streaming tiles");
    }

    loaderPending("Preparing view");
    viewer = pannellum.viewer(el.pano, config);

    let hfovTarget = null;
    let hfovFrame = null;

    function stepZoom() {
        const current = viewer.getHfov();
        const remaining = hfovTarget - current;

        if (Math.abs(remaining) < 0.05) {
            viewer.setHfov(hfovTarget, 0);
            hfovTarget = null;
            hfovFrame = null;
            return;
        }

        viewer.setHfov(current + remaining * 0.28, 0);
        hfovFrame = requestAnimationFrame(stepZoom);
    }

    function zoomBy(amount) {
        const from = hfovTarget === null ? viewer.getHfov() : hfovTarget;
        hfovTarget = Math.min(
            config.maxHfov,
            Math.max(config.minHfov, from + amount),
        );

        if (hfovFrame === null) {
            hfovFrame = requestAnimationFrame(stepZoom);
        }
    }

    el.pano.addEventListener(
        "wheel",
        function (event) {
            event.preventDefault();
            const pixels =
                event.deltaMode === 1
                    ? event.deltaY * 16
                    : event.deltaMode === 2
                      ? event.deltaY * el.pano.clientHeight
                      : event.deltaY;
            zoomBy(pixels * (event.ctrlKey ? 0.4 : 0.15));
        },
        { passive: false },
    );

    viewer.on("load", loaderDone);
    viewer.on("error", function (message) {
        loaderFailed(String(message));
    });
}

function limitPhotoZoom() {
    const size = photoMap.getSize();
    photoMap.setMinZoom(
        Math.log2(
            Math.min(size.x / photoBounds[1][1], size.y / photoBounds[1][0]),
        ) - 0.4,
    );
}

function fitPhoto() {
    photoFitting = true;
    limitPhotoZoom();
    photoMap.fitBounds(photoBounds, { animate: false });
    photoFitting = false;
}

function fitMedia() {
    if (viewer) {
        viewer.resize();
        return;
    }
    if (!photoMap) {
        return;
    }
    photoFitting = true;
    photoMap.invalidateSize({ animate: false });
    limitPhotoZoom();
    photoFitting = false;
    if (!photoTouched) {
        fitPhoto();
    }
}

function parseCoordinates(text) {
    const input = String(text || "").trim();
    if (!input) {
        return null;
    }

    const pattern =
        /(\d+(?:\.\d+)?)\s*[°d:]\s*(?:(\d+(?:\.\d+)?)\s*['′m:]\s*)?(?:(\d+(?:\.\d+)?)\s*["″s]?\s*)?([NSEW])?/gi;
    const dms = [...input.matchAll(pattern)].filter(function (m) {
        return m[2] !== undefined || m[4];
    });

    if (dms.length >= 2) {
        const values = dms.slice(0, 2).map(function (m) {
            const decimal = Number(m[1]) + Number(m[2] || 0) / 60 + Number(m[3] || 0) / 3600;
            const hemisphere = (m[4] || "").toUpperCase();
            return {
                value: "SW".includes(hemisphere) ? -decimal : decimal,
                hemisphere: hemisphere,
            };
        });
        let first = values[0];
        let second = values[1];
        if ("EW".includes(first.hemisphere) || "NS".includes(second.hemisphere)) {
            [first, second] = [second, first];
        }
        return finite(first.value, second.value);
    }

    const numbers = input.match(/-?\d+(?:\.\d+)?/g);
    if (!numbers || numbers.length < 2) {
        return null;
    }
    return finite(Number(numbers[0]), Number(numbers[1]));
}

function finite(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
    }
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        return null;
    }
    return { lat: lat, lon: lon };
}

function refreshCoordApply() {
    el.coordApply.disabled = parseCoordinates(el.coordInput.value) === null;
}

function writeCoordInput() {
    if (!guessMarker) {
        return;
    }
    const at = guessMarker.getLngLat();
    el.coordInput.value = at.lat.toFixed(5) + ", " + at.lng.toFixed(5);
    el.coordEntry.classList.remove("invalid");
    refreshCoordApply();
}

function showCoordEntry(open) {
    el.coordEntry.hidden = !open;
    el.coordToggle.setAttribute("aria-pressed", String(open));
    el.coordEntry.classList.remove("invalid");
    refreshCoordApply();
    if (open) {
        el.coordInput.select();
        el.coordInput.focus();
    }
}

function applyTypedCoordinates() {
    const parsed = parseCoordinates(el.coordInput.value);
    if (!parsed) {
        el.coordEntry.classList.add("invalid");
        return false;
    }
    el.coordEntry.classList.remove("invalid");
    setGuess({ lng: parsed.lon, lat: parsed.lat });
    guessMap.jumpTo({
        center: [parsed.lon, parsed.lat],
        zoom: Math.max(guessMap.getZoom(), 12),
    });
    return true;
}

function setGuess(latlng) {
    if (state && state.solved) {
        return;
    }

    el.guess.classList.remove("miss");
    const wrapped = maplibregl.LngLat.convert(latlng).wrap();
    if (guessMarker) {
        guessMarker.setLngLat(wrapped);
    } else {
        guessMarker = new maplibregl.Marker({
            element: createPin("#f38ba8", "#d20f39", "guess-pin"),
            anchor: "bottom",
            draggable: true,
        })
            .setLngLat(wrapped)
            .addTo(guessMap);
        guessMarker.on("drag", writeCoordInput);
        guessMarker.on("dragend", function () {
            setGuess(guessMarker.getLngLat().wrap());
            writeCoordInput();
        });
        guessMarker.getElement().addEventListener("pointerdown", function (event) {
            guessPressAt = { x: event.clientX, y: event.clientY };
        });
        guessMarker.getElement().addEventListener("click", function (event) {
            event.stopPropagation();
            const moved =
                guessPressAt &&
                Math.hypot(event.clientX - guessPressAt.x, event.clientY - guessPressAt.y) > 4;
            guessPressAt = null;
            if (!moved && !(state && state.solved)) {
                clearGuess();
            }
        });
    }

    el.guess.disabled = false;
    el.guess.querySelector("span").textContent = "Guess";

    if (document.activeElement !== el.coordInput) {
        writeCoordInput();
    }
}

function pinAt(map, at, light, dark, title) {
    const marker = new maplibregl.Marker({
        element: createPin(light, dark, "result-pin"),
        anchor: "bottom",
    })
        .setLngLat([at.lon, at.lat])
        .addTo(map);
    marker.getElement().title = title;
    return marker;
}

function lineBetween(from, to) {
    return {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                properties: {},
                geometry: {
                    type: "LineString",
                    coordinates: greatCircle(from, to).map(function (point) {
                        return [point[1], point[0]];
                    }),
                },
            },
        ],
    };
}

function revealLayer(map) {
    map.addSource("reveal", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
        id: "reveal",
        type: "line",
        source: "reveal",
        paint: {
            "line-color": "#ffffff",
            "line-width": 1.6,
            "line-dasharray": [2, 2],
            "line-opacity": 0.75,
        },
    });
}

function setMapVisible(visible) {
    document.body.classList.toggle("map-hidden", !visible);
    el.mapShow.hidden = visible;
    if (visible) {
        guessMap.resize();
        frameGuess(0);
    }
}

function frameGuess(duration) {
    if (!guessMarker) {
        return;
    }
    const at = guessMarker.getLngLat();
    const point = guessMap.project(at);
    const canvas = guessMap.getCanvas();
    if (
        point.x >= 24 &&
        point.y >= 24 &&
        point.x <= canvas.clientWidth - 24 &&
        point.y <= canvas.clientHeight - 24
    ) {
        return;
    }
    guessMap.easeTo({ center: at, duration: duration });
}

function showGuess(guess) {
    if (guessMarker) {
        guessMarker.setDraggable(false);
    } else if (guess) {
        guessMarker = pinAt(guessMap, guess, "#f38ba8", "#d20f39", "Your guess");
    }
}

function clearGuess() {
    if (guessMarker) {
        guessMarker.remove();
        guessMarker = null;
    }
    el.coordInput.value = "";
    el.coordEntry.classList.remove("invalid");
    refreshCoordApply();
    el.guess.classList.remove("miss", "solved");
    el.guess.disabled = true;
    el.guess.title = "";
    el.guess.querySelector("span").textContent = "Drop a pin";
}

function render(next) {
    state = next;

    if (next.solved) {
        el.guess.disabled = false;
        el.guess.classList.remove("miss");
        el.guess.classList.add("solved");
        el.guess.querySelector("span").textContent = "Solved";
        el.guess.title = "Show the result again";
        showCoordEntry(false);
        showGuess(next.guess);
        frameGuess(0);
    }
    el.coordToggle.disabled = Boolean(next.solved);

    if (!mounted) {
        mounted = true;
        mountMedia(next.media).catch(function (error) {
            loaderFailed(error.message);
        });
    }
}

async function refresh() {
    const { ok, body } = await api("api/state");
    if (!ok) {
        toast("server error");
        return;
    }
    render(body);
}

async function submitGuess(retried) {
    if (busy || !guessMarker || (state && state.solved)) {
        return;
    }

    busy = true;
    el.guess.disabled = true;
    const at = guessMarker.getLngLat().wrap();

    const { ok, status, body } = await api("api/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: at.lat, lon: at.lng }),
    });
    busy = false;

    if (status === 429) {
        if (retried) {
            el.guess.disabled = false;
            toast("Too many guesses at once. Try again.");
            return;
        }
        setTimeout(function () {
            submitGuess(true);
        }, Math.max(0, Number(body && body.retry_after) || 0) * 1000 + 80);
        return;
    }

    if (!ok) {
        if (status === 409) {
            await refresh();
            return;
        }
        toast(body && body.error ? body.error : "guess rejected");
        el.guess.disabled = false;
        return;
    }

    if (body.outcome === "wrong") {
        guessMarker.remove();
        guessMarker = null;
        el.guess.disabled = true;
        el.guess.classList.add("miss");
        el.guess.querySelector("span").textContent = "Not here";
        render(body.state);
        return;
    }

    await showResult(body.state);
}

function clearResultMarkers() {
    resultMarkers.forEach(function (marker) {
        marker.remove();
    });
    resultMarkers = [];
    if (resultMap) {
        resultMap.getSource("reveal").setData({ type: "FeatureCollection", features: [] });
    }
}

function setCopied(done) {
    el.copy.classList.toggle("copied", done);
    el.copy.title = done ? "Copied" : "Copy";
    setIcon(el.copy, done ? "check" : "copy");
}

async function copyFlag() {
    const text = el.flag.textContent;
    if (!text) {
        return;
    }

    try {
        await navigator.clipboard.writeText(text);
    } catch (e) {
        const range = document.createRange();
        range.selectNodeContents(el.flag);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        try {
            document.execCommand("copy");
        } catch (fallback) {
            return;
        }
    }
    setCopied(true);
}

async function showResult(next) {
    const guess = next.guess;
    const answer = next.answer;

    el.distance.textContent = offsetReadout(next.distance_km, guess, answer);
    el.flagField.hidden = !next.flag;
    el.flag.textContent = next.flag || "";
    setCopied(false);
    el.curtain.hidden = false;

    if (!resultMap) {
        resultMap = await basemap(document.getElementById("result-map"));
        revealLayer(resultMap);
    }

    clearResultMarkers();
    resultMap.resize();
    resultMap.getSource("reveal").setData(lineBetween(guess, answer));

    resultMarkers = [
        pinAt(resultMap, guess, "#f38ba8", "#d20f39", "Your guess"),
        pinAt(resultMap, answer, "#a6e3a1", "#40a02b", "The answer"),
    ];

    resultMap.fitBounds(
        resultMarkers.reduce(function (bounds, marker) {
            return bounds.extend(marker.getLngLat());
        }, new maplibregl.LngLatBounds()),
        { padding: 46, maxZoom: 13, duration: 0 },
    );

    render(next);
}

function closeCurtain() {
    el.curtain.hidden = true;
    clearResultMarkers();
    if (state && state.solved) {
        frameGuess(700);
    } else {
        clearGuess();
        guessMap.jumpTo({ center: [0, 20], zoom: 1 });
    }
    refresh();
}

(async function main() {
    guessMap = await basemap(el.map);
    guessMap.on("click", function (event) {
        setGuess(event.lngLat.wrap());
    });

    const mapObserver = new ResizeObserver(function () {
        guessMap.stop();
        guessMap.resize();
        clearTimeout(framePending);
        framePending = setTimeout(function () {
            frameGuess(320);
        }, 140);
    });
    mapObserver.observe(el.map);
    guessMap.resize();

    const mediaObserver = new ResizeObserver(fitMedia);
    mediaObserver.observe(el.pano);
    window.addEventListener("resize", fitMedia);

    el.guess.addEventListener("click", function () {
        if (state && state.solved) {
            showResult(state);
        } else {
            submitGuess(false);
        }
    });
    el.next.addEventListener("click", closeCurtain);
    el.copy.addEventListener("click", copyFlag);

    el.expand.addEventListener("click", function () {
        const pinned = el.dock.classList.toggle("pinned");
        el.expand.setAttribute("aria-pressed", String(pinned));
        el.expand.title = pinned ? "Collapse map" : "Expand map";
        setIcon(el.expand, pinned ? "minimize-2" : "maximize-2");
    });

    const swallowed = [
        "mousedown",
        "pointerdown",
        "touchstart",
        "dblclick",
        "wheel",
        "contextmenu",
    ];
    swallowed.forEach(function (type) {
        document.querySelectorAll(".map-controls, .coord-entry").forEach(function (node) {
            node.addEventListener(type, function (event) {
                event.stopPropagation();
            });
        });
    });

    el.coordInput.addEventListener("input", function () {
        el.coordEntry.classList.remove("invalid");
        refreshCoordApply();
    });
    el.coordInput.addEventListener("change", applyTypedCoordinates);
    el.coordInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            if (applyTypedCoordinates()) {
                showCoordEntry(false);
            }
        } else if (event.key === "Escape") {
            event.stopPropagation();
            showCoordEntry(false);
        }
    });
    el.coordToggle.addEventListener("click", function () {
        showCoordEntry(el.coordEntry.hidden);
    });
    el.coordApply.addEventListener("click", function () {
        if (applyTypedCoordinates()) {
            showCoordEntry(false);
        }
    });

    el.mapHide.addEventListener("click", function () {
        setMapVisible(false);
    });
    el.mapShow.addEventListener("click", function () {
        setMapVisible(true);
    });

    el.zoomIn.addEventListener("click", function () {
        guessMap.zoomIn();
    });
    el.zoomOut.addEventListener("click", function () {
        guessMap.zoomOut();
    });

    el.panoIn.addEventListener("click", function () {
        if (viewer) {
            viewer.setHfov(viewer.getHfov() - 12);
        }
    });
    el.panoOut.addEventListener("click", function () {
        if (viewer) {
            viewer.setHfov(viewer.getHfov() + 12);
        }
    });

    el.reset.addEventListener("click", async function () {
        const { ok, body } = await api("api/reset", { method: "POST" });
        if (!ok) {
            toast("Could not reset");
            return;
        }
        el.curtain.hidden = true;
        clearResultMarkers();
        clearGuess();
        guessMap.easeTo({ center: [0, 20], zoom: 1, duration: 400 });
        render(body);
    });

    document.addEventListener("keydown", function (event) {
        if (event.target instanceof HTMLInputElement) {
            return;
        }
        if (event.key !== "Enter") {
            return;
        }
        if (!el.curtain.hidden) {
            closeCurtain();
        } else if (!el.guess.disabled && !(state && state.solved)) {
            submitGuess(false);
        }
    });

    document.body.classList.add("no-hud");
    clearGuess();
    renderIcons();
    await refresh();
})().catch(function (error) {
    console.error(error);
    toast("Map unavailable");
});
