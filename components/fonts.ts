import { Barlow, Barlow_Condensed } from "next/font/google";

// Self-hosted at build time by next/font; exposed as CSS variables used in globals.css
export const bodyFont = Barlow({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--font-body" });
export const displayFont = Barlow_Condensed({
  weight: ["500", "600", "700", "800"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-condensed",
});
