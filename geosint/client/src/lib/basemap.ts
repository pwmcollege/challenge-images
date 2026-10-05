import { Map as MapLibreMap, Marker, setWorkerUrl } from "maplibre-gl";
import type {
    AllPaintProperties,
    LayerSpecification,
    LngLat,
    StyleSpecification,
    VisibilitySpecification,
} from "maplibre-gl";
import type { Feature, FeatureCollection, LineString } from "geojson";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { type Coordinates, greatCircle } from "./geo.ts";
import type { Navigation } from "./navigation.ts";

setWorkerUrl(workerUrl);

const satelliteService =
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";
const satelliteTileMaxZoom = 19;
// MapLibre requests 256px raster tiles one level above its map zoom.
const satelliteZoomOffset = 1;

async function styleJson(signal: AbortSignal): Promise<StyleSpecification> {
    const response = await fetch(
        "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
        { signal },
    );

    if (!response.ok) {
        throw new Error("Basemap style returned " + response.status);
    }
    return response.json();
}

function whenLoaded(map: MapLibreMap, ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        function cleanup() {
            clearTimeout(timer);
            map.off("load", loaded);
            signal?.removeEventListener("abort", aborted);
        }
        function loaded() {
            cleanup();
            resolve();
        }
        function aborted() {
            cleanup();
            reject(signal?.reason);
        }
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error("Basemap timed out"));
        }, ms);
        map.once("load", loaded);
        signal?.addEventListener("abort", aborted, { once: true });
        if (signal?.aborted) {
            aborted();
        }
    });
}

