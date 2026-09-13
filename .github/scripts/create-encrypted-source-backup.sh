#!/usr/bin/env bash
set -Eeuo pipefail

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Required command is unavailable: $1" >&2
    exit 1
  }
}

require_value() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Required configuration is missing: $name" >&2
    exit 1
  fi
}

for command_name in age git sha256sum tar; do
  require_command "$command_name"
done

for value_name in BACKUP_AGE_RECIPIENT BACKUP_OUTPUT_DIRECTORY GITHUB_OUTPUT GITHUB_STEP_SUMMARY; do
  require_value "$value_name"
done

if [[ "$BACKUP_AGE_RECIPIENT" != age1* ]]; then
  echo "The recipient must be a public age key beginning with age1." >&2
  exit 1
fi

mkdir -p -- "$BACKUP_OUTPUT_DIRECTORY"

readonly build_dir="$(mktemp -d)"
cleanup() {
  rm -rf -- "$build_dir"
}
trap cleanup EXIT

readonly created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
readonly timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
readonly head_sha="$(git rev-parse HEAD)"
readonly short_sha="$(git rev-parse --short=12 HEAD)"
readonly bundle_name="hamvara-site-${timestamp}-${short_sha}.bundle"
readonly archive_name="${bundle_name}.tar"
readonly encrypted_name="${archive_name}.age"
readonly artifact_name="hamvara-source-${timestamp}-${short_sha}"
readonly encrypted_path="${BACKUP_OUTPUT_DIRECTORY}/${encrypted_name}"
readonly checksum_path="${encrypted_path}.sha256"

git fetch --force --prune --prune-tags origin \
  '+refs/heads/*:refs/remotes/origin/*' \
  '+refs/tags/*:refs/tags/*'

git bundle create "$build_dir/$bundle_name" --all
git bundle verify "$build_dir/$bundle_name"

readonly bundle_sha256="$(sha256sum "$build_dir/$bundle_name" | awk '{print $1}')"
cat > "$build_dir/manifest.txt" <<EOF
repository=https://github.com/mazdaran/hamvara-site
created_at=$created_at
head_sha=$head_sha
bundle_sha256=$bundle_sha256
encryption=age
restore_test_required=true
EOF

tar --create \
  --file "$build_dir/$archive_name" \
  --directory "$build_dir" \
  "$bundle_name" manifest.txt

age --encrypt \
  --recipient "$BACKUP_AGE_RECIPIENT" \
  --output "$encrypted_path" \
  "$build_dir/$archive_name"

readonly encrypted_sha256="$(sha256sum "$encrypted_path" | awk '{print $1}')"
printf '%s  %s\n' "$encrypted_sha256" "$encrypted_name" > "$checksum_path"

{
  echo "artifact_name=$artifact_name"
  echo "encrypted_path=$encrypted_path"
  echo "checksum_path=$checksum_path"
} >> "$GITHUB_OUTPUT"

{
  echo "### Encrypted source backup"
  echo ""
  echo "- Git HEAD: \`${head_sha}\`"
  echo "- Encrypted file: \`${encrypted_name}\`"
  echo "- Encrypted SHA-256: \`${encrypted_sha256}\`"
  echo "- Encryption: age public-key encryption"
  echo "- Private key exposure: none"
} >> "$GITHUB_STEP_SUMMARY"
