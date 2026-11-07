import type { Metadata } from "next";

import { UpcomingScreen } from "@/modules/restaurant/components/screens/upcoming-screen";

export const metadata: Metadata = { title: "Livraisons" };

export default function LivraisonsPage() {
  return <UpcomingScreen segment="livraisons" />;
}
