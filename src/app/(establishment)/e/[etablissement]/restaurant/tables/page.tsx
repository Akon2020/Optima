import type { Metadata } from "next";

import { TablesScreen } from "@/modules/restaurant/components/screens/tables-screen";

export const metadata: Metadata = { title: "Tables" };

export default function TablesPage() {
  return <TablesScreen />;
}
