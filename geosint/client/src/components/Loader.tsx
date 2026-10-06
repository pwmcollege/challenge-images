import type { LoadingState } from "../lib/media.ts";

export default function Loader({ title, detail, progress, done, error }: LoadingState) {
    return (
        <div
            id="loader"
            className={`absolute left-1/2 top-1/2 z-600 w-80 max-w-loader -translate-x-1/2 -translate-y-1/2 rounded-lg border border-solid border-hairline bg-material px-4.5 py-4 shadow-control glass transition-opacity duration-300 ease-control ${
                done ? "pointer-events-none opacity-0" : "opacity-100"
            }`}
            role="status"
            aria-live="polite"
            aria-hidden={done ? "true" : undefined}
        >
            <div className="flex items-center gap-3">
                <div
                    className={`size-4.5 shrink-0 rounded-full border-2 border-solid ${
                        error ? "border-bad" : "border-separator border-t-accent"
                    } ${done || error ? "animate-none" : "animate-loader-spin"}`}
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
                <div
                    id="loader-bar"
                    className={`h-full rounded-full transition-width ${
                        error
                            ? "w-full bg-bad"
                            : progress === null
                            ? "w-2/5 bg-accent"
                            : "w-0 bg-accent"
                    } ${
                        progress === null && !error && !done
                            ? "animate-loader-sweep"
                            : "animate-none"
                    }`}
                    style={progress === null ? undefined : { width: `${progress}%` }}
                />
            </div>
        </div>
    );
}
