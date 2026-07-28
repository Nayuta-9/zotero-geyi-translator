import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import pkg from "../package.json"

// GEYI-431 的回归网。断言在当前写法下恒真 —— 它的作用不是发现今天的 bug,而是把
// 「有人把 build 改回 zotero-plugin CLI」变成红测。
//
// 事故原文:CLI 入口无条件联网查自身新版本且 .catch() 没传处理函数,撞上 npm registry
// 的 Cloudflare 限流页就 unhandled rejection → exit 1。因为 release.yml 跑的是同一条
// `npm run build`,而插件商店只认 GitHub Release,后果是「打了 tag 却随机不出 Release」。
// 构建不需要网络,这条闸就是把这件事钉死。

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8")

describe("生产构建不经 scaffold 的 CLI 入口(GEYI-431)", () => {
  it("build 脚本走 scripts/build.mjs,不调 zotero-plugin CLI", () => {
    expect(pkg.scripts.build).toContain("node scripts/build.mjs")
    expect(pkg.scripts.build).not.toMatch(/\bzotero-plugin\s+build\b/)
  })

  it("build.mjs 用编程式 API,不 import cli 子路径", () => {
    const source = read("./build.mjs")
    expect(source).toContain(`import("zotero-plugin-scaffold")`)
    expect(source).not.toContain("zotero-plugin-scaffold/cli")
  })

  it("两条 CI 链路都经由 npm run build,不绕过这道闸", () => {
    for (const workflow of ["../.github/workflows/build.yml", "../.github/workflows/release.yml"]) {
      const source = read(workflow)
      expect(source).toContain("npm run build")
      expect(source).not.toMatch(/\bnpx?\s+zotero-plugin\s+build\b/)
    }
  })
})
