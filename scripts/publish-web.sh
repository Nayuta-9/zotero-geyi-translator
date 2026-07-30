#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
plugin_repo="$(cd "${script_dir}/.." && pwd)"
plugin_bucket="${GEYI_PLUGIN_BUCKET:-immersive-translator-plugin-releases}"
dry_run=false
resume_upload=false
force_republish_reason=""

usage() {
  cat <<'USAGE'
Usage: npm run publish:web -- [--dry-run] [--bucket NAME]
                             [--resume-upload]
                             [--force-republish REASON]

GEYI-428 的两个逃生口刻意分成两个粒度,不要合并成一个 --force:

  --resume-upload
      仅绕过「v{version}/ 已存在」这道存在性闸,用于上传中途失败后重跑。
      绕过后**强制**校验远端已有字节与本次构建逐字一致,不一致即中止 ——
      所以它不能用来偷偷换掉一个已发布版本的内容。

  --force-republish REASON
      仅绕过「同版本号不同内容」这道远端比对闸,必须带非空原因串(会打进
      日志)。用于确实需要以同版本号覆盖的运维场景。它**不**绕过存在性闸。

为什么必须分开:同源码重打的 xpi sha512 会变(scaffold 用 adm-zip,zip 条目
时间戳取打包时刻,跨过 2 秒粒度即变),所以「版本与内容都相同→幂等放行」这
条路走不通,重跑必然撞上远端比对闸。若把两道闸用一个 --force 一起绕开,
「中断重跑」和「同号换内容」就再也分不出来了 —— 而后者正是本票要防的事故。
USAGE
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
    --resume-upload)
      resume_upload=true
      shift
      ;;
    --force-republish)
      [[ $# -ge 2 && -n "$2" ]] || {
        echo "--force-republish 必须带非空原因串。" >&2
        exit 2
      }
      force_republish_reason="$2"
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

# 四道闸的排序原则:纯本地检查(闸 1、2)在最前,只需 git 与 package.json,
# 毫秒级;要构建产物的(闸 3、4 需要 xpi 的 sha512)才放到 build 之后。不合格
# 的发布不该先烧掉几十秒的 test + build。
version="$(node -p "require('./package.json').version")"

# ── 闸 1/4:版本单调(GEYI-428 项③)────────────────────────────────────────
# 动了 src/ 或 addon/ 就必须 bump。
node scripts/check-release-version.mjs

# ── 闸 2/4:tag 闸(GEYI-428 项②)─────────────────────────────────────────
# 要求 HEAD 已被 v${version} 指向,把 GCS 产物与 GitHub Release 绑死在同一个
# commit 上。否则「GCS 上是 A、Release 里是 B、都叫 v0.10.2」无从分辨。
#
# 操作提示:`npm version patch` 会产生一个本地提交,此时 HEAD ≠ origin/main,
# 上面 :53-57 的同步检查会**先**失败。正确顺序是
#   npm version patch && git push --follow-tags
# 推完再跑 publish:web。
head_sha="$(git -C "${plugin_repo}" rev-parse HEAD)"
tag_sha="$(git -C "${plugin_repo}" rev-parse "v${version}^{commit}" 2>/dev/null || true)"
if [[ -z "${tag_sha}" ]]; then
  echo "✗ tag 闸失败:找不到 tag v${version}。" >&2
  echo "  先打 tag 并推送:npm version patch && git push --follow-tags" >&2
  exit 1
fi
if [[ "${head_sha}" != "${tag_sha}" ]]; then
  echo "✗ tag 闸失败:v${version} 指向 ${tag_sha:0:12},而 HEAD 是 ${head_sha:0:12}。" >&2
  echo "  GCS 产物必须与 tag 指向同一 commit,否则与 GitHub Release 对不上号。" >&2
  exit 1
fi

npm test
npm run build
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

# ── 闸 3/4:远端比对(GEYI-428 项①)───────────────────────────────────────
# 原有的两组校验(:74-92 构建后、:120-138 上传后回读)比较对象**全部取自本次
# 构建**,因此恒真:改了 src 却不 bump 也能全程绿灯,线上被覆盖成「同版本号、
# 不同内容」。Zotero 只在版本号严格变大时升级,于是修复永远到不了用户手上。
# 这道闸是唯一拿**线上现状**当比较对象的检查。
#
# 直接 `gcloud storage cat` 读桶,不走 https 公网入口 —— 后者可能命中 CDN
# 缓存,读到的不是桶里的真实现状。
remote_manifest="$(gcloud storage cat "${stable_manifest}" 2>/dev/null || true)"
if [[ -z "${remote_manifest}" ]]; then
  echo "闸 3/4 远端比对:远端尚无 update.json(首次发布),放行。"
else
  printf '%s' "${remote_manifest}" | node - \
    "${xpi_path}" "${version}" "${force_republish_reason}" <<'NODE'
const crypto = require("node:crypto")
const fs = require("node:fs")

const [, , xpiPath, localVersion, forceReason] = process.argv
const remote = JSON.parse(fs.readFileSync(0, "utf8"))
const update =
  remote.addons?.["geyi-zotero-translator@geyi.net"]?.updates?.[0] ?? {}
const localHash =
  "sha512:" +
  crypto.createHash("sha512").update(fs.readFileSync(xpiPath)).digest("hex")

if (update.version !== localVersion) {
  console.log(
    `闸 3/4 远端比对:远端 v${update.version} ≠ 本次 v${localVersion},属正常 bump,放行。`,
  )
  process.exit(0)
}
if (update.update_hash === localHash) {
  // 理论不可达:scaffold 用 adm-zip,zip 条目时间戳取打包时刻,同源码跨 2 秒
  // 粒度重打 sha512 即变。真走到这里说明构建已可复现,是好事,放行。
  console.log("闸 3/4 远端比对:远端版本与内容均与本次一致,幂等放行。")
  process.exit(0)
}
if (forceReason) {
  console.warn(
    `闸 3/4 远端比对:**已用 --force-republish 绕过**。原因:${forceReason}\n` +
      `  远端 hash ${String(update.update_hash).slice(0, 24)}…\n` +
      `  本次 hash ${localHash.slice(0, 24)}…`,
  )
  process.exit(0)
}
console.error(
  `✗ 闸 3/4 远端比对失败:线上已是 v${localVersion},但内容与本次构建不同。\n` +
    `  远端 hash ${String(update.update_hash).slice(0, 24)}…\n` +
    `  本次 hash ${localHash.slice(0, 24)}…\n` +
    `  Zotero 只在版本号严格变大时升级,同号换内容 = 用户永远收不到这次改动。\n` +
    `  正常做法:npm version patch && git push --follow-tags,然后重跑。\n` +
    `  若确实要以同版本号覆盖:--force-republish "<原因>"。\n` +
    `  若只是上一次上传中断要续传:--resume-upload(它会强校验字节一致)。`,
)
process.exit(1)
NODE
fi

# ── 闸 4/4:存在性(GEYI-428 项④)─────────────────────────────────────────
# `plugin/v{version}/` 是归档路径,带一年 immutable 缓存,被覆盖后不回源 ——
# 也就是说覆盖它造成的损害无法靠清缓存挽回。存在即拒。
#
# 只用 `objects describe` 判定,不用 `--if-generation-match=0`:后者只兜并发
# 写,且其 `0` 语义在本链路未实测,拿不准的东西不进主闸。
if gcloud storage objects describe "${versioned_xpi}" >/dev/null 2>&1; then
  if [[ "${resume_upload}" == false ]]; then
    echo "✗ 闸 4/4 存在性失败:${versioned_xpi} 已存在。" >&2
    echo "  该路径带一年 immutable 缓存,覆盖后不回源,损害无法靠清缓存挽回。" >&2
    echo "  若是上一次上传中断要续传:--resume-upload(会强校验远端字节与本次一致)。" >&2
    exit 1
  fi
  # --resume-upload 的代价:必须证明远端已有字节与本次构建逐字相同,否则它就
  # 退化成一个能偷换已发布版本的后门。
  echo "闸 4/4 存在性:--resume-upload 已给出,校验远端字节与本次是否一致 ..."
  remote_tmp="$(mktemp)"
  trap 'rm -f "${remote_tmp}"' EXIT
  gcloud storage cp "${versioned_xpi}" "${remote_tmp}" >/dev/null
  node - "${xpi_path}" "${remote_tmp}" <<'NODE'
const crypto = require("node:crypto")
const fs = require("node:fs")
const [, , localPath, remotePath] = process.argv
const h = (p) =>
  crypto.createHash("sha512").update(fs.readFileSync(p)).digest("hex")
const [a, b] = [h(localPath), h(remotePath)]
if (a !== b) {
  console.error(
    "✗ --resume-upload 校验失败:远端已归档的字节与本次构建不一致。\n" +
      `  远端 ${b.slice(0, 24)}…\n  本次 ${a.slice(0, 24)}…\n` +
      "  这不是「中断续传」,而是在换掉一个已发布版本的内容。\n" +
      "  要覆盖请改用 --force-republish \"<原因>\",并明确这会破坏 immutable 归档。",
  )
  process.exit(1)
}
console.log("闸 4/4 存在性:远端字节与本次逐字一致,续传放行。")
NODE
fi

if [[ "${dry_run}" == true ]]; then
  echo "Dry run: would upload v${version} to gs://${plugin_bucket}/plugin/. 四道闸已全部通过。"
  exit 0
fi

# 先上传不可变版本与稳定 XPI，最后替换更新清单，避免客户端先读到悬空版本。
gcloud storage cp \
  --content-type="application/x-xpinstall" \
  --content-disposition='attachment; filename="zotero-geyi.xpi"' \
  --cache-control="public,max-age=31536000,immutable" \
  "${xpi_path}" "${versioned_xpi}"
# GEYI-428 项⑤:stable xpi 从 public,max-age=300 改为 no-cache。
# 那 300 秒窗口里会出现「update.json 已是新版、stable xpi 字节还是旧版」,
# 客户端按新清单的 hash 去校验旧字节,拿到 ERROR_INCORRECT_HASH 后升级直接
# 失败(而不是稍后重试成功)。包只有 ~50KB,每次回源的代价可以忽略。
gcloud storage cp \
  --content-type="application/x-xpinstall" \
  --content-disposition='attachment; filename="zotero-geyi.xpi"' \
  --cache-control="no-cache,max-age=0" \
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
