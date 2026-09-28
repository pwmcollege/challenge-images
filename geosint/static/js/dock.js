import { setIcon } from "./dom.js";

export function installDock(el, onShow) {
    let dockSize = null;

    function setZoomed(zoomed) {
        el.dock.classList.toggle("zoomed", zoomed);
        el.expand.setAttribute("aria-pressed", String(zoomed));
        el.expand.title = zoomed ? "Restore map size" : "Zoom map";
        el.expand.setAttribute("aria-label", el.expand.title);
        setIcon(el.expand, zoomed ? "minimize-2" : "maximize-2");
    }

    function paintGrip() {
        const dock = getComputedStyle(el.dock);
        const border = parseFloat(dock.borderTopWidth);
        const gap = el.map.getBoundingClientRect().left - el.dock.getBoundingClientRect().left -
            border;
        const outer = parseFloat(dock.borderTopLeftRadius) - border;
        const inner = parseFloat(getComputedStyle(el.map).borderTopLeftRadius);
        const radius = (outer + inner) / 2;
        const centre = (outer + gap + inner) / 2;
        const arm = centre - radius;
        const tip = el.grip.clientWidth - 5;

        el.grip
            .querySelector("path")
            .setAttribute(
                "d",
                "M" +
                    tip +
                    " " +
                    arm +
                    " H" +
                    centre +
                    " A" +
                    radius +
                    " " +
                    radius +
                    " 0 0 0 " +
                    arm +
                    " " +
                    centre +
                    " V" +
                    tip,
            );
    }

    function dockBase() {
        if (!dockSize) {
            const pinned = el.dock.classList.contains("pinned");

            el.dock.classList.add("resizing", "pinned");
            dockSize = { width: el.dock.offsetWidth, height: el.map.offsetHeight };
            el.dock.classList.toggle("pinned", pinned);
            el.dock.classList.remove("resizing");
        }
        return dockSize;
    }

    function sizeDock(width, height) {
        const style = getComputedStyle(el.dock);
        const chrome = el.dock.offsetHeight - el.map.offsetHeight;
        const maxWidth = Math.max(1, window.innerWidth - 28);
        const maxHeight = Math.max(
            1,
            (window.visualViewport?.height || window.innerHeight) -
                14 -
                (parseFloat(style.bottom) || 14) -
                chrome,
        );
        const minWidth = Math.min(
            maxWidth,
            Math.max(220, parseFloat(style.getPropertyValue("--dock-w")) || 0),
        );
        const minHeight = Math.min(
            maxHeight,
            Math.max(150, parseFloat(style.getPropertyValue("--dock-h")) || 0),
        );

        dockSize = {
            width: Math.round(Math.min(Math.max(width, minWidth), maxWidth)),
            height: Math.round(Math.min(Math.max(height, minHeight), maxHeight)),
        };
        el.dock.style.setProperty("--dock-w-open", dockSize.width + "px");
        el.dock.style.setProperty("--dock-h-open", dockSize.height + "px");
    }

    function storeDockSize() {
        try {
            if (dockSize) {
                localStorage.setItem("map-size", dockSize.width + "x" + dockSize.height);
            } else {
                localStorage.removeItem("map-size");
            }
        } catch {
            return;
        }
    }

    function resetDock() {
        dockSize = null;
        el.dock.style.removeProperty("--dock-w-open");
        el.dock.style.removeProperty("--dock-h-open");
        storeDockSize();
    }

    function restoreDock() {
        let saved = "";

        try {
            saved = localStorage.getItem("map-size") || "";
        } catch {
            saved = "";
        }

        const parts = saved.split("x");

        if (
            parts.length === 2 &&
            parts.every((part) => {
                return Number.isFinite(Number(part)) && Number(part) > 0;
            })
        ) {
            sizeDock(Number(parts[0]), Number(parts[1]));
        }
    }

    function dragDock(event) {
        if (event.button !== 0 || !event.isPrimary) {
            return;
        }
        event.preventDefault();
        el.grip.focus({ preventScroll: true });

        const from = dockBase();
        const fromX = event.clientX;
        const fromY = event.clientY;
        const fromWidth = from.width;
        const fromHeight = from.height;

        el.dock.classList.add("pinned", "resizing");

        function move(next) {
            sizeDock(fromWidth + fromX - next.clientX, fromHeight + fromY - next.clientY);
        }

        function done() {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", done);
            window.removeEventListener("pointercancel", done);
            window.removeEventListener("blur", done);
            el.dock.classList.remove("pinned", "resizing");
            storeDockSize();
        }

        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", done);
        window.addEventListener("pointercancel", done);
        window.addEventListener("blur", done);
    }

    function nudgeDock(event) {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            resetDock();
            return;
        }
        const step = event.shiftKey ? 40 : 10;
        const wider = { ArrowLeft: step, ArrowRight: -step }[event.key] || 0;
        const taller = { ArrowUp: step, ArrowDown: -step }[event.key] || 0;

        if (!wider && !taller) {
            return;
        }
        event.preventDefault();

        const from = dockBase();

        sizeDock(from.width + wider, from.height + taller);
        storeDockSize();
    }

    function setMapVisible(visible) {
        el.dock.inert = !visible;
        document.body.classList.toggle("map-hidden", !visible);
        el.mapShow.hidden = visible;
        if (!visible) {
            el.mapShow.focus({ preventScroll: true });
        }
        if (visible) {
            onShow();
            el.mapHide.focus({ preventScroll: true });
        }
    }

    restoreDock();
    paintGrip();
    window.addEventListener("resize", () => {
        paintGrip();
        if (dockSize) {
            sizeDock(dockSize.width, dockSize.height);
        }
    });
    el.expand.addEventListener("click", () => {
        setZoomed(!el.dock.classList.contains("zoomed"));
    });
    el.grip.addEventListener("pointerdown", dragDock);
    el.grip.addEventListener("dblclick", resetDock);
    el.grip.addEventListener("keydown", nudgeDock);
    el.mapHide.addEventListener("click", () => {
        setMapVisible(false);
    });
    el.mapShow.addEventListener("click", () => {
        setMapVisible(true);
    });
}
