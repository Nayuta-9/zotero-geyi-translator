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

process.env.NODE_ENV = "production"

// 动态 import:必须在 NODE_ENV 落定之后再加载 scaffold,静态 import 会被提升到赋值之前。
const { Build, Config } = await import("zotero-plugin-scaffold")

const ctx = await Config.loadConfig({})
await new Build(ctx).run()
