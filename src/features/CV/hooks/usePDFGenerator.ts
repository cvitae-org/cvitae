"use client";

import { useState, useCallback } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { A4_DIMENSIONS } from "../constants";

interface UsePDFGeneratorOptions {
  filename?: string;
  quality?: number; // 1-3, higher = better quality but larger file
}

interface UsePDFGeneratorReturn {
  generatePDF: () => Promise<void>;
  isGenerating: boolean;
  error: string | null;
  progress: number; // 0-100
}

/**
 * Hook for generating PDF from CV using html2canvas + jsPDF.
 * 
 * Usage:
 * const { generatePDF, isGenerating } = usePDFGenerator();
 * <button onClick={generatePDF} disabled={isGenerating}>Download PDF</button>
 */
export function usePDFGenerator(
  options: UsePDFGeneratorOptions = {}
): UsePDFGeneratorReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const {
    filename = "Dominik_Ben_CV.pdf",
    quality = 2, // 2x scale for good quality
  } = options;

  const generatePDF = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    setProgress(0);

    // Store original styles for restoration
    const originalStyles: Array<{ element: HTMLElement; paddingTop: string }> = [];

    try {
      // Find all A4 pages in the DOM
      const pages = document.querySelectorAll('[data-page]');
      
      if (pages.length === 0) {
        throw new Error("No pages found. Make sure CV is in paginated mode.");
      }

      setProgress(10);

      // Create PDF document (A4 dimensions in mm)
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pdfWidth = 210; // A4 width in mm
      const pdfHeight = 297; // A4 height in mm

      // Add print-specific styles before rendering
      const bulletIndicators = document.querySelectorAll('[id^="cv-experience-bullet-"]');
      
      bulletIndicators.forEach((el) => {
        const element = el as HTMLElement;
        originalStyles.push({
          element,
          paddingTop: element.style.paddingTop || '7px',
        });
        element.style.paddingTop = '17px';
      });

      // Process each page
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i] as HTMLElement;
        
        setProgress(10 + (i / pages.length) * 80); // 10-90%

        // Render page to canvas with high quality
        const canvas = await html2canvas(page, {
          scale: quality,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
          windowWidth: A4_DIMENSIONS.width,
          windowHeight: A4_DIMENSIONS.height,
        });

        // Convert canvas to image
        const imgData = canvas.toDataURL("image/png");

        // Add new page if not first
        if (i > 0) {
          pdf.addPage();
        }

        // Add image to PDF
        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight, undefined, "FAST");
      }

      setProgress(95);

      // Download PDF
      pdf.save(filename);

      setProgress(100);
      
      // Reset after short delay
      setTimeout(() => {
        setProgress(0);
      }, 1000);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to generate PDF";
      setError(errorMessage);
      console.error("PDF generation error:", err);
    } finally {
      // Restore original styles
      originalStyles.forEach(({ element, paddingTop }) => {
        element.style.paddingTop = paddingTop;
      });
      setIsGenerating(false);
    }
  }, [filename, quality]);

  return {
    generatePDF,
    isGenerating,
    error,
    progress,
  };
}

