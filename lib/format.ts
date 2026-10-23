import { cookies } from "next/headers";
import { FORMATS, type Format } from "./formats";

export * from "./formats";

export async function getFormat(): Promise<Format> {
  const value = (await cookies()).get("format")?.value;
  return FORMATS.some((f) => f.id === value) ? (value as Format) : "ppr";
}
