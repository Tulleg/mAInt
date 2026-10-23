import React from "react";
import Link from "next/link";
import { ArrowLeft, Cpu, FileQuestion, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/ui/back-button";
import { Card, CardContent } from "@/components/ui/card";

export default function EquipmentNotFound() {
  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 animate-in fade-in duration-150">
      {/* Top Header Navigation mit zwingendem Zurück-Button */}
      <div className="flex items-center gap-3 border-b border-slate-800 pb-5">
        <BackButton fallbackUrl="/equipments" label="Zurück" />
        <div className="h-4 w-px bg-slate-800" />
        <span className="text-xs text-slate-400 font-mono">Equipment nicht gefunden</span>
      </div>

      {/* Industrial Empty State Card */}
      <Card className="border-slate-800 bg-slate-900/60 p-8 md:p-12 text-center">
        <CardContent className="flex flex-col items-center max-w-md mx-auto space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-cyan-400 shadow-inner">
            <Cpu className="w-8 h-8 text-cyan-400" />
          </div>

          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">
            Equipment nicht gefunden
          </h1>

          <p className="text-sm text-slate-400 text-center leading-relaxed">
            Das angeforderte Equipment konnte in den Stammdaten nicht gefunden werden. Bitte prüfe die Equipment-Nummer oder wähle eine Anlage aus dem Anlagenbaum.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 w-full justify-center">
            <Link href="/equipments" className="w-full sm:w-auto">
              <Button
                variant="default"
                className="w-full sm:w-auto min-h-[44px] gap-2 bg-cyan-600 hover:bg-cyan-500 text-white"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Zur Equipment-Übersicht
              </Button>
            </Link>

            <Link href="/" className="w-full sm:w-auto">
              <Button
                variant="outline"
                className="w-full sm:w-auto min-h-[44px] gap-2 border-slate-700 text-slate-200 hover:text-white hover:bg-slate-800"
              >
                <Search className="h-4 w-4 text-cyan-400" />
                Workspace Suche
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
