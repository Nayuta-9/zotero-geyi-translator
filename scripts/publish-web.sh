#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
plugin_repo="$(cd "${script_dir}/.." && pwd)"
# GEYI-894:发布目标从专用桶 geyi-translator-plugin-releases 改成前端静态桶。
# 换桶的理由与插件无关 —— 项目的 backend bucket 配额是 3 个且已满、提额被自动
# 拒,而前端要给 /assets/* 单开一个 FORCE_CACHE_ALL 的 backend bucket 才能让
# Cloud CDN 真正命中,槽位只能从插件这边腾。对象键 `plugin/…` 一字未动,对外
# URL 仍是 https://www.geyi.net/plugin/…,`/plugin/*` 改由前端 backend bucket 服务。
#
# 前端发布脚本(geyi-frontend 仓 scripts/deploy-static.sh)会把「不在本次构建
# 产物里」的对象当陈旧对象删掉,所以它那边先加了 `plugin/` 前缀保护,本仓传上去
# 的东西不会被前端发版清掉。改这个默认值前先确认那道保护还在。
#
# 老桶 geyi-translator-plugin-releases 作为回滚件保留到 GEYI-894 结案 30 天后,
# 里面的 9 个对象与新桶逐字节相同。要回去只需把这个默认值改回来。
plugin_bucket="${GEYI_PLUGIN_BUCKET:-geyi-frontend-static}"
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
      绕过后**强制**校验远端已有字节与本次待发产物逐字一致,不一致即中止 ——
      所以它不能用来偷偷换掉一个已发布版本的内容。

  --force-republish REASON
      仅绕过「同版本号不同内容」这道远端比对闸,必须带非空原因串(会打进
      日志)。用于确实需要以同版本号覆盖的运维场景。它**不**绕过存在性闸。

为什么分开而不合并成一个 --force:两者要区分的是「中断重跑」与「同号换内容」,
后者正是 GEYI-428 要防的事故。合并之后这两件事就再也分不出来了。

GEYI-461 之后的现状:构建已可复现(build.mjs 把 zip 条目时间戳压成固定值),
所以同源码重跑会命中闸3 的「版本与内容都相同→幂等放行」分支,**常规的中断
重跑已经不需要 --resume-upload**。它保留下来覆盖两类残留情况:
  - 部分失败(update.json 传成功、xpi 传失败)导致远端处于不一致的中间态;
  - 依赖树变动等原因让产物字节确实变了,但你已确认那是同一份发布内容。
两种情况下它的强字节校验都仍是有价值的护栏,不要因为「幂等分支可达了」就删掉。
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

