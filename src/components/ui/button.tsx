import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon" | "touch";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:pointer-events-none disabled:opacity-50 select-none";
    
    const variants = {
      default: "bg-cyan-600 text-white hover:bg-cyan-500 shadow-sm",
      destructive: "bg-rose-600 text-white hover:bg-rose-500 shadow-sm",
      outline: "border border-slate-800 bg-transparent hover:bg-slate-800/60 text-slate-100",
      secondary: "bg-slate-800 text-slate-200 hover:bg-slate-700",
      ghost: "hover:bg-slate-800/60 text-slate-300 hover:text-white",
      link: "text-cyan-400 underline-offset-4 hover:underline",
    };

    const sizes = {
      default: "h-11 min-h-[44px] px-4 py-2",
      sm: "min-h-[44px] rounded-md px-3 py-1.5 text-xs",
      lg: "h-12 min-h-[48px] rounded-md px-8 text-base",
      icon: "h-11 w-11 min-h-[44px] min-w-[44px]",
      touch: "h-12 min-h-[48px] px-5 py-2.5",
    };

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
