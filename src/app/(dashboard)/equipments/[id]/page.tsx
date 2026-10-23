import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { equipments, maintenanceOrders, functionalLocations } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  Cpu,
  Wrench,
  Layers,
  MapPin,
  Clock,
  Flame,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  PlusCircle,
  Database,
  Calendar,
  Shield,
  Activity,
  FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { BackButton } from "@/components/ui/back-button";

export const metadata = {
  title: "Equipmentdetails | MaintAI",
  description: "Detaillierte Anlagen-Stammdaten, Betriebsstunden und Instandhaltungshistorie",
};

interface EquipmentDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function EquipmentDetailPage(props: EquipmentDetailPageProps) {
  const resolvedParams = await props.params;
  const equipmentId = resolvedParams.id;

  let equipmentData: any = null;
  let orders: any[] = [];

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(equipmentId);

  try {
    const dbEquipment = await db.query.equipments.findFirst({
      where: isUuid
        ? eq(equipments.id, equipmentId)
        : eq(equipments.equipmentNumber, equipmentId),
      with: {
        functionalLocation: true,
        parentEquipment: true,
        subEquipments: true,
      },
    });

    if (dbEquipment) {
      equipmentData = dbEquipment;

      // Aufträge für dieses Equipment laden
      try {
        orders = await db.query.maintenanceOrders.findMany({
          where: eq(maintenanceOrders.equipmentId, dbEquipment.id),
          with: {
            currentStatus: true,
            assignedToUser: true,
          },
          orderBy: [desc(maintenanceOrders.createdAt)],
          limit: 30,
        });
      } catch (orderErr) {
        console.warn("Konnte Aufträge für Equipment nicht laden:", orderErr);
      }
    }
  } catch (err) {
    console.warn("DB query error for equipment id:", equipmentId, err);
  }

