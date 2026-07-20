#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
plugin_repo="$(cd "${script_dir}/.." && pwd)"
frontend_repo="${GEYI_FRONTEND_REPO:-${plugin_repo}/../immersive_translator_frontend}"
dry_run=false

usage() {
  echo "Usage: npm run publish:web -- [--dry-run] [--frontend PATH]"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      dry_run=true
      shift
      ;;
    --frontend)
      [[ $# -ge 2 ]] || { usage; exit 2; }
      frontend_repo="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage
      exit 2
      ;;
  esac
done

for command_name in git npm node; do
  command -v "${command_name}" >/dev/null || {
    echo "Missing required command: ${command_name}" >&2
    exit 1
  }
done

[[ -d "${frontend_repo}/.git" ]] || {
  echo "Frontend repository not found: ${frontend_repo}" >&2
  exit 1
}

[[ "$(git -C "${plugin_repo}" branch --show-current)" == "main" ]] || {
  echo "Plugin repository must be on main." >&2
  exit 1
}

[[ -z "$(git -C "${plugin_repo}" status --porcelain)" ]] || {
  echo "Plugin repository has uncommitted changes; commit or stash them first." >&2
  exit 1
}

git -C "${plugin_repo}" fetch origin
[[ "$(git -C "${plugin_repo}" rev-parse HEAD)" == "$(git -C "${plugin_repo}" rev-parse origin/main)" ]] || {
  echo "Plugin main is not synchronized with origin/main." >&2
  exit 1
}

cd "${plugin_repo}"
npm test
npm run build

version="$(node -p "require('./package.json').version")"
xpi_path="${plugin_repo}/build/geyi-translator.xpi"
update_path="${plugin_repo}/build/update.json"

[[ -s "${xpi_path}" && -s "${update_path}" ]] || {
  echo "Build did not produce the expected XPI and update manifest." >&2
  exit 1
}

node - "${xpi_path}" "${update_path}" "${version}" <<'NODE'
const crypto = require("node:crypto")
const fs = require("node:fs")

const [, , xpiPath, updatePath, expectedVersion] = process.argv
const manifest = JSON.parse(fs.readFileSync(updatePath, "utf8"))
const addon = manifest.addons?.["geyi-zotero-translator@geyi.net"]
const update = addon?.updates?.[0]
if (!update || update.version !== expectedVersion) {
  throw new Error(`update.json version does not match package version ${expectedVersion}`)
}
if (update.update_link !== "https://www.geyi.net/plugin/zotero-geyi.xpi") {
  throw new Error("update.json points at an unexpected download URL")
}
const digest = crypto.createHash("sha512").update(fs.readFileSync(xpiPath)).digest("hex")
if (update.update_hash !== `sha512:${digest}`) {
  throw new Error("update.json SHA-512 does not match the built XPI")
}
NODE

git -C "${frontend_repo}" fetch origin

temp_root="$(mktemp -d "${TMPDIR:-/tmp}/geyi-zotero-publish.XXXXXX")"
frontend_worktree="${temp_root}/frontend"
worktree_added=false

cleanup() {
  if [[ "${worktree_added}" == true ]]; then
    git -C "${frontend_repo}" worktree remove --force "${frontend_worktree}" >/dev/null 2>&1 || true
  fi
  rmdir "${temp_root}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

git -C "${frontend_repo}" worktree add --detach "${frontend_worktree}" origin/main
worktree_added=true

mkdir -p "${frontend_worktree}/public/plugin"
cp "${xpi_path}" "${frontend_worktree}/public/plugin/zotero-geyi.xpi"
cp "${update_path}" "${frontend_worktree}/public/plugin/update.json"

git -C "${frontend_worktree}" diff --check

if [[ -z "$(git -C "${frontend_worktree}" status --porcelain -- \
  public/plugin/update.json public/plugin/zotero-geyi.xpi)" ]]; then
  echo "Version ${version} is already published; nothing to do."
  exit 0
fi

git -C "${frontend_worktree}" status --short -- public/plugin/update.json public/plugin/zotero-geyi.xpi

if [[ "${dry_run}" == true ]]; then
  echo "Dry run complete; no commit or push was performed."
  exit 0
fi

git -C "${frontend_worktree}" add public/plugin/update.json public/plugin/zotero-geyi.xpi
git -C "${frontend_worktree}" commit -m "GEYI-330 publish Zotero plugin v${version}"
git -C "${frontend_worktree}" fetch origin
git -C "${frontend_worktree}" rebase origin/main
git -C "${frontend_worktree}" push origin HEAD:main

published_commit="$(git -C "${frontend_worktree}" rev-parse HEAD)"
remote_commit="$(git -C "${frontend_worktree}" ls-remote origin refs/heads/main | awk '{print $1}')"
[[ "${published_commit}" == "${remote_commit}" ]] || {
  echo "Remote main verification failed." >&2
  exit 1
}

echo "Published Zotero plugin v${version} at ${published_commit}."
