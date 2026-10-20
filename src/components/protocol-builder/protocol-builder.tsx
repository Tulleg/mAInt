"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import {
  InspectionTemplateSchema,
  InspectionSectionDefinition,
  InspectionFieldDefinition,
} from "@/lib/db/schema";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  MoveUp,
  MoveDown,
  Smartphone,
  Monitor,
  CheckCircle,
  AlertTriangle,
  Camera,
  PenTool,
  Hash,
  CheckSquare,
  ListFilter,
  FileText,
  Save,
  Eye,
  Sliders,
  ShieldAlert,
} from "lucide-react";

interface ProtocolBuilderProps {
  initialSchema?: InspectionTemplateSchema;
  onSave?: (schema: InspectionTemplateSchema) => Promise<void> | void;
}

const defaultSchema: InspectionTemplateSchema = {
  version: 1,
  requiresSafetyClearance: true,
  sections: [
    {
      id: "sec-visual",
      title: "1. Sicht- & Sicherheitsprüfung",
      orderIndex: 0,
      fields: [
        {
          id: "field-1",
          label: "Gehäuse, Dichtungen und Schaugläser unbeschädigt?",
          type: "BOOLEAN",
          required: true,
          triggerDefectOnFail: true,
        },
        {
          id: "field-2",
          label: "Zustand Typenschild & Warnhinweise",
          type: "SELECT",
          required: true,
          options: ["Sehr gut", "Lesbar", "Beschädigt", "Fehlt"],
        },
      ],
    },
    {
      id: "sec-measurement",
      title: "2. Messtechnische Erfassung & Betriebsparameter",
      orderIndex: 1,
      fields: [
        {
          id: "field-3",
          label: "Lagertemperatur Antriebsseite (DE)",
          type: "NUMERIC",
          required: true,
          unit: "°C",
          targetValue: 65,
          minLimit: 20,
          maxLimit: 85,
          triggerDefectOnFail: true,
        },
        {
          id: "field-4",
          label: "Schwingstärke RMS (ISO 10816)",
          type: "NUMERIC",
          required: true,
          unit: "mm/s",
          targetValue: 2.8,
          minLimit: 0,
          maxLimit: 4.5,
          triggerDefectOnFail: true,
        },
      ],
    },
    {
      id: "sec-signoff",
      title: "3. Fotodokumentation & Freigabe",
      orderIndex: 2,
      fields: [
        {
          id: "field-5",
          label: "Zustandsfoto nach Wartungsdurchführung",
          type: "PHOTO",
          required: false,
        },
        {
          id: "field-6",
          label: "Digitale Unterschrift Prüfer / Meister",
          type: "SIGNATURE",
          required: true,
        },
      ],
    },
  ],
};

