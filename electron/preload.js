/**
 * جسر آمن بين الواجهة وعملية Electron الرئيسية.
 * وجود window.electronAPI يُستخدم أيضاً لكشف بيئة Electron (انظر src/lib/env.ts).
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * طباعة صامتة: HTML + الارتفاع المقاس (px) + خيارات اختيارية
   * { widthMicrons, heightMicrons, kind } لمقاسات مخصّصة (ملصقات 40×20mm…).
   */
  printReceipt: (html, height, extra) =>
    ipcRenderer.send('print-receipt', { html, height, ...(extra || {}) }),

  /** شاشة الزبون (الشاشة الثانية): { idle:true } أو { idle:false, total:'1600.00' }. */
  customerDisplay: (payload) => ipcRenderer.send('cd-update', payload || { idle: true }),

  isElectron: true,
});
