import { Suspense } from "react";
import { SingleInputWorkspace } from "@/components/dashboard/single-input-workspace";

export const metadata = {
  title: "MaintAI | Conversational Single-Input Workspace",
  description: "Zentraler industrieller Single-Input Workspace für Instandhaltung & SAP PM",
};

export default function DashboardHomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center p-8 text-slate-500 text-sm">
          Lade Workspace...
        </div>
      }
    >
      <SingleInputWorkspace />
    </Suspense>
  );
}
