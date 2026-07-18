// 设置面板加载桥接(GEYI-328)。此文件不被 esbuild 打包,由 preferences pane 的
// scripts 直接加载,在设置窗口作用域运行,把控制权交给 bundle 内的 hooks。
//
// 关键:Zotero 7 的 pane XHTML 是「fragment」,脚本执行时 pane 的 DOM 元素往往还没
// 插入设置窗口 → getElementById 全为 null、文案填不上。故轮询等关键元素出现后再桥接
// (最多 ~3s),而不是只判 readyState/load(那时元素仍可能未就位)。
/* global Zotero, window, document */
(function () {
  var tries = 0;
  function attempt() {
    if (typeof Zotero === "undefined") {
      if (tries++ < 60) setTimeout(attempt, 50);
      return;
    }
    // 以账户状态标签作为「pane 片段已插入」的探针。
    if (document.getElementById("geyi-account-status")) {
      try {
        Zotero.GeyiTranslator &&
          Zotero.GeyiTranslator.hooks &&
          Zotero.GeyiTranslator.hooks.onPrefsLoad &&
          Zotero.GeyiTranslator.hooks.onPrefsLoad(window);
      } catch (e) {
        Zotero.debug("[geyi] prefs pane bridge error: " + e);
      }
      return;
    }
    if (tries++ < 60) setTimeout(attempt, 50);
  }
  attempt();
})();
