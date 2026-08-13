import type { Metadata } from "next";
import { JobResearch } from "@/features/JobResearch";

export const metadata: Metadata = {
  title: "Job offer research",
  description:
    "Track job offers and how well each one matches the CV.",
};

export default function ResearchPage() {
  return <JobResearch />;
}
