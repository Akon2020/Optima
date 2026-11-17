import type { Metadata } from "next";

import { PreparationScreen } from "@/modules/restaurant/components/screens/preparation-screen";

export const metadata: Metadata = { title: "Préparation" };

export default function PreparationPage() {
  return <PreparationScreen />;
}
