import os
import json
import time
import sys
import random
import subprocess
from pathlib import Path

# Set default env values prior to loading backlog_store / task_slicer imports.
# This propagates LLM credentials and providers downwards when task_slicer
# runs inside the parent autonomous.py loop to remediate failed backlog tasks.
os.environ["LLM_PROVIDER"] = os.environ.get("LLM_PROVIDER", "auto")
os.environ["COPILOT_MODEL"] = os.environ.get("COPILOT_MODEL", "gpt-5.3-codex")

import backlog_store
import task_slicer

ROOT = Path(__file__).parent
REPO_ROOT = ROOT.parent.parent
BACKLOG = backlog_store.backlog_path()
REPORT_PATH = ROOT / "REPORT.md"

# Identifies this worker within a multi-agent pool; "solo" for a single runner.
WORKER_ID = os.environ.get("AUTOMATION_WORKER_ID", "solo")
# When managed by the orchestrator, backlog status is owned by this runner (via
# the shared lock), so the main.py subprocess must not also write task status.
MANAGED = os.environ.get("AUTOMATION_MANAGED") == "1" or WORKER_ID != "solo"

# Seconds between iterations when there is nothing to do.
POLL_INTERVAL = int(os.environ.get("AUTOMATION_POLL_INTERVAL", "5"))
# Keep at least this many pending tasks in the backlog at all times.
MIN_PENDING = int(os.environ.get("AUTOMATION_MIN_PENDING", "5"))
# How many tasks to add whenever the backlog runs low.
REPLENISH_BATCH = int(os.environ.get("AUTOMATION_REPLENISH_BATCH", "8"))
# Max attempts before a task is parked so it stops burning model requests.
MAX_ATTEMPTS = int(os.environ.get("AUTOMATION_MAX_ATTEMPTS", "3"))
# Every N loops, sweep and retry parked tasks down to 0 attempts. Capped to prevent infinite death-spins.
RESCHEDULE_INTERVAL_LOOPS = int(os.environ.get("AUTOMATION_RESCHEDULE_INTERVAL", "5"))
# Default automation model; can still be overridden with COPILOT_MODEL.
COPILOT_MODEL = os.environ.get("COPILOT_MODEL", "gpt-5.3-codex")

