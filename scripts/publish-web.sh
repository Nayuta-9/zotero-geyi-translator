#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
plugin_repo="$(cd "${script_dir}/.." && pwd)"
plugin_bucket="${GEYI_PLUGIN_BUCKET:-immersive-translator-plugin-releases}"
dry_run=false

usage() {
  echo "Usage: npm run publish:web -- [--dry-run] [--bucket NAME]"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      dry_run=true
      shift
      ;;
    --bucket)
      [[ $# -ge 2 ]] || { usage; exit 2; }
      plugin_bucket="$2"
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

for command_name in git npm node gcloud; do
  command -v "${command_name}" >/dev/null || {
    echo "Missing required command: ${command_name}" >&2
    exit 1
  }
done

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

gcloud storage buckets describe "gs://${plugin_bucket}" >/dev/null

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
  throw new Error("update.json points at an unexpected stable download URL")
}
const digest = crypto.createHash("sha512").update(fs.readFileSync(xpiPath)).digest("hex")
if (update.update_hash !== `sha512:${digest}`) {
  throw new Error("update.json SHA-512 does not match the built XPI")
}
NODE

versioned_xpi="gs://${plugin_bucket}/plugin/v${version}/zotero-geyi.xpi"
stable_xpi="gs://${plugin_bucket}/plugin/zotero-geyi.xpi"
stable_manifest="gs://${plugin_bucket}/plugin/update.json"
public_base="https://storage.googleapis.com/${plugin_bucket}/plugin"

if [[ "${dry_run}" == true ]]; then
  echo "Dry run: would upload v${version} to gs://${plugin_bucket}/plugin/."
  exit 0
fi

# 先上传不可变版本与稳定 XPI，最后替换更新清单，避免客户端先读到悬空版本。
gcloud storage cp \
  --content-type="application/x-xpinstall" \
  --content-disposition='attachment; filename="zotero-geyi.xpi"' \
  --cache-control="public,max-age=31536000,immutable" \
  "${xpi_path}" "${versioned_xpi}"
gcloud storage cp \
  --content-type="application/x-xpinstall" \
  --content-disposition='attachment; filename="zotero-geyi.xpi"' \
  --cache-control="public,max-age=300" \
  "${xpi_path}" "${stable_xpi}"
gcloud storage cp \
  --content-type="application/json" \
  --cache-control="no-cache,max-age=0" \
  "${update_path}" "${stable_manifest}"

node --input-type=module - "${public_base}" "${version}" <<'NODE'
import crypto from "node:crypto"

const [, , publicBase, expectedVersion] = process.argv
const [manifestResponse, xpiResponse] = await Promise.all([
  fetch(`${publicBase}/update.json`, { cache: "no-store" }),
  fetch(`${publicBase}/zotero-geyi.xpi`, { cache: "no-store" }),
])
if (!manifestResponse.ok || !xpiResponse.ok) {
  throw new Error(`GCS verification failed: manifest=${manifestResponse.status}, xpi=${xpiResponse.status}`)
}
const manifest = await manifestResponse.json()
const update = manifest.addons?.["geyi-zotero-translator@geyi.net"]?.updates?.[0]
const xpi = Buffer.from(await xpiResponse.arrayBuffer())
const digest = crypto.createHash("sha512").update(xpi).digest("hex")
if (update?.version !== expectedVersion || update?.update_hash !== `sha512:${digest}`) {
  throw new Error("Published GCS manifest and XPI do not match")
}
NODE

echo "Published Zotero plugin v${version} to GCS."
