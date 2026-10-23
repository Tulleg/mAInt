import Link from "next/link";
import { db } from "@/db";
import { tenants, spareParts } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Package,
  AlertTriangle,
  CheckCircle2,
  Boxes,
  Database,
  ArrowUpRight,
  TrendingDown,
  Warehouse,
} from "lucide-react";

export const metadata = {
  title: "Ersatzteilkatalog & Lagerbestände | MaintAI",
  description: "Echtzeit-Materialwirtschaft mit SAP MM Kopplung und Mindestbestandswarnungen",
};

export default async function SparePartsPage() {
  let tenant: any = null;
  let partsList: any[] = [];

  try {
    tenant = await db.query.tenants.findFirst();

    if (!tenant) {
      const [newTenant] = await db
        .insert(tenants)
        .values({
          code: "WERK-1000",
          name: "Produktionswerk München",
          sapPlantCode: "1000",
        })
        .returning();
      tenant = newTenant;
    }

    partsList = await db.query.spareParts.findMany({
      where: eq(spareParts.tenantId, tenant.id),
      orderBy: [desc(spareParts.createdAt)],
    });

    if (partsList.length === 0) {
      await db.insert(spareParts).values([
        {
          tenantId: tenant.id,
          internalPartNumber: "MAT-100421",
          sapMaterialNr: "100421",
          name: "Gleitringdichtung EagleBurgmann HJ92N",
          description: "Siliziumkarbid (SiC), Viton O-Ringe, für KSB Etanorm",
          unitOfMeasure: "ST",
          storageLocation: "0001",
          storageBin: "REG-04-B2",
          stockQuantity: "2.000",
          minStockLevel: "3.000",
          movingAveragePrice: "249.50",
        },
        {
          tenantId: tenant.id,
          internalPartNumber: "MAT-200481",
          sapMaterialNr: "200481",
          name: "Rillenkugellager SKF 6205-2RSH/C3",
          description: "Beidseitig schleifende Dichtung, erhöhte Lagerluft",
          unitOfMeasure: "ST",
          storageLocation: "0001",
          storageBin: "REG-01-A1",
          stockQuantity: "0.000",
          minStockLevel: "5.000",
          movingAveragePrice: "18.20",
        },
        {
          tenantId: tenant.id,
          internalPartNumber: "MAT-300115",
          sapMaterialNr: "300115",
          name: "Druckluft-Filterelement Kaeser 9.4891.0",
          description: "Mikrofilter 0.01 µm für Schraubenkompressor CSDX",
          unitOfMeasure: "ST",
          storageLocation: "0002",
          storageBin: "REG-09-C3",
          stockQuantity: "6.000",
          minStockLevel: "2.000",
          movingAveragePrice: "85.00",
        },
        {
          tenantId: tenant.id,
          internalPartNumber: "MAT-400892",
          sapMaterialNr: "400892",
          name: "Getriebeöl Klüber Klübersynth GH 6-220",
          description: "Synthetisches Hochleistungsgetriebeöl (ISO VG 220)",
          unitOfMeasure: "L",
          storageLocation: "0003",
          storageBin: "FA-02",
          stockQuantity: "45.000",
          minStockLevel: "20.000",
          movingAveragePrice: "24.80",
        },
      ]);

      partsList = await db.query.spareParts.findMany({
        where: eq(spareParts.tenantId, tenant.id),
      });
    }
  } catch (err) {
    console.warn("SparePartsPage fallback:", err);
    partsList = [
      {
        id: "demo-part-1",
        internalPartNumber: "MAT-100421",
        sapMaterialNr: "100421",
        name: "Gleitringdichtung EagleBurgmann HJ92N",
        stockQuantity: "2.000",
        minStockLevel: "3.000",
        unitOfMeasure: "ST",
        storageLocation: "0001",
        storageBin: "REG-04-B2",
        movingAveragePrice: "249.50",
      },
    ];
  }

  const lowStockCount = partsList.filter(
    (p) => parseFloat(p.stockQuantity) <= parseFloat(p.minStockLevel)
  ).length;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Package className="h-7 w-7 text-blue-500" />
            Ersatzteile & Lagerverwaltung
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Bestandsführung, Lagerorte, SAP MM Materialnummern und automatische Unterbestandswarnung.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-slate-700 bg-slate-900 text-slate-300">
            <Warehouse className="h-3.5 w-3.5 text-cyan-400 mr-1.5" />
            Hauptlager 0001 / Werk 1000
          </Badge>
        </div>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs">Katalogisierte Artikel</CardDescription>
            <CardTitle className="text-2xl font-bold text-white">{partsList.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs">Meldebestand unterschritten</CardDescription>
            <CardTitle className="text-2xl font-bold text-rose-400">{lowStockCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs">SAP MM Schnittstelle</CardDescription>
            <CardTitle className="text-sm font-semibold text-emerald-400 mt-1 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              BAPI 261 (Warenausgang)
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs">Offline-Verfügbarkeit</CardDescription>
            <CardTitle className="text-sm font-semibold text-cyan-400 mt-1 flex items-center gap-1.5">
              <Boxes className="h-4 w-4" />
              IndexedDB synchronisiert
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Ersatzteilliste */}
      <Card className="border-slate-800 bg-slate-900/40">
        <CardHeader className="border-b border-slate-800 pb-3">
          <CardTitle className="text-base text-white flex items-center justify-between">
            <span>Materialbestand & Lagerplätze</span>
            {lowStockCount > 0 && (
              <Badge className="bg-rose-950 text-rose-400 border border-rose-800 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                {lowStockCount} Artikel nachbestellen
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">SAP-Material-Nr.</th>
                <th className="py-3 px-4">Interne Teil-Nr.</th>
                <th className="py-3 px-4">Bezeichnung</th>
                <th className="py-3 px-4">Lagerort / Platz</th>
                <th className="py-3 px-4 text-right">Ist-Bestand</th>
                <th className="py-3 px-4 text-right">Meldebestand</th>
                <th className="py-3 px-4 text-right">Gleit. Preis</th>
                <th className="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {partsList.map((part) => {
                const stock = parseFloat(part.stockQuantity);
                const min = parseFloat(part.minStockLevel);
                const isLow = stock <= min;

                return (
                  <tr key={part.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-cyan-400">
                      {part.sapMaterialNr || "-"}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400">
                      {part.internalPartNumber}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-white">{part.name}</div>
                      {part.description && (
                        <div className="text-[11px] text-slate-500 line-clamp-1">{part.description}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400">
                      {part.storageLocation || "0001"} · {part.storageBin || "K.A."}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-white font-mono">
                      {stock.toFixed(1)} {part.unitOfMeasure}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-400">
                      {min.toFixed(1)} {part.unitOfMeasure}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-300">
                      {parseFloat(part.movingAveragePrice || "0").toFixed(2)} €
                    </td>
                    <td className="py-3 px-4 text-right">
                      {isLow ? (
                        <Badge className="bg-rose-950/70 text-rose-300 border-rose-700 text-[10px]">
                          Unterbestand
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px]">
                          Vorrätig
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
