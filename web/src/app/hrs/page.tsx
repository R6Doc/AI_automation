import type { Metadata } from "next";
import SellSheets from "@/components/SellSheets";

export const metadata: Metadata = {
  title: "Sell Sheets",
  description: "Turn product docx files and bottle photos into TOKIWA sell sheets in Figma",
};

export default function HrsPage() {
  return <SellSheets />;
}
