import {
    useCallback,
    useEffect,
    useImperativeHandle,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import type { Ref } from "react";
import { LngLat, Marker } from "maplibre-gl";
import type { LngLatLike, Map as MapLibreMap } from "maplibre-gl";
import {
    CornerDownLeft,
    LocateFixed,
    Map,
    MapPin,
    Maximize2,
    Minimize2,
    Minus,
    Plus,
    Road,
    RotateCcw,
    Satellite,
    X,
} from "lucide-react";
import {
    createBasemap,
    createPin,
    installMapGestures,
    installSatelliteLayer,
    pinAt,
} from "../lib/basemap.ts";
import { type Coordinates, parseCoordinates } from "../lib/geo.ts";
import { useDock } from "../hooks/useDock.ts";
import type { ChallengeState } from "../types.ts";
import type { Navigation } from "../lib/navigation.ts";

export interface MapDockHandle {
    clear(): void;
    frame(duration?: number): void;
}

interface MapDockProps {
    navigation: Navigation;
    state: ChallengeState | null;
    busy: boolean;
    satellite: boolean;
    guessStatus?: "idle" | "wrong";
    onSatelliteChange: (visible: boolean) => void;
    onGuessChange: (coordinates: Coordinates | null) => void;
    onSubmit: () => Promise<void>;
    onReset: () => Promise<boolean>;
    onReady?: (ready: boolean) => void;
    notify: (message: string) => void;
    ref?: Ref<MapDockHandle>;
}

export default function MapDock({
    navigation,
    state,
    busy,
    satellite,
    guessStatus: providedGuessStatus,
    onSatelliteChange,
    onGuessChange,
    onSubmit,
    onReset,
    onReady,
    notify,
    ref,
}: MapDockProps) {
    const guessStatus = providedGuessStatus === undefined ? "idle" : providedGuessStatus;
    const dockRef = useRef<HTMLElement>(null);
    const mapElementRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const gripRef = useRef<HTMLDivElement>(null);
    const hideRef = useRef<HTMLButtonElement>(null);
    const showRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    const markerRef = useRef<Marker | null>(null);
    const satelliteRef = useRef<((visible: boolean) => void) | null>(null);
    const pressRef = useRef<{ x: number; y: number } | null>(null);
    const editedRef = useRef(false);
    const latest = useRef({ busy, state, onGuessChange, onReady, notify });
    const [mapReady, setMapReady] = useState(false);
    const [selection, setSelection] = useState<Coordinates | null>(null);
    const [coordinates, setCoordinates] = useState("");
    const [coordinateOpen, setCoordinateOpen] = useState(false);
    const [invalid, setInvalid] = useState(false);
    const solvedState = state?.solved ? state : null;
    const solved = Boolean(solvedState);
    const ready = mapReady && state !== null;

    useLayoutEffect(() => {
        latest.current = { busy, state, onGuessChange, onReady, notify };
    });

    const clear = useCallback(() => {
        markerRef.current?.remove();
        markerRef.current = null;
        editedRef.current = false;
        setSelection(null);
        setCoordinates("");
        setInvalid(false);
        latest.current.onGuessChange(null);
    }, []);

    const writeCoordinates = useCallback(() => {
        if (markerRef.current) {
            const at = markerRef.current.getLngLat().wrap();
            setCoordinates(at.lat.toFixed(5) + ", " + at.lng.toFixed(5));
            editedRef.current = false;
            setInvalid(false);
        }
    }, []);

    const setGuess = useCallback((latlng: LngLatLike) => {
        if (
            !latest.current.state || latest.current.busy || latest.current.state.solved ||
            !mapRef.current
        ) {
            return;
        }
        const wrapped = LngLat.convert(latlng).wrap();
        if (markerRef.current) {
            markerRef.current.setLngLat(wrapped);
        } else {
            const marker = new Marker({
                element: createPin("#f38ba8", "#d20f39", "guess-pin"),
                anchor: "bottom",
                draggable: true,
            }).setLngLat(wrapped).addTo(mapRef.current);
            markerRef.current = marker;
            marker.on("drag", writeCoordinates);
            marker.on("dragend", () => {
                const at = marker.getLngLat().wrap();
                marker.setLngLat(at);
                setSelection({ lat: at.lat, lon: at.lng });
                latest.current.onGuessChange({ lat: at.lat, lon: at.lng });
                writeCoordinates();
            });
            marker.getElement().addEventListener("pointerdown", (event) => {
                pressRef.current = { x: event.clientX, y: event.clientY };
            });
            marker.getElement().addEventListener("click", (event) => {
                event.stopPropagation();
                const moved = pressRef.current &&
                    Math.hypot(
                            event.clientX - pressRef.current.x,
                            event.clientY - pressRef.current.y,
                        ) > 4;
                pressRef.current = null;
                if (!latest.current.busy && !moved && !latest.current.state?.solved) {
                    clear();
                }
            });
        }
        const next = { lat: wrapped.lat, lon: wrapped.lng };
        setSelection(next);
        latest.current.onGuessChange(next);
        if (document.activeElement !== inputRef.current) {
            writeCoordinates();
        }
    }, [clear, writeCoordinates]);

    const frame = useCallback((duration = 0) => {
        const map = mapRef.current;
        const marker = markerRef.current;
        if (!map || !marker) {
            return;
        }
        const at = marker.getLngLat();
        const point = map.project(at);
        const canvas = map.getCanvas();
        if (
            point.x >= 24 && point.y >= 24 &&
            point.x <= canvas.clientWidth - 24 && point.y <= canvas.clientHeight - 24
        ) {
            return;
        }
        map.easeTo({ center: at, duration });
    }, []);

    useImperativeHandle(ref, () => ({ clear, frame }), [clear, frame]);

    const dock = useDock({
        dockRef,
        mapRef: mapElementRef,
        gripRef,
        hideRef,
        showRef,
        ready,
        onShow() {
            mapRef.current?.resize();
            frame();
        },
    });

    useEffect(() => {
        const container = canvasRef.current;
        const mapElement = mapElementRef.current;
        if (!container || !mapElement) {
            return;
        }
        const abort = new AbortController();
        let map: MapLibreMap | null = null;
        let observer: ResizeObserver | null = null;
        let destroyGestures: (() => void) | null = null;
        let framePending: ReturnType<typeof setTimeout> | undefined;
        createBasemap(container, { signal: abort.signal }).then((next) => {
            map = next;
            if (abort.signal.aborted) {
                map.remove();
                return;
            }
            mapRef.current = map;
            satelliteRef.current = installSatelliteLayer(map);
            destroyGestures = installMapGestures(map, container, navigation);
            map.on("click", (event) => setGuess(event.lngLat.wrap()));
            observer = new ResizeObserver(() => {
                next.stop();
                next.resize();
                next.redraw();
                clearTimeout(framePending);
                framePending = setTimeout(() => frame(320), 140);
            });
            observer.observe(mapElement);
            map.resize();
            setMapReady(true);
            latest.current.onReady?.(true);
        }).catch((error) => {
            if (!abort.signal.aborted) {
                console.error(error);
                latest.current.notify("Map unavailable. Reload to try again.");
            }
        });
        return () => {
            abort.abort();
            observer?.disconnect();
            destroyGestures?.();
            clearTimeout(framePending);
            markerRef.current?.remove();
            markerRef.current = null;
            map?.remove();
            mapRef.current = null;
            satelliteRef.current = null;
            latest.current.onReady?.(false);
        };
    }, [navigation, setGuess, frame]);

    useEffect(() => {
        satelliteRef.current?.(satellite);
    }, [ready, satellite]);

    useEffect(() => {
        markerRef.current?.setDraggable(!busy && !solved);
    }, [ready, busy, solved]);

    useEffect(() => {
        if (!ready || !solvedState || !mapRef.current) {
            return;
        }
        const guess = solvedState.guess;
        if (markerRef.current) {
            markerRef.current.setDraggable(false);
            markerRef.current.setLngLat([guess.lon, guess.lat]);
        } else {
            markerRef.current = pinAt(
                mapRef.current,
                guess,
                "#f38ba8",
                "#d20f39",
                "Your guess",
            );
        }
        setSelection(guess);
        setCoordinateOpen(false);
        setInvalid(false);
        frame();
    }, [ready, solvedState, frame]);

    useLayoutEffect(() => {
        if (coordinateOpen) {
            inputRef.current?.select();
            inputRef.current?.focus();
        }
    }, [coordinateOpen]);

    function applyCoordinates() {
        if (busy || !ready || solved || !mapRef.current) {
            return false;
        }
        const parsed = parseCoordinates(coordinates);
        if (!parsed) {
            setInvalid(true);
            return false;
        }
        editedRef.current = false;
        setInvalid(false);
        setGuess({ lng: parsed.lon, lat: parsed.lat });
        mapRef.current.jumpTo({
            center: [parsed.lon, parsed.lat],
            zoom: Math.max(mapRef.current.getZoom(), 12),
        });
        return true;
    }

    async function reset() {
        if (!busy && ready && await onReset()) {
            clear();
            mapRef.current?.easeTo({ center: [0, 20], zoom: 1, duration: 400 });
        }
    }

    return (
        <>
            <section
                id="mapdock"
                aria-label="Guess map"
                ref={dockRef}
                className={dock.className}
                style={dock.style}
                inert={!dock.visible}
            >
                <div
                    id="dock-grip"
                    ref={gripRef}
                    role="button"
                    tabIndex={ready ? 0 : -1}
                    aria-disabled={!ready}
                    title="Resize map"
                    aria-label="Resize map"
                    onPointerDown={dock.startResize}
                    onDoubleClick={dock.resetSize}
                    onKeyDown={dock.nudgeSize}
                >
                    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
                        <path
                            d={dock.gripPath}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                        />
                    </svg>
                </div>
                <div id="map" ref={mapElementRef}>
                    <div
                        id="map-canvas"
                        ref={canvasRef}
                        className="absolute inset-0 rounded-[inherit]"
                    />
                    <div className="map-controls left">
                        <button
                            type="button"
                            id="btn-map-hide"
                            ref={hideRef}
                            disabled={!ready}
                            className="glyph"
                            title="Hide map"
                            aria-label="Hide map"
                            onClick={dock.hide}
                        >
                            <X aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            id="btn-expand"
                            disabled={!ready}
                            className="glyph"
                            aria-pressed={dock.zoomed}
                            title={dock.zoomed ? "Restore map size" : "Zoom map"}
                            aria-label={dock.zoomed ? "Restore map size" : "Zoom map"}
                            onClick={dock.toggleZoom}
                        >
                            {dock.zoomed
                                ? <Minimize2 aria-hidden="true" />
                                : <Maximize2 aria-hidden="true" />}
                        </button>
                        <button
                            type="button"
                            id="btn-satellite"
                            disabled={!ready}
                            className="glyph"
                            aria-pressed={satellite}
                            title={satellite ? "Show map" : "Show satellite"}
                            aria-label={satellite ? "Show map" : "Show satellite"}
                            onClick={() => onSatelliteChange(!satellite)}
                        >
                            {satellite
                                ? <Satellite aria-hidden="true" />
                                : <Road aria-hidden="true" />}
                        </button>
                    </div>
                    <div className="map-controls">
                        <div className="pair">
                            <button
                                type="button"
                                id="btn-zoom-in"
                                disabled={!ready}
                                className="glyph"
                                title="Zoom in"
                                aria-label="Zoom in"
                                onClick={() => mapRef.current?.zoomIn()}
                            >
                                <Plus aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                id="btn-zoom-out"
                                disabled={!ready}
                                className="glyph"
                                title="Zoom out"
                                aria-label="Zoom out"
                                onClick={() => mapRef.current?.zoomOut()}
                            >
                                <Minus aria-hidden="true" />
                            </button>
                        </div>
                        <button
                            type="button"
                            id="btn-coord"
                            disabled={busy || !ready || solved}
                            className="glyph"
                            aria-pressed={coordinateOpen}
                            aria-controls="coord-entry"
                            title="Enter coordinates"
                            aria-label="Enter coordinates"
                            onClick={() => {
                                setInvalid(false);
                                setCoordinateOpen((open) => !open);
                            }}
                        >
                            <LocateFixed aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            id="btn-reset"
                            disabled={busy || !ready}
                            className="glyph"
                            title="Clear pin and recentre"
                            aria-label="Clear pin and recentre"
                            onClick={reset}
                        >
                            <RotateCcw aria-hidden="true" />
                        </button>
                    </div>
                    <div
                        className={"coord-entry" + (invalid ? " invalid" : "")}
                        id="coord-entry"
                        hidden={!coordinateOpen}
                    >
                        <input
                            id="coord-input"
                            ref={inputRef}
                            disabled={busy || !ready}
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            spellCheck="false"
                            placeholder="13.37, 6.21  ·  13°37′N 6°21′E"
                            aria-label="Place the pin at coordinates"
                            value={coordinates}
                            onChange={(event) => {
                                editedRef.current = true;
                                setCoordinates(event.target.value);
                                setInvalid(false);
                            }}
                            onBlur={() => {
                                if (editedRef.current) {
                                    applyCoordinates();
                                }
                            }}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    if (applyCoordinates()) {
                                        setCoordinateOpen(false);
                                    }
                                } else if (event.key === "Escape") {
                                    event.stopPropagation();
                                    setCoordinateOpen(false);
                                }
                            }}
                        />
                        <button
                            type="button"
                            id="btn-coord-apply"
                            className="glyph bare"
                            title="Place the pin"
                            aria-label="Place the pin"
                            disabled={busy || !ready || solved ||
                                parseCoordinates(coordinates) === null}
                            onClick={() => {
                                if (applyCoordinates()) {
                                    setCoordinateOpen(false);
                                }
                            }}
                        >
                            <CornerDownLeft aria-hidden="true" />
                        </button>
                    </div>
                </div>
                <button
                    type="button"
                    id="btn-guess"
                    className={"primary" +
                        (solved ? " solved" : guessStatus === "wrong" ? " miss" : "")}
                    disabled={busy || !ready || (!selection && !solved)}
                    title={solved ? "Show the result again" : ""}
                    onClick={onSubmit}
                >
                    <MapPin aria-hidden="true" />
                    <span>
                        {solved
                            ? "Solved"
                            : guessStatus === "wrong"
                            ? "Not here"
                            : selection
                            ? "Guess"
                            : "Drop a pin"}
                    </span>
                </button>
            </section>
            <button
                type="button"
                id="btn-map-show"
                ref={showRef}
                className="glyph"
                hidden={dock.visible}
                disabled={!ready}
                title="Show map"
                aria-label="Show map"
                onClick={dock.show}
            >
                <Map aria-hidden="true" />
            </button>
        </>
    );
}
