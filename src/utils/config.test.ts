import { describe, expect, it } from "vitest"
import pkg from "../../package.json"
import { config } from "./config"

// GEYI-424 的回归网。这几条断言在「版本号从 package.json 派生」的写法下恒真 ——
// 它们的作用不是发现今天的 bug,而是把「有人又抄一份手写版本号回来」变成红测。
//
// 事故原文:config.ts 里手写 version: "0.9.0",自建仓起就没跟过 package.json。
// 插件列表读 manifest(正确),而设置页「关于」与 UA / X-Geyi-Client 读 config —— 于是
// 发多少次新包,用户看到的版本号都是 0.9.0。这条链上的三份副本必须收敛到一个源。
//
// npm test 已被 scripts/publish-web.sh 与 .github/workflows/release.yml 调用,
// 所以这张网天然接在两条发布链上。

describe("插件版本号只有 package.json 一个来源(GEYI-424)", () => {
  it("config.version 与 package.json 严格相等", () => {
    expect(config.version).toBe(pkg.version)
  })

  it("UA 由同一个版本号派生,不是另抄的字面量", () => {
    expect(config.userAgent).toBe(`GeyiZoteroPlugin/${pkg.version}`)
  })

  it("版本号不是空串或占位符", () => {
    expect(config.version).toMatch(/^\d+\.\d+\.\d+/)
  })
})
