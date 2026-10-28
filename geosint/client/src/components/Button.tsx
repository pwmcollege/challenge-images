import type { ComponentProps } from "react";

type ButtonProps = ComponentProps<"button"> & {
    variant?: "icon" | "bare" | "tinted" | "wrong" | "solved";
};

export default function Button({
    variant = "icon",
    className = "",
    disabled,
    ...props
}: ButtonProps) {
    return (
        <button
            {...props}
            disabled={disabled}
            className={`inline-flex items-center justify-center gap-1.75 font-semibold ${
                variant === "bare"
                    ? "border-0 border-none bg-transparent p-0 transition-background"
                    : variant === "icon"
                      ? "size-control rounded-md border border-solid border-hairline bg-material p-0 text-foreground shadow-control glass transition-background enabled:hover:bg-material-strong disabled:opacity-45"
                      : `rounded-md border border-solid px-4.5 py-0 h-control shadow-control glass transition-background enabled:hover:text-ink focus-visible:text-ink disabled:opacity-45 ${
                            variant === "wrong"
                                ? "border-bad/35 bg-bad/10 text-bad enabled:hover:bg-bad focus-visible:bg-bad"
                                : variant === "solved"
                                  ? "border-good/35 bg-good/10 text-good enabled:hover:bg-good focus-visible:bg-good"
                                  : "border-accent/35 bg-accent/10 text-accent enabled:hover:bg-accent focus-visible:bg-accent"
                        }`
            } ${className}`}
        />
    );
}
