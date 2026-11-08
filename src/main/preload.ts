import { contextBridge, ipcRenderer } from 'electron';
import type { Api } from '../shared/types';

const on = (ch: string) => (cb: (v: any) => void) => {
  const h = (_e: unknown, v: any) => cb(v);
  ipcRenderer.on(ch, h);
  return () => { ipcRenderer.removeListener(ch, h); };
};

const api: Api = {
  init: () => ipcRenderer.invoke('init'),
  act: (a) => ipcRenderer.invoke('act', a),
  setPaused: (p) => ipcRenderer.invoke('pause', p),
  setSettings: (p) => ipcRenderer.invoke('settings', p),
  exportSave: () => ipcRenderer.invoke('export'),
  importSave: () => ipcRenderer.invoke('import'),
  newChronicle: () => ipcRenderer.invoke('new-chronicle'),
  openBattle: () => ipcRenderer.invoke('open-battle'),
  quit: () => ipcRenderer.invoke('quit'),
  reseed: () => ipcRenderer.invoke('reseed'),
  photo: () => ipcRenderer.invoke('photo'),
  onSnapshot: on('snapshot'),
  onSummary: on('summary'),
  onFocus: on('focus'),
  desktop: {
    init: () => ipcRenderer.invoke('desk:init'),
    setRegions: (r) => ipcRenderer.send('desk:regions', r),
    openManager: () => ipcRenderer.send('desk:open-manager'),
    saveNest: (p) => ipcRenderer.send('desk:nest', p),
    onModel: on('desk:model'),
    onNotice: on('desk:notice'),
    onVisible: on('desk:visible'),
    onCursor: on('desk:cursor'),
    alive: () => ipcRenderer.send('desk:alive'),
    onRecheck: on('desk:recheck'),
    onHuman: on('desk:human'),
    pet: (id) => ipcRenderer.invoke('desk:pet', id),
    bounty: () => ipcRenderer.invoke('desk:bounty'),
    defend: () => ipcRenderer.invoke('desk:defend'),
  },
};

contextBridge.exposeInMainWorld('api', api);
