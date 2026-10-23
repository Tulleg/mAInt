import * as React from "react";
import { cn } from "@/lib/utils";
import { Flame, AlertTriangle, Clock, CheckCircle2, Database, Laptop } from "lucide-react";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?:
    | "default"
    | "secondary"
    | "destructive"
    | "outline"
    | "success"
    | "warning"
    | "prio1"
    | "prio2"
    | "prio3"
    | "prio4"
    | "statusNew"
    | "statusInProgress"
    | "statusCompleted"
    | "sap"
    | "local";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "bg-blue-950/60 text-blue-300 border-blue-700",
    secondary: "bg-slate-800 text-slate-300 border-slate-700",
    destructive: "bg-rose-950/70 text-rose-300 border-rose-700",
    outline: "text-slate-300 border-slate-700",
    success: "bg-emerald-950/60 text-emerald-300 border-emerald-700",
    warning: "bg-amber-950/60 text-amber-300 border-amber-700",
    // Design-Rules 2.2 Standard-Tokens:
    prio1: "bg-rose-950/70 border-rose-700 text-rose-300",
    prio2: "bg-amber-950/70 border-amber-700 text-amber-300",
    prio3: "bg-slate-800 border-slate-700 text-slate-300",
    prio4: "bg-slate-800 border-slate-700 text-slate-300",
    statusNew: "bg-blue-950/60 border-blue-700 text-blue-300",
    statusInProgress: "bg-amber-950/60 border-amber-700 text-amber-300",
    statusCompleted: "bg-emerald-950/60 border-emerald-700 text-emerald-300",
    sap: "bg-indigo-950/60 border-indigo-700 text-indigo-300",
    local: "bg-slate-800/80 border-slate-600 text-slate-300",
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

/**
 * Standardisierter Priority-Badge gemäß Designregeln Kapitel 2.2
 */
export function PriorityBadge({
  priority,
  className,
  showIcon = true,
}: {
  priority?: string | null;
  className?: string;
  showIcon?: boolean;
}) {
  const prio = (priority || "").toUpperCase();

  if (prio === "1_EMERGENCY" || prio.includes("EMERGENCY") || prio === "1" || prio.includes("NOTFALL")) {
    return (
      <Badge variant="prio1" className={cn("gap-1 font-semibold", className)}>
        {showIcon && <Flame className="h-3 w-3 text-rose-300 shrink-0" />}
        <span>Notfall / Prio 1</span>
      </Badge>
    );
  }

  if (prio === "2_HIGH" || prio.includes("HIGH") || prio === "2" || prio.includes("HOCH") || prio.includes("DRINGEND")) {
    return (
      <Badge variant="prio2" className={cn("gap-1 font-medium", className)}>
        {showIcon && <AlertTriangle className="h-3 w-3 text-amber-300 shrink-0" />}
        <span>Hoch / Prio 2</span>
      </Badge>
    );
  }

  if (prio === "3_MEDIUM" || prio.includes("MEDIUM") || prio === "3" || prio.includes("MITTEL")) {
    return (
      <Badge variant="prio3" className={cn("font-medium", className)}>
        <span>Mittel / Prio 3</span>
      </Badge>
    );
  }

  return (
    <Badge variant="prio4" className={cn("font-medium", className)}>
      <span>Niedrig / Prio 4</span>
    </Badge>
  );
}

/**
 * Standardisierter Status-Badge gemäß Designregeln Kapitel 2.2
 */
export function StatusBadge({
  statusCode,
  statusName,
  className,
  showIcon = true,
}: {
  statusCode?: string | null;
  statusName?: string | null;
  className?: string;
  showIcon?: boolean;
}) {
  const code = (statusCode || "").toUpperCase();
  const label = statusName || statusCode || "Offen";

  if (
    code === "IN_PROGRESS" ||
    code === "IN_WORK" ||
    code === "IN ARBEIT" ||
    code === "WORKING"
  ) {
    return (
      <Badge variant="statusInProgress" className={cn("gap-1 font-semibold", className)}>
        {showIcon && <Clock className="h-3 w-3 text-amber-300 shrink-0" />}
        <span>{label}</span>
      </Badge>
    );
  }

  if (
    code === "TABG" ||
    code === "TECH_COMPLETED" ||
    code === "COMPLETED" ||
    code === "CLOSED" ||
    code.includes("ABGESCHLOSSEN")
  ) {
    return (
      <Badge variant="statusCompleted" className={cn("gap-1 font-semibold", className)}>
        {showIcon && <CheckCircle2 className="h-3 w-3 text-emerald-300 shrink-0" />}
        <span>{label}</span>
      </Badge>
    );
  }

  // Fallback / Neu / Erfasst
  return (
    <Badge variant="statusNew" className={cn("font-medium", className)}>
      <span>{label}</span>
    </Badge>
  );
}

/**
 * Standardisierter Herkunfts-Badge gemäß Designregeln Kapitel 2.2
 */
export function OriginBadge({
  isSap,
  origin,
  className,
}: {
  isSap?: boolean;
  origin?: "SAP" | "LOCAL" | string;
  className?: string;
}) {
  const isSapManaged = isSap || origin === "SAP" || origin === "ERP";

  if (isSapManaged) {
    return (
      <Badge variant="sap" className={cn("gap-1 font-mono text-[10px]", className)}>
        <Database className="h-2.5 w-2.5 text-indigo-300" />
        <span>SAP PM</span>
      </Badge>
    );
  }

  return (
    <Badge variant="local" className={cn("gap-1 text-[10px]", className)}>
      <Laptop className="h-2.5 w-2.5 text-slate-300" />
      <span>Lokal</span>
    </Badge>
  );
}
