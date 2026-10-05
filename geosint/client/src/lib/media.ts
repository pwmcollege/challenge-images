import type { Bounds, LatLngBoundsExpression, Map as LeafletMap, Point } from "leaflet";
import type { Navigation } from "./navigation.ts";

export type MediaConfig =
    | { kind: "image"; url: string }
    | { kind: "pano"; type: "equirectangular"; url: string }
    | { kind: "pano"; type: "cubemap"; faces: string[] }
    | {
        kind: "pano";
        type: "multires";
        multiRes: {
            path: string;
            basePath?: string;
            extension: string;
            tileResolution: number;
            cubeResolution: number;
            maxLevel: number;
            fallbackPath?: string;
        };
    };

export interface LoadingState {
    title: string;
    detail: string;
    progress: number | null;
    done: boolean;
    error: boolean;
}

export interface MediaHandle {
    zoom(delta: number): void;
    fit(): void;
}

export interface MediaController extends MediaHandle {
    mount(media: MediaConfig): Promise<void>;
    destroy(): void;
}

type PhotoMap = LeafletMap & {
    panPrecise(dx: number, dy: number): void;
    boundsOffset(): Point;
    zoomAroundFree(point: Point, zoom: number): void;
};

export function createMedia(
    node: HTMLElement,
    navigation: Navigation,
    onLoading: (state: LoadingState) => void,
    onError: (error: Error) => void,
): MediaController {
    const requests = new AbortController();
    const cleanup: (() => void)[] = [];
    const sources = new Set<string>();
    let destroyed = false;
    let loading: LoadingState = {
        title: "Loading imagery",
        detail: "Starting",
        progress: null,
        done: false,
        error: false,
    };

    function updateLoading(next: Partial<LoadingState>) {
        loading = { ...loading, ...next };
        if (!destroyed) {
            onLoading(loading);
        }
    }

    function formatBytes(bytes: number) {
        return bytes < 1024 * 1024
            ? Math.round(bytes / 1024) + " KB"
            : (bytes / 1024 / 1024).toFixed(1) + " MB";
    }

    function loaderProgress(loaded: number, total: number) {
        updateLoading({
            progress: Math.min(100, Math.round((loaded / Math.max(1, total)) * 100)),
            detail: formatBytes(loaded) + " of " + formatBytes(total),
        });
    }

    function loaderPending(detail: string) {
        updateLoading({ detail, progress: null });
    }

    function loaderDone() {
        updateLoading({ done: true });
    }

    function releaseSource(source: string) {
        if (sources.delete(source)) {
            URL.revokeObjectURL(source);
        }
    }

    function releaseMedia() {
        sources.forEach(releaseSource);
    }

    function loaderFailed(detail: string) {
        requests.abort();
        releaseMedia();
        updateLoading({
            title: "Could not load imagery",
            detail,
            progress: 100,
            done: false,
            error: true,
        });
        if (!destroyed) {
            onError(new Error(detail));
        }
    }

    function fetchMedia(url: string, onProgress: (loaded: number, total: number) => void) {
        return new Promise<string>((resolve, reject) => {
            requests.signal.throwIfAborted();
            const request = new XMLHttpRequest();
            const abort = () => request.abort();
            const finish = <T>(callback: (value: T) => void, value: T) => {
                requests.signal.removeEventListener("abort", abort);
                callback(value);
            };
            request.open("GET", url);
            request.responseType = "blob";
            request.timeout = 120000;
            request.ontimeout = () =>
                finish(
                    reject,
                    new Error("Imagery request timed out. Reload to try again."),
                );
            request.onprogress = (event) => {
                if (event.lengthComputable) {
                    onProgress(event.loaded, event.total);
                }
            };
            request.onload = () => {
                if (request.status >= 200 && request.status < 300) {
                    if (!(request.response instanceof Blob)) {
                        finish(reject, new Error("Invalid imagery response"));
                        return;
                    }
                    const source = URL.createObjectURL(request.response);
                    sources.add(source);
                    finish(resolve, source);
                } else {
                    finish(reject, new Error("Server returned " + request.status));
                }
            };
            request.onerror = () => finish(reject, new Error("Request failed"));
            request.onabort = () => finish(reject, new DOMException("Aborted", "AbortError"));
            requests.signal.addEventListener("abort", abort, { once: true });
            request.send();
        });
    }

    async function fetchAll(
        urls: string[],
    ): Promise<[string, string, string, string, string, string]> {
        if (urls.length !== 6) {
            throw new Error("Cubemap requires six faces");
        }
        const loaded = urls.map(() => 0);
        const totals = urls.map(() => 0);
        const results = await Promise.allSettled(urls.map((url, index) => {
            return fetchMedia(url, (bytes, total) => {
                loaded[index] = bytes;
                totals[index] = total;
                loaderProgress(
                    loaded.reduce((a, b) => a + b, 0),
                    totals.reduce((a, b) => a + b, 0),
                );
            });
        }));
        const values = results.map((result) => {
            if (result.status === "rejected") {
                releaseMedia();
                throw result.reason;
            }
            return result.value;
        });
        const [front, right, back, left, up, down] = values;
        if (
            front === undefined || right === undefined || back === undefined ||
            left === undefined || up === undefined || down === undefined
        ) {
            throw new Error("Cubemap requires six faces");
        }
        return [front, right, back, left, up, down];
    }
    const { gestureControls, panMode } = navigation;
    let viewer: Pannellum.Viewer | null = null;
    let photoMap: PhotoMap | null = null;
    let photoBounds: [[number, number], [number, number]] | null = null;
    let photoTouched = false;
    let photoFitting = false;
    const springPull = 900;
    const springDrag = 2 * Math.sqrt(900);
    const glideDecay = 0.94;
    const restSpeed = 20;
    let photoVx = 0;
    let photoVy = 0;
    let photoFrame: number | null = null;
    let photoClock = 0;
    let lastInput = 0;
    let inputGap = 0;
    let hfovTarget: number | null = null;
    let hfovFrame: number | null = null;

    function createPhotoMap(L: typeof import("leaflet")) {
        return class extends L.Map {
            declare _rawPanBy: (point: Point) => void;
            declare _getBoundsOffset: (
                bounds: Bounds,
                maxBounds: LatLngBoundsExpression,
                zoom: number,
            ) => Point;
            declare _zoom: number;

            panPrecise(dx: number, dy: number) {
                this._rawPanBy(L.point(dx, dy));
                this.fire("move");
            }

            boundsOffset() {
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
            }

            zoomAroundFree(point: Point, zoom: number) {
                const saved = this.options.maxBounds;
                this.options.maxBounds = undefined;
                try {
                    this.setZoomAround(
                        point,
                        Math.min(this.getMaxZoom(), Math.max(this.getMinZoom(), zoom)),
                        { animate: false },
                    );
                } finally {
                    this.options.maxBounds = saved;
                }
            }
        };
    }

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

    function dragFactor(offset: number, move: number, speed: number, span: number) {
        if (!offset || Math.sign(move) === Math.sign(offset)) {
            return 1;
        }

        return (1 / (1 + speed / 50)) * Math.max(1 - Math.abs(offset) / span, 0);
    }

    function springStep(now: number) {
        if (!photoMap) {
            return;
        }
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

    async function mountMedia(media: MediaConfig) {
        if (media.kind === "image") {
            const [leaflet, source] = await Promise.all([
                import("leaflet"),
                fetchMedia(media.url, loaderProgress),
                import("leaflet/dist/leaflet.css"),
            ]);
            requests.signal.throwIfAborted();
            const L = leaflet.default || leaflet;
            const PhotoMap = createPhotoMap(L);
            loaderPending("Preparing view");
            const probe = new Image();
            probe.src = source;
            await probe.decode();
            requests.signal.throwIfAborted();
            const bounds: [[number, number], [number, number]] = [
                [0, 0],
                [probe.naturalHeight, probe.naturalWidth],
            ];
            const map = new PhotoMap(node, {
                crs: L.CRS.Simple,
                maxZoom: 4,
                zoomSnap: 0,
                scrollWheelZoom: false,
                attributionControl: false,
                maxBoundsViscosity: 0.5,
            });
            photoMap = map;
            map.options.maxBounds = L.latLngBounds(bounds);
            map.on("move zoom", () => {
                if (!photoFitting) {
                    photoTouched = true;
                }
            });
            map.on("dragstart drag", noteInput);
            map.on("dragend", wakeSpring);
            node.addEventListener("wheel", noteInput, {
                capture: true,
                passive: true,
                signal: requests.signal,
            });

            cleanup.push(gestureControls(node, {
                glide: false,
                rubberband: 0.2,
                input: noteInput,
                fromScale() {
                    return [Math.pow(2, map.getZoom() - map.getMinZoom()), 0];
                },
                scaleBounds() {
                    return {
                        min: 1,
                        max: Math.pow(2, map.getMaxZoom() - map.getMinZoom()),
                    };
                },
                pan(dx, dy, speed) {
                    const size = map.getSize();
                    const offset = map.boundsOffset();

                    map.panPrecise(
                        -dx * dragFactor(offset.x, -dx, speed, size.x / 2),
                        -dy * dragFactor(offset.y, -dy, speed, size.y / 2),
                    );
                    wakeSpring();
                },
                zoom(scale, origin) {
                    const rect = node.getBoundingClientRect();

                    map.zoomAroundFree(
                        L.point(origin[0] - rect.left, origin[1] - rect.top),
                        map.getMinZoom() + Math.log2(scale),
                    );
                    wakeSpring();
                },
            }));

            node.addEventListener(
                "wheel",
                (event) => {
                    event.preventDefault();

                    if (panMode()) {
                        return;
                    }

                    const pixels = event.deltaMode === 1
                        ? event.deltaY * 16
                        : event.deltaMode === 2
                        ? event.deltaY * node.clientHeight
                        : event.deltaY;
                    map.setZoomAround(
                        map.mouseEventToContainerPoint(event),
                        map.getZoom() - pixels / (event.ctrlKey ? 82 : 220),
                        { animate: false },
                    );
                },
                { passive: false, signal: requests.signal },
            );
            L.imageOverlay(source, bounds)
                .on("load", () => {
                    releaseSource(source);
                })
                .addTo(photoMap);
            photoBounds = bounds;
            photoTouched = false;
            fitPhoto();
            loaderDone();
            return;
        }

        const library = Promise.all([
            import("pannellum/build/pannellum.js"),
            import("pannellum/build/pannellum.css"),
        ]);
        const imagery = (async (): Promise<Partial<Pannellum.ConfigOptions>> => {
            if (media.type === "equirectangular") {
                return { panorama: await fetchMedia(media.url, loaderProgress) };
            }
            if (media.type === "cubemap") {
                return { cubeMap: await fetchAll(media.faces) };
            }
            loaderPending("Streaming tiles");
            return { multiRes: media.multiRes };
        })();
        const [, source] = await Promise.all([library, imagery]);
        requests.signal.throwIfAborted();
        const config = {
            ...source,
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

        loaderPending("Preparing view");
        const panorama = window.pannellum.viewer(node, config);
        viewer = panorama;

        function stepZoom() {
            if (hfovTarget === null) {
                return;
            }
            const current = panorama.getHfov();
            const remaining = hfovTarget - current;

            if (Math.abs(remaining) < 0.05) {
                panorama.setHfov(hfovTarget, 0);
                hfovTarget = null;
                hfovFrame = null;
                return;
            }

            panorama.setHfov(current + remaining * 0.28, 0);
            hfovFrame = requestAnimationFrame(stepZoom);
        }

        function zoomBy(amount: number) {
            const from = hfovTarget === null ? panorama.getHfov() : hfovTarget;
            hfovTarget = Math.min(config.maxHfov, Math.max(config.minHfov, from + amount));

            if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
                if (hfovFrame !== null) {
                    cancelAnimationFrame(hfovFrame);
                }
                panorama.setHfov(hfovTarget, 0);
                hfovTarget = null;
                hfovFrame = null;
                return;
            }
            if (hfovFrame === null) {
                hfovFrame = requestAnimationFrame(stepZoom);
            }
        }

        cleanup.push(gestureControls(node, {
            glide: true,
            rubberband: 0.4,
            fromScale() {
                return [config.maxHfov / panorama.getHfov(), 0];
            },
            scaleBounds: { min: 1, max: config.maxHfov / config.minHfov },
            pan(dx, dy) {
                const perPixel = panorama.getHfov() / node.clientWidth;
                panorama.setYaw(panorama.getYaw() - dx * perPixel, 0);
                panorama.setPitch(panorama.getPitch() + dy * perPixel, 0);
            },
            zoom(scale, origin) {
                const rect = node.getBoundingClientRect();
                const nx = ((origin[0] - rect.left) / rect.width) * 2 - 1;
                const ny = ((origin[1] - rect.top) / rect.height) * 2 - 1;
                const aspect = rect.height / rect.width;
                const hfov = panorama.getHfov();
                const next = Math.min(
                    config.maxHfov,
                    Math.max(config.minHfov, config.maxHfov / scale),
                );
                const span = (angle: number) => {
                    return Math.tan((angle * Math.PI) / 360);
                };
                const degrees = (offset: number) => {
                    return (Math.atan(offset) * 180) / Math.PI;
                };
                const before = span(hfov);
                const after = span(next);

                panorama.lookAt(
                    panorama.getPitch() -
                        (degrees(ny * before * aspect) - degrees(ny * after * aspect)),
                    panorama.getYaw() + degrees(nx * before) - degrees(nx * after),
                    next,
                    0,
                );
            },
        }));

        node.addEventListener(
            "wheel",
            (event) => {
                event.preventDefault();
                if (panMode()) {
                    return;
                }
                const pixels = event.deltaMode === 1
                    ? event.deltaY * 16
                    : event.deltaMode === 2
                    ? event.deltaY * node.clientHeight
                    : event.deltaY;
                zoomBy(pixels * (event.ctrlKey ? 0.4 : 0.15));
            },
            { passive: false, signal: requests.signal },
        );

        function finishLoading() {
            releaseMedia();
            loaderDone();
        }
        panorama.on("load", finishLoading);
        panorama.on("error", (message) => {
            releaseMedia();
            loaderFailed(String(message));
        });
        if (panorama.isLoaded()) {
            finishLoading();
        }
    }

    function limitPhotoZoom() {
        if (!photoMap || !photoBounds) {
            return;
        }
        const size = photoMap.getSize();
        photoMap.setMinZoom(
            Math.log2(Math.min(size.x / photoBounds[1][1], size.y / photoBounds[1][0])) - 0.4,
        );
    }

    function fitPhoto() {
        if (!photoMap || !photoBounds) {
            return;
        }
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
        wakeSpring();
    }

    function zoomPano(delta: number) {
        if (!viewer) {
            return;
        }
        if (hfovFrame !== null) {
            cancelAnimationFrame(hfovFrame);
        }
        hfovTarget = null;
        hfovFrame = null;
        viewer.setHfov(
            viewer.getHfov() + delta,
            matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : undefined,
        );
    }

    const observer = new ResizeObserver(fitMedia);
    observer.observe(node);

    return {
        async mount(media) {
            updateLoading(loading);
            try {
                await mountMedia(media);
            } catch (error) {
                if (!destroyed) {
                    loaderFailed(error instanceof Error ? error.message : "Failed to load imagery");
                }
            }
        },
        fit: fitMedia,
        zoom: zoomPano,
        destroy() {
            destroyed = true;
            requests.abort();
            observer.disconnect();
            cleanup.forEach((dispose) => dispose());
            if (photoFrame !== null) {
                cancelAnimationFrame(photoFrame);
            }
            if (hfovFrame !== null) {
                cancelAnimationFrame(hfovFrame);
            }
            viewer?.destroy();
            photoMap?.remove();
            releaseMedia();
            viewer = null;
            photoMap = null;
        },
    };
}
