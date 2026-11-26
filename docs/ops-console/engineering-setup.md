# Set up the Engineering agent

The Engineering agent fixes bugs on GitHub. It opens a **pull request** (a proposed change) and
**you** decide whether to merge it. It can't merge, deploy, see the live database or read your
keys.

It starts by itself when:

- you add the label **bug** to an issue;
- Sentry reports an error (Propfolio opens an issue labelled **alert**);
- every Monday at 6:20 AM, to check for security updates.

About 30 minutes, once.

## 1. Make `main` the branch everything goes into

Right now the newest code is on the branch `claude/tender-mendel-owpm2c`, and there is no `main`.

1. Open https://github.com/ezrajedd-star/propfolio/branches
2. Click **New branch**. Name: `main`. Source: `claude/tender-mendel-owpm2c`. Click **Create**.
3. Open **Settings → General → Default branch**, click the ⇄ button, choose `main`, **Update**.

## 2. Protect `main` (nobody, including the agent, can merge without your OK)

1. **Settings → Rules → Rulesets → New ruleset → New branch ruleset.**
2. Name: `Protect main`. Enforcement: **Active**.
3. Target branches: **Add target → Include default branch**.
4. Tick:
   - **Restrict deletions**
   - **Block force pushes**
   - **Require a pull request before merging**, with **Required approvals: 1**
   - **Require status checks to pass** → add **check** (the CI job)
5. Leave **Bypass list** empty. Click **Create**.

You are the reviewer: open the pull request, read "What was wrong" and "Risk", click
**Files changed → Review changes → Approve**, then **Merge**.

> If you're the only person on GitHub, GitHub doesn't let you approve your own pull request. The
> agent's pull requests are opened by the Claude app, so you _can_ approve those. For your own
> changes, set "Required approvals" to 0.

## 3. Give the agent its key

1. In the Anthropic console (console.anthropic.com) → **API keys → Create key**, name it
   `engineering`. Set the workspace's monthly limit to **$50** (**Limits**).
2. In GitHub: **Settings → Secrets and variables → Actions → New repository secret.**
   Name: `ANTHROPIC_API_KEY_ENGINEERING`. Value: the key. **Add secret.**

   Never paste the key anywhere else, including in a chat.

## 4. Install the Claude app on the repository

1. Open https://github.com/apps/claude and click **Install** (or **Configure**).
2. Choose **Only select repositories → propfolio**. **Install.**

## 5. Labels

1. **Issues → Labels.** Make sure `bug` exists. Click **New label**, name `alert`, **Create**.

## 6. Error alerts → issues

On the server, add a GitHub token that can **only create issues** (if you set up the Support
agent, it's already there: `GITHUB_ISSUES_TOKEN`, see `agents-setup.md` step 4).

## 7. Try it

1. Open **Issues → New issue**: "Test: the agent is set up". Body: "Please only comment that
   you can read this. Don't change any code." Add the label **bug**.
2. Open **Actions → Engineering agent**: a run starts within a minute. After a few minutes it
   comments on the issue. Close the issue.

## What it costs

Each bug run is roughly $0.50–$3; the weekly check about $0.50. The $50 monthly limit from step 3
stops it if something goes wrong. See the spend in the Anthropic console.