# Rotating pool of frontend feature ideas for calm-daily-coach. Used to keep the
# backlog non-empty so the automation always has work.
#
# Paths must match repo conventions: components in src/app/components/ (tests in
# src/app/components/__tests__/), hooks in src/app/hooks/, shared logic in
# src/lib/. Styling is Tailwind-in-component; never seed src/styles/*.css files.
# No streak/pressure mechanics: the product promise is explicitly streak-free.
FRONTEND_TASK_POOL = [
    ("Add breathing exercise timer component", "Build a BreathingTimer React component with configurable inhale/hold/exhale durations and a calming animated ring.", ["src/app/components/BreathingTimer.tsx", "src/app/components/__tests__/BreathingTimer.test.tsx"]),
    ("Add daily affirmation card", "Create an AffirmationCard component that shows a rotating daily affirmation with a refresh action.", ["src/app/components/AffirmationCard.tsx", "src/lib/affirmations.ts"]),
    ("Add mood tracker widget", "Implement a MoodTracker component allowing users to log their mood with emoji buttons and persist to local storage.", ["src/app/components/MoodTracker.tsx", "src/lib/mood-storage.ts"]),
    ("Add gratitude journal entry form", "Create a GratitudeJournal component with a text entry form and a list of recent entries.", ["src/app/components/GratitudeJournal.tsx", "src/app/components/__tests__/GratitudeJournal.test.tsx"]),
    ("Add calming color theme switcher", "Add a ThemeSwitcher component offering multiple calming color palettes stored in preferences.", ["src/app/components/ThemeSwitcher.tsx", "src/lib/theme-palettes.ts"]),
    ("Add guided meditation list", "Create a MeditationList component that renders available guided meditations with duration badges.", ["src/app/components/MeditationList.tsx", "src/lib/meditations.ts"]),
    ("Add focus session countdown", "Implement a FocusSession component with a Pomodoro-style countdown and start/pause controls.", ["src/app/components/FocusSession.tsx", "src/lib/focus-timer.ts"]),
    ("Add reminder settings panel", "Build a ReminderSettings component for enabling daily reminders and choosing a time.", ["src/app/components/ReminderSettings.tsx", "src/lib/reminders.ts"]),
    ("Add responsive footer with links", "Create an accessible Footer component with navigation links and social icons.", ["src/app/components/Footer.tsx", "src/app/components/__tests__/Footer.test.tsx"]),
    ("Add loading spinner component", "Add a reusable Spinner component with size and color props plus unit tests.", ["src/app/components/Spinner.tsx", "src/app/components/__tests__/Spinner.test.tsx"]),
    ("Add empty state illustration component", "Create an EmptyState component that shows an illustration and message when lists are empty.", ["src/app/components/EmptyState.tsx", "src/app/components/__tests__/EmptyState.test.tsx"]),
    ("Add keyboard shortcut help modal", "Implement a ShortcutsModal component listing keyboard shortcuts, toggled with '?'.", ["src/app/components/ShortcutsModal.tsx", "src/lib/shortcuts.ts"]),
    ("Add progress ring visualization", "Build a ProgressRing SVG component that animates from 0 to a target percentage.", ["src/app/components/ProgressRing.tsx", "src/app/components/__tests__/ProgressRing.test.tsx"]),
    ("Add tag filter chips", "Create a TagFilter component with selectable chips that filter a list of items.", ["src/app/components/TagFilter.tsx", "src/app/components/__tests__/TagFilter.test.tsx"]),
    ("Add scroll-to-top button", "Add a ScrollToTop button that appears after scrolling and smoothly returns to the top.", ["src/app/components/ScrollToTop.tsx", "src/app/hooks/use-scroll.ts"]),
]


def log(msg):
    print(msg, flush=True)


def load_backlog():
    # Retry briefly: the file may be momentarily locked while another process
    # (a main.py subprocess) is writing it on Windows.
    for attempt in range(10):
        try:
            return json.loads(BACKLOG.read_text(encoding="utf-8"))
        except (PermissionError, json.JSONDecodeError):
            time.sleep(0.2)
    # Last attempt: let the error surface to the caller's handler.
    return json.loads(BACKLOG.read_text(encoding="utf-8"))


def save_backlog(data):
    # Atomic write: serialize to a unique temp file in the same directory, then
    # os.replace() it over the target. Retries cover transient Windows locks so
    # a concurrent read/write never corrupts or fails the backlog.
    payload = json.dumps(data, indent=2)
    tmp = BACKLOG.with_suffix(f".tmp.{os.getpid()}")
    for attempt in range(10):
        try:
            tmp.write_text(payload, encoding="utf-8")
            os.replace(tmp, BACKLOG)
            return
        except PermissionError:
            time.sleep(0.2)
        finally:
            if tmp.exists():
                try:
                    tmp.unlink()
                except OSError:
                    pass
    # Final attempt without swallowing the error, so the outer loop can log it.
    tmp.write_text(payload, encoding="utf-8")
    os.replace(tmp, BACKLOG)



def next_task_number(data):
    """Return the next numeric suffix for a cdc-#### id."""
    highest = 0
    for t in data.get("tasks", []):
        tid = t.get("id", "")
        if tid.startswith("cdc-"):
            try:
                highest = max(highest, int(tid.split("-")[1]))
            except (ValueError, IndexError):
                continue
    return highest + 1


def _normalized_title(title):
    return " ".join((title or "").lower().split())


def select_fresh_pool_tasks(existing_tasks, pool, batch):
    """Pick up to ``batch`` pool entries whose titles are not already in the backlog.

    Titles are compared case/whitespace-insensitively against every existing task
    regardless of status, so a completed or parked task is never re-queued as a
    duplicate under a new id.
    """
    existing = {_normalized_title(t.get("title")) for t in existing_tasks}
    fresh = [p for p in pool if _normalized_title(p[0]) not in existing]
    if len(fresh) <= batch:
        return fresh
    return random.sample(fresh, batch)


