import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUserRbac } from "@/lib/rbac";
import { getUserSavedViews } from "@/actions/saved-view-actions";
import { getTenantAiConfig } from "@/lib/ai/provider";
import { WorkspaceProvider } from "@/components/layout/workspace-context";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialRbac = await getCurrentUserRbac();
  const initialSavedViews = await getUserSavedViews(initialRbac.userId);

  let aiProviderInfo = {
    provider: "GEMINI",
    model: "gemini-2.5-flash",
    isLocal: false,
  };

  try {
    const aiConfig = await getTenantAiConfig();
    if (aiConfig) {
      aiProviderInfo = {
        provider: aiConfig.provider,
        model: aiConfig.chatModel,
        isLocal: aiConfig.provider === "OLLAMA" || aiConfig.provider === "VLLM",
      };
    }
  } catch (_) {}

  return (
    <WorkspaceProvider
      initialRbac={initialRbac}
      initialSavedViews={initialSavedViews}
      initialAiProviderInfo={aiProviderInfo}
    >
      <AppShell>{children}</AppShell>
    </WorkspaceProvider>
  );
}
