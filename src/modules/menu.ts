/**
 * Registers the right-click context menu item on attachments:
 * "Set Default" / "Unset Default"
 *
 * Uses direct DOM manipulation for reliability across toolkit versions.
 * Handlers are bound per-window to avoid multi-window issues.
 */

import {
  setDefaultAttachment,
  isDefaultAttachment,
  clearDefaultAttachment,
} from "./default-attachment";
import { config } from "../../package.json";

const MENU_ID = `${config.addonRef}-set-default-menuitem`;
const SEP_ID = `${config.addonRef}-separator`;

const popupListeners = new WeakMap<Window, () => void>();

export function registerContextMenu(win: Window) {
  const doc = win.document;

  if (doc.getElementById(MENU_ID)) {
    return;
  }

  const itemMenu = doc.getElementById("zotero-itemmenu");
  if (!itemMenu) {
    ztoolkit.log("Could not find zotero-itemmenu");
    return;
  }

  const separator = doc.createXULElement("menuseparator");
  separator.id = SEP_ID;
  itemMenu.appendChild(separator);

  const menuitem = doc.createXULElement("menuitem");
  menuitem.id = MENU_ID;
  menuitem.setAttribute("label", "Set Default");
  menuitem.addEventListener("command", () => onMenuCommand(win));
  itemMenu.appendChild(menuitem);

  const listener = () => onPopupShowing(win);
  itemMenu.addEventListener("popupshowing", listener);
  popupListeners.set(win, listener);

  ztoolkit.log("Registered context menu");
}

export function unregisterContextMenu(win: Window) {
  const doc = win.document;
  const separator = doc.getElementById(SEP_ID);
  if (separator) {
    separator.remove();
  }
  const menuitem = doc.getElementById(MENU_ID);
  if (menuitem) {
    menuitem.remove();
  }

  const itemMenu = doc.getElementById("zotero-itemmenu");
  const listener = popupListeners.get(win);
  if (itemMenu && listener) {
    itemMenu.removeEventListener("popupshowing", listener);
    popupListeners.delete(win);
  }
}

function getZoteroPaneForWindow(
  win: Window,
): ReturnType<typeof Zotero.getActiveZoteroPane> | null {
  try {
    return (win as any).ZoteroPane || Zotero.getActiveZoteroPane();
  } catch {
    return null;
  }
}

function setMenuVisible(doc: Document, visible: boolean) {
  const menuitem = doc.getElementById(MENU_ID);
  const sep = doc.getElementById(SEP_ID);
  if (menuitem) (menuitem as any).hidden = !visible;
  if (sep) (sep as any).hidden = !visible;
}

function onPopupShowing(win: Window) {
  const doc = win.document;
  const menuitem = doc.getElementById(MENU_ID);
  if (!menuitem) return;

  const selectedItem = getSelectedAttachment(win);
  if (!selectedItem || !selectedItem.parentItemID) {
    setMenuVisible(doc, false);
    return;
  }

  const parent = Zotero.Items.get(selectedItem.parentItemID);
  if (!parent) {
    setMenuVisible(doc, false);
    return;
  }

  const fileCount = parent.getAttachments().filter((id: number) => {
    const att = Zotero.Items.get(id);
    return att && att.isFileAttachment();
  }).length;

  if (fileCount < 2) {
    setMenuVisible(doc, false);
    return;
  }

  setMenuVisible(doc, true);

  if (isDefaultAttachment(selectedItem)) {
    menuitem.setAttribute("label", "Unset Default");
  } else {
    menuitem.setAttribute("label", "Set Default");
  }
}

async function onMenuCommand(win: Window) {
  const selectedItem = getSelectedAttachment(win);
  if (!selectedItem || !selectedItem.parentItemID) return;

  if (isDefaultAttachment(selectedItem)) {
    await clearDefaultAttachment(selectedItem.parentItemID);
    showMessage("Default cleared");
  } else {
    await setDefaultAttachment(selectedItem);
    showMessage("Default updated");
  }
}

function getSelectedAttachment(win: Window): Zotero.Item | null {
  const pane = getZoteroPaneForWindow(win);
  if (!pane) return null;

  const items = pane.getSelectedItems();
  if (items.length !== 1) return null;

  const item = items[0];
  if (!item.isAttachment() || !item.parentItemID) return null;
  if (!item.isFileAttachment()) return null;

  return item;
}

function showMessage(msg: string) {
  new ztoolkit.ProgressWindow(addon.data.config.addonName, {
    closeOnClick: true,
    closeTime: 3000,
  })
    .createLine({ text: msg, type: "default" })
    .show();
}
