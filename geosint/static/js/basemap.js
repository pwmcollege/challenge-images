import { greatCircle } from "./geo.js";

const satelliteService =
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";
const satelliteTileMaxZoom = 19;
// MapLibre requests 256px raster tiles one level above its map zoom.
const satelliteZoomOffset = 1;

async function styleJson(signal) {
    const response = await fetch(
        "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
        { signal },
    );

    if (!response.ok) {
        throw new Error("Basemap style returned " + response.status);
    }
    return response.json();
}

function whenLoaded(map, ms) {
    return new Promise((resolve, reject) => {
        function loaded() {
            clearTimeout(timer);
            resolve();
        }
        const timer = setTimeout(() => {
            map.off("load", loaded);
            reject(new Error("Basemap timed out"));
        }, ms);
        map.once("load", loaded);
    });
}

export async function createBasemap(container) {
    let failure = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
        let map = null;

        try {
            const style = await styleJson(AbortSignal.timeout(5000));

            map = new maplibregl.Map({
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
            await whenLoaded(map, 10000);
            return map;
        } catch (error) {
            failure = error;

            if (map) {
                map.remove();
            }
            if (attempt < 2) {
                await new Promise((resolve) => {
                    setTimeout(resolve, 500 * attempt);
                });
            }
        }
    }
    console.warn("Basemap unavailable", failure);
    container.classList.add("map-unavailable");
    const map = new maplibregl.Map({
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
    await whenLoaded(map, 5000);
    return map;
}

function satelliteStyle(layer) {
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

export function installSatelliteLayer(map) {
    const satelliteAvailability = new Map();
    const layers = map.getStyle().layers;
    const anchor = layers.find((layer) => {
        return layer.type !== "background";
    });

    const satellitePlan = [];
    layers.forEach((layer) => {
        const rules = satelliteStyle(layer);

        if (!rules) {
            return;
        }
        rules.forEach((rule) => {
            satellitePlan.push({
                id: layer.id,
                prop: rule[0],
                on: rule[1],
                off: rule[0] === "visibility"
                    ? map.getLayoutProperty(layer.id, "visibility") || "visible"
                    : map.getPaintProperty(layer.id, rule[0]),
            });
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

    const state = {
        abort: null,
        defaultMaxZoom: map.getMaxZoom(),
        enabled: false,
        revision: 0,
        timer: null,
    };
    map.on("moveend", queueSatelliteLimit);
    map.on("remove", () => {
        clearTimeout(state.timer);
        state.abort?.abort();
    });
    return showSatellite;

    function showSatellite(on) {
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

    function satelliteTile(at, zoom) {
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

    async function hasSatelliteTile(at, zoom, signal) {
        const tile = satelliteTile(at, zoom);
        const key = zoom + "/" + tile.y + "/" + tile.x;

        if (satelliteAvailability.size >= 512) {
            satelliteAvailability.delete(satelliteAvailability.keys().next().value);
        }
        if (satelliteAvailability.has(key)) {
            return satelliteAvailability.get(key);
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

        const result = await response.json();
        const available = result.valid !== false && result.data && result.data[0] === 1;
        satelliteAvailability.set(key, available);
        return available;
    }

    async function updateSatelliteLimit(revision) {
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
            if (error.name !== "AbortError") {
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
            state.timer = null;
            updateSatelliteLimit(revision);
        }, 80);
    }
}

function svgNode(name, attributes) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);

    Object.keys(attributes).forEach((key) => {
        node.setAttribute(key, attributes[key]);
    });
    return node;
}

export function createPin(light, dark, className) {
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

export function installMapGestures(map, container, { gestureControls, onModeChange }) {
    onModeChange((pan) => {
        if (pan) {
            map.scrollZoom.disable();
        } else {
            map.scrollZoom.enable();
        }
    });

    gestureControls(container, {
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
            const point = [origin[0] - rect.left, origin[1] - rect.top];
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
}

export function pinAt(map, at, light, dark, title) {
    const marker = new maplibregl.Marker({
        element: createPin(light, dark, "result-pin"),
        anchor: "bottom",
    })
        .setLngLat([at.lon, at.lat])
        .addTo(map);
    marker.getElement().title = title;
    return marker;
}

export function lineBetween(from, to) {
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

export function addRevealLayer(map) {
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