# GEYI-675 起多了 gh:网页端要发的产物**直接取自 GitHub Release**,不再本地重打一份。
# 临时文件统一收口。bash 的 `trap ... EXIT` 是**替换**而非追加:本脚本原先在两处
# 各装了一个 EXIT trap,后装的把先装的顶掉,于是 remote_manifest_file 每跑一次就
# 在 /tmp 里留一份。改成一张清单 + 一个 trap,新增临时路径只要 _tmp+=(…)。
_tmp=()
_cleanup() {
  if [[ ${#_tmp[@]} -gt 0 ]]; then rm -rf "${_tmp[@]}"; fi
}
trap _cleanup EXIT

for command_name in git npm node gcloud gh; do
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
# 必须用 `--verify --quiet`:裸 `rev-parse <不存在的 ref>` 会把原字符串**回显**
# 出来(而不是返回空),于是下面的 -z 判空永远不成立,报错会变成
# 「v0.99.0 指向 v0.99.0^{com…」这种误导性输出。
tag_sha="$(git -C "${plugin_repo}" rev-parse --verify --quiet "v${version}^{commit}" 2>/dev/null || true)"
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

# ── 产物来源:GitHub Release(GEYI-675)──────────────────────────────────────
# 这里**不再 `npm run build`**。原先是本地重打一份传 GCS,而 CI 另打一份挂
# Release —— 于是同一个 commit、同一个版本号,两个分发渠道的 xpi 字节不同。
#
# 实测(v0.10.3 与 v0.10.4 都是这样):解包后 `diff -rq` 零差异,17 个文件、
# 216659 字节、时间戳都是 GEYI-461 钉死的 1980-01-01,**内容逐字一致**;差的只是
# zip 容器 —— 同样的输入,CI(node 24)把 bootstrap.js 压成 783 字节,本机
# (node 26.3)压成 772。adm-zip 走 Node 自带的 zlib,而 zlib 的 deflate 输出随
# Node 大版本变化。GEYI-461 把**时间戳**定死了,但没管**压缩器**;release.yml 里
# 那句「同一 commit 在 CI 与本地产出逐字节相同」少了一个前提:还得同一个 Node。
#
# 修法不是去追平工具链(钉 Node 大版本只是把概率压小:zlib 也可能随小版本变,
# 而且它要求每个发版的人都装对版本),而是**取消第二次构建** —— 网页端与插件
# 商店从此发的是同一个文件,字节一致成为构造上的事实,不再是一条需要维护的承诺。
#
# 顺带修好的两处:
#   * `--resume-upload` 的强字节校验此前会被工具链差异误伤,现在天然幂等;
#   * 闸 3 的「版本与内容都相同 → 幂等放行」分支同理,重跑必然命中。
#
# 代价与取舍:发布因此依赖 release workflow 已跑完(它由 push tag 触发,约 35 秒)。
# 这个耦合本来就在 —— 闸 2 已经要求 tag 存在,而插件商店本就只认 Release。
# Release 还没出来就发,等于把一份「没人见过的字节」推给自动更新通道,不如等。
release_dir="$(mktemp -d)"
_tmp+=("${release_dir}")
if ! gh release download "v${version}" --dir "${release_dir}" \
  --pattern "geyi-translator.xpi" --pattern "update.json" 2>/dev/null; then
  echo "✗ 取产物失败:GitHub Release v${version} 不存在,或缺少 xpi / update.json。" >&2
  echo "  tag 推上去后 release workflow 约 35 秒出 Release,先确认它跑完:" >&2
  echo "    gh run list --workflow=release.yml --limit 1" >&2
  echo "  网页端与插件商店必须发同一份字节,所以这里不再本地重打一份兜底。" >&2
  exit 1
fi
xpi_path="${release_dir}/geyi-translator.xpi"
update_path="${release_dir}/update.json"

[[ -s "${xpi_path}" && -s "${update_path}" ]] || {
  echo "GitHub Release v${version} 的产物为空。" >&2
  exit 1
}
echo "产物取自 GitHub Release v${version}(与插件商店同一份字节)。"

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
# 桶已私有(geyi-trans 组织禁公开读),对外分发走 www.geyi.net/plugin/*(入口
# 负载均衡直挂私有桶,由 backend bucket geyi-frontend-bucket 服务)。终验因此改走
# 真实用户入口 —— 不只验桶,连路由/缓存头一起验。stable 两件都带 no-cache,读到的
# 就是刚上传的字节;那一层是 USE_ORIGIN_HEADERS,不会替它们改缓存头。
public_base="https://www.geyi.net/plugin"

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
  # GEYI-653:远端 manifest 必须经**临时文件 + argv** 传进去,不能走 stdin。
  # `node -` 从 stdin 读**程序**,而 heredoc 也占 stdin —— 两者互斥:bash 按左到右
  # 应用重定向,heredoc 排在管道之后所以它赢,node 拿到的程序是对的,而随后
  # readFileSync(0) 再读 stdin 时已 EOF、得到空串,JSON.parse("") 必抛。
  # 于是这道闸从 6bd7627(2026-07-30)加上起就恒炸,只是上一次发布(2026-07-28)
  # 早于它、没人撞到过。紧邻的「本地校验」那段一直是好的,因为它就是经 argv 传路径。
  remote_manifest_file="$(mktemp)"
  _tmp+=("${remote_manifest_file}")
  printf '%s' "${remote_manifest}" >"${remote_manifest_file}"
  node - "${xpi_path}" "${version}" "${force_republish_reason}" \
    "${remote_manifest_file}" <<'NODE'
const crypto = require("node:crypto")
const fs = require("node:fs")

const [, , xpiPath, localVersion, forceReason, remotePath] = process.argv
const remote = JSON.parse(fs.readFileSync(remotePath, "utf8"))
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
  // 这是**正常路径**:GEYI-675 起产物直接取自 Release,同一个版本号重跑取到的
  // 永远是同一份字节,于是上传中断后直接重跑即可,不需要任何逃生口。
  // (GEYI-461 之前 zip 时间戳取打包时刻、461 之后仍受 Node 版本影响,这个分支
  //  都不稳定可达;取消第二次构建之后它才真正成为常态。)
  console.log("闸 3/4 远端比对:远端版本与内容均与本次一致,幂等放行(可安全重跑)。")
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
  `✗ 闸 3/4 远端比对失败:线上已是 v${localVersion},但内容与本次待发产物不同。\n` +
    `  远端 hash ${String(update.update_hash).slice(0, 24)}…\n` +
    `  本次 hash ${localHash.slice(0, 24)}…\n` +
    `  Zotero 只在版本号严格变大时升级,同号换内容 = 用户永远收不到这次改动。\n` +
    `  正常做法:npm version patch && git push --follow-tags,然后重跑。\n` +
    `  注:GEYI-675 起产物直接取自 Release,同一版本号重跑取到的是同一份字节,本应\n` +
    `  命中上面的幂等分支。走到这里说明该 tag 的 Release 被重新产出过(删了重发 /\n` +
    `  改了 tag 指向),或线上这份是更早以别的方式传上去的。\n` +
    `  若确实要以同版本号覆盖:--force-republish "<原因>"。\n` +
    `  若远端处于部分失败的中间态:--resume-upload(它会强校验字节一致)。`,
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
  # --resume-upload 的代价:必须证明远端已有字节与本次待发产物逐字相同,否则它就
  # 退化成一个能偷换已发布版本的后门。
  echo "闸 4/4 存在性:--resume-upload 已给出,校验远端字节与本次是否一致 ..."
  remote_tmp="$(mktemp)"
  _tmp+=("${remote_tmp}")
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
    "✗ --resume-upload 校验失败:远端已归档的字节与本次待发产物不一致。\n" +
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
