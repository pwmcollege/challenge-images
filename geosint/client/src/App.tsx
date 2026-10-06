import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Hand, Minus, Mouse, Plus, Target } from "lucide-react";
import Button from "./components/Button.tsx";
import Loader from "./components/Loader.tsx";
import MediaViewer from "./components/MediaViewer.tsx";
import { createNavigation } from "./lib/navigation.ts";
import type { Coordinates } from "./lib/geo.ts";
import type { LoadingState, MediaConfig, MediaHandle } from "./lib/media.ts";
import type { MapDockHandle } from "./components/MapDock.tsx";
import type { ChallengeState, GuessResponse } from "./types.ts";

type ApiError = { error?: string; retry_after?: number };
type ApiResponse<T> =
    | { ok: true; status: number; body: T }
    | { ok: false; status: number; body: ApiError };

const ResultDialog = lazy(() => import("./components/ResultDialog.tsx"));
const MapDock = lazy(() => import("./components/MapDock.tsx"));

async function api<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const timeout = AbortSignal.timeout(10000);
    const response = await fetch(path, {
        ...options,
        signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
    });
    const body: unknown = await response.json();
    return response.ok
        ? { ok: true, status: response.status, body: body as T }
        : { ok: false, status: response.status, body: body as ApiError };
}

