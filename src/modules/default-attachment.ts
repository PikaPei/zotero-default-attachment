/**
 * Core module: stores and retrieves the user's preferred default attachment
 * for items with multiple PDF attachments, and monkey-patches
 * Zotero.Item.prototype.getBestAttachment to respect that preference.
 */

const PREF_KEY = "extensions.zotero.defaultattachment.mappings";

// References for safe patching/unpatching
let originalGetBestAttachment: ((...args: any[]) => any) | null = null;
let patchedWrapper: ((...args: any[]) => any) | null = null;

/**
 * Get the stored mapping of parentItemID -> attachmentItemID.
 */
function getMappings(): Record<string, number> {
  try {
    const raw = Zotero.Prefs.get(PREF_KEY, true) as string;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
      ztoolkit.log("Invalid mappings format, resetting");
    }
  } catch (e) {
    ztoolkit.log("Failed to parse default attachment mappings", e);
  }
  return {};
}

/**
 * Save the mapping of parentItemID -> attachmentItemID.
 */
function saveMappings(mappings: Record<string, number>) {
  Zotero.Prefs.set(PREF_KEY, JSON.stringify(mappings), true);
}

/**
 * Set an attachment as the default for its parent item.
 */
export function setDefaultAttachment(attachmentItem: Zotero.Item) {
  const parentID = attachmentItem.parentItemID;
  if (!parentID) {
    ztoolkit.log("Attachment has no parent item");
    return;
  }

  const mappings = getMappings();
  mappings[String(parentID)] = attachmentItem.id;
  saveMappings(mappings);

  ztoolkit.log(
    `Set default attachment: parent=${parentID}, attachment=${attachmentItem.id}`,
  );
}

/**
 * Clear the default attachment for a parent item.
 */
export function clearDefaultAttachment(parentItemID: number) {
  const mappings = getMappings();
  delete mappings[String(parentItemID)];
  saveMappings(mappings);
}

/**
 * Get the stored default attachment ID for a parent item, or null if none set.
 */
export function getDefaultAttachmentID(
  parentItemID: number,
): number | null {
  const mappings = getMappings();
  const id = mappings[String(parentItemID)];
  return id ?? null;
}

/**
 * Check if a given attachment is the default for its parent.
 */
export function isDefaultAttachment(attachmentItem: Zotero.Item): boolean {
  const parentID = attachmentItem.parentItemID;
  if (!parentID) return false;
  return getDefaultAttachmentID(parentID) === attachmentItem.id;
}

/**
 * Monkey-patch Zotero.Item.prototype.getBestAttachment to respect our
 * stored preference. Falls back to original behavior if no preference is set
 * or if the preferred attachment no longer exists.
 *
 * Idempotent: safe to call multiple times.
 */
export function patchGetBestAttachment() {
  const proto = Zotero.Item.prototype as any;

  // Guard: don't double-patch
  if (patchedWrapper && proto.getBestAttachment === patchedWrapper) {
    return;
  }

  // Capture the current (original) method in a local const so the closure
  // always refers to the true original, even if this function runs again.
  const original = proto.getBestAttachment;
  originalGetBestAttachment = original;

  const wrapper = async function (this: Zotero.Item, ...args: any[]) {
    // Only applies to regular (non-attachment) items
    if (!this.isRegularItem()) {
      return original.apply(this, args);
    }

    const preferredID = getDefaultAttachmentID(this.id);
    if (preferredID) {
      try {
        const item = await Zotero.Items.getAsync(preferredID);
        if (item && !item.deleted && item.parentItemID === this.id) {
          return item;
        }
        // Attachment is confirmed missing, deleted, or wrong parent — clean up
        if (!item || item.deleted || item.parentItemID !== this.id) {
          clearDefaultAttachment(this.id);
        }
      } catch (e) {
        // Transient error — log but don't clear the stored preference
        ztoolkit.log("Failed to get preferred attachment, falling back", e);
      }
    }

    return original.apply(this, args);
  };

  proto.getBestAttachment = wrapper;
  patchedWrapper = wrapper;

  ztoolkit.log("Patched getBestAttachment");
}

/**
 * Restore the original getBestAttachment on shutdown.
 * Only restores if our wrapper is still the active method — avoids
 * clobbering another plugin that patched after us.
 */
export function unpatchGetBestAttachment() {
  if (!originalGetBestAttachment || !patchedWrapper) {
    return;
  }

  const proto = Zotero.Item.prototype as any;
  if (proto.getBestAttachment === patchedWrapper) {
    proto.getBestAttachment = originalGetBestAttachment;
    ztoolkit.log("Restored original getBestAttachment");
  } else {
    ztoolkit.log(
      "getBestAttachment was modified by another plugin after us, skipping restore",
    );
  }

  originalGetBestAttachment = null;
  patchedWrapper = null;
}
