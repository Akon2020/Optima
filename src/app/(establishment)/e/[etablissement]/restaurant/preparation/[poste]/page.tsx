import type { Metadata } from "next";

import { PreparationScreen } from "@/modules/restaurant/components/screens/preparation-screen";

export const metadata: Metadata = { title: "Poste de préparation" };

export default async function StationPage({
  params,
}: PageProps<"/e/[etablissement]/restaurant/preparation/[poste]">) {
  const { poste } = await params;
  return <PreparationScreen station={poste} />;
}
