'use strict';

async function initializeDesktop(deps) {
  deps.configureDataPaths();
  deps.registerIpc();
  const mainWindow = deps.createMainWindow();
  await deps.ensureDataDirs();
  await deps.startLocalServer();
  await deps.loadMainPage(mainWindow);
  return mainWindow;
}

module.exports = { initializeDesktop };
