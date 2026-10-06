import type { ComponentProps } from "react";

type ButtonProps = ComponentProps<"button"> & {
    variant?: "icon" | "bare" | "primary" | "wrong" | "solved";
};

export default function Button(
    { variant = "icon", className = "", disabled, ...props }: ButtonProps,
) {
    return (
        <button
            {...props}
            disabled={disabled}
            className={`inline-flex items-center justify-center gap-1.75 font-semibold ${
                variant === "bare"
                    ? "border-0 border-none bg-transparent p-0 transition-background"
                    : variant === "icon"
                    ? "size-control rounded-md border border-solid border-hairline bg-material p-0 text-foreground shadow-control glass transition-background enabled:hover:bg-material-strong disabled:opacity-45"
                    : `h-9.5 rounded-md border border-solid px-4.5 py-0 transition-filter enabled:hover:brightness-108 ${
                        variant === "wrong"
                            ? "border-transparent bg-bad text-ink"
                            : variant === "solved"
                            ? "border-transparent bg-good text-ink"
                            : disabled
                            ? "border-hairline bg-material text-muted glass"
                            : "border-transparent bg-accent text-ink"
                    }`
            } ${className}`}
        />
    );
}
