import { appendFileSync } from "node:fs";

export async function routeCIEvent({
  eventName,
  repository,
  repositoryOwner,
  refName,
  token,
  fetchImpl = fetch,
}) {
  if (eventName !== "push") return { runCI: true, reason: "required-event" };

  try {
    const url = new URL(`https://api.github.com/repos/${repository}/pulls`);
    url.searchParams.set("state", "open");
    url.searchParams.set("base", "main");
    url.searchParams.set("head", `${repositoryOwner}:${refName}`);

    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);

    const pulls = await response.json();
    if (!Array.isArray(pulls)) throw new Error("GitHub API returned an unexpected response");
    if (pulls.some((pull) => pull.state === "open")) {
      return { runCI: false, reason: "open-pr" };
    }
    return { runCI: true, reason: "no-open-pr" };
  } catch {
    // Fail open so an API outage cannot leave required PR checks absent.
    return { runCI: true, reason: "lookup-failed" };
  }
}

if (process.env.GITHUB_ACTIONS === "true") {
  const result = await routeCIEvent({
    eventName: process.env.EVENT_NAME,
    repository: process.env.REPOSITORY,
    repositoryOwner: process.env.REPOSITORY_OWNER,
    refName: process.env.REF_NAME,
    token: process.env.GH_TOKEN,
  });
  appendFileSync(process.env.GITHUB_OUTPUT, `run_ci=${result.runCI}\n`);
  console.log(`CI routing result: ${result.reason}.`);
}
