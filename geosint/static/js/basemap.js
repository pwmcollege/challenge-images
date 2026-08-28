import { greatCircle } from "./geo.js";

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

export function createPin(light, dark, className) {
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
