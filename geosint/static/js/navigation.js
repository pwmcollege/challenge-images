import { PinchGesture, WheelGesture } from "../vendor/use-gesture/use-gesture.mjs";
import { setIcon } from "./dom.js";

export function createNavigation() {
    const panGlide = 6;
    const panFriction = 0.9;
    let navMode = null;
    const modeListeners = [];

    function panMode() {
        if (navMode === null) {
            try {
                navMode = localStorage.getItem("pano-nav") || "pan";
            } catch {
                navMode = "pan";
            }
        }
        return navMode === "pan";
    }

    function setPanMode(next) {
        navMode = next ? "pan" : "zoom";
        modeListeners.forEach((listener) => {
            listener(panMode());
        });
        try {
            localStorage.setItem("pano-nav", navMode);
        } catch {
            return;
        }
    }

    function onModeChange(listener) {
        modeListeners.push(listener);
        listener(panMode());
    }

    function glide(step, friction) {
        let vx = 0;
        let vy = 0;
        let frame = null;

        function run() {
            vx *= friction;
            vy *= friction;

            if (Math.abs(vx) < 0.02 && Math.abs(vy) < 0.02) {
                frame = null;
                return;
            }

            step(vx, vy);
            frame = requestAnimationFrame(run);
        }

        return {
            stop() {
                vx = 0;
                vy = 0;
            },
            launch(x, y) {
                vx = x;
                vy = y;
                if (frame === null) {
                    frame = requestAnimationFrame(run);
                }
            },
        };
    }

    function installModeToggle(button) {
        function paint() {
            button.setAttribute("aria-pressed", String(panMode()));
            button.title = panMode() ? "Scroll pans, pinch zooms" : "Scroll zooms";
            setIcon(button, panMode() ? "hand" : "mouse");
        }

        button.addEventListener("click", () => {
            setPanMode(!panMode());
            paint();
        });

        paint();
    }

    function gestureControls(node, adapter) {
        const drift = adapter.glide ? glide(adapter.pan, panFriction) : { stop() {}, launch() {} };

        new WheelGesture(
            node,
            (state) => {
                if (!panMode() || !state.event || state.event.ctrlKey) {
                    return;
                }

                state.event.preventDefault();

                if (state.last) {
                    drift.launch(
                        -state.velocity[0] * state.direction[0] * panGlide,
                        -state.velocity[1] * state.direction[1] * panGlide,
                    );
                    return;
                }

                drift.stop();
                adapter.pan(
                    -state.delta[0],
                    -state.delta[1],
                    Math.hypot(state.delta[0], state.delta[1]),
                );
            },
            { eventOptions: { passive: false } },
        );

        new PinchGesture(
            node,
            (state) => {
                if (
                    !panMode() ||
                    !state.event ||
                    !["wheel", "gesturestart", "gesturechange", "gestureend"].includes(
                        state.event.type,
                    )
                ) {
                    return;
                }

                state.event.preventDefault();

                if (adapter.input && state.event.type !== "wheel") {
                    adapter.input();
                }

                if (state.first) {
                    drift.stop();
                }

                adapter.zoom(state.offset[0], state.origin);
            },
            {
                eventOptions: { passive: false },
                from: adapter.fromScale,
                scaleBounds: adapter.scaleBounds,
                rubberband: adapter.rubberband,
            },
        );
    }

    return { panMode, onModeChange, installModeToggle, gestureControls };
}
