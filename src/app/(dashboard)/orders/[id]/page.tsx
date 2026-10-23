import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import {
  maintenanceOrders,
  equipments,
  functionalLocations,
  users,
  orderTypes,
  workflowStatuses,
  workflowTransitions,
  orderStatusAuditLogs,
  orderSparePartBookings,
  spareParts,
} from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import {
  Wrench,
  ArrowLeft,
  Calendar,
  Clock,
  Flame,
  AlertTriangle,
  CheckCircle2,
  User,
  MapPin,
  Cpu,
  Layers,
  FileText,
  Package,
  History,
  ShieldCheck,
  Wifi,
  ExternalLink,
  Play,
  CheckCheck,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { BackButton } from "@/components/ui/back-button";
import { OrderWorkflowActions } from "@/components/orders/order-workflow-actions";
import {
  transitionOrderStatusAction,
  completeOrderAction,
  getOrderDetailsAction,
} from "@/actions/order-actions";

export const metadata = {
  title: "Auftragsdetails | MaintAI",
  description: "Detaillierte Auftragsansicht, Statusübergänge und Historie",
};

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage(props: OrderDetailPageProps) {
  const resolvedParams = await props.params;
  const orderId = resolvedParams.id;

  let orderData: any = null;
  let transitions: any[] = [];
  let auditLogs: any[] = [];
  let sparePartBookings: any[] = [];

  try {
    const detailsRes = await getOrderDetailsAction(orderId);
    if (detailsRes.success && detailsRes.order) {
      orderData = detailsRes.order;
      transitions = detailsRes.order.transitions || [];
      auditLogs = detailsRes.order.protocols || [];
      sparePartBookings = detailsRes.order.sparePartBookings || [];
    }
  } catch (err) {
    console.warn("getOrderDetailsAction error for order id:", orderId, err);
  }

  // Fallback für bekannte Demo-IDs, andernfalls sauberes notFound()
  if (!orderData) {
    const isDemoId = ["ord-demo-1", "ord-demo-2", "demo-1", "demo-2", "MO-2026-00421"].includes(orderId);
    if (!isDemoId) {
      notFound();
    }

    orderData = {
      id: orderId,
      orderNumber: orderId.startsWith("MO-") ? orderId : `MO-2026-00421`,
      title: "Havarie: Kreiselpumpe KSB - Lagerschaden & Überhitzung",
      description:
        "Starke Rauchentwicklung an Lagersitz A-Seite. Temperaturwächter hat ausgelöst. Fertigungslinie 2 steht seit 08:15 Uhr still.",
      priority: "1_EMERGENCY",
      currentStatusId: "stat-open",
      orderType: { code: "IH01", name: "Störungsbehebung (Notfall)" },
      currentStatus: { code: "IN_WORK", name: "In Bearbeitung", colorHex: "#3B82F6" },
      damageCode: "MECH_LAGER",
      causeCode: "MECH_VERSCHLEISS",
      rootCauseDescription: "Trockenlauf durch Schmiermittelmangel und Dichtungsdefekt.",
      resolutionSummary: "Wälzlager SKF 6208 getauscht, Wellendichtring ersetzt und neu geschmiert.",
      plannedDurationMinutes: 90,
      actualDurationMinutes: 75,
      downtimeMinutes: 45,
      scheduledStartAt: new Date(),
      scheduledEndAt: null,
      actualStartAt: new Date(Date.now() - 3600000),
      actualEndAt: null,
      equipment: {
        id: "eq-demo-1",
        equipmentNumber: "EQ-10042",
        name: "Kreiselpumpe KSB Etanorm 050-200",
        manufacturer: "KSB SE & Co. KGaA",
        modelType: "Etanorm G01",
        serialNumber: "SN-2024-8841",
        criticality: "A",
        status: "ACTIVE",
        operatingHoursCounter: "14850.50",
        functionalLocation: {
          code: "W1-HALLE1-ROB",
          name: "Werk 1 - Halle 1: Robotik & Automation",
        },
      },
      reportedByUser: {
        firstName: "Michael",
        lastName: "Melder",
        email: "melder@maintai.local",
      },
      assignedToUser: {
        firstName: "Thomas",
        lastName: "Techniker",
        email: "techniker@maintai.local",
      },
      sapOrderNr: "40001928",
      sapNotificationNr: "QM-2026-8812",
      sapSyncStatus: "SYNCED",
      createdAt: new Date(Date.now() - 7200000),
      updatedAt: new Date(),
    };

    transitions = [
      {
        id: "trans-1",
        actionName: "Arbeit abschließen (TABG)",
        toStatus: { id: "stat-completed", name: "Technisch abgeschlossen", code: "TECH_COMPLETED" },
      },
      {
        id: "trans-2",
        actionName: "Warten auf Ersatzteile",
        toStatus: { id: "stat-hold", name: "Wartend (Material)", code: "ON_HOLD" },
      },
    ];
  }

  const getPriorityBadge = (prio: string) => {
    switch (prio) {
      case "1_EMERGENCY":
        return (
          <Badge className="bg-rose-950/70 border-rose-700 text-rose-300 gap-1 font-semibold text-xs py-1">
            <Flame className="h-3.5 w-3.5 text-rose-300" />
            1_EMERGENCY (Stillstand / Havarie)
          </Badge>
        );
      case "2_HIGH":
        return (
          <Badge className="bg-amber-950/70 border-amber-700 text-amber-300 text-xs py-1 font-medium">
            2_HIGH (Dringend)
          </Badge>
        );
      case "3_MEDIUM":
        return (
          <Badge className="bg-slate-800 border-slate-700 text-slate-300 text-xs py-1 font-medium">
            3_MEDIUM (Normal)
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-800 border-slate-700 text-slate-300 text-xs py-1 font-medium">
            4_LOW (Niedrig)
          </Badge>
        );
    }
  };

  const formatDate = (val: string | Date | null | undefined) => {
    if (!val) return "Nicht festgelegt";
    try {
      const d = typeof val === "string" ? new Date(val) : val;
      if (isNaN(d.getTime())) return "Ungültiges Datum";
      return d.toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Nicht festgelegt";
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-150">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="space-y-2">
          {/* Oben links: Konsistenter Zurück-Button & Breadcrumb-Pfad */}
          <div className="flex items-center gap-3">
            <BackButton fallbackUrl="/orders" label="Zurück" />
            <div className="h-4 w-px bg-slate-800" />
            <nav className="flex items-center gap-1.5 text-xs text-slate-400" aria-label="Breadcrumb">
              <Link href="/" className="hover:text-slate-200 transition-colors">Workspace</Link>
              <ChevronRight className="h-3 w-3 text-slate-600" />
              <Link href="/orders" className="hover:text-slate-200 transition-colors">Aufträge & Störungen</Link>
              <ChevronRight className="h-3 w-3 text-slate-600" />
              <span className="text-cyan-400 font-mono font-medium">{orderData.orderNumber}</span>
            </nav>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <Wrench className="h-6 w-6 text-blue-500" />
              <span>{orderData.title}</span>
            </h1>
            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200">
              {orderData.orderNumber}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {getPriorityBadge(orderData.priority)}
          {(() => {
            const sc = (orderData.currentStatus?.code || "").toUpperCase();
            const sName = orderData.currentStatus?.name || orderData.currentStatus?.code || "Offen";
            if (sc === "IN_PROGRESS" || sc === "IN_WORK" || sc === "IN ARBEIT" || sc === "WORKING") {
              return (
                <Badge className="bg-amber-950/60 border-amber-700 text-amber-300 text-xs py-1 font-semibold">
                  Status: {sName}
                </Badge>
              );
            }
            if (sc === "TABG" || sc === "TECH_COMPLETED" || sc === "COMPLETED" || sc === "CLOSED") {
              return (
                <Badge className="bg-emerald-950/60 border-emerald-700 text-emerald-300 text-xs py-1 font-semibold">
                  Status: {sName}
                </Badge>
              );
            }
            return (
              <Badge className="bg-blue-950/60 border-blue-700 text-blue-300 text-xs py-1 font-medium">
                Status: {sName}
              </Badge>
            );
          })()}
          {orderData.sapOrderNr ? (
            <Badge className="bg-indigo-950/60 border-indigo-700 text-indigo-300 text-xs py-1 gap-1 font-mono">
              <Wifi className="w-3.5 h-3.5 text-indigo-300" />
              SAP PM: {orderData.sapOrderNr}
            </Badge>
          ) : (
            <Badge className="bg-slate-800/80 border-slate-600 text-slate-300 text-xs py-1 font-medium">
              Lokal / Manuell
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ========================================================================= */}
        {/* LINKE SPALTE (2 COLS): STAMMDATEN, ZEITEN & EQUIPMENT                    */}
        {/* ========================================================================= */}
        <div className="lg:col-span-2 space-y-6">
          {/* Beschreibung & Störungsbild */}
          <Card className="p-5 bg-slate-900 border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                Störungsbeschreibung & Analyse
              </h2>
              {orderData.orderType?.name && (
                <span className="text-xs text-slate-400">
                  Auftragsart: <strong className="text-slate-200">{orderData.orderType.name}</strong>
                </span>
              )}
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 block font-medium mb-1">Detaillierte Fehlerbeschreibung:</span>
                <p className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {orderData.description || "Keine Beschreibung hinterlegt."}
                </p>
              </div>

              {orderData.symptomDescription && (
                <div>
                  <span className="text-slate-400 block font-medium mb-1">Beobachtete Symptome:</span>
                  <p className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 text-slate-300">
                    {orderData.symptomDescription}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                  <span className="text-[11px] text-slate-400 block">Schadenscode (Katalog):</span>
                  <span className="font-mono text-sm font-semibold text-white">
                    {orderData.damageCode || "Nicht klassifiziert"}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                  <span className="text-[11px] text-slate-400 block">Ursachencode (Root Cause):</span>
                  <span className="font-mono text-sm font-semibold text-slate-200">
                    {orderData.causeCode || "Wird noch analysiert"}
                  </span>
                </div>
              </div>

              {orderData.resolutionSummary && (
                <div className="pt-2 border-t border-slate-800">
                  <span className="text-slate-400 block font-medium mb-1 text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    Durchgeführte Instandsetzungsmaßnahme:
                  </span>
                  <p className="p-3 rounded-lg bg-slate-950 border border-emerald-900/40 text-slate-200">
                    {orderData.resolutionSummary}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Betroffenes Equipment / Technischer Platz */}
          <Card className="p-5 bg-slate-900 border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-cyan-400" />
                Bezugsobjekt: Equipment & Technischer Platz
              </h2>
              {orderData.equipment && (
                <Link
                  href={`/equipments/${orderData.equipment.id || orderData.equipment.equipmentNumber}`}
                  className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                >
                  <span>Anlagendetails öffnen</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </div>

            {orderData.equipment ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <span className="text-slate-400 block">Equipment:</span>
                  <span className="text-sm font-semibold text-white block">
                    {orderData.equipment.name}
                  </span>
                  <span className="font-mono text-xs text-cyan-400 block">
                    {orderData.equipment.equipmentNumber}
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-slate-400 block">Hersteller & Typ:</span>
                  <span className="text-slate-200 block">
                    {orderData.equipment.manufacturer || "Unbekannt"} -{" "}
                    {orderData.equipment.modelType || "Standard"}
                  </span>
                  {orderData.equipment.serialNumber && (
                    <span className="font-mono text-[11px] text-slate-400 block">
                      S/N: {orderData.equipment.serialNumber}
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-slate-400 block">Technischer Platz (TPLNR):</span>
                  <span className="text-slate-200 block font-medium">
                    {orderData.equipment.functionalLocation?.name ||
                      orderData.functionalLocation?.name ||
                      "Bereich nicht zugeordnet"}
                  </span>
                  {(orderData.equipment.functionalLocation?.code || orderData.functionalLocation?.code) && (
                    <span className="font-mono text-xs text-slate-400 block">
                      {orderData.equipment.functionalLocation?.code || orderData.functionalLocation?.code}
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-slate-400 block">Kritikalität & Betriebsstunden:</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={orderData.equipment.criticality === "A" ? "destructive" : "secondary"}>
                      Klasse {orderData.equipment.criticality || "B"}
                    </Badge>
                    <span className="font-mono text-slate-300">
                      {orderData.equipment.operatingHoursCounter || "0"} h
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                Diesem Auftrag ist keine spezifische Einzelmaschine zugewiesen (z.B. allgemeine Werksstörung).
              </p>
            )}
          </Card>

          {/* Zeiten, Termine & Stillstandsüberwachung */}
          <Card className="p-5 bg-slate-900 border-slate-800 space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Clock className="w-4 h-4 text-cyan-400" />
              Terminierung & Aufwandszeiten
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[11px]">Geplanter Start:</span>
                <span className="text-white font-medium block mt-1">
                  {formatDate(orderData.scheduledStartAt)}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[11px]">Geplante Dauer:</span>
                <span className="text-white font-semibold font-mono text-base block mt-1">
                  {orderData.plannedDurationMinutes || 60} Min.
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[11px]">Tatsächliche Dauer:</span>
                <span className="text-emerald-400 font-semibold font-mono text-base block mt-1">
                  {orderData.actualDurationMinutes ? `${orderData.actualDurationMinutes} Min.` : "Ausstehend"}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[11px] flex items-center gap-1">
                  <Flame className="w-3 h-3 text-rose-400" />
                  Maschinenstillstand:
                </span>
                <span className="text-rose-400 font-semibold font-mono text-base block mt-1">
                  {orderData.downtimeMinutes ? `${orderData.downtimeMinutes} Min.` : "0 Min."}
                </span>
              </div>
            </div>
          </Card>

          {/* Ersatzteilbuchungen */}
          <Card className="p-5 bg-slate-900 border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Package className="w-4 h-4 text-cyan-400" />
                Verbaute Ersatzteile & Materialentnahmen ({sparePartBookings.length})
              </h2>
              <Link
                href="/spare-parts"
                className="text-xs text-cyan-400 hover:text-cyan-300"
              >
                Lagerkatalog öffnen
              </Link>
            </div>

            {sparePartBookings.length === 0 ? (
              <p className="text-xs text-slate-400">
                Für diesen Auftrag wurden noch keine Ersatzteile abgebucht.
              </p>
            ) : (
              <div className="space-y-2">
                {sparePartBookings.map((b: any) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-white block">
                        {b.sparePart?.name || "Ersatzteil"}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        Art.-Nr: {b.sparePart?.internalPartNumber || "-"} · Lagerort: {b.storageLocation || "Hauptlager"}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-white font-mono block">
                        {b.quantityConsumed} {b.sparePart?.unitOfMeasure || "ST"}
                      </span>
                      <span className="text-[10px] text-emerald-400 font-mono">
                        SAP Warenausgang 261
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ========================================================================= */}
        {/* RECHTE SPALTE (1 COL): WORKFLOW, ZUSTÄNDIGKEITEN & AUDIT-LOG              */}
        {/* ========================================================================= */}
        <div className="space-y-6">
          {/* Personalzuordnung */}
          <Card className="p-5 bg-slate-900 border-slate-800 space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <User className="w-4 h-4 text-cyan-400" />
              Zuständigkeiten
            </h2>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Gemeldet von:</span>
                <span className="font-medium text-white">
                  {orderData.reportedByUser
                    ? `${orderData.reportedByUser.firstName || ""} ${orderData.reportedByUser.lastName || ""}`.trim() || orderData.reportedByUser.email || "Melder"
                    : "Nicht erfasst (System / Automatisch)"}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Zugewiesener Techniker:</span>
                <span className="font-medium text-cyan-400">
                  {orderData.assignedToUser
                    ? `${orderData.assignedToUser.firstName || ""} ${orderData.assignedToUser.lastName || ""}`.trim() || orderData.assignedToUser.email || "Zugewiesen"
                    : "Nicht disponiert (Team-Pool)"}
                </span>
              </div>
            </div>
          </Card>

          {/* Workflow Status-Aktionen */}
          <Card className="p-5 bg-slate-900 border-slate-800 space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Workflow-Statusübergänge
            </h2>

            <div className="space-y-2">
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-xs flex justify-between items-center mb-3">
                <span className="text-slate-400">Aktueller Status:</span>
                <Badge variant="secondary" className="font-semibold text-xs">
                  {orderData.currentStatus?.name || "Freigegeben"}
                </Badge>
              </div>

              <OrderWorkflowActions
                orderId={orderData.id}
                userRole="TECHNICIAN"
                userId={orderData.assignedToUserId || "demo-user-techniker"}
              />
            </div>
          </Card>

          {/* Audit-Log / Änderungshistorie */}
          <Card className="p-5 bg-slate-900 border-slate-800 space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <History className="w-4 h-4 text-purple-400" />
              Status-Audit-Log & Historie
            </h2>

            {auditLogs.length === 0 ? (
              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-300">Auftrag initial erstellt</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {formatDate(orderData.createdAt)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-xs max-h-60 overflow-y-auto">
                {auditLogs.map((log: any) => (
                  <div
                    key={log.id}
                    className="p-2.5 rounded bg-slate-950 border border-slate-800 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">
                        {log.toStatus?.name || "Status geändert"}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {formatDate(log.createdAt)}
                      </span>
                    </div>
                    {log.comment && (
                      <p className="text-[11px] text-slate-400">{log.comment}</p>
                    )}
                    <span className="text-[10px] text-slate-500 block">
                      Durch: {log.changedByUser ? `${log.changedByUser.firstName} ${log.changedByUser.lastName}` : "System"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
