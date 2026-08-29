import { createZToolkit } from "./utils/ztoolkit";
import {
  patchGetBestAttachment,
  unpatchGetBestAttachment,
} from "./modules/default-attachment";
import { registerContextMenu, unregisterContextMenu } from "./modules/menu";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  patchGetBestAttachment();

  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: "Default Attachment",
    image: rootURI + "content/icons/set_default_48.png",
  });

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();
  registerContextMenu(win);
}

async function onMainWindowUnload(win: Window): Promise<void> {
  unregisterContextMenu(win);
  ztoolkit.unregisterAll();
}

function onShutdown(): void {
  for (const win of Zotero.getMainWindows()) {
    unregisterContextMenu(win);
  }

  unpatchGetBestAttachment();
  ztoolkit.unregisterAll();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
};
