import type { LoadingState } from "../lib/media.ts";

export default function Loader({ title, detail, progress, done, error }: LoadingState) {
    return (
        <div
            id="loader"
            className={done ? "done" : error ? "failed" : ""}
            role="status"
            aria-live="polite"
            aria-hidden={done ? "true" : undefined}
        >
            <div className="loader-panel">
                <div className="loader-spinner" aria-hidden="true" />
                <div className="loader-lines">
                    <div className="loader-title" id="loader-title">{title}</div>
                    <div className="loader-detail" id="loader-detail">{detail}</div>
                </div>
            </div>
            <div className="loader-track">
                <div
                    id="loader-bar"
                    className={`loader-bar${progress === null && !error ? " indeterminate" : ""}`}
                    style={progress === null ? undefined : { width: `${progress}%` }}
                />
            </div>
        </div>
    );
}
