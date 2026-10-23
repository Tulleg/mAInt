"use client";

import { useEffect, useRef } from "react";

/**
 * Custom Hook für regelmäßiges Polling (Auto-Refresh).
 * Garantiert sauberes Aufräumen (clearInterval) beim Unmounten
 * und verhindert Ausführungen auf bereits unmounteten Komponenten.
 * 
 * @param callback Auszuführende Funktion
 * @param delay Intervall in Millisekunden (oder null/0 zum Deaktivieren)
 */
export function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback);
  const isMountedRef = useRef(true);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    isMountedRef.current = true;

    if (delay === null || delay <= 0) {
      return;
    }

    const tick = () => {
      if (isMountedRef.current && savedCallback.current) {
        savedCallback.current();
      }
    };

    const intervalId = setInterval(tick, delay);

    return () => {
      isMountedRef.current = false;
      clearInterval(intervalId);
    };
  }, [delay]);
}
