import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function PageCard({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5",
        className,
      )}
      {...props}
    />
  );
}

export function PageCardHeading({ className, ...props }: ComponentProps<"h1">) {
  return (
    <h1
      className={cn("min-w-0 break-words text-2xl font-extrabold tracking-tight", className)}
      {...props}
    />
  );
}
