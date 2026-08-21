import type { Metadata } from "next";
import { getTranslations } from 'next-intl/server';
import { Submitting } from "@/features/Submitting";

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  return { title: t('submittingTitle'), description: t('submittingDescription') };
}

export default function SubmittingPage() {
  return <Submitting />;
}
