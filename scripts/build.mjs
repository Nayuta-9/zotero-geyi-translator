// GEYI-431:生产构建入口。**不要**改回 `zotero-plugin build`。
//
// scaffold 的 CLI 入口(node_modules/zotero-plugin-scaffold/dist/cli.mjs)在 main() 第一
// 行就无条件去 registry.npmjs.org 查自己有没有新版本,而那句 `.catch()` 没传处理函数
// (等价于 .catch(undefined),捕不住任何东西)。GitHub Actions 出口 IP 撞上 Cloudflare
// 限流时拿回来的是 HTML 限流页,JSON.parse 抛
// `Unexpected token 'e', "error code: 1015" is not valid JSON`,变成 unhandled
// rejection,Node 直接 exit 1 —— 一个纯装饰性的版本提示把构建整个打挂(run 30315868235)。
//
// 危害不止于 CI 变红:release.yml 跑的正是同一条 `npm run build`,而插件商店
// (syt2/zotero-addons-scraper)只认 GitHub Release,于是「打了 tag 却没产出 Release、
// 商店停在旧版本」会随机发生,且现场只留下一条与构建毫无关系的 JSON 解析错误。
//
// 编程式 API 与 cli.mjs 的 build 分支是同一条代码路径(Config.loadConfig → new
// Build(ctx).run()),产物不变,只是不再经过那个联网的装饰件。构建本身不需要网络。

// GEYI-461:scaffold 用 adm-zip 打包,zip 条目时间戳取**打包时刻**,且它不认
// SOURCE_DATE_EPOCH。于是同一份源码重打出来的 xpi 字节不同、sha512 不同,带来两个
// 实际代价:
//   1. publish-web.sh 的「版本与内容都相同 → 幂等放行」分支永远不可达,上传中断后
//      重跑必然撞上远端比对闸,逃生口只能拆成 --resume-upload / --force-republish
//      两个粒度(GEYI-428)。
//   2. update.json 至今不能挂进 GitHub Release —— CI 与本地各打一次,hash 必然
//      对不上,挂上去只会得到一份自相矛盾的清单(release.yml 的注释)。
// 故在 scaffold 出包之后把所有条目时间戳压成固定值。
//
// 排查提示:验证「构建是否可复现」**必须跨秒测**。zip 用 DOS 时间格式、精度 2 秒,
// 连续跑两次构建极可能落在同一格里、产出逐字节相同的包,给出假阳性。

import { createHash } from "node:crypto"
import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import AdmZip from "adm-zip"

process.env.NODE_ENV = "production"

// 动态 import:必须在 NODE_ENV 落定之后再加载 scaffold,静态 import 会被提升到赋值之前。
const { Build, Config } = await import("zotero-plugin-scaffold")

const ctx = await Config.loadConfig({})
await new Build(ctx).run()

// ── 以下为 GEYI-461 的确定化后处理 ──────────────────────────────────────────

const DIST = "build"

const xpiName = readdirSync(DIST).find((name) => name.endsWith(".xpi"))
if (!xpiName) {
  throw new Error(`${DIST}/ 下找不到 .xpi —— 构建未产出预期产物`)
}
const xpiPath = join(DIST, xpiName)

// zip 纪元起点(DOS 时间格式能表示的最小值)。
//
// **必须用本地时间构造,不能用 Date.UTC** —— zip 的 DOS 时间戳不携带时区,
// adm-zip 的 `header.time` setter 读的是 Date 的本地时间分量(getHours 等)。
// 用 `Date.UTC(1980,0,1)` 的话:本机 UTC+8 存进去是 08:00、CI 的 UTC 存进去是
// 00:00,两边字节不同,hash 照样对不上 —— 实测 47038a8c… vs d05d1928…,这正是
// 本票要消除的差异。用本地时间构造后,任何时区都落在 DOS 值 0x00210000。
//
// 也**不**支持 SOURCE_DATE_EPOCH:它定义为 UTC 秒数,而 DOS 时间戳无时区,
// 二者之间不存在跨时区稳定的映射 —— 支持它只会把刚消掉的时区歧义请回来。
const stamp = new Date(1980, 0, 1, 0, 0, 0)

const zip = new AdmZip(xpiPath)
for (const entry of zip.getEntries()) {
  entry.header.time = stamp
}
zip.writeZip(xpiPath)

// 重打包改了字节 → scaffold 刚写进清单的 update_hash 立即失效。publish-web.sh
// 会比对 update.json 的 sha512 与实际 xpi,不同步就直接失败;update-beta.json 带
// 的是同一个 hash,必须一起更新,漏一个就是一份自相矛盾的清单。
const digest = createHash("sha512").update(readFileSync(xpiPath)).digest("hex")
const manifests = readdirSync(DIST).filter((name) => /^update.*\.json$/.test(name))
for (const name of manifests) {
  const path = join(DIST, name)
  const manifest = JSON.parse(readFileSync(path, "utf8"))
  for (const addon of Object.values(manifest.addons ?? {})) {
    for (const update of addon.updates ?? []) {
      update.update_hash = `sha512:${digest}`
    }
  }
  // 保持 scaffold 的写法:2 空格缩进 + 末尾换行。
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)
}

console.log(
  `[build] GEYI-461 已固定 zip 时间戳(本地 1980-01-01 00:00)并同步 ` +
    `${manifests.length} 份清单 hash → sha512:${digest.slice(0, 16)}…`,
)
