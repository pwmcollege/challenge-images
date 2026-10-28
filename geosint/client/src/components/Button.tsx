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
                      : `rounded-md border border-solid px-4.5 py-0 h-control text-ink shadow-control glass transition-background disabled:border-hairline disabled:bg-material disabled:text-muted ${
                            variant === "wrong"
                                ? "border-bad/35 bg-bad/70 enabled:hover:bg-bad/90 focus-visible:bg-bad/90"
                                : variant === "solved"
                                  ? "border-good/35 bg-good/70 enabled:hover:bg-good/90 focus-visible:bg-good/90"
                                  : "border-accent/35 bg-accent/70 enabled:hover:bg-accent/90 focus-visible:bg-accent/90"
                        }`
            } ${className}`}
        />
    );
}
