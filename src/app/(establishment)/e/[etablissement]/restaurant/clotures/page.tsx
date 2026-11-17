import type { Metadata } from "next";

import { ClosingsScreen } from "@/modules/restaurant/components/screens/closings-screen";

export const metadata: Metadata = { title: "Clôtures" };

export default function CloturesPage() {
  return <ClosingsScreen />;
}
