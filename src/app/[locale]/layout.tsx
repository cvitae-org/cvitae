import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/libs/i18n/routing";
import "../globals.scss";

export const metadata: Metadata = {
  title: "Dominik Beń — CV",
  description:
    "Interactive CV of Dominik Beń, Frontend Developer specializing in React, Next.js, and modern web technologies",
  icons: {
    icon: [{ url: "/favicon.ico" }],
  },
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

type AppLocale = (typeof routing.locales)[number];

const isSupportedLocale = (value: string): value is AppLocale =>
  routing.locales.includes(value as AppLocale);

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
