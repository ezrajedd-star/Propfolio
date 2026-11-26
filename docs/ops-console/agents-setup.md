# Setting up the AI agents

_For the founder. About 40 minutes. Never paste keys into a chat._

The agents are switched **off** until you switch them on in the console (**Agents**), and
everything they do waits for your approval (**Approvals**) until you give them more freedom.

## What each agent costs at most

| Agent             | Monthly cap | Where it runs                |
| ----------------- | ----------- | ---------------------------- |
| Support agent     | US$40       | Claude Managed Agents        |
| Growth agent      | US$40       | Claude Managed Agents        |
| Monday digest     | US$5        | Propfolio's own worker       |
| Engineering agent | US$50       | GitHub Actions (Claude Code) |

Each switches itself off at its cap, and you get a phone alert. The caps live in
`src/config/agents.ts`.

## Step 1: Anthropic keys (15 minutes)

1. At **platform.claude.com**, create a workspace called `Propfolio agents`.
2. In that workspace, **API keys → Create key**, three times: `support`, `growth`, `digest`.
   Copy each one into your password manager straight away.
3. **Limits**: set the workspace's monthly spend limit to US$100, as a second safety net.
4. **Data retention**: check the workspace's settings and note what they say for the lawyer
   (Propfolio also deletes each agent session after 30 days).

## Step 2: Put the keys on the server (5 minutes)

```bash
sudo bash /opt/propfolio/deploy/update.sh
sudo nano /opt/propfolio/deploy/.env
```

Add these three lines with your keys, then **Ctrl+O**, Enter, **Ctrl+X**:

```
ANTHROPIC_API_KEY_SUPPORT='…'
ANTHROPIC_API_KEY_GROWTH='…'
ANTHROPIC_API_KEY_DIGEST='…'
```

(`update.sh` already made each agent's own Propfolio key, the `AGENT_KEY_…` lines.)

## Step 3: Publish the agents to Claude (5 minutes)

```bash
cd /opt/propfolio/deploy
docker compose run --rm agent-setup support
```

It prints two lines (`MANAGED_AGENTS_ENVIRONMENT_ID=…` and `MANAGED_AGENT_ID_SUPPORT=…`). Add
them to `.env` as in Step 2. Then the same for the Growth agent:

```bash
docker compose run --rm agent-setup growth
```

and add its `MANAGED_AGENT_ID_GROWTH=…` line. Finally: `docker compose up -d`

Run `agent-setup` again whenever the agents' instructions change (after a reviewed pull request).

## Step 4: Check them (5 minutes)

```bash
docker compose run --rm agent-eval support
docker compose run --rm agent-eval growth
```

Each prints a score. 90% or more is a pass. The checks use made-up situations only.

## Step 5: Switch them on (2 minutes)

In the console: **Agents → Switch on**. Watch the **Approvals** inbox for the first few weeks.
When you trust an agent with a kind of item, change it from **Draft** to **Act and tell**
(it does it and tells you) or **Act**. Some things can never leave Draft: refunds and billing
disputes, privacy requests, legal threats, access changes and prices.
