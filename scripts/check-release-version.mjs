#!/usr/bin/env node
// GEYI-428:发布口的版本单调闸 —— 动了插件代码就必须 bump 版本。
//
// 为什么需要它:Zotero 只在版本号**严格变大**时才升级,同号不同 hash 直接
// 跳过。而 `v{version}/` 归档路径带一年 immutable 缓存,被覆盖后不回源。所以
// 「改了 src 却不 bump 就发布」的症状是「已修已发但线上仍复现」,且现场毫无
// 线索 —— publish-web.sh 原有的两组校验比较对象全部取自本次构建,恒真。
//
// 判据用 `src/` + `addon/` 而非全仓 diff:GEYI-399 那三个提交只改
// workflow/README,不该被逼着 bump 出一堆无意义的版本号。
//
// 挂载点只有两个**发布**口:release.yml 与 `npm run publish:web`。
// **不要**挂 build.yml —— 本仓直推 main、一天多次提交,在每次构建上强制
// 版本单调只会逼出无意义的版本膨胀和绕闸习惯。

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8" }).trim()

const fail = (msg) => {
  console.error(`✗ 版本单调闸失败:${msg}`)
  process.exit(1)
}

// Shallow clone 看不到历史 tag,基线会解析失败并「误判放行」——这是 fail-open,
// 必须挡住。CI 侧对应 actions/checkout 的 fetch-depth: 0 + fetch-tags: true。
if (git("rev-parse", "--is-shallow-repository") === "true") {
  fail(
    "仓库是 shallow clone,拿不到历史 tag,无法建立版本基线。\n" +
      "  CI 请给 actions/checkout 配 fetch-depth: 0 与 fetch-tags: true。",
  )
}

const version = JSON.parse(readFileSync("package.json", "utf8")).version

// 基线的选取要区分两种状态,否则闸会恒放行:
//
// 发布态(HEAD 已被 v{version} 指向 —— publish-web.sh 的 tag 闸与 release.yml
// 的 tag 触发都保证了这一点):此时 `git describe` 返回的是**当前这个 tag 自己**,
// diff 自然恒为空,闸形同不存在。基线必须取它**之前**的那个 tag。
//
// 开发态(HEAD 尚未打 tag):`git describe` 返回最近的历史 tag,正是要的基线。
const headTags = git("tag", "--points-at", "HEAD", "--list", "v*")
const anchor = headTags ? `${headTags.split("\n")[0]}^` : "HEAD"

let baseTag
try {
  baseTag = git("describe", "--tags", "--abbrev=0", "--match", "v*", anchor)
} catch {
  // 没有更早的 v* tag = 这是第一个版本,没有基线可比,放行。
  console.log(`✓ 无更早的 v* tag(首次发布),跳过版本单调检查。当前 v${version}`)
  process.exit(0)
}

// 只看插件实际产物涉及的路径。空 diff = 这次发布不含代码变更(改文档/CI),
// 不要求 bump。
const changed = git("diff", "--name-only", `${baseTag}..HEAD`, "--", "src", "addon")

if (!changed) {
  console.log(
    `✓ ${baseTag}..HEAD 未触及 src/ 或 addon/,不要求 bump。当前 v${version}`,
  )
  process.exit(0)
}

const parse = (v) => {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v)
  if (!m) fail(`无法解析版本号 "${v}"`)
  return m.slice(1, 4).map(Number)
}

const cmp = (a, b) => {
  const [x, y] = [parse(a), parse(b)]
  for (let i = 0; i < 3; i += 1) {
    if (x[i] !== y[i]) return x[i] - y[i]
  }
  return 0
}

if (cmp(version, baseTag) <= 0) {
  const files = changed.split("\n").slice(0, 10)
  fail(
    `${baseTag}..HEAD 改了插件代码,但 package.json 仍是 v${version}` +
      `(未大于基线 ${baseTag})。\n` +
      `  Zotero 只在版本号严格变大时才升级,同号发布会让「已修已发」的改动` +
      `永远到不了用户手上。\n` +
      `  先 bump:npm version patch\n` +
      `  改动文件(前 ${files.length} 个):\n` +
      files.map((f) => `    ${f}`).join("\n"),
  )
}

console.log(
  `✓ ${baseTag}..HEAD 含插件代码变更,且 v${version} > ${baseTag},版本单调成立。`,
)