  // Fallback für bekannte Demo-IDs, andernfalls sauberes notFound()
  if (!equipmentData) {
    const isDemoId = ["eq-demo-1", "eq-1", "eq-2", "eq-3", "EQ-10042", "EQ-10043", "EQ-10044"].includes(equipmentId);
    if (!isDemoId) {
      notFound();
    }

    equipmentData = {
      id: equipmentId,
      equipmentNumber: equipmentId.startsWith("EQ-") ? equipmentId : `EQ-10042`,
      name: "Kreiselpumpe KSB Etanorm 050-200",
      description: "Hauptspeisepumpe für Kühlkreislauf Fertigungslinie 2. Dauerläufer mit automatischer Drucküberwachung.",
      manufacturer: "KSB SE & Co. KGaA",
      modelType: "Etanorm G01",
      serialNumber: "SN-2024-8841",
      yearOfManufacture: 2021,
      criticality: "A",
      status: "ACTIVE",
      operatingHoursCounter: "14850.50",
      technicalSpecs: {
        "Fördervolumen": "120 m³/h",
        "Förderhöhe": "45 m",
        "Motorleistung": "18.5 kW",
        "Drehzahl": "2900 U/min",
        "Schmiermittel": "Mobil SHC 626",
      },
      functionalLocation: {
        id: "floc-1",
        code: "W1-HALLE1-ROB",
        name: "Werk 1 - Halle 1: Robotik & Automation",
        plantSection: "Fertigungslinie 2",
      },
      parentEquipment: null,
      subEquipments: [
        {
          id: "sub-1",
          equipmentNumber: "EQ-10042-M01",
          name: "Siemens IE3 Drehstrommotor 18.5 kW",
          criticality: "A",
        },
        {
          id: "sub-2",
          equipmentNumber: "EQ-10042-D01",
          name: "Burgmann Gleitringdichtung Cartex",
          criticality: "B",
        },
      ],
      sapId: "40001042",
      source: "SAP_S4HANA",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    orders = [
      {
        id: "ord-demo-1",
        orderNumber: "MO-2026-00421",
        title: "Havarie: Kreiselpumpe KSB - Lagerschaden & Überhitzung",
        priority: "1_EMERGENCY",
        currentStatus: { code: "IN_WORK", name: "In Bearbeitung" },
        assignedToUser: { firstName: "Thomas", lastName: "Techniker" },
        createdAt: new Date(Date.now() - 7200000),
      },
      {
        id: "ord-demo-2",
        orderNumber: "MO-2026-00389",
        title: "Vierteljährliche Schmier- und Dichtigkeitsprüfung",
        priority: "3_MEDIUM",
        currentStatus: { code: "TABG", name: "Technisch abgeschlossen" },
        assignedToUser: { firstName: "Klaus", lastName: "Wartung" },
        createdAt: new Date(Date.now() - 86400000 * 45),
      },
    ];
  }

  const getCriticalityBadge = (crit: string) => {
    switch (crit) {
      case "A":
        return (
          <Badge className="bg-rose-950/70 border-rose-700 text-rose-300 font-semibold text-xs py-1 gap-1">
            <Flame className="h-3.5 w-3.5 text-rose-400" />
            Kritikalität A (Produktionskritisch)
          </Badge>
        );
      case "B":
        return (
          <Badge className="bg-amber-950/70 border-amber-700 text-amber-300 font-medium text-xs py-1">
            Kritikalität B (Wichtig)
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-800 border-slate-700 text-slate-300 font-medium text-xs py-1">
            Kritikalität C (Standard)
          </Badge>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return (
          <Badge className="bg-emerald-950/60 border-emerald-700 text-emerald-300 text-xs py-1 font-semibold">
            Status: Aktiv / In Betrieb
          </Badge>
        );
      case "MAINTENANCE":
        return (
          <Badge className="bg-amber-950/60 border-amber-700 text-amber-300 text-xs py-1 font-semibold">
            Status: In Instandhaltung
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-800 border-slate-700 text-slate-400 text-xs py-1 font-medium">
            Status: {status || "Unbekannt"}
          </Badge>
        );
    }
  };

  const openOrders = orders.filter(
    (o) =>
      o.currentStatus?.code !== "TABG" &&
      o.currentStatus?.code !== "CLOSED" &&
      o.currentStatus?.code !== "COMPLETED"
  );
  const completedOrders = orders.filter(
    (o) =>
      o.currentStatus?.code === "TABG" ||
      o.currentStatus?.code === "CLOSED" ||
      o.currentStatus?.code === "COMPLETED"
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-150">
      {/* Top Header & Breadcrumbs mit konsistentem Zurück-Button */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <BackButton fallbackUrl="/equipments" label="Zurück" />
            <div className="h-4 w-px bg-slate-800" />
            <nav className="flex items-center gap-1.5 text-xs text-slate-400" aria-label="Breadcrumb">
              <Link href="/" className="hover:text-slate-200 transition-colors">Workspace</Link>
              <ChevronRight className="h-3 w-3 text-slate-600" />
              <Link href="/equipments" className="hover:text-slate-200 transition-colors">Anlagen & Equipments</Link>
              <ChevronRight className="h-3 w-3 text-slate-600" />
              <span className="text-cyan-400 font-mono font-medium">{equipmentData.equipmentNumber}</span>
            </nav>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <Cpu className="h-6 w-6 text-cyan-500" />
              <span>{equipmentData.name}</span>
            </h1>
            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200">
              {equipmentData.equipmentNumber}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {getCriticalityBadge(equipmentData.criticality)}
          {getStatusBadge(equipmentData.status)}
          {equipmentData.sapId ? (
            <Badge className="bg-indigo-950/60 border-indigo-700 text-indigo-300 text-xs py-1 gap-1 font-mono">
              <Database className="w-3.5 h-3.5 text-indigo-300" />
              SAP PM: {equipmentData.sapId}
            </Badge>
          ) : (
            <Badge className="bg-slate-800/80 border-slate-600 text-slate-300 text-xs py-1 font-medium">
              Lokal / Standalone
            </Badge>
          )}

          <Link
            href={`/orders/new?equipmentId=${equipmentData.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Störung melden</span>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ========================================================================= */}
        {/* LINKE SPALTE (2 COLS): STAMMDATEN, TECHNISCHE DATEN & AUFTRÄGE           */}
        {/* ========================================================================= */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basisdaten & Beschreibung */}
          <Card className="p-5 bg-slate-900 border-slate-800 space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <FileText className="w-4 h-4 text-cyan-400" />
              Anlagen-Stammdaten & Spezifikation
            </h2>

            <div className="space-y-3 text-xs">
              {equipmentData.description && (
                <div>
                  <span className="text-slate-400 block font-medium mb-1">Funktionsbeschreibung:</span>
                  <p className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 text-slate-200 leading-relaxed">
                    {equipmentData.description}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-[11px] text-slate-400 block">Hersteller:</span>
                  <span className="text-sm font-semibold text-white">
                    {equipmentData.manufacturer || "Nicht angegeben"}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-[11px] text-slate-400 block">Modell / Typ:</span>
                  <span className="text-sm font-semibold text-slate-200">
                    {equipmentData.modelType || "Standard"}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-[11px] text-slate-400 block">Seriennummer:</span>
                  <span className="font-mono text-sm font-semibold text-cyan-400">
                    {equipmentData.serialNumber || "-"}
                  </span>
                </div>
              </div>

              {equipmentData.technicalSpecs && Object.keys(equipmentData.technicalSpecs).length > 0 && (
                <div className="pt-2">
                  <span className="text-slate-400 block font-medium mb-2">Technische Kenngrößen:</span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(equipmentData.technicalSpecs).map(([key, val]) => (
                      <div
                        key={key}
                        className="p-2 rounded bg-slate-950/80 border border-slate-800/80 text-[11px]"
                      >
                        <span className="text-slate-500 block truncate">{key}:</span>
                        <span className="font-mono font-medium text-slate-200">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Technischer Platz & Standort */}
          <Card className="p-5 bg-slate-900 border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-cyan-400" />
                Einbauort & Technischer Platz (TPLNR)
              </h2>
              <Link
                href="/functional-locations"
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                <span>Standortübersicht öffnen</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>

            {equipmentData.functionalLocation ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block">Technischer Platz:</span>
                  <span className="text-sm font-semibold text-white block mt-0.5">
                    {equipmentData.functionalLocation.name}
                  </span>
                  <span className="font-mono text-xs text-cyan-400 block mt-0.5">
                    {equipmentData.functionalLocation.code}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Werksbereich / Linie:</span>
                  <span className="text-slate-200 font-medium block mt-0.5">
                    {equipmentData.functionalLocation.plantSection || "Werk München"}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                Diesem Equipment ist kein spezifischer Technischer Platz zugeordnet.
              </p>
            )}
          </Card>

          {/* Instandhaltungs-Historie & Aufträge */}
          <Card className="p-5 bg-slate-900 border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Wrench className="w-4 h-4 text-cyan-400" />
                Instandhaltungsaufträge & Störungen ({orders.length})
              </h2>
              <Link
                href={`/orders/new?equipmentId=${equipmentData.id}`}
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Neuer Auftrag</span>
              </Link>
            </div>

            {orders.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">
                Keine Aufträge für dieses Equipment verzeichnet.
              </p>
            ) : (
              <div className="space-y-2">
                {orders.map((ord: any) => {
                  const isTechCompleted =
                    ord.currentStatus?.code === "TABG" ||
                    ord.currentStatus?.code === "CLOSED" ||
                    ord.currentStatus?.code === "COMPLETED";

                  return (
                    <Link
                      key={ord.id}
                      href={`/orders/${ord.id}`}
                      className="p-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-900/60 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group text-xs"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-cyan-400 group-hover:underline">
                            {ord.orderNumber}
                          </span>
                          <Badge
                            variant={ord.priority === "1_EMERGENCY" ? "destructive" : "secondary"}
                            className="text-[10px] py-0 px-1.5"
                          >
                            {ord.priority || "3_MEDIUM"}
                          </Badge>
                          <Badge
                            className={`text-[10px] py-0 px-1.5 ${
                              isTechCompleted
                                ? "bg-emerald-950/60 text-emerald-300 border-emerald-800"
                                : "bg-blue-950/60 text-blue-300 border-blue-800"
                            }`}
                          >
                            {ord.currentStatus?.name || (isTechCompleted ? "TABG" : "Offen")}
                          </Badge>
                        </div>
                        <p className="text-slate-200 font-medium truncate group-hover:text-white">
                          {ord.title}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                        <span className="text-[11px] text-slate-400">
                          {ord.assignedToUser
                            ? `${ord.assignedToUser.firstName || ""} ${ord.assignedToUser.lastName || ""}`.trim()
                            : "Pool"}
                        </span>
                        <span className="inline-flex items-center gap-1 text-cyan-400 group-hover:translate-x-0.5 transition-transform">
                          <span>Öffnen</span>
                          <ExternalLink className="w-3 h-3" />
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* ========================================================================= */}
        {/* RECHTE SPALTE (1 COL): KENNZAHLEN, BETRIEBSSTUNDEN & BAUPGRUPPEN          */}
        {/* ========================================================================= */}
        <div className="space-y-6">
          {/* Betriebsstundenzähler & Status */}
          <Card className="p-5 bg-slate-900 border-slate-800 space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Activity className="w-4 h-4 text-emerald-400" />
              Betriebsdaten & Zustand
            </h2>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[11px]">Betriebsstundenzähler:</span>
                <span className="text-emerald-400 font-semibold font-mono text-xl block mt-1">
                  {equipmentData.operatingHoursCounter || "0.00"} h
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[11px]">Baujahr / Inbetriebnahme:</span>
                <span className="text-white font-medium block mt-1">
                  {equipmentData.yearOfManufacture || "2021"}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[11px]">Offene Störungsaufträge:</span>
                <span className={`font-semibold font-mono text-lg block mt-1 ${
                  openOrders.length > 0 ? "text-amber-400" : "text-emerald-400"
                }`}>
                  {openOrders.length} aktiv
                </span>
              </div>
            </div>
          </Card>

          {/* Untergeordnete Baugruppen / Sub-Equipments */}
          <Card className="p-5 bg-slate-900 border-slate-800 space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Layers className="w-4 h-4 text-purple-400" />
              Baugruppen & Unteranlagen ({equipmentData.subEquipments?.length || 0})
            </h2>

            {!equipmentData.subEquipments || equipmentData.subEquipments.length === 0 ? (
              <p className="text-xs text-slate-400">
                Keine separaten Baugruppen für diese Anlage hinterlegt.
              </p>
            ) : (
              <div className="space-y-2 text-xs">
                {equipmentData.subEquipments.map((sub: any) => (
                  <Link
                    key={sub.id}
                    href={`/equipments/${sub.id}`}
                    className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 flex items-center justify-between transition-colors group"
                  >
                    <div>
                      <span className="font-semibold text-white block group-hover:text-cyan-300">
                        {sub.name}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">
                        {sub.equipmentNumber}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      Klasse {sub.criticality || "B"}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
