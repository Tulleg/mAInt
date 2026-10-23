"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Wrench,
  Search,
  Filter,
  PlusCircle,
  AlertTriangle,
  Flame,
  Clock,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
  ExternalLink,
  Cpu,
  User,
  ArrowRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface OperatorOrder {
  id: string;
  orderNumber: string;
  title: string;
  description: string;
  priority: "1_EMERGENCY" | "2_HIGH" | "3_MEDIUM" | "4_LOW";
  statusName: string;
  statusCode: string;
  equipmentId?: string | null;
  equipmentName?: string | null;
  equipmentNumber?: string | null;
  plantSection?: string | null;
  reportedByName?: string | null;
  assignedTechnicianName?: string | null;
  createdAt: string;
  downtimeMinutes?: number;
}

interface OperatorDashboardViewProps {
  orders: OperatorOrder[];
  equipments: Array<{ id: string; name: string; equipmentNumber: string; plantSection?: string }>;
}

export function OperatorDashboardView({ orders, equipments }: OperatorDashboardViewProps) {
  const [selectedArea, setSelectedArea] = useState<string>("ALL");
  const [selectedEquipment, setSelectedEquipment] = useState<string>("ALL");
  const [dateFilter, setDateFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Extrahierte eindeutige Bereiche (Plant Sections)
  const availableAreas = useMemo(() => {
    const set = new Set<string>();
    equipments.forEach((e) => {
      if (e.plantSection) set.add(e.plantSection);
    });
    orders.forEach((o) => {
      if (o.plantSection) set.add(o.plantSection);
    });
    return Array.from(set);
  }, [equipments, orders]);

  // Gefilterte Aufträge
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        o.title.toLowerCase().includes(q) ||
        o.orderNumber.toLowerCase().includes(q) ||
        (o.equipmentName && o.equipmentName.toLowerCase().includes(q));

      const matchArea = selectedArea === "ALL" || o.plantSection === selectedArea;
      const matchEquipment = selectedEquipment === "ALL" || o.equipmentId === selectedEquipment;

      let matchDate = true;
      if (dateFilter !== "ALL") {
        const orderDate = new Date(o.createdAt);
        const now = new Date();
        const diffDays = (now.getTime() - orderDate.getTime()) / (1000 * 3600 * 24);
        if (dateFilter === "TODAY") matchDate = diffDays <= 1;
        else if (dateFilter === "WEEK") matchDate = diffDays <= 7;
        else if (dateFilter === "MONTH") matchDate = diffDays <= 30;
      }

      return matchSearch && matchArea && matchEquipment && matchDate;
    });
  }, [orders, searchQuery, selectedArea, selectedEquipment, dateFilter]);

  // Kennzahlen
  const stats = useMemo(() => {
    return {
      total: filteredOrders.length,
      inWork: filteredOrders.filter((o) => o.statusCode === "IN_WORK").length,
      emergencies: filteredOrders.filter((o) => o.priority === "1_EMERGENCY").length,
      completed: filteredOrders.filter((o) => o.statusCode === "TECH_COMPLETED" || o.statusCode === "CLOSED").length,
    };
  }, [filteredOrders]);

  const getPriorityBadge = (prio: string) => {
    switch (prio) {
      case "1_EMERGENCY":
        return (
          <Badge className="bg-red-950/80 border-red-700/80 text-red-300 gap-1 font-semibold text-[11px]">
            <Flame className="h-3 w-3 text-rose-400" />
            Notfall / Stillstand
          </Badge>
        );
      case "2_HIGH":
        return (
          <Badge className="bg-amber-950/80 border-amber-700/80 text-amber-300 text-[11px]">
            Dringend
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-800 text-slate-300 text-[11px]">
            Normal
          </Badge>
        );
    }
  };

  const getStatusBadge = (code: string, name: string) => {
    switch (code) {
      case "IN_WORK":
        return (
          <Badge className="bg-blue-950 text-blue-300 border-blue-700 animate-pulse text-[11px]">
            🔧 In Reparatur
          </Badge>
        );
      case "TECH_COMPLETED":
      case "CLOSED":
        return (
          <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-[11px]">
            ✓ Behoben
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="text-[11px]">
            {name || "Gemeldet"}
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Kennzahlen-Grid für den Bediener */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
        <Card className="p-4 bg-slate-900 border-slate-800">
          <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">
            Gemeldete Störungen
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">{stats.total}</span>
            <span className="text-xs text-slate-400">Aufträge</span>
          </div>
        </Card>

        <Card className="p-4 bg-slate-900 border-slate-800">
          <span className="text-[11px] font-medium text-cyan-400 block uppercase tracking-wider flex items-center gap-1">
            <Clock className="h-3 w-3" /> In Bearbeitung
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-cyan-400 font-mono">{stats.inWork}</span>
            <span className="text-xs text-slate-400">Techniker aktiv</span>
          </div>
        </Card>

        <Card className="p-4 bg-slate-900 border-slate-800">
          <span className="text-[11px] font-medium text-rose-400 block uppercase tracking-wider flex items-center gap-1">
            <Flame className="h-3 w-3" /> Akute Stillstände
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-400 font-mono">{stats.emergencies}</span>
            <span className="text-xs text-slate-400">Linienstopps</span>
          </div>
        </Card>

        <Card className="p-4 bg-slate-900 border-slate-800">
          <span className="text-[11px] font-medium text-emerald-400 block uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Gelöst / Wieder freigegeben
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-400 font-mono">{stats.completed}</span>
            <span className="text-xs text-slate-400">Erledigt</span>
          </div>
        </Card>
      </div>

      {/* Filterleiste: Bereich, Equipment, Datum, Suche */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Störung oder Maschine suchen..."
            className="pl-9 h-11 min-h-[44px] text-xs bg-slate-950 border-slate-800 text-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Bereichs-Filter */}
          <select
            value={selectedArea}
            onChange={(e) => setSelectedArea(e.target.value)}
            className="h-11 min-h-[44px] px-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-xs focus:outline-none"
          >
            <option value="ALL">Bereich: Alle Bereiche</option>
            {availableAreas.map((area) => (
              <option key={area} value={area}>
                Bereich: {area}
              </option>
            ))}
          </select>

          {/* Anlagen-Filter */}
          <select
            value={selectedEquipment}
            onChange={(e) => setSelectedEquipment(e.target.value)}
            className="h-11 min-h-[44px] px-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-xs focus:outline-none max-w-[200px] truncate"
          >
            <option value="ALL">Anlage: Alle Maschinen</option>
            {equipments.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.name} ({eq.equipmentNumber})
              </option>
            ))}
          </select>

          {/* Datums-Filter */}
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="h-11 min-h-[44px] px-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-xs focus:outline-none"
          >
            <option value="ALL">Zeitraum: Gesamt</option>
            <option value="TODAY">Heute</option>
            <option value="WEEK">Letzte 7 Tage</option>
            <option value="MONTH">Letzte 30 Tage</option>
          </select>
        </div>
      </div>

      {/* Auftragsliste des Bereichs */}
      <div className="space-y-3">
        {filteredOrders.length === 0 ? (
          <Card className="p-10 text-center bg-slate-900 border-slate-800 space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <h3 className="text-sm font-semibold text-white">Alles im grünen Bereich!</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Keine aktiven Störungen für die gewählten Filter vorhanden. Tritt eine neue Störung an Ihrer Linie auf?
            </p>
            <Link
              href="/orders/new"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Störung jetzt erfassen</span>
            </Link>
          </Card>
        ) : (
          filteredOrders.map((order) => (
            <Card
              key={order.id}
              className="p-4 bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                      {order.orderNumber}
                    </span>
                    {getPriorityBadge(order.priority)}
                    {getStatusBadge(order.statusCode, order.statusName)}
                    {order.plantSection && (
                      <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-800">
                        {order.plantSection}
                      </Badge>
                    )}
                  </div>

                  <Link
                    href={`/orders/${order.id}`}
                    className="text-sm md:text-base font-semibold text-white hover:text-cyan-400 transition-colors block tracking-tight"
                  >
                    {order.title}
                  </Link>

                  <p className="text-xs text-slate-400 line-clamp-2">
                    {order.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1">
                    {order.equipmentName && (
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Cpu className="h-3.5 w-3.5 text-cyan-400" />
                        <span>{order.equipmentName}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-slate-400" />
                      <span>
                        Techniker:{" "}
                        <strong className="text-slate-200">
                          {order.assignedTechnicianName || "Einsatz wird disponiert"}
                        </strong>
                      </span>
                    </div>
                    {order.downtimeMinutes ? (
                      <div className="flex items-center gap-1 text-rose-400 font-medium">
                        <Flame className="h-3 w-3" />
                        <span>{order.downtimeMinutes} Min. Stillstand</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  <Link
                    href={`/orders/${order.id}`}
                    className="h-11 min-h-[44px] px-3.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                    <span>Status & Details</span>
                  </Link>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
