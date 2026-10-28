/**
 * Stores the preferred default attachment, either as a tag on the child
 * (syncs) or in local prefs, and patches getBestAttachment to honor it.
 */

const PREF_PREFIX = "extensions.zotero.defaultattachment";
const PREF_MAPPINGS = `${PREF_PREFIX}.mappings`;

let originalGetBestAttachment: ((...args: any[]) => any) | null = null;
let patchedWrapper: ((...args: any[]) => any) | null = null;

function useTag(): boolean {
  return Zotero.Prefs.get(`${PREF_PREFIX}.useTag`, true) !== false;
}

function markerTag(): string {
  const name = String(
    Zotero.Prefs.get(`${PREF_PREFIX}.tagName`, true) ?? "",
  ).trim();
  return name || "default-attach";
}

function getMappings(): Record<string, number> {
  try {
    const raw = Zotero.Prefs.get(PREF_MAPPINGS, true) as string;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    ztoolkit.log("Failed to parse default attachment mappings", e);
  }
  return {};
}

function saveMappings(mappings: Record<string, number>) {
  Zotero.Prefs.set(PREF_MAPPINGS, JSON.stringify(mappings), true);
}

function getPreferredAttachment(parent: Zotero.Item): Zotero.Item | null {
  if (useTag()) {
    const tag = markerTag();
    for (const id of parent.getAttachments()) {
      const att = Zotero.Items.get(id);
      if (att && !att.deleted && att.hasTag(tag) && att.isFileAttachment()) {
        return att;
      }
    }
    return null;
  }

  const id = getMappings()[String(parent.id)];
  if (!id) return null;
  const att = Zotero.Items.get(id);
  if (att && !att.deleted && att.parentItemID === parent.id) {
    return att;
  }
  return null;
}

export async function setDefaultAttachment(attachmentItem: Zotero.Item) {
  const parentID = attachmentItem.parentItemID;
  if (!parentID) return;

  const parent = Zotero.Items.get(parentID);
  if (!parent) return;

  if (useTag()) {
    const tag = markerTag();
    for (const id of parent.getAttachments()) {
      if (id === attachmentItem.id) continue;
      const sib = Zotero.Items.get(id);
      if (sib && sib.hasTag(tag)) {
        sib.removeTag(tag);
        await sib.saveTx({ skipDateModifiedUpdate: true });
      }
    }
    if (!attachmentItem.hasTag(tag)) {
      attachmentItem.addTag(tag, 1);
      await attachmentItem.saveTx({ skipDateModifiedUpdate: true });
    }
    return;
  }

  const mappings = getMappings();
  mappings[String(parentID)] = attachmentItem.id;
  saveMappings(mappings);
}

export async function clearDefaultAttachment(parentItemID: number) {
  const parent = Zotero.Items.get(parentItemID);
  if (useTag()) {
    if (!parent) return;
    const tag = markerTag();
    for (const id of parent.getAttachments()) {
      const att = Zotero.Items.get(id);
      if (att && att.hasTag(tag)) {
        att.removeTag(tag);
        await att.saveTx({ skipDateModifiedUpdate: true });
      }
    }
    return;
  }

  const mappings = getMappings();
  delete mappings[String(parentItemID)];
  saveMappings(mappings);
}

export function isDefaultAttachment(attachmentItem: Zotero.Item): boolean {
  const parentID = attachmentItem.parentItemID;
  if (!parentID) return false;
  const parent = Zotero.Items.get(parentID);
  if (!parent) return false;
  return getPreferredAttachment(parent)?.id === attachmentItem.id;
}

export function patchGetBestAttachment() {
  const proto = Zotero.Item.prototype as any;

  if (patchedWrapper && proto.getBestAttachment === patchedWrapper) {
    return;
  }

  const original = proto.getBestAttachment;
  originalGetBestAttachment = original;

  const wrapper = async function (this: Zotero.Item, ...args: any[]) {
    if (!this.isRegularItem()) {
      return original.apply(this, args);
    }

    const preferred = getPreferredAttachment(this);
    if (preferred) {
      return preferred;
    }

    return original.apply(this, args);
  };

  proto.getBestAttachment = wrapper;
  patchedWrapper = wrapper;
}

export function unpatchGetBestAttachment() {
  if (!originalGetBestAttachment || !patchedWrapper) {
    return;
  }

  const proto = Zotero.Item.prototype as any;
  if (proto.getBestAttachment === patchedWrapper) {
    proto.getBestAttachment = originalGetBestAttachment;
  }

  originalGetBestAttachment = null;
  patchedWrapper = null;
}
