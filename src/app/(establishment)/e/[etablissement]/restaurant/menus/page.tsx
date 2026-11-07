import type { Metadata } from "next";

import { MenusScreen } from "@/modules/restaurant/components/screens/menus-screen";

export const metadata: Metadata = { title: "Menus" };

export default function MenusPage() {
  return <MenusScreen />;
}
