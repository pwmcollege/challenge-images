import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, RotateCcw, Trash2 } from "lucide-react";
import Button from "./Button.tsx";

const RESET_HOLD_MS = 600;
const TAP_MAX_MS = 200;
const RESET_BORDER_PATH =
    "M17 1H14A13 13 0 0 0 1 14V20A13 13 0 0 0 14 33H20A13 13 0 0 0 33 20V14A13 13 0 0 0 20 1H17Z";
type ResetFeedback = "idle" | "map-rewinding" | "map-pending" | "preferences-pending" | "map-done" |
    "preferences-done";

interface ResetButtonProps {
    disabled: boolean;
    busy: boolean;
    onReset: (defaults: boolean) => Promise<boolean>;
}

export default function ResetButton({ disabled, busy, onReset }: ResetButtonProps) {
    const blocked = disabled || busy;
    const [feedback, setFeedback] = useState<ResetFeedback>("idle");
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mounted = useRef(true);
    const pending = useRef(false);
    const ring = useRef<SVGSVGElement | null>(null);
    const progress = useRef<SVGPathElement | null>(null);
    const icon = useRef<HTMLSpanElement | null>(null);
    const animation = useRef<Animation | null>(null);
    const iconAnimation = useRef<Animation | null>(null);
    const press = useRef<{
        id: number;
        x: number;
        y: number;
        requiresShift: boolean;
        armed: boolean;
        startedAt: number;
    } | null>(null);
    const consumed = useRef(false);
    const latest = useRef({ disabled: blocked, onReset });

    const hideProgress = useCallback(() => {
        animation.current?.cancel();
        animation.current = null;
        iconAnimation.current?.cancel();
        iconAnimation.current = null;
        if (icon.current) {
            icon.current.style.color = "";
        }
        if (ring.current) {
            ring.current.style.display = "none";
        }
    }, []);

    const showProgress = useCallback(() => {
        hideProgress();
        if (ring.current && progress.current) {
            ring.current.style.display = "block";
            animation.current = progress.current.animate(
                [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }],
                { duration: RESET_HOLD_MS, easing: "linear", fill: "forwards" },
            );
        }
        if (icon.current) {
            icon.current.style.color = "var(--color-bad)";
            if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
                iconAnimation.current = icon.current.animate(
                    [{ transform: "rotate(0deg)" }, { transform: "rotate(-360deg)" }],
                    { duration: RESET_HOLD_MS, easing: "linear", fill: "forwards" },
                );
            }
        }
        return animation.current;
    }, [hideProgress]);

    const rewindProgress = useCallback(async () => {
        const path = progress.current;
        if (!animation.current || !path) {
            return;
        }
        const offset = Math.min(100, Math.max(0, parseFloat(getComputedStyle(path).strokeDashoffset)));
        const fraction = 1 - offset / 100;
        const duration = Math.max(80, Math.round(fraction * 300));
        animation.current.cancel();
        iconAnimation.current?.cancel();
        const returning = path.animate(
            [{ strokeDashoffset: offset }, { strokeDashoffset: 100 }],
            { duration, easing: "ease-out", fill: "forwards" },
        );
        animation.current = returning;
        if (icon.current && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
            iconAnimation.current = icon.current.animate(
                [{ transform: `rotate(${-360 * fraction}deg)` }, { transform: "rotate(0deg)" }],
                { duration, easing: "ease-out", fill: "forwards" },
            );
        }
        try {
            await returning.finished;
        } catch (error) {
            if (!(error instanceof DOMException && error.name === "AbortError")) {
                console.error(error);
            }
        } finally {
            if (animation.current === returning) {
                hideProgress();
            }
        }
    }, [hideProgress]);

    const clearPress = useCallback(() => {
        if (timer.current !== null) {
            clearTimeout(timer.current);
            timer.current = null;
        }
        press.current = null;
    }, []);

    const releasePress = useCallback(() => {
        const from = press.current;
        if (!from) {
            return;
        }
        clearPress();
        if (!pending.current) {
            const tap = !from.requiresShift && from.armed &&
                performance.now() - from.startedAt <= TAP_MAX_MS;
            if (tap) {
                animation.current?.pause();
                iconAnimation.current?.pause();
            } else {
                consumed.current = true;
                rewindProgress();
            }
        }
    }, [clearPress, rewindProgress]);

    const cancelGesture = useCallback(() => {
        if (!press.current) {
            return;
        }
        consumed.current = true;
        clearPress();
        if (!pending.current) {
            rewindProgress();
        }
    }, [clearPress, rewindProgress]);

    const releaseShift = useCallback(() => {
        const from = press.current;
        if (!from?.requiresShift || !from.armed) {
            return;
        }
        from.armed = false;
        consumed.current = true;
        if (timer.current !== null) {
            clearTimeout(timer.current);
            timer.current = null;
        }
        rewindProgress();
    }, [rewindProgress]);

    const reset = useCallback(async (defaults: boolean) => {
        if (latest.current.disabled || pending.current) {
            return;
        }
        if (feedbackTimer.current !== null) {
            clearTimeout(feedbackTimer.current);
        }
        pending.current = true;
        setFeedback(defaults ? "preferences-pending" : "map-rewinding");
        try {
            if (!defaults) {
                await rewindProgress();
            }
            if (!mounted.current) {
                return;
            }
            if (latest.current.disabled) {
                setFeedback("idle");
                return;
            }
            setFeedback(defaults ? "preferences-pending" : "map-pending");
            const success = await latest.current.onReset(defaults);
            if (!mounted.current) {
                return;
            }
            setFeedback(success ? (defaults ? "preferences-done" : "map-done") : "idle");
            if (success) {
                feedbackTimer.current = setTimeout(() => {
                    feedbackTimer.current = null;
                    setFeedback("idle");
                }, 1000);
            }
        } catch (error) {
            if (!(error instanceof DOMException && error.name === "AbortError")) {
                console.error(error);
            }
            if (mounted.current) {
                setFeedback("idle");
            }
        } finally {
            pending.current = false;
        }
    }, [rewindProgress]);

    useLayoutEffect(() => {
        latest.current = { disabled: blocked, onReset };
        if (blocked) {
            cancelGesture();
        }
    }, [blocked, onReset, cancelGesture]);

    useEffect(() => {
        mounted.current = true;
        function keyUp(event: globalThis.KeyboardEvent) {
            if (event.key === "Shift") {
                releaseShift();
            }
        }
        window.addEventListener("blur", cancelGesture);
        window.addEventListener("keyup", keyUp);
        return () => {
            mounted.current = false;
            window.removeEventListener("blur", cancelGesture);
            window.removeEventListener("keyup", keyUp);
            clearPress();
            hideProgress();
            if (feedbackTimer.current !== null) {
                clearTimeout(feedbackTimer.current);
            }
        };
    }, [cancelGesture, clearPress, hideProgress, releaseShift]);

    return (
        <Button
            type="button"
            id="btn-reset"
            data-feedback={feedback}
            className="relative touch-none"
            disabled={disabled}
            aria-disabled={busy || feedback === "map-rewinding" || feedback.endsWith("pending") ||
                undefined}
            title="Clear pin and recentre. Hold Shift and press and hold to clear preferences (mobile: press and hold)."
            aria-label="Clear pin and recentre"
            aria-description="A short tap resets the map. To clear saved map size and navigation mode, hold this button for 600 milliseconds while holding Shift on desktop, or press and hold on mobile. Releasing a hold early cancels it."
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={(event) => {
                cancelGesture();
                if (blocked || pending.current || !event.isPrimary || event.button !== 0) {
                    return;
                }
                consumed.current = false;
                if (feedbackTimer.current !== null) {
                    clearTimeout(feedbackTimer.current);
                }
                setFeedback("idle");
                const requiresShift = event.pointerType !== "touch";
                if (requiresShift && !event.shiftKey) {
                    return;
                }
                press.current = {
                    id: event.pointerId,
                    x: event.clientX,
                    y: event.clientY,
                    requiresShift,
                    armed: true,
                    startedAt: performance.now(),
                };
                event.currentTarget.setPointerCapture(event.pointerId);
                showProgress();
                timer.current = setTimeout(() => {
                    timer.current = null;
                    if (!press.current?.armed) {
                        return;
                    }
                    hideProgress();
                    if (!latest.current.disabled) {
                        consumed.current = true;
                        clearPress();
                        reset(true);
                    }
                }, RESET_HOLD_MS);
            }}
            onPointerMove={(event) => {
                const from = press.current;
                if (from?.requiresShift && !event.shiftKey) {
                    releaseShift();
                }
                if (
                    from?.id === event.pointerId &&
                    Math.hypot(event.clientX - from.x, event.clientY - from.y) > 10
                ) {
                    cancelGesture();
                }
            }}
            onPointerUp={releasePress}
            onPointerCancel={cancelGesture}
            onLostPointerCapture={cancelGesture}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    if (event.shiftKey) {
                        event.preventDefault();
                    } else {
                        consumed.current = false;
                    }
                }
            }}
            onClick={(event) => {
                if (event.shiftKey || consumed.current) {
                    consumed.current = false;
                    event.preventDefault();
                    return;
                }
                reset(false);
            }}
        >
            <svg
                ref={ring}
                className="reset-hold-ring"
                viewBox="0 0 34 34"
                fill="none"
                stroke="currentColor"
                aria-hidden="true"
                focusable="false"
            >
                <path d={RESET_BORDER_PATH} opacity="0.2" />
                <path
                    ref={progress}
                    className="reset-hold-progress"
                    d={RESET_BORDER_PATH}
                    pathLength="100"
                    strokeDasharray="100"
                    strokeDashoffset="100"
                />
            </svg>
            <span
                ref={icon}
                className={`reset-icon ${feedback.endsWith("pending") ? "reset-icon-pending" : ""}`}
                style={{ animationDuration: `${RESET_HOLD_MS}ms` }}
            >
                {feedback === "map-done"
                    ? <Check className="reset-check" aria-hidden="true" />
                    : feedback === "preferences-done"
                    ? <Trash2 className="reset-trash" aria-hidden="true" />
                    : <RotateCcw aria-hidden="true" />}
            </span>
            <span className="sr-only" role="status" aria-live="polite">
                {feedback === "map-done"
                    ? "Map reset."
                    : feedback === "preferences-done"
                    ? "Preferences cleared."
                    : ""}
            </span>
        </Button>
    );
}
