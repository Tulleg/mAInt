"use client";

import React, { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Factory,
  MapPin,
  Cpu,
  Wrench,
  ChevronRight,
  ChevronDown,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  ExternalLink,
  Edit2,
  Trash2,
  Shield,
  Layers,
  Settings2,
  PlusCircle,
  RefreshCw,
  Database,
  Building2,
  Info,
  Calendar,
  X,
  User,
  SlidersHorizontal,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AreaNode,
  FunctionalLocationNode,
  EquipmentTreeNode,
  EquipmentSource,
  OrderSummary,
} from "./equipment-types";
import {
  createAreaAction,
  updateAreaAction,
  deleteAreaAction,
  createFunctionalLocationAction,
  updateFunctionalLocationAction,
  deleteFunctionalLocationAction,
  createEquipmentAction,
  updateEquipmentAction,
  deleteEquipmentAction,
  syncSapEquipmentsAction,
  toggleSapModeAction,
} from "@/actions/equipment-actions";
import { switchUserRoleAction } from "@/actions/rbac-actions";

export * from "./equipment-types";

// ============================================================================
// BADGES & HELPER COMPONENTS
// ============================================================================

export function SourceBadge({ source }: { source?: EquipmentSource }) {
  if (source === "SAP") {
    return (
      <span
        title="Synchronisiert aus SAP PM / S/4HANA"
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-950/60 text-indigo-300 border border-indigo-700 shadow-sm shrink-0"
      >
        <Database className="h-2.5 w-2.5 text-indigo-300" />
        SAP
      </span>
    );
  }
  return (
    <span
      title="Manuell / Lokal gepflegtes Master-Asset"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800/80 text-slate-300 border border-slate-600 shrink-0"
    >
      <Layers className="h-2.5 w-2.5 text-slate-400" />
      Lokal / Manuell
    </span>
  );
}

function getCriticalityBadge(crit?: string) {
  switch (crit) {
    case "A":
      return (
        <Badge className="bg-rose-950/70 text-rose-300 border-rose-700 text-[9px] px-1.5 py-0 font-bold shrink-0">
          Klasse A
        </Badge>
      );
    case "B":
      return (
        <Badge className="bg-amber-950/70 text-amber-300 border-amber-700 text-[9px] px-1.5 py-0 shrink-0">
          Klasse B
        </Badge>
      );
    case "C":
      return (
        <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-[9px] px-1.5 py-0 shrink-0">
          Klasse C
        </Badge>
      );
    default:
      return null;
  }
}

function getStatusDot(status?: string) {
  switch (status) {
    case "ACTIVE":
      return <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" title="In Betrieb" />;
    case "BREAKDOWN":
      return (
        <span
          className="h-2 w-2 rounded-full bg-rose-500 shrink-0 animate-pulse"
          title="Stillstand / Störung"
        />
      );
    case "IN_MAINTENANCE":
      return (
        <span
          className="h-2 w-2 rounded-full bg-amber-500 shrink-0"
          title="In Instandhaltung"
        />
      );
    default:
      return <span className="h-2 w-2 rounded-full bg-slate-600 shrink-0" title="Deaktiviert" />;
  }
}

interface EquipmentTreeViewProps {
  areas?: AreaNode[];
  locations?: FunctionalLocationNode[]; // Backwards-compatible
  userRole?: string; // "ADMIN" | "TECHNICIAN" | "COORDINATOR" | "OPERATOR" | "MAINT_PLANNER"
  isSapMode?: boolean;
  tenantId?: string;
}

