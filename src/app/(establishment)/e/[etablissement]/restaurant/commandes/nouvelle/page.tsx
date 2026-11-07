import type { Metadata } from "next";
import { Suspense } from "react";

import { NewOrderScreen } from "@/modules/restaurant/components/screens/new-order-screen";

export const metadata: Metadata = { title: "Nouvelle commande" };

export default function NewOrderPage() {
  return (
    <Suspense fallback={null}>
      <NewOrderScreen />
    </Suspense>
  );
}
