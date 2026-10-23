"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/components/layout/workspace-context";
import { generateDynamicGreetingAction } from "@/actions/greeting-actions";
import {
  getGreetingTimeSlot,
  getFallbackGreeting,
} from "@/lib/greeting-utils";

export interface WorkspaceGreetingProps {
  user?: { name?: string | null } | null;
  session?: { user?: { name?: string | null } } | null;
  initialGreeting?: string;
  className?: string;
  as?: "h1" | "h2" | "div" | "span" | "p";
}

/**
 * WorkspaceGreeting Komponente für das Hero-Heading der Startseite.
 * - Liest den Vornamen des Nutzers (user?.name.split(' ')[0] ?? 'Kollege').
 * - Ermittelt das Zeitfenster anhand der Client-Uhrzeit (05-11h, 11-14h, 14-18h, 18-23h, 23-05h).
 * - Rendert für SSR sofort eine passende Fallback-Begrüßung (verhindert Layout-Shift & Hydration-Mismatch).
 * - Ruft clientseitig generateDynamicGreetingAction auf und blendet das Ergebnis sanft ein.
 * - Cached im sessionStorage (Key: maint_greeting_${date}_${shift}).
 */
export function WorkspaceGreeting({
  user,
  session,
  initialGreeting,
  className,
  as: Component = "h1",
}: WorkspaceGreetingProps) {
  // Kontext-Benutzer ermitteln, falls nicht explizit übergeben
  let contextUser: { name?: string } | null = null;
  try {
    const ws = useWorkspace();
    if (ws?.currentUser?.userName) {
      contextUser = { name: ws.currentUser.userName };
    }
  } catch {
    // Falls außerhalb des WorkspaceProviders gerendert
  }

  const effectiveUser = user ?? session?.user ?? contextUser;
  const firstName = effectiveUser?.name ? effectiveUser.name.split(" ")[0] ?? "Kollege" : "Kollege";

  // SSR / Initialzustand: Sofortige passende Begrüßung aus dem Fallback-Array
  const [greeting, setGreeting] = useState<string>(() => {
    if (initialGreeting) return initialGreeting;
    const initialSlot = getGreetingTimeSlot();
    return getFallbackGreeting(initialSlot, firstName);
  });

  const [isFading, setIsFading] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const now = new Date();
    const clientShift = getGreetingTimeSlot(now);
    const dateStr = now.toISOString().split("T")[0];
    const cacheKey = `maint_greeting_${dateStr}_${clientShift}`;

    // 1. Aus sessionStorage lesen
    try {
      const cached = window.sessionStorage?.getItem(cacheKey);
      if (cached) {
        if (cached !== greeting) {
          setIsFading(true);
          const timer = setTimeout(() => {
            setGreeting(cached);
            setIsFading(false);
          }, 150);
          return () => clearTimeout(timer);
        }
        return;
      }
    } catch (err) {
      console.warn("sessionStorage read failed:", err);
    }

    // 2. generateDynamicGreetingAction aufrufen
    let isCancelled = false;
    generateDynamicGreetingAction({
      name: firstName,
      shift: clientShift,
      timeSlot: clientShift,
    })
      .then((res) => {
        if (isCancelled || !res || !res.success || !res.greeting) return;

        const dynamicGreeting = res.greeting.trim();

        // 3. Im sessionStorage cachen
        try {
          window.sessionStorage?.setItem(cacheKey, dynamicGreeting);
        } catch (err) {
          console.warn("sessionStorage write failed:", err);
        }

        // 4. Sanft mit Fade-In-Transition aktualisieren
        setIsFading(true);
        setTimeout(() => {
          if (!isCancelled) {
            setGreeting(dynamicGreeting);
            setIsFading(false);
          }
        }, 150);
      })
      .catch((err) => {
        console.warn("generateDynamicGreetingAction failed:", err);
      });

    return () => {
      isCancelled = true;
    };
  }, [firstName]);

  return (
    <Component
      className={cn(
        "transition-opacity duration-300 ease-in-out",
        isFading ? "opacity-0" : "opacity-100",
        className
      )}
      suppressHydrationWarning
    >
      {greeting}
    </Component>
  );
}