export async function createBasemap(
    container: HTMLElement,
    { signal }: { signal?: AbortSignal } = {},
) {
    let failure: unknown = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
        let map: MapLibreMap | null = null;

        try {
            signal?.throwIfAborted();
            const timeout = AbortSignal.timeout(5000);
            const style = await styleJson(signal ? AbortSignal.any([signal, timeout]) : timeout);
            signal?.throwIfAborted();

            map = new MapLibreMap({
                container,
                style,
                center: [0, 20],
                zoom: 1,
                minZoom: 1,
                maxZoom: 18,
                attributionControl: false,
                dragRotate: false,
            });
            map.touchZoomRotate.disableRotation();
            await whenLoaded(map, 10000, signal);
            return map;
        } catch (error) {
            failure = error;

            if (map) {
                map.remove();
            }
            signal?.throwIfAborted();
            if (attempt < 2) {
                await new Promise((resolve) => {
                    setTimeout(resolve, 500 * attempt);
                });
            }
        }
    }
    signal?.throwIfAborted();
    console.warn("Basemap unavailable", failure);
    container.classList.add("map-unavailable");
    const map = new MapLibreMap({
        container,
        style: {
            version: 8,
            sources: {},
            layers: [
                {
                    id: "background",
                    type: "background",
                    paint: { "background-color": "#10161d" },
                },
            ],
        },
        center: [0, 20],
        zoom: 1,
        minZoom: 1,
        maxZoom: 18,
        attributionControl: false,
        dragRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    try {
        await whenLoaded(map, 5000, signal);
    } catch (error) {
        map.remove();
        throw error;
    }
    return map;
}

type SatellitePaintProperty = "line-color" | "line-dasharray" | "line-opacity" | "line-width";
type SatellitePaintValue = AllPaintProperties[SatellitePaintProperty];
type SatelliteRule =
    | ["visibility", VisibilitySpecification]
    | [SatellitePaintProperty, SatellitePaintValue];

function satelliteStyle(layer: LayerSpecification): SatelliteRule[] | null {
    const id = layer.id;

    if (layer.type === "symbol" || layer.type === "background") {
        return null;
    }
    if (/^(landcover|landuse|park_|water|building)/.test(id) || id === "boundary_county") {
        return [["visibility", "none"]];
    }
    if (id === "boundary_country_outline") {
        return [["line-opacity", 0.7]];
    }
    if (id === "boundary_state") {
        return [
            ["line-color", "rgba(255, 255, 255, 0.75)"],
            ["line-dasharray", [1, 0]],
            ["line-width", ["interpolate", ["linear"], ["zoom"], 4, 0.9, 7, 1.6, 9, 2]],
        ];
    }
    if (/^boundary_/.test(id)) {
        return [
            ["line-color", "rgba(255, 255, 255, 0.75)"],
            ["line-dasharray", [1, 0]],
        ];
    }
    if (layer.type !== "line") {
        return null;
    }
    if (layer.paint && layer.paint["line-dasharray"]) {
        return [["visibility", "none"]];
    }

    if (/_case/.test(id)) {
        const start = /_mot_/.test(id)
            ? 7.5
            : /_trunk_/.test(id)
            ? 8.5
            : /_pri_/.test(id)
            ? 9
            : 10.5;

        return [
            [
                "line-color",
                [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    9,
                    "rgba(214, 214, 210, 0.85)",
                    10.5,
                    "rgba(0, 0, 0, 0.3)",
                ],
            ],
            [
                "line-opacity",
                ["interpolate", ["linear"], ["zoom"], start - 0.75, 0, start, 1, 16, 1, 17, 0],
            ],
        ];
    }
    return [
        ["line-color", "rgba(198, 198, 196, 0.82)"],
        ["line-opacity", ["interpolate", ["linear"], ["zoom"], 9.5, 0, 11, 1, 16, 1, 17, 0]],
    ];
}

export function installSatelliteLayer(map: MapLibreMap) {
    const satelliteAvailability = new Map<string, boolean>();
    const layers = map.getStyle().layers;
    const anchor = layers.find((layer) => {
        return layer.type !== "background";
    });

    const satellitePlan: (
        | {
            id: string;
            prop: "visibility";
            on: VisibilitySpecification;
            off: VisibilitySpecification;
        }
        | {
            id: string;
            prop: SatellitePaintProperty;
            on: SatellitePaintValue;
            off: SatellitePaintValue;
        }
    )[] = [];
    layers.forEach((layer) => {
        const rules = satelliteStyle(layer);

        if (!rules) {
            return;
        }
        rules.forEach(([prop, on]) => {
            if (prop === "visibility") {
                satellitePlan.push({
                    id: layer.id,
                    prop,
                    on,
                    off: map.getLayoutProperty(layer.id, "visibility") || "visible",
                });
            } else {
                satellitePlan.push({
                    id: layer.id,
                    prop,
                    on,
                    off: map.getPaintProperty(layer.id, prop),
                });
            }
        });
    });

    map.addSource("satellite", {
        type: "raster",
        tileSize: 256,
        maxzoom: satelliteTileMaxZoom,
        tiles: [satelliteService + "/tile/{z}/{y}/{x}?blankTile=false"],
    });
    map.addLayer(
        {
            id: "satellite",
            type: "raster",
            source: "satellite",
            layout: { visibility: "none" },
        },
        anchor && anchor.id,
    );

    const state: {
        abort: AbortController | null;
        defaultMaxZoom: number;
        enabled: boolean;
        revision: number;
        timer: ReturnType<typeof setTimeout> | undefined;
    } = {
        abort: null,
        defaultMaxZoom: map.getMaxZoom(),
        enabled: false,
        revision: 0,
        timer: undefined,
    };
    map.on("moveend", queueSatelliteLimit);
    map.on("remove", () => {
        clearTimeout(state.timer);
        state.abort?.abort();
    });
    return showSatellite;

    function showSatellite(on: boolean) {
        state.enabled = on;
        if (on) {
            queueSatelliteLimit();
        } else {
            state.revision++;
            clearTimeout(state.timer);
            if (state.abort) {
                state.abort.abort();
                state.abort = null;
            }
            map.setMaxZoom(state.defaultMaxZoom);
        }

        map.setLayoutProperty("satellite", "visibility", on ? "visible" : "none");

        satellitePlan.forEach((item) => {
            if (!map.getLayer(item.id)) {
                return;
            }
            if (item.prop === "visibility") {
                map.setLayoutProperty(item.id, "visibility", on ? item.on : item.off);
            } else {
                map.setPaintProperty(item.id, item.prop, on ? item.on : item.off);
            }
        });
    }

    function satelliteTile(at: LngLat, zoom: number) {
        const count = Math.pow(2, zoom);
        const lon = ((((at.lng + 180) % 360) + 360) % 360) - 180;
        const lat = Math.max(-85.051129, Math.min(85.051129, at.lat));
        const x = Math.floor(((lon + 180) / 360) * count);
        const y = Math.floor(
            ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * count,
        );

        return {
            x: Math.max(0, Math.min(count - 1, x)),
            y: Math.max(0, Math.min(count - 1, y)),
        };
    }

    async function hasSatelliteTile(
        at: LngLat,
        zoom: number,
        signal: AbortSignal,
    ): Promise<boolean> {
        const tile = satelliteTile(at, zoom);
        const key = zoom + "/" + tile.y + "/" + tile.x;

        if (satelliteAvailability.size >= 512) {
            const oldest = satelliteAvailability.keys().next().value;
            if (oldest !== undefined) {
                satelliteAvailability.delete(oldest);
            }
        }
        const cached = satelliteAvailability.get(key);
        if (cached !== undefined) {
            return cached;
        }

        const url = satelliteService + "/tilemap/" + key + "/1/1?f=json";
        const response = await fetch(url, { signal });
        if (response.status === 422) {
            satelliteAvailability.set(key, false);
            return false;
        }
        if (!response.ok) {
            throw new Error("Satellite coverage returned " + response.status);
        }

        const result: { valid?: boolean; data?: number[] } = await response.json();
        const available = result.valid !== false && result.data?.[0] === 1;
        satelliteAvailability.set(key, available);
        return available;
    }

    async function updateSatelliteLimit(revision: number) {
        if (!state.enabled || state.revision !== revision) {
            return;
        }

        const abort = new AbortController();
        const at = map.getCenter();
        let maxZoom = map.getMinZoom();

        if (state.abort) {
            state.abort.abort();
        }
        state.abort = abort;
        const timer = setTimeout(() => {
            abort.abort();
        }, 10000);

        try {
            for (
                let tileZoom = satelliteTileMaxZoom;
                tileZoom >= map.getMinZoom() + satelliteZoomOffset;
                tileZoom--
            ) {
                if (await hasSatelliteTile(at, tileZoom, abort.signal)) {
                    maxZoom = tileZoom - satelliteZoomOffset;
                    break;
                }
            }
        } catch (error) {
            if (!abort.signal.aborted) {
                console.warn("Could not check satellite coverage", error);
            }
            return;
        } finally {
            clearTimeout(timer);
            if (state.abort === abort) {
                state.abort = null;
            }
        }

        if (!state.enabled || state.revision !== revision) {
            return;
        }
        const limit = Math.min(state.defaultMaxZoom, maxZoom);

        map.setMaxZoom(limit);
        if (map.getZoom() > limit) {
            map.jumpTo({ zoom: limit });
        }
    }

    function queueSatelliteLimit() {
        if (!state.enabled) {
            return;
        }

        const revision = ++state.revision;

        clearTimeout(state.timer);
        if (state.abort) {
            state.abort.abort();
            state.abort = null;
        }
        state.timer = setTimeout(() => {
            state.timer = undefined;
            updateSatelliteLimit(revision);
        }, 80);
    }
}

function svgNode(name: string, attributes: Record<string, string>) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);

    Object.entries(attributes).forEach(([key, value]) => {
        node.setAttribute(key, value);
    });
    return node;
}

