const { contextBridge, ipcRenderer } = require('electron');
const hasNativeWindowControls = process.platform === 'win32';

const desktopApi = {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  getWindowState: () => ipcRenderer.invoke('window:get-state'),
  setTheme: theme => ipcRenderer.invoke('window:set-theme', theme),
  close: () => ipcRenderer.invoke('window:close'),
  openDataDir: () => ipcRenderer.invoke('app:open-data-dir'),
  getInfo: () => ipcRenderer.invoke('app:get-info')
};

contextBridge.exposeInMainWorld('bangumiDesktop', desktopApi);

function syncWindowCornerMode(maximized) {
  document.documentElement.classList.toggle('bangumi-window-maximized', !!maximized);
}

async function syncWindowCornerModeFromHost() {
  try {
    const state = await desktopApi.getWindowState();
    syncWindowCornerMode(state?.maximized);
  } catch {}
}

let lastWindowTheme = '';

function syncWindowThemeFromDocument(force = false) {
  if (!hasNativeWindowControls) return;
  const theme = document.documentElement.getAttribute('data-theme');
  if (theme !== 'light' && theme !== 'dark') return;
  if (!force && theme === lastWindowTheme) return;
  lastWindowTheme = theme;
  desktopApi.setTheme(theme).catch(() => {
    if (lastWindowTheme === theme) lastWindowTheme = '';
  });
}

