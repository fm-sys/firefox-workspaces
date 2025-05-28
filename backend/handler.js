if (browser) {
  browser.runtime.onMessage.addListener(async message => {
    switch (message.action) {
      case "getWorkspaces":
        return await Brainer.getWorkspaces(message.windowId);
      case "createWorkspace":
        await Brainer.createWorkspace(message);
        break;
      case "renameWorkspace":
        await Brainer.renameWorkspace(message.wspId, message.wspName);
        break;
      case "getNumWorkspaces":
        return await Brainer.getNumWorkspaces(message.windowId);
      case "isFirstTimeCreateWsp":
        return await Brainer.isFirstTimeCreateWsp(message.windowId);
      case "setFirstTimeCreateWspToFalse":
        await Brainer.setFirstTimeCreateWspToFalse(message.windowId);
        break;
      case "hideInactiveWspTabs":
        await Brainer.hideInactiveWspTabs(message.windowId);
        break;
      case "destroyWsp":
        await Brainer.destroyWsp(message.wspId);
        break;
      case "activateWorkspace":
        await Brainer.activateWsp(message.wspId, message.windowId);
        break;
      case "getWorkspaceName":
        return Brainer.generateWspName();
        break;
      case "getPrimaryWindowId":
        return await WSPStorageManger.getPrimaryWindowId();
    }
  });
}