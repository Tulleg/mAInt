import { db } from "@/lib/db";
import {
  tenants,
  inspectionTemplates,
  InspectionTemplateSchema,
} from "@/lib/db/schema";
import { ProtocolBuilder } from "@/components/protocol-builder/protocol-builder";
import { saveInspectionTemplateAction } from "@/actions/maintenance-plan-actions";
import { FileCheck, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Inspektions- & Prüfprotokoll-Vorlagen | MaintAI",
  description: "Visueller Designer für Messwerterfassung, Grenzwerte und Checklisten",
};

export default async function InspectionsPage() {
  let tenant = await db.query.tenants.findFirst();

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

  // Erstes aktives Template laden, falls vorhanden
  const existingTemplate = await db.query.inspectionTemplates.findFirst({
    where: (t, { eq }) => eq(t.tenantId, tenant.id),
  });

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <FileCheck className="h-7 w-7 text-blue-500" />
            Visueller Protokoll-Vorlagen-Editor
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Erstelle standardisierte, papierlose Prüfprotokolle mit numerischer
            Grenzwertüberwachung, Pflichtfotos und digitaler Handunterschrift.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-neutral-700 bg-neutral-900 text-neutral-300">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 mr-1" />
            JSONB Schema Engine
          </Badge>
          <Badge variant="outline" className="border-neutral-700 bg-neutral-900 text-neutral-300">
            <Sparkles className="h-3.5 w-3.5 text-amber-400 mr-1" />
            Auto-Störungs-Trigger
          </Badge>
        </div>
      </div>

      <ProtocolBuilder
        initialSchema={existingTemplate?.schemaJson as InspectionTemplateSchema | undefined}
        onSave={async (schema) => {
          "use server";
          await saveInspectionTemplateAction({
            tenantId: tenant.id,
            code: "INSP-DEFAULT-01",
            name: "Standard Pumpen- & Antriebs-Inspektion",
            schemaJson: schema,
            estimatedDurationMinutes: 45,
          });
        }}
      />
    </div>
  );
}