def replenish_backlog():
    """Append fresh frontend tasks so the backlog is never empty. Runs under lock
    via backlog_store so concurrent workers cannot double-number new task ids."""
    def _replenish(data):
        tasks = data.setdefault("tasks", [])
        picks = select_fresh_pool_tasks(tasks, FRONTEND_TASK_POOL, REPLENISH_BATCH)
        start = next_task_number(data)
        for i, (title, description, files) in enumerate(picks):
            num = start + i
            tasks.append({
                "id": f"cdc-{num:03d}",
                "title": title,
                "description": description,
                "files_to_touch": files,
                "status": "pending",
            })
        return len(picks), start

    added, start = backlog_store.mutate(_replenish)
    if added:
        log(f"[{WORKER_ID}] Replenished backlog with {added} new frontend tasks (starting cdc-{start:03d}).")
    else:
        log(f"[{WORKER_ID}] Replenish skipped: every pool task already exists in the backlog.")


def clean_git_state():
    """Reset the working tree to a clean origin/main so a fresh task branch can
    be created.

    backlog.json and state.json are git-ignored runtime files; they live on disk
    and are untouched by the reset, so task status and replenishment persist.

    In a git worktree (multi-agent mode, AUTOMATION_DETACH=1) the shared `main`
    branch is checked out by the primary worktree and cannot be checked out here,
    so we detach directly onto origin/main instead of switching to `main`.
    """
    detach = os.environ.get("AUTOMATION_DETACH") == "1"
    try:
        lock = REPO_ROOT / ".git" / "index.lock"
        if lock.exists():
            lock.unlink()
        subprocess.run(["git", "checkout", "--", "."], cwd=str(REPO_ROOT), capture_output=True, text=True)
        subprocess.run(["git", "fetch", "origin", "main"], cwd=str(REPO_ROOT), capture_output=True, text=True)
        if detach:
            subprocess.run(["git", "checkout", "-f", "--detach", "origin/main"], cwd=str(REPO_ROOT), capture_output=True, text=True)
        else:
            subprocess.run(["git", "checkout", "main"], cwd=str(REPO_ROOT), capture_output=True, text=True)
            subprocess.run(["git", "reset", "--hard", "origin/main"], cwd=str(REPO_ROOT), capture_output=True, text=True)
        subprocess.run(["git", "stash", "clear"], cwd=str(REPO_ROOT), capture_output=True, text=True)
    except Exception as e:
        log(f"clean_git_state warning: {e}")


def create_pr_and_enable_auto(branch_name, title, body):
    try:
        pr_num = ""
        pr_url = ""
        res = subprocess.run(
            ["gh", "pr", "create", "--base", "main", "--head", branch_name, "--title", title, "--body", body],
            cwd=str(REPO_ROOT), capture_output=True, text=True,
        )
        if res.returncode != 0:
            log(f"gh pr create failed: {res.stderr.strip()}")
            existing = subprocess.run(
                ["gh", "pr", "view", branch_name, "--json", "number,url"],
                cwd=str(REPO_ROOT), capture_output=True, text=True,
            )
            if existing.returncode != 0:
                log(f"gh pr view failed after create failure: {existing.stderr.strip()}")
                return None
            try:
                existing_data = json.loads(existing.stdout or "{}")
                pr_num = str(existing_data.get("number", "")).strip()
                pr_url = str(existing_data.get("url", "")).strip()
            except json.JSONDecodeError:
                log("gh pr view returned invalid JSON.")
                return None
        else:
            pr_url = res.stdout.strip().splitlines()[-1] if res.stdout.strip() else ""
            num = subprocess.run(
                ["gh", "pr", "view", branch_name, "--json", "number", "--jq", ".number"],
                cwd=str(REPO_ROOT), capture_output=True, text=True,
            )
            pr_num = num.stdout.strip()

        if pr_num:
            merge_res = subprocess.run(
                ["gh", "pr", "merge", pr_num, "--auto", "--merge"],
                cwd=str(REPO_ROOT), capture_output=True, text=True,
            )
            if merge_res.returncode != 0:
                log(f"gh pr merge --auto failed for #{pr_num}: {merge_res.stderr.strip()}")

        if not pr_url:
            url_res = subprocess.run(
                ["gh", "pr", "view", branch_name, "--json", "url", "--jq", ".url"],
                cwd=str(REPO_ROOT), capture_output=True, text=True,
            )
            if url_res.returncode == 0:
                pr_url = url_res.stdout.strip()

        return pr_url or None
    except Exception as e:
        log(f"Error creating PR: {e}")
        return None


