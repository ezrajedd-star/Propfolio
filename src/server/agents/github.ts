import { env } from "@/server/env";

/** Open a GitHub issue in Propfolio's repository (GITHUB_ISSUES_TOKEN: issues only). */
export async function createGithubIssue(input: {
  title: string;
  body: string;
  labels: string[];
}): Promise<{ number: number; url: string }> {
  const e = env();
  if (!e.GITHUB_ISSUES_TOKEN) throw new Error("GitHub isn't connected (GITHUB_ISSUES_TOKEN).");
  const r = await fetch(`https://api.github.com/repos/${e.GITHUB_REPOSITORY}/issues`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${e.GITHUB_ISSUES_TOKEN}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "user-agent": "propfolio-agents",
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`GitHub HTTP ${r.status}`);
  const j = (await r.json()) as { number: number; html_url: string };
  return { number: j.number, url: j.html_url };
}
