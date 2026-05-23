#!/usr/bin/env bash
# AlignMD — one-step provisioner.
# Run this, paste your Supabase Management API token at the hidden prompt,
# and it does everything: saves the token, creates the isolated AlignMD
# database project, applies the Phase-0 migrations, and writes the env file.

set -euo pipefail

ENV_FILE="$HOME/Documents/studio/.env.local"
PROVISIONER="$HOME/Documents/studio/scripts/supabase-provisioner.mjs"
MIGRATIONS="$HOME/Documents/alignmd/supabase/migrations"
ENV_OUT="$HOME/Documents/alignmd/.env.local"

echo
echo "AlignMD — Supabase provisioning"
echo "Paste your Supabase Management API token, then press Enter."
echo "(Input is hidden; it won't show on screen or in your shell history.)"
printf "Token: "
read -rs TOKEN
echo

if [ -z "${TOKEN:-}" ]; then
  echo "No token entered — nothing changed. Re-run when ready."
  exit 1
fi
case "$TOKEN" in
  sbp_*) ;;
  *) echo "Note: Supabase tokens normally start with 'sbp_' — continuing anyway." ;;
esac

# Save (or replace) the token in studio/.env.local.
[ -f "$ENV_FILE" ] || touch "$ENV_FILE"
TMP="$(mktemp)"
grep -vE '^[[:space:]]*SUPABASE_ACCESS_TOKEN[[:space:]]*=' "$ENV_FILE" > "$TMP" || true
echo "SUPABASE_ACCESS_TOKEN=$TOKEN" >> "$TMP"
mv "$TMP" "$ENV_FILE"
echo "✓ token saved to studio/.env.local"
echo

# Provision: create project -> apply migrations -> write AlignMD env.
node "$PROVISIONER" \
  --name alignmd \
  --migrations "$MIGRATIONS" \
  --env-out "$ENV_OUT"
