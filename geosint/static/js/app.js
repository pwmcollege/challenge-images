import {
    addRevealLayer,
    createBasemap,
    createPin,
    installMapGestures,
    installSatelliteLayer,
    lineBetween,
    pinAt,
} from "./basemap.js";
import { createToast, getElements, renderIcons, setIcon } from "./dom.js";
import { installDock } from "./dock.js";
import { offsetReadout, parseCoordinates } from "./geo.js";
import { createLoader } from "./loader.js";
import { createMedia } from "./media.js";
import { createNavigation } from "./navigation.js";

async function main() {
    const el = getElements();
    const toast = createToast(el.toast);
    const navigation = createNavigation();
    const loader = createLoader(el);
    const { fitMedia, mountMedia, zoomPano } = createMedia(el, loader, navigation);
    const { loaderFailed } = loader;
    let guessMap = null;
    let mapReady = false;
    let resultMap = null;
    let setGuessSatelliteVisible = null;
    let setResultSatelliteVisible = null;
    let resultMarkers = [];
    let guessMarker = null;
    let guessPressAt = null;
    let framePending = null;
    let satellite = false;
    let mounted = false;
    let state = null;
    let busy = false;
    let resultMapPromise = null;

    async function api(path, options) {
        const response = await fetch(path, { ...options, signal: AbortSignal.timeout(10000) });
        return { ok: response.ok, status: response.status, body: await response.json() };
    }

    function setBusy(value) {
        busy = value;
        el.reset.disabled = value || !mapReady;
        el.guess.disabled = value || !mapReady || (!guessMarker && !state?.solved);
        el.coordToggle.disabled = value || !mapReady || Boolean(state?.solved);
        el.coordInput.disabled = value || !mapReady;
        refreshCoordApply();
        guessMarker?.setDraggable(!value && !state?.solved);
    }

    function refreshCoordApply() {
        el.coordApply.disabled = busy || !mapReady || Boolean(state?.solved) ||
            parseCoordinates(el.coordInput.value) === null;
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
        if (busy || !guessMap || state?.solved) {
            return false;
        }
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
        if (busy || (state && state.solved)) {
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
            guessMarker.on("dragend", () => {
                setGuess(guessMarker.getLngLat().wrap());
                writeCoordInput();
            });
            guessMarker.getElement().addEventListener("pointerdown", (event) => {
                guessPressAt = { x: event.clientX, y: event.clientY };
            });
            guessMarker.getElement().addEventListener("click", (event) => {
                event.stopPropagation();
                const moved = guessPressAt &&
                    Math.hypot(event.clientX - guessPressAt.x, event.clientY - guessPressAt.y) > 4;
                guessPressAt = null;
                if (!busy && !moved && !(state && state.solved)) {
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
        guessMap.easeTo({ center: at, duration });
    }

    function showGuess(guess) {
        if (!guessMap) {
            return;
        }
        if (guessMarker) {
            guessMarker.setDraggable(false);
            guessMarker.setLngLat([guess.lon, guess.lat]);
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
        setBusy(busy);

        if (!mounted) {
            mounted = true;
            mountMedia(next.media).catch((error) => {
                loaderFailed(error.message);
            });
        }
    }

    async function refresh() {
        try {
            const { ok, body } = await api("api/state");
            if (!ok) {
                throw new Error(body.error || "Could not load challenge");
            }
            render(body);
        } catch {
            toast("Could not reach the server. Try again.");
            if (!mounted) {
                loaderFailed("Could not load challenge. Reload to try again.");
            }
        }
    }

    async function submitGuess() {
        if (busy || !guessMarker || state?.solved) {
            return;
        }

        setBusy(true);
        const at = guessMarker.getLngLat().wrap();
        const options = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat: at.lat, lon: at.lng }),
        };

        try {
            let response = await api("api/guess", options);
            if (response.status === 429) {
                await new Promise((resolve) => {
                    setTimeout(
                        resolve,
                        Math.min(1000, Math.max(0, Number(response.body.retry_after) || 0) * 1000) +
                            80,
                    );
                });
                response = await api("api/guess", options);
            }
            if (response.status === 409) {
                await refresh();
                return;
            }
            if (!response.ok) {
                toast(response.body.error || "Guess rejected. Try again.");
                return;
            }
            if (response.body.outcome === "wrong") {
                clearGuess();
                el.guess.classList.add("miss");
                el.guess.querySelector("span").textContent = "Not here";
                render(response.body.state);
            } else {
                await showResult(response.body.state);
            }
        } catch (error) {
            toast(
                error.name === "TimeoutError"
                    ? "Request timed out. Try again."
                    : "Could not submit guess. Try again.",
            );
        } finally {
            setBusy(false);
        }
    }

    function clearResultMarkers() {
        resultMarkers.forEach((marker) => {
            marker.remove();
        });
        resultMarkers = [];
        if (resultMap) {
            resultMap.getSource("reveal")?.setData({ type: "FeatureCollection", features: [] });
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
        } catch {
            const range = document.createRange();
            range.selectNodeContents(el.flag);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            try {
                if (!document.execCommand("copy")) {
                    toast("Select the flag and copy it manually.");
                    return;
                }
            } catch {
                return;
            }
        }
        setCopied(true);
    }

    async function showResult(next) {
        render(next);
        const guess = next.guess;
        const answer = next.answer;

        el.distance.textContent = offsetReadout(next.distance_km, guess, answer);
        el.flagField.hidden = !next.flag;
        el.flag.textContent = next.flag || "";
        setCopied(false);
        if (!el.resultDialog.open) {
            el.resultDialog.showModal();
        }

        try {
            if (!resultMapPromise) {
                resultMapPromise = createBasemap(el.resultMap)
                    .then((map) => {
                        setResultSatelliteVisible = installSatelliteLayer(map);
                        addRevealLayer(map);
                        resultMap = map;
                        return map;
                    })
                    .catch((error) => {
                        resultMapPromise = null;
                        throw error;
                    });
            }
            await resultMapPromise;
        } catch {
            if (state === next && el.resultDialog.open) {
                toast("Result map unavailable.");
            }
            return;
        }
        if (state !== next || !el.resultDialog.open) {
            return;
        }
        setResultSatelliteVisible(satellite);

        clearResultMarkers();
        resultMap.resize();
        const line = lineBetween(guess, answer);
        const points = line.features[0].geometry.coordinates;
        resultMap.getSource("reveal").setData(line);
        resultMarkers = [
            pinAt(resultMap, guess, "#f38ba8", "#d20f39", "Your guess"),
            pinAt(
                resultMap,
                { lat: answer.lat, lon: points.at(-1)[0] },
                "#a6e3a1",
                "#40a02b",
                "The answer",
            ),
        ];

        resultMap.fitBounds(
            points.reduce((bounds, point) => bounds.extend(point), new maplibregl.LngLatBounds()),
            { padding: 46, maxZoom: 13, duration: 0 },
        );
    }

    function closeResultDialog() {
        el.resultDialog.close();
        clearResultMarkers();
        if (state && state.solved) {
            frameGuess(700);
        } else {
            clearGuess();
            guessMap.jumpTo({ center: [0, 20], zoom: 1 });
        }
    }

    el.panoIn.addEventListener("click", () => {
        zoomPano(-12);
    });
    el.panoOut.addEventListener("click", () => {
        zoomPano(12);
    });

    clearGuess();
    renderIcons();
    navigation.installModeToggle(el.modeButton);
    document.body.classList.add("no-hud");
    const initialState = refresh();
    guessMap = await createBasemap(el.map);
    await initialState;
    if (state) {
        render(state);
    }
    setGuessSatelliteVisible = installSatelliteLayer(guessMap);
    installMapGestures(guessMap, el.map, navigation);
    guessMap.on("click", (event) => {
        setGuess(event.lngLat.wrap());
    });

    const mapObserver = new ResizeObserver(() => {
        guessMap.stop();
        guessMap.resize();
        guessMap.redraw();
        clearTimeout(framePending);
        framePending = setTimeout(() => {
            frameGuess(320);
        }, 140);
    });
    mapObserver.observe(el.map);
    guessMap.resize();

    const mediaObserver = new ResizeObserver(fitMedia);
    mediaObserver.observe(el.pano);
    window.addEventListener("resize", fitMedia);

    el.guess.addEventListener("click", () => {
        if (state && state.solved) {
            showResult(state);
        } else {
            submitGuess();
        }
    });
    el.doneButton.addEventListener("click", closeResultDialog);
    el.resultDialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        closeResultDialog();
    });
    el.copy.addEventListener("click", copyFlag);

    el.satellite.addEventListener("click", () => {
        satellite = !satellite;
        el.satellite.setAttribute("aria-pressed", String(satellite));
        el.satellite.title = satellite ? "Show map" : "Show satellite";
        el.satellite.setAttribute("aria-label", el.satellite.title);
        setIcon(el.satellite, satellite ? "satellite" : "road");
        el.basemapCredit.textContent = satellite
            ? "Imagery \u00a9 Esri, Maxar, Earthstar Geographics"
            : "Basemap \u00a9 CARTO \u00b7 \u00a9 OpenStreetMap contributors (ODbL)";
        setGuessSatelliteVisible(satellite);
        if (resultMap) {
            setResultSatelliteVisible(satellite);
        }
    });

    installDock(el, () => {
        guessMap.resize();
        frameGuess(0);
    });

    ["click", "mousedown", "pointerdown", "touchstart", "dblclick", "wheel", "contextmenu"].forEach(
        (type) => {
            document.querySelectorAll(".map-controls, .coord-entry").forEach((node) => {
                node.addEventListener(type, (event) => {
                    event.stopPropagation();
                });
            });
        },
    );

    el.coordInput.addEventListener("input", () => {
        el.coordEntry.classList.remove("invalid");
        refreshCoordApply();
    });
    el.coordInput.addEventListener("change", applyTypedCoordinates);
    el.coordInput.addEventListener("keydown", (event) => {
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
    el.coordToggle.addEventListener("click", () => {
        showCoordEntry(el.coordEntry.hidden);
    });
    el.coordApply.addEventListener("click", () => {
        if (applyTypedCoordinates()) {
            showCoordEntry(false);
        }
    });

    el.zoomIn.addEventListener("click", () => {
        guessMap.zoomIn();
    });
    el.zoomOut.addEventListener("click", () => {
        guessMap.zoomOut();
    });

    el.reset.addEventListener("click", async () => {
        if (busy) {
            return;
        }
        setBusy(true);
        try {
            const { ok, body } = await api("api/reset", { method: "POST" });
            if (!ok) {
                throw new Error("Could not reset");
            }
            closeResultDialog();
            clearGuess();
            guessMap.easeTo({ center: [0, 20], zoom: 1, duration: 400 });
            render(body);
        } catch {
            toast("Could not reset. Try again.");
        } finally {
            setBusy(false);
        }
    });

    document.addEventListener("keydown", (event) => {
        if (
            event.defaultPrevented ||
            event.target.closest("input, textarea, button, a, [contenteditable], [role=button]")
        ) {
            return;
        }
        if (event.key !== "Enter") {
            return;
        }
        if (el.resultDialog.open) {
            closeResultDialog();
        } else if (!el.guess.disabled && !(state && state.solved)) {
            submitGuess();
        }
    });

    mapReady = true;
    [el.zoomIn, el.zoomOut, el.satellite, el.expand, el.mapHide, el.mapShow].forEach((button) => {
        button.disabled = false;
    });
    el.grip.setAttribute("aria-disabled", "false");
    el.grip.tabIndex = 0;
    setBusy(busy);
}

main().catch((error) => {
    console.error(error);
    createToast(document.getElementById("toast"))("Map unavailable. Reload to try again.");
});
