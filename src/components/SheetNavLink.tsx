"use client";

import type { ReactNode } from "react";
import { Link } from "@/libs/i18n/routing";

type SheetNavLinkProps = {
  href: "/research" | "/submitting" | "/settings" | "/";
  title: string;
  active?: boolean;
  children: ReactNode;
};

export function SheetNavLink({ href, title, active = false, children }: SheetNavLinkProps) {
  return (
    <Link
      href={href}
      title={title}
      aria-current={active ? "page" : undefined}
      className={`
        relative w-9 h-9 rounded-md font-medium
        transition-colors duration-200 shadow-sm flex items-center justify-center
        ${
          active
            ? "bg-white text-[#407BA9] ring-2 ring-[#65B7FF]"
            : "bg-[#65B7FF] text-gray-100 hover:bg-[#529ED5] active:bg-[#407BA9]"
        }
      `}
    >
      {children}
    </Link>
  );
}
