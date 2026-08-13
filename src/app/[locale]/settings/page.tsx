import type { Metadata } from "next";
import { Settings } from "@/features/Settings/Settings";

export const metadata: Metadata = {
  title: "Settings",
  description: "Choose which AI provider and model the app uses.",
};

export default function SettingsPage() {
  return <Settings />;
}
