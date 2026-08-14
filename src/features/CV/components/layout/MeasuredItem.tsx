"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
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
  
  /**
   * The children as last rendered, for registration.
   *
   * This used to be `useRef(children)` — captured on the first render and never
   * updated, on the stated grounds that CV content is static. `PaginatedRenderer`
   * renders `item.component`, so what the page showed was a first-render copy of
   * the document: every later edit updated this subtree, which is hidden behind
   * the measurement pass, and never reached the page. Editing the CV in place is
   * exactly the case that assumption excluded.
   */
  const childrenSnapshotRef = useRef(children);

  /**
   * What was last registered, so an unchanged re-render registers nothing.
   *
   * This guard is what makes it safe to keep the measurement tree mounted.
   * Registering bumps the context, which re-renders the tree, which produces
   * new `children` objects — so comparing by element identity would re-register
   * forever. The rendered height and text do not change unless the document
   * does, which is exactly the condition worth reacting to.
   */
  const signatureRef = useRef<string | null>(null);

  const measure = useCallback(() => {
    if (!ref.current) return;

    const measuredHeight = ref.current.offsetHeight;
    const signature = `${measuredHeight}:${ref.current.textContent ?? ''}`;

    if (signature === signatureRef.current) return;
    signatureRef.current = signature;

    setHeight((previous) =>
      previous === measuredHeight ? previous : measuredHeight
    );

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
  }, [id, section, canSplit, registerItem]);

  useEffect(() => {
    if (!ref.current) return;

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
  }, [id, measure, unregisterItem]);

  /**
   * Re-registers when the content itself changes.
   *
   * The ResizeObserver above only fires when the box changes size, so it misses
   * every edit that keeps the height — correcting a job title, fixing a typo —
   * which is most of them. Comparing `children` by identity catches those, and
   * terminates: `children` is a prop, so its identity changes only when the
   * parent re-renders, and re-registering re-renders *this* component through
   * the context without re-rendering the parent.
   *
   * Deferred a frame so the DOM has reflowed with the new content before it is
   * measured; measuring in the effect body would record the previous height.
   */
  useEffect(() => {
    // Synced here rather than during render, where writing a ref is unsafe:
    // React may render without committing, and the page would then be handed a
    // subtree that was never mounted or measured.
    childrenSnapshotRef.current = children;

    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [children, measure]);

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