def _sanitize_branch_name(task_id, title):
    branch_name = f"dev-agent/{task_id}-{title.lower().replace(' ', '-')}"
    return "".join(c for c in branch_name if c.isalnum() or c in "-/")


def run_task(task):
    task_id = task["id"]
    log(f"[{WORKER_ID}] Starting task {task_id} - {task['title']}")

    env = os.environ.copy()
    env["FORCE_TASK_ID"] = task_id
    env["DRY_RUN"] = "0"
    env["LLM_PROVIDER"] = env.get("LLM_PROVIDER", "auto")
    env["COPILOT_MODEL"] = env.get("COPILOT_MODEL", COPILOT_MODEL)
    # Under a worker pool the shared backlog status is owned by this runner, so
    # tell main.py not to write task status itself (it would race other workers).
    if MANAGED:
        env["AUTOMATION_MANAGED"] = "1"

    # Hard cap per task so a hung agent/subprocess can never stall the loop.
    task_timeout = int(os.environ.get("TASK_TIMEOUT", "900"))
    try:
        proc = subprocess.run(
            [sys.executable, "main.py"], cwd=str(ROOT), env=env,
            capture_output=True, text=True, timeout=task_timeout,
        )
    except subprocess.TimeoutExpired:
        log(f"[{WORKER_ID}] Task {task_id} timed out after {task_timeout}s; killing and moving on.")
        # Teach the memory that this task shape stalls, so future prompts warn against it.
        try:
            import memory
            memory.record_task_outcome(
                task, False,
                {"stdout": "", "stderr": f"task timed out after {task_timeout}s"}, None,
            )
        except Exception as e:
            log(f"memory timeout-record warning: {e}")
        return False

    if proc.stdout:
        log(proc.stdout)

    if proc.returncode == 0:
        branch_name = _sanitize_branch_name(task_id, task["title"])
        push_res = subprocess.run(
            ["git", "push", "-u", "origin", branch_name, "--force-with-lease"],
            cwd=str(REPO_ROOT), capture_output=True, text=True,
        )
        if push_res.returncode != 0:
            log(f"[{WORKER_ID}] git push failed for {branch_name}: {push_res.stderr.strip()}")
            return False
        pr_url = create_pr_and_enable_auto(branch_name, f"feat({task_id}): {task['title']}", f"Automated frontend change for {task_id}.")
        if not pr_url:
            log(f"[{WORKER_ID}] PR create/view failed for branch {branch_name}.")
            return False
        log(f"[{WORKER_ID}] PR created: {pr_url}")
        return True

    log(f"[{WORKER_ID}] Task {task_id} failed: {proc.stderr.strip()[:500]}")
    return False


