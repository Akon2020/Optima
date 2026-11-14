import type { Metadata } from "next";

import { CashScreen } from "@/modules/restaurant/components/screens/cash-screen";

export const metadata: Metadata = { title: "Caisse" };

export default function CaissePage() {
  return <CashScreen />;
}
