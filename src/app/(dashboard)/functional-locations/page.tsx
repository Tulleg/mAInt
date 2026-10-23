import Link from "next/link";
import { db } from "@/db";
import { tenants, functionalLocations, equipments } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/ui/back-button";
import { MapPin, Factory, Layers, ArrowRight, CheckCircle2, ChevronRight } from "lucide-react";

export const metadata = {
  title: "Technische Plätze (TPLNR) | MaintAI Leitstand",
  description: "Räumliche und funktionale Anlagenhierarchie nach DIN 31051 / SAP PM",
};

export default async function FunctionalLocationsPage() {
  let tenant: any = null;
  let locations: any[] = [];

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

    locations = await db.query.functionalLocations.findMany({
      where: eq(functionalLocations.tenantId, tenant.id),
      with: {
        equipments: true,
      },
      orderBy: [desc(functionalLocations.createdAt)],
    });

    if (locations.length === 0) {
      await db.insert(functionalLocations).values([
        {
          tenantId: tenant.id,
          code: "WERK-1000-HALLE-01",
          name: "Halle 1 · Zerspanung & Vorfertigung",
          description: "CNC-Bearbeitungszentren und Fräsanlagen",
          costCenter: "KST-4410",
          plantSection: "Fertigung Nord",
          sapTplnr: "1000-H01",
        },
        {
          tenantId: tenant.id,
          code: "WERK-1000-HALLE-02",
          name: "Halle 2 · Endmontage & Qualitätsprüfung",
          description: "Haupttaktstraße und Endprüfstände",
          costCenter: "KST-4420",
          plantSection: "Montage Süd",
          sapTplnr: "1000-H02",
        },
        {
          tenantId: tenant.id,
          code: "WERK-1000-ENERGIE-ZENTRALE",
          name: "Energiezentrale & Druckluftversorgung",
          description: "Kompressorstation, Kälteanlagen und Trafos",
          costCenter: "KST-4100",
          plantSection: "Infrastruktur",
          sapTplnr: "1000-EZ01",
        },
      ]);

      locations = await db.query.functionalLocations.findMany({
        where: eq(functionalLocations.tenantId, tenant.id),
        with: {
          equipments: true,
        },
      });
    }
  } catch (err) {
    console.warn("FunctionalLocations fallback:", err);
    locations = [
      {
        id: "loc-1",
        code: "WERK-1000-HALLE-01",
        name: "Halle 1 · Zerspanung & Vorfertigung",
        costCenter: "KST-4410",
        sapTplnr: "1000-H01",
        equipments: [],
      },
    ];
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header mit Zurück-Button */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <BackButton fallbackUrl="/equipments" label="Zurück zur Equipment-Übersicht" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <MapPin className="h-7 w-7 text-cyan-500" />
            Technische Plätze
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Hierarchische Strukturierung von Fertigungsbereichen, Hallen und SAP-TPLNR-Knoten.
          </p>
        </div>

        <Badge variant="outline" className="border-slate-700 bg-slate-900 text-slate-300">
          <Factory className="h-3.5 w-3.5 text-cyan-400 mr-1.5" />
          Werk 1000 München
        </Badge>
      </div>

      {/* Grid technischer Plätze */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {locations.map((loc) => (
          <Card key={loc.id} className="border-slate-800 bg-slate-900/60 flex flex-col justify-between">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-cyan-400">
                  {loc.code}
                </span>
                <Badge variant="outline" className="text-[10px] border-slate-700 font-mono">
                  {loc.sapTplnr || "SAP-TPLNR"}
                </Badge>
              </div>
              <CardTitle className="text-base font-semibold text-white mt-1">
                {loc.name}
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                {loc.description || "Keine Beschreibung hinterlegt"}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="flex justify-between items-center text-xs text-slate-400 pt-3 border-t border-slate-800/80">
                <span>Kostenstelle:</span>
                <span className="font-mono text-slate-200">{loc.costCenter || "KST-Standard"}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-slate-400">
                <span>Zugeordnete Equipments:</span>
                <Badge className="bg-slate-800 text-slate-200 text-[10px]">
                  {loc.equipments?.length || 0} Anlagen
                </Badge>
              </div>
              <Link
                href="/equipments"
                className="inline-flex items-center justify-between w-full p-2 rounded bg-slate-950/60 hover:bg-slate-800/80 text-xs text-slate-300 hover:text-white transition-colors"
              >
                <span>Anlagen an diesem Platz anzeigen</span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
