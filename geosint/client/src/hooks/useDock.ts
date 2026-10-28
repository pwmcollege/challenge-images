import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, RefObject } from "react";
import { flushSync } from "react-dom";
import type { MotionStyle } from "motion/react";

interface DockSize {
    width: number;
    height: number;
}

interface DockOptions {
    dockRef: RefObject<HTMLElement | null>;
    mapRef: RefObject<HTMLDivElement | null>;
    gripRef: RefObject<HTMLDivElement | null>;
    hideRef: RefObject<HTMLButtonElement | null>;
    showRef: RefObject<HTMLButtonElement | null>;
    ready: boolean;
    onShow: () => void;
}

export function useDock({
    dockRef,
    mapRef,
    gripRef,
    hideRef,
    showRef,
    ready,
    onShow,
}: DockOptions) {
    const [visible, setVisible] = useState(true);
    const [zoomed, setZoomed] = useState(false);
    const [resizing, setResizing] = useState(false);
    const [size, setSize] = useState<DockSize | null>(null);
    const [side, setSide] = useState<"left" | "right">(() => {
        try {
            return localStorage.getItem("map-side") === "left" ? "left" : "right";
        } catch {
            return "right";
        }
    });
    const sizeRef = useRef<DockSize | null>(null);
    const dragCleanup = useRef<(() => void) | null>(null);

    function changeSide(next: "left" | "right") {
        setSide(next);

        try {
            localStorage.setItem("map-side", next);
        } catch {
            return;
        }
    }

    const sizeDock = useCallback(
        (width: number, height: number) => {
            const dock = dockRef.current;
            const map = mapRef.current;

            if (!dock || !map) {
                return;
            }

            const style = getComputedStyle(dock);
            const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
            const edge = 0.875 * rem;
            const chrome = dock.offsetHeight - map.offsetHeight;
            const maxWidth = Math.max(1, window.innerWidth - edge * 2);
            const maxHeight = Math.max(
                1,
                (window.visualViewport?.height || window.innerHeight) -
                    edge -
                    (parseFloat(style.bottom) || edge) -
                    chrome,
            );
            const minWidth = Math.min(
                maxWidth,
                Math.max(13.75, parseFloat(style.getPropertyValue("--dock-w")) || 0) * rem,
            );
            const minHeight = Math.min(
                maxHeight,
                Math.max(9.375, parseFloat(style.getPropertyValue("--dock-h")) || 0) * rem,
            );
            sizeRef.current = {
                width: Math.round(Math.min(Math.max(width, minWidth), maxWidth)),
                height: Math.round(Math.min(Math.max(height, minHeight), maxHeight)),
            };
            setSize(sizeRef.current);
        },
        [dockRef, mapRef],
    );

    function storeSize() {
        try {
            if (sizeRef.current) {
                localStorage.setItem(
                    "map-size",
                    sizeRef.current.width + "x" + sizeRef.current.height,
                );
            } else {
                localStorage.removeItem("map-size");
            }
        } catch {
            return;
        }
    }

    function resetSize() {
        if (!ready) {
            return;
        }

        sizeRef.current = null;
        setSize(null);
        storeSize();
    }

    function dockBase() {
        if (!sizeRef.current) {
            const dock = dockRef.current;
            const map = mapRef.current;

            if (!dock || !map) {
                return null;
            }

            flushSync(() => setResizing(true));
            sizeRef.current = {
                width: dock.offsetWidth,
                height: map.offsetHeight,
            };
            flushSync(() => setResizing(false));
        }

        return sizeRef.current;
    }

    function startResize(event: ReactPointerEvent<HTMLDivElement>) {
        if (!ready || event.button !== 0 || !event.isPrimary) {
            return;
        }

        event.preventDefault();
        gripRef.current?.focus({ preventScroll: true });
        dragCleanup.current?.();
        const from = dockBase();

        if (!from) {
            return;
        }

        const fromX = event.clientX;
        const fromY = event.clientY;
        const fromWidth = from.width;
        const fromHeight = from.height;
        setResizing(true);

        function move(next: PointerEvent) {
            sizeDock(
                fromWidth + (next.clientX - fromX) * (side === "left" ? 1 : -1),
                fromHeight + fromY - next.clientY,
            );
        }

        function cleanup() {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", done);
            window.removeEventListener("pointercancel", done);
            window.removeEventListener("blur", done);
            dragCleanup.current = null;
        }

        function done() {
            cleanup();
            setResizing(false);
            storeSize();
        }

        dragCleanup.current = cleanup;
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", done);
        window.addEventListener("pointercancel", done);
        window.addEventListener("blur", done);
    }

    function nudgeSize(event: KeyboardEvent<HTMLDivElement>) {
        if (!ready) {
            return;
        }

        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            resetSize();

            return;
        }

        const step = event.shiftKey ? 40 : 10;
        const wider =
            (event.key === "ArrowLeft" ? step : event.key === "ArrowRight" ? -step : 0) *
            (side === "left" ? -1 : 1);
        const taller = event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0;

        if (!wider && !taller) {
            return;
        }

        event.preventDefault();
        const from = dockBase();

        if (!from) {
            return;
        }

        sizeDock(from.width + wider, from.height + taller);
        storeSize();
    }

    function show(visible: boolean) {
        if (!ready) {
            return;
        }

        flushSync(() => setVisible(visible));

        if (visible) {
            onShow();
            hideRef.current?.focus({ preventScroll: true });
        } else {
            showRef.current?.focus({ preventScroll: true });
        }
    }

    useLayoutEffect(() => {
        let saved = "";

        try {
            saved = localStorage.getItem("map-size") || "";
        } catch {
            saved = "";
        }

        const parts = saved.split("x");

        if (
            parts.length === 2 &&
            parts.every((part) => Number.isFinite(Number(part)) && Number(part) > 0)
        ) {
            sizeDock(Number(parts[0]), Number(parts[1]));
        }

        function resize() {
            if (sizeRef.current) {
                sizeDock(sizeRef.current.width, sizeRef.current.height);
            }
        }

        window.addEventListener("resize", resize);

        return () => {
            window.removeEventListener("resize", resize);
            dragCleanup.current?.();
        };
    }, [dockRef, mapRef, sizeDock]);

    const style: (MotionStyle & Record<"--dock-w-open" | "--dock-h-open", string>) | undefined =
        size
            ? { "--dock-w-open": size.width + "px", "--dock-h-open": size.height + "px" }
            : undefined;

    return {
        side,
        changeSide,
        size,
        visible,
        zoomed,
        className: [zoomed && "zoomed", resizing && "pinned resizing"].filter(Boolean).join(" "),
        style,
        startResize,
        nudgeSize,
        resetSize,
        resetPreferences() {
            if (!ready) {
                return;
            }

            resetSize();
            setSide("right");
            setZoomed(false);

            try {
                localStorage.removeItem("map-side");
            } catch {
                return;
            }
        },
        toggleZoom: () => ready && setZoomed((value) => !value),
        hide: () => show(false),
        show: () => show(true),
    };
}
