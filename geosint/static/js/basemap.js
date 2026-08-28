import { greatCircle } from "./geo.js";
import { gestureControls, onModeChange } from "./navigation.js";

let pinSeq = 0;

export async function basemap(container) {
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

function svgNode(name, attributes) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);

    Object.keys(attributes).forEach(function (key) {
        node.setAttribute(key, attributes[key]);
    });
    return node;
}

export function createPin(light, dark, className) {
    const id = "pin-grad-" + pinSeq++;
    const gradient = svgNode("linearGradient", {
        id: id,
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
            d:
                "M18 37.8 C20.2 34.3 26.3 29.2 29.37 25.15 A14 14 0 1 0 6.63 25.15" +
                " C9.7 29.2 15.8 34.3 18 37.8 Z",
            fill: "#fff",
        }),
        svgNode("circle", { cx: "18", cy: "17", r: "11", fill: "url(#" + id + ")" }),
        svgNode("circle", { cx: "18", cy: "13.4", r: "3.3", fill: "#fff" }),
        svgNode("path", { d: "M16.75 18.2 h2.5 L18 25.6 Z", fill: "#fff" }),
    );
    wrapper.className = className;
    wrapper.append(root);
    return wrapper;
}

export function mapGestures(map, container) {
    onModeChange(function (pan) {
        if (pan) {
            map.scrollZoom.disable();
        } else {
            map.scrollZoom.enable();
        }
    });

    gestureControls(container, {
        glide: false,
        rubberband: 0,
        fromScale: function () {
            return [Math.pow(2, map.getZoom() - map.getMinZoom()), 0];
        },
        scaleBounds: function () {
            return { min: 1, max: Math.pow(2, map.getMaxZoom() - map.getMinZoom()) };
        },
        pan: function (dx, dy) {
            map.panBy([-dx, -dy], { duration: 0 });
        },
        zoom: function (scale, origin) {
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
                    coordinates: greatCircle(from, to).map(function (point) {
                        return [point[1], point[0]];
                    }),
                },
            },
        ],
    };
}

export function revealLayer(map) {
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
