class Brainer {
  static async initialize() {
    this.registerListeners();
    await this.refreshTabMenu();
  }

  static registerListeners() {
    let initialized = false;

    // initial set up when first installed
    browser.runtime.onInstalled.addListener(async (details) => {
      const currentWindow = await browser.windows.getCurrent();
      if (await WSPStorageManger.getPrimaryWindowId() == null && await WSPStorageManger.getPrimaryWindowLastId() == null) {
        await WSPStorageManger.setPrimaryWindowId(currentWindow.id);
      }

      const activeWsp = await Brainer.getActiveWsp(currentWindow.id);

      if (!activeWsp && await WSPStorageManger.getPrimaryWindowId() === currentWindow.id) {
        const currentTabs = await browser.tabs.query({windowId: currentWindow.id, pinned: false});
        const wsp = {
          id: Date.now(),
          name: Brainer.generateWspName(),
          active: true,
          tabs: [...currentTabs.map(tab => tab.id)],
          windowId: currentWindow.id
        };

        await Brainer.createWorkspace(wsp);
      }
      initialized = true;
    });

    browser.windows.onCreated.addListener(async (window) => {
      // initial startup
      if (await WSPStorageManger.getPrimaryWindowId() == null && await WSPStorageManger.getPrimaryWindowLastId() == null) {
        await WSPStorageManger.setPrimaryWindowId(window.id);

        const wsp = {
          id: Date.now(),
          name: Brainer.generateWspName(),
          active: true,
          tabs: [],
          windowId: window.id
        };

        await Brainer.createWorkspace(wsp);
        return;
      }

      // browser restart
      if (await WSPStorageManger.getPrimaryWindowId() == null) {
        await WSPStorageManger.setPrimaryWindowId(window.id);
        const newTabs = await browser.tabs.query({windowId: window.id});
        const oldTabs = await WSPStorageManger.getWindowTabIndexMapping();

        const tabIndexMapping = {};
        for (const tab of newTabs) {
          const oldTab = oldTabs.find(t => t.index === tab.index);

          if (oldTab) {
            tabIndexMapping[oldTab.id] = tab.id;
          }
        }

        console.log(tabIndexMapping);

        const oldWindowId = await WSPStorageManger.getPrimaryWindowLastId();
        const workspaces = await WSPStorageManger.getWorkspaces(oldWindowId);

        await WSPStorageManger.destroyWindow(oldWindowId);

        for (const wsp of workspaces) {
          const newWsp = {
            id: wsp.id,
            name: wsp.name,
            active: wsp.active,
            tabs: [],
            groups: wsp.groups,
            windowId: window.id,
            lastActiveTabId: tabIndexMapping[wsp.lastActiveTabId] || null
          };

          for (const tabId of wsp.tabs) {
            if (tabIndexMapping[tabId]) {
              newWsp.tabs.push(tabIndexMapping[tabId]);
            }
          }

          for (const group of newWsp.groups) {
            const oldTabs = group.tabs;
            group.tabs = [];
            for (const tabId of oldTabs) {
              if (tabIndexMapping[tabId]) {
                group.tabs.push(tabIndexMapping[tabId]);
              }
            }
          }

          await Workspace.create(newWsp.id, newWsp);
        }
        await WSPStorageManger.saveWindowTabIndexMapping([]);
        initialized = true;
      }
    });

    browser.windows.onRemoved.addListener(async (windowId) => {
      if (await WSPStorageManger.getPrimaryWindowId() === windowId) {
        await WSPStorageManger.removePrimaryWindowId();
        await WSPStorageManger.setPrimaryWindowLastId(windowId);
        await WSPStorageManger.saveWindowTabIndexMapping(currentTabs);
        initialized = false;
      }
    });

    browser.windows.onFocusChanged.addListener(async (windowId) => {
      if (windowId !== browser.windows.WINDOW_ID_NONE) {
        await this.refreshTabMenu();
      }
    });

    browser.tabs.onCreated.addListener(async (tab) => {
      if (!initialized /*make sure to don't catch up tabs during startup*/ || await WSPStorageManger.getPrimaryWindowId() !== tab.windowId || tab.pinned) {
        return;
      }
      console.debug(`Tab created: #${tab.id}`);

      await Brainer.addTabToWorkspace(tab);
    });

    browser.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
      if (await WSPStorageManger.getPrimaryWindowId() !== removeInfo.windowId) {
        return;
      }
      if (removeInfo.isWindowClosing) {
        return;
      }
      console.debug(`Tab removed: #${tabId}`);

      await Brainer.removeTabFromWorkspace(removeInfo.windowId, tabId);
    });

    browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (await WSPStorageManger.getPrimaryWindowId() !== tab.windowId) {
        return;
      }
      console.debug(`Tab updated (pinned): #${tabId}`);

      if (tab.pinned) {
        await Brainer.removeTabFromWorkspace(tab.windowId, tabId);
      } else {
        await Brainer.addTabToWorkspace(tab);
      }
    }, {properties: ["pinned"]});

    browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (await WSPStorageManger.getPrimaryWindowId() !== tab.windowId) {
        return;
      }
      console.debug(`Tab updated (groupId): #${tabId}`);

      if (!tab.hidden) {
        const activeWsp = await Brainer.getActiveWsp(tab.windowId);
        await activeWsp.updateTabGroups();
      }
    }, {properties: ["groupId"]});

    browser.tabGroups.onUpdated.addListener(async (group) => {
      if (await WSPStorageManger.getPrimaryWindowId() !== group.windowId) {
        return;
      }

      const activeWsp = await Brainer.getActiveWsp(group.windowId);
      if (activeWsp) {
        await activeWsp.updateTabGroups();
      }
    });

  }

  static async addTabToWorkspace(tab) {
    const workspaces = await WSPStorageManger.getWorkspaces(tab.windowId);
    const activeWsp = workspaces.find(wsp => wsp.active);

    // const activeWsp = await Brainer.getActiveWsp(tab.windowId);

    if (activeWsp) {
      if (!workspaces.find(wsp => wsp.tabs.includes(tab.id))) {
        activeWsp.tabs.push(tab.id);
      }
      await activeWsp._saveState();
      await this.refreshTabMenu();
    } else {
      // if there is no active workspace, we create a new one
      const wsp = {
        id: Date.now(),
        name: Brainer.generateWspName(),
        active: true,
        tabs: [tab.id],
        windowId: tab.windowId
      };
      await Brainer.createWorkspace(wsp);
    }
  }

  static async removeTabFromWorkspace(windowId, tabId) {
    const activeWsp = await Brainer.getActiveWsp(windowId);
    const removedTabIdx = activeWsp.tabs.findIndex(tId => tId === tabId);

    if (removedTabIdx >= 0) {
      activeWsp.tabs.splice(removedTabIdx, 1);
      for (const group of activeWsp.groups) {
        const tabIdx = group.tabs.indexOf(tabId);
        if (tabIdx >= 0) {
          group.tabs.splice(tabIdx, 1);
        }
      }
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
  }

  static async initializeTabMenu() {
    const currentWindow = await browser.windows.getCurrent();

    if (await WSPStorageManger.getPrimaryWindowId() !== currentWindow.id) {
      return;
    }

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
    await Brainer.setCurrentWspDisabled(wsp.windowId);

    const w = await Workspace.create(wsp.id, wsp);
    await w.updateTabGroups();

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

  static async setCurrentWspDisabled(windowId) {
    const activeWsp = await Brainer.getActiveWsp(windowId);

    if (activeWsp) {
      activeWsp.active = false;
      activeWsp.lastActiveTabId = (await browser.tabs.query({active: true, currentWindow: true}))[0]?.id || null;
      await activeWsp._saveState();
    }
  }

  static async activateWsp(wspId, windowId, activeTabId = null) {
    // make other workspaces inactive first
    await Brainer.setCurrentWspDisabled(windowId);

    const wsp = await WSPStorageManger.getWorkspace(wspId);
    await wsp.activate(activeTabId);
    await Brainer.hideInactiveWspTabs(wsp.windowId);
    await this.refreshTabMenu();
  }

  static generateWspName() {
    return 'Unnamed Workspace';
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