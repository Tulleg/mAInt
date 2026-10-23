"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { UserSavedView } from "@/db/schema";
import { getUserSavedViews, getSavedViewById } from "@/actions/saved-view-actions";
import { CurrentUserRbacInfo } from "@/lib/rbac";
import { switchUserRoleAction } from "@/actions/rbac-actions";

export interface WorkspaceContextType {
  savedViews: UserSavedView[];
  activeView: UserSavedView | null;
  activeViewId: string | null;
  workspaceResetToken: number;
  selectView: (view: UserSavedView) => void;
  clearActiveView: () => void;
  refreshSavedViews: () => Promise<void>;
  addSavedView: (view: UserSavedView) => void;
  currentUser: CurrentUserRbacInfo;
  switchRole: (roleCode: string) => Promise<void>;
  switchingRole: boolean;
  aiProviderInfo: {
    provider: string;
    model?: string;
    isLocal?: boolean;
  };
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace muss innerhalb eines WorkspaceProviders verwendet werden.");
  }
  return context;
}

function ViewIdParamSync({
  savedViews,
  setActiveView,
}: {
  savedViews: UserSavedView[];
  setActiveView: (view: UserSavedView | null) => void;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    const rawViewId = searchParams.get("viewId");
    if (!rawViewId || typeof rawViewId !== "string" || !rawViewId.trim()) {
      return;
    }

    const viewIdFromUrl = rawViewId.trim();

    if (savedViews.length > 0) {
      const match = savedViews.find((v) => v.id === viewIdFromUrl);
      if (match) {
        setActiveView(match);
        return;
      }
    }

    // Wenn viewId in URL, aber noch nicht in savedViews: Asynchron per Server Action sicher nachladen
    let isCancelled = false;
    getSavedViewById(viewIdFromUrl)
      .then((res) => {
        if (!isCancelled && res.success && res.view) {
          setActiveView(res.view);
        }
      })
      .catch((err) => {
        console.warn("Fehler beim Auflösen der Deep-Link viewId:", viewIdFromUrl, err);
      });

    return () => {
      isCancelled = true;
    };
  }, [searchParams, savedViews, pathname, setActiveView]);

  return null;
}

export function WorkspaceProvider({
  children,
  initialSavedViews = [],
  initialRbac,
  initialAiProviderInfo,
}: {
  children: React.ReactNode;
  initialSavedViews?: UserSavedView[];
  initialRbac?: CurrentUserRbacInfo;
  initialAiProviderInfo?: { provider: string; model?: string; isLocal?: boolean };
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [savedViews, setSavedViews] = useState<UserSavedView[]>(initialSavedViews);
  const [activeView, setActiveView] = useState<UserSavedView | null>(null);
  const [workspaceResetToken, setWorkspaceResetToken] = useState(0);
  const [currentUser, setCurrentUser] = useState<CurrentUserRbacInfo>(
    initialRbac || {
      userId: "user-default-lead",
      roleCode: "SHIFT_LEAD",
      roleName: "Meister / Leitstand",
      userName: "Hans Meier",
      userEmail: "leiter@fertigung.de",
      canViewAiAnalytics: true,
    }
  );
  const [switchingRole, setSwitchingRole] = useState(false);

  const aiProviderInfo = initialAiProviderInfo || {
    provider: "GEMINI",
    model: "gemini-2.5-flash",
    isLocal: false,
  };

  const refreshSavedViews = useCallback(async () => {
    try {
      const result = await getUserSavedViews(currentUser.userId);
      if (result && Array.isArray(result)) {
        setSavedViews(result);
      }
    } catch (err) {
      console.warn("Fehler beim Aktualisieren der Favoriten:", err);
    }
  }, [currentUser.userId]);

  const selectView = useCallback(
    (view: UserSavedView) => {
      setActiveView(view);
      if (pathname === "/") {
        // Auf Startseite: URL-Parameter setzen ohne Page Reload
        const params = new URLSearchParams(window.location.search);
        params.set("viewId", view.id);
        window.history.pushState(null, "", `/?${params.toString()}`);
      } else {
        // Von einer anderen Seite: Direkt zur Startseite mit der View navigieren
        router.push(`/?viewId=${view.id}`);
      }
    },
    [pathname, router]
  );

  const clearActiveView = useCallback(() => {
    setActiveView(null);
    setWorkspaceResetToken((prev) => prev + 1);
    if (pathname === "/") {
      const params = new URLSearchParams(window.location.search);
      params.delete("viewId");
      const newQuery = params.toString();
      window.history.pushState(null, "", newQuery ? `/?${newQuery}` : "/");
    } else {
      router.push("/");
    }
  }, [pathname, router]);

  const addSavedView = useCallback((newView: UserSavedView) => {
    setSavedViews((prev) => {
      const filtered = prev.filter((v) => v.id !== newView.id);
      return [...filtered, newView].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    });
    setActiveView(newView);
    if (typeof window !== "undefined" && window.location.pathname === "/") {
      const params = new URLSearchParams(window.location.search);
      params.set("viewId", newView.id);
      window.history.pushState(null, "", `/?${params.toString()}`);
    }
  }, []);

  const switchRole = useCallback(
    async (newRoleCode: string) => {
      try {
        setSwitchingRole(true);
        const updated = await switchUserRoleAction(newRoleCode);
        setCurrentUser(updated);
        // Nach Rollenwechsel Favoriten des neuen Benutzers laden
        const views = await getUserSavedViews(updated.userId);
        if (views && Array.isArray(views)) {
          setSavedViews(views);
        }
      } catch (err) {
        console.error("Fehler beim Rollenwechsel:", err);
      } finally {
        setSwitchingRole(false);
      }
    },
    []
  );

  return (
    <WorkspaceContext.Provider
      value={{
        savedViews,
        activeView,
        activeViewId: activeView?.id || null,
        workspaceResetToken,
        selectView,
        clearActiveView,
        refreshSavedViews,
        addSavedView,
        currentUser,
        switchRole,
        switchingRole,
        aiProviderInfo,
      }}
    >
      <Suspense fallback={null}>
        <ViewIdParamSync savedViews={savedViews} setActiveView={setActiveView} />
      </Suspense>
      {children}
    </WorkspaceContext.Provider>
  );
}
