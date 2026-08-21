import type { Metadata } from "next";
import { getTranslations } from 'next-intl/server';
import { Settings } from "@/features/Settings/Settings";

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  return { title: t('settingsTitle'), description: t('settingsDescription') };
}

export default function SettingsPage() {
  return <Settings />;
}
