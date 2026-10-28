import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
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
import Button from "./Button.tsx";
import ResetButton from "./ResetButton.tsx";
import SettingsIsland from "./SettingsIsland.tsx";
import type { ChallengeState } from "../types.ts";
import type { Navigation } from "../lib/navigation.ts";

const MotionButton = m.create(Button);

export interface MapDockHandle {
    frame(duration?: number): void;
}

interface MapDockProps {
    navigation: Navigation;
    state: ChallengeState | null;
    busy: boolean;
    satellite: boolean;
    showFooter: boolean;
    onFooterChange: (visible: boolean) => void;
    onFooterReset: () => void;
    guessStatus: "idle" | "wrong";
    onSatelliteChange: (visible: boolean) => void;
    onGuessChange: (coordinates: Coordinates | null) => void;
    onSubmit: () => Promise<void>;
    onReset: () => Promise<boolean>;
    notify: (message: string) => void;
    ref?: Ref<MapDockHandle>;
}

export default function MapDock({
    navigation,
    state,
    busy,
    satellite,
    showFooter,
    onFooterChange,
    onFooterReset,
    guessStatus,
    onSatelliteChange,
    onGuessChange,
    onSubmit,
    onReset,
    notify,
    ref,
}: MapDockProps) {
    const reducedMotion = useReducedMotion();
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
    const preferenceResizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const latest = useRef({ busy, state, onGuessChange, notify });
    const [mapReady, setMapReady] = useState(false);
    const [selection, setSelection] = useState<Coordinates | null>(null);
    const [coordinates, setCoordinates] = useState("");
    const [coordinateOpen, setCoordinateOpen] = useState(false);
    const [invalid, setInvalid] = useState(false);
    const solvedState = state?.solved ? state : null;
    const solved = Boolean(solvedState);
    const ready = mapReady && state !== null;
    const canGuess = selection !== null || solved;
    const controlsHeight = `calc(100% - ${1 + (coordinateOpen ? 2.625 : 0) + (canGuess ? 2.625 : 0)}rem)`;
    const controlGap = "0.5rem";
    const actionTransition = {
        duration: reducedMotion ? 0 : 0.2,
        ease: [0.32, 0.72, 0, 1] as const,
    };
    const footerAnimation = {
        initial: false as const,
        animate: {
            opacity: showFooter ? 1 : 0,
            visibility: "visible" as const,
            transitionEnd: { visibility: showFooter ? ("visible" as const) : ("hidden" as const) },
        },
        transition: actionTransition,
    };

    useLayoutEffect(() => {
        latest.current = { busy, state, onGuessChange, notify };
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

    const setGuess = useCallback(
        (latlng: LngLatLike) => {
            if (
                !latest.current.state ||
                latest.current.busy ||
                latest.current.state.solved ||
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
                })
                    .setLngLat(wrapped)
                    .addTo(mapRef.current);
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
                    const moved =
                        pressRef.current &&
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
        },
        [clear, writeCoordinates],
    );

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
            point.x >= 24 &&
            point.y >= 24 &&
            point.x <= canvas.clientWidth - 24 &&
            point.y <= canvas.clientHeight - 24
        ) {
            return;
        }

        map.easeTo({ center: at, duration });
    }, []);

    const preserveCameraDuringResize = useCallback(() => {
        if (preferenceResizeTimer.current !== null) {
            clearTimeout(preferenceResizeTimer.current);
        }

        preferenceResizeTimer.current = setTimeout(() => {
            preferenceResizeTimer.current = null;
        }, 140);
    }, []);

    useImperativeHandle(ref, () => ({ frame }), [frame]);

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
        createBasemap(container, { signal: abort.signal, trackResize: false })
            .then((next) => {
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
                    const preserve = preferenceResizeTimer.current !== null;

                    next.stop();
                    next.resize(undefined, !preserve);
                    next.redraw();

                    if (preserve) {
                        preserveCameraDuringResize();
                    }

                    clearTimeout(framePending);
                    framePending = setTimeout(() => {
                        if (!preserve && preferenceResizeTimer.current === null) {
                            frame(320);
                        }
                    }, 140);
                });
                observer.observe(mapElement);
                map.resize();
                setMapReady(true);
            })
            .catch((error) => {
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

            if (preferenceResizeTimer.current !== null) {
                clearTimeout(preferenceResizeTimer.current);
                preferenceResizeTimer.current = null;
            }

            markerRef.current?.remove();
            markerRef.current = null;
            map?.remove();
            mapRef.current = null;
            satelliteRef.current = null;
        };
    }, [navigation, setGuess, frame, preserveCameraDuringResize]);

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
            markerRef.current = pinAt(mapRef.current, guess, "#f38ba8", "#d20f39", "Your guess");
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
        if (busy || !ready) {
            return false;
        }

        if (await onReset()) {
            clear();
            mapRef.current?.easeTo({ center: [0, 20], zoom: 1, duration: 400 });

            return true;
        }

        return false;
    }

    return (
        <>
            <SettingsIsland
                navigation={navigation}
                mapSize={dock.size}
                mapSide={dock.side}
                onSideChange={dock.changeSide}
                showFooter={showFooter}
                onFooterChange={onFooterChange}
                disabled={!ready || busy}
                onResetSize={() => {
                    preserveCameraDuringResize();
                    dock.resetSize();
                }}
                onResetPreferences={() => {
                    preserveCameraDuringResize();
                    dock.resetPreferences();
                    navigation.reset();
                    onFooterReset();
                }}
            />
            <m.section
                layout="position"
                layoutDependency={dock.side}
                initial={false}
                animate={{
                    y: dock.visible ? "calc(0% + 0rem)" : "calc(100% + 1.5rem)",
                    opacity: dock.visible ? 1 : 0,
                }}
                transition={
                    reducedMotion
                        ? { duration: 0 }
                        : {
                              layout: { duration: 0.35, ease: [0.32, 0.72, 0, 1] },
                              y: { duration: 0.28, ease: [0.32, 0.72, 0, 1] },
                              opacity: { duration: 0.2 },
                          }
                }
                id="mapdock"
                data-side={dock.side}
                aria-label="Guess map"
                ref={dockRef}
                className={`rounded-lg border border-solid border-hairline bg-material p-2 shadow-control glass ${dock.className}`}
                style={{ ...dock.style }}
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
                            d="M25 4 H20.5 A16.5 16.5 0 0 0 4 20.5 V25"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                        />
                    </svg>
                </div>
                <div id="map" ref={mapElementRef}>
                    <div id="map-canvas" ref={canvasRef} />
                    <m.div
                        className="absolute top-2 left-2 z-10 flex flex-col flex-wrap content-start items-start"
                        initial={false}
                        animate={{ maxHeight: controlsHeight, gap: controlGap }}
                        transition={actionTransition}
                    >
                        <Button
                            type="button"
                            id="btn-map-hide"
                            ref={hideRef}
                            disabled={!ready}
                            title="Hide map"
                            aria-label="Hide map"
                            onClick={dock.hide}
                        >
                            <X aria-hidden="true" />
                        </Button>
                        <Button
                            type="button"
                            id="btn-expand"
                            className="aria-pressed:text-accent"
                            disabled={!ready}
                            aria-pressed={dock.zoomed}
                            title={dock.zoomed ? "Exit fullscreen map" : "Fullscreen map"}
                            aria-label={dock.zoomed ? "Exit fullscreen map" : "Fullscreen map"}
                            onClick={(event) => {
                                event.currentTarget.focus({ preventScroll: true });
                                dock.toggleZoom();
                            }}
                        >
                            {dock.zoomed ? (
                                <Minimize2 aria-hidden="true" />
                            ) : (
                                <Maximize2 aria-hidden="true" />
                            )}
                        </Button>
                        <Button
                            type="button"
                            id="btn-satellite"
                            disabled={!ready}
                            aria-pressed={satellite}
                            title={satellite ? "Show map" : "Show satellite"}
                            aria-label={satellite ? "Show map" : "Show satellite"}
                            onClick={() => onSatelliteChange(!satellite)}
                        >
                            {satellite ? (
                                <Satellite aria-hidden="true" />
                            ) : (
                                <Road aria-hidden="true" />
                            )}
                        </Button>
                    </m.div>
                    <m.div
                        className="absolute top-2 right-2 z-10 flex flex-col flex-wrap-reverse content-start items-end"
                        initial={false}
                        animate={{ maxHeight: controlsHeight, gap: controlGap }}
                        transition={actionTransition}
                    >
                        <m.div
                            className="flex min-h-0 flex-col [&>button]:h-1/2 [&>button:first-child]:rounded-b-none [&>button:first-child]:border-b-separator [&>button:last-child]:rounded-t-none [&>button:last-child]:border-t-0"
                            initial={false}
                            animate={{ height: `calc(var(--spacing-control) * 2 + ${controlGap})` }}
                            transition={actionTransition}
                        >
                            <Button
                                type="button"
                                id="btn-zoom-in"
                                disabled={!ready}
                                title="Zoom in"
                                aria-label="Zoom in"
                                onClick={() => mapRef.current?.zoomIn()}
                            >
                                <Plus aria-hidden="true" />
                            </Button>
                            <Button
                                type="button"
                                id="btn-zoom-out"
                                disabled={!ready}
                                title="Zoom out"
                                aria-label="Zoom out"
                                onClick={() => mapRef.current?.zoomOut()}
                            >
                                <Minus aria-hidden="true" />
                            </Button>
                        </m.div>
                        <Button
                            type="button"
                            id="btn-coord"
                            className="aria-pressed:text-accent"
                            disabled={!ready || solved}
                            aria-disabled={busy || undefined}
                            aria-pressed={coordinateOpen}
                            aria-controls="coord-entry"
                            title="Enter coordinates"
                            aria-label="Enter coordinates"
                            onClick={() => {
                                if (busy) {
                                    return;
                                }

                                setInvalid(false);
                                setCoordinateOpen((open) => !open);
                            }}
                        >
                            <LocateFixed aria-hidden="true" />
                        </Button>
                        <ResetButton disabled={!ready} busy={busy} onReset={reset} />
                    </m.div>
                    <m.div
                        className={`absolute inset-x-2 bottom-2 z-12 flex h-control items-center gap-1.5 rounded-md border border-solid bg-material pr-1.5 pl-3 shadow-control glass ${
                            invalid ? "border-bad" : "border-hairline focus-within:border-accent"
                        }`}
                        id="coord-entry"
                        initial={false}
                        animate={{
                            y: canGuess ? "-2.625rem" : "0rem",
                            opacity: coordinateOpen ? 1 : 0,
                        }}
                        transition={actionTransition}
                        inert={!coordinateOpen}
                        aria-hidden={!coordinateOpen}
                    >
                        <input
                            id="coord-input"
                            className="min-w-0 flex-1 select-text border-0 border-none bg-transparent text-foreground tabular-nums outline-none placeholder:text-muted placeholder:opacity-70"
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
                        <Button
                            type="button"
                            id="btn-coord-apply"
                            variant="bare"
                            className="size-6.5 rounded-sm text-muted enabled:text-accent enabled:hover:bg-accent/16 disabled:opacity-30"
                            title="Place the pin"
                            aria-label="Place the pin"
                            disabled={
                                busy || !ready || solved || parseCoordinates(coordinates) === null
                            }
                            onClick={() => {
                                if (applyCoordinates()) {
                                    setCoordinateOpen(false);
                                }
                            }}
                        >
                            <CornerDownLeft aria-hidden="true" />
                        </Button>
                    </m.div>
                    <MotionButton
                        type="button"
                        id="btn-guess"
                        variant={solved ? "solved" : guessStatus === "wrong" ? "wrong" : "tinted"}
                        className="absolute inset-x-2 bottom-2 z-12 focus-visible:-outline-offset-4"
                        initial={false}
                        animate={{ y: canGuess ? "0rem" : "2.625rem" }}
                        transition={actionTransition}
                        inert={!canGuess}
                        aria-hidden={!canGuess}
                        disabled={
                            busy ||
                            !ready ||
                            !canGuess ||
                            (coordinateOpen && parseCoordinates(coordinates) === null)
                        }
                        title={solved ? "Show the result again" : ""}
                        onClick={onSubmit}
                    >
                        <MapPin aria-hidden="true" />
                        <span>
                            {solved ? "Solved" : guessStatus === "wrong" ? "Not here" : "Guess"}
                        </span>
                    </MotionButton>
                </div>
            </m.section>
            <MotionButton
                type="button"
                id="btn-map-show"
                data-side={dock.side}
                layout="position"
                layoutDependency={dock.side}
                transition={
                    reducedMotion
                        ? { duration: 0 }
                        : { layout: { duration: 0.35, ease: [0.32, 0.72, 0, 1] } }
                }
                ref={showRef}
                className="absolute bottom-(--edge-bottom) z-500"
                hidden={dock.visible}
                disabled={!ready}
                title="Show map"
                aria-label="Show map"
                onClick={dock.show}
            >
                <Map aria-hidden="true" />
            </MotionButton>
            <div
                id="credits-position"
                className="pointer-events-none absolute z-300 flex"
                style={{
                    left:
                        !dock.visible && dock.side === "left"
                            ? "calc(var(--edge-left) + var(--spacing-control) + 0.5rem)"
                            : "var(--edge-left)",
                    right:
                        !dock.visible && dock.side === "right"
                            ? "calc(var(--edge-right) + var(--spacing-control) + 0.5rem)"
                            : "var(--edge-right)",
                    justifyContent: dock.side === "left" ? "flex-end" : "flex-start",
                    textAlign: dock.side === "left" ? "right" : "left",
                }}
            >
                <m.footer
                    id="credits"
                    layout="position"
                    layoutDependency={`${dock.side}:${dock.visible}`}
                    initial={false}
                    transition={{ layout: actionTransition }}
                    aria-hidden={!showFooter}
                    className="relative w-max max-w-full text-credit text-foreground text-shadow-credit"
                >
                    <div id="scrim" aria-hidden="true">
                        {[1, 2, 3, 5, 8, 12].map((blur, index) => {
                            const mask = `linear-gradient(to top, #000 ${Math.max(0, 70 - index * 15)}%, transparent ${100 - index * 15}%), linear-gradient(to right, transparent, #000 4rem, #000 calc(100% - 4rem), transparent)`;

                            return (
                                <m.div
                                    key={blur}
                                    {...footerAnimation}
                                    className="absolute inset-0"
                                    style={{
                                        backdropFilter: `blur(${blur / 16}rem)`,
                                        WebkitBackdropFilter: `blur(${blur / 16}rem)`,
                                        maskImage: mask,
                                        WebkitMaskImage: mask,
                                        maskComposite: "intersect",
                                        WebkitMaskComposite: "source-in",
                                    }}
                                />
                            );
                        })}
                    </div>
                    <m.div className="relative" {...footerAnimation}>
                        <span id="basemap-credit">
                            {satellite
                                ? "Imagery © Esri, Maxar, Earthstar Geographics"
                                : "Basemap © CARTO · © OpenStreetMap contributors (ODbL)"}
                        </span>
                        &nbsp;· MapLibre (BSD-3) · Leaflet (BSD-2) · Pannellum (MIT) · Lucide (ISC)
                    </m.div>
                </m.footer>
            </div>
        </>
    );
}
