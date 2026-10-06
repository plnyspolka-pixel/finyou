#!/bin/bash
# Installs the AWS CLI and wires up the Agent Toolkit in cloud sessions.
# Sign-in (`aws login --remote`) still needs a human, so it is only reported.
set -uo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

PROFILE="${AWS_SETUP_PROFILE:-finyou}"
REGION="${AWS_SETUP_REGION:-eu-central-1}"
export PATH="$HOME/.local/bin:$PATH"

if ! command -v aws >/dev/null 2>&1; then
  # Official installer; verifies the GPG signature of the download itself.
  curl -fsSL https://awscli.amazonaws.com/v2/install.sh | bash || { echo "AWS CLI install failed" >&2; exit 0; }
fi

grep -q '.local/bin' "$HOME/.bashrc" 2>/dev/null || echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
[ -n "${CLAUDE_ENV_FILE:-}" ] && echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$CLAUDE_ENV_FILE"

aws configure set region "$REGION" --profile "$PROFILE"

if aws sts get-caller-identity --profile "$PROFILE" >/dev/null 2>&1; then
  aws configure agent-toolkit --yes --region us-east-1 --profile "$PROFILE" </dev/null >/dev/null 2>&1 || echo "agent-toolkit setup failed" >&2
  # Point the generated aws-mcp entry at this profile.
  python3 -I - "$PROFILE" <<'PY' 2>/dev/null || true
import json, os, sys
p = os.path.expanduser('~/.claude.json')
d = json.load(open(p))
s = d.get('mcpServers', {}).get('aws-mcp')
if s is not None:
    s.setdefault('env', {})['AWS_MCP_PROXY_PROFILES'] = sys.argv[1]
    json.dump(d, open(p, 'w'), indent=2)
PY
  echo "AWS ready (profile $PROFILE)."
else
  echo "AWS CLI installed, but profile '$PROFILE' is not signed in. Run: aws login --remote --region $REGION --profile $PROFILE, then re-run .claude/hooks/session-start.sh"
fi
exit 0
