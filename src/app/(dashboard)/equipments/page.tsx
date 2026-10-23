import { Suspense } from "react";
import Link from "next/link";
import { db } from "@/db";
import {
  tenants,
  areas,
  functionalLocations,
  equipments,
  maintenanceOrders,
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  EquipmentTreeView,
  AreaNode,
  FunctionalLocationNode,
  EquipmentTreeNode,
  OrderSummary,
} from "@/components/equipments/equipment-tree-view";
import { getCurrentUserRbac } from "@/lib/rbac";
import { Cpu, PlusCircle, Layers, ShieldCheck, Database } from "lucide-react";

export const metadata = {
  title: "Anlagen & Equipmentstruktur | MaintAI Leitstand",
  description:
    "Hierarchische Baumstruktur (DIN 31051 / SAP PM): [Bereich] > [Technischer Platz] > [Equipment] > [Baugruppe]",
};

export default async function EquipmentsPage() {
  let areaNodes: AreaNode[] = [];
  let userRole = "ADMIN";
  let isSapMode = false;
  let tenantId = "demo-tenant-1000";

  try {
    // 1. RBAC Benutzerinformationen laden
    const userRbac = await getCurrentUserRbac();
    userRole = userRbac.roleCode || "ADMIN";

    // 2. Mandant & SAP-Betriebsmodus laden
    const tenant = await db.query.tenants.findFirst();

    if (tenant) {
      tenantId = tenant.id;
      isSapMode =
        (process.env.SAP_MODE && process.env.SAP_MODE !== "STANDALONE") ||
        tenant.sapSyncMode !== "STANDALONE";

      // 3. Bereiche laden
      const dbAreas = await db.query.areas.findMany({
        where: eq(areas.tenantId, tenant.id),
        orderBy: [desc(areas.createdAt)],
      });

      // 4. Technische Plätze laden
      const dbLocations = await db.query.functionalLocations.findMany({
        where: eq(functionalLocations.tenantId, tenant.id),
        orderBy: [desc(functionalLocations.createdAt)],
      });

      // 5. Equipments laden
      const dbEquipments = await db.query.equipments.findMany({
        where: eq(equipments.tenantId, tenant.id),
        orderBy: [desc(equipments.createdAt)],
      });

      // 6. Aufträge (offen & Historie) laden
      const dbOrders = await db.query.maintenanceOrders.findMany({
        where: eq(maintenanceOrders.tenantId, tenant.id),
        with: {
          currentStatus: true,
          assignedToUser: true,
        },
        orderBy: [desc(maintenanceOrders.createdAt)],
        limit: 150,
      });

      // Hilfsfunktion: Aufträge für ein Asset zuordnen
      const getAssetOrders = (equipmentId?: string, flocId?: string) => {
        const matches = dbOrders.filter((ord) => {
          if (equipmentId && ord.equipmentId === equipmentId) return true;
          if (flocId && ord.functionalLocationId === flocId) return true;
          return false;
        });

        const open: OrderSummary[] = [];
        const recent: OrderSummary[] = [];

        matches.forEach((o) => {
          const isCompleted =
            o.currentStatus?.code === "TABG" ||
            o.currentStatus?.code === "CLOSED" ||
            o.currentStatus?.code === "COMPLETED";

          const summary: OrderSummary = {
            id: o.id,
            orderNumber: o.orderNumber,
            title: o.title,
            priority: o.priority,
            statusCode: o.currentStatus?.code,
            statusName: o.currentStatus?.name || (isCompleted ? "TABG" : "In Bearbeitung"),
            createdAt: new Date(o.createdAt).toLocaleDateString("de-DE"),
            completedAt: o.actualEndAt
              ? new Date(o.actualEndAt).toLocaleDateString("de-DE")
              : undefined,
            resolutionSummary: o.resolutionSummary || undefined,
            assignedTo: o.assignedToUser
              ? `${o.assignedToUser.firstName} ${o.assignedToUser.lastName}`
              : undefined,
          };

          if (isCompleted) {
            recent.push(summary);
          } else {
            open.push(summary);
          }
        });

        return { open, recent };
      };

      // Hilfsfunktion: Equipments für einen Technischen Platz mappen
      const mapEquipmentsForFloc = (flocId: string): EquipmentTreeNode[] => {
        const mainEquips = dbEquipments.filter(
          (e) => e.functionalLocationId === flocId && !e.parentEquipmentId
        );

        return mainEquips.map((eqItem) => {
          const subs = dbEquipments
            .filter((sub) => sub.parentEquipmentId === eqItem.id)
            .map((sub) => {
              const subOrders = getAssetOrders(sub.id, flocId);
              return {
                id: sub.id,
                equipmentNumber: sub.equipmentNumber,
                name: sub.name,
                description: sub.description,
                manufacturer: sub.manufacturer,
                modelType: sub.modelType,
                serialNumber: sub.serialNumber,
                yearOfManufacture: sub.yearOfManufacture,
                criticality: (sub.criticality as any) || "B",
                status: (sub.status as any) || "ACTIVE",
                operatingHoursCounter: sub.operatingHoursCounter,
                sapEquipmentNr: sub.sapEquipmentNr,
                technicalSpecs: (sub.technicalSpecs as any) || {},
                parentEquipmentId: sub.parentEquipmentId,
                functionalLocationId: sub.functionalLocationId,
                source: (sub.source as any) || (sub.sapEquipmentNr ? "SAP" : "MANUAL"),
                isAssembly: true,
                openOrders: subOrders.open,
                recentOrders: subOrders.recent,
              };
            });

          const eqOrders = getAssetOrders(eqItem.id, flocId);

          return {
            id: eqItem.id,
            equipmentNumber: eqItem.equipmentNumber,
            name: eqItem.name,
            description: eqItem.description,
            manufacturer: eqItem.manufacturer,
            modelType: eqItem.modelType,
            serialNumber: eqItem.serialNumber,
            yearOfManufacture: eqItem.yearOfManufacture,
            criticality: (eqItem.criticality as any) || "B",
            status: (eqItem.status as any) || "ACTIVE",
            operatingHoursCounter: eqItem.operatingHoursCounter,
            sapEquipmentNr: eqItem.sapEquipmentNr,
            technicalSpecs: (eqItem.technicalSpecs as any) || {},
            parentEquipmentId: eqItem.parentEquipmentId,
            functionalLocationId: eqItem.functionalLocationId,
            source: (eqItem.source as any) || (eqItem.sapEquipmentNr ? "SAP" : "MANUAL"),
            isAssembly: false,
            subEquipments: subs,
            openOrders: eqOrders.open,
            recentOrders: eqOrders.recent,
          };
        });
      };

      // 7. Struktur mit Bereichen aufbauen
      if (dbAreas.length > 0) {
        areaNodes = dbAreas.map((areaItem) => {
          const flocsInArea = dbLocations.filter(
            (floc) =>
              floc.areaId === areaItem.id ||
              floc.plantSection?.toLowerCase().includes(areaItem.name.toLowerCase()) ||
              floc.plantSection?.toLowerCase().includes(areaItem.code.toLowerCase())
          );

          const flocNodes: FunctionalLocationNode[] = flocsInArea.map((floc) => {
            const flocOrders = getAssetOrders(undefined, floc.id);
            return {
              id: floc.id,
              code: floc.code,
              name: floc.name,
              areaId: areaItem.id,
              plantSection: floc.plantSection || areaItem.name,
              costCenter: floc.costCenter,
              sapTplnr: floc.sapTplnr,
              source: (floc.source as any) || (floc.sapTplnr ? "SAP" : "MANUAL"),
              equipments: mapEquipmentsForFloc(floc.id),
              openOrders: flocOrders.open,
              recentOrders: flocOrders.recent,
            };
          });

          return {
            id: areaItem.id,
            code: areaItem.code,
            name: areaItem.name,
            description: areaItem.description,
            source: (areaItem.source as any) || "SAP",
            functionalLocations: flocNodes,
          };
        });
      } else if (dbLocations.length > 0) {
        // Fallback: Gruppierung nach plantSection
        const secMap = new Map<string, typeof dbLocations>();
        dbLocations.forEach((floc) => {
          const sec = floc.plantSection || "Zentralbereich Fertigung";
          if (!secMap.has(sec)) secMap.set(sec, []);
          secMap.get(sec)!.push(floc);
        });

        areaNodes = Array.from(secMap.entries()).map(([secName, flocs], idx) => ({
          id: `area-sec-${idx}`,
          code: `AREA-0${idx + 1}`,
          name: secName,
          source: flocs.some((f) => f.sapTplnr) ? "SAP" : "MANUAL",
          functionalLocations: flocs.map((floc) => {
            const flocOrders = getAssetOrders(undefined, floc.id);
            return {
              id: floc.id,
              code: floc.code,
              name: floc.name,
              plantSection: secName,
              costCenter: floc.costCenter,
              sapTplnr: floc.sapTplnr,
              source: (floc.source as any) || (floc.sapTplnr ? "SAP" : "MANUAL"),
              equipments: mapEquipmentsForFloc(floc.id),
              openOrders: flocOrders.open,
              recentOrders: flocOrders.recent,
            };
          }),
        }));
      }
    }
  } catch (err) {
    console.warn("EquipmentsPage DB fallback:", err);
  }

  // Graceful Fallback-Daten falls DB offline / leer ist
  if (areaNodes.length === 0) {
    areaNodes = [
      {
        id: "area-1",
        code: "AREA-PROD-1",
        name: "Bereich Fertigung 1 (Automation & Logistik)",
        description: "Robotikzellen, Gurt- und Kettenfördersysteme, Pufferstrecken",
        source: "SAP",
        functionalLocations: [
          {
            id: "floc-1",
            code: "W1-HALLE1-ROB",
            name: "Halle 1: Robotik & Automation",
            areaId: "area-1",
            plantSection: "Fertigung 1",
            costCenter: "KST-1100",
            sapTplnr: "TPL-1000-01",
            source: "SAP",
            equipments: [
              {
                id: "eq-1",
                equipmentNumber: "EQ-10001001",
                name: "KUKA KR 210 R2700 prime - Roboterzelle 1",
                description:
                  "6-Achs-Industrieroboter für Schwerlast-Handling und Punktschweißen",
                manufacturer: "KUKA Roboter GmbH",
                modelType: "KR 210 R2700",
                serialNumber: "SN-KU-992140",
                yearOfManufacture: 2021,
                criticality: "A",
                status: "ACTIVE",
                operatingHoursCounter: "14850.50",
                sapEquipmentNr: "10001001",
                source: "SAP",
                isAssembly: false,
                openOrders: [
                  {
                    id: "ord-open-1",
                    orderNumber: "MO-2026-00481",
                    title: "Zyklische Schmierstoffinspektion Achse 1-3",
                    priority: "3_MEDIUM",
                    statusName: "In Bearbeitung",
                    createdAt: "Heute, 08:30",
                    assignedTo: "Thomas Techniker",
                  },
                ],
                recentOrders: [
                  {
                    id: "ord-rec-1",
                    orderNumber: "MO-2026-00392",
                    title: "Kalibrierung Nullpunkt & Werkzeugvermessung",
                    priority: "2_HIGH",
                    statusName: "TABG",
                    createdAt: "Vor 5 Tagen",
                    completedAt: "Vor 4 Tagen",
                    resolutionSummary:
                      "Sensorik neu eingemessen, Koordinatensystem erfolgreich abgeglichen.",
                  },
                ],
                subEquipments: [
                  {
                    id: "sub-1-1",
                    equipmentNumber: "EQ-10001001-A1",
                    name: "Achse 1 Getriebemodul (Zykloidgetriebe)",
                    manufacturer: "Nabtesco",
                    criticality: "A",
                    status: "ACTIVE",
                    operatingHoursCounter: "14850.50",
                    sapEquipmentNr: "10001001-A1",
                    source: "SAP",
                    isAssembly: true,
                    recentOrders: [
                      {
                        id: "sub-rec-1",
                        orderNumber: "MO-2026-00120",
                        title: "Getriebeölwechsel VG 150",
                        priority: "3_MEDIUM",
                        statusName: "TABG",
                        createdAt: "Vor 3 Wochen",
                        completedAt: "Vor 3 Wochen",
                        resolutionSummary: "Ölprobe gezogen, Dichtungsringe erneuert.",
                      },
                    ],
                  },
                  {
                    id: "sub-1-2",
                    equipmentNumber: "EQ-10001001-SZ",
                    name: "Schweißzange Servo-Pneumatik",
                    manufacturer: "Düring Schweißtechnik",
                    criticality: "B",
                    status: "ACTIVE",
                    operatingHoursCounter: "12300.00",
                    source: "MANUAL",
                    isAssembly: true,
                    openOrders: [
                      {
                        id: "sub-open-1",
                        orderNumber: "MO-2026-00511",
                        title: "Elektrodenkappen nachfräsen",
                        priority: "2_HIGH",
                        statusName: "Neu",
                        createdAt: "Heute, 11:15",
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            id: "floc-2",
            code: "W1-HALLE1-CONV",
            name: "Halle 1: Fördersysteme & Logistik",
            areaId: "area-1",
            plantSection: "Fertigung 1",
            costCenter: "KST-1120",
            sapTplnr: "TPL-1000-02",
            source: "SAP",
            equipments: [
              {
                id: "eq-2",
                equipmentNumber: "EQ-10001002",
                name: "SEW Movitrac B - Hauptantrieb Förderband 4",
                description:
                  "Getriebemotor mit integriertem Frequenzumrichter für Gurtförderband",
                manufacturer: "SEW-EURODRIVE GmbH",
                modelType: "MC07B0015-5A3-4-00",
                serialNumber: "SN-SEW-441209",
                yearOfManufacture: 2020,
                criticality: "B",
                status: "ACTIVE",
                operatingHoursCounter: "22340.00",
                sapEquipmentNr: "10001002",
                source: "SAP",
                isAssembly: false,
                subEquipments: [
                  {
                    id: "sub-2-1",
                    equipmentNumber: "EQ-10001002-FU",
                    name: "Frequenzumrichter Movitrac MC07B",
                    manufacturer: "SEW-EURODRIVE",
                    criticality: "B",
                    status: "ACTIVE",
                    operatingHoursCounter: "22340.00",
                    source: "SAP",
                    isAssembly: true,
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "area-2",
        code: "AREA-PROD-2",
        name: "Bereich Fertigung 2 (Zerspanung & Blechbearbeitung)",
        description: "CNC-Fräszentren, Laser-Schneidanlagen, Abkantpressen",
        source: "SAP",
        functionalLocations: [
          {
            id: "floc-3",
            code: "W1-HALLE2-MACH",
            name: "Halle 2: Zerspanung & Blechbearbeitung",
            areaId: "area-2",
            plantSection: "Fertigung 2",
            costCenter: "KST-1200",
            sapTplnr: "TPL-1000-03",
            source: "SAP",
            equipments: [
              {
                id: "eq-4",
                equipmentNumber: "EQ-10001006",
                name: "TRUMPF TruLaser 3030 - Faserlaser 4kW",
                description:
                  "2D-Laserschneidanlage mit TruDisk Festkörperlaser und automatischem Palettenwechsler",
                manufacturer: "TRUMPF GmbH + Co. KG",
                modelType: "TruLaser 3030 fiber (L49)",
                serialNumber: "SN-TR-3030-9182",
                yearOfManufacture: 2022,
                criticality: "A",
                status: "ACTIVE",
                operatingHoursCounter: "9820.00",
                sapEquipmentNr: "10001006",
                source: "SAP",
                isAssembly: false,
                openOrders: [],
                recentOrders: [
                  {
                    id: "rec-laser-1",
                    orderNumber: "MO-2026-00210",
                    title: "Schutzglas-Inspektion & Linsenkalibrierung",
                    priority: "2_HIGH",
                    statusName: "TABG",
                    createdAt: "Vor 2 Wochen",
                    resolutionSummary:
                      "Schutzglas an Schneidkopf getauscht, Fokuslage neu vermessen.",
                  },
                ],
                subEquipments: [
                  {
                    id: "sub-4-1",
                    equipmentNumber: "EQ-10001006-SK",
                    name: "Laser-Schneidkopf mit Auto-Fokus",
                    manufacturer: "TRUMPF",
                    criticality: "A",
                    status: "ACTIVE",
                    operatingHoursCounter: "9820.00",
                    source: "MANUAL",
                    isAssembly: true,
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "area-3",
        code: "AREA-INFRA",
        name: "Bereich Infrastruktur & Zentrale Medien",
        description:
          "Kühlschmierstoff-Aufbereitung, Druckluftkompressoren, Hydraulikzentrale",
        source: "MANUAL",
        functionalLocations: [
          {
            id: "floc-4",
            code: "W1-MEDIEN-CENTRAL",
            name: "Werk 1 - Zentrale Medienversorgung & Hydraulik",
            areaId: "area-3",
            plantSection: "Infrastruktur",
            costCenter: "KST-1900",
            sapTplnr: "TPL-1000-04",
            source: "SAP",
            equipments: [
              {
                id: "eq-3",
                equipmentNumber: "EQ-10042",
                name: "Kreiselpumpe KSB Etanorm 050-200",
                description: "Spiralgehäusepumpe für Prozesswasserkreislauf",
                manufacturer: "KSB SE & Co. KGaA",
                modelType: "Etanorm G01",
                serialNumber: "SN-2024-8841",
                criticality: "A",
                status: "BREAKDOWN",
                operatingHoursCounter: "8910.00",
                sapEquipmentNr: "10042819",
                source: "SAP",
                isAssembly: false,
                openOrders: [
                  {
                    id: "ord-open-pump",
                    orderNumber: "MO-2026-00499",
                    title: "Stillstand: Lagerschaden & Kavitationsgeräusche",
                    priority: "1_EMERGENCY",
                    statusName: "In Bearbeitung",
                    createdAt: "Heute, 06:45",
                    assignedTo: "Thomas Techniker",
                  },
                ],
                recentOrders: [
                  {
                    id: "ord-rec-pump",
                    orderNumber: "MO-2026-00412",
                    title: "Wellenabdichtung & Lagertausch",
                    priority: "2_HIGH",
                    statusName: "TABG",
                    createdAt: "Vor 3 Tagen",
                    resolutionSummary:
                      "Gleitringdichtung getauscht, Schmierstoff erneuert.",
                  },
                ],
                subEquipments: [
                  {
                    id: "sub-3-1",
                    equipmentNumber: "EQ-10042-LAG",
                    name: "Wälzlagergruppe A-Seite SKF 6208",
                    manufacturer: "SKF",
                    criticality: "A",
                    status: "BREAKDOWN",
                    operatingHoursCounter: "8910.00",
                    source: "MANUAL",
                    isAssembly: true,
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
            <span className="text-cyan-400 font-medium">Stammdatenverwaltung</span>
            <span>/</span>
            <span>Hierarchische Anlagenstruktur</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Cpu className="h-7 w-7 text-cyan-500" />
            Anlagen- &amp; Equipmentstruktur
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1 max-w-3xl">
            4-stufige navigierbare Struktur nach DIN 31051 &amp; SAP PM:{" "}
            <span className="text-purple-400 font-semibold">[Bereich]</span> ➔{" "}
            <span className="text-cyan-400 font-semibold">[Technischer Platz]</span> ➔{" "}
            <span className="text-emerald-400 font-semibold">[Equipment]</span> ➔{" "}
            <span className="text-purple-300 font-semibold">[Baugruppe]</span> inkl. Stammdaten,
            Wartungshistorie und SAP ERP Synchronisationsstatus.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/orders/new"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span>Störung erfassen</span>
          </Link>
        </div>
      </div>

      {/* Interaktive Anlagenbaum-Komponente */}
      <Suspense
        fallback={
          <div className="p-8 flex items-center justify-center text-slate-400 text-sm">
            Lade Anlagen- &amp; Equipmentstruktur...
          </div>
        }
      >
        <EquipmentTreeView
          areas={areaNodes}
          userRole={userRole}
          isSapMode={isSapMode}
          tenantId={tenantId}
        />
      </Suspense>
    </div>
  );
}
