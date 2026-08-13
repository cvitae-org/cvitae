"use client";

import React, {
  createContext,
  useContext,
  useRef,
  useCallback,
  useState,
  useEffect,
} from "react";
import type {
  MeasurementContextValue,
  CVItemMeasurement,
  MeasurementStatus,
} from "../types";

const MeasurementContext = createContext<MeasurementContextValue | null>(null);

export function useMeasurementContext() {
  const context = useContext(MeasurementContext);
  if (!context) {
    throw new Error(
      "useMeasurementContext must be used within a MeasurementProvider"
    );
  }
  return context;
}

interface MeasurementProviderProps {
  children: React.ReactNode;
  onMeasurementComplete?: () => void;
}

export function MeasurementProvider({
  children,
  onMeasurementComplete,
}: MeasurementProviderProps) {
  // Use ref for stable storage across renders
  const itemsRef = useRef<Map<string, CVItemMeasurement>>(new Map());
  const [status, setStatus] = useState<MeasurementStatus>("idle");
  const [updateTrigger, setUpdateTrigger] = useState(0);

  // Track registration counter for completion detection
  const registrationCountRef = useRef(0);
  const measurementTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const onCompleteRef = useRef(onMeasurementComplete);

  // Keep callback ref up to date
  useEffect(() => {
    onCompleteRef.current = onMeasurementComplete;
  }, [onMeasurementComplete]);

  // Stable callbacks that don't change identity
  const registerItem = useCallback(
    (id: string, measurement: Omit<CVItemMeasurement, "id">) => {
      const item: CVItemMeasurement = {
        id,
        ...measurement,
      };

      const isNewItem = !itemsRef.current.has(id);
      itemsRef.current.set(id, item);
      
      if (isNewItem) {
        registrationCountRef.current++;
      }

      // Update status to measuring if not already
      setStatus((prev) => (prev === "idle" ? "measuring" : prev));

      // Debounce completion check
      if (measurementTimeoutRef.current) {
        clearTimeout(measurementTimeoutRef.current);
      }

      measurementTimeoutRef.current = setTimeout(() => {
        // Mark as complete - all initial items have registered and measured
        setStatus("complete");
        if (onCompleteRef.current) {
          onCompleteRef.current();
        }
      }, 150);

      // Trigger update for subscribers (use counter to avoid object creation)
      setUpdateTrigger((prev) => prev + 1);
    },
    []
  );

  const unregisterItem = useCallback((id: string) => {
    if (itemsRef.current.has(id)) {
      itemsRef.current.delete(id);
      setUpdateTrigger((prev) => prev + 1);
    }
  }, []);

  const getItem = useCallback((id: string) => {
    return itemsRef.current.get(id);
  }, []);

  // Memoize items array to prevent unnecessary re-creation
  const itemsArrayRef = useRef<CVItemMeasurement[]>([]);
  const lastUpdateTriggerRef = useRef(updateTrigger);

  const getAllItems = useCallback(() => {
    // Only recreate array if items have actually changed
    if (lastUpdateTriggerRef.current !== updateTrigger) {
      const items = Array.from(itemsRef.current.values());
      // CRITICAL: Sort by order to ensure correct DOM sequence
      items.sort((a, b) => a.order - b.order);
      itemsArrayRef.current = items;
      lastUpdateTriggerRef.current = updateTrigger;
    }
    return itemsArrayRef.current;
  }, [updateTrigger]);

  const getMeasurementStatus = useCallback(() => {
    return status;
  }, [status]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (measurementTimeoutRef.current) {
        clearTimeout(measurementTimeoutRef.current);
      }
    };
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  // Only recreate when callbacks change (which they shouldn't except getMeasurementStatus)
  const value: MeasurementContextValue = React.useMemo(
    () => ({
      registerItem,
      unregisterItem,
      getItem,
      getAllItems,
      getMeasurementStatus,
    }),
    [registerItem, unregisterItem, getItem, getAllItems, getMeasurementStatus]
  );

  return (
    <MeasurementContext.Provider value={value}>
      {children}
    </MeasurementContext.Provider>
  );
}

