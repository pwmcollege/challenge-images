import { el } from "./dom.js";
import { fetchAll, fetchMedia, loaderDone, loaderFailed, loaderPending, loaderProgress } from "./loader.js";
import { gestureControls, panMode } from "./navigation.js";

let viewer = null;

let photoMap = null;

let photoBounds = null;

let photoTouched = false;

let photoFitting = false;

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
                    photoMap.getZoom() - pixels / (event.ctrlKey ? 82 : 220),
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
}

export function zoomPano(delta) {
    if (!viewer) {
        return;
    }
    viewer.setHfov(viewer.getHfov() + delta);
}