function watchWindowTheme() {
  syncWindowThemeFromDocument(true);
  if (!hasNativeWindowControls) return;
  const observer = new MutationObserver(() => syncWindowThemeFromDocument());
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

ipcRenderer.on('window:state', (_event, state) => syncWindowCornerMode(state?.maximized));

const POINTER_TILT_ENTRY_SELECTOR = [
  '.chronicle-event',
  '.chronicle-blog-row',
  '.chronicle-index-row',
  '.chronicle-directory-row',
  '.chronicle-list-row',
  '.chronicle-otd-card',
  '.chronicle-mini-index',
  '.chronicle-related-chip',
  '.chronicle-preview-card'
].join(',');

const POINTER_TILT_COVER_SELECTOR = [
  '.chronicle-event-cover',
  '.chronicle-blog-thumb',
  '.chronicle-mosaic',
  '.chronicle-extra-image',
  '.chronicle-otd-cover',
  '.chronicle-related-chip img',
  '.chronicle-preview-cover'
].join(',');

function installPointerCoverTilt() {
  if (document.getElementById('bangumi-pointer-cover-tilt-style')) return;

  const scopedCoverSelectors = POINTER_TILT_COVER_SELECTOR
    .split(',')
    .map(selector => `html:not(.bangumi-offline-export) ${selector}`)
    .join(',');
  const style = document.createElement('style');
  style.id = 'bangumi-pointer-cover-tilt-style';
  style.textContent = `
    ${scopedCoverSelectors} {
      transform-origin: center center;
      backface-visibility: hidden;
      transition: transform .28s cubic-bezier(.22,1,.36,1), box-shadow .2s ease;
    }
    html:not(.bangumi-offline-export) .bv-pointer-cover-tilting {
      transform: perspective(760px) rotateX(var(--bv-cover-rx,0deg)) rotateY(var(--bv-cover-ry,0deg)) translateY(-2px) scale(1.035) translateZ(0) !important;
      transform-style: preserve-3d;
      will-change: transform;
      transition: transform .075s linear, box-shadow .2s ease !important;
    }
    html[data-motion="soft"]:not(.bangumi-offline-export) .bv-pointer-cover-tilting {
      transform: perspective(760px) rotateX(var(--bv-cover-rx,0deg)) rotateY(var(--bv-cover-ry,0deg)) translateY(-1px) scale(1.018) translateZ(0) !important;
    }
    html[data-motion="off"]:not(.bangumi-offline-export) .bv-pointer-cover-tilting {
      transform: none !important;
      will-change: auto;
    }
    @media (prefers-reduced-motion: reduce) {
      html:not(.bangumi-offline-export) .bv-pointer-cover-tilting {
        transform: none !important;
        transition: none !important;
        will-change: auto;
      }
    }
  `;
  document.head.appendChild(style);

  const root = document.documentElement;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let active = null;
  let pending = null;
  let frame = 0;

  const resetActive = () => {
    pending = null;
    if (!active) return;
    active.cover.classList.remove('bv-pointer-cover-tilting');
    active.cover.style.removeProperty('--bv-cover-rx');
    active.cover.style.removeProperty('--bv-cover-ry');
    active = null;
  };

  const resolveTiltTarget = target => {
    const entry = target?.closest?.(POINTER_TILT_ENTRY_SELECTOR);
    if (!entry) return null;
    const cover = entry.querySelector(POINTER_TILT_COVER_SELECTOR);
    return cover ? { entry, cover } : null;
  };

  const applyTilt = () => {
    frame = 0;
    const next = pending;
    pending = null;
    if (!next || !next.cover.isConnected) return;
    next.cover.style.setProperty('--bv-cover-rx', next.rx.toFixed(2) + 'deg');
    next.cover.style.setProperty('--bv-cover-ry', next.ry.toFixed(2) + 'deg');
    next.cover.classList.add('bv-pointer-cover-tilting');
  };

  const queueTilt = event => {
    if ((event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') || root.dataset.motion === 'off' || reducedMotion?.matches) {
      resetActive();
      return;
    }
    const next = resolveTiltTarget(event.target);
    if (!next) {
      resetActive();
      return;
    }
    if (active?.cover !== next.cover) resetActive();
    active = next;
    const rect = next.entry.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const px = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const py = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    const strength = root.dataset.motion === 'soft' ? .42 : 1;
    pending = {
      cover: next.cover,
      rx: (.5 - py) * 9 * strength,
      ry: (px - .5) * 10.5 * strength
    };
    if (!frame) frame = requestAnimationFrame(applyTilt);
  };

  document.addEventListener('pointerover', queueTilt, { passive: true });
  document.addEventListener('pointermove', queueTilt, { passive: true });
  document.addEventListener('pointerout', event => {
    if (active?.entry.contains(event.relatedTarget)) return;
    resetActive();
  }, { passive: true });
  document.addEventListener('pointercancel', resetActive, { passive: true });
  window.addEventListener('blur', resetActive);
  reducedMotion?.addEventListener?.('change', event => { if (event.matches) resetActive(); });
  new MutationObserver(() => { if (root.dataset.motion === 'off') resetActive(); })
    .observe(root, { attributes: true, attributeFilter: ['data-motion'] });
}

function injectDesktopTitlebar() {
  if (document.getElementById('bangumi-desktop-titlebar')) return;
  document.title = 'Bangumi 保管库';

  const style = document.createElement('style');
  style.textContent = `
    :root { --desktop-titlebar-height: 36px; }
    html.bangumi-desktop-shell body {
      padding-top: 0 !important;
      background-color: transparent !important;
    }
    html.bangumi-desktop-shell .app {
      height: 100vh !important;
      padding-top: calc(18px + var(--desktop-titlebar-height)) !important;
    }
    html.bangumi-native-controls #bangumi-desktop-titlebar { right: 154px; }
    html.bangumi-native-controls #bangumi-desktop-titlebar .desktop-actions { padding: 4px 0; }
    html.bangumi-native-controls #bangumi-desktop-titlebar .desktop-actions .min,
    html.bangumi-native-controls #bangumi-desktop-titlebar .desktop-actions .max,
    html.bangumi-native-controls #bangumi-desktop-titlebar .desktop-actions .close { display: none; }
    #bangumi-desktop-titlebar {
      position: fixed;
      inset: 0 0 auto 0;
      height: var(--desktop-titlebar-height);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: rgba(247,243,255,.92);
      background: transparent;
      border: 0;
      box-shadow: none;
      user-select: none;
      -webkit-app-region: drag;
      font: 13px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
      pointer-events: auto;
    }
    #bangumi-desktop-titlebar::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -1;
      background: linear-gradient(180deg, rgba(16,17,26,.34), rgba(16,17,26,.08) 72%, transparent);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      opacity: .58;
      pointer-events: none;
    }
    [data-theme="light"] #bangumi-desktop-titlebar { color: rgba(36,32,51,.90); }
    [data-theme="light"] #bangumi-desktop-titlebar::before {
      background: linear-gradient(180deg, rgba(246,244,251,.55), rgba(246,244,251,.12) 72%, transparent);
      opacity: .72;
    }
    #bangumi-desktop-titlebar .desktop-left {
      height: 100%;
      display: flex;
      align-items: center;
      gap: 9px;
      padding-left: 12px;
      min-width: 0;
    }
    #bangumi-desktop-titlebar .desktop-logo {
      width: 23px;
      height: 23px;
      border-radius: 9px;
      display: grid;
      place-items: center;
      overflow: hidden;
      color: #ff6cb8;
      background: linear-gradient(135deg, rgba(255,255,255,.92), rgba(255,241,248,.74));
      border: 1px solid rgba(255,255,255,.46);
      box-shadow: 0 8px 22px rgba(255,126,182,.24), inset 0 1px 0 rgba(255,255,255,.78);
      flex: none;
    }
    #bangumi-desktop-titlebar .desktop-logo svg {
      width: 17px;
      height: 17px;
      display: block;
      filter: drop-shadow(0 2px 5px rgba(240,145,153,.22));
    }
    #bangumi-desktop-titlebar .desktop-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 760;
      letter-spacing: -.02em;
      text-shadow: 0 1px 14px rgba(0,0,0,.26);
    }
    #bangumi-desktop-titlebar .desktop-actions {
      height: 100%;
      display: flex;
      align-items: stretch;
      padding: 4px 12px 4px 0;
      -webkit-app-region: no-drag;
    }
    #bangumi-desktop-titlebar button {
      min-width: 42px;
      height: 28px;
      border: 0;
      color: currentColor;
      background: transparent;
      cursor: default;
      font: inherit;
      border-radius: 0;
      opacity: .84;
      display: grid;
      place-items: center;
      transition: background .16s ease, opacity .16s ease, color .16s ease;
    }
    #bangumi-desktop-titlebar button:hover {
      opacity: 1;
      background: rgba(255,255,255,.12);
    }
    #bangumi-desktop-titlebar button.close:hover { background: #ef4444; color: white; }
    #bangumi-desktop-titlebar .window-glyph {
      width: 13px;
      height: 13px;
      display: block;
      stroke: currentColor;
      stroke-width: 1.85;
      fill: none;
      vector-effect: non-scaling-stroke;
      shape-rendering: geometricPrecision;
    }
    #bangumi-desktop-titlebar .close .window-glyph {
      width: 15px;
      height: 15px;
      stroke-width: 2.15;
    }
    #bangumi-desktop-titlebar button.data-dir {
      width: auto;
      min-width: 0;
      padding: 0 11px;
      margin-right: 2px;
      color: rgba(216,209,238,.84);
      font-size: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    [data-theme="light"] #bangumi-desktop-titlebar button.data-dir { color: rgba(65,57,87,.82); }
    [data-theme="light"] #bangumi-desktop-titlebar button:hover { background: rgba(36,32,51,.08); }
    @media (max-width: 760px) {
      #bangumi-desktop-titlebar .desktop-title { display: none; }
      #bangumi-desktop-titlebar button.data-dir { display: none; }
    }
  `;
  document.documentElement.classList.add('bangumi-desktop-shell');
  if (hasNativeWindowControls) document.documentElement.classList.add('bangumi-native-controls');
  document.head.appendChild(style);

  const bar = document.createElement('div');
  bar.id = 'bangumi-desktop-titlebar';
  bar.innerHTML = `
    <div class="desktop-left">
      <div class="desktop-logo" aria-hidden="true"><svg viewBox="0 0 1024 1024" fill="#FF6CB8" aria-label="Bangumi" role="img"><path d="M228.115268 615.399298a12.300795 12.300795 0 0 0 11.35458 7.569719 12.471113 12.471113 0 0 0 4.749999-0.965139l147.609537-61.882459a12.300795 12.300795 0 0 0 0.26494-22.557765l-147.609537-66.235049a12.300795 12.300795 0 1 0-10.067727 22.444219l121.740019 54.634453-121.456155 50.906366a12.300795 12.300795 0 0 0-6.585656 16.085655zM399.020617 627.965033H239.469848a12.300795 12.300795 0 0 0 0 24.601589h159.550769a12.300795 12.300795 0 0 0 0-24.601589zM399.020617 667.460046H239.469848a12.300795 12.300795 0 0 0 0 24.601589h159.550769a12.300795 12.300795 0 0 0 0-24.601589zM872.941851 476.892349l-133.283841 58.381464a12.300795 12.300795 0 0 0-0.397411 22.349598l133.302766 64.058754a12.073703 12.073703 0 0 0 5.317729 1.23008 12.300795 12.300795 0 0 0 5.336652-23.390435l-109.15536-52.42031L882.896033 499.469038a12.300795 12.300795 0 1 0-9.954182-22.576689zM877.881094 627.965033h-148.101569a12.300795 12.300795 0 0 0 0 24.601589h148.101569a12.300795 12.300795 0 0 0 0-24.601589zM877.881094 667.460046h-148.101569a12.300795 12.300795 0 0 0 0 24.601589h148.101569a12.300795 12.300795 0 0 0 0-24.601589zM644.866193 537.128395h-162.919295a12.28187 12.28187 0 0 0-10.711153 18.318722l81.374488 145.130453a12.300795 12.300795 0 0 0 21.460155 0l81.374489-145.130453a12.300795 12.300795 0 0 0-10.730078-18.318722z m-81.374488 132.299778l-60.444213-107.698189h120.888426z"></path><path d="M891.411968 334.960102H648.405037c-6.812748-15.13944-19.813742-28.386449-36.864535-38.018917L803.092262 19.283861a12.300795 12.300795 0 0 0-20.249001-13.966133L588.566402 286.873457a147.723082 147.723082 0 0 0-45.418319-7.001991 151.507942 151.507942 0 0 0-31.887445 3.368526L239.980804 4.712151A12.300795 12.300795 0 0 0 222.437978 21.87649l262.726051 269.803739c-22.14143 9.821711-39.116527 25.112546-47.310749 43.242025H132.547555A91.763929 91.763929 0 0 0 40.764702 426.705107v414.44216A91.763929 91.763929 0 0 0 132.547555 932.967969h268.024855l-19.908363 46.989036c-12.641432 29.881469 22.614538 57.094612 48.294812 37.299794L538.473781 932.967969h352.938187a91.763929 91.763929 0 0 0 91.782853-91.782853v-414.442161a91.763929 91.763929 0 0 0-91.782853-91.782853z m34.839635 463.815658a60.709153 60.709153 0 0 1-60.709153 60.709153H585.670984L487.870204 932.967969l-77.002975 57.851583 24.412346-57.851583 31.016927-73.483056H198.082405A60.728077 60.728077 0 0 1 137.27863 798.737912V440.330602a60.728077 60.728077 0 0 1 60.728077-60.728077h667.460046a60.709153 60.709153 0 0 1 60.709153 60.728077z"></path></svg></div>
      <div class="desktop-title">Bangumi 保管库</div>
    </div>
    <div class="desktop-actions">
      <button class="data-dir" type="button" title="打开资料库目录">资料库</button>
      <button class="min" type="button" title="最小化" aria-label="最小化"><svg class="window-glyph" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7.5h8"/></svg></button>
      <button class="max" type="button" title="最大化/还原" aria-label="最大化/还原"><svg class="window-glyph" viewBox="0 0 14 14" aria-hidden="true"><rect x="3.2" y="3.2" width="7.6" height="7.6" rx=".8"/></svg></button>
      <button class="close" type="button" title="关闭" aria-label="关闭"><svg class="window-glyph" viewBox="0 0 14 14" aria-hidden="true"><path d="M3.3 3.3l7.4 7.4M10.7 3.3l-7.4 7.4"/></svg></button>
    </div>
  `;
  (document.getElementById('appRoot') || document.body).prepend(bar);
  bar.querySelector('.data-dir').addEventListener('click', () => desktopApi.openDataDir());
  if (!hasNativeWindowControls) {
    bar.querySelector('.min').addEventListener('click', () => desktopApi.minimize());
    bar.querySelector('.max').addEventListener('click', async () => {
      const maximized = await desktopApi.toggleMaximize();
      syncWindowCornerMode(maximized);
    });
    bar.querySelector('.close').addEventListener('click', () => desktopApi.close());
  }
  bar.addEventListener('dblclick', event => {
    if (!event.target.closest('button')) desktopApi.toggleMaximize().then(syncWindowCornerMode);
  });
}

window.addEventListener('DOMContentLoaded', () => {
  // 新界面 1.0（玻璃拟态）自带悬浮顶栏和拖拽区：此时注入旧版桌面标题栏会
  // 盖住整个顶部（z-index 最大 + 整条拖拽区吃掉点击）并用 !important 压扁
  // .app 的顶部内边距，造成“UI 被挡住 / 玻璃透不过去”。仅经典界面才注入。
  const pageOwnsShell = !!document.getElementById('bvTopbar')
    || document.documentElement.getAttribute('data-bv-ui') === 'lg26';
  if (!pageOwnsShell) injectDesktopTitlebar();
  else document.title = 'Bangumi 保管库';
  syncWindowCornerModeFromHost();
  watchWindowTheme();
  installPointerCoverTilt();
  window.addEventListener('focus', () => {
    syncWindowCornerModeFromHost();
    syncWindowThemeFromDocument(true);
  });
}, { once: true });
