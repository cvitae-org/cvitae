"use client";

import React, { createContext, useContext } from "react";

interface OrderContextValue {
  getNextOrder: () => number;
}

const OrderContext = createContext<OrderContextValue | null>(null);

export function useOrderContext() {
  const context = useContext(OrderContext);
  if (!context) {
    throw new Error("useOrderContext must be used within OrderProvider");
  }
  return context;
}

interface OrderProviderProps {
  children: React.ReactNode;
}

/**
 * Provides sequential order numbers during render phase.
 * This ensures items maintain DOM order regardless of measurement timing.
 * 
 * Uses closure-based counter that resets each render cycle.
 */
export function OrderProvider({ children }: OrderProviderProps) {
  // Create fresh counter for each render using closure
  let counter = 0;

  const value: OrderContextValue = {
    getNextOrder: () => {
      return counter++;
    },
  };

  return (
    <OrderContext.Provider value={value}>{children}</OrderContext.Provider>
  );
}
