import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// GEYI-675 的回归网。
//
// 事故形态:同一个 commit、同一个版本号,两个分发渠道的 xpi **字节不同** ——
// 插件商店拿 CI 打的那份,网页端(自动更新)拿本地重打的那份。实测 v0.10.3 与
// v0.10.4 都是这样:解包后 `diff -rq` 零差异、内容逐字一致,差的只是 zip 容器。
// adm-zip 走 Node 自带的 zlib,而 deflate 输出随 Node 大版本变化(node 24 把
// bootstrap.js 压成 783 字节,node 26.3 压成 772)。GEYI-461 把时间戳定死了,
// 但没管压缩器。
//
// 修法不是去追平工具链,而是**取消第二次构建**:publish-web.sh 直接把 GitHub
// Release 上那份 xpi + update.json 传 GCS。字节一致于是成为构造上的事实,而不是
// 一条需要靠「大家都装同一个 Node」来维持的承诺。
//
// 这张网钉的就是「别把第二次构建加回来」,以及那条新出现的跨文件耦合:
// release.yml 挂的两个 asset 现在是网页端发布链路的**输入**。

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8")

const PUBLISH = read("./publish-web.sh")
const RELEASE_YML = read("../.github/workflows/release.yml")

// 只看代码,不看散文。脚本里有大段解释历史的注释与 usage 文本,里面必然出现
// `--force`、`_tmp+=(` 这类字样 —— 拿全文做断言会被自己的注释绊倒,还得靠改注释
// 来让测试变绿。(写这张网时就先踩了一次。)
const PUBLISH_CODE = PUBLISH.split("\n")
  .filter((line) => !line.trim().startsWith("#"))
  .join("\n")

describe("网页端发布用的是 Release 的字节,不再本地重打(GEYI-675)", () => {
  it("发布脚本不再自己构建一份产物", () => {
    // 只要这行回来,两个渠道立刻又会各打各的。
    expect(PUBLISH_CODE).not.toMatch(/^\s*npm run build\s*$/m)
    expect(PUBLISH_CODE).not.toContain("build/geyi-translator.xpi")
  })

  it("产物取自 GitHub Release,且上传的就是取下来的那两个文件", () => {
    expect(PUBLISH_CODE).toContain("gh release download")
    // 上传路径必须指向下载目录 —— 指回 build/ 就等于修了个寂寞。
    expect(PUBLISH_CODE).toContain('xpi_path="${release_dir}/geyi-translator.xpi"')
    expect(PUBLISH_CODE).toContain('update_path="${release_dir}/update.json"')
  })

  it("gh 进了必需命令表", () => {
    // 少了它,脚本会在下载那步才炸,而那时 npm test 已经跑完了。
    expect(PUBLISH_CODE).toMatch(/for command_name in .*\bgh\b.*; do/)
  })

  it("Release 不存在时直接失败,不悄悄回落到本地构建", () => {
    // 回落 = 把一份没人见过的字节推给自动更新通道,正是本票要消除的东西。
    expect(PUBLISH).toContain("gh run list --workflow=release.yml")
    expect(PUBLISH).toMatch(/Release v\$\{version\} 不存在/)
  })
})

describe("release.yml 的两个 asset 现在是发布链路的输入(GEYI-675)", () => {
  it("Release 必须同时挂 xpi 与 update.json", () => {
    // publish-web.sh 两个都要下。少挂一个,网页端发布直接断链。
    expect(RELEASE_YML).toContain("build/geyi-translator.xpi")
    expect(RELEASE_YML).toContain("build/update.json")
  })

  it("两条链路仍由同一条 npm run build 产出(GEYI-431 那道闸不受本票影响)", () => {
    expect(RELEASE_YML).toContain("npm run build")
  })
})

describe("四道闸一条没少(GEYI-428 / GEYI-653)", () => {
  // 本票动的是「产物从哪来」,不该顺手动闸。四道闸各自有事故背书,
  // 重构里少掉一道不会有任何症状 —— 直到下一次事故。
  it.each([
    ["闸 1 版本单调", "node scripts/check-release-version.mjs"],
    ["闸 2 tag 绑定", "tag 闸失败"],
    ["闸 3 远端比对", "闸 3/4 远端比对"],
    ["闸 4 存在性", "闸 4/4 存在性"],
  ])("%s 还在", (_name, marker) => {
    expect(PUBLISH).toContain(marker)
  })

  it("两个逃生口仍是分开的两个粒度,没被合成一个 --force", () => {
    // 断言的是 case 的**分支**,不是 usage 里那段解释为什么不合并的话。
    expect(PUBLISH_CODE).toMatch(/^\s+--resume-upload\)/m)
    expect(PUBLISH_CODE).toMatch(/^\s+--force-republish\)/m)
    expect(PUBLISH_CODE).not.toMatch(/^\s+--force\)/m)
  })

  it("远端 manifest 仍走临时文件 + argv,没被改回 stdin(GEYI-653)", () => {
    // `node -` 从 stdin 读程序,heredoc 也占 stdin —— 两者互斥,改回去这道闸恒炸。
    expect(PUBLISH_CODE).toContain('_tmp+=("${remote_manifest_file}")')
    expect(PUBLISH_CODE).toMatch(/node - .*"\$\{remote_manifest_file\}"/s)
  })
})

describe("临时文件收口(GEYI-675 顺手修的)", () => {
  it("只有一个 EXIT trap,清理走一张清单", () => {
    // bash 的 trap 是**替换**不是追加:原先两处各装一个 EXIT trap,后装的把先装的
    // 顶掉,remote_manifest_file 于是每跑一次就在 /tmp 里留一份。
    const traps = PUBLISH_CODE.match(/^\s*trap\s/gm) ?? []
    expect(traps).toHaveLength(1)
    expect(PUBLISH_CODE).toContain("trap _cleanup EXIT")
    // 每个临时路径都要登记进清单,否则等于没清。
    const mktemps = PUBLISH_CODE.match(/\$\(mktemp[^)]*\)/g) ?? []
    const registered = PUBLISH_CODE.match(/_tmp\+=\(/g) ?? []
    expect(mktemps.length).toBeGreaterThan(0)
    expect(registered).toHaveLength(mktemps.length)
  })
})
