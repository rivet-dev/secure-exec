---
name: git-sync
description: Commit all workspace changes, pull with rebase, resolve straightforward conflicts, and push. Use when the user asks to commit and push, sync with remote, or update branch history before pushing.
---

# Git Sync

## Overview
Use this workflow when the user wants a full Git sync sequence: commit all local work, rebase onto upstream, then push.

## Workflow
1. Inspect branch/upstream and working tree status.
2. Stage all changes with `git add -A`.
3. Commit all staged changes.
4. Pull with rebase from upstream.
5. Resolve safe conflicts automatically; stop and ask the user when conflict intent is unclear.
6. Push the branch.
7. Report final commit hash and remote branch.

## Required Behavior
- Use only non-interactive Git commands.
- If the user provided a commit message, use it exactly.
- If no message was provided and a commit is needed, create one yourself using a one-line Conventional Commit message that reflects the staged changes.
- If there is nothing to commit, continue with pull/rebase + push only if that still matches the user request.
- Prefer `git pull --rebase` over merge pulls.
- If rebase conflicts:
  - Resolve only obvious mechanical conflicts.
  - Run `git add <file>` then `git rebase --continue`.
  - If conflict intent is ambiguous, stop and ask the user how to proceed.
- If upstream is missing, detect remotes/branch and ask before setting upstream unless the user already requested that.
- Never use force push unless the user explicitly asked for it.

## Command Pattern
```bash
git status --short
git branch --show-current
git rev-parse --abbrev-ref --symbolic-full-name @{u} || true
git add -A
git commit -m "<message>"
git pull --rebase
git push
git log -1 --oneline
```