export function createPin(light: string, dark: string, className: string) {
    const id = "pin-grad-" + crypto.getRandomValues(new Uint32Array(2)).join("-");
    const gradient = svgNode("linearGradient", {
        id,
        x1: "0.2",
        y1: "0",
        x2: "0.8",
        y2: "1",
    });
    const defs = svgNode("defs", {});
    const root = svgNode("svg", {
        width: "36",
        height: "40",
        viewBox: "0 0 36 40",
        "aria-hidden": "true",
    });
    const wrapper = document.createElement("div");

    gradient.append(
        svgNode("stop", { offset: "0", "stop-color": light }),
        svgNode("stop", { offset: "1", "stop-color": dark }),
    );
    defs.append(gradient);
    root.append(
        defs,
        svgNode("path", {
            d: "M18 37.8 C20.2 34.3 26.3 29.2 29.37 25.15 A14 14 0 1 0 6.63 25.15" +
                " C9.7 29.2 15.8 34.3 18 37.8 Z",
            fill: "#fff",
        }),
        svgNode("circle", {
            cx: "18",
            cy: "17",
            r: "11",
            fill: "url(#" + id + ")",
        }),
        svgNode("circle", { cx: "18", cy: "13.4", r: "3.3", fill: "#fff" }),
        svgNode("path", { d: "M16.75 18.2 h2.5 L18 25.6 Z", fill: "#fff" }),
    );
    wrapper.className = className;
    wrapper.append(root);
    return wrapper;
}

export function installMapGestures(
    map: MapLibreMap,
    container: HTMLElement,
    { gestureControls, onModeChange }: Navigation,
) {
    const unsubscribe = onModeChange((pan) => {
        if (pan) {
            map.scrollZoom.disable();
        } else {
            map.scrollZoom.enable();
        }
    });

    const destroy = gestureControls(container, {
        glide: false,
        rubberband: 0,
        fromScale() {
            return [Math.pow(2, map.getZoom() - map.getMinZoom()), 0];
        },
        scaleBounds() {
            return {
                min: 1,
                max: Math.pow(2, map.getMaxZoom() - map.getMinZoom()),
            };
        },
        pan(dx, dy) {
            map.panBy([-dx, -dy], { duration: 0 });
        },
        zoom(scale, origin) {
            const rect = container.getBoundingClientRect();
            const point: [number, number] = [origin[0] - rect.left, origin[1] - rect.top];
            const next = Math.min(
                map.getMaxZoom(),
                Math.max(map.getMinZoom(), map.getMinZoom() + Math.log2(scale)),
            );

            map.easeTo({
                zoom: next,
                around: map.unproject(point),
                duration: 0,
            });
        },
    });
    return () => {
        unsubscribe();
        destroy();
    };
}

export function pinAt(
    map: MapLibreMap,
    at: Coordinates,
    light: string,
    dark: string,
    title: string,
) {
    const marker = new Marker({
        element: createPin(light, dark, "result-pin"),
        anchor: "bottom",
    })
        .setLngLat([at.lon, at.lat])
        .addTo(map);
    marker.getElement().title = title;
    return marker;
}

type RevealLine = Omit<LineString, "coordinates"> & { coordinates: [number, number][] };

export function lineBetween(
    from: Coordinates,
    to: Coordinates,
): FeatureCollection<RevealLine> & { features: [Feature<RevealLine>] } {
    return {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                properties: {},
                geometry: {
                    type: "LineString",
                    coordinates: greatCircle(from, to).map((point) => {
                        return [point[1], point[0]];
                    }),
                },
            },
        ],
    };
}

export function addRevealLayer(map: MapLibreMap) {
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
