/** جسر شاشة الزبون: استقبال تحديثات المجموع من العملية الرئيسية. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('customerAPI', {
  onUpdate: (cb) => ipcRenderer.on('cd-update', (_e, payload) => cb(payload)),
});
