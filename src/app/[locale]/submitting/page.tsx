import type { Metadata } from "next";
import { Submitting } from "@/features/Submitting";

export const metadata: Metadata = {
  title: "Submitting",
  description:
    "Offers being applied to: a CV tailored to each one, and the email it goes out with.",
};

export default function SubmittingPage() {
  return <Submitting />;
}
