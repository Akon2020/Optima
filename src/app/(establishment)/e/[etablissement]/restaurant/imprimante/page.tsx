import type { Metadata } from "next";

import { PrinterScreen } from "@/modules/restaurant/components/screens/printer-screen";

export const metadata: Metadata = { title: "Imprimante" };

export default function ImprimantePage() {
  return <PrinterScreen />;
}
