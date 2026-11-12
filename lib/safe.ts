import { unstable_rethrow } from "next/navigation";

// Lets pages render a setup message instead of crashing when the database isn't ready
export async function safeLoad<T>(load: () => Promise<T>): Promise<{ data: T; error: null } | { data: null; error: string }> {
  try {
    return { data: await load(), error: null };
  } catch (err) {
    // Next's own control-flow signals (dynamic rendering, redirects, notFound) aren't errors
    unstable_rethrow(err);
    const message = (err as Error).message ?? String(err);
    console.error(err);
    return { data: null, error: message };
  }
}
