"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface CustomTexts {
  title: string | null;
  summary: string | null;
}

interface CVCustomizationContextValue {
  customTexts: CustomTexts;
  setCustomTexts: (texts: { title: string; summary: string }) => void;
  resetToDefaults: () => void;
  hasCustomTexts: boolean;
}

const CVCustomizationContext = createContext<CVCustomizationContextValue | null>(null);

interface CVCustomizationProviderProps {
  children: ReactNode;
}

export function CVCustomizationProvider({ children }: CVCustomizationProviderProps) {
  const [customTexts, setCustomTextsState] = useState<CustomTexts>({
    title: null,
    summary: null,
  });

  const setCustomTexts = useCallback((texts: { title: string; summary: string }) => {
    setCustomTextsState({
      title: texts.title,
      summary: texts.summary,
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    setCustomTextsState({
      title: null,
      summary: null,
    });
  }, []);

  const hasCustomTexts = customTexts.title !== null || customTexts.summary !== null;

  return (
    <CVCustomizationContext.Provider
      value={{
        customTexts,
        setCustomTexts,
        resetToDefaults,
        hasCustomTexts,
      }}
    >
      {children}
    </CVCustomizationContext.Provider>
  );
}

export function useCVCustomization() {
  const context = useContext(CVCustomizationContext);
  if (!context) {
    throw new Error("useCVCustomization must be used within a CVCustomizationProvider");
  }
  return context;
}

// Optional hook that doesn't throw - useful for components that might be outside the provider
export function useCVCustomizationOptional() {
  return useContext(CVCustomizationContext);
}

