import type { Metadata } from "next";

import { UpcomingScreen } from "@/modules/restaurant/components/screens/upcoming-screen";

export const metadata: Metadata = { title: "Stock du matin" };

export default function StockDuMatinPage() {
  return <UpcomingScreen segment="stock-du-matin" />;
}
