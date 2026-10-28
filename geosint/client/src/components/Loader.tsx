import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import type { LoadingState } from "../lib/media.ts";

export default function Loader({ title, detail, progress, done, error }: LoadingState) {
    const reducedMotion = useReducedMotion();
    const active = !done && !error && !reducedMotion;

    return (
        <m.div
            id="loader"
            initial={false}
            animate={{ opacity: done ? 0 : 1 }}
            transition={{ duration: reducedMotion ? 0 : 0.3 }}
            className={`absolute left-1/2 top-1/2 z-600 w-80 max-w-loader -translate-x-1/2 -translate-y-1/2 rounded-lg border border-solid border-hairline bg-material px-4.5 py-4 shadow-control glass ${done ? "pointer-events-none" : ""}`}
            role="status"
            aria-live="polite"
            aria-hidden={done ? "true" : undefined}
        >
            <div className="flex items-center gap-3">
                <m.div
                    className={`size-4.5 shrink-0 rounded-full border-2 border-solid ${error ? "border-bad" : "border-separator border-t-accent"}`}
                    animate={{ rotate: active ? 360 : 0 }}
                    transition={active ? { duration: 0.8, ease: "linear", repeat: Infinity } : { duration: 0 }}
                    aria-hidden="true"
                />
                <div className="min-w-0">
                    <div className="font-semibold tracking-control" id="loader-title">{title}</div>
                    <div className="mt-px text-caption text-muted tabular-nums" id="loader-detail">
                        {detail}
                    </div>
                </div>
            </div>
            <div className="mt-3.5 h-1 overflow-hidden rounded-full bg-separator">
                <m.div
                    id="loader-bar"
                    className={`h-full rounded-full ${error ? "bg-bad" : "bg-accent"}`}
                    initial={false}
                    animate={{ width: error ? "100%" : `${progress ?? 40}%`, x: progress === null && active ? ["-110%", "310%"] : "0%" }}
                    transition={{ width: { duration: reducedMotion ? 0 : 0.2 }, x: progress === null && active ? { duration: 1.1, ease: "easeInOut", repeat: Infinity } : { duration: 0 } }}
                />
            </div>
        </m.div>
    );
}
