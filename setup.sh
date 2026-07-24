#!/usr/bin/env bash
# Millibar Terminal — one-command GitHub deploy.
#
# Creates the repo, pushes this project, turns on GitHub Pages, and grants the
# refresh workflow write access — everything needed for a permanent live URL.
# Your push auto-triggers the first data fetch, so there is nothing to click.
#
# Prereqs: the GitHub CLI (https://cli.github.com) — run `gh auth login` once.
#
# Usage:
#   bash setup.sh                 # repo name "millibar-terminal", private
#   bash setup.sh my-repo-name    # custom name
#   bash setup.sh my-repo --public

set -euo pipefail

NAME="${1:-millibar-terminal}"
VIS="--private"
[ "${2:-}" = "--public" ] && VIS="--public"

step() { printf "\n\033[1;36m▸ %s\033[0m\n" "$1"; }
die()  { printf "\n\033[1;31m✗ %s\033[0m\n" "$1" >&2; exit 1; }

command -v git >/dev/null || die "git is not installed."
command -v gh  >/dev/null || die "GitHub CLI not found. Install it: https://cli.github.com  then run: gh auth login"
gh auth status >/dev/null 2>&1 || die "GitHub CLI is not authenticated. Run: gh auth login"
[ -d docs ] && [ -f scripts/fetch-data.mjs ] || die "Run this from the project root (the folder containing docs/ and scripts/)."

OWNER="$(gh api user -q .login)"
OWNER_LC="$(printf '%s' "$OWNER" | tr '[:upper:]' '[:lower:]')"
REPO="$OWNER/$NAME"

step "Creating repo $REPO ($VIS) and adding it as 'origin'"
if gh repo view "$REPO" >/dev/null 2>&1; then
  echo "  repo already exists — reusing it."
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$REPO.git"
else
  gh repo create "$REPO" $VIS --source=. --remote=origin --disable-wiki
fi

step "Pushing this project to main"
git add -A
git diff --cached --quiet || git -c user.name="$OWNER" -c user.email="$OWNER@users.noreply.github.com" commit -q -m "Deploy Millibar Terminal"
git push -u origin HEAD:main

step "Granting the data-refresh workflow write access"
gh api --method PUT "repos/$REPO/actions/permissions/workflow" \
  -f default_workflow_permissions=write -F can_approve_pull_request_reviews=false >/dev/null

step "Turning on GitHub Pages (branch main, /docs folder)"
gh api --method POST "repos/$REPO/pages" -f "source[branch]=main" -f "source[path]=/docs" >/dev/null 2>&1 \
  || gh api --method PUT "repos/$REPO/pages" -f "source[branch]=main" -f "source[path]=/docs" >/dev/null 2>&1 \
  || echo "  (Pages may already be enabled — check Settings → Pages)"

URL="$(gh api "repos/$REPO/pages" -q .html_url 2>/dev/null || echo "https://$OWNER_LC.github.io/$NAME/")"

printf "\n\033[1;32m✓ Done.\033[0m\n"
echo   "  Live URL:   $URL"
echo   "  Actions:    https://github.com/$REPO/actions"
echo   ""
echo   "Your push already kicked off the first data fetch. Real NHC + market data"
echo   "appears within a minute or two (watch the Actions tab), then refreshes every"
echo   "~15 min. If no storm is active, the terminal shows the honest AWAITING state."
