"use client";

import React, { useState, useTransition } from "react";
import {
  Users,
  Search,
  Shield,
  Key,
  CheckCircle2,
  XCircle,
  Edit2,
  RefreshCw,
  Server,
  Lock,
  UserCheck,
  UserX,
  Plus,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { updateUserRolesAction, toggleUserStatusAction } from "@/actions/user-actions";

export interface UserViewItem {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  personnelNr: string | null;
  workCenterCode: string | null;
  qualifications: string[];
  isActive: boolean;
  roles: Array<{ id: string; code: string; name: string }>;
  ssoStatus?: {
    provider: string;
    isSynced: boolean;
    lastLoginAt?: string | null;
    upn?: string;
  };
}

export interface RoleOption {
  id: string;
  code: string;
  name: string;
  description?: string | null;
}

interface UserManagementTableProps {
  users: UserViewItem[];
  allRoles: RoleOption[];
}

export function UserManagementTable({ users, allRoles }: UserManagementTableProps) {
  const [userList, setUserList] = useState<UserViewItem[]>(users);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [isPending, startTransition] = useTransition();

  // Dialog State für Rollen- & Berechtigungs-Editor
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<UserViewItem | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);

  // Filter anwenden
  const filteredUsers = userList.filter((u) => {
    const q = searchQuery.toLowerCase();
    const matchSearch =
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.personnelNr && u.personnelNr.toLowerCase().includes(q)) ||
      (u.workCenterCode && u.workCenterCode.toLowerCase().includes(q));

    const matchRole =
      roleFilter === "ALL" || u.roles.some((r) => r.code === roleFilter);

    const matchStatus =
      statusFilter === "ALL" ||
      (statusFilter === "ACTIVE" && u.isActive) ||
      (statusFilter === "INACTIVE" && !u.isActive);

    return matchSearch && matchRole && matchStatus;
  });

  const handleOpenEdit = (user: UserViewItem) => {
    setSelectedUserForEdit(user);
    setSelectedRoleIds(user.roles.map((r) => r.id));
  };

  const handleSaveRoles = () => {
    if (!selectedUserForEdit) return;

    startTransition(async () => {
      const res = await updateUserRolesAction({
        userId: selectedUserForEdit.id,
        roleIds: selectedRoleIds,
      });

      if (res.success) {
        toast.success(`Rollen für ${selectedUserForEdit.name} aktualisiert`);
        // Lokalen State aktualisieren
        const updatedRoles = allRoles.filter((r) => selectedRoleIds.includes(r.id));
        setUserList((prev) =>
          prev.map((u) =>
            u.id === selectedUserForEdit.id
              ? { ...u, roles: updatedRoles }
              : u
          )
        );
        setSelectedUserForEdit(null);
      } else {
        toast.error(res.error || "Fehler beim Speichern der Rollen");
      }
    });
  };

  const handleToggleStatus = (user: UserViewItem) => {
    startTransition(async () => {
      const newStatus = !user.isActive;
      const res = await toggleUserStatusAction({
        userId: user.id,
        isActive: newStatus,
      });

      if (res.success) {
        toast.success(`Benutzer ${user.name} ${newStatus ? "aktiviert" : "deaktiviert"}`);
        setUserList((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, isActive: newStatus } : u))
        );
      } else {
        toast.error("Statusänderung fehlgeschlagen");
      }
    });
  };

  const getRoleBadge = (code: string) => {
    switch (code) {
      case "ADMIN":
        return <Badge className="bg-purple-950 text-purple-300 border-purple-800">Administrator</Badge>;
      case "PLANNER":
        return <Badge className="bg-cyan-950 text-blue-300 border-cyan-800">Instandhaltungs-Koordinator</Badge>;
      case "TECHNICIAN":
        return <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800">Techniker</Badge>;
      case "REPORTER":
        return <Badge className="bg-amber-950 text-amber-300 border-amber-800">Maschinenbediener</Badge>;
      default:
        return <Badge variant="outline">{code}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Filter- & Suchleiste */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Benutzer suchen nach Name, E-Mail, Personalnummer (PERNR) oder Kostenstelle..."
            className="pl-9 h-9 text-xs bg-slate-950 border-slate-800 text-white"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-9 px-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-xs focus:outline-none"
          >
            <option value="ALL">Rolle: Alle</option>
            <option value="ADMIN">Administrator</option>
            <option value="PLANNER">Koordinator / Planer</option>
            <option value="TECHNICIAN">Techniker</option>
            <option value="REPORTER">Maschinenbediener</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-xs focus:outline-none"
          >
            <option value="ALL">Status: Alle</option>
            <option value="ACTIVE">Nur Aktive</option>
            <option value="INACTIVE">Nur Deaktivierte</option>
          </select>
        </div>
      </div>

      {/* Benutzer-Tabelle */}
      <Card className="border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Benutzer / Personal-Nr.</th>
                <th className="py-3 px-4">Arbeitsplatz & Qualifikationen</th>
                <th className="py-3 px-4">Zugewiesene Rollen</th>
                <th className="py-3 px-4">SSO / Active Directory</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Keine Benutzer mit den aktuellen Filtern gefunden.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr
                    key={u.id}
                    className="hover:bg-slate-800/40 transition-colors"
                  >
                    {/* Name & E-Mail */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-xs text-cyan-400 border border-slate-700 shrink-0">
                          {u.firstName?.[0] || ""}{u.lastName?.[0] || ""}
                        </div>
                        <div>
                          <div className="font-semibold text-white">
                            {u.name}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {u.email}
                          </div>
                          {u.personnelNr && (
                            <div className="font-mono text-[10px] text-slate-500">
                              PERNR: {u.personnelNr}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Arbeitsplatz & Qualifikationen */}
                    <td className="py-3 px-4">
                      <div className="space-y-1">
                        <span className="font-mono text-[11px] text-slate-300 block">
                          {u.workCenterCode || "Zentral / Werk 1"}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {u.qualifications && u.qualifications.length > 0 ? (
                            u.qualifications.map((q, qIdx) => (
                              <span
                                key={qIdx}
                                className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] text-slate-300"
                              >
                                {q}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-500 text-[10px]">Keine Qualifikationen</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Rollen */}
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1.5">
                        {u.roles.map((r) => (
                          <span key={r.id}>{getRoleBadge(r.code)}</span>
                        ))}
                      </div>
                    </td>

                    {/* SSO / AD Status */}
                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-medium">
                          <Server className="h-3 w-3" />
                          <span>Azure AD / Kerberos Sync</span>
                        </div>
                        <span className="text-[10px] text-slate-400 block font-mono">
                          SSO aktiv · UID: {u.email.split("@")[0]}
                        </span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4 text-center">
                      {u.isActive ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800/80 text-emerald-300 text-[10px] font-medium">
                          <CheckCircle2 className="h-3 w-3" />
                          Aktiv
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 text-[10px]">
                          <XCircle className="h-3 w-3" />
                          Gesperrt
                        </span>
                      )}
                    </td>

                    {/* Aktionen */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(u)}
                          className="h-11 min-h-[44px] md:h-8 md:min-h-[32px] px-2.5 text-xs border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-200 gap-1"
                          title="Rollen & Berechtigungen anpassen"
                        >
                          <Key className="h-3 w-3 text-amber-400" />
                          <span>Rollen</span>
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleStatus(u)}
                          className={`h-7 px-2 text-xs ${
                            u.isActive
                              ? "text-rose-400 hover:text-red-300 hover:bg-rose-950/30"
                              : "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30"
                          }`}
                          title={u.isActive ? "Benutzer sperren" : "Benutzer aktivieren"}
                        >
                          {u.isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ========================================================================= */}
      {/* BERECHTIGUNGS- & ROLLEN-EDITOR MODAL                                      */}
      {/* ========================================================================= */}
      {selectedUserForEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Shield className="h-5 w-5 text-cyan-400" />
                  Rollen- & Berechtigungs-Editor
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Benutzer: <strong className="text-white">{selectedUserForEdit.name}</strong> ({selectedUserForEdit.email})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUserForEdit(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {/* Rollenauswahl */}
            <div className="space-y-3">
              <span className="text-xs font-semibold text-slate-300 block">
                Zuzuweisende Systemrollen (RBAC):
              </span>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {allRoles.map((role) => {
                  const isChecked = selectedRoleIds.includes(role.id);

                  return (
                    <label
                      key={role.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        isChecked
                          ? "bg-cyan-950/40 border-cyan-700/80 text-white"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRoleIds([...selectedRoleIds, role.id]);
                          } else {
                            setSelectedRoleIds(selectedRoleIds.filter((id) => id !== role.id));
                          }
                        }}
                        className="mt-0.5 rounded border-slate-700 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-slate-200">
                            {role.name}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400 px-1 rounded bg-slate-800">
                            {role.code}
                          </span>
                        </div>
                        {role.description && (
                          <p className="text-[11px] text-slate-400 leading-snug">
                            {role.description}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Berechtigungs-Hinweis */}
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-400 space-y-1">
              <div className="flex items-center gap-1.5 font-medium text-slate-300">
                <Lock className="h-3.5 w-3.5 text-amber-400" />
                <span>Automatisch vererbte Systemrechte:</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Berechtigungen für Auftragserstellung, Freigaben, Arbeitsrückmeldungen und SAP-Warenbewegungen (261)
                werden dynamisch über die Rollenmatrix gesteuert.
              </p>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedUserForEdit(null)}
                className="border-slate-700 text-slate-300"
              >
                Abbrechen
              </Button>
              <Button
                size="sm"
                onClick={handleSaveRoles}
                disabled={isPending}
                className="bg-cyan-600 hover:bg-cyan-500 text-white gap-1.5"
              >
                {isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                <span>Änderungen speichern</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
