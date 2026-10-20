import Link from "next/link";
import {
  Wrench,
  CalendarRange,
  FileCheck,
  Calendar,
  BarChart3,
  GitBranch,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import { OfflineSyncStatusIndicator } from "@/components/layout/offline-sync-indicator";

export default function HomePage() {
  const modules = [
    {
      title: "Gantt Planungsboard",
      desc: "Grafische Einsatzdisposition mit Drag-&-Drop, Qualifikations-Matrix, Arbeitszeit-Resize & SAP-Ersatzteil-Konflikten.",
      href: "/planning",
      icon: CalendarRange,
      badge: "Interaktiv",
      color: "border-blue-500/40 hover:border-blue-500",
    },
    {
      title: "Visueller Protokoll-Editor",
      desc: "JSON-Schema Formular-Designer für Grenzwerte, i.O./n.i.O., Auto-Störungs-Trigger und Live-Touch-Handunterschrift.",
      href: "/inspections",
      icon: FileCheck,
      badge: "Form Designer & Mobile",
      color: "border-purple-500/40 hover:border-purple-500",
    },
    {
      title: "Wartungspläne & Batch-Grid",
      desc: "TanStack-Data-Grid mit Inline-Editing in der Zelle und Sticky Bulk-Action-Bar für 50+ Positionen simultan.",
      href: "/maintenance-plans",
      icon: Calendar,
      badge: "Batch-Pflege",
      color: "border-emerald-500/40 hover:border-emerald-500",
    },
    {
      title: "Workflow- & Berechtigungs-Matrix",
      desc: "Dynamische State-Machine ohne Hardcoding. Kreuztabelle für rollenbasierte Freigaben und Guard-Bedingungen.",
      href: "/admin/workflows",
      icon: GitBranch,
      badge: "Admin & RBAC",
      color: "border-amber-500/40 hover:border-amber-500",
    },
    {
      title: "KI-Leitstand (Prompt-to-Chart)",
      desc: "Natürlichsprachliche Datenanalyse (NL-to-SQL), Recharts-Visualisierung, RAG-Copilot und geplante E-Mail-Reports.",
      href: "/analytics",
      icon: BarChart3,
      badge: "AI & RAG",
      color: "border-cyan-500/40 hover:border-cyan-500",
    },
  ];

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto space-y-8">
      {/* Top Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Wrench className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                MaintAI <span className="text-xs font-mono font-normal text-neutral-400">v0.1.0</span>
              </h1>
              <p className="text-xs text-neutral-400">
                Industrielle Instandhaltungsplattform & SAP PM Middleware (Offline-First)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <OfflineSyncStatusIndicator />
        </div>
      </div>

      {/* Intro Banner */}
      <div className="p-4 rounded-xl border border-blue-900/60 bg-blue-950/20 text-xs text-blue-200 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-white block mb-0.5">
            Willkommen im Entwicklungs- und Test-Leitstand
          </span>
          Alle Module sind isoliert im Projektverzeichnis lauffähig. Wähle unten ein Modul aus, um die interaktiven Funktionen, Planungsboards und Editoren live im Browser auszuprobieren.
        </div>
      </div>

      {/* Modul-Karten */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {modules.map((m) => {
          const Icon = m.icon;
          return (
            <Link
              key={m.href}
              href={m.href}
              className={`p-5 rounded-xl border bg-neutral-900/60 hover:bg-neutral-900 transition-all flex flex-col justify-between space-y-4 group ${m.color}`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 rounded-lg bg-neutral-800 text-blue-400 group-hover:text-white transition-colors">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded border border-neutral-700 bg-neutral-950 text-neutral-300">
                    {m.badge}
                  </span>
                </div>
                <h3 className="font-semibold text-white text-base group-hover:text-blue-400 transition-colors">
                  {m.title}
                </h3>
                <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                  {m.desc}
                </p>
              </div>

              <div className="text-xs text-blue-400 font-medium flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                Modul öffnen & testen →
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
