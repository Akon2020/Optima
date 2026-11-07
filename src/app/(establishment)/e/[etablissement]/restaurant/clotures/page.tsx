import type { Metadata } from "next";

import { UpcomingScreen } from "@/modules/restaurant/components/screens/upcoming-screen";

export const metadata: Metadata = { title: "Clôtures" };

export default function CloturesPage() {
  return <UpcomingScreen segment="clotures" />;
}
