class WSPStorageManger {
  static async getWspState(wspId) {
    const key = `ld-wsp-${wspId}`;
    const results = await browser.storage.local.get(key);

    return results[key] || {};
  }

  static async saveWspState(wspId, state) {
    const key = `ld-wsp-${wspId}`;
    await browser.storage.local.set({
      [key]: state
    });
  }

  static async deleteWspState(wspId) {
    const key = `ld-wsp-${wspId}`;
    await browser.storage.local.remove(key);
  }

  static async getWorkspaces(windowId) {
    const key = `ld-wsp-window-${windowId}`;
    const results = await browser.storage.local.get(key);

    const wspIds = results[key] || [];

    return await Promise.all(wspIds.map(async wspId => {
      const state = await WSPStorageManger.getWspState(wspId);
      return new Workspace(wspId, state);
    }));
  }

  static async getWorkspace(wspId) {
    const state = await WSPStorageManger.getWspState(wspId);
    return new Workspace(wspId, state);
  }

  static async getNumWorkspaces(windowId) {
    const key = `ld-wsp-window-${windowId}`;
    const results = await browser.storage.local.get(key);
    return (results[key] || []).length;
  }

  static async addWsp(wspId, windowId) {
    const key = `ld-wsp-window-${windowId}`;
    const results = await browser.storage.local.get(key);
    const wspIds = results[key] || [];
    if (!wspIds.includes(wspId)) {
      wspIds.push(wspId);
      await browser.storage.local.set({
        [key]: wspIds
      });
    }
  }

  static async removeWsp(wspId, windowId) {
    const key = `ld-wsp-window-${windowId}`;
    const results = await browser.storage.local.get(key);
    const wspIds = results[key] || [];

    const idx = wspIds.findIndex(id => id == wspId);

    wspIds.splice(idx, 1);

    await browser.storage.local.set({
      [key]: wspIds
    });
  }

  // delete data (window id and associated tabs) associated to window
  static async destroyWindow(windowId) {
    const key = `ld-wsp-window-${windowId}`;
    const results = await browser.storage.local.get(key);
    const wspIds = results[key] || [];

    // 1. delete window-id: [array of associated workspaces ids] from local storage
    await browser.storage.local.remove(key);

    // 2. delete all workspace-ids: [array of tabs] associated with that window from local storage
    await Promise.all(wspIds.map(WSPStorageManger.deleteWspState));

    await browser.storage.local.remove(`${key}-first-wsp-creation`);
  }

  static async getNextWspId(windowId) {
    const key = `ld-wsp-window-${windowId}`;
    const results = await browser.storage.local.get(key);
    const wspIds = results[key] || [];

    return wspIds[0];
  }

  static async getPrimaryWindowId() {
    const key = `primary-window-id`;
    const result = await browser.storage.local.get(key);
    return result[key];
  }

  static async setPrimaryWindowId(windowId) {
    const key = `primary-window-id`;
    await browser.storage.local.set({[key]: windowId});
  }

  static async removePrimaryWindowId() {
    const key = `primary-window-id`;
    await browser.storage.local.remove(key);
  }

  static async getPrimaryWindowLastId() {
    const key = `primary-window-last-id`;
    const result = await browser.storage.local.get(key);
    return result[key];
  }

  static async setPrimaryWindowLastId(windowId) {
    const key = `primary-window-last-id`;
    await browser.storage.local.set({[key]: windowId});
  }

  static async getWindowTabIndexMapping() {
    const key = `primary-window-tab-index-mapping`;
    const results = await browser.storage.local.get(key);

    return results[key] || {};
  }

  static async saveWindowTabIndexMapping(mapping) {
    const key = `primary-window-tab-index-mapping`;
    await browser.storage.local.set({
      [key]: mapping
    });
  }

}