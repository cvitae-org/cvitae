"use client";

import React, { useRef, useEffect, useState } from "react";
import clsx from "clsx";
import { useMeasurementContext } from "../../contexts/MeasurementContext";
import { useOrderContext } from "../../contexts/OrderContext";
import type { MeasuredSectionProps } from "../../types";

/**
 * Section wrapper that measures its header and registers it separately.
 * Children are expected to be MeasuredItem components.
 */
export function MeasuredSection({
  id,
  title,
  repeatHeaderOnNewPage = false,
  children,
  className,
  headerClassName,
  order,
}: MeasuredSectionProps) {
  const headerRef = useRef<HTMLHeadingElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const { registerItem, unregisterItem } = useMeasurementContext();
  const orderContext = useOrderContext();
  
  // CRITICAL: Assign order during FIRST render only
  // Use null-check pattern recommended by React for lazy initialization
  const orderRef = useRef<number | null>(null);
  if (orderRef.current == null) {
    orderRef.current = order ?? orderContext.getNextOrder();
  }

  useEffect(() => {
    if (!headerRef.current || !title) return;

    const measureHeader = () => {
      if (!headerRef.current || !title) return;

      const measuredHeight = headerRef.current.offsetHeight;
      setHeaderHeight(measuredHeight);

      // Create header component inline to avoid stale closure
      const headerComponent = (
        <h2 className={clsx("text-lg font-bold uppercase tracking-wide pb-2 border-b border-gray-300 text-gray-900", headerClassName)}>
          {title}
        </h2>
      );

      // Register header with context including order
      registerItem(`${id}-header`, {
        height: measuredHeight,
        component: headerComponent,
        order: orderRef.current!,
        metadata: {
          section: id,
          canSplit: false,
          isSectionHeader: true,
          repeatOnNewPage: repeatHeaderOnNewPage,
        },
      });
    };

    const resizeObserver = new ResizeObserver(measureHeader);
    resizeObserver.observe(headerRef.current);

    // Initial measurement with double RAF to ensure layout complete
    requestAnimationFrame(() => {
      requestAnimationFrame(measureHeader);
    });

    return () => {
      resizeObserver.disconnect();
      if (title) {
        unregisterItem(`${id}-header`);
      }
    };
  }, [id, title, repeatHeaderOnNewPage, headerClassName, registerItem, unregisterItem]);

  return (
    <section
      className={clsx("", className)}
      data-section-id={id}
    >
      {title && (
        <h2
          ref={headerRef}
          className={clsx("text-lg font-bold uppercase tracking-wide pb-2 border-b border-gray-300 text-gray-900", headerClassName)}
          data-header-height={headerHeight}
        >
          {title}
        </h2>
      )}
      <div className="">{children}</div>
    </section>
  );
}

