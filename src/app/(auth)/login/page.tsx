"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, Lock, Building2, ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberTerminal, setRememberTerminal] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    toast.success("Erfolgreich angemeldet. Weiterleitung zum Leitstand...");
    setTimeout(() => {
      router.push("/");
    }, 600);
  };

  const handleSsoLogin = () => {
    toast.info("Verbindung mit Unternehmens-SSO (Azure AD) wird hergestellt...");
    setTimeout(() => {
      router.push("/");
    }, 800);
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900 flex flex-col justify-center items-center p-4 antialiased selection:bg-blue-100 selection:text-blue-900">
      {/* Top Brand Stripe */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-blue-600 shadow-sm" />

      {/* Main Centered Login Card */}
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 shadow-sm transition-shadow">
        {/* Logo & Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-9 h-9 rounded-[10px] bg-blue-50 border border-blue-100 flex items-center justify-center mb-3 shadow-2xs">
            <span className="w-3 h-3 rounded-full bg-blue-600" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            MaintAI
          </h1>
          <h2 className="text-sm font-semibold text-slate-700 mt-1">
            Industrieller Instandhaltungs-Leitstand
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Melden Sie sich mit Ihrem Werks-Account an
          </p>
        </div>

        {/* SSO Button (Enterprise) */}
        <div className="mb-6">
          <button
            type="button"
            onClick={handleSsoLogin}
            className="w-full min-h-[46px] px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold flex items-center justify-center gap-2.5 transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 active:bg-slate-100"
          >
            <span className="text-base leading-none">🏢</span>
            <span>Mit Firmen-SSO / Azure AD anmelden</span>
          </button>
        </div>

        {/* Divider */}
        <div className="relative flex items-center justify-center mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative bg-white px-3 text-xs text-slate-400 font-medium">
            oder mit Kennung anmelden
          </div>
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username / Personalnummer */}
          <div className="space-y-1.5">
            <label
              htmlFor="username"
              className="block text-xs font-medium text-slate-700"
            >
              Personalnummer / Benutzername
            </label>
            <div className="relative rounded-lg shadow-2xs">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                id="username"
                name="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="z. B. MA-84920 oder vorname.nachname"
                className="w-full min-h-[44px] pl-10 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-colors"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="block text-xs font-medium text-slate-700"
              >
                Passwort
              </label>
              <Link
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  toast.info(
                    "Bitte wenden Sie sich an die Werks-IT (Hotline: 5555) zum Zurücksetzen Ihres Kennworts."
                  );
                }}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                Passwort vergessen?
              </Link>
            </div>
            <div className="relative rounded-lg shadow-2xs">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full min-h-[44px] pl-10 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-colors"
              />
            </div>
          </div>

          {/* Remember Checkbox */}
          <div className="pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer group select-none">
              <div
                onClick={() => setRememberTerminal(!rememberTerminal)}
                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  rememberTerminal
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "border-slate-300 bg-white group-hover:border-slate-400"
                }`}
              >
                {rememberTerminal && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
              <span
                onClick={() => setRememberTerminal(!rememberTerminal)}
                className="text-xs text-slate-600 group-hover:text-slate-800"
              >
                Auf diesem Werkstatt-Terminal angemeldet bleiben
              </span>
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full min-h-[46px] mt-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors shadow-sm disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <span>{isLoading ? "Wird angemeldet..." : "Anmelden"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Card Footer */}
        <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-center gap-2 text-[11px] text-slate-400 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>MaintAI v1.1.0 • Offline-Sync aktiv • Server: Online</span>
        </div>
      </div>
    </div>
  );
}