export function ProtocolBuilder({ initialSchema = defaultSchema, onSave }: ProtocolBuilderProps) {
  const [schema, setSchema] = useState<InspectionTemplateSchema>(initialSchema);
  const [activeTab, setActiveTab] = useState<"builder" | "preview">("builder");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("mobile");
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>("field-3");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Field helper methods
  const addSection = () => {
    const newSection: InspectionSectionDefinition = {
      id: `sec-${Date.now()}`,
      title: `Neuer Prüfabschnitt (${schema.sections.length + 1})`,
      orderIndex: schema.sections.length,
      fields: [],
    };
    setSchema({ ...schema, sections: [...schema.sections, newSection] });
  };

  const removeSection = (secIndex: number) => {
    const newSecs = schema.sections.filter((_, idx) => idx !== secIndex);
    setSchema({ ...schema, sections: newSecs });
  };

  const addField = (secIndex: number, type: InspectionFieldDefinition["type"]) => {
    const newFieldId = `field-${Date.now()}`;
    const newField: InspectionFieldDefinition = {
      id: newFieldId,
      label:
        type === "NUMERIC"
          ? "Messwert (z.B. Druck, Temperatur, Vibration)"
          : type === "BOOLEAN"
          ? "Sichtprüfung i.O. / n.i.O."
          : type === "SELECT"
          ? "Auswahlfeld / Zustandsklasse"
          : type === "PHOTO"
          ? "Fotodokumentation Schaden / Messuhr"
          : type === "SIGNATURE"
          ? "Digitale Handunterschrift"
          : "Zusätzliche Prüfnotiz / Befund",
      type,
      required: true,
      ...(type === "NUMERIC"
        ? { unit: "bar", targetValue: 5.0, minLimit: 3.0, maxLimit: 7.5, triggerDefectOnFail: true }
        : {}),
      ...(type === "SELECT" ? { options: ["Option A", "Option B", "Option C"] } : {}),
      ...(type === "BOOLEAN" ? { triggerDefectOnFail: true } : {}),
    };

    const newSections = [...schema.sections];
    newSections[secIndex].fields.push(newField);
    setSchema({ ...schema, sections: newSections });
    setSelectedFieldId(newFieldId);
  };

  const removeField = (secIndex: number, fieldIndex: number) => {
    const newSections = [...schema.sections];
    newSections[secIndex].fields.splice(fieldIndex, 1);
    setSchema({ ...schema, sections: newSections });
  };

  const updateField = (fieldId: string, partial: Partial<InspectionFieldDefinition>) => {
    const newSections = schema.sections.map((sec) => ({
      ...sec,
      fields: sec.fields.map((f) => (f.id === fieldId ? { ...f, ...partial } : f)),
    }));
    setSchema({ ...schema, sections: newSections });
  };

  // Suche ausgewähltes Feld für Property-Panel
  let activeField: InspectionFieldDefinition | undefined;
  for (const sec of schema.sections) {
    const found = sec.fields.find((f) => f.id === selectedFieldId);
    if (found) {
      activeField = found;
      break;
    }
  }

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (onSave) await onSave(schema);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant={activeTab === "builder" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("builder")}
            className="gap-2"
          >
            <Sliders className="h-4 w-4" />
            Formular-Designer
          </Button>
          <Button
            variant={activeTab === "preview" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("preview")}
            className="gap-2"
          >
            <Eye className="h-4 w-4" />
            Live-Vorschau
          </Button>

          {activeTab === "preview" && (
            <div className="flex items-center gap-1 border-l border-neutral-800 pl-3">
              <Button
                variant={previewDevice === "mobile" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setPreviewDevice("mobile")}
                className="gap-1.5 h-8 text-xs"
              >
                <Smartphone className="h-3.5 w-3.5 text-blue-400" />
                Mobile Client (PWA)
              </Button>
              <Button
                variant={previewDevice === "desktop" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setPreviewDevice("desktop")}
                className="gap-1.5 h-8 text-xs"
              >
                <Monitor className="h-3.5 w-3.5 text-neutral-400" />
                Desktop
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {saveSuccess && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <CheckCircle className="h-3.5 w-3.5" /> Schema gespeichert
            </span>
          )}
          <Button
            onClick={handleSave}
            disabled={isSaving}
            size="sm"
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "Speichere..." : "Vorlage speichern"}
          </Button>
        </div>
      </div>

      {/* MODUS 1: FORMULAR DESIGNER */}
      {activeTab === "builder" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Linker Bereich: Canvas & Abschnitte */}
          <div className="lg:col-span-8 space-y-5">
            {schema.sections.map((section, secIdx) => (
              <Card key={section.id} className="border-neutral-800 bg-neutral-900/80">
                <CardHeader className="py-3 px-4 bg-neutral-900/90 border-b border-neutral-800/80 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-xs font-mono text-neutral-500">#{secIdx + 1}</span>
                    <input
                      type="text"
                      value={section.title}
                      onChange={(e) => {
                        const newSecs = [...schema.sections];
                        newSecs[secIdx].title = e.target.value;
                        setSchema({ ...schema, sections: newSecs });
                      }}
                      className="bg-transparent border-0 font-semibold text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1.5 py-0.5 w-full max-w-md"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSection(secIdx)}
                      className="h-7 w-7 text-neutral-400 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="p-4 space-y-3">
                  {section.fields.map((field, fIdx) => {
                    const isSelected = field.id === selectedFieldId;
                    return (
                      <div
                        key={field.id}
                        onClick={() => setSelectedFieldId(field.id)}
                        className={`p-3 rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? "border-blue-500/80 bg-blue-950/20 shadow-sm"
                            : "border-neutral-800 bg-neutral-950/70 hover:border-neutral-700"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            {field.type === "NUMERIC" && (
                              <Hash className="h-4 w-4 text-amber-400 shrink-0" />
                            )}
                            {field.type === "BOOLEAN" && (
                              <CheckSquare className="h-4 w-4 text-emerald-400 shrink-0" />
                            )}
                            {field.type === "SELECT" && (
                              <ListFilter className="h-4 w-4 text-blue-400 shrink-0" />
                            )}
                            {field.type === "TEXT" && (
                              <FileText className="h-4 w-4 text-neutral-400 shrink-0" />
                            )}
                            {field.type === "PHOTO" && (
                              <Camera className="h-4 w-4 text-purple-400 shrink-0" />
                            )}
                            {field.type === "SIGNATURE" && (
                              <PenTool className="h-4 w-4 text-pink-400 shrink-0" />
                            )}

                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-neutral-200">
                                  {field.label}
                                </span>
                                {field.required && (
                                  <span className="text-red-400 text-xs font-bold">*</span>
                                )}
                              </div>
                              <span className="text-[10px] text-neutral-500 font-mono">
                                Typ: {field.type}{" "}
                                {field.unit && `(${field.unit}) Min: ${field.minLimit} / Max: ${field.maxLimit}`}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {field.triggerDefectOnFail && (
                              <Badge
                                variant="destructive"
                                className="text-[9px] py-0 px-1.5 flex items-center gap-1"
                              >
                                <ShieldAlert className="h-2.5 w-2.5" /> Auto-Störung
                              </Badge>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeField(secIdx, fIdx);
                              }}
                              className="h-6 w-6 text-neutral-500 hover:text-red-400"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Schnellauswahl: Feld hinzufügen */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-800/60">
                    <span className="text-[11px] text-neutral-500 font-medium mr-1">
                      + Feld einfügen:
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addField(secIdx, "NUMERIC")}
                      className="h-7 text-xs gap-1 border-neutral-800 hover:bg-neutral-800 text-amber-300"
                    >
                      <Hash className="h-3 w-3" /> Messwert
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addField(secIdx, "BOOLEAN")}
                      className="h-7 text-xs gap-1 border-neutral-800 hover:bg-neutral-800 text-emerald-300"
                    >
                      <CheckSquare className="h-3 w-3" /> i.O. / n.i.O.
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addField(secIdx, "SELECT")}
                      className="h-7 text-xs gap-1 border-neutral-800 hover:bg-neutral-800 text-blue-300"
                    >
                      <ListFilter className="h-3 w-3" /> Dropdown
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addField(secIdx, "PHOTO")}
                      className="h-7 text-xs gap-1 border-neutral-800 hover:bg-neutral-800 text-purple-300"
                    >
                      <Camera className="h-3 w-3" /> Pflichtfoto
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addField(secIdx, "SIGNATURE")}
                      className="h-7 text-xs gap-1 border-neutral-800 hover:bg-neutral-800 text-pink-300"
                    >
                      <PenTool className="h-3 w-3" /> Unterschrift
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            <Button
              variant="outline"
              onClick={addSection}
              className="w-full border-dashed border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900 text-neutral-300 gap-2 py-5"
            >
              <Plus className="h-4 w-4 text-blue-400" />
              Neuen Prüfabschnitt hinzufügen
            </Button>
          </div>

          {/* Rechter Bereich: Eigenschaften / Feld-Konfigurator */}
          <div className="lg:col-span-4 space-y-4">
            <Card className="border-neutral-800 bg-neutral-900 sticky top-6">
              <CardHeader className="p-4 border-b border-neutral-800">
                <CardTitle className="text-sm flex items-center gap-2 text-white">
                  <Sliders className="h-4 w-4 text-blue-400" />
                  Feld-Eigenschaften & Schwellenwerte
                </CardTitle>
                <CardDescription className="text-xs">
                  Konfiguriere Grenzwert-Überwachung & Toleranzen
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {activeField ? (
                  <>
                    <div>
                      <Label htmlFor="fieldLabel">Feldbezeichnung / Prüffrage</Label>
                      <Input
                        id="fieldLabel"
                        value={activeField.label}
                        onChange={(e) => updateField(activeField!.id, { label: e.target.value })}
                        className="mt-1"
                      />
                    </div>

                    <div className="flex items-center justify-between border-t border-neutral-800 pt-3">
                      <Label htmlFor="requiredCheck" className="cursor-pointer">
                        Pflichtfeld (Darf nicht übersprungen werden)
                      </Label>
                      <input
                        type="checkbox"
                        id="requiredCheck"
                        checked={activeField.required}
                        onChange={(e) =>
                          updateField(activeField!.id, { required: e.target.checked })
                        }
                        className="rounded border-neutral-700 bg-neutral-950 text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                      />
                    </div>

                    {/* NUMERISCHE GRENZWERTE & AUTO-TRIGGER */}
                    {activeField.type === "NUMERIC" && (
                      <div className="space-y-3 border-t border-neutral-800 pt-3">
                        <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5" /> Toleranz- & Grenzwertüberwachung
                        </span>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label htmlFor="unit">Einheit (z.B. bar, °C)</Label>
                            <Input
                              id="unit"
                              value={activeField.unit || ""}
                              onChange={(e) =>
                                updateField(activeField!.id, { unit: e.target.value })
                              }
                              className="mt-1 font-mono text-xs"
                            />
                          </div>
                          <div>
                            <Label htmlFor="targetVal">Sollwert (Target)</Label>
                            <Input
                              id="targetVal"
                              type="number"
                              value={activeField.targetValue ?? ""}
                              onChange={(e) =>
                                updateField(activeField!.id, {
                                  targetValue: parseFloat(e.target.value),
                                })
                              }
                              className="mt-1 font-mono text-xs"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label htmlFor="minLimit">Min. Limit (Untergrenze)</Label>
                            <Input
                              id="minLimit"
                              type="number"
                              value={activeField.minLimit ?? ""}
                              onChange={(e) =>
                                updateField(activeField!.id, {
                                  minLimit: parseFloat(e.target.value),
                                })
                              }
                              className="mt-1 font-mono text-xs border-amber-900/50"
                            />
                          </div>
                          <div>
                            <Label htmlFor="maxLimit">Max. Limit (Obergrenze)</Label>
                            <Input
                              id="maxLimit"
                              type="number"
                              value={activeField.maxLimit ?? ""}
                              onChange={(e) =>
                                updateField(activeField!.id, {
                                  maxLimit: parseFloat(e.target.value),
                                })
                              }
                              className="mt-1 font-mono text-xs border-red-900/50"
                            />
                          </div>
                        </div>

                        <div className="flex items-start gap-2 bg-red-950/30 border border-red-900/50 p-2.5 rounded-md mt-2">
                          <input
                            type="checkbox"
                            id="triggerDefect"
                            checked={activeField.triggerDefectOnFail ?? false}
                            onChange={(e) =>
                              updateField(activeField!.id, {
                                triggerDefectOnFail: e.target.checked,
                              })
                            }
                            className="mt-0.5 rounded border-red-700 bg-neutral-950 text-red-600 focus:ring-red-500 h-4 w-4 cursor-pointer"
                          />
                          <Label
                            htmlFor="triggerDefect"
                            className="text-xs text-red-200 cursor-pointer"
                          >
                            <strong>Auto-Störungsauftrag erzeugen:</strong> Löst bei
                            Messwertüberschreitung im Hintergrund sofort einen Korrektur-Auftrag
                            (Priorität 1/2) aus.
                          </Label>
                        </div>
                      </div>
                    )}

                    {/* SELECT DROPDOWN OPTIONEN */}
                    {activeField.type === "SELECT" && (
                      <div className="space-y-2 border-t border-neutral-800 pt-3">
                        <Label>Auswahl-Optionen (Kommagetrennt)</Label>
                        <Input
                          value={activeField.options?.join(", ") || ""}
                          onChange={(e) =>
                            updateField(activeField!.id, {
                              options: e.target.value
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                          className="font-mono text-xs"
                        />
                      </div>
                    )}

                    {/* BOOLEAN AUTO DEFECT */}
                    {activeField.type === "BOOLEAN" && (
                      <div className="flex items-start gap-2 bg-neutral-950 border border-neutral-800 p-2.5 rounded-md border-t border-neutral-800 pt-3">
                        <input
                          type="checkbox"
                          id="triggerBoolDefect"
                          checked={activeField.triggerDefectOnFail ?? false}
                          onChange={(e) =>
                            updateField(activeField!.id, {
                              triggerDefectOnFail: e.target.checked,
                            })
                          }
                          className="mt-0.5 rounded border-neutral-700 bg-neutral-950 text-red-600 focus:ring-red-500 h-4 w-4 cursor-pointer"
                        />
                        <Label
                          htmlFor="triggerBoolDefect"
                          className="text-xs text-neutral-300 cursor-pointer"
                        >
                          Bei &quot;nicht in Ordnung (n.i.O.)&quot; automatisch Folgestörung erfassen
                        </Label>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-neutral-500 text-center py-6">
                    Klicke links auf ein Feld, um Grenzwerte, Einheiten und Bedingungen anzupassen.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* MODUS 2: INTERAKTIVE LIVE-VORSCHAU (DESKTOP & MOBILE SIMULATOR) */}
      {activeTab === "preview" && (
        <div className="flex justify-center py-4">
          <div
            className={`transition-all duration-300 ${
              previewDevice === "mobile"
                ? "w-[390px] rounded-[40px] border-[10px] border-neutral-800 bg-black shadow-2xl p-4 overflow-hidden min-h-[750px]"
                : "w-full max-w-4xl bg-neutral-900 border border-neutral-800 rounded-xl p-6"
            }`}
          >
            {/* Mobile Notch Bar */}
            {previewDevice === "mobile" && (
              <div className="flex items-center justify-between pb-3 pt-1 px-3 border-b border-neutral-800 text-[11px] text-neutral-400 font-mono">
                <span>09:41</span>
                <span className="font-semibold text-neutral-200">MaintAI Mobile</span>
                <span>100% ⚡</span>
              </div>
            )}

            <LiveProtocolExecutor schema={schema} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Interaktiver Protokoll-Ausführer (Live-Validierung & Canvas Unterschrift)
 */
function LiveProtocolExecutor({ schema }: { schema: InspectionTemplateSchema }) {
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const handleInputChange = (fieldId: string, val: any) => {
    setFormValues((prev) => ({ ...prev, [fieldId]: val }));
  };

  // Canvas Handhabung für Handunterschrift
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#38bdf8"; // Hellblau
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setIsDrawing(true);
    setHasSignature(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  return (
    <div className="space-y-6 pt-3">
      <div className="border-b border-neutral-800 pb-3">
        <h2 className="text-base font-bold text-white flex items-center justify-between">
          <span>Instandhaltungs-Prüfprotokoll</span>
          <Badge variant="outline" className="text-[10px] uppercase font-mono">
            v{schema.version}.0
          </Badge>
        </h2>
        <p className="text-xs text-neutral-400 mt-0.5">
          Führe alle Prüfpositionen gewissenhaft vor Ort an der Anlage durch.
        </p>
      </div>

      <div className="space-y-6">
        {schema.sections.map((section) => (
          <div key={section.id} className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 border-b border-neutral-800/80 pb-1">
              {section.title}
            </h3>

            <div className="space-y-3">
              {section.fields.map((field) => {
                const val = formValues[field.id];

                // Grenzwert-Prüfung für numerische Werte
                let isOutOfLimits = false;
                if (field.type === "NUMERIC" && val !== undefined && val !== "") {
                  const numVal = parseFloat(val);
                  if (
                    (field.minLimit !== undefined && numVal < field.minLimit) ||
                    (field.maxLimit !== undefined && numVal > field.maxLimit)
                  ) {
                    isOutOfLimits = true;
                  }
                }

                return (
                  <div
                    key={field.id}
                    className={`p-3 rounded-lg border transition-all ${
                      isOutOfLimits
                        ? "border-red-600 bg-red-950/20"
                        : "border-neutral-800 bg-neutral-950"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <Label className="text-xs font-medium text-neutral-200">
                        {field.label}
                        {field.required && <span className="text-red-400 ml-0.5">*</span>}
                      </Label>
                      {field.unit && (
                        <span className="text-[10px] font-mono text-neutral-500 uppercase">
                          [{field.unit}]
                        </span>
                      )}
                    </div>

                    {/* NUMERISCHES FELD */}
                    {field.type === "NUMERIC" && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            placeholder={
                              field.targetValue !== undefined ? `Soll: ${field.targetValue}` : "0.0"
                            }
                            value={val ?? ""}
                            onChange={(e) => handleInputChange(field.id, e.target.value)}
                            className={`font-mono text-sm ${
                              isOutOfLimits
                                ? "border-red-500 text-red-200 focus-visible:ring-red-500"
                                : ""
                            }`}
                          />
                          <span className="text-xs text-neutral-400 font-mono w-10">
                            {field.unit}
                          </span>
                        </div>

                        {/* Grenzwert-Hinweis */}
                        {isOutOfLimits && (
                          <div className="flex items-center gap-1 text-[11px] text-red-400 pt-1 font-medium">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            Grenzwert verletzt! (Erlaubt: {field.minLimit} bis {field.maxLimit}{" "}
                            {field.unit})
                            {field.triggerDefectOnFail && (
                              <span className="ml-1 underline">-> Folgestörung wird erzeugt!</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* CHECKBOX SWITCH (i.O. / n.i.O.) */}
                    {field.type === "BOOLEAN" && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleInputChange(field.id, true)}
                          className={`flex-1 py-1.5 px-3 rounded text-xs font-medium border flex items-center justify-center gap-1.5 transition-all ${
                            val === true
                              ? "bg-emerald-600 border-emerald-500 text-white shadow-sm"
                              : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white"
                          }`}
                        >
                          <CheckCircle className="h-3.5 w-3.5" /> in Ordnung (i.O.)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleInputChange(field.id, false)}
                          className={`flex-1 py-1.5 px-3 rounded text-xs font-medium border flex items-center justify-center gap-1.5 transition-all ${
                            val === false
                              ? "bg-red-600 border-red-500 text-white shadow-sm"
                              : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white"
                          }`}
                        >
                          <AlertTriangle className="h-3.5 w-3.5" /> Mangelhaft (n.i.O.)
                        </button>
                      </div>
                    )}

                    {/* DROPDOWN */}
                    {field.type === "SELECT" && (
                      <select
                        value={val || ""}
                        onChange={(e) => handleInputChange(field.id, e.target.value)}
                        className="w-full mt-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">Bitte auswählen...</option>
                        {field.options?.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* TEXT */}
                    {field.type === "TEXT" && (
                      <Input
                        type="text"
                        placeholder="Freitext-Bemerkung..."
                        value={val ?? ""}
                        onChange={(e) => handleInputChange(field.id, e.target.value)}
                        className="text-xs mt-1"
                      />
                    )}

                    {/* PHOTO UPLOAD */}
                    {field.type === "PHOTO" && (
                      <div className="mt-1 border border-dashed border-neutral-700 rounded-lg p-3 text-center bg-neutral-900/50 hover:bg-neutral-900 transition-colors cursor-pointer">
                        <Camera className="h-5 w-5 text-purple-400 mx-auto mb-1" />
                        <span className="text-xs text-neutral-300 block font-medium">
                          Foto aufnehmen oder hochladen
                        </span>
                        <span className="text-[10px] text-neutral-500">
                          JPG/PNG (Offline in IndexedDB gecacht)
                        </span>
                      </div>
                    )}

                    {/* DIGITALE UNTERSCHRIFT (CANVAS) */}
                    {field.type === "SIGNATURE" && (
                      <div className="mt-1 space-y-1.5">
                        <div className="rounded-lg border border-neutral-700 bg-neutral-950 p-1 relative">
                          <canvas
                            ref={canvasRef}
                            width={320}
                            height={100}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            className="w-full h-[100px] cursor-crosshair touch-none"
                          />
                          {!hasSignature && (
                            <span className="absolute inset-0 flex items-center justify-center text-[11px] text-neutral-600 pointer-events-none">
                              Hier mit Finger / Stift / Maus unterschreiben
                            </span>
                          )}
                        </div>
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-neutral-500">Rechtsgültiger Zeitstempel & ID</span>
                          <button
                            type="button"
                            onClick={clearSignature}
                            className="text-neutral-400 hover:text-white underline"
                          >
                            Unterschrift löschen
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 mt-4">
          Prüfprotokoll abschließen & signieren
        </Button>
      </div>
    </div>
  );
}
