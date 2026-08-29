# Zotero Default Attachment

A Zotero plugin that lets you choose which file opens when you double-click an item with multiple attachments.

Compatible with Zotero 7–10.

## How It Works

1. Expand an item that has multiple file attachments
2. Right-click the file you want as the default
3. Click **Set Default**

![context menu](docs/screenshot.png)

To undo, right-click the same file and click **Unset Default**.

By default the choice is stored as an automatic tag `default-attach` on the chosen file, so it syncs with the library. Double-click then opens that file instead of Zotero's usual pick (oldest PDF, then URL match). Linked URLs cannot be set as default.

In **Settings → Default Attachment** you can change the tag name, or turn tags off to keep the tag list clean. With tags off, the choice is stored only on this computer.
