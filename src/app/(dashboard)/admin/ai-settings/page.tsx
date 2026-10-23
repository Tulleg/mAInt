"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  Cpu,
  Server,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Save,
  Radio,
  Zap,
  ShieldCheck,
  ExternalLink,
  Sliders,
  Database,
  ArrowRight,
  Layers,
  Sparkles,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/ui/back-button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getTenantAiConfigAction,
  updateTenantAiConfigAction,
  testAiConnectionAction,
  testAiProviderConnectionAction,
} from "@/actions/ai-settings-actions";
import { AiProviderType } from "@/lib/ai/provider";

interface ModelOption {
  id: string;
  name: string;
  description: string;
  provider: AiProviderType;
  category: "CLOUD" | "ON_PREMISE";
}

const AVAILABLE_CHAT_MODELS: ModelOption[] = [
  // Google Gemini
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    description: "Standard / Ultraschnelles Modell für Routing, Instandhaltung, Copilot und Analysen",
    provider: "GEMINI",
    category: "CLOUD",
  },
  {
    id: "gemini-1.5-flash",
    name: "Gemini 1.5 Flash",
    description: "Kostengünstiges Modell für Routing und Assistenz",
    provider: "GEMINI",
    category: "CLOUD",
  },
  {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    description: "Großes Kontextfenster (bis 2 Mio. Tokens) für lange Handbücher & Pläne",
    provider: "GEMINI",
    category: "CLOUD",
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    description: "Ultraschnelle Inferenz mit neuester Gemini 2.0 Architektur",
    provider: "GEMINI",
    category: "CLOUD",
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    description: "Flaggschiff-Modell für komplexe Ursachenanalysen & schreibgeschützte NL-to-SQL Generierung",
    provider: "GEMINI",
    category: "CLOUD",
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    description: "Ultraschnelle Inferenz mit geringer Latenz für Live-Interaktionen",
    provider: "GEMINI",
    category: "CLOUD",
  },
  // OpenAI
  {
    id: "gpt-4o",
    name: "GPT-4o (Omni)",
    description: "Multimodales Standardmodell mit hoher Genauigkeit bei Tabellen & SQL",
    provider: "OPENAI",
    category: "CLOUD",
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o mini",
    description: "Kosteneffizientes Modell für Routineabfragen und Dokumentationsentwürfe",
    provider: "OPENAI",
    category: "CLOUD",
  },
  {
    id: "o3-mini",
    name: "OpenAI o3-mini",
    description: "Reasoning-fokussiertes Modell für mehrstufige Fehlerbaum-Logik",
    provider: "OPENAI",
    category: "CLOUD",
  },
  // Ollama (On-Premise)
  {
    id: "llama3.3:70b",
    name: "Llama 3.3 (70B)",
    description: "Leistungsstarkes lokales Open-Weights-Modell für vertrauliche Werksdaten",
    provider: "OLLAMA",
    category: "ON_PREMISE",
  },
  {
    id: "qwen2.5:32b",
    name: "Qwen 2.5 (32B)",
    description: "Hervorragende SQL- und Codegenerierung bei moderatem GPU-VRAM-Bedarf",
    provider: "OLLAMA",
    category: "ON_PREMISE",
  },
  {
    id: "llama3.1:8b",
    name: "Llama 3.1 (8B)",
    description: "Kompaktes Modell für lokale Edge-Server oder einfache CPU-Inferenz",
    provider: "OLLAMA",
    category: "ON_PREMISE",
  },
  {
    id: "deepseek-r1:32b",
    name: "DeepSeek R1 (32B)",
    description: "Lokale Chain-of-Thought Inferenz für knifflige Instandhaltungsstörungen",
    provider: "OLLAMA",
    category: "ON_PREMISE",
  },
  // vLLM
  {
    id: "meta-llama/Llama-3.3-70B-Instruct",
    name: "vLLM: Llama 3.3 70B Instruct",
    description: "PagedAttention High-Throughput Cluster für parallele Werkstattanfragen",
    provider: "VLLM",
    category: "ON_PREMISE",
  },
  {
    id: "Qwen/Qwen2.5-32B-Instruct",
    name: "vLLM: Qwen 2.5 32B Instruct",
    description: "Schnelle Batch-Inferenz im hauseigenen Rechenzentrum",
    provider: "VLLM",
    category: "ON_PREMISE",
  },
];