def update_parked_report(tasks):
    """Write an updated markdown list of parked tasks for manual review."""
    parked = [t for t in tasks if t.get("status") == "parked"]
    content = [
        "# ADHD Daily Coach - Autonomous Dev Agent Backlog Reports\n",
        "This file is auto-generated by `run_autonomous.py`. It lists tasks that failed repeatedly and have been officially parked for human inspection/re-writing.\n",
        "## Parked Tasks Pending Manual Review\n",
    ]
    if not parked:
        content.append("*No parked tasks currently. Everything is fully solved or pending!* 🏖️\n")
    else:
        for t in parked:
            files_str = ", ".join(t.get("files_to_touch", [])) if t.get("files_to_touch") else "sensible paths"
            content.append(
                f"### 🛑 [{t['id']}] {t['title']}\n"
                f"- **Description**: {t['description']}\n"
                f"- **Failed Attempts**: {t.get('attempts', 0)} / {MAX_ATTEMPTS}\n"
                f"- **Target Files**: `{files_str}`\n"
                f"- **Action**: Revise task instructions or debug underlying tooling blocks before retrying.\n"
            )
    try:
        REPORT_PATH.write_text("\n".join(content), encoding="utf-8")
        log("Updated REPORT.md with parked status.")
    except Exception as e:
        log(f"update_parked_report warning: {e}")


def process_once(loop_count):
    # Recover tasks abandoned by a crashed/killed worker (claimed but never
    # finalized within the lease window), returning them to the pending pool.
    lease = int(os.environ.get("AUTOMATION_CLAIM_LEASE", str(int(os.environ.get("TASK_TIMEOUT", "900")) + 120)))
    requeued = backlog_store.requeue_stale_claims(lease)
    if requeued:
        log(f"[{WORKER_ID}] Requeued {requeued} stale claimed task(s) back to pending.")

    # On schedule: sweep parked tasks back to pending for another attempt.
    if loop_count > 0 and loop_count % RESCHEDULE_INTERVAL_LOOPS == 0:
        def _sweep(data):
            swept = 0
            for t in data.get("tasks", []):
                if t.get("status") == "parked":
                    t["status"] = "pending"
                    t["attempts"] = 0
                    swept += 1
            return swept

        swept = backlog_store.mutate(_sweep)
        if swept > 0:
            log(f"[{WORKER_ID}] Reschedule sweep (loop {loop_count}): reset {swept} parked tasks to pending.")

    # Keep the backlog stocked with frontend work.
    if backlog_store.count_by_status("pending") < MIN_PENDING:
        replenish_backlog()

    # Coordinated Failure Remediation Guard:
    # Before grabbing any task, let the master or solo lock owner sweep the backlog
    # for repeatedly failing tasks and slice them into simpler sequential pieces.
    # Safe across processes because remediation is wrapped inside backlog_store's lock.
    try:
        def _remediate_and_slice(data):
            return task_slicer.auto_remediate_backlog_failures(data, MAX_ATTEMPTS)

        sliced_count = backlog_store.mutate(_remediate_and_slice)
        if sliced_count > 0:
            log(f"[{WORKER_ID}] Automatically split {sliced_count} repeatedly failing tasks into simpler segments!")
    except Exception as e:
        log(f"[{WORKER_ID}] auto-slicing warning (continuing): {e}")

    # Atomically claim a task so no two workers ever grab the same one.
    task = backlog_store.claim_next_pending(WORKER_ID)
    if not task:
        log(f"[{WORKER_ID}] No pending tasks. Sleeping...")
        time.sleep(POLL_INTERVAL)
        return

    clean_git_state()
    ok = run_task(task)

    status = backlog_store.finalize_task(task["id"], ok, MAX_ATTEMPTS)
    log(f"[{WORKER_ID}] Task {task['id']} -> {status}")
    update_parked_report(backlog_store.read_backlog().get("tasks", []))
    time.sleep(1)


def main_loop():
    log(f"[{WORKER_ID}] Autonomous runner started (model={COPILOT_MODEL}, min_pending={MIN_PENDING}, backlog={BACKLOG}). Press Ctrl+C to stop.")
    loop_count = 0
    while True:
        try:
            process_once(loop_count)
            loop_count += 1
        except KeyboardInterrupt:
            log("Interrupted by user. Exiting.")
            return
        except Exception as e:
            # Never die: log and keep looping for maximum uptime.
            log(f"Unhandled error, continuing: {e}")
            time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main_loop()
