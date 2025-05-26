class Brainer {
  static async initialize() {
    this.registerListeners();
    await this.refreshTabMenu();
  }

  static registerListeners() {
    // initial set up when first installed
    browser.runtime.onInstalled.addListener(async (details) => {
      const currentWindow = await browser.windows.getCurrent();
      const activeWsp = await Brainer.getActiveWsp(currentWindow.id);

      if (!activeWsp) {
        const currentTabs = await browser.tabs.query({ windowId: currentWindow.id });
        const wsp = {
          id: Date.now(),
          name: Brainer.generateWspName(),
          active: true,
          tabs: [...currentTabs.map(tab => tab.id)],
          windowId: currentWindow.id
        };
  
        await Brainer.createWorkspace(wsp);
      }
    });

    // make sure we don't miss an important event of this extension
    browser.runtime.onUpdateAvailable.addListener(async (details) => {
      const currentWindow = await browser.windows.getCurrent();
      const activeWsp = await Brainer.getActiveWsp(currentWindow.id);

      if (!activeWsp) {
        const currentTabs = await browser.tabs.query({ windowId: currentWindow.id });
        const wsp = {
          id: Date.now(),
          name: Brainer.generateWspName(),
          active: true,
          tabs: [...currentTabs.map(tab => tab.id)],
          windowId: currentWindow.id
        };
  
        await Brainer.createWorkspace(wsp);
      }
    });

    browser.windows.onCreated.addListener(async (window) => {
      const wsp = {
        id: Date.now(),
        name: Brainer.generateWspName(),
        active: true,
        tabs: [],
        windowId: window.id
      };

      await Brainer.createWorkspace(wsp);
    });

    // when a window is closed, delete workspaces data associated to this window
    browser.windows.onRemoved.addListener(async (windowId) => {
      // read setting value (fallback to false if no setting)
      const shouldRememberWorkspaces = await WSPStorageManger.readOption('rememberWorkspaces') || false;
      // delete if preference to remember workspaces is not enabled
      if (!shouldRememberWorkspaces) await WSPStorageManger.destroyWindow(windowId);
    });

    browser.windows.onFocusChanged.addListener(async (windowId) => {
      if (windowId !== browser.windows.WINDOW_ID_NONE) {
        await this.refreshTabMenu();
      }
    });

    browser.tabs.onCreated.addListener(async (tab) => {
      const activeWsp = await Brainer.getActiveWsp(tab.windowId);
      
      if (activeWsp) {
        activeWsp.tabs.push(tab.id);
        await activeWsp._saveState();
        await this.refreshTabMenu();
      } else {
        const intervalRef = setInterval(async () => {
          const activeWsp = await Brainer.getActiveWsp(tab.windowId);
          if (activeWsp) {
            clearInterval(intervalRef);
            activeWsp.tabs.push(tab.id);
            await activeWsp._saveState();
            await this.refreshTabMenu();
          }
        }, 100);
      }
    });

    browser.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
      const activeWsp = await Brainer.getActiveWsp(removeInfo.windowId);
      const removedTabIdx = activeWsp.tabs.findIndex(tId => tId === tabId);
      
      if (removedTabIdx >= 0) {
        activeWsp.tabs.splice(removedTabIdx, 1);
        await activeWsp._saveState();
        if (activeWsp.tabs.length === 0) {
          await Brainer.destroyWsp(activeWsp.id);
          const nextWspId = await WSPStorageManger.getNextWspId(activeWsp.windowId);
          if (nextWspId) {
            await Brainer.activateWsp(nextWspId);
          }
        }
        await this.refreshTabMenu();
      }
    });
  }

  static async initializeTabMenu() {
    const currentWindow = await browser.windows.getCurrent();
    const workspaces = await Brainer.getWorkspaces(currentWindow.id);

    const menuId = `ld-wsp-manager-menu-${currentWindow.id}-${Date.now()}-id`;

    browser.menus.create({
      id: menuId,
      title: "Move Tab to Another Workspace",
      enabled: workspaces.length > 1,
      contexts: ["tab"]
    });

    workspaces.sort((a, b) => a.name.localeCompare(b.name));

    let currentWsp = null;

    for (const workspace of workspaces) {
      if (workspace.active) {
        currentWsp = workspace;
      }

      browser.menus.create({
        title: `${workspace.name} (${workspace.tabs.length} tabs)`,
        parentId: menuId,
        id: `sub-menu-${Date.now()}-${workspace.id}-id`,
        enabled: !workspace.active,
        onclick: async (info, tab) => { 
          await Brainer.moveTabToWsp(tab.id, currentWsp.id, workspace.id);
        }
      });
    }
  }

  static async getWorkspaces(windowId) {
    return await Workspace.getWorkspaces(windowId);
  }

  static async createWorkspace(wsp) {
    // make other workspaces inactive first
    const activeWsp = await Brainer.getActiveWsp(wsp.windowId);

    if (activeWsp) {
      activeWsp.active = false;
      await activeWsp._saveState();
    }

    await Workspace.create(wsp.id, wsp);

    await this.refreshTabMenu();
  }

  static async renameWorkspace(wspId, wspName) {
    await Workspace.rename(wspId, wspName);

    await this.refreshTabMenu();
  }

  static async getNumWorkspaces(windowId) {
    return WSPStorageManger.getNumWorkspaces(windowId);
  }

  static async isFirstTimeCreateWsp(windowId) {
    return await WSPStorageManger.isFirstTimeCreateWsp(windowId);
  }

  static async setFirstTimeCreateWspToFalse(windowId) {
    await WSPStorageManger.setFirstTimeCreateWspToFalse(windowId);
  }

  static async hideInactiveWspTabs(windowId) {
    const workspaces = await WSPStorageManger.getWorkspaces(windowId);
    await Promise.all(workspaces.filter(wsp => !wsp.active).map(wsp => wsp.hideTabs()));
  }

  static async getActiveWsp(windowId) {
    const workspaces = await WSPStorageManger.getWorkspaces(windowId);
    const activeWsp = workspaces.find(wsp => wsp.active);
    return activeWsp;
  }

  static async destroyWsp(wspId) {
    const wsp = await WSPStorageManger.getWorkspace(wspId);
    await wsp.destroy();
    await this.refreshTabMenu();
  }

  static async activateWsp(wspId, windowId, activeTabId = null) {
    // make other workspaces inactive first
    const activeWsp = await Brainer.getActiveWsp(windowId);

    if (activeWsp) {
      activeWsp.active = false;
      await activeWsp._saveState();
    }

    const wsp = await WSPStorageManger.getWorkspace(wspId);
    await wsp.activate(activeTabId);
    await Brainer.hideInactiveWspTabs(wsp.windowId);
    await this.refreshTabMenu();
  }

  static generateWspName() {
    return Util.generateWspName(6);
  }

  static async refreshTabMenu() {
    await browser.menus.removeAll();
    await Brainer.initializeTabMenu();
  }

  static async moveTabToWsp(tabId, fromWspId, toWspId) {
    const fromWsp = await WSPStorageManger.getWorkspace(fromWspId);
    const toWsp = await WSPStorageManger.getWorkspace(toWspId);

    // add movedTabId to the toWsp workspace
    toWsp.tabs.unshift(tabId);
    toWsp._saveState();

    const movedTabIdx = fromWsp.tabs.findIndex(tId => tId === tabId);

    if (movedTabIdx >= 0) {
      fromWsp.tabs.splice(movedTabIdx, 1);
      await fromWsp._saveState();
      if (fromWsp.tabs.length === 0) {
        await Brainer.destroyWsp(fromWspId);
      }
      await Brainer.activateWsp(toWspId, toWsp.windowId, tabId);
    }

    await this.refreshTabMenu();
  }
}

(async () => {
  await Brainer.initialize();
})();