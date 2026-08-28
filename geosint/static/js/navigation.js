import {
    PinchGesture,
    WheelGesture,
} from "../vendor/use-gesture/use-gesture.mjs";
import { setIcon } from "./dom.js";

const panGlide = 6;

const panFriction = 0.9;

let navMode = null;

export function panMode() {
    if (navMode === null) {
        try {
            navMode = localStorage.getItem("pano-nav") || "pan";
        } catch (error) {
            navMode = "pan";
        }
    }
    return navMode === "pan";
}

function setPanMode(next) {
    navMode = next ? "pan" : "zoom";
    try {
        localStorage.setItem("pano-nav", navMode);
    } catch (error) {
        return;
    }
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
        stop: function () {
            vx = 0;
            vy = 0;
        },
        launch: function (x, y) {
            vx = x;
            vy = y;
            if (frame === null) {
                frame = requestAnimationFrame(run);
            }
        },
    };
}

export function installModeToggle() {
    const button = document.getElementById("btn-mode");

    function paint() {
        button.setAttribute("aria-pressed", String(panMode()));
        button.title = panMode()
            ? "Scroll pans, pinch zooms"
            : "Scroll zooms";
        setIcon(button, panMode() ? "hand" : "mouse");
    }

    button.addEventListener("click", function () {
        setPanMode(!panMode());
        paint();
    });

    paint();
}

export function gestureControls(node, adapter) {
    const drift = adapter.glide
        ? glide(adapter.pan, panFriction)
        : { stop: function () {}, launch: function () {} };

    new WheelGesture(
        node,
        function (state) {
            if (!panMode() || !state.event || state.event.ctrlKey) {
                return;
            }

            state.event.preventDefault();

            if (state.last) {
                if (adapter.panEnd) {
                    adapter.panEnd(
                        state.velocity[0] * state.direction[0] * 1000,
                        state.velocity[1] * state.direction[1] * 1000,
                    );
                }
                drift.launch(
                    -state.velocity[0] * state.direction[0] * panGlide,
                    -state.velocity[1] * state.direction[1] * panGlide,
                );
                return;
            }

            if (state.first && adapter.panStart) {
                adapter.panStart();
            }

            drift.stop();
            adapter.pan(-state.delta[0], -state.delta[1]);
        },
        { eventOptions: { passive: false } },
    );

    new PinchGesture(
        node,
        function (state) {
            if (!panMode() || !state.event) {
                return;
            }

            state.event.preventDefault();

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
