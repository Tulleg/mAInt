import AiSettingsPage from "../ai-settings/page";

export const metadata = {
  title: "KI-Modell & Provider Steuerung | MaintAI Admin",
  description: "Provider-Auswahl Cloud vs. On-Premise, Modellkonfiguration und Verbindungstests",
};

export default function AdminAiPage() {
  return <AiSettingsPage />;
}
