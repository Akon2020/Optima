import type { Metadata } from "next";
import { Suspense } from "react";

import { OrdersScreen } from "@/modules/restaurant/components/screens/orders-screen";

export const metadata: Metadata = { title: "Commandes" };

export default function OrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersScreen />
    </Suspense>
  );
}
