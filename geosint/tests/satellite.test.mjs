import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

class MapStub extends EventEmitter {
    maxZoom = 18;
    zoom = 18;
    center = { lng: 0, lat: 0 };
    sources = new Map();
    layers = new Map();

    getStyle() {
        return { layers: [] };
    }
    getMaxZoom() {
        return this.maxZoom;
    }
    getMinZoom() {
        return 1;
    }
    getZoom() {
        return this.zoom;
    }
    getCenter() {
        return this.center;
    }
    setMaxZoom(zoom) {
        this.maxZoom = zoom;
    }
    jumpTo({ zoom }) {
        this.zoom = zoom;
    }
    addSource(id, source) {
        this.sources.set(id, source);
    }
    addLayer(layer) {
        this.layers.set(layer.id, layer);
    }
    setLayoutProperty(id, property, value) {
        this.layers.get(id).layout[property] = value;
    }
}

async function loadBasemap(fetch) {
    const context = createContext({
        fetch,
        AbortController,
        setTimeout,
        clearTimeout,
        console,
    });
    const module = new SourceTextModule(
        await readFile(
            new URL("../static/js/basemap.js", import.meta.url),
            "utf8",
        ),
        { context },
    );
    await module.link((specifier) => {
        const names = specifier === "./geo.js"
            ? ["greatCircle"]
            : ["gestureControls", "onModeChange"];
        return new SyntheticModule(names, function () {
            for (const name of names) {
                this.setExport(name, () => {
                    throw new Error("Unexpected call to " + name);
                });
            }
        }, { context });
    });
    await module.evaluate();
    return module.namespace;
}

function coverage(url, available) {
    const [, zoom, top, left] = url.match(
        /\/tilemap\/(\d+)\/(\d+)\/(\d+)\/1\/1\?f=json$/,
    );
    return Response.json({
        valid: true,
        location: { top: Number(top), left: Number(left), width: 1, height: 1 },
        data: [Number(available(Number(zoom)))],
    });
}

async function waitFor(predicate) {
    for (let attempt = 0; attempt < 100 && !predicate(); attempt++) {
        await delay(5);
    }
    assert.ok(predicate(), "Satellite coverage update did not complete");
}

test("satellite tiles suppress the provider's unavailable-image placeholder", async () => {
    const { satelliteLayer } = await loadBasemap(() =>
        assert.fail("Unexpected coverage request")
    );
    const map = new MapStub();
    satelliteLayer(map);

    for (const url of map.sources.get("satellite").tiles) {
        assert.equal(new URL(url).searchParams.get("blankTile"), "false");
    }
});

test("sparse coverage caps zoom one level below the last available 256px tile", async () => {
    const { satelliteLayer } = await loadBasemap(async (url) => {
        if (url.includes("/tilemap/19/")) {
            return new Response(null, { status: 422 });
        }
        return coverage(url, (zoom) => zoom <= 17);
    });
    const map = new MapStub();
    const showSatellite = satelliteLayer(map);
    showSatellite(true);

    await waitFor(() => map.getMaxZoom() < 18);
    assert.equal(map.getMaxZoom(), 16);
    assert.equal(map.getZoom(), 16);
});

test("panning into better coverage restores the higher satellite zoom limit", async () => {
    let covered = false;
    const { satelliteLayer } = await loadBasemap(async (url) =>
        coverage(url, (zoom) => covered || zoom <= 17)
    );
    const map = new MapStub();
    const showSatellite = satelliteLayer(map);
    showSatellite(true);
    await waitFor(() => map.getMaxZoom() === 16);

    covered = true;
    map.center = { lng: 100, lat: 20 };
    map.emit("moveend");

    await waitFor(() => map.getMaxZoom() === 18);
    assert.equal(map.getZoom(), 16);
});

test("turning satellite off restores normal zoom and ignores a late coverage result", async () => {
    let pending = null;
    let hold = false;
    const { satelliteLayer } = await loadBasemap(
        async (url, { signal }) => {
            if (hold && url.includes("/tilemap/19/")) {
                await new Promise((resolve) => {
                    pending = { resolve, signal };
                });
            }
            return coverage(url, (zoom) => zoom <= 17);
        },
    );
    const map = new MapStub();
    const showSatellite = satelliteLayer(map);
    showSatellite(true);
    await waitFor(() => map.getMaxZoom() === 16);

    hold = true;
    map.center = { lng: 100, lat: 20 };
    map.emit("moveend");
    await waitFor(() => pending !== null);
    showSatellite(false);
    assert.equal(map.getMaxZoom(), 18);
    assert.equal(pending.signal.aborted, true);
    pending.resolve();
    await delay(0);

    assert.equal(map.getMaxZoom(), 18);
    assert.equal(map.layers.get("satellite").layout.visibility, "none");
});

test("removing the map aborts its pending satellite coverage request", async () => {
    let signal = null;
    const { satelliteLayer } = await loadBasemap(
        (url, options) => {
            signal = options.signal;
            return new Promise((resolve, reject) => {
                signal.addEventListener("abort", () => reject(signal.reason), {
                    once: true,
                });
            });
        },
    );
    const map = new MapStub();
    const showSatellite = satelliteLayer(map);
    showSatellite(true);
    await waitFor(() => signal !== null);

    map.emit("remove");

    assert.equal(signal.aborted, true);
});
