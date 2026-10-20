import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "bg-blue-900/60 text-blue-200 border-blue-700/50",
    secondary: "bg-neutral-800 text-neutral-300 border-neutral-700",
    destructive: "bg-red-950/60 text-red-300 border-red-800/50",
    outline: "text-neutral-300 border-neutral-700",
    success: "bg-emerald-950/60 text-emerald-300 border-emerald-800/50",
    warning: "bg-amber-950/60 text-amber-300 border-amber-800/50",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
