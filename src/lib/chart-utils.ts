import type { ClarificationOption } from "@/lib/ai/copilot";

export const DEFAULT_PALETTE = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
];

export const DEFAULT_CHART_COLORS = [
  ...DEFAULT_PALETTE,
  "#14B8A6",
  "#F97316",
];

/**
 * Formatiert Zahlenwerte für Diagramm-Tooltips im deutschen Zahlenformat (de-DE)
 * und hängt die passende Einheit an (" Min.", " Std.", " €", " Stk.").
 */
export function formatChartTooltipValue(
  val: any,
  unit?: string,
  metricName?: string
): string {
  if (typeof val !== "number") return String(val ?? "");
  const formatted = val.toLocaleString("de-DE", { maximumFractionDigits: 1 });
  if (unit) return `${formatted} ${unit}`.trim();
  const label = (metricName || "").toLowerCase();
  if (
    label.includes("kosten") ||
    label.includes("preis") ||
    label.includes("euro") ||
    label.includes("€")
  ) {
    return `${formatted} €`;
  }
  if (
    label.includes("stk") ||
    label.includes("anzahl") ||
    label.includes("menge") ||
    label.includes("count") ||
    label.includes("stücke")
  ) {
    return `${formatted} Stk.`;
  }
  if (
    label.includes("ausfall") ||
    label.includes("stunde") ||
    label.includes("hours") ||
    label.includes("dauer") ||
    /\b(h|std|stunden|hours)\b/i.test(label) ||
    label.includes("(h)")
  ) {
    return `${formatted} Std.`;
  }
  if (label.includes("minute") || label.includes("min")) {
    return `${formatted} Min.`;
  }
  return formatted;
}

/**
 * Berechnet eine lineare Regressions-Trendlinie über die primäre Kennzahl,
 * falls der Datensatz noch kein explizites 'trend'-Feld enthält.
 */
export function ensureTrendData(data: any[], primaryKey: string = "hours"): any[] {
  if (!data || data.length === 0) return [];
  const hasExistingTrend = data.some((d) => typeof d.trend === "number");
  if (hasExistingTrend) return data;

  const n = data.length;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumXX = 0;
  data.forEach((d, i) => {
    const y =
      typeof d[primaryKey] === "number"
        ? d[primaryKey]
        : typeof d.value === "number"
        ? d.value
        : typeof d.wert === "number"
        ? d.wert
        : 0;
    sumX += i;
    sumY += y;
    sumXY += i * y;
    sumXX += i * i;
  });
  const slope =
    n > 1 ? (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1) : 0;
  const intercept = (sumY - slope * sumX) / n;

  return data.map((d, i) => {
    const rawTrend = Number((slope * i + intercept).toFixed(1));
    return {
      ...d,
      trend: Math.max(0, rawTrend),
    };
  });
}

/**
 * Klassifiziert den Icon-Typ für interaktive Klärungs-Chips (Clarification Options).
 */
export function getClarificationOptionIconType(
  opt: ClarificationOption
): "pie" | "trend" | "palette" | "bar" | "equipment" | "area" | "default" {
  const text = `${opt.label || ""} ${opt.value || ""} ${opt.id || ""}`.toLowerCase();
  if (
    text.includes("pie") ||
    text.includes("kuchen") ||
    text.includes("torte") ||
    text.includes("kreis") ||
    text.includes("anteil")
  ) {
    return "pie";
  }
  if (
    text.includes("trend") ||
    text.includes("linie") ||
    text.includes("verlauf") ||
    text.includes("steigung") ||
    text.includes("prognose")
  ) {
    return "trend";
  }
  if (
    text.includes("farb") ||
    text.includes("palette") ||
    text.includes("color") ||
    text.includes("bunt") ||
    text.includes("design") ||
    text.includes("schema") ||
    text.includes("smaragd") ||
    text.includes("ocean") ||
    text.includes("amber")
  ) {
    return "palette";
  }
  if (
    text.includes("balken") ||
    text.includes("bar") ||
    text.includes("säule") ||
    text.includes("diagramm") ||
    text.includes("chart") ||
    text.includes("vergleich")
  ) {
    return "bar";
  }
  if (
    opt.field === "equipment" ||
    text.includes("kuka") ||
    text.includes("roboter") ||
    text.includes("motor") ||
    text.includes("pumpe") ||
    text.includes("maschine") ||
    text.includes("anlage")
  ) {
    return "equipment";
  }
  if (
    opt.field === "area" ||
    text.includes("halle") ||
    text.includes("bereich") ||
    text.includes("station") ||
    text.includes("zone")
  ) {
    return "area";
  }
  return "default";
}
