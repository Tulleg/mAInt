"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface BackButtonProps {
  fallbackUrl: string;
  label?: string;
  className?: string;
}

/**
 * Konsistenter Zurück-Button für Detailansichten nach docs/design-rules.md.
 * Mindestklickfläche min-h-[44px], Lucide ArrowLeft, variant="ghost".
 * Springt per `router.back()` zurück in der Browser-Historie
 * oder navigiert per Fallback auf die definierte Hauptliste.
 */
export function BackButton({
  fallbackUrl,
  label = "Zurück",
  className,
}: BackButtonProps) {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1 && document.referrer && document.referrer.includes(window.location.host)) {
      router.back();
    } else {
      router.push(fallbackUrl);
    }
  };

  return (
    <Button
      variant="ghost"
      onClick={handleBack}
      className={cn(
        "min-h-[44px] text-slate-300 hover:text-white hover:bg-slate-800/80 -ml-1 px-3 py-2 text-sm font-medium inline-flex items-center gap-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500",
        className
      )}
      title={`${label} (oder Zurück zur Übersicht)`}
    >
      <ArrowLeft className="h-4 w-4 mr-2 shrink-0" />
      <span>{label}</span>
    </Button>
  );
}
