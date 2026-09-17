import type { Metadata } from "next";
import { PhoneHome } from "@/components/features/phone/phone-home";

export const metadata: Metadata = { title: "Pacing Run · Mes courses" };

export default function TelephonePage() {
  return <PhoneHome />;
}
