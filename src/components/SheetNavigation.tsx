"use client";

import { SheetNavLink } from "@/components/SheetNavLink";
import { usePathname } from "@/libs/i18n/routing";
import { useTranslations } from 'next-intl';

const NAV_ITEMS = [
  {
    href: "/" as const,
    titleKey: "cv",
    iconClassName: "",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    ),
  },
  {
    href: "/research" as const,
    titleKey: "research",
    iconClassName: "",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    ),
  },
  {
    href: "/submitting" as const,
    titleKey: "submitting",
    iconClassName: "rotate-45",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="miter"
        strokeWidth={2}
        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
      />
    ),
  },
  {
    href: "/settings" as const,
    titleKey: "settings",
    iconClassName: "",
    icon: (
      <>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </>
    ),
  },
] as const;

export function SheetNavigation() {
  const pathname = usePathname();
  const t = useTranslations('navigation');

  return (
    <nav
      aria-label={t('ariaLabel')}
      className="flex flex-col gap-2"
    >
      {NAV_ITEMS.map(({ href, titleKey, icon, iconClassName }) => (
        <SheetNavLink
          key={href}
          href={href}
          title={t(titleKey)}
          active={pathname === href}
        >
          <svg
            className={`h-5 w-5${iconClassName ? ` ${iconClassName}` : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {icon}
          </svg>
        </SheetNavLink>
      ))}
    </nav>
  );
}
