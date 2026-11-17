import type { Metadata } from "next";

import { RequisitionsScreen } from "@/modules/restaurant/components/screens/requisitions-screen";

export const metadata: Metadata = { title: "Réquisitions" };

export default function RequisitionsPage() {
  return <RequisitionsScreen />;
}
