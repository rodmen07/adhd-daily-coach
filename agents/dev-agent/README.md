# ADHD Daily Coach - Autonomous Dev Agent Scaffold

This directory houses an autonomous developer agent scaffold tailored for **calm-daily-coach** React and Next.js frontend development.

Designed with a decoupled architecture, it runs both locally and inside automated environments (such as Docker, custom CI/CD tasks, or GitHub Actions pipelines).

## Key Capabilities

- 🔍 **Safe Exploration**: Scuns code structures and patterns prior to modification.
- 🛠️ **Correct-by-Construction**: Directly integrates with workspace compiler verification.
- 🧪 **Self-HEAL Tooling**: Captures test failures and TypeScript validation outputs, feeding error logs directly back to the LLM to write successful fixes iteratively.
- 💾 **State Persistence**: Serializes progress to local state management, ensuring safe resumption upon unexpected API rate-limiting or network issues.

---

## Folder Layout

The scaffold comprises the following core elements:

- [agents/dev-agent/backlog.json](agents/dev-agent/backlog.json): Concrete development queue containing task descriptions.
- [agents/dev-agent/state.json](agents/dev-agent/state.json): Completion logs and run counts.
- [agents/dev-agent/llm_client.py](agents/dev-agent/llm_client.py): Dynamic client for OpenAI (GPT-4o, GPT-4o mini, o3-mini), Anthropic (Claude-3.5-haiku / Sonnet), and Google Gemini (Gemini-2.5-flash).
- [agents/dev-agent/tools.py](agents/dev-agent/tools.py): Capabilities mapped as tool schemas (read, edit, search, and verify).
- [agents/dev-agent/prompts.py](agents/dev-agent/prompts.py): System guidelines enforcing zero placeholder comments, idiomatic style, and test completeness.
- [agents/dev-agent/main.py](agents/dev-agent/main.py): Stepwise tool dispatch and correction loop (single-task execution).
- [agents/dev-agent/runner.py](agents/dev-agent/runner.py): Orchestrates full-backlog transitions, branch pushing, and automated pull requests securely.

---

## Quick Start Configuration

### 1. Set Up the Prerequisites

From the repository root directory, prepare your local virtual environment:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r agents/dev-agent/requirements.txt
```

Ensure Node dependencies are ready to verify task integrations:

```powershell
npm install
```

### 2. Set API Tokens & Environmental Controls

Select your desired model and configure the tokens:

```powershell
# Default Provider: OpenAI (gpt-4o-mini is recommended for cheap and fast runs)
$env:OPENAI_API_KEY = "sk-..."

# Or choose Anthropic Claude Model
$env:LLM_PROVIDER = "anthropic"
$env:LLM_MODEL = "claude-3-5-sonnet-20241022"
$env:ANTHROPIC_API_KEY = "sk-ant-..."

# If using OpenAI reasoning models (o3-mini / o1) and wanting to tune the effort preset:
# $env:LLM_MODEL = "o3-mini"
# $env:REASONING_EFFORT = "medium"  # none, minimal, low, medium, high, xhigh
```

---

## Execution Guide

### Trigger Single Task (for testing/inspection)
```powershell
$env:FORCE_TASK_ID = "cdc-001"
python agents/dev-agent/main.py
```

### Run Entire Backlog Loop
```powershell
python agents/dev-agent/runner.py
```

---

## Scaling to N Concurrent Agents

The single loop processes one task at a time. To run several agents in parallel
against the same backlog, use the orchestrator:

```powershell
# Launch 3 agents; each gets its own isolated git worktree.
python agents/dev-agent/orchestrator.py --workers 3

# Reuse existing node_modules instead of running npm ci per worktree.
python agents/dev-agent/orchestrator.py --workers 3 --skip-install

# Remove all agent worktrees when finished.
python agents/dev-agent/orchestrator.py --teardown
```

How it stays correct with N workers:

- **Isolation via git worktrees.** Each worker runs in its own working directory
  (`../.agent-worktrees/worker-N`) that shares the primary repo's object store but
  has an independent index and HEAD. Workers never collide on files or
  `.git/index.lock`, and each builds/tests/branches in isolation. Because the
  shared `main` branch is owned by the primary checkout, workers run detached
  (`AUTOMATION_DETACH=1`) and branch straight off `origin/main`.
- **Atomic task claiming.** All workers point at one shared `backlog.json` via
  `AUTOMATION_BACKLOG_PATH` and claim tasks through `backlog_store.py`, which
  guards every mutation with a cross-process file lock. `claim_next_pending`
  flips the first pending task to `claimed` under the lock, so two workers can
  never grab the same task. Crashed-worker claims are auto-requeued after a lease
  window.
- **Safe merges.** Branch protection + GitHub auto-merge serialize merges into
  `main`; each worker rebases onto the freshest `origin/main` before every task,
  so parallel output integrates cleanly. Conflicting work simply fails CI and is
  retried against the updated tree.

Relevant env vars: `AUTOMATION_WORKER_ID`, `AUTOMATION_BACKLOG_PATH`,
`AUTOMATION_MANAGED`, `AUTOMATION_DETACH`, `AUTOMATION_CLAIM_LEASE`.

- **Duplicate-free replenishment.** `replenish_backlog` compares pool titles
  against every existing backlog task (any status) before appending, so a task
  that was ever queued, completed, or parked is never re-added under a new id.
  Pool entries seed repo-conventional paths only (`src/app/components/`,
  `src/app/hooks/`, `src/lib/`; Tailwind styling, no CSS files).

---

## Agent self-tests

Backlog hygiene and import regressions are covered by a stdlib-only unittest
suite (no LLM calls, no external deps):

```powershell
cd agents/dev-agent
python -m unittest test_backlog_hygiene -v
```

---

## Safety Constraints

- **PR Guard**: Git branches are dynamically created for each task, avoiding uncommitted overlap in your working directory.
- **Fail-Safe termination**: If verification fails and retry loops are exhausted, execution stops gracefully and yields to manual developer review without pushing bad code.
- **Cost control**: Loop limits are bounded to a maximum of 30 round-trips to defend against accidental recursive calls.
