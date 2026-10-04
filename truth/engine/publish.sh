#!/usr/bin/env bash
# Saves the library to its own branch (history kept) and publishes the built site.
#   publish.sh <storeDir> <distDir>          needs REPO, GH_TOKEN, DATA_BRANCH, DEPLOY_BRANCH
# The library is the thing that must never be lost: if it ever comes back smaller than it was restored, nothing is pushed.
set -euo pipefail
store=$(realpath "$1"); dist=$(realpath "$2")
remote="https://x-access-token:${GH_TOKEN}@github.com/${REPO}.git"
before=$(cat "$store/.before" 2>/dev/null || echo 0); after=$(ls "$store/data/posts" 2>/dev/null | wc -l)
if [ "$after" -lt "$before" ]; then echo "::error::the library shrank ($before to $after files); nothing was published"; exit 1; fi

work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
cd "$work" && git init -q && git config user.name "truth-bot" && git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git remote add origin "$remote"
if git fetch -q --depth 1 origin "$DATA_BRANCH" 2>/dev/null; then git checkout -q -b "$DATA_BRANCH" FETCH_HEAD; else git checkout -q --orphan "$DATA_BRANCH"; fi
rm -rf data && cp -r "$store/data" data && git add -A
if git diff --cached --quiet; then echo "library unchanged"; else git commit -qm "library: $after files ($(date -u +%FT%TZ))" && git push -q origin "$DATA_BRANCH" && echo "library saved: $after file(s)"; fi
echo "$after" > "$store/.before"

cd "$dist" && rm -rf .git && git init -q -b "$DEPLOY_BRANCH" && git config user.name "truth-bot" && git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A && git commit -qm "THE TRUTH $(date -u +%FT%TZ)" && git push -q --force "$remote" "$DEPLOY_BRANCH"
rm -rf .git
echo "published to $DEPLOY_BRANCH"
