import type { Metadata } from "next";

import { MorningStockScreen } from "@/modules/restaurant/components/screens/morning-stock-screen";

export const metadata: Metadata = { title: "Stock du matin" };

export default function StockDuMatinPage() {
  return <MorningStockScreen />;
}
