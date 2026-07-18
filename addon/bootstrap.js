/**
 * Zotero 7 插件 bootstrap(GEYI-328)。生命周期由 Zotero 直接调用:
 * install / startup / onMainWindowLoad / onMainWindowUnload / shutdown / uninstall。
 * 注册 chrome://geyi/content/ 后加载打包出的主脚本,再把生命周期转交 hooks。
 */

/* global Components, Services, Zotero, APP_SHUTDOWN */

var chromeHandle;

function install(_data, _reason) {}

async function startup({ id, version, resourceURI, rootURI }, _reason) {
  await Zotero.initializationPromise;

  rootURI = rootURI || resourceURI.spec;

  const aomStartup = Components.classes[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(Components.interfaces.amIAddonManagerStartup);
  const manifestURI = Services.io.newURI(rootURI + "manifest.json");
  chromeHandle = aomStartup.registerChrome(manifestURI, [
    ["content", "__addonRef__", rootURI + "content/"],
  ]);

  const ctx = { rootURI, id, version };
  Services.scriptloader.loadSubScript(
    `${rootURI}content/scripts/__addonRef__.js`,
    ctx,
  );

  Zotero.__addonInstance__?.hooks.onStartup();
}

function onMainWindowLoad({ window }, _reason) {
  Zotero.__addonInstance__?.hooks.onMainWindowLoad(window);
}

function onMainWindowUnload({ window }, _reason) {
  Zotero.__addonInstance__?.hooks.onMainWindowUnload(window);
}

function shutdown({ id: _id }, reason) {
  if (reason === APP_SHUTDOWN) return;
  try {
    Zotero.__addonInstance__?.hooks.onShutdown();
  } catch (e) {
    Zotero.debug(`[geyi] shutdown hook error: ${e}`);
  }
  chromeHandle?.destruct();
  chromeHandle = null;
}

function uninstall(_data, _reason) {}