export function EquipmentTreeView({
  areas: initialAreas,
  locations: initialLocations,
  userRole = "ADMIN",
  isSapMode: initialSapMode = false,
  tenantId = "demo-tenant-1000",
}: EquipmentTreeViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Aktive Rolle & SAP Modus
  const [currentRole, setCurrentRole] = useState<string>(userRole);
  const [sapModeActive, setSapModeActive] = useState<boolean>(initialSapMode);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Normalisierung der Bereiche
  const normalizedAreas: AreaNode[] = useMemo(() => {
    if (initialAreas && initialAreas.length > 0) {
      return initialAreas;
    }
    if (initialLocations && initialLocations.length > 0) {
      const map = new Map<string, FunctionalLocationNode[]>();
      initialLocations.forEach((loc) => {
        const sec = loc.plantSection || "Zentralbereich Fertigung";
        if (!map.has(sec)) map.set(sec, []);
        map.get(sec)!.push(loc);
      });
      return Array.from(map.entries()).map(([secName, flocs], idx) => ({
        id: `area-auto-${idx}`,
        code: `AREA-${idx + 1}`,
        name: secName,
        source: flocs.some((f) => f.source === "SAP") ? "SAP" : "MANUAL",
        functionalLocations: flocs,
      }));
    }
    return [];
  }, [initialAreas, initialLocations]);

  // Filter States (synchronisiert mit URL-Parametern)
  const initialSelectedArea = searchParams?.get("area") || "ALL";
  const initialSearchQuery = searchParams?.get("q") || "";

  const [selectedAreaId, setSelectedAreaId] = useState<string>(initialSelectedArea);
  const [searchQuery, setSearchQuery] = useState<string>(initialSearchQuery);
  const [criticalityFilter, setCriticalityFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sourceFilter, setSourceFilter] = useState<string>("ALL");

  // Detailkarten-Tabs: "specs" | "openOrders" | "history"
  const [detailTab, setDetailTab] = useState<"specs" | "openOrders" | "history">("specs");

  // Aufgeklappte Knoten (IDs)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    normalizedAreas.forEach((area) => {
      initial.add(`area-${area.id}`);
      area.functionalLocations.forEach((floc) => {
        initial.add(`floc-${floc.id}`);
      });
    });
    return initial;
  });

  // Ausgewählter Knoten für die Detailansicht
  const [selectedNode, setSelectedNode] = useState<{
    type: "AREA" | "FLOC" | "EQUIPMENT" | "SUB_EQUIPMENT";
    item: any;
    breadcrumb: string[];
    areaId?: string;
    flocId?: string;
  } | null>(() => {
    const firstArea = normalizedAreas[0];
    const firstFloc = firstArea?.functionalLocations?.[0];
    const firstEq = firstFloc?.equipments?.[0];
    if (firstEq) {
      return {
        type: "EQUIPMENT",
        item: firstEq,
        breadcrumb: [firstArea.name, firstFloc.name, firstEq.name],
        areaId: firstArea.id,
        flocId: firstFloc.id,
      };
    }
    if (firstArea) {
      return {
        type: "AREA",
        item: firstArea,
        breadcrumb: [firstArea.name],
        areaId: firstArea.id,
      };
    }
    return null;
  });

  // Modals State
  const [modalType, setModalType] = useState<
    "CREATE_AREA" | "CREATE_FLOC" | "CREATE_EQUIPMENT" | "EDIT" | "DELETE" | null
  >(null);
  const [modalTarget, setModalTarget] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // URL-Parameter reaktiv aktualisieren (ohne Full-Page Reload)
  const updateUrlParams = (area: string, query: string) => {
    try {
      const url = new URL(window.location.href);
      if (area && area !== "ALL") {
        url.searchParams.set("area", area);
      } else {
        url.searchParams.delete("area");
      }
      if (query.trim()) {
        url.searchParams.set("q", query.trim());
      } else {
        url.searchParams.delete("q");
      }
      window.history.replaceState({}, "", url.toString());
    } catch {
      // Ignoriere im Testkontext
    }
  };

  const handleAreaChange = (areaId: string) => {
    setSelectedAreaId(areaId);
    updateUrlParams(areaId, searchQuery);
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    updateUrlParams(selectedAreaId, query);
  };

  const toggleExpand = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExpandAll = () => {
    const all = new Set<string>();
    normalizedAreas.forEach((area) => {
      all.add(`area-${area.id}`);
      area.functionalLocations.forEach((floc) => {
        all.add(`floc-${floc.id}`);
        floc.equipments.forEach((eq) => {
          all.add(`eq-${eq.id}`);
          eq.subEquipments?.forEach((sub) => all.add(`eq-${sub.id}`));
        });
      });
    });
    setExpandedNodes(all);
  };

  const handleCollapseAll = () => {
    setExpandedNodes(new Set());
  };

  // Rollenberechtigung & SAP-Modus
  const isAdmin = currentRole === "ADMIN";
  // Wenn SAP-Modus aktiv: Bearbeiten/Erstellen gesperrt.
  // Wenn Standalone: Nur ADMIN darf bearbeiten/erstellen; Techniker/Bediener rein lesend.
  const canCreateOrEdit = !sapModeActive && isAdmin;

  // Filter-Logik
  const filteredAreas = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return normalizedAreas
      .filter((area) => {
        if (selectedAreaId !== "ALL" && area.id !== selectedAreaId && area.code !== selectedAreaId) {
          return false;
        }
        return true;
      })
      .map((area) => {
        const filteredFlocs = area.functionalLocations
          .map((floc) => {
            const filteredEquips = floc.equipments
              .map((eq) => {
                // Filtern von Baugruppen (Sub-Equipments)
                const matchingSubs = (eq.subEquipments || []).filter((sub) => {
                  const matchQ =
                    !q ||
                    sub.name.toLowerCase().includes(q) ||
                    sub.equipmentNumber.toLowerCase().includes(q) ||
                    (sub.manufacturer && sub.manufacturer.toLowerCase().includes(q)) ||
                    (sub.sapEquipmentNr && sub.sapEquipmentNr.toLowerCase().includes(q));

                  const matchCrit =
                    criticalityFilter === "ALL" || sub.criticality === criticalityFilter;
                  const matchStat = statusFilter === "ALL" || sub.status === statusFilter;
                  const matchSource = sourceFilter === "ALL" || sub.source === sourceFilter;

                  return matchQ && matchCrit && matchStat && matchSource;
                });

                const eqMatchesSelf =
                  (!q ||
                    eq.name.toLowerCase().includes(q) ||
                    eq.equipmentNumber.toLowerCase().includes(q) ||
                    (eq.manufacturer && eq.manufacturer.toLowerCase().includes(q)) ||
                    (eq.sapEquipmentNr && eq.sapEquipmentNr.toLowerCase().includes(q))) &&
                  (criticalityFilter === "ALL" || eq.criticality === criticalityFilter) &&
                  (statusFilter === "ALL" || eq.status === statusFilter) &&
                  (sourceFilter === "ALL" || eq.source === sourceFilter);

                if (eqMatchesSelf || matchingSubs.length > 0) {
                  return {
                    ...eq,
                    subEquipments: matchingSubs.length > 0 ? matchingSubs : eq.subEquipments,
                  };
                }
                return null;
              })
              .filter(Boolean) as EquipmentTreeNode[];

            const flocMatchesSelf =
              (!q ||
                floc.name.toLowerCase().includes(q) ||
                floc.code.toLowerCase().includes(q) ||
                (floc.sapTplnr && floc.sapTplnr.toLowerCase().includes(q))) &&
              (sourceFilter === "ALL" || floc.source === sourceFilter);

            if (flocMatchesSelf || filteredEquips.length > 0) {
              return {
                ...floc,
                equipments: filteredEquips,
              };
            }
            return null;
          })
          .filter(Boolean) as FunctionalLocationNode[];

        const areaMatchesSelf =
          (!q ||
            area.name.toLowerCase().includes(q) ||
            area.code.toLowerCase().includes(q)) &&
          (sourceFilter === "ALL" || area.source === sourceFilter);

        if (areaMatchesSelf || filteredFlocs.length > 0) {
          return {
            ...area,
            functionalLocations: filteredFlocs,
          };
        }
        return null;
      })
      .filter(Boolean) as AreaNode[];
  }, [
    normalizedAreas,
    selectedAreaId,
    searchQuery,
    criticalityFilter,
    statusFilter,
    sourceFilter,
  ]);

  // Gesamtzahlen für Filter-Statistiken
  const totalEquipmentsCount = useMemo(() => {
    let count = 0;
    filteredAreas.forEach((a) => {
      a.functionalLocations.forEach((f) => {
        count += f.equipments.length;
        f.equipments.forEach((e) => {
          count += e.subEquipments?.length || 0;
        });
      });
    });
    return count;
  }, [filteredAreas]);

  // SAP Synchronisation anstoßen (nicht-blockierend via useTransition)
  const handleSyncSap = () => {
    if (!isAdmin) {
      toast.error("Nur Administratoren dürfen den SAP-Abgleich starten.");
      return;
    }
    setIsSyncing(true);
    toast.info("Synchronisation mit SAP PM / S/4HANA OData gestartet...");
    startTransition(async () => {
      try {
        const res = await syncSapEquipmentsAction(tenantId);
        if (res.success) {
          toast.success(res.message || "SAP PM Synchronisation erfolgreich abgeschlossen.");
          router.refresh();
        } else {
          toast.error(res.error || "Fehler beim Abgleich mit SAP PM.");
        }
      } catch (e: any) {
        toast.error(e?.message || "Netzwerkfehler bei SAP-Synchronisation.");
      } finally {
        setIsSyncing(false);
      }
    });
  };

  // Rollenwechsel (zur interaktiven Verifikation der RBAC-Sperren)
  const handleSwitchRole = (newRole: string) => {
    setCurrentRole(newRole);
    startTransition(async () => {
      try {
        await switchUserRoleAction(newRole);
        toast.info(`Rolle gewechselt zu: ${newRole}`);
        router.refresh();
      } catch {
        // Ignoriere
      }
    });
  };

  // SAP-Modus umschalten (zur Verifikation der ERP-Sperre)
  const handleToggleSapMode = (enableSap: boolean) => {
    setSapModeActive(enableSap);
    const newMode = enableSap ? "ODATA_V4" : "STANDALONE";
    startTransition(async () => {
      try {
        const res = await toggleSapModeAction(tenantId, newMode);
        if (res.success) {
          toast.success(
            enableSap
              ? "SAP PM Modus aktiviert: Anlagenstruktur ist schreibgeschützt."
              : "Standalone Modus aktiviert: Lokale Pflege freigeschaltet."
          );
          router.refresh();
        }
      } catch {
        // Offline fallback
      }
    });
  };

  // CRUD Handler
  const handleOpenCreateArea = () => {
    setFormData({ code: "", name: "", description: "" });
    setModalType("CREATE_AREA");
  };

  const handleOpenCreateFloc = (areaId?: string) => {
    setFormData({
      areaId: areaId || normalizedAreas[0]?.id || "",
      code: "",
      name: "",
      costCenter: "",
      plantSection: "",
    });
    setModalType("CREATE_FLOC");
  };

  const handleOpenCreateEquipment = (flocId?: string, parentEqId?: string) => {
    setFormData({
      functionalLocationId: flocId || "",
      parentEquipmentId: parentEqId || "",
      equipmentNumber: "",
      name: "",
      manufacturer: "",
      modelType: "",
      serialNumber: "",
      criticality: "B",
      status: "ACTIVE",
      operatingHoursCounter: "0.00",
      isAssembly: Boolean(parentEqId),
    });
    setModalType("CREATE_EQUIPMENT");
  };

  const handleOpenEdit = (item: any, type: string) => {
    setModalTarget({ item, type });
    setFormData({
      name: item.name || "",
      description: item.description || "",
      code: item.code || item.equipmentNumber || "",
      costCenter: item.costCenter || "",
      plantSection: item.plantSection || "",
      manufacturer: item.manufacturer || "",
      modelType: item.modelType || "",
      serialNumber: item.serialNumber || "",
      operatingHoursCounter: item.operatingHoursCounter || "0.00",
      status: item.status || "ACTIVE",
      criticality: item.criticality || "B",
    });
    setModalType("EDIT");
  };

  const handleOpenDelete = (item: any, type: string) => {
    setModalTarget({ item, type });
    setModalType("DELETE");
  };

  const handleSubmitModal = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    startTransition(async () => {
      try {
        if (modalType === "CREATE_AREA") {
          const res = await createAreaAction({
            tenantId,
            code: formData.code,
            name: formData.name,
            description: formData.description,
          });
          if (res.success) {
            toast.success(`Bereich "${formData.name}" erfolgreich angelegt.`);
            setModalType(null);
            router.refresh();
          } else {
            toast.error(res.error || "Fehler beim Anlegen.");
          }
        } else if (modalType === "CREATE_FLOC") {
          const res = await createFunctionalLocationAction({
            tenantId,
            areaId: formData.areaId,
            code: formData.code,
            name: formData.name,
            costCenter: formData.costCenter,
            plantSection: formData.plantSection,
          });
          if (res.success) {
            toast.success(`Technischer Platz "${formData.name}" angelegt.`);
            setModalType(null);
            router.refresh();
          } else {
            toast.error(res.error || "Fehler beim Anlegen.");
          }
        } else if (modalType === "CREATE_EQUIPMENT") {
          const res = await createEquipmentAction({
            tenantId,
            functionalLocationId: formData.functionalLocationId || null,
            parentEquipmentId: formData.parentEquipmentId || null,
            isAssembly: Boolean(formData.parentEquipmentId || formData.isAssembly),
            equipmentNumber: formData.equipmentNumber,
            name: formData.name,
            manufacturer: formData.manufacturer,
            modelType: formData.modelType,
            serialNumber: formData.serialNumber,
            criticality: formData.criticality,
            status: formData.status,
            operatingHoursCounter: formData.operatingHoursCounter,
          });
          if (res.success) {
            toast.success(`Equipment "${formData.name}" erfolgreich hinzugefügt.`);
            setModalType(null);
            router.refresh();
          } else {
            toast.error(res.error || "Fehler beim Anlegen.");
          }
        } else if (modalType === "EDIT") {
          const { item, type } = modalTarget;
          if (type === "AREA") {
            const res = await updateAreaAction({
              id: item.id,
              tenantId,
              name: formData.name,
              code: formData.code,
              description: formData.description,
            });
            if (res.success) {
              toast.success("Bereich aktualisiert.");
              setModalType(null);
              router.refresh();
            } else toast.error(res.error);
          } else if (type === "FLOC") {
            const res = await updateFunctionalLocationAction({
              id: item.id,
              tenantId,
              name: formData.name,
              code: formData.code,
              costCenter: formData.costCenter,
              plantSection: formData.plantSection,
            });
            if (res.success) {
              toast.success("Technischer Platz aktualisiert.");
              setModalType(null);
              router.refresh();
            } else toast.error(res.error);
          } else {
            const res = await updateEquipmentAction({
              id: item.id,
              tenantId,
              name: formData.name,
              manufacturer: formData.manufacturer,
              modelType: formData.modelType,
              serialNumber: formData.serialNumber,
              criticality: formData.criticality,
              status: formData.status,
              operatingHoursCounter: formData.operatingHoursCounter,
            });
            if (res.success) {
              toast.success("Equipment-Stammdaten aktualisiert.");
              if (selectedNode && selectedNode.item.id === item.id) {
                selectedNode.item.name = formData.name;
                selectedNode.item.operatingHoursCounter = formData.operatingHoursCounter;
                selectedNode.item.status = formData.status;
              }
              setModalType(null);
              router.refresh();
            } else toast.error(res.error);
          }
        } else if (modalType === "DELETE") {
          const { item, type } = modalTarget;
          if (type === "AREA") {
            const res = await deleteAreaAction(item.id, tenantId);
            if (res.success) {
              toast.success("Bereich gelöscht.");
              setModalType(null);
              router.refresh();
            } else toast.error(res.error);
          } else if (type === "FLOC") {
            const res = await deleteFunctionalLocationAction(item.id, tenantId);
            if (res.success) {
              toast.success("Technischer Platz gelöscht.");
              setModalType(null);
              router.refresh();
            } else toast.error(res.error);
          } else {
            const res = await deleteEquipmentAction(item.id, tenantId);
            if (res.success) {
              toast.success("Equipment gelöscht.");
              setModalType(null);
              router.refresh();
            } else toast.error(res.error);
          }
        }
      } finally {
        setIsSubmitting(false);
      }
    });
  };

  return (
    <div className="space-y-5">
      {/* ========================================================================= */}
      {/* 1. KOPFZEILE: SIMULATIONS- & TESTLEISTE FÜR ROLLE & SAP-MODUS            */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-cyan-400 shrink-0" />
          <span className="text-slate-400 font-medium">Aktive Benutzerrolle:</span>
          <select
            value={currentRole}
            onChange={(e) => handleSwitchRole(e.target.value)}
            className="h-7 px-2.5 rounded bg-slate-950 border border-slate-700 text-white font-semibold text-xs focus:ring-1 focus:ring-cyan-500"
          >
            <option value="ADMIN">ADMIN (Vollzugriff / Anlagenverwaltung)</option>
            <option value="TECHNICIAN">TECHNICIAN (Instandhalter - Nur lesend)</option>
            <option value="COORDINATOR">COORDINATOR (Koordinator - Nur lesend)</option>
            <option value="OPERATOR">OPERATOR (Maschinenbediener - Nur lesend)</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Globaler Betriebsmodus:</span>
            <Link
              href="/admin"
              title="Globale Einstellung in 'Administration & SAP' konfigurieren"
              className={`px-2.5 py-1 rounded text-xs font-semibold border transition-all flex items-center gap-1.5 group ${
                sapModeActive
                  ? "bg-cyan-950/80 text-cyan-300 border-cyan-700 hover:border-blue-500"
                  : "bg-emerald-950/60 text-emerald-300 border-emerald-800 hover:border-emerald-600"
              }`}
            >
              <Database className="h-3 w-3 text-cyan-400" />
              <span>
                {sapModeActive ? "SAP PM ERP-Sync (Schreibgeschützt)" : "Standalone (Lokal freigeschaltet)"}
              </span>
              <Settings2 className="h-3 w-3 text-slate-500 group-hover:text-white transition-colors" />
            </Link>
          </div>

          {/* Standalone Admin-Aktionen */}
          {canCreateOrEdit && (
            <div className="flex items-center gap-1.5 border-l border-slate-800 pl-3">
              <Button
                size="sm"
                variant="outline"
                onClick={handleOpenCreateArea}
                className="h-7 text-xs border-slate-700 bg-slate-950 hover:bg-slate-800 text-white gap-1"
              >
                <PlusCircle className="h-3 w-3 text-purple-400" />
                <span>+ Bereich anlegen</span>
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => handleOpenCreateFloc()}
                className="h-7 text-xs border-slate-700 bg-slate-950 hover:bg-slate-800 text-white gap-1"
              >
                <PlusCircle className="h-3 w-3 text-cyan-400" />
                <span>+ Platz anlegen</span>
              </Button>

              <Button
                size="sm"
                onClick={() => handleOpenCreateEquipment()}
                className="h-7 text-xs bg-cyan-600 hover:bg-cyan-500 text-white gap-1 font-semibold shadow-sm"
              >
                <PlusCircle className="h-3 w-3 text-white" />
                <span>+ Equipment hinzufügen</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. SAP-MODUS INFO-BANNER (WENN SAP PM SYNCHRONISATION AKTIV)             */}
      {/* ========================================================================= */}
      {sapModeActive && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-800/70 text-blue-200 animate-in fade-in duration-200 shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-900/60 border border-cyan-700/60 text-cyan-300">
              <Database className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-blue-200 flex items-center gap-2">
                <span>
                  SAP PM Synchronisation aktiv: Anlagenstruktur wird schreibgeschützt aus dem ERP repliziert.
                </span>
                <Badge
                  variant="outline"
                  className="text-[9px] font-bold bg-blue-900/60 border-cyan-700 text-cyan-300"
                >
                  ERP READ-ONLY
                </Badge>
              </div>
              <p className="text-[11px] text-cyan-300/80 mt-0.5">
                Bereiche, Technische Plätze und Equipments können nicht manuell bearbeitet werden.
                Änderungen erfolgen zentral in SAP S/4HANA PM.
              </p>
            </div>
          </div>

          {isAdmin && (
            <Button
              onClick={handleSyncSap}
              disabled={isSyncing}
              size="sm"
              className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shrink-0 gap-1.5 shadow-sm transition-all"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              <span>{isSyncing ? "Synchronisiere..." : "Jetzt aus SAP synchronisieren"}</span>
            </Button>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. MARKKANTE FILTER- & SUCHLEISTE (BEREICHS-TABS + SUCHFELD)              */}
      {/* ========================================================================= */}
      <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-3 shadow-lg">
        {/* OBERE ZEILE: BEREICHS-TABS / AUSWAHL */}
        <div className="flex items-center justify-between gap-3 flex-wrap border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 scrollbar-thin">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-2 flex items-center gap-1">
              <Factory className="h-3.5 w-3.5 text-purple-400" />
              Bereiche:
            </span>

            {/* Tab: Alle Bereiche */}
            <button
              type="button"
              onClick={() => handleAreaChange("ALL")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 border ${
                selectedAreaId === "ALL"
                  ? "bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/20"
                  : "bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700"
              }`}
            >
              Alle Bereiche ({normalizedAreas.length})
            </button>

            {/* Tabs für die einzelnen Bereiche */}
            {normalizedAreas.map((area) => {
              const isSelected = selectedAreaId === area.id || selectedAreaId === area.code;
              return (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => handleAreaChange(area.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 border flex items-center gap-1.5 ${
                    isSelected
                      ? "bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/20"
                      : "bg-slate-950 text-slate-300 border-slate-800 hover:text-white hover:border-slate-700"
                  }`}
                >
                  <Building2 className="h-3 w-3 text-purple-300" />
                  <span>{area.name}</span>
                  <span className="text-[10px] px-1 rounded bg-black/40 text-slate-300 font-mono">
                    {area.functionalLocations.length}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Dropdown für mobile / kompakte Ansicht */}
          <div className="sm:hidden w-full">
            <select
              value={selectedAreaId}
              onChange={(e) => handleAreaChange(e.target.value)}
              className="w-full h-8 px-2 rounded bg-slate-950 border border-slate-700 text-white text-xs"
            >
              <option value="ALL">Alle Bereiche anzeigen</option>
              {normalizedAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* UNTERE ZEILE: LIVE-SUCHFELD & SCHNELLFILTER */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Live-Suchfeld */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Live-Filter für Equipment-Nummer, Bezeichnung oder Technischer Platz (z. B. KUKA, W1-HALLE1, Pumpe)..."
              className="pl-9 h-9 text-xs bg-slate-950 border-slate-800 text-white focus:border-cyan-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => handleSearchChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter-Dropdowns */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            {/* Kritikalitätsfilter */}
            <select
              value={criticalityFilter}
              onChange={(e) => setCriticalityFilter(e.target.value)}
              className="h-9 px-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-xs focus:outline-none focus:border-slate-700"
            >
              <option value="ALL">Kritikalität: Alle</option>
              <option value="A">Klasse A (Engpass)</option>
              <option value="B">Klasse B (Wichtig)</option>
              <option value="C">Klasse C (Unkritisch)</option>
            </select>

            {/* Statusfilter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 px-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-xs focus:outline-none focus:border-slate-700"
            >
              <option value="ALL">Status: Alle</option>
              <option value="ACTIVE">In Betrieb</option>
              <option value="BREAKDOWN">Störung / Ausfall</option>
              <option value="IN_MAINTENANCE">In Wartung</option>
            </select>

            {/* Datenquelle Filter */}
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="h-9 px-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-xs focus:outline-none focus:border-slate-700"
            >
              <option value="ALL">Quelle: Alle</option>
              <option value="SAP">Nur SAP ERP</option>
              <option value="MANUAL">Nur Lokal / Manuell</option>
            </select>

            {/* Aufklappen / Zuklappen */}
            <Button
              variant="outline"
              size="sm"
              onClick={expandedNodes.size > 2 ? handleCollapseAll : handleExpandAll}
              className="h-9 px-2.5 text-xs border-slate-700 bg-slate-950 text-slate-300 hover:text-white shrink-0"
            >
              {expandedNodes.size > 2 ? "Zuklappen" : "Alles aufklappen"}
            </Button>
          </div>
        </div>

        {/* Aktive Filteranzeige */}
        {(searchQuery || selectedAreaId !== "ALL" || criticalityFilter !== "ALL" || statusFilter !== "ALL" || sourceFilter !== "ALL") && (
          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
            <span>
              Treffer: <strong className="text-white">{totalEquipmentsCount}</strong> Equipments gefunden
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedAreaId("ALL");
                setSearchQuery("");
                setCriticalityFilter("ALL");
                setStatusFilter("ALL");
                setSourceFilter("ALL");
                updateUrlParams("ALL", "");
              }}
              className="text-cyan-400 hover:underline flex items-center gap-1"
            >
              <X className="h-3 w-3" />
              <span>Filter zurücksetzen</span>
            </button>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. HAUPTLAYOUT: STRUKTURBAUM LINKS (7 COLS), DETAILKARTE RECHTS (5 COLS) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ========================================================================= */}
        {/* LINKER HIERARCHISCHER STRUKTURBAUM: 4 STUFEN                              */}
        {/* [Bereich] -> [Technischer Platz] -> [Equipment] -> [Baugruppe]           */}
        {/* ========================================================================= */}
        <Card className="lg:col-span-7 border-slate-800 bg-slate-900/60 p-4 shadow-xl space-y-2 min-h-[550px] max-h-[800px] overflow-y-auto scrollbar-thin">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Layers className="h-4 w-4 text-cyan-400" />
              Hierarchischer Strukturbaum (DIN 31051 / SAP PM)
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              [Bereich] ➔ [Technischer Platz] ➔ [Equipment] ➔ [Baugruppe]
            </span>
          </div>

          {filteredAreas.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs space-y-2">
              <p>Keine Einträge für die aktuellen Filterkriterien gefunden.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedAreaId("ALL");
                  setSearchQuery("");
                  setCriticalityFilter("ALL");
                  setStatusFilter("ALL");
                  setSourceFilter("ALL");
                }}
                className="text-xs border-slate-700 bg-slate-950"
              >
                Filter zurücksetzen
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredAreas.map((area) => {
                const areaKey = `area-${area.id}`;
                const isAreaExpanded = expandedNodes.has(areaKey);
                const isAreaSelected = selectedNode?.item?.id === area.id;

                return (
                  <div key={areaKey} className="space-y-1">
                    {/* STUFE 1: [BEREICH] */}
                    <div
                      onClick={() => {
                        setSelectedNode({
                          type: "AREA",
                          item: area,
                          breadcrumb: [area.name],
                          areaId: area.id,
                        });
                      }}
                      className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all border group ${
                        isAreaSelected
                          ? "bg-purple-950/70 border-purple-500 text-white shadow-md shadow-purple-950/40"
                          : "bg-slate-950/90 hover:bg-slate-800/60 border-slate-800 text-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          type="button"
                          onClick={(e) => toggleExpand(areaKey, e)}
                          className="p-1 rounded hover:bg-slate-800 text-slate-400 transition-colors"
                          title={isAreaExpanded ? "Zuklappen" : "Aufklappen"}
                        >
                          {isAreaExpanded ? (
                            <ChevronDown className="h-4 w-4 text-purple-400" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-purple-400" />
                          )}
                        </button>
                        <Factory className="h-4 w-4 text-purple-400 shrink-0" />
                        <div className="truncate">
                          <span className="font-bold text-xs truncate block text-white">
                            {area.name}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">
                            {area.code}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <SourceBadge source={area.source} />
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-mono">
                          {area.functionalLocations.length} Plätze
                        </span>

                        {/* Standalone Admin Aktionsmenü */}
                        {canCreateOrEdit && (
                          <div
                            className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => handleOpenCreateFloc(area.id)}
                              title="+ Technischer Platz hier anlegen"
                              className="p-1 rounded bg-slate-800 hover:bg-cyan-600 text-slate-300 hover:text-white"
                            >
                              <PlusCircle className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(area, "AREA")}
                              title="Bereich bearbeiten"
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenDelete(area, "AREA")}
                              title="Bereich löschen"
                              className="p-1 rounded bg-slate-800 hover:bg-red-900/60 text-rose-300"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* STUFE 2: [TECHNISCHER PLATZ] */}
                    {isAreaExpanded && (
                      <div className="pl-4 space-y-1 border-l-2 border-purple-900/40 ml-3.5 my-1">
                        {area.functionalLocations.map((floc) => {
                          const flocKey = `floc-${floc.id}`;
                          const isFlocExpanded = expandedNodes.has(flocKey);
                          const isFlocSelected = selectedNode?.item?.id === floc.id;

                          return (
                            <div key={flocKey} className="space-y-1">
                              <div
                                onClick={() => {
                                  setSelectedNode({
                                    type: "FLOC",
                                    item: floc,
                                    breadcrumb: [area.name, floc.name],
                                    areaId: area.id,
                                    flocId: floc.id,
                                  });
                                }}
                                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all border group ${
                                  isFlocSelected
                                    ? "bg-cyan-950/70 border-blue-500 text-white shadow-md shadow-blue-950/40"
                                    : "bg-slate-900/90 hover:bg-slate-800/50 border-slate-800/80 text-slate-300"
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <button
                                    type="button"
                                    onClick={(e) => toggleExpand(flocKey, e)}
                                    className="p-0.5 rounded hover:bg-slate-700 text-slate-400 transition-colors"
                                    title={isFlocExpanded ? "Zuklappen" : "Aufklappen"}
                                  >
                                    {isFlocExpanded ? (
                                      <ChevronDown className="h-3.5 w-3.5 text-cyan-400" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5 text-cyan-400" />
                                    )}
                                  </button>
                                  <MapPin className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                                  <div className="truncate">
                                    <span className="font-semibold text-xs truncate block text-slate-100">
                                      {floc.name}
                                    </span>
                                    <span className="font-mono text-[10px] text-slate-400">
                                      {floc.code}
                                      {floc.sapTplnr && ` • SAP: ${floc.sapTplnr}`}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <SourceBadge source={floc.source} />
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    {floc.equipments.length} Equipments
                                  </span>

                                  {/* Standalone Admin Aktionsmenü */}
                                  {canCreateOrEdit && (
                                    <div
                                      className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => handleOpenCreateEquipment(floc.id)}
                                        title="+ Equipment hier hinzufügen"
                                        className="p-1 rounded bg-slate-800 hover:bg-cyan-600 text-slate-300 hover:text-white"
                                      >
                                        <PlusCircle className="h-3 w-3" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEdit(floc, "FLOC")}
                                        title="Technischen Platz bearbeiten"
                                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                                      >
                                        <Edit2 className="h-3 w-3" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenDelete(floc, "FLOC")}
                                        title="Technischen Platz löschen"
                                        className="p-1 rounded bg-slate-800 hover:bg-red-900/60 text-rose-300"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* STUFE 3: [EQUIPMENT] */}
                              {isFlocExpanded && (
                                <div className="pl-4 space-y-1 border-l-2 border-blue-900/40 ml-3.5 my-1">
                                  {floc.equipments.map((eq) => {
                                    const eqKey = `eq-${eq.id}`;
                                    const hasSubs = eq.subEquipments && eq.subEquipments.length > 0;
                                    const isEqExpanded = expandedNodes.has(eqKey);
                                    const isEqSelected = selectedNode?.item?.id === eq.id;

                                    return (
                                      <div key={eqKey} className="space-y-1">
                                        <div
                                          onClick={() => {
                                            setSelectedNode({
                                              type: "EQUIPMENT",
                                              item: eq,
                                              breadcrumb: [area.name, floc.name, eq.name],
                                              areaId: area.id,
                                              flocId: floc.id,
                                            });
                                          }}
                                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all border group ${
                                            isEqSelected
                                              ? "bg-emerald-950/70 border-emerald-500 text-white shadow-md shadow-emerald-950/40"
                                              : "bg-slate-950/80 hover:bg-slate-800/40 border-slate-800/60 text-slate-200"
                                          }`}
                                        >
                                          <div className="flex items-center gap-2 min-w-0">
                                            {hasSubs ? (
                                              <button
                                                type="button"
                                                onClick={(e) => toggleExpand(eqKey, e)}
                                                className="p-0.5 rounded hover:bg-slate-700 text-slate-400"
                                                title={isEqExpanded ? "Zuklappen" : "Aufklappen"}
                                              >
                                                {isEqExpanded ? (
                                                  <ChevronDown className="h-3 w-3 text-emerald-400" />
                                                ) : (
                                                  <ChevronRight className="h-3 w-3 text-emerald-400" />
                                                )}
                                              </button>
                                            ) : (
                                              <span className="w-3.5" />
                                            )}

                                            {getStatusDot(eq.status)}
                                            <Cpu className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                            <div className="truncate">
                                              <span className="text-xs truncate block font-medium">
                                                {eq.name}
                                              </span>
                                              <span className="font-mono text-[10px] text-slate-400">
                                                {eq.equipmentNumber}
                                                {eq.sapEquipmentNr && ` • EQUNR: ${eq.sapEquipmentNr}`}
                                              </span>
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-1.5 shrink-0">
                                            {getCriticalityBadge(eq.criticality)}
                                            <SourceBadge source={eq.source} />

                                            {/* Standalone Admin Aktionsmenü */}
                                            {canCreateOrEdit && (
                                              <div
                                                className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={(e) => e.stopPropagation()}
                                              >
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    handleOpenCreateEquipment(floc.id, eq.id)
                                                  }
                                                  title="+ Baugruppe hier hinzufügen"
                                                  className="p-1 rounded bg-slate-800 hover:bg-purple-600 text-slate-300 hover:text-white"
                                                >
                                                  <PlusCircle className="h-3 w-3" />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => handleOpenEdit(eq, "EQUIPMENT")}
                                                  title="Equipment bearbeiten"
                                                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                                                >
                                                  <Edit2 className="h-3 w-3" />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => handleOpenDelete(eq, "EQUIPMENT")}
                                                  title="Equipment löschen"
                                                  className="p-1 rounded bg-slate-800 hover:bg-red-900/60 text-rose-300"
                                                >
                                                  <Trash2 className="h-3 w-3" />
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        </div>

                                        {/* STUFE 4: [BAUGRUPPE] */}
                                        {hasSubs && isEqExpanded && (
                                          <div className="pl-6 space-y-1 border-l-2 border-emerald-900/40 ml-3.5 my-1">
                                            {eq.subEquipments!.map((sub) => {
                                              const subKey = `sub-${sub.id}`;
                                              const isSubSelected =
                                                selectedNode?.item?.id === sub.id;

                                              return (
                                                <div
                                                  key={subKey}
                                                  onClick={() => {
                                                    setSelectedNode({
                                                      type: "SUB_EQUIPMENT",
                                                      item: sub,
                                                      breadcrumb: [
                                                        area.name,
                                                        floc.name,
                                                        eq.name,
                                                        sub.name,
                                                      ],
                                                      areaId: area.id,
                                                      flocId: floc.id,
                                                    });
                                                  }}
                                                  className={`flex items-center justify-between p-1.5 rounded-md cursor-pointer transition-all border group ${
                                                    isSubSelected
                                                      ? "bg-purple-950/80 border-purple-500 text-white shadow-sm"
                                                      : "hover:bg-slate-800/50 border-transparent text-slate-300"
                                                  }`}
                                                >
                                                  <div className="flex items-center gap-2 truncate">
                                                    {getStatusDot(sub.status)}
                                                    <Wrench className="h-3 w-3 text-purple-400 shrink-0" />
                                                    <span className="text-xs truncate font-medium">
                                                      {sub.name}
                                                    </span>
                                                    <span className="font-mono text-[10px] text-slate-400">
                                                      ({sub.equipmentNumber})
                                                    </span>
                                                  </div>

                                                  <div className="flex items-center gap-1.5 shrink-0">
                                                    {getCriticalityBadge(sub.criticality)}
                                                    <SourceBadge source={sub.source} />

                                                    {/* Standalone Admin Aktionsmenü */}
                                                    {canCreateOrEdit && (
                                                      <div
                                                        className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        onClick={(e) => e.stopPropagation()}
                                                      >
                                                        <button
                                                          type="button"
                                                          onClick={() =>
                                                            handleOpenEdit(sub, "SUB_EQUIPMENT")
                                                          }
                                                          title="Baugruppe bearbeiten"
                                                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                                                        >
                                                          <Edit2 className="h-3 w-3" />
                                                        </button>
                                                        <button
                                                          type="button"
                                                          onClick={() =>
                                                            handleOpenDelete(sub, "SUB_EQUIPMENT")
                                                          }
                                                          title="Baugruppe löschen"
                                                          className="p-1 rounded bg-slate-800 hover:bg-red-900/60 text-rose-300"
                                                        >
                                                          <Trash2 className="h-3 w-3" />
                                                        </button>
                                                      </div>
                                                    )}
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* ========================================================================= */}
        {/* RECHTE SPALTE (5 COLS): DETAILKARTE MIT STAMMDATEN, AUFTRÄGEN & HISTORIE  */}
        {/* ========================================================================= */}
        <div className="lg:col-span-5 space-y-4">
          {!selectedNode ? (
            <Card className="p-8 text-center bg-slate-900 border-slate-800 text-slate-400 text-xs">
              <Layers className="h-8 w-8 text-slate-600 mx-auto mb-2" />
              Wählen Sie ein Element im Strukturbaum aus, um Stammdaten, Wartungshistorie und offene Aufträge einzusehen.
            </Card>
          ) : (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Header-Kachel des ausgewählten Elements */}
              <Card className="p-5 bg-slate-900/90 border-slate-800 space-y-3 shadow-xl">
                {/* 4-stufige Breadcrumb-Navigation */}
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 flex-wrap">
                  {selectedNode.breadcrumb.map((crumb, idx) => (
                    <React.Fragment key={idx}>
                      <span
                        className={
                          idx === selectedNode.breadcrumb.length - 1
                            ? "text-cyan-400 font-semibold"
                            : "text-slate-400"
                        }
                      >
                        {crumb}
                      </span>
                      {idx < selectedNode.breadcrumb.length - 1 && <span>&gt;</span>}
                    </React.Fragment>
                  ))}
                </div>

                <div className="flex items-start justify-between border-b border-slate-800 pb-3 gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        {selectedNode.type === "AREA"
                          ? "Bereich / Halle"
                          : selectedNode.type === "FLOC"
                          ? "Technischer Platz"
                          : selectedNode.type === "EQUIPMENT"
                          ? "Equipment"
                          : "Baugruppe / Komponente"}
                      </span>
                      <SourceBadge source={selectedNode.item.source} />
                    </div>

                    <h2 className="text-base font-bold text-white tracking-tight">
                      {selectedNode.item.name}
                    </h2>
                    <span className="font-mono text-xs text-cyan-400">
                      {selectedNode.item.equipmentNumber ||
                        selectedNode.item.code ||
                        selectedNode.item.sapTplnr}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {selectedNode.item.criticality &&
                      getCriticalityBadge(selectedNode.item.criticality)}
                    {selectedNode.item.status && getStatusDot(selectedNode.item.status)}
                  </div>
                </div>

                {/* Absprung: Störung erfassen */}
                <div className="flex items-center gap-2 pt-1">
                  <Link
                    href={
                      selectedNode.type === "EQUIPMENT" || selectedNode.type === "SUB_EQUIPMENT"
                        ? `/orders/new?equipmentId=${selectedNode.item.id}`
                        : selectedNode.type === "FLOC"
                        ? `/orders/new?functionalLocationId=${selectedNode.item.id}`
                        : `/orders/new`
                    }
                    className="flex-1 py-1.5 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/20 transition-all"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-blue-200" />
                    <span>+ Störung für diese Einheit melden</span>
                  </Link>

                  {(selectedNode.type === "EQUIPMENT" || selectedNode.type === "SUB_EQUIPMENT") && (
                    <Link
                      href={`/equipments/${selectedNode.item.id}`}
                      className="h-8 px-2.5 rounded border border-slate-700 bg-slate-950 text-slate-300 hover:text-white hover:bg-slate-800 text-xs inline-flex items-center gap-1 font-medium transition-colors"
                      title="Detailansicht & Historie öffnen"
                    >
                      <ExternalLink className="h-3 w-3" />
                      <span>Detailansicht</span>
                    </Link>
                  )}

                  {canCreateOrEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenEdit(selectedNode.item, selectedNode.type)}
                      className="h-8 border-slate-700 bg-slate-950 text-slate-200 hover:text-white gap-1"
                    >
                      <Edit2 className="h-3 w-3" />
                      <span>Bearbeiten</span>
                    </Button>
                  )}
                </div>
              </Card>

              {/* TABS: Stammdaten, Offene Aufträge, Wartungshistorie */}
              <div className="flex items-center gap-1 border-b border-slate-800 pb-1">
                <button
                  type="button"
                  onClick={() => setDetailTab("specs")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    detailTab === "specs"
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Settings2 className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Stammdaten</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDetailTab("openOrders")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    detailTab === "openOrders"
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                  <span>Offene Aufträge</span>
                  {selectedNode.item.openOrders && selectedNode.item.openOrders.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-950 text-amber-300 font-bold border border-amber-800">
                      {selectedNode.item.openOrders.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setDetailTab("history")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    detailTab === "history"
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Clock className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Wartungshistorie</span>
                </button>
              </div>

              {/* TAB 1: STAMMDATEN */}
              {detailTab === "specs" && (
                <Card className="p-5 bg-slate-900 border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <Settings2 className="h-3.5 w-3.5 text-cyan-400" />
                      Technische Stammdaten
                    </h3>
                    <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-800">
                      {selectedNode.item.manufacturer || "Industriestandard"}
                    </Badge>
                  </div>

                  {selectedNode.type === "EQUIPMENT" || selectedNode.type === "SUB_EQUIPMENT" ? (
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                        <span className="text-slate-500 block text-[10px]">Hersteller / Typ:</span>
                        <span className="text-white font-medium block truncate">
                          {selectedNode.item.manufacturer || "Siemens / KUKA / SEW"} -{" "}
                          {selectedNode.item.modelType || "Standard"}
                        </span>
                      </div>

                      <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                        <span className="text-slate-500 block text-[10px]">Seriennummer:</span>
                        <span className="text-white font-mono block truncate">
                          {selectedNode.item.serialNumber || "SN-2024-8841"}
                        </span>
                      </div>

                      <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                        <span className="text-slate-500 block text-[10px]">Betriebsstunden:</span>
                        <span className="text-cyan-400 font-mono font-bold block">
                          {selectedNode.item.operatingHoursCounter || "0.00"} h
                        </span>
                      </div>

                      <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                        <span className="text-slate-500 block text-[10px]">SAP EQUNR:</span>
                        <span className="text-slate-200 font-mono block">
                          {selectedNode.item.sapEquipmentNr || "Nicht verknüpft (Lokal)"}
                        </span>
                      </div>

                      {selectedNode.item.yearOfManufacture && (
                        <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                          <span className="text-slate-500 block text-[10px]">Baujahr:</span>
                          <span className="text-white font-medium block">
                            {selectedNode.item.yearOfManufacture}
                          </span>
                        </div>
                      )}

                      <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                        <span className="text-slate-500 block text-[10px]">Kritikalität:</span>
                        <span className="text-white font-medium block">
                          Klasse {selectedNode.item.criticality || "B"} (DIN EN 13306)
                        </span>
                      </div>
                    </div>
                  ) : selectedNode.type === "FLOC" ? (
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                        <span className="text-slate-500 block text-[10px]">Kostenstelle (KOSTL):</span>
                        <span className="text-white font-mono block">
                          {selectedNode.item.costCenter || "KST-1100"}
                        </span>
                      </div>
                      <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                        <span className="text-slate-500 block text-[10px]">SAP Techn. Platz:</span>
                        <span className="text-slate-200 font-mono block">
                          {selectedNode.item.sapTplnr || "Nicht zugeordnet"}
                        </span>
                      </div>
                      <div className="p-2.5 rounded bg-slate-950 border border-slate-800 col-span-2">
                        <span className="text-slate-500 block text-[10px]">Betriebsbereich:</span>
                        <span className="text-white font-medium block">
                          {selectedNode.item.plantSection || "Zentralbereich Fertigung"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                        <span className="text-slate-500 block text-[10px]">Bereichs-Code:</span>
                        <span className="text-white font-mono block">
                          {selectedNode.item.code}
                        </span>
                      </div>
                      <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                        <span className="text-slate-500 block text-[10px]">Plätze im Bereich:</span>
                        <span className="text-white font-bold block">
                          {selectedNode.item.functionalLocations?.length || 0}
                        </span>
                      </div>
                      {selectedNode.item.description && (
                        <div className="p-2.5 rounded bg-slate-950 border border-slate-800 col-span-2">
                          <span className="text-slate-500 block text-[10px]">Beschreibung:</span>
                          <span className="text-slate-300 block">{selectedNode.item.description}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Technische Spezifikationen JSON falls vorhanden */}
                  {selectedNode.item.technicalSpecs &&
                    Object.keys(selectedNode.item.technicalSpecs).length > 0 && (
                      <div className="pt-2 border-t border-slate-800">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase block mb-1.5">
                          Erweiterte Spezifikationen
                        </span>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {Object.entries(selectedNode.item.technicalSpecs).map(
                            ([key, val]: [string, any]) => (
                              <div
                                key={key}
                                className="p-2 rounded bg-slate-950 border border-slate-800/80 font-mono text-[11px]"
                              >
                                <span className="text-slate-500 block text-[9px]">{key}</span>
                                <span className="text-slate-200">{String(val)}</span>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}
                </Card>
              )}

              {/* TAB 2: OFFENE AUFTRÄGE */}
              {detailTab === "openOrders" && (
                <Card className="p-5 bg-slate-900 border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                      Aktuell offene Instandhaltungsaufträge
                    </h3>
                  </div>

                  <div className="space-y-2">
                    {selectedNode.item.openOrders && selectedNode.item.openOrders.length > 0 ? (
                      selectedNode.item.openOrders.map((ord: OrderSummary) => (
                        <Link
                          key={ord.id}
                          href={`/orders/${ord.id}`}
                          className="p-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-amber-700/80 transition-colors block text-xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[11px] font-bold text-cyan-400">
                              {ord.orderNumber}
                            </span>
                            <Badge className="bg-amber-950 text-amber-300 border-amber-800 text-[10px]">
                              {ord.statusName || "In Bearbeitung"}
                            </Badge>
                          </div>
                          <div className="font-medium text-white">{ord.title}</div>
                          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-900">
                            <span>Priorität: {ord.priority}</span>
                            <span>{ord.createdAt}</span>
                          </div>
                        </Link>
                      ))
                    ) : (
                      <div className="p-6 text-center bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-400 space-y-1">
                        <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto mb-1" />
                        <p className="text-slate-300 font-medium">Keine offenen Störungen</p>
                        <p className="text-[11px] text-slate-500">
                          Für diese Einheit liegen aktuell keine offenen Instandhaltungsaufträge vor.
                        </p>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* TAB 3: WARTUNGSHISTORIE */}
              {detailTab === "history" && (
                <Card className="p-5 bg-slate-900 border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-emerald-400" />
                      Instandhaltungs-Historie & Maßnahmen
                    </h3>
                  </div>

                  <div className="space-y-2">
                    {selectedNode.item.recentOrders && selectedNode.item.recentOrders.length > 0 ? (
                      selectedNode.item.recentOrders.map((ord: OrderSummary) => (
                        <Link
                          key={ord.id}
                          href={`/orders/${ord.id}`}
                          className="p-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-emerald-700/80 transition-colors block text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[11px] font-bold text-cyan-400">
                              {ord.orderNumber}
                            </span>
                            <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-[10px]">
                              {ord.statusName || "TABG (Abgeschlossen)"}
                            </Badge>
                          </div>
                          <div className="font-medium text-white">{ord.title}</div>
                          {ord.resolutionSummary && (
                            <p className="text-[11px] text-slate-400 italic">
                              "{ord.resolutionSummary}"
                            </p>
                          )}
                          <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-900">
                            <span>Abgeschlossen</span>
                            <span>{ord.completedAt || ord.createdAt}</span>
                          </div>
                        </Link>
                      ))
                    ) : (
                      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[11px] font-bold text-cyan-400">
                            MO-2026-00412
                          </span>
                          <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-[10px]">
                            TABG
                          </Badge>
                        </div>
                        <div className="font-semibold text-white">
                          Wellenabdichtung & Lagertausch (Präventiv)
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Gleitringdichtung erneuert, Schmierstoffbefüllung nach Herstellervorgabe.
                        </p>
                        <span className="text-[10px] text-slate-500 block pt-1">
                          Vor 3 Tagen erfolgreich abgeschlossen
                        </span>
                      </div>
                    )}
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. MODAL-DIALOGE FÜR STANDALONE ADMIN-VERWALTUNG                         */}
      {/* ========================================================================= */}
      {modalType && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-100">
          <Card className="w-full max-w-lg bg-slate-900 border-slate-800 shadow-2xl p-6 text-white space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                {modalType === "CREATE_AREA" && "+ Neuen Bereich anlegen"}
                {modalType === "CREATE_FLOC" && "+ Neuen Technischen Platz anlegen"}
                {modalType === "CREATE_EQUIPMENT" &&
                  (formData.parentEquipmentId
                    ? "+ Neue Baugruppe / Funktionseinheit anlegen"
                    : "+ Neues Equipment hinzufügen")}
                {modalType === "EDIT" && "Stammdaten bearbeiten"}
                {modalType === "DELETE" && "Element löschen"}
              </h3>
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitModal} className="space-y-3 text-xs">
              {/* DELETE CONFIRM */}
              {modalType === "DELETE" ? (
                <div className="space-y-3">
                  <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-lg text-red-200 text-xs">
                    Sind Sie sicher, dass Sie <strong>"{modalTarget?.item?.name}"</strong> ({modalTarget?.item?.code || modalTarget?.item?.equipmentNumber}) unwiderruflich löschen möchten?
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setModalType(null)}
                      className="border-slate-700 bg-slate-950 text-slate-300"
                    >
                      Abbrechen
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="bg-rose-600 hover:bg-rose-500 text-white"
                    >
                      {isSubmitting ? "Lösche..." : "Endgültig löschen"}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {/* CREATE / EDIT FORMS */}
                  {modalType === "CREATE_AREA" && (
                    <>
                      <div>
                        <label className="text-slate-400 block mb-1">Bereichs-Code *</label>
                        <Input
                          required
                          value={formData.code || ""}
                          onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                          placeholder="z.B. AREA-04, HALLE-4"
                          className="bg-slate-950 border-slate-800 text-white h-11 min-h-[44px]"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Bereichsname *</label>
                        <Input
                          required
                          value={formData.name || ""}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="z.B. Bereich Montagehalle 4"
                          className="bg-slate-950 border-slate-800 text-white h-11 min-h-[44px]"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Beschreibung</label>
                        <Input
                          value={formData.description || ""}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          placeholder="Optionale Detailbeschreibung"
                          className="bg-slate-950 border-slate-800 text-white h-11 min-h-[44px]"
                        />
                      </div>
                    </>
                  )}

                  {modalType === "CREATE_FLOC" && (
                    <>
                      <div>
                        <label className="text-slate-400 block mb-1">Bereichszuordnung *</label>
                        <select
                          value={formData.areaId || ""}
                          onChange={(e) => setFormData({ ...formData, areaId: e.target.value })}
                          className="w-full h-11 min-h-[44px] px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs"
                        >
                          {normalizedAreas.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} ({a.code})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Technischer Platz Schlüssel (Code) *</label>
                        <Input
                          required
                          value={formData.code || ""}
                          onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                          placeholder="z.B. W1-HALLE3-MONT"
                          className="bg-slate-950 border-slate-800 text-white h-11 min-h-[44px]"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Bezeichnung *</label>
                        <Input
                          required
                          value={formData.name || ""}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="z.B. Halle 3: Endmontagelinie A"
                          className="bg-slate-950 border-slate-800 text-white h-11 min-h-[44px]"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Kostenstelle (KOSTL)</label>
                        <Input
                          value={formData.costCenter || ""}
                          onChange={(e) => setFormData({ ...formData, costCenter: e.target.value })}
                          placeholder="z.B. KST-1300"
                          className="bg-slate-950 border-slate-800 text-white h-11 min-h-[44px]"
                        />
                      </div>
                    </>
                  )}

                  {modalType === "CREATE_EQUIPMENT" && (
                    <>
                      <div>
                        <label className="text-slate-400 block mb-1">Technischer Platz *</label>
                        <select
                          value={formData.functionalLocationId || ""}
                          onChange={(e) =>
                            setFormData({ ...formData, functionalLocationId: e.target.value })
                          }
                          className="w-full h-11 min-h-[44px] px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs"
                        >
                          <option value="">-- Technischen Platz wählen --</option>
                          {normalizedAreas.flatMap((a) =>
                            a.functionalLocations.map((f) => (
                              <option key={f.id} value={f.id}>
                                {a.name} ➔ {f.name} ({f.code})
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Equipment-Nummer *</label>
                        <Input
                          required
                          value={formData.equipmentNumber || ""}
                          onChange={(e) =>
                            setFormData({ ...formData, equipmentNumber: e.target.value })
                          }
                          placeholder="z.B. EQ-10002010"
                          className="bg-slate-950 border-slate-800 text-white h-11 min-h-[44px]"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Bezeichnung *</label>
                        <Input
                          required
                          value={formData.name || ""}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="z.B. Drehstrommotor Antrieb 1"
                          className="bg-slate-950 border-slate-800 text-white h-11 min-h-[44px]"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-slate-400 block mb-1">Hersteller</label>
                          <Input
                            value={formData.manufacturer || ""}
                            onChange={(e) =>
                              setFormData({ ...formData, manufacturer: e.target.value })
                            }
                            placeholder="z.B. Siemens"
                            className="bg-slate-950 border-slate-800 text-white h-11 min-h-[44px]"
                          />
                        </div>
                        <div>
                          <label className="text-slate-400 block mb-1">Kritikalität</label>
                          <select
                            value={formData.criticality || "B"}
                            onChange={(e) =>
                              setFormData({ ...formData, criticality: e.target.value })
                            }
                            className="w-full h-11 min-h-[44px] px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs"
                          >
                            <option value="A">Klasse A (Engpass)</option>
                            <option value="B">Klasse B (Wichtig)</option>
                            <option value="C">Klasse C (Unkritisch)</option>
                          </select>
                        </div>
                      </div>
                    </>
                  )}

                  {modalType === "EDIT" && (
                    <>
                      <div>
                        <label className="text-slate-400 block mb-1">Bezeichnung *</label>
                        <Input
                          required
                          value={formData.name || ""}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="bg-slate-950 border-slate-800 text-white h-11 min-h-[44px]"
                        />
                      </div>
                      {modalTarget?.type === "EQUIPMENT" || modalTarget?.type === "SUB_EQUIPMENT" ? (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-slate-400 block mb-1">Betriebsstunden (h)</label>
                              <Input
                                value={formData.operatingHoursCounter || ""}
                                onChange={(e) =>
                                  setFormData({ ...formData, operatingHoursCounter: e.target.value })
                                }
                                className="bg-slate-950 border-slate-800 text-white h-11 min-h-[44px] font-mono"
                              />
                            </div>
                            <div>
                              <label className="text-slate-400 block mb-1">Status</label>
                              <select
                                value={formData.status || "ACTIVE"}
                                onChange={(e) =>
                                  setFormData({ ...formData, status: e.target.value })
                                }
                                className="w-full h-11 min-h-[44px] px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs"
                              >
                                <option value="ACTIVE">ACTIVE (In Betrieb)</option>
                                <option value="BREAKDOWN">BREAKDOWN (Störung)</option>
                                <option value="IN_MAINTENANCE">IN_MAINTENANCE (Wartung)</option>
                                <option value="DECOMMISSIONED">DECOMMISSIONED (Stillgelegt)</option>
                              </select>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div>
                          <label className="text-slate-400 block mb-1">Code / Kennung</label>
                          <Input
                            value={formData.code || ""}
                            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                            className="bg-slate-950 border-slate-800 text-white h-11 min-h-[44px] font-mono"
                          />
                        </div>
                      )}
                    </>
                  )}

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setModalType(null)}
                      className="border-slate-700 bg-slate-950 text-slate-300"
                    >
                      Abbrechen
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold"
                    >
                      {isSubmitting ? "Speichere..." : "Speichern"}
                    </Button>
                  </div>
                </>
              )}
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
