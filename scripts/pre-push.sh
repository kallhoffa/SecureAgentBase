#!/usr/bin/env bash
# Pre-push hook: scan for leaked secrets before pushing
# Install: ln -sf ../../pre-push .git/hooks/pre-push && chmod +x .git/hooks/pre-push

set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

SECRET_PATTERNS=(
  'GITHUB_PAT[_=]ghp_[a-zA-Z0-9]{36}'
  'GITHUB_PAT[_=]github_pat_[a-zA-Z0-9_]{80,}'
  'CLIENT_SECRET[_=][a-zA-Z0-9]{32,}'
  'FIREBASE_API_KEY[_=]AIza[a-zA-Z0-9_-]{35}'
  'SERVICE_ACCOUNT.*"private_key"'
  '-----BEGIN (RSA |EC )?PRIVATE KEY-----'
  'AKIA[0-9A-Z]{16}'
)

FOUND=0

# Check staged files
DIFF=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)
if [ -z "$DIFF" ]; then
  DIFF=$(git diff --name-only --diff-filter=ACM HEAD..HEAD@{1} 2>/dev/null || true)
fi
if [ -z "$DIFF" ]; then
  DIFF=$(git diff --name-only 2>/dev/null || true)
fi

for pattern in "${SECRET_PATTERNS[@]}"; do
  MATCHES=$(echo "$DIFF" | xargs grep -l "$pattern" 2>/dev/null || true)
  if [ -n "$MATCHES" ]; then
    echo -e "${RED}WARNING: Potential secret match for pattern: ${pattern}${NC}"
    echo "$MATCHES" | while read -r f; do echo "  $f"; done
    FOUND=1
  fi
done

# Also scan .env files specifically
for envfile in $(echo "$DIFF" | grep -E '\.env(\..+)?$' 2>/dev/null || true); do
  if [ -f "$envfile" ]; then
    LINE_MATCHES=$(grep -nE '(GITHUB_PAT|CLIENT_SECRET|SERVICE_ACCOUNT|private_key|API_KEY|BOT_TOKEN)' "$envfile" 2>/dev/null || true)
    if [ -n "$LINE_MATCHES" ]; then
      echo -e "${RED}WARNING: Secrets found in $envfile:${NC}"
      echo "$LINE_MATCHES" | while read -r line; do echo "  $line"; done
      FOUND=1
    fi
  fi
done

if [ "$FOUND" -eq 1 ]; then
  echo ""
  echo -e "${YELLOW}Push aborted. Remove secrets before pushing.${NC}"
  echo "To bypass (not recommended): git push --no-verify"
  exit 1
fi

echo "Pre-push secret scan: OK"
exit 0
