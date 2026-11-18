import type { Metadata } from "next";

import { DeliveriesScreen } from "@/modules/restaurant/components/screens/deliveries-screen";

export const metadata: Metadata = { title: "Livraisons" };

export default function LivraisonsPage() {
  return <DeliveriesScreen />;
}
