import type { Metadata } from "next";

import { NewOrderScreen } from "@/modules/restaurant/components/screens/new-order-screen";

export const metadata: Metadata = { title: "Nouvelle commande" };

export default function NewOrderPage() {
  return <NewOrderScreen />;
}
