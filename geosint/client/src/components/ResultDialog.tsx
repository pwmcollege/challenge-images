import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { LngLatBounds } from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import {
    addRevealLayer,
    createBasemap,
    installSatelliteLayer,
    lineBetween,
    pinAt,
} from "../lib/basemap.ts";
import { offsetReadout } from "../lib/geo.ts";
import Button from "./Button.tsx";
import type { ChallengeState } from "../types.ts";

interface ResultDialogProps {
    state: Extract<ChallengeState, { solved: true }>;
    open: boolean;
    satellite: boolean;
    onClose: () => void;
    notify: (message: string) => void;
}

export default function ResultDialog(
    { state, open, satellite, onClose, notify }: ResultDialogProps,
) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const flagRef = useRef<HTMLElement>(null);
    const doneRef = useRef<HTMLButtonElement>(null);
    const [map, setMap] = useState<MapLibreMap | null>(null);
    const [copied, setCopied] = useState(false);
    const satelliteRef = useRef<((visible: boolean) => void) | null>(null);
    const activeMap = useRef<MapLibreMap | null>(null);

    useLayoutEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) {
            return;
        }
        if (open) {
            if (!dialog.open) {
                dialog.showModal();
            }
            doneRef.current?.focus();
        } else {
            dialog.close();
        }
    }, [open]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }
        let disposed = false;
        let current: MapLibreMap | null = null;
        const controller = new AbortController();
        createBasemap(container, { signal: controller.signal }).then((next) => {
            if (disposed) {
                next.remove();
                return;
            }
            current = next;
            activeMap.current = next;
            satelliteRef.current = installSatelliteLayer(next);
            addRevealLayer(next);
            setMap(next);
        }).catch(() => {
            if (!disposed) {
                notify("Result map unavailable.");
            }
        });
        return () => {
            disposed = true;
            controller.abort();
            activeMap.current = null;
            current?.remove();
        };
    }, [notify]);

    useEffect(() => {
        if (map) {
            satelliteRef.current?.(satellite);
        }
    }, [map, satellite]);

    useEffect(() => {
        const container = containerRef.current;
        if (!map || !open || !container) {
            return;
        }
        const { guess, answer } = state;
        const line = lineBetween(guess, answer);
        const points = line.features[0].geometry.coordinates;
        map.resize();
        map.getSource<GeoJSONSource>("reveal")?.setData(line);
        const markers = [
            pinAt(map, guess, "#f38ba8", "#d20f39", "Your guess"),
            pinAt(
                map,
                { lat: answer.lat, lon: points.at(-1)?.[0] ?? answer.lon },
                "#a6e3a1",
                "#40a02b",
                "The answer",
            ),
        ];
        map.fitBounds(
            points.reduce(
                (bounds, point) => bounds.extend([point[0], point[1]]),
                new LngLatBounds(),
            ),
            { padding: 46, maxZoom: 13, duration: 0 },
        );
        const observer = new ResizeObserver(() => map.resize());
        observer.observe(container);
        return () => {
            observer.disconnect();
            markers.forEach((marker) => marker.remove());
            if (activeMap.current === map) {
                map.getSource<GeoJSONSource>("reveal")?.setData({
                    type: "FeatureCollection",
                    features: [],
                });
            }
        };
    }, [map, open, state]);

    async function copyFlag() {
        try {
            await navigator.clipboard.writeText(state.flag);
        } catch {
            const flag = flagRef.current;
            const selection = window.getSelection();
            if (!flag || !selection) {
                notify("Select the flag and copy it manually.");
                return;
            }
            const range = document.createRange();
            range.selectNodeContents(flag);
            selection.removeAllRanges();
            selection.addRange(range);
            try {
                if (!document.execCommand("copy")) {
                    notify("Select the flag and copy it manually.");
                    return;
                }
            } catch {
                notify("Select the flag and copy it manually.");
                return;
            }
        }
        setCopied(true);
    }

    return (
        <dialog
            ref={dialogRef}
            id="result-dialog"
            className="fixed inset-0 z-900 m-0 h-dvh max-h-none w-full max-w-none place-items-center border-0 border-none bg-overlay text-foreground backdrop-blur-dialog open:grid backdrop:bg-transparent"
            aria-labelledby="result-title"
            onClose={() => setCopied(false)}
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
        >
            <div className="result-card w-full max-w-130 overflow-auto overscroll-contain rounded-lg border border-solid border-hairline bg-material-strong shadow-dialog glass">
                <div ref={containerRef} id="result-map" />
                <div className="px-5 pt-4.5 pb-0.5">
                    <div className="flex items-start gap-result">
                        <span
                            className="grid size-7.5 shrink-0 place-items-center rounded-full bg-good text-ink"
                            aria-hidden="true"
                        >
                            <Check className="size-4.5" strokeWidth={2.6} />
                        </span>
                        <div className="min-w-0">
                            <h2
                                id="result-title"
                                className="m-0 text-title font-semibold tracking-title"
                            >
                                Found it
                            </h2>
                            <p
                                id="result-distance"
                                className="m-0 mt-0.5 text-small text-muted tabular-nums"
                            >
                                {offsetReadout(state.distance_km, state.guess, state.answer)}
                            </p>
                        </div>
                    </div>
                    <div className="mt-3.5" id="flag-field" hidden={!state.flag}>
                        <div className="flex items-center gap-2 rounded-md border border-solid border-hairline bg-field py-2.5 pr-2 pl-3">
                            <code
                                ref={flagRef}
                                id="flag-box"
                                className="min-w-0 flex-1 select-all font-mono text-small break-all text-foreground"
                            >
                                {state.flag}
                            </code>
                            <Button
                                type="button"
                                id="btn-copy"
                                variant="bare"
                                className={`size-5.5 rounded-md disabled:opacity-45 ${
                                    copied
                                        ? "text-good"
                                        : "text-muted enabled:hover:text-foreground"
                                }`}
                                title={copied ? "Copied" : "Copy"}
                                aria-label="Copy flag"
                                onClick={copyFlag}
                            >
                                {copied
                                    ? <Check aria-hidden="true" />
                                    : <Copy aria-hidden="true" />}
                            </Button>
                        </div>
                    </div>
                </div>
                <div className="px-5 pt-4.5 pb-5">
                    <Button
                        type="button"
                        id="btn-done"
                        ref={doneRef}
                        variant="primary"
                        className="w-full"
                        onClick={onClose}
                    >
                        Done
                    </Button>
                </div>
            </div>
        </dialog>
    );
}
