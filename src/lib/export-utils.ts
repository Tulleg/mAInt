import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import type { OrderWithRelations } from "@/actions/order-actions";

/**
 * Wandelt die Prioritäts-Enum in eine verständliche deutsche Bezeichnung um.
 */
export function formatPriorityLabel(priority: string | null | undefined): string {
  switch (priority) {
    case "1_EMERGENCY":
      return "1 - Notfall";
    case "2_HIGH":
      return "2 - Hoch";
    case "3_MEDIUM":
      return "3 - Mittel";
    case "4_LOW":
      return "4 - Niedrig";
    default:
      return priority || "-";
  }
}

/**
 * Escaped einen String für CSV unter Beachtung von Semikolon, Anführungszeichen und Zeilenumbrüchen.
 */
export function escapeCsvCell(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(";") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Hilfsfunktion: Konvertiert ein SVGElement in ein HTMLCanvasElement mit weißem Hintergrund.
 */
export async function svgToCanvas(svgElement: SVGElement): Promise<HTMLCanvasElement> {
  const bbox = svgElement.getBoundingClientRect();
  const width = Math.max(bbox.width || 0, svgElement.clientWidth || 0, 750);
  const height = Math.max(bbox.height || 0, svgElement.clientHeight || 0, 360);

  const clonedSvg = svgElement.cloneNode(true) as SVGElement;
  clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clonedSvg.setAttribute("width", `${width}`);
  clonedSvg.setAttribute("height", `${height}`);
  if (!clonedSvg.getAttribute("viewBox")) {
    clonedSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  clonedSvg.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

  const svgString = new XMLSerializer().serializeToString(clonedSvg);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = 2; // Hohe Auflösung (Retina / 2x)
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas 2D-Kontext konnte nicht initialisiert werden."));
        return;
      }

      ctx.scale(scale, scale);
      // Weißer Hintergrund für sauberen Kontrast bei PNG & PDF
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      URL.revokeObjectURL(url);
      resolve(canvas);
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(new Error("Fehler beim Zeichnen des SVG auf den Canvas: " + String(err)));
    };

    img.src = url;
  });
}

/**
 * Exportiert ein Recharts-SVG als PNG-Datei.
 */
export async function exportChartToPng(svgElement: SVGElement, filename: string): Promise<void> {
  const canvas = await svgToCanvas(svgElement);
  const dataUrl = canvas.toDataURL("image/png");
  if (typeof document !== "undefined") {
    const link = document.createElement("a");
    link.download = filename.endsWith(".png") ? filename : `${filename}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/**
 * Exportiert ein Recharts-SVG als A4-Querformat PDF mit professionellem MaintAI-Header.
 */
export async function exportChartToPdf(
  svgElement: SVGElement,
  filename: string,
  title?: string
): Promise<void> {
  const canvas = await svgToCanvas(svgElement);
  const imgData = canvas.toDataURL("image/png");

  // jsPDF Querformat (Landscape) DIN A4: 297mm x 210mm
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 297;
  const pageHeight = 210;

  // Header-Leiste
  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(0, 0, pageWidth, 16, "F");

  // Header-Titel & MaintAI-Branding
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("MaintAI Analyse-Export", 15, 11);

  // Zeitstempel
  const now = new Date();
  const dateStr = now.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(`Exportiert am: ${dateStr}, ${timeStr} Uhr`, pageWidth - 15, 11, { align: "right" });

  // Diagramm-Titel
  doc.setTextColor(15, 23, 42); // slate-900
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  const chartTitle = title || "Ausfallzeiten nach Equipment (Halle 1)";
  doc.text(chartTitle, 15, 28);

  // Untertitel
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text("Stillstandszeiten- & Störungsanalyse • MaintAI Conversational Workspace", 15, 34);

  // Dekorative Trennlinie
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.4);
  doc.line(15, 38, pageWidth - 15, 38);

  // Bilddimensionen berechnen und zentrieren
  const marginX = 15;
  const marginTop = 42;
  const marginBottom = 18;
  const maxW = pageWidth - marginX * 2; // 267mm
  const maxH = pageHeight - marginTop - marginBottom; // 150mm

  const aspect = canvas.width / canvas.height;
  let renderW = maxW;
  let renderH = maxW / aspect;

  if (renderH > maxH) {
    renderH = maxH;
    renderW = maxH * aspect;
  }

  const posX = marginX + (maxW - renderW) / 2;
  const posY = marginTop + (maxH - renderH) / 2;

  doc.addImage(imgData, "PNG", posX, posY, renderW, renderH);

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text("MaintAI Smart Maintenance Platform • Vertraulich • Nur für interne Instandhaltungszwecke", 15, pageHeight - 8);
  doc.text("Seite 1 von 1", pageWidth - 15, pageHeight - 8, { align: "right" });

  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

/**
 * Erzeugt den formatierten CSV-Text mit UTF-8-BOM und Semikolon-Trennzeichen.
 */
export function generateCsvContent(orders: OrderWithRelations[]): string {
  const headers = ["Auftragsnummer", "Priorität", "Titel", "Equipment", "Status", "ErstelltAm"];
  const rows: string[] = [headers.join(";")];

  for (const o of orders) {
    const row = [
      escapeCsvCell(o.orderNumber || ""),
      escapeCsvCell(formatPriorityLabel(o.priority)),
      escapeCsvCell(o.title || ""),
      escapeCsvCell(o.equipment?.name || o.functionalLocation?.code || "-"),
      escapeCsvCell(o.currentStatus?.name || "Offen"),
      escapeCsvCell(o.createdAt ? new Date(o.createdAt).toLocaleString("de-DE") : "-"),
    ];
    rows.push(row.join(";"));
  }

  return "\uFEFF" + rows.join("\r\n");
}

/**
 * Exportiert Auftragsdaten als CSV-Datei mit Semikolon (;) und UTF-8-BOM für deutsches Microsoft Excel.
 */
export function exportTableToCsv(orders: OrderWithRelations[], filename: string): string {
  const csvContent = generateCsvContent(orders);

  if (typeof document !== "undefined" && typeof window !== "undefined") {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return csvContent;
}

/**
 * Erstellt eine strukturierte Excel-Arbeitsmappe (.xlsx) via xlsx.
 */
export function createExcelWorkbook(orders: OrderWithRelations[]): XLSX.WorkBook {
  const data = orders.map((o) => ({
    Auftragsnummer: o.orderNumber || "",
    Priorität: formatPriorityLabel(o.priority),
    Titel: o.title || "",
    Equipment: o.equipment?.name || o.functionalLocation?.code || "-",
    Status: o.currentStatus?.name || "Offen",
    ErstelltAm: o.createdAt ? new Date(o.createdAt).toLocaleString("de-DE") : "-",
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);

  // Spaltenbreiten für optimale Lesbarkeit konfigurieren
  worksheet["!cols"] = [
    { wch: 18 }, // Auftragsnummer
    { wch: 14 }, // Priorität
    { wch: 42 }, // Titel
    { wch: 26 }, // Equipment
    { wch: 16 }, // Status
    { wch: 20 }, // ErstelltAm
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Aufträge");
  return workbook;
}

/**
 * Exportiert Auftragsdaten als strukturierte Excel-Arbeitsmappe (.xlsx) via xlsx.
 */
export function exportTableToExcel(orders: OrderWithRelations[], filename: string): XLSX.WorkBook {
  const workbook = createExcelWorkbook(orders);
  const actualFilename = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(workbook, actualFilename);
  return workbook;
}
