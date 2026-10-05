import { PinchGesture, type UserPinchConfig, WheelGesture } from "@use-gesture/vanilla";

export interface GestureAdapter {
    glide?: boolean;
    rubberband?: UserPinchConfig["rubberband"];
    input?(): void;
    fromScale(): [number, number];
    scaleBounds: NonNullable<UserPinchConfig["scaleBounds"]>;
    pan(dx: number, dy: number, speed: number): void;
    zoom(scale: number, origin: [number, number]): void;
}

export interface Navigation {
    panMode(): boolean;
    setPanMode(pan: boolean): void;
    onModeChange(listener: (pan: boolean) => void): () => void;
    gestureControls(node: HTMLElement, adapter: GestureAdapter): () => void;
}

export function createNavigation(): Navigation {
    let mode: string | undefined;
    const listeners = new Set<(pan: boolean) => void>();

    function panMode() {
        if (!mode) {
            try {
                mode = localStorage.getItem("pano-nav") || "pan";
            } catch {
                mode = "pan";
            }
        }
        return mode === "pan";
    }

    function setPanMode(pan: boolean) {
        mode = pan ? "pan" : "zoom";
        listeners.forEach((listener) => listener(pan));
        try {
            localStorage.setItem("pano-nav", mode);
        } catch {
            return;
        }
    }

    function onModeChange(listener: (pan: boolean) => void) {
        listeners.add(listener);
        listener(panMode());
        return () => {
            listeners.delete(listener);
        };
    }

    function gestureControls(node: HTMLElement, adapter: GestureAdapter) {
        let frame: number | null = null;
        let velocityX = 0;
        let velocityY = 0;
        let cancelingPinch = false;
        let disposed = false;

        function stop() {
            if (frame !== null) {
                cancelAnimationFrame(frame);
            }
            frame = null;
            velocityX = 0;
            velocityY = 0;
        }

        function glide() {
            velocityX *= 0.9;
            velocityY *= 0.9;
            if (Math.abs(velocityX) < 0.02 && Math.abs(velocityY) < 0.02) {
                stop();
                return;
            }
            adapter.pan(velocityX, velocityY, Math.hypot(velocityX, velocityY));
            frame = requestAnimationFrame(glide);
        }

        const wheel = new WheelGesture(
            node,
            (state) => {
                if (!panMode() || !state.event || state.event.ctrlKey) {
                    return;
                }
                state.event.preventDefault();
                if (state.last) {
                    if (adapter.glide && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
                        velocityX = -state.velocity[0] * state.direction[0] * 6;
                        velocityY = -state.velocity[1] * state.direction[1] * 6;
                        if (frame === null) {
                            frame = requestAnimationFrame(glide);
                        }
                    }
                    return;
                }
                stop();
                adapter.pan(
                    -state.delta[0],
                    -state.delta[1],
                    Math.hypot(state.delta[0], state.delta[1]),
                );
            },
            { eventOptions: { passive: false } },
        );

        const pinch = new PinchGesture(
            node,
            (state) => {
                if (
                    disposed || !panMode() || !state.event ||
                    !["wheel", "gesturestart", "gesturechange", "gestureend"].includes(
                        state.event.type,
                    )
                ) {
                    return;
                }
                state.event.preventDefault();
                if (state.event.type !== "wheel") {
                    adapter.input?.();
                }
                if (state.first) {
                    stop();
                    cancelingPinch = false;
                }
                if (state.last) {
                    cancelingPinch = false;
                }
                if (cancelingPinch) {
                    return;
                }
                const scale = state.offset[0];
                if (!Number.isFinite(scale) || scale <= 0) {
                    // Wheel rubberbanding can cross zero; cancellation snaps back to bounds.
                    cancelingPinch = true;
                    state.cancel();
                    return;
                }
                adapter.zoom(scale, state.origin);
            },
            {
                eventOptions: { passive: false },
                from: adapter.fromScale,
                scaleBounds: adapter.scaleBounds,
                ...(adapter.rubberband === undefined ? {} : { rubberband: adapter.rubberband }),
            },
        );
        const unsubscribe = onModeChange(stop);

        return () => {
            disposed = true;
            stop();
            wheel.destroy();
            pinch.destroy();
            unsubscribe();
        };
    }

    return { panMode, setPanMode, onModeChange, gestureControls };
}