const AVAILABLE_EMBEDDING_MODELS = [
  { id: "text-embedding-3-small", label: "text-embedding-3-small (OpenAI, 1536 Dim)", defaultDims: 1536 as const },
  { id: "text-embedding-004", label: "text-embedding-004 (Google Gemini, 768 Dim)", defaultDims: 1536 as const },
  { id: "nomic-embed-text", label: "nomic-embed-text (Ollama lokal, 768 Dim)", defaultDims: 1536 as const },
  { id: "BAAI/bge-m3", label: "BAAI/bge-m3 (vLLM / Open, 1024 Dim)", defaultDims: 1536 as const },
  { id: "text-embedding-3-large", label: "text-embedding-3-large (OpenAI, 1536 Dim)", defaultDims: 1536 as const },
];

export default function AiSettingsPage() {
  const [tenantId] = useState("demo-tenant-1000");
  const [isPending, startTransition] = useTransition();
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Filter / Ansicht: Cloud vs. On-Premise
  const [environmentFilter, setEnvironmentFilter] = useState<"ALL" | "CLOUD" | "ON_PREMISE">("ALL");

  // Form State
  const [provider, setProvider] = useState<AiProviderType>("GEMINI");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasStoredApiKey, setHasStoredApiKey] = useState(false);
  const [maskedApiKey, setMaskedApiKey] = useState("");
  const [chatModel, setChatModel] = useState("gemini-3.8-flash");
  const [embeddingModel, setEmbeddingModel] = useState("text-embedding-004");
  const [embeddingDimensions, setEmbeddingDimensions] = useState<768 | 1536>(768);

  // Test Connection State
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
    provider?: string;
    status?: "Online" | "Offline";
    model?: string;
  } | null>(null);

  // Save Status Feedback
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoadingConfig(true);
        const cfg = await getTenantAiConfigAction(tenantId);
        if (cfg) {
          setProvider(cfg.provider);
          setEndpointUrl(cfg.endpointUrl || "");
          setChatModel(cfg.chatModel || "gemini-3.8-flash");
          setEmbeddingModel(cfg.embeddingModel || "text-embedding-004");
          setEmbeddingDimensions(cfg.embeddingDimensions || 1536);
          if (cfg.hasApiKey) {
            setHasStoredApiKey(true);
            setMaskedApiKey(cfg.maskedApiKey || "••••••••••••••••");
          }
        }
      } catch (err) {
        console.error("Fehler beim Laden der AI-Konfiguration:", err);
      } finally {
        setLoadingConfig(false);
      }
    }
    load();
  }, [tenantId]);

  // Provider Preset anwenden
  const applyPreset = (presetType: AiProviderType) => {
    setProvider(presetType);
    setTestResult(null);

    if (presetType === "GEMINI") {
      setEndpointUrl("https://generativelanguage.googleapis.com/v1beta/openai");
      setChatModel("gemini-1.5-flash");
      setEmbeddingModel("text-embedding-004");
      setEmbeddingDimensions(768);
    } else if (presetType === "OPENAI") {
      setEndpointUrl("https://api.openai.com/v1");
      setChatModel("gpt-4o");
      setEmbeddingModel("text-embedding-3-small");
      setEmbeddingDimensions(1536);
    } else if (presetType === "OLLAMA") {
      setEndpointUrl("http://localhost:11434/v1");
      setChatModel("llama3.3:70b");
      setEmbeddingModel("nomic-embed-text");
      setEmbeddingDimensions(1536);
    } else if (presetType === "VLLM") {
      setEndpointUrl("http://localhost:8000/v1");
      setChatModel("meta-llama/Llama-3.3-70B-Instruct");
      setEmbeddingModel("BAAI/bge-m3");
      setEmbeddingDimensions(1536);
    }
  };

  // Verbindung testen mit startTransition
  const handleTestConnection = () => {
    setTestingConnection(true);
    setTestResult(null);
    startTransition(async () => {
      try {
        const res = await testAiProviderConnectionAction({
          provider,
          baseUrl: endpointUrl.trim() || undefined,
          apiKey: apiKey.trim() || undefined,
          tenantId,
          chatModel,
          embeddingModel,
          embeddingDimensions,
        });
        setTestResult(res);
      } catch (err: any) {
        setTestResult({
          success: false,
          latencyMs: 0,
          status: "Offline",
          message: err.message || "Fehler beim Verbindungstest.",
        });
      } finally {
        setTestingConnection(false);
      }
    });
  };

  // Speichern in DB
  const handleSave = () => {
    startTransition(async () => {
      try {
        await updateTenantAiConfigAction(tenantId, {
          provider,
          endpointUrl: endpointUrl.trim() || undefined,
          apiKey: apiKey.trim() || undefined,
          chatModel,
          embeddingModel,
          embeddingDimensions,
        });
        if (apiKey.trim()) {
          setHasStoredApiKey(true);
          const trimmed = apiKey.trim();
          setMaskedApiKey(trimmed.length > 8 ? `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}` : "••••••••");
          setApiKey("");
        }
        setSaveMessage("KI-Konfiguration erfolgreich mandantenweit in der Datenbank gespeichert und aktiviert!");
        setTimeout(() => setSaveMessage(null), 4000);
      } catch (err: any) {
        alert("Fehler beim Speichern: " + err.message);
      }
    });
  };

  const isCurrentOnPremise = provider === "OLLAMA" || provider === "VLLM";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-8 space-y-6">
      {/* Header mit Zurück-Button */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <BackButton fallbackUrl="/admin" label="Zurück zur Administration" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Cpu className="h-7 w-7 text-purple-500" />
            KI-Modell & Provider Steuerung (Cloud vs. On-Premise)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Wähle flexibel zwischen Cloud-LLMs (Google Gemini, OpenAI) und sicheren On-Premise Runtimes
            (Ollama, vLLM) für Störungs-Copilot, RAG-Embedding und NL-to-SQL Leitstand-Analytics.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant={isCurrentOnPremise ? "outline" : "default"}
            className={
              isCurrentOnPremise
                ? "border-purple-600 bg-purple-950/40 text-purple-300 px-3 py-1 text-xs"
                : "border-blue-600 bg-cyan-950/40 text-cyan-300 px-3 py-1 text-xs"
            }
          >
            {isCurrentOnPremise ? "🔒 On-Premise aktiv" : "☁️ Cloud LLM aktiv"}
          </Badge>
          <Badge variant="outline" className="border-slate-700 text-slate-300 text-xs">
            Mandant: {tenantId}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Linke 2 Spalten: Provider & Modell-Konfiguration */}
        <div className="lg:col-span-2 space-y-6">
          {/* Provider Kacheln */}
          <Card className="border-slate-800 bg-slate-900">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base text-white flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-cyan-400" />
                    1. Provider-Auswahl: Cloud vs. On-Premise
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400 mt-1">
                    Bestimme die Zielumgebung für Inferenz und Datensouveränität.
                  </CardDescription>
                </div>

                <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setEnvironmentFilter("ALL")}
                    className={`px-2.5 py-1 rounded ${environmentFilter === "ALL" ? "bg-slate-800 text-white font-medium" : "text-slate-400 hover:text-white"}`}
                  >
                    Alle
                  </button>
                  <button
                    type="button"
                    onClick={() => setEnvironmentFilter("CLOUD")}
                    className={`px-2.5 py-1 rounded ${environmentFilter === "CLOUD" ? "bg-cyan-600/30 text-cyan-300 font-medium border border-blue-500/40" : "text-slate-400 hover:text-white"}`}
                  >
                    ☁️ Cloud
                  </button>
                  <button
                    type="button"
                    onClick={() => setEnvironmentFilter("ON_PREMISE")}
                    className={`px-2.5 py-1 rounded ${environmentFilter === "ON_PREMISE" ? "bg-purple-600/30 text-purple-300 font-medium border border-purple-500/40" : "text-slate-400 hover:text-white"}`}
                  >
                    🔒 On-Premise
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* GEMINI */}
                {(environmentFilter === "ALL" || environmentFilter === "CLOUD") && (
                  <button
                    type="button"
                    onClick={() => applyPreset("GEMINI")}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      provider === "GEMINI"
                        ? "bg-amber-950/40 border-amber-500 shadow-lg shadow-amber-950/50"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-amber-400" />
                        <span className="font-semibold text-sm text-white">Google Gemini</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] border-amber-800 text-amber-300">
                        Cloud
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400">
                      Gemini 2.5 Pro & Gemini 2.5 Flash mit schnellem Reasoning und Text-Embedding-004.
                    </p>
                  </button>
                )}

                {/* OPENAI */}
                {(environmentFilter === "ALL" || environmentFilter === "CLOUD") && (
                  <button
                    type="button"
                    onClick={() => applyPreset("OPENAI")}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      provider === "OPENAI"
                        ? "bg-emerald-950/40 border-emerald-500 shadow-lg shadow-emerald-950/50"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Cloud className="w-5 h-5 text-emerald-400" />
                        <span className="font-semibold text-sm text-white">OpenAI Cloud</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] border-emerald-800 text-emerald-300">
                        Cloud SaaS
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400">
                      GPT-4o, GPT-4o mini, o3-mini und text-embedding-3-small über Standard OpenAI API.
                    </p>
                  </button>
                )}

                {/* OLLAMA */}
                {(environmentFilter === "ALL" || environmentFilter === "ON_PREMISE") && (
                  <button
                    type="button"
                    onClick={() => applyPreset("OLLAMA")}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      provider === "OLLAMA"
                        ? "bg-purple-950/40 border-purple-500 shadow-lg shadow-purple-950/50"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Server className="w-5 h-5 text-purple-400" />
                        <span className="font-semibold text-sm text-white">Ollama</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] border-purple-800 text-purple-300">
                        On-Premise Edge
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400">
                      Llama 3.3 (70B), Qwen 2.5 (32B), Nomic-Embed. 100% lokal ohne externen Datentransfer.
                    </p>
                  </button>
                )}

                {/* VLLM */}
                {(environmentFilter === "ALL" || environmentFilter === "ON_PREMISE") && (
                  <button
                    type="button"
                    onClick={() => applyPreset("VLLM")}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      provider === "VLLM"
                        ? "bg-cyan-950/40 border-blue-500 shadow-lg shadow-blue-950/50"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-cyan-400" />
                        <span className="font-semibold text-sm text-white">vLLM GPU Endpoint</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] border-cyan-800 text-cyan-300">
                        On-Premise Cluster
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400">
                      High-Throughput PagedAttention Server für Firmen-Rechenzentren (Llama 3.3, BGE-M3).
                    </p>
                  </button>
                )}
              </div>

              {/* Detail-Konfiguration Formular */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-4 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Endpoint URL */}
                  <div className="space-y-1.5 md:col-span-2">
                    <Label className="text-xs text-slate-300">
                      API-Endpunkt URL (Base URL)
                    </Label>
                    <Input
                      value={endpointUrl}
                      onChange={(e) => setEndpointUrl(e.target.value)}
                      placeholder="http://localhost:11434/v1 oder https://api.openai.com/v1"
                      className="bg-slate-900 border-slate-700 text-white font-mono text-xs"
                    />
                    <p className="text-[11px] text-slate-500">
                      Standard für Ollama: <code>http://localhost:11434/v1</code> • vLLM: <code>http://localhost:8000/v1</code>
                    </p>
                  </div>

                  {/* API-Key Eingabe für Cloud-Provider (Gemini / OpenAI) */}
                  {(provider === "GEMINI" || provider === "OPENAI") && (
                    <div className="space-y-1.5 md:col-span-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-slate-300 flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                          Cloud API-Schlüssel ({provider === "GEMINI" ? "Google Gemini" : "OpenAI"})
                        </Label>
                        {hasStoredApiKey && (
                          <Badge variant="outline" className="text-[10px] border-emerald-700 bg-emerald-950/40 text-emerald-300 flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Schlüssel gespeichert: {maskedApiKey}</span>
                          </Badge>
                        )}
                      </div>
                      <Input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={
                          hasStoredApiKey
                            ? "Neuen Schlüssel eingeben (leer lassen, um aktuellen beizubehalten)..."
                            : provider === "GEMINI"
                            ? "Google Gemini API-Key (z. B. AIzaSy...)"
                            : "OpenAI API-Key (z. B. sk-...)"
                        }
                        className="bg-slate-900 border-slate-700 text-white font-mono text-xs"
                      />
                      <p className="text-[11px] text-slate-500">
                        Wird sicher in der Mandanten-Konfiguration mit <strong>AES-256-GCM</strong> verschlüsselt hinterlegt und für <code>ILlmProvider</code> &amp; Intent-Routing bereitgestellt.
                      </p>
                    </div>
                  )}

                  {/* Modell-Dropdown & Eingabefeld */}
                  <div className="space-y-1.5 md:col-span-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-slate-300">
                        2. Chat / LLM Modell (Dropdown oder Direkteingabe)
                      </Label>
                      <span className="text-[11px] text-slate-500">
                        Aktuell ausgewählt: <code className="text-cyan-400 font-mono">{chatModel}</code>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {/* Dropdown */}
                      <select
                        value={AVAILABLE_CHAT_MODELS.some((m) => m.id === chatModel) ? chatModel : "CUSTOM"}
                        onChange={(e) => {
                          if (e.target.value !== "CUSTOM") {
                            setChatModel(e.target.value);
                          }
                        }}
                        aria-label="Vorkonfiguriertes KI-Modell auswählen"
                        className="w-full bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                      >
                        <optgroup label="Google Gemini (Cloud)">
                          <option value="gemini-1.5-flash">gemini-1.5-flash (Standard / Fallback)</option>
                          <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                          <option value="gemini-2.5-flash">gemini-2.5-flash (High-Speed)</option>
                          <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                        </optgroup>
                        <optgroup label="OpenAI (Cloud)">
                          <option value="gpt-4o">gpt-4o (Omni)</option>
                          <option value="gpt-4o-mini">gpt-4o-mini</option>
                          <option value="o3-mini">o3-mini (Reasoning)</option>
                        </optgroup>
                        <optgroup label="Ollama (On-Premise)">
                          <option value="llama3.3:70b">llama3.3:70b (Top Open LLM)</option>
                          <option value="qwen2.5:32b">qwen2.5:32b (Code/SQL Spezi)</option>
                          <option value="llama3.1:8b">llama3.1:8b (Kompakt)</option>
                          <option value="deepseek-r1:32b">deepseek-r1:32b</option>
                        </optgroup>
                        <optgroup label="vLLM Cluster">
                          <option value="meta-llama/Llama-3.3-70B-Instruct">meta-llama/Llama-3.3-70B-Instruct</option>
                          <option value="Qwen/Qwen2.5-32B-Instruct">Qwen/Qwen2.5-32B-Instruct</option>
                        </optgroup>
                        <option value="CUSTOM">Eigenes Modell manuell eingeben...</option>
                      </select>

                      {/* Text-Eingabefeld */}
                      <Input
                        value={chatModel}
                        onChange={(e) => setChatModel(e.target.value)}
                        placeholder="Modellname eingeben (z. B. gemini-2.5-pro, qwen2.5:32b)"
                        className="bg-slate-900 border-slate-700 text-white text-xs font-mono"
                      />
                    </div>
                  </div>

                  {/* Embedding Modell Konfiguration */}
                  <div className="space-y-1.5 md:col-span-2">
                    <Label className="text-xs text-slate-300">
                      3. Embedding-Modell (Vektorisierung für pgvector)
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        value={AVAILABLE_EMBEDDING_MODELS.some((m) => m.id === embeddingModel) ? embeddingModel : "CUSTOM"}
                        onChange={(e) => {
                          if (e.target.value !== "CUSTOM") {
                            setEmbeddingModel(e.target.value);
                            const found = AVAILABLE_EMBEDDING_MODELS.find((m) => m.id === e.target.value);
                            if (found) setEmbeddingDimensions(found.defaultDims);
                          }
                        }}
                        aria-label="Vorkonfiguriertes Embedding-Modell auswählen"
                        className="w-full bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                      >
                        {AVAILABLE_EMBEDDING_MODELS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                        <option value="CUSTOM">Eigenes Embedding-Modell...</option>
                      </select>

                      <Input
                        value={embeddingModel}
                        onChange={(e) => setEmbeddingModel(e.target.value)}
                        placeholder="z. B. text-embedding-004, nomic-embed-text"
                        className="bg-slate-900 border-slate-700 text-white text-xs font-mono"
                      />
                    </div>
                  </div>

                  {/* pgvector Dimension */}
                  <div className="space-y-1.5 md:col-span-2 pt-1 border-t border-slate-800">
                    <Label className="text-xs text-slate-300">
                      pgvector Vektor-Zieldimension in PostgreSQL
                    </Label>
                    <div className="flex flex-wrap items-center gap-4 text-xs pt-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="dims"
                          checked={embeddingDimensions === 1536}
                          onChange={() => setEmbeddingDimensions(1536)}
                          className="text-blue-600 focus:ring-0"
                        />
                        <span className="text-slate-200">
                          <strong>1536 Dimensionen</strong> (Standard pgvector Index mit L2-Normalisierung & Zero-Padding)
                        </span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="dims"
                          checked={embeddingDimensions === 768}
                          onChange={() => setEmbeddingDimensions(768)}
                          className="text-blue-600 focus:ring-0"
                        />
                        <span className="text-slate-200">
                          <strong>768 Dimensionen</strong> (Kompakt / Nomic nativ)
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Live-Statusanzeige für Verbindungstest */}
                {testResult && (
                  <div
                    className={`p-3.5 rounded-xl border text-xs flex items-start gap-3 animate-in fade-in ${
                      testResult.success
                        ? "bg-emerald-950/40 border-emerald-800 text-emerald-200"
                        : "bg-rose-950/40 border-rose-800 text-red-200"
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">
                          {testResult.success ? "Verbindungstest erfolgreich!" : "Verbindung fehlgeschlagen"}
                        </span>
                        {testResult.success ? (
                          <Badge variant="outline" className="text-xs border-emerald-500 bg-emerald-950/70 text-emerald-300 font-semibold px-2 py-0.5 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            Online
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs border-rose-500 bg-rose-950/70 text-rose-300 font-semibold px-2 py-0.5 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-rose-400" />
                            Offline
                          </Badge>
                        )}
                        {typeof testResult.latencyMs === "number" && (
                          <Badge variant="outline" className="text-[10px] border-slate-700 bg-slate-900 text-slate-300">
                            {testResult.latencyMs} ms
                          </Badge>
                        )}
                        {testResult.model && (
                          <Badge variant="outline" className="text-[10px] border-slate-700 bg-slate-900 text-slate-300 font-mono">
                            {testResult.model}
                          </Badge>
                        )}
                      </div>
                      <p className="leading-relaxed">{testResult.message}</p>
                    </div>
                  </div>
                )}

                {/* Save Feedback */}
                {saveMessage && (
                  <div className="p-3 bg-emerald-950/50 border border-emerald-600 rounded-lg text-xs text-emerald-200 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{saveMessage}</span>
                  </div>
                )}

                {/* Action Buttons: Testen & Speichern */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestConnection}
                    disabled={testingConnection}
                    className="border-slate-700 hover:bg-slate-800 text-xs text-slate-200 flex items-center gap-2 h-9 px-4"
                  >
                    {testingConnection ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                        <span>Prüfe Erreichbarkeit...</span>
                      </>
                    ) : (
                      <>
                        <Radio className="w-4 h-4 text-cyan-400" />
                        <span>Verbindung testen</span>
                      </>
                    )}
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSave}
                    disabled={isPending}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-2 px-5 h-9 shadow-md shadow-blue-600/20"
                  >
                    {isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Speichere in Datenbank...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Mandantenweit speichern & aktivieren</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Rechte Spalte: On-Premise Leitfaden & Status */}
        <div className="space-y-6">
          <Card className="border-slate-800 bg-slate-900">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                Datenschutz & On-Premise Leitfaden
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3.5 text-xs text-slate-300">
              <p className="leading-relaxed">
                Für vertrauliche Werkdaten, sicherheitskritische Störungsprotokolle und sensible Maschinendaten
                unterstützt MaintAI <strong>Ollama</strong> oder <strong>vLLM</strong> direkt im Firmennetzwerk.
              </p>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5 font-mono text-[11px] text-slate-400">
                <p className="text-slate-200 font-semibold font-sans">Schnellstart mit empfohlenen Modellen:</p>
                <code>ollama run llama3.3:70b</code>
                <br />
                <code>ollama run qwen2.5:32b</code>
                <br />
                <code>ollama pull nomic-embed-text</code>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
                <span className="font-semibold text-white block">Vektor-Normalisierung für pgvector:</span>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Die MaintAI Vektor-Pipeline nutzt automatische Dimensionsanpassung mit L2-Einheitsnormalisierung.
                  Modelle mit 768 Dimensionen (Gemini, Nomic) werden deterministisch in den PostgreSQL{" "}
                  <code>pgvector(1536)</code> HNSW-Index eingepasst, ohne Kosinus-Verzerrung.
                </p>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                <span className="font-semibold text-white block">Mandanten-Geltungsbereich:</span>
                <p className="text-slate-400 text-[11px]">
                  Die gespeicherte Konfiguration wird mandantenweit in der Tabelle <code>tenants.ai_config</code> hinterlegt
                  und greift sofort für alle Benutzer des Werks.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
