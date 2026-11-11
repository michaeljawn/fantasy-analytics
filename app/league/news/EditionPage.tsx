import { notFound } from "next/navigation";
import { Edition } from "@/components/newspaper/Edition";
import { SetupNotice } from "@/components/SetupNotice";
import { getLeagueId } from "@/lib/league";
import { getEdition, listEditions } from "@/lib/newspaper/queries";
import { safeLoad } from "@/lib/safe";

// Shared by /league/news (latest edition) and /league/news/[week]
export async function EditionPage({ week }: { week?: number }) {
  const result = await safeLoad(async () => {
    const leagueId = await getLeagueId();
    if (!leagueId) return null;
    const [edition, archive] = await Promise.all([getEdition(leagueId, week), listEditions(leagueId)]);
    return { edition, archive };
  });

  if (result.error) return <SetupNotice error={result.error} />;
  if (!result.data?.edition) {
    if (week != null) notFound();
    return <NoEditions />;
  }
  const { edition, archive } = result.data;
  return (
    <div className="mx-auto max-w-6xl">
      <Edition edition={edition.content} publishedAt={edition.published_at} writer={edition.writer} archive={archive} />
    </div>
  );
}

function NoEditions() {
  return (
    <div className="mx-auto max-w-xl rounded-lg border border-line bg-surface p-6">
      <h1 className="text-base font-semibold">No editions published yet</h1>
      <p className="mt-2 text-sm text-ink-2">
        The league paper is published after each week&apos;s games are final. Import the latest scores, then publish:
      </p>
      <pre className="mt-3 overflow-x-auto rounded-md bg-surface-2 p-3 text-xs">{`npm run league\nnpm run paper`}</pre>
    </div>
  );
}