export default function App() {
    const [navigation] = useState(createNavigation);
    const [panMode, setPanMode] = useState(() => navigation.panMode());
    const [state, setState] = useState<ChallengeState | null>(null);
    const [media, setMedia] = useState<MediaConfig | null>(null);
    const [busy, setBusy] = useState(false);
    const [satellite, setSatellite] = useState(false);
    const [guessStatus, setGuessStatus] = useState<"idle" | "wrong">("idle");
    const [resultView, setResultView] = useState<"idle" | "open" | "closed">("idle");
    const [toast, setToast] = useState<{ message: string } | null>(null);
    const [loading, setLoading] = useState<LoadingState>({
        title: "Loading imagery",
        detail: "Starting",
        progress: null,
        done: false,
        error: false,
    });
    const mediaRef = useRef<MediaHandle>(null);
    const mapRef = useRef<MapDockHandle>(null);
    const guess = useRef<Coordinates | null>(null);
    const pending = useRef(false);
    const notify = useCallback((message: string) => setToast({ message }), []);
    const acceptState = useCallback((next: ChallengeState) => {
        setState(next);
        setMedia((current) => current || next.media);
    }, []);
    const selectGuess = useCallback((next: Coordinates | null) => {
        guess.current = next;
        setGuessStatus("idle");
    }, []);

    useEffect(() => navigation.onModeChange(setPanMode), [navigation]);

    useEffect(() => {
        if (!toast) {
            return;
        }
        const timer = setTimeout(() => setToast(null), 3400);
        return () => clearTimeout(timer);
    }, [toast]);

    useEffect(() => {
        const controller = new AbortController();
        api<ChallengeState>("api/state", { signal: controller.signal }).then(({ ok, body }) => {
            if (!ok) {
                throw new Error(body.error || "Could not load challenge");
            }
            acceptState(body);
        }).catch(() => {
            if (!controller.signal.aborted) {
                notify("Could not reach the server. Try again.");
                setLoading({
                    title: "Could not load imagery",
                    detail: "Could not load challenge. Reload to try again.",
                    progress: 100,
                    done: false,
                    error: true,
                });
            }
        });
        return () => controller.abort();
    }, [acceptState, notify]);

    const closeResult = useCallback(() => {
        setResultView("closed");
        mapRef.current?.frame(700);
    }, []);

    const submitGuess = useCallback(async () => {
        if (state?.solved) {
            setResultView("open");
            return;
        }
        if (!state || pending.current || !guess.current) {
            return;
        }
        pending.current = true;
        setBusy(true);
        const options = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(guess.current),
        };
        try {
            let response = await api<GuessResponse>("api/guess", options);
            if (!response.ok && response.status === 429) {
                const wait = Math.min(
                    1000,
                    Math.max(0, Number(response.body.retry_after) || 0) * 1000,
                ) + 80;
                await new Promise<void>((resolve) => setTimeout(resolve, wait));
                response = await api<GuessResponse>("api/guess", options);
            }
            if (!response.ok && response.status === 409) {
                const current = await api<ChallengeState>("api/state");
                if (current.ok) {
                    acceptState(current.body);
                } else {
                    notify("Could not reach the server. Try again.");
                }
                return;
            }
            if (!response.ok) {
                notify(response.body.error || "Guess rejected. Try again.");
                return;
            }
            acceptState(response.body.state);
            if (response.body.outcome === "wrong") {
                // mapRef.current?.clear();
                setGuessStatus("wrong");
            } else {
                setResultView("open");
            }
        } catch (error) {
            notify(
                error instanceof Error && error.name === "TimeoutError"
                    ? "Request timed out. Try again."
                    : "Could not submit guess. Try again.",
            );
        } finally {
            pending.current = false;
            setBusy(false);
        }
    }, [state, acceptState, notify]);

    const reset = useCallback(async () => {
        if (!state || pending.current) {
            return false;
        }
        pending.current = true;
        setBusy(true);
        try {
            const { ok, body } = await api<ChallengeState>("api/reset", { method: "POST" });
            if (!ok) {
                throw new Error("Could not reset");
            }
            acceptState(body);
            setResultView("idle");
            setGuessStatus("idle");
            return true;
        } catch {
            notify("Could not reset. Try again.");
            return false;
        } finally {
            pending.current = false;
            setBusy(false);
        }
    }, [state, acceptState, notify]);

    useEffect(() => {
        function keyDown(event: KeyboardEvent) {
            if (
                event.key !== "Enter" || event.defaultPrevented ||
                (event.target instanceof Element &&
                    event.target.closest(
                        "input, textarea, button, a, [contenteditable], [role=button]",
                    ))
            ) {
                return;
            }
            if (resultView === "open") {
                closeResult();
            } else if (!busy && !state?.solved) {
                submitGuess();
            }
        }
        document.addEventListener("keydown", keyDown);
        return () => document.removeEventListener("keydown", keyDown);
    }, [busy, closeResult, resultView, state?.solved, submitGuess]);

    return (
        <div id="stage" className="no-hud relative h-full">
            <MediaViewer
                ref={mediaRef}
                media={media}
                navigation={navigation}
                onLoading={setLoading}
            />
            <div
                className="pano-controls flex flex-col gap-1.75"
                hidden={media?.kind !== "pano" || loading.error}
            >
                <div className="flex flex-col [&>button:first-child]:rounded-b-none [&>button:first-child]:border-b-separator [&>button:last-child]:rounded-t-none [&>button:last-child]:border-t-0">
                    <Button
                        type="button"
                        id="btn-pano-in"
                        title="Zoom in"
                        aria-label="Zoom in"
                        onClick={() => mediaRef.current?.zoom(-12)}
                    >
                        <Plus aria-hidden="true" />
                    </Button>
                    <Button
                        type="button"
                        id="btn-pano-out"
                        title="Zoom out"
                        aria-label="Zoom out"
                        onClick={() => mediaRef.current?.zoom(12)}
                    >
                        <Minus aria-hidden="true" />
                    </Button>
                </div>
            </div>
            <header
                id="hud"
                className="pointer-events-none absolute inset-x-0 top-0 z-400 flex items-center gap-2 p-3.5 [&>*]:pointer-events-auto"
                hidden
            >
                <span
                    className="inline-flex h-control items-center justify-center gap-1.75 whitespace-nowrap rounded-md border border-solid border-hairline bg-material px-3.25 font-semibold tracking-control text-foreground tabular-nums glass"
                    id="pill-threshold"
                >
                    <Target className="size-4 shrink-0 stroke-2 text-muted" aria-hidden="true" />
                    <span>within - km</span>
                </span>
            </header>
            <Loader {...loading} />
            <div
                id="toast"
                className={`pointer-events-none absolute left-1/2 top-15.5 z-400 max-w-toast -translate-x-1/2 rounded-md border border-solid border-hairline bg-material-strong px-4 py-2.5 text-bad shadow-control glass transition-opacity duration-180 ease-control ${
                    toast ? "opacity-100" : "opacity-0"
                }`}
                role="status"
                aria-live="polite"
            >
                {toast?.message}
            </div>
            <Suspense fallback={null}>
                <MapDock
                    ref={mapRef}
                    navigation={navigation}
                    state={state}
                    busy={busy}
                    satellite={satellite}
                    guessStatus={guessStatus}
                    onSatelliteChange={setSatellite}
                    onGuessChange={selectGuess}
                    onSubmit={submitGuess}
                    onReset={reset}
                    notify={notify}
                />
            </Suspense>
            {resultView !== "idle" && state?.solved
                ? (
                    <Suspense fallback={null}>
                        <ResultDialog
                            state={state}
                            open={resultView === "open"}
                            satellite={satellite}
                            onClose={closeResult}
                            notify={notify}
                        />
                    </Suspense>
                )
                : null}
            <div id="scrim" aria-hidden="true">
                {Array.from({ length: 6 }, (_, index) => <div key={index} />)}
            </div>
            <Button
                type="button"
                id="btn-mode"
                className="absolute top-(--edge-top) right-(--edge-right) z-350"
                title={panMode ? "Scroll pans, pinch zooms" : "Scroll zooms"}
                aria-label="Toggle navigation mode"
                aria-pressed={panMode}
                onClick={() => navigation.setPanMode(!panMode)}
            >
                {panMode ? <Hand aria-hidden="true" /> : <Mouse aria-hidden="true" />}
            </Button>
            <footer
                id="credits"
                className="pointer-events-none absolute inset-x-0 bottom-0 z-300 flex items-center text-credit text-foreground text-shadow-credit"
            >
                <span id="basemap-credit">
                    {satellite
                        ? "Imagery © Esri, Maxar, Earthstar Geographics"
                        : "Basemap © CARTO · © OpenStreetMap contributors (ODbL)"}
                </span>
                &nbsp;· MapLibre (BSD-3) · Leaflet (BSD-2) · Pannellum (MIT) · Lucide (ISC)
            </footer>
        </div>
    );
}
