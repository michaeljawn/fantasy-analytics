import { Playfair_Display, Source_Serif_4, UnifrakturMaguntia } from "next/font/google";

// Self-hosted at build time by next/font; exposed as CSS variables used in globals.css (.paper)
export const mastFont = UnifrakturMaguntia({ weight: "400", subsets: ["latin"], variable: "--font-paper-mast" });
export const headFont = Playfair_Display({ weight: ["700", "800", "900"], subsets: ["latin"], variable: "--font-paper-head" });
export const bodyFont = Source_Serif_4({ subsets: ["latin"], variable: "--font-paper-body" });
