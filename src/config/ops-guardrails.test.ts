import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RESTORE_CHECK } from "./ops";

/**
 * Guardrails for the Engineering agent and the release pipeline, checked on every change: the
 * agent's workflow can't merge, deploy or see other secrets, and the server scripts only do
 * runbook-safe things.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const agent = read(".github/workflows/engineering-agent.yml");
const release = read(".github/workflows/release.yml");
const rollback = read(".github/workflows/rollback.yml");

describe("the Engineering agent's workflow", () => {
  it("uses only its own Anthropic key, and no deploy key", () => {
    expect([...agent.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1])).toEqual([
      "ANTHROPIC_API_KEY_ENGINEERING",
    ]);
    expect(agent).not.toMatch(/DEPLOY_SSH_KEY|DATABASE_URL: postgresql:\/\/[^@]*@(?!localhost)/);
  });

  it("never runs on pull_request_target and can't change workflows or secrets", () => {
    expect(agent).not.toMatch(/pull_request_target/);
    expect(agent).not.toMatch(/actions:\s*write|secrets:\s*write|administration/);
  });

  it("is refused merging, reviewing, raw API calls, secrets and the network", () => {
    const disallowed = agent.match(/--disallowedTools "([^"]+)"/)?.[1] ?? "";
    for (const t of [
      "Bash(gh pr merge:*)",
      "Bash(gh pr review:*)",
      "Bash(gh api:*)",
      "Bash(gh secret:*)",
      "Bash(gh workflow:*)",
      "Bash(git push origin main:*)",
      "Bash(git push --force:*)",
      "Bash(curl:*)",
      "Bash(printenv:*)",
      "WebFetch",
    ]) {
      expect(disallowed, t).toContain(t);
    }
  });

  it("may push only its own agent/* branches", () => {
    const allowed = agent.match(/--allowedTools "([^"]+)"/)?.[1] ?? "";
    const pushes = allowed.split(",").filter((t) => t.includes("git push"));
    expect(pushes.length).toBeGreaterThan(0);
    for (const p of pushes) expect(p).toMatch(/origin agent\/\*\)$/);
    expect(allowed).not.toMatch(/gh pr merge|Bash\(\*\)|Bash\(gh:\*\)|Bash\(git:\*\)/);
  });

  it("starts only for the bug and alert labels, the weekly run, or by hand", () => {
    expect(agent).toMatch(/github\.event\.label\.name == 'bug'/);
    expect(agent).toMatch(/github\.event\.label\.name == 'alert'/);
    expect(agent).toMatch(/schedule:/);
  });
});

describe("the release pipeline", () => {
  it("checks first, production needs the protected environment, deploys only via the restricted user", () => {
    expect(release).toMatch(/uses: \.\/\.github\/workflows\/ci\.yml/);
    expect(release).toMatch(/environment: production/);
    expect(release).toMatch(/needs: \[checks, staging\]/);
    for (const wf of [release, rollback]) {
      expect(wf).not.toMatch(/\bssh\s/);
      expect(wf).toMatch(/uses: \.\/\.github\/actions\/deploy/);
    }
  });
});

describe("server scripts", () => {
  const forced = read("deploy/release-ssh.sh").replace("exec sudo", "echo ALLOWED");
  const run = (cmd: string) =>
    spawnSync("bash", ["-c", forced], {
      env: { ...process.env, SSH_ORIGINAL_COMMAND: cmd },
      encoding: "utf8",
    }).stdout.trim();

  it.each([
    ["deploy 3589bec", true],
    ["rollback", true],
    ["rollback 3589bec2932806ef9f691ab18447be7d088d4646", true],
    ["status", true],
    ["deploy 3589bec; rm -rf /", false],
    ["deploy main", false],
    ["bash", false],
    ["status && cat /opt/propfolio/deploy/.env", false],
  ])("the release key may run %j: %s", (cmd, ok) => {
    expect(run(cmd).startsWith("ALLOWED")).toBe(ok);
  });

  it("the watchdog only restarts the web app or the jobs, never the database or data", () => {
    const w = read("deploy/watchdog.sh");
    const restarts = [...w.matchAll(/\brestart (\w+) "/g)].map((m) => m[1]);
    expect(new Set(restarts)).toEqual(new Set(["web", "worker"]));
    expect(w).not.toMatch(/down -v|rm -rf|dropdb|volume rm|prune/);
  });

  it("the restore check never touches the live database", () => {
    const r = read("deploy/restore-check.sh");
    expect(r).not.toMatch(/docker compose exec|dropdb|propfolio_pgdata/);
    expect(r).toMatch(/--network none/);
  });

  it("the cron schedule matches the settings", () => {
    expect(read("deploy/ops-cron.sh")).toContain(`${RESTORE_CHECK.serverScheduleUtc} root`);
  });
});
