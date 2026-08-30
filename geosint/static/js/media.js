import { el } from "./dom.js";
import { fetchAll, fetchMedia, loaderDone, loaderFailed, loaderPending, loaderProgress } from "./loader.js";
import { gestureControls, panMode } from "./navigation.js";

let viewer = null;

let photoMap = null;

let photoBounds = null;

let photoTouched = false;

let photoFitting = false;

const springPull = 900;

const springDrag = 2 * Math.sqrt(900);

const glideDecay = 0.94;

const restSpeed = 20;

let photoVx = 0;

let photoVy = 0;

let photoFrame = null;

let photoClock = 0;

let lastInput = 0;

let inputGap = 0;

L.Map.include({
    panPrecise: function (dx, dy) {
        this._rawPanBy(L.point(dx, dy));
        this.fire("move");
    },
    boundsOffset: function () {
        const bounds = this.options.maxBounds;

        if (!bounds) {
            return L.point(0, 0);
        }

        const half = this.getSize().divideBy(2);
        const middle = this.project(this.getCenter());

        return this._getBoundsOffset(
            L.bounds(middle.subtract(half), middle.add(half)),
            bounds,
            this._zoom,
        );
    },
    zoomAroundFree: function (point, zoom) {
        const saved = this.options.maxBounds;

        this.options.maxBounds = null;
        try {
            this.setZoomAround(
                point,
                Math.min(this.getMaxZoom(), Math.max(this.getMinZoom(), zoom)),
                { animate: false },
            );
        } finally {
            this.options.maxBounds = saved;
        }
    },
});

function noteInput() {
    const now = performance.now();
    const since = now - lastInput;

    if (lastInput && since < 600) {
        inputGap = Math.max(since, inputGap * 0.85);
    }
    lastInput = now;
}

function springAuthority() {
    const quiet = Math.max(110, inputGap * 1.8);

    return Math.min(Math.max((performance.now() - lastInput - quiet) / 100, 0), 1);
}

function dragFactor(offset, move, speed, span) {
    if (!offset || Math.sign(move) === Math.sign(offset)) {
        return 1;
    }

    return (1 / (1 + speed / 50)) * Math.max(1 - Math.abs(offset) / span, 0);
}

function springStep(now) {
    const seconds = Math.min((now - photoClock) / 1000, 0.05);
    photoClock = now;

    const offset = photoMap.boundsOffset();
    const outside = Math.abs(offset.x) > 0.5 || Math.abs(offset.y) > 0.5;
    const authority = springAuthority();

    if (authority < 1 && !outside) {
        photoVx = 0;
        photoVy = 0;
    }

    if (outside) {
        photoVx += (springPull * authority * offset.x - springDrag * photoVx) * seconds;
        photoVy += (springPull * authority * offset.y - springDrag * photoVy) * seconds;
    } else {
        const decay = Math.pow(glideDecay, seconds * 60);
        photoVx *= decay;
        photoVy *= decay;
    }

    if (!outside && authority >= 1 && Math.hypot(photoVx, photoVy) < restSpeed) {
        photoVx = 0;
        photoVy = 0;
        photoFrame = null;
        return;
    }

    photoMap.panPrecise(photoVx * seconds, photoVy * seconds);
    photoFrame = requestAnimationFrame(springStep);
}

function wakeSpring() {
    if (photoFrame === null) {
        photoClock = performance.now();
        photoFrame = requestAnimationFrame(springStep);
    }
}

