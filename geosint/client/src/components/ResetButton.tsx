import { useState } from "react";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { RotateCcw } from "lucide-react";
import Button from "./Button.tsx";

interface ResetButtonProps {
    disabled: boolean;
    busy: boolean;
    onReset(): Promise<boolean>;
}

export default function ResetButton({ disabled, busy, onReset }: ResetButtonProps) {
    const [pending, setPending] = useState(false);
    const [spinCount, setSpinCount] = useState(0);
    const [status, setStatus] = useState("");
    const reducedMotion = useReducedMotion();

    return (
        <Button
            type="button"
            id="btn-reset"
            className="aria-disabled:opacity-45"
            disabled={disabled}
            aria-disabled={busy || pending || undefined}
            title="Clear pin and recentre"
            aria-label="Clear pin and recentre"
            aria-busy={pending}
            onClick={async () => {
                if (disabled || busy || pending) {
                    return;
                }

                setPending(true);
                setSpinCount((count) => count + 1);
                setStatus("Resetting map.");

                try {
                    setStatus(await onReset() ? "Map reset." : "Map could not be reset.");
                } finally {
                    setPending(false);
                }
            }}
        >
            <m.span
                key={spinCount}
                className="inline-flex"
                initial={{ rotate: 0 }}
                animate={{ rotate: spinCount > 0 && !reducedMotion ? -360 : 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.45, ease: "easeOut" }}
            >
                <RotateCcw aria-hidden="true" />
            </m.span>
            <span className="sr-only" role="status" aria-live="polite">{status}</span>
        </Button>
    );
}
