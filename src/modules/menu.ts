/**
 * Registers the right-click context menu item on attachments:
 * "Set as Default Attachment" / "Unset Default Attachment"
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

// Track per-window popup listeners so we can remove them on cleanup
const popupListeners = new WeakMap<Window, () => void>();

export function registerContextMenu(win: Window) {
  const doc = win.document;

  // Idempotent: skip if already registered in this window
  if (doc.getElementById(MENU_ID)) {
    return;
  }

  const itemMenu = doc.getElementById("zotero-itemmenu");
  if (!itemMenu) {
    ztoolkit.log("Could not find zotero-itemmenu");
    return;
  }

  // Create the menu item
  const menuitem = doc.createXULElement("menuitem");
  menuitem.id = MENU_ID;
  menuitem.setAttribute("label", "Set Default");
  menuitem.addEventListener("command", () => onMenuCommand(win));
  itemMenu.appendChild(menuitem);

  // Update visibility/label when the context menu opens, bound to this window
  const listener = () => onPopupShowing(win);
  itemMenu.addEventListener("popupshowing", listener);
  popupListeners.set(win, listener);

  ztoolkit.log("Registered context menu");
}

export function unregisterContextMenu(win: Window) {
  const doc = win.document;
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
    // Access the ZoteroPane from the specific window
    return (win as any).ZoteroPane || Zotero.getActiveZoteroPane();
  } catch {
    return null;
  }
}

function onPopupShowing(win: Window) {
  const doc = win.document;
  const menuitem = doc.getElementById(MENU_ID);
  if (!menuitem) return;

  const selectedItem = getSelectedAttachment(win);
  if (!selectedItem) {
    menuitem.hidden = true;
    return;
  }

  // Check if parent has multiple PDF attachments
  const parent = Zotero.Items.get(selectedItem.parentItemID!);
  if (!parent) {
    menuitem.hidden = true;
    return;
  }

  const attachmentIDs = parent.getAttachments();
  const pdfCount = attachmentIDs.filter((id: number) => {
    const att = Zotero.Items.get(id);
    return att && att.attachmentContentType === "application/pdf";
  }).length;

  if (pdfCount < 2) {
    menuitem.hidden = true;
    return;
  }

  menuitem.hidden = false;

  // Toggle label based on current state
  if (isDefaultAttachment(selectedItem)) {
    menuitem.setAttribute("label", "Unset Default");
  } else {
    menuitem.setAttribute("label", "Set Default");
  }
}

function onMenuCommand(win: Window) {
  const selectedItem = getSelectedAttachment(win);
  if (!selectedItem) return;

  if (isDefaultAttachment(selectedItem)) {
    clearDefaultAttachment(selectedItem.parentItemID!);
    showMessage("Default cleared");
  } else {
    setDefaultAttachment(selectedItem);
    showMessage("Default updated");
  }
}

/**
 * Get the currently selected item if it's a PDF attachment with a parent.
 * Resolves from the specific window, not the global active pane.
 */
function getSelectedAttachment(win: Window): Zotero.Item | null {
  const pane = getZoteroPaneForWindow(win);
  if (!pane) return null;

  const items = pane.getSelectedItems();
  if (items.length !== 1) return null;

  const item = items[0];
  if (!item.isAttachment()) return null;
  if (!item.parentItemID) return null;
  if (item.attachmentContentType !== "application/pdf") return null;

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
