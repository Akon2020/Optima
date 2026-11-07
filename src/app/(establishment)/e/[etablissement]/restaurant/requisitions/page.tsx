import type { Metadata } from "next";

import { UpcomingScreen } from "@/modules/restaurant/components/screens/upcoming-screen";

export const metadata: Metadata = { title: "Réquisitions" };

export default function RequisitionsPage() {
  return <UpcomingScreen segment="requisitions" />;
}
