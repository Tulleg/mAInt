import { db } from "@/lib/db";
import { tenants, equipments, users } from "@/lib/db/schema";
import { CreateOrderForm, EquipmentOption } from "@/components/orders/create-order-form";
import { OfflineSyncStatusIndicator } from "@/components/layout/offline-sync-indicator";
import { Wrench, ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Neue Störung melden | MaintAI Leitstand",
  description: "KI-gestützte Störungserfassung per natürlicher Sprache oder manuellem Formular",
};

export default async function NewOrderPage() {
  let tenantId = "demo-tenant-1000";
  let equipmentList: EquipmentOption[] = [];
  let defaultUserId = "demo-user-meister";

  try {
    const tenant = await db.query.tenants.findFirst();
    if (tenant) {
      tenantId = tenant.id;

      const loadedEquipments = await db.query.equipments.findMany({
        where: (eq, { eq: eqOp }) => eqOp(eq.tenantId, tenant.id),
        limit: 50,
      });

      if (loadedEquipments && loadedEquipments.length > 0) {
        equipmentList = loadedEquipments.map((e) => ({
          id: e.id,
          name: e.name,
          equipmentNumber: e.equipmentNumber,
          criticality: e.criticality,
        }));
      }

      const firstUser = await db.query.users.findFirst({
        where: (u, { eq: eqOp }) => eqOp(u.tenantId, tenant.id),
      });
      if (firstUser) {
        defaultUserId = firstUser.id;
      }
    }
  } catch (err) {
    console.warn("Database unavailable on NewOrderPage, using demo data fallback.");
  }

  // Resilienter Demo-Fallback falls DB offline ist oder noch leer
  if (equipmentList.length === 0) {
    equipmentList = [
      {
        id: "eq-1",
        name: "Kreiselpumpe KSB Etanorm",
        equipmentNumber: "EQ-P101",
        criticality: "A",
      },
      {
        id: "eq-2",
        name: "Antriebsmotor Siemens 45kW",
        equipmentNumber: "EQ-M102",
        criticality: "A",
      },
      {
        id: "eq-3",
        name: "Hauptverteiler Fertigungslinie 2",
        equipmentNumber: "EQ-HV02",
        criticality: "B",
      },
      {
        id: "eq-4",
        name: "Kaeser Schraubenkompressor",
        equipmentNumber: "EQ-C401",
        criticality: "B",
      },
      {
        id: "eq-5",
        name: "Hydraulikpresse Schuler 500t",
        equipmentNumber: "EQ-HP50",
        criticality: "A",
      },
      {
        id: "eq-6",
        name: "Förderband Linie 1 Rollenantrieb",
        equipmentNumber: "EQ-FB01",
        criticality: "C",
      },
    ];
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 md:p-8 space-y-6">
      {/* Header mit Breadcrumbs & Sync-Indikator */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-neutral-400 mb-2">
            <Link href="/planning" className="hover:text-blue-400 flex items-center gap-1 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              Zurück zum Planungsboard
            </Link>
            <span>/</span>
            <span className="text-neutral-200">Störung erfassen</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Wrench className="h-7 w-7 text-blue-500" />
            Neue Störungsmeldung & Instandhaltungsmaßnahme
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Erfasse Störungen wahlweise per KI-Prompt (mit automatischer Pflichtfeld-Rückfrage) oder manuell mit Copilot-Unterstützung.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <OfflineSyncStatusIndicator />
        </div>
      </div>

      {/* Das interaktive Dual-Mode Störungsformular */}
      <CreateOrderForm
        tenantId={tenantId}
        equipments={equipmentList}
        defaultUserId={defaultUserId}
      />
    </div>
  );
}
