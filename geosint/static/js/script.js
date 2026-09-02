import {
    basemap,
    createPin,
    lineBetween,
    mapGestures,
    pinAt,
    revealLayer,
    satelliteLayer,
    showSatellite,
} from "./basemap.js";
import { el, renderIcons, setIcon, toast } from "./dom.js";
import { offsetReadout, parseCoordinates } from "./geo.js";
import { loaderFailed } from "./loader.js";
import { fitMedia, mountMedia, zoomPano } from "./media.js";
import { installModeToggle } from "./navigation.js";

let guessMap = null;

let resultMap = null;

let resultMarkers = [];

let guessMarker = null;

let guessPressAt = null;

let framePending = null;

let satellite = false;

let dockSize = null;

let mounted = false;

let state = null;

let busy = false;

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

function setZoomed(zoomed) {
    el.dock.classList.toggle("zoomed", zoomed);
    el.expand.setAttribute("aria-pressed", String(zoomed));
    el.expand.title = zoomed ? "Restore map size" : "Zoom map";
    el.expand.setAttribute("aria-label", el.expand.title);
    setIcon(el.expand, zoomed ? "minimize-2" : "maximize-2");
}

function dockBase() {
    if (!dockSize) {
        const pinned = el.dock.classList.contains("pinned");

        el.dock.classList.add("resizing", "pinned");
        dockSize = { width: el.dock.offsetWidth, height: el.map.offsetHeight };
        el.dock.classList.toggle("pinned", pinned);
        el.dock.classList.remove("resizing");
    }
    return dockSize;
}

function sizeDock(width, height) {
    const style = getComputedStyle(el.dock);
    const chrome = el.dock.offsetHeight - el.map.offsetHeight;
    const minWidth = Math.max(220, parseFloat(style.getPropertyValue("--dock-w")) || 0);
    const minHeight = Math.max(150, parseFloat(style.getPropertyValue("--dock-h")) || 0);
    const maxWidth = Math.max(minWidth, window.innerWidth - 28);
    const maxHeight = Math.max(minHeight, window.innerHeight - 28 - chrome);

    dockSize = {
        width: Math.round(Math.min(Math.max(width, minWidth), maxWidth)),
        height: Math.round(Math.min(Math.max(height, minHeight), maxHeight)),
    };
    el.dock.style.setProperty("--dock-w-open", dockSize.width + "px");
    el.dock.style.setProperty("--dock-h-open", dockSize.height + "px");
}

function storeDockSize() {
    try {
        if (dockSize) {
            localStorage.setItem(
                "map-size",
                dockSize.width + "x" + dockSize.height,
            );
        } else {
            localStorage.removeItem("map-size");
        }
    } catch (error) {
        return;
    }
}

function resetDock() {
    dockSize = null;
    el.dock.style.removeProperty("--dock-w-open");
    el.dock.style.removeProperty("--dock-h-open");
    storeDockSize();
}

function restoreDock() {
    let saved = "";

    try {
        saved = localStorage.getItem("map-size") || "";
    } catch (error) {
        saved = "";
    }

    const parts = saved.split("x");

    if (parts.length === 2 && Number(parts[0]) > 0 && Number(parts[1]) > 0) {
        sizeDock(Number(parts[0]), Number(parts[1]));
    }
}

function dragDock(event) {
    event.preventDefault();
    el.grip.focus({ preventScroll: true });

    const from = dockBase();
    const fromX = event.clientX;
    const fromY = event.clientY;
    const fromWidth = from.width;
    const fromHeight = from.height;

    el.dock.classList.add("pinned", "resizing");

    function move(next) {
        sizeDock(
            fromWidth + fromX - next.clientX,
            fromHeight + fromY - next.clientY,
        );
    }

    function done() {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", done);
        window.removeEventListener("pointercancel", done);
        window.removeEventListener("blur", done);
        el.dock.classList.remove("pinned", "resizing");
        storeDockSize();
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", done);
    window.addEventListener("pointercancel", done);
    window.addEventListener("blur", done);
}

function nudgeDock(event) {
    const step = event.shiftKey ? 40 : 10;
    const wider = { ArrowLeft: step, ArrowRight: -step }[event.key] || 0;
    const taller = { ArrowUp: step, ArrowDown: -step }[event.key] || 0;

    if (!wider && !taller) {
        return;
    }
    event.preventDefault();

    const from = dockBase();

    sizeDock(from.width + wider, from.height + taller);
    storeDockSize();
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
        satelliteLayer(resultMap);
        revealLayer(resultMap);
    }
    showSatellite(resultMap, satellite);

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
    satelliteLayer(guessMap);
    mapGestures(guessMap, el.map);
    guessMap.on("click", function (event) {
        setGuess(event.lngLat.wrap());
    });

    const mapObserver = new ResizeObserver(function () {
        guessMap.stop();
        guessMap.resize();
        guessMap.redraw();
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
    window.addEventListener("resize", function () {
        if (dockSize) {
            sizeDock(dockSize.width, dockSize.height);
        }
    });

    el.guess.addEventListener("click", function () {
        if (state && state.solved) {
            showResult(state);
        } else {
            submitGuess(false);
        }
    });
    el.next.addEventListener("click", closeCurtain);
    el.copy.addEventListener("click", copyFlag);

    el.satellite.addEventListener("click", function () {
        satellite = !satellite;
        el.satellite.setAttribute("aria-pressed", String(satellite));
        el.satellite.title = satellite ? "Show map" : "Show satellite";
        el.satellite.setAttribute("aria-label", el.satellite.title);
        setIcon(el.satellite, satellite ? "satellite" : "road");
        el.basemapCredit.textContent = satellite
            ? "Imagery \u00a9 Esri, Maxar, Earthstar Geographics"
            : "Basemap \u00a9 CARTO \u00b7 \u00a9 OpenStreetMap contributors (ODbL)";
        showSatellite(guessMap, satellite);
        if (resultMap) {
            showSatellite(resultMap, satellite);
        }
    });

    el.expand.addEventListener("click", function () {
        setZoomed(!el.dock.classList.contains("zoomed"));
    });

    restoreDock();
    el.grip.addEventListener("pointerdown", dragDock);
    el.grip.addEventListener("dblclick", resetDock);
    el.grip.addEventListener("keydown", nudgeDock);

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
        zoomPano(-12);
    });
    el.panoOut.addEventListener("click", function () {
        zoomPano(12);
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
    installModeToggle();
    clearGuess();
    renderIcons();
    await refresh();
})().catch(function (error) {
    console.error(error);
    toast("Map unavailable");
});
