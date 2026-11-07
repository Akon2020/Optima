import type { Metadata } from "next";

import { DashboardScreen } from "@/modules/restaurant/components/screens/dashboard-screen";

export const metadata: Metadata = { title: "Tableau de bord" };

export default function RestaurantDashboardPage() {
  return <DashboardScreen />;
}
