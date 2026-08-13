"use client";

import React, { useRef, useEffect, useState } from "react";
import clsx from "clsx";
import { useMeasurementContext } from "../../contexts/MeasurementContext";
import { useOrderContext } from "../../contexts/OrderContext";
import type { MeasuredItemProps } from "../../types";

/**
 * Wrapper component that measures its content and registers
 * the measurement with the MeasurementContext.
 */
export function MeasuredItem({
  id,
  section,
  canSplit = false,
  children,
  className,
  order,
}: MeasuredItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const { registerItem, unregisterItem } = useMeasurementContext();
  const orderContext = useOrderContext();
  
  // CRITICAL: Assign order during FIRST render only
  // Use null-check pattern recommended by React for lazy initialization
  const orderRef = useRef<number | null>(null);
  if (orderRef.current == null) {
    orderRef.current = order ?? orderContext.getNextOrder();
  }
  
  // Store children snapshot for registration
  // Note: For CV use case (static content), children never change after first render
  // This is initialized once with the first children value
  const childrenSnapshotRef = useRef(children);

  useEffect(() => {
    if (!ref.current) return;

    const measure = () => {
      if (!ref.current) return;

      const measuredHeight = ref.current.offsetHeight;
      setHeight(measuredHeight);

      // Register measurement with current children snapshot and order
      registerItem(id, {
        height: measuredHeight,
        component: childrenSnapshotRef.current,
        order: orderRef.current!,
        metadata: {
          section,
          canSplit,
          isSectionHeader: false,
        },
      });
    };

    // Use ResizeObserver for dynamic measurement
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(ref.current);

    // Initial measurement with double RAF to ensure layout is complete
    requestAnimationFrame(() => {
      requestAnimationFrame(measure);
    });

    return () => {
      resizeObserver.disconnect();
      unregisterItem(id);
    };
  }, [id, section, canSplit, registerItem, unregisterItem]);

  return (
    <div
      ref={ref}
      className={clsx("break-inside-avoid", className)}
      data-measured-item-id={id}
      data-height={height}
    >
      {children}
    </div>
  );
}

