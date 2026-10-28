import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { Hand, Mouse, RotateCcw, Settings, X } from "lucide-react";
import type { Navigation } from "../lib/navigation.ts";
import Button from "./Button.tsx";

interface SettingsIslandProps {
    navigation: Navigation;
    mapSize: { width: number; height: number } | null;
    mapSide: "left" | "right";
    onSideChange(side: "left" | "right"): void;
    showFooter: boolean;
    onFooterChange(visible: boolean): void;
    disabled: boolean;
    onResetSize(): void;
    onResetPreferences(): void;
}

export default function SettingsIsland({
    navigation,
    mapSize,
    mapSide,
    showFooter,
    disabled,
    onSideChange,
    onFooterChange,
    onResetSize,
    onResetPreferences,
}: SettingsIslandProps) {
    const [open, setOpen] = useState(false);
    const [pan, setPan] = useState(() => navigation.panMode());
    const [status, setStatus] = useState("");
    const [restoreCount, setRestoreCount] = useState(0);
    const island = useRef<HTMLElement>(null);
    const toggle = useRef<HTMLButtonElement>(null);
    const reducedMotion = useReducedMotion();

    useEffect(() => navigation.onModeChange(setPan), [navigation]);

    useEffect(() => {
        if (!open) {
            return;
        }

        const controller = new AbortController();

        function dismissOutside(event: Event) {
            if (
                event.type === "blur" ||
                (event.target instanceof Node && !island.current?.contains(event.target))
            ) {
                setOpen(false);
            }
        }

        function keyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                event.stopPropagation();
                setOpen(false);
                toggle.current?.focus({ preventScroll: true });
            }
        }

        document.addEventListener("pointerdown", dismissOutside, {
            capture: true,
            signal: controller.signal,
        });
        document.addEventListener("focusin", dismissOutside, { signal: controller.signal });
        document.addEventListener("keydown", keyDown, { signal: controller.signal });
        window.addEventListener("blur", dismissOutside, { signal: controller.signal });

        return () => controller.abort();
    }, [open]);

    function close() {
        setOpen(false);
        toggle.current?.focus({ preventScroll: true });
    }

    return (
        <m.section
            id="settings-island"
            ref={island}
            className="absolute top-(--edge-top) right-(--edge-right) z-350 overflow-hidden rounded-md"
            aria-label="Settings"
            initial={false}
            animate={{
                width: open ? "19rem" : "2.125rem",
                height: open ? "auto" : "2.125rem",
                borderRadius: open ? "var(--radius-lg)" : "var(--radius-md)",
            }}
            transition={
                reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 440, damping: 38 }
            }
            style={{ maxWidth: "calc(100vw - var(--edge-left) - var(--edge-right))" }}
        >
            <m.div
                className="pointer-events-none absolute inset-0 border border-solid border-hairline bg-material shadow-control glass"
                style={{ borderRadius: "inherit" }}
                initial={false}
                animate={{ opacity: open ? 1 : 0 }}
                aria-hidden="true"
            />
            <div className="relative px-4 pt-4 pb-2">
                <m.h3
                    className="m-0 pr-control text-small font-semibold whitespace-nowrap"
                    animate={{ opacity: open ? 1 : 0 }}
                    aria-hidden={!open}
                >
                    Scroll behavior
                </m.h3>
                <Button
                    id="btn-settings"
                    ref={toggle}
                    type="button"
                    variant={open ? "bare" : "icon"}
                    className="absolute top-0 right-0 size-control rounded-md text-foreground focus-visible:-outline-offset-4"
                    aria-label={open ? "Close settings" : "Settings"}
                    title={open ? "Close settings" : "Settings"}
                    aria-expanded={open}
                    aria-controls="settings-panel"
                    onClick={() => (open ? close() : setOpen(true))}
                >
                    <m.span
                        className="absolute inline-flex"
                        animate={{
                            opacity: open ? 0 : 1,
                            rotate: open ? 90 : 0,
                            scale: open ? 0.6 : 1,
                        }}
                        aria-hidden="true"
                    >
                        <Settings />
                    </m.span>
                    <m.span
                        className="absolute inline-flex"
                        animate={{
                            opacity: open ? 1 : 0,
                            rotate: open ? 0 : -90,
                            scale: open ? 1 : 0.6,
                        }}
                        aria-hidden="true"
                    >
                        <X />
                    </m.span>
                </Button>
            </div>
            <m.div
                id="settings-panel"
                className="relative overflow-auto overscroll-contain px-4 pb-4"
                style={{
                    width: "min(19rem, calc(100vw - var(--edge-left) - var(--edge-right)))",
                    maxHeight: "calc(100dvh - var(--edge-top) - var(--edge-bottom) - 2.75rem)",
                }}
                inert={!open}
                aria-hidden={!open}
                animate={{ opacity: open ? 1 : 0 }}
            >
                {[
                    {
                        label: "Scroll behavior",
                        selected: pan ? 0 : 1,
                        options: [
                            { label: "Pan", Icon: Hand },
                            { label: "Zoom", Icon: Mouse },
                        ],
                        select: (index: number) => navigation.setPanMode(index === 0),
                    },
                    {
                        label: "Minimap position",
                        selected: mapSide === "left" ? 0 : 1,
                        options: [
                            { label: "Left", Icon: null },
                            { label: "Right", Icon: null },
                        ],
                        select: (index: number) => onSideChange(index === 0 ? "left" : "right"),
                    },
                ].map(({ label, selected, options, select }, groupIndex) => (
                    <div key={label} className={groupIndex ? "mt-4" : undefined}>
                        {groupIndex ? (
                            <h3 className="mt-0 mb-2 text-small font-semibold">{label}</h3>
                        ) : null}
                        <div
                            className="relative flex rounded-full border border-solid border-hairline bg-field p-1"
                            role="group"
                            aria-label={label}
                        >
                            <div
                                className="pointer-events-none absolute inset-1"
                                aria-hidden="true"
                            >
                                <m.div
                                    className="h-full w-1/2 rounded-full bg-foreground"
                                    initial={false}
                                    animate={{ x: selected === 0 ? "0%" : "100%" }}
                                    transition={
                                        reducedMotion
                                            ? { duration: 0 }
                                            : { type: "spring", stiffness: 500, damping: 40 }
                                    }
                                />
                            </div>
                            {options.map(({ label, Icon }, index) => (
                                <m.button
                                    key={label}
                                    type="button"
                                    className="relative flex min-h-8 flex-1 items-center justify-center gap-2 rounded-full border-0 bg-transparent font-semibold"
                                    initial={false}
                                    animate={{
                                        color:
                                            selected === index
                                                ? "var(--color-ink)"
                                                : "var(--color-muted)",
                                    }}
                                    transition={{ duration: reducedMotion ? 0 : 0.16 }}
                                    aria-pressed={selected === index}
                                    onClick={() => select(index)}
                                >
                                    {Icon ? <Icon aria-hidden="true" /> : null}
                                    {label}
                                </m.button>
                            ))}
                        </div>
                    </div>
                ))}
                <div className="mt-4 flex items-center justify-between gap-3">
                    <div>
                        <h3 className="m-0 text-small font-semibold">Minimap size</h3>
                        <p className="mt-1 mb-0 text-caption text-muted tabular-nums">
                            {mapSize ? `${mapSize.width} × ${mapSize.height}` : "Default"}
                        </p>
                    </div>
                    <Button
                        type="button"
                        variant="bare"
                        className="rounded-sm px-2 py-2 text-small text-foreground enabled:hover:bg-field disabled:opacity-45"
                        disabled={disabled || !mapSize}
                        onClick={() => {
                            onResetSize();
                            setStatus("Saved minimap size reset. Your pin stays.");
                        }}
                    >
                        Reset size
                    </Button>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 text-small font-semibold">
                    <span id="footer-label">Show footer</span>
                    <button
                        type="button"
                        role="switch"
                        aria-labelledby="footer-label"
                        aria-checked={showFooter}
                        className="relative h-5 w-9 rounded-full border-0 bg-field p-0 ring-1 ring-inset ring-hairline transition-background aria-checked:glass aria-checked:ring-accent/35 aria-checked:bg-accent/10 aria-checked:hover:bg-accent"
                        onClick={() => onFooterChange(!showFooter)}
                    >
                        <m.span
                            className="absolute top-0.5 left-0.5 size-4 rounded-full bg-foreground shadow-control"
                            initial={false}
                            animate={{ x: showFooter ? "1rem" : "0rem" }}
                            transition={{ duration: reducedMotion ? 0 : 0.16 }}
                        />
                    </button>
                </div>
                <button
                    type="button"
                    className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-solid border-bad/35 bg-bad/10 px-3 text-small font-semibold text-bad transition-background enabled:hover:bg-bad enabled:hover:text-ink focus-visible:bg-bad focus-visible:text-ink disabled:opacity-45"
                    disabled={disabled}
                    onClick={() => {
                        onResetPreferences();
                        onFooterChange(true);
                        setRestoreCount((count) => count + 1);
                        setStatus("Defaults restored. Your pin stays.");
                    }}
                >
                    <m.span
                        key={restoreCount}
                        className="inline-flex"
                        initial={{ rotate: 0 }}
                        animate={{ rotate: restoreCount > 0 && !reducedMotion ? -360 : 0 }}
                        transition={{ duration: reducedMotion ? 0 : 0.45, ease: "easeOut" }}
                    >
                        <RotateCcw aria-hidden="true" />
                    </m.span>
                    Restore defaults
                </button>
                <p className="sr-only" role="status" aria-live="polite">
                    {status}
                </p>
            </m.div>
        </m.section>
    );
}
