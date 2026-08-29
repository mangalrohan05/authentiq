# Security Remediation — Committed Credentials (audit 2.1)

`authentiq-app/backend/static/db_backup/users.json` was tracked in git with **real
bcrypt password hashes and user emails** (the demo `@authentiq.com` accounts *and*
several real `@gmail.com` users). Password hashes and PII must never live in a repo.

## What was fixed in code (this branch)

- **Untracked** `users.json` (`git rm --cached`) and **gitignored** it — the app can
  still read/write it locally, but it is no longer committed.
- **`db.py` seeds the demo admin/vendor at runtime** (`_ensure_demo_users`) whenever
  the `users` collection is empty, independent of which backups loaded — so removing
  the file from the repo never breaks local login.
- **Seed passwords are env-overridable** (`AUTHENTIQ_SEED_ADMIN_PASSWORD`,
  `AUTHENTIQ_SEED_VENDOR_PASSWORD`) in `db.py` and `scripts/seed_users.py`; the
  hardcoded `Admin@123` / `Vendor@123` are dev-only defaults. **Production must set
  its own.**
- `users.json.example` documents the format (no real hashes).

## What still MUST be done manually (destructive — not automated)

The hashes/PII remain in **git history**. Removing them rewrites history and requires
coordination, because it changes commit SHAs on shared branches
(`main`, `Staging`, `rohan-dev`, `anushka-dev`, `gungun-dev`, `dev`).

### 1. Rotate first (assume the exposed material is compromised)

- Reset the passwords of every **real** user whose hash was in the file (the
  `@gmail.com` accounts) and notify them.
- Rotate the demo passwords in any deployed environment (set the env vars above).
- Rotate `SECRET_KEY` (JWT signing) and any secrets that ever shared a commit with
  the file, then invalidate outstanding sessions.

### 2. Purge the file from history

Coordinate a freeze, then (preferred: `git filter-repo`):

```bash
# From a fresh mirror clone:
pip install git-filter-repo
git clone --mirror <repo-url> repo.git && cd repo.git
git filter-repo --path authentiq-app/backend/static/db_backup/users.json --invert-paths
git push --force --all && git push --force --tags
```

Or with BFG:

```bash
bfg --delete-files users.json repo.git
cd repo.git && git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push --force --all
```

### 3. After the force-push

- **Every collaborator must re-clone** (or hard-reset) — old clones still contain the
  secrets and will re-introduce them on the next push if merged.
- If the repo was ever public or forked, treat the credentials as permanently
  compromised regardless of the purge (rotation in step 1 is what actually protects
  you).

## Related (audit 2.2, out of scope here)

The same directory commits other runtime dumps with PII — `vendors.json`,
`scans.json` (IP/geo/user-agent), `verification_sessions.json`, `brands.json`,
`invitations.json`. Move runtime data to object storage / a real DB and untrack the
whole `static/db_backup/` directory as a follow-up.
