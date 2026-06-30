#!/usr/bin/env bash
#
# scripts/release.sh — the safe release path: build -> commit -> tag -> push ->
# (optional) GitHub release. STANDARDS §4.
#
# Why this exists (v2.22.0 post-mortem): a release must NEVER tag or push if the
# commit didn't actually happen — e.g. the §8 pre-commit hook rejected it.
# Ad-hoc inline `git commit ...<heredoc>... ; git tag ... && git push ...` chains
# failed exactly this way: the blocked commit left the tag created and pushed at
# the PREVIOUS commit. This script makes that impossible:
#   * `set -euo pipefail` — any failed step aborts the whole script.
#   * the tag is created ONLY after verifying HEAD advanced to a new commit
#     (PRE != POST), and points at that exact commit.
#   * tag-already-exists (local or remote) aborts — never silently re-cut.
#   * push order is master first, then the tag.
#
# Usage:
#   bash scripts/release.sh <commit-message-file> [--notes <release-notes-file>]
#   # or pipe the message on stdin:
#   bash scripts/release.sh - [--notes notes.md] <<'MSG'
#   feat(release): vX.Y.Z — Title
#   ...body...
#   MSG
#
# The version is read from src/js/state.js (the single source build.js also uses);
# bump VERSION and update CHANGELOG before running. The GitHub release title is
# derived from the first line of the commit message (the conventional-commit
# prefix like "feat(release): " is stripped).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ── Args ──────────────────────────────────────────────────────────────────
MSG_FILE="${1:-}"
NOTES_FILE=""
if [ "${2:-}" = "--notes" ]; then NOTES_FILE="${3:-}"; fi
if [ -z "$MSG_FILE" ]; then
  echo "usage: bash scripts/release.sh <commit-message-file|-> [--notes <notes-file>]" >&2
  exit 2
fi

if [ "$MSG_FILE" = "-" ]; then
  MSG="$(cat)"                       # message from stdin
else
  [ -f "$MSG_FILE" ] || { echo "message file not found: $MSG_FILE" >&2; exit 2; }
  MSG="$(cat "$MSG_FILE")"
fi
[ -n "$MSG" ] || { echo "empty commit message" >&2; exit 2; }

# ── Pre-flight ────────────────────────────────────────────────────────────
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "master" ]; then
  echo "refusing to release from branch '$BRANCH' (expected master)" >&2
  exit 1
fi

echo "==> building"
node build.js >/dev/null              # hash-mismatch / VERSION-parse failures exit non-zero -> abort

VERSION="$(grep -oE "VERSION = '[^']+'" src/js/state.js | head -1 | sed -E "s/.*'([^']+)'.*/\1/")"
[ -n "$VERSION" ] || { echo "could not read VERSION from src/js/state.js" >&2; exit 1; }
TAG="v$VERSION"
echo "==> version $VERSION  (tag $TAG)"

# Never silently re-cut an existing release.
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "tag $TAG already exists locally — bump VERSION (or delete the tag) first" >&2
  exit 1
fi
if git ls-remote --exit-code --tags origin "$TAG" >/dev/null 2>&1; then
  echo "tag $TAG already exists on origin — bump VERSION first" >&2
  exit 1
fi

# ── Commit (the pre-commit hook runs here; rejection aborts everything) ────
PRE="$(git rev-parse HEAD)"
git add -A
if git diff --cached --quiet; then
  echo "nothing staged to commit — is the work already committed?" >&2
  exit 1
fi
echo "==> committing (pre-commit hook runs)"
printf '%s\n' "$MSG" | git commit -q -F -

# The load-bearing guard: only tag if a NEW commit was actually created.
POST="$(git rev-parse HEAD)"
if [ "$POST" = "$PRE" ]; then
  echo "commit did not advance HEAD — aborting before tag/push" >&2
  exit 1
fi
echo "==> committed $POST"

# ── Tag the exact commit, then push master, then the tag ──────────────────
git tag -a "$TAG" "$POST" -m "$TAG"
echo "==> pushing master"
git push origin master
echo "==> pushing tag $TAG"
git push origin "$TAG"

HASH="$(sha256sum datalab.html | awk '{print $1}')"
echo
echo "released $TAG @ ${POST:0:9}"
echo "SHA-256: $HASH"

# ── Optional GitHub release ───────────────────────────────────────────────
if [ -n "$NOTES_FILE" ]; then
  [ -f "$NOTES_FILE" ] || { echo "notes file not found: $NOTES_FILE" >&2; exit 1; }
  TITLE="$(printf '%s\n' "$MSG" | head -1 | sed -E 's/^[a-z]+(\([^)]*\))?(!)?: //')"
  echo "==> creating GitHub release: $TITLE"
  gh release create "$TAG" datalab.html --title "$TITLE" --notes-file "$NOTES_FILE"
else
  echo "(no --notes: create the GitHub release with"
  echo "   gh release create $TAG datalab.html --title \"$TAG — ...\" --notes-file <file> )"
fi
