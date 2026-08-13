import type { ReactNode } from "react";
import clsx from "clsx";
import { A4_DIMENSIONS } from "@/features/CV/constants";

type SheetProps = {
  children: ReactNode;
  className?: string;
};

/**
 * A page-width sheet that matches the CV's A4 pages visually — same width,
 * padding, shadow, and corner radius — but with content-driven height.
 *
 * The CV paginates into fixed-height A4 pages because it has to print. This
 * does not: it is a single sheet that grows with its content, so a long table
 * never spills into a second page.
 */
export function Sheet({ children, className }: SheetProps) {
  return (
    <div
      className={clsx("relative bg-white shadow-lg rounded-md", className)}
      style={{
        width: `${A4_DIMENSIONS.width}px`,
        padding: `${A4_DIMENSIONS.padding}px`,
        boxSizing: "border-box"
      }}
    >
      {children}
    </div>
  );
}
