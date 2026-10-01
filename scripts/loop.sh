#!/usr/bin/env bash
# SMASH NEWS live loop — runs inside one GitHub Actions job: update every 10 minutes for ~5.5 hours, then hand off.
set -u
INTERVAL=${LOOP_INTERVAL_SECONDS:-600}
END=$(( $(date +%s) + ${LOOP_MINUTES:-335} * 60 ))
REPO_URL="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
PW_READY=0
i=0
while [ "$(date +%s)" -lt "$END" ]; do
  start=$(date +%s); i=$((i + 1))
  echo "::group::Update #$i — $(date -u +%FT%TZ)"
  git pull -q --ff-only origin main || echo "code pull skipped"
  node scripts/build-static.js || echo "BUILD FAILED"
  if [ -f dist/api/briefing.json ]; then python3 scripts/tts.py || echo "voice failed (app will use phone voice)"; fi

  # Instagram auto-post (only does anything when IG secrets are set)
  node scripts/autopost.js plan > /tmp/plan.log 2>&1; cat /tmp/plan.log
  if node -e "process.exit((JSON.parse(require('fs').readFileSync('data/autopost-plan.json','utf8')).posts||[]).length?0:1)" 2>/dev/null; then
    if [ "$PW_READY" = 0 ]; then
      sudo apt-get install -y -qq fonts-noto-color-emoji > /dev/null 2>&1
      npm i --no-save --silent playwright@1.56 && npx playwright install --with-deps chromium > /dev/null 2>&1 && PW_READY=1
    fi
    node scripts/autopost.js render || echo "render failed"
    HAS_POSTS=1
  else HAS_POSTS=0; fi

  # Publish the site
  if [ -f dist/index.html ]; then
    ( cd dist && rm -rf .git && git init -q -b gh-pages && git config user.name "smash-news-bot" \
      && git config user.email "41898282+github-actions[bot]@users.noreply.github.com" && git add -A \
      && git commit -qm "Update $(date -u +%FT%TZ)" && git push -q --force "$REPO_URL" gh-pages ) || echo "publish failed"
  fi
  [ "$HAS_POSTS" = 1 ] && SITE_URL="https://${GITHUB_REPOSITORY_OWNER}.github.io/${GITHUB_REPOSITORY#*/}/" node scripts/autopost.js publish

  # Save the radar's memory (seen stories, changes, source health) to the radar-data branch
  if [ -d data ]; then
    tar czf /tmp/state.tgz data && mkdir -p /tmp/rd && cp /tmp/state.tgz /tmp/rd/state.tgz && ( cd /tmp/rd && rm -rf .git && git init -q -b radar-data \
      && git config user.name "smash-news-bot" && git config user.email "41898282+github-actions[bot]@users.noreply.github.com" \
      && git add state.tgz && git commit -qm "state $(date -u +%FT%TZ)" && git push -q --force "$REPO_URL" radar-data ) || echo "state save failed"
  fi
  echo "::endgroup::"
  took=$(( $(date +%s) - start ))
  echo "Update #$i took ${took}s"
  left=$(( END - $(date +%s) ))
  [ "$left" -le "$INTERVAL" ] && break
  [ "$took" -lt "$INTERVAL" ] && sleep $(( INTERVAL - took ))
done

echo "Handing off to the next run…"
curl -sS -X POST -H "Authorization: Bearer ${GITHUB_TOKEN}" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/radar.yml/dispatches" -d '{"ref":"main"}' && echo "next run requested"