export async function mountMedia(media) {
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
            maxBoundsViscosity: 0.5,
        });
        photoMap.options.maxBounds = L.latLngBounds(bounds).pad(0.6);
        photoMap.on("move zoom", function () {
            if (!photoFitting) {
                photoTouched = true;
            }
        });
        photoMap.on("dragstart drag", noteInput);
        photoMap.on("dragend", wakeSpring);
        el.pano.addEventListener("wheel", noteInput, {
            capture: true,
            passive: true,
        });

        gestureControls(el.pano, {
            glide: false,
            rubberband: 0.2,
            input: noteInput,
            fromScale: function () {
                return [
                    Math.pow(2, photoMap.getZoom() - photoMap.getMinZoom()),
                    0,
                ];
            },
            scaleBounds: function () {
                return {
                    min: 1,
                    max: Math.pow(
                        2,
                        photoMap.getMaxZoom() - photoMap.getMinZoom(),
                    ),
                };
            },
            pan: function (dx, dy, speed) {
                const size = photoMap.getSize();
                const offset = photoMap.boundsOffset();

                photoMap.panPrecise(
                    -dx * dragFactor(offset.x, -dx, speed, size.x / 2),
                    -dy * dragFactor(offset.y, -dy, speed, size.y / 2),
                );
                wakeSpring();
            },
            zoom: function (scale, origin) {
                const rect = el.pano.getBoundingClientRect();

                photoMap.zoomAroundFree(
                    L.point(origin[0] - rect.left, origin[1] - rect.top),
                    photoMap.getMinZoom() + Math.log2(scale),
                );
                wakeSpring();
            },
        });

        el.pano.addEventListener(
            "wheel",
            function (event) {
                event.preventDefault();

                if (panMode()) {
                    return;
                }

                const pixels =
                    event.deltaMode === 1
                        ? event.deltaY * 16
                        : event.deltaMode === 2
                          ? event.deltaY * el.pano.clientHeight
                          : event.deltaY;
                photoMap.setZoomAround(
                    photoMap.mouseEventToContainerPoint(event),
                    photoMap.getZoom() - pixels / (event.ctrlKey ? 82 : 220),
                    { animate: false },
                );
            },
            { passive: false },
        );
        L.imageOverlay(source, bounds).addTo(photoMap);
        photoBounds = bounds;
        photoTouched = false;
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

    gestureControls(el.pano, {
        glide: true,
        rubberband: 0.4,
        fromScale: function () {
            return [config.maxHfov / viewer.getHfov(), 0];
        },
        scaleBounds: { min: 1, max: config.maxHfov / config.minHfov },
        pan: function (dx, dy) {
            const perPixel = viewer.getHfov() / el.pano.clientWidth;
            viewer.setYaw(viewer.getYaw() - dx * perPixel, 0);
            viewer.setPitch(viewer.getPitch() + dy * perPixel, 0);
        },
        zoom: function (scale, origin) {
            const rect = el.pano.getBoundingClientRect();
            const nx = ((origin[0] - rect.left) / rect.width) * 2 - 1;
            const ny = ((origin[1] - rect.top) / rect.height) * 2 - 1;
            const aspect = rect.height / rect.width;
            const hfov = viewer.getHfov();
            const next = Math.min(
                config.maxHfov,
                Math.max(config.minHfov, config.maxHfov / scale),
            );
            const span = function (angle) {
                return Math.tan((angle * Math.PI) / 360);
            };
            const degrees = function (offset) {
                return (Math.atan(offset) * 180) / Math.PI;
            };
            const before = span(hfov);
            const after = span(next);

            viewer.lookAt(
                viewer.getPitch() -
                    (degrees(ny * before * aspect) -
                        degrees(ny * after * aspect)),
                viewer.getYaw() + degrees(nx * before) - degrees(nx * after),
                next,
                0,
            );
        },
    });

    el.pano.addEventListener(
        "wheel",
        function (event) {
            event.preventDefault();
            if (panMode()) {
                return;
            }
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

export function fitPhoto() {
    photoFitting = true;
    limitPhotoZoom();
    photoMap.fitBounds(photoBounds, { animate: false });
    photoFitting = false;
}

export function fitMedia() {
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
    wakeSpring();
}

export function zoomPano(delta) {
    if (!viewer) {
        return;
    }
    viewer.setHfov(viewer.getHfov() + delta);
}
