import type { Metadata } from "next";
import { Suspense } from "react";
import { LocalRaceView, PhoneLoading } from "@/components/features/phone/local-race-view";

export const metadata: Metadata = { title: "Pacing Run · Plan" };

export default function TelephonePlanPage() {
  return (
    <Suspense fallback={<PhoneLoading />}>
      <LocalRaceView view="plan" />
    </Suspense>
  );
}
