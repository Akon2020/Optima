import type { Metadata } from "next";

import { UpcomingScreen } from "@/modules/restaurant/components/screens/upcoming-screen";

export const metadata: Metadata = { title: "Tables" };

export default function TablesPage() {
  return <UpcomingScreen segment="tables" />;
}
