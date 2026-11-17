import type { Metadata } from "next";

import { CustomersScreen } from "@/modules/restaurant/components/screens/customers-screen";

export const metadata: Metadata = { title: "Clients" };

export default function ClientsPage() {
  return <CustomersScreen />;
}
