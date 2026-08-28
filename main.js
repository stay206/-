const { app, BrowserWindow, ipcMain, shell, Menu, nativeImage, screen, net } = require('electron');
const http = require('http');
const https = require('https');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { URL } = require('url');

const APP_NAME = 'Bangumi 保管库';
const APP_ID = 'io.github.akisato.bangumi.vault';
const DATA_DIR_NAME = '资料库';
const IMAGES_DIR_NAME = '封面缓存';
const BACKUPS_DIR_NAME = '备份';
const LOGS_DIR_NAME = '日志';
const STATE_FILE_NAME = '收藏数据.json';
const COLLECTIONS_FILE_NAME = '收藏条目.json';
const DETAILS_FILE_NAME = '条目资料.json';
const TAGS_FILE_NAME = '标签数据.json';
const HISTORY_FILE_NAME = '变更历史.json';
const TIMELINE_FILE_NAME = '时间胶囊数据.json';
const WINDOW_STATE_FILE_NAME = '窗口状态.json';
const APP_USER_AGENT = 'AKISATO57/AKI-Bangumi-Vault/0.31.1 (https://github.com/AKISATO57/AKI-Bangumi-Vault)';
const IMAGE_ACCEPT = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';
const MAX_CACHED_COVER_EDGE = 4096;
const CACHED_COVER_JPEG_QUALITY = 95;
const COVER_LAZY_OPTIMIZE_MIN_BYTES = 2 * 1024 * 1024;
const TIMELINE_REQUEST_INTERVAL_MS = 1250;
const RUNTIME_LOG_RETENTION_DAYS = 30;
const RUNTIME_LOG_BATCH_LIMIT = 120;
let mainWindow = null;
let localServer = null;
let localServerUrl = '';
let dataDir = '';
let imagesDir = '';
let backupsDir = '';
let logsDir = '';
let stateFile = '';
let collectionsFile = '';
let detailsFile = '';
let tagsFile = '';
let historyFile = '';
let timelineFile = '';
let windowStateFile = '';
let timelineNextRequestAt = 0;
let timelineRequestTail = Promise.resolve();
let runtimeLogWriteTail = Promise.resolve();
let saveWindowStateTimer = null;
const coverOptimizationJobs = new Map();

function chooseDataDir() {
  if (process.env.BANGUMI_VAULT_DATA_DIR) {
    return process.env.BANGUMI_VAULT_DATA_DIR;
  }
  if (process.env.BANGUMI_HOGUAN_DATA_DIR) {
    return process.env.BANGUMI_HOGUAN_DATA_DIR;
  }

  // Development mode: keep the portable data folder beside the project.
  if (!app.isPackaged) {
    return path.join(__dirname, DATA_DIR_NAME);
  }

  // Both the installed and portable desktop builds intentionally keep their
  // offline library beside the executable. The NSIS installer preserves this
  // folder across upgrades before it replaces the installation directory.
  return path.join(path.dirname(process.execPath), DATA_DIR_NAME);
}

async function copyDirIfExists(fromDir, toDir) {
  try {
    await fsp.access(fromDir, fs.constants.F_OK);
  } catch {
    return;
  }
  await fsp.mkdir(toDir, { recursive: true });
  const entries = await fsp.readdir(fromDir, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(fromDir, entry.name);
    const to = path.join(toDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirIfExists(from, to);
    } else {
      try {
        await fsp.access(to, fs.constants.F_OK);
      } catch {
        await fsp.copyFile(from, to);
      }
    }
  }
}

async function migrateLegacyVaultData() {
  const legacyDir = app.isPackaged
    ? path.join(path.dirname(process.execPath), 'VaultData')
    : path.join(__dirname, 'VaultData');
  if (legacyDir === dataDir) return;

  const legacyState = path.join(legacyDir, 'state.json');
  try {
    await fsp.access(stateFile, fs.constants.F_OK);
  } catch {
    try {
      await fsp.copyFile(legacyState, stateFile);
    } catch {}
  }

  await copyDirIfExists(path.join(legacyDir, 'Images'), imagesDir);
  await copyDirIfExists(path.join(legacyDir, 'Backups'), backupsDir);
  await copyDirIfExists(path.join(legacyDir, 'Logs'), logsDir);
}

async function restoreInterruptedInstallerVault() {
  if (!app.isPackaged) return;

  const protectedDir = `${dataDir}.__vault-upgrade-backup__`;
  try {
    await fsp.access(stateFile, fs.constants.F_OK);
    return;
  } catch {}

  try {
    await fsp.access(protectedDir, fs.constants.F_OK);
  } catch {
    return;
  }

  // The normal path is an atomic same-drive rename. A protected folder is
  // intentionally retained if that fails, so no interrupted update can erase
  // the only copy of a user's offline library.
  try {
    await fsp.rename(protectedDir, dataDir);
    return;
  } catch {}

  await copyDirIfExists(protectedDir, dataDir);
}

async function ensureDataDirs() {
  dataDir = chooseDataDir();
  imagesDir = path.join(dataDir, IMAGES_DIR_NAME);
  backupsDir = path.join(dataDir, BACKUPS_DIR_NAME);
  logsDir = path.join(dataDir, LOGS_DIR_NAME);
  stateFile = path.join(dataDir, STATE_FILE_NAME);
  collectionsFile = path.join(dataDir, COLLECTIONS_FILE_NAME);
  detailsFile = path.join(dataDir, DETAILS_FILE_NAME);
  tagsFile = path.join(dataDir, TAGS_FILE_NAME);
  historyFile = path.join(dataDir, HISTORY_FILE_NAME);
  timelineFile = path.join(dataDir, TIMELINE_FILE_NAME);
  windowStateFile = path.join(dataDir, WINDOW_STATE_FILE_NAME);

  await restoreInterruptedInstallerVault();
  await fsp.mkdir(imagesDir, { recursive: true });
  await fsp.mkdir(backupsDir, { recursive: true });
  await fsp.mkdir(logsDir, { recursive: true });
  await pruneRuntimeLogs();
  await migrateLegacyVaultData();
  try {
    await fsp.access(stateFile, fs.constants.F_OK);
  } catch {
    await fsp.writeFile(stateFile, '', 'utf8');
  }
}

async function writeAtomic(filePath, body) {
  const tmp = `${filePath}.tmp`;
  await fsp.writeFile(tmp, body);
  await fsp.rename(tmp, filePath);
}

function runtimeLogFileName(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}.jsonl`;
}

async function pruneRuntimeLogs() {
  try {
    const names = (await fsp.readdir(logsDir))
      .filter(name => /^\d{4}-\d{2}-\d{2}\.jsonl$/i.test(name))
      .sort();
    const stale = names.slice(0, Math.max(0, names.length - RUNTIME_LOG_RETENTION_DAYS));
    await Promise.all(stale.map(name => fsp.unlink(path.join(logsDir, name)).catch(() => {})));
  } catch {}
}

function runtimeLogEntries(payload) {
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  return entries.slice(-RUNTIME_LOG_BATCH_LIMIT).map(entry => ({
    time: String(entry?.time || new Date().toISOString()).slice(0, 64),
    channel: String(entry?.channel || 'app').slice(0, 32),
    level: String(entry?.level || 'info').slice(0, 16),
    message: String(entry?.message || '').replace(/[\r\n]+/g, ' ').slice(0, 2000)
  })).filter(entry => entry.message);
}

function appendRuntimeLogs(entries) {
  if (!entries.length || !logsDir) return Promise.resolve();
  const write = runtimeLogWriteTail.then(async () => {
    const lines = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
    await fsp.appendFile(path.join(logsDir, runtimeLogFileName()), lines, 'utf8');
  });
  runtimeLogWriteTail = write.catch(() => {});
  return write;
}

function writeWindowState(win) {
  if (!win || win.isDestroyed() || !windowStateFile) return;
  const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
  const payload = {
    version: 1,
    bounds,
    maximized: win.isMaximized(),
    updated_at: new Date().toISOString()
  };
  try {
    const tmp = `${windowStateFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload));
    fs.renameSync(tmp, windowStateFile);
  } catch {}
}

function scheduleWindowStateSave(win) {
  clearTimeout(saveWindowStateTimer);
  saveWindowStateTimer = setTimeout(() => writeWindowState(win), 260);
}

function savedWindowState() {
  try {
    const saved = JSON.parse(fs.readFileSync(windowStateFile, 'utf8'));
    const bounds = saved?.bounds;
    if (!bounds || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return null;
    if (bounds.width < 1040 || bounds.height < 680) return null;
    const visible = screen.getAllDisplays().some(({ workArea }) => (
      bounds.x < workArea.x + workArea.width &&
      bounds.x + bounds.width > workArea.x &&
      bounds.y < workArea.y + workArea.height &&
      bounds.y + bounds.height > workArea.y
    ));
    if (!visible) return null;
    return { bounds, maximized: !!saved.maximized };
  } catch {
    return null;
  }
}

function queueTimelineRequest(task) {
  const job = timelineRequestTail.then(async () => {
    const wait = Math.max(0, timelineNextRequestAt - Date.now());
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    timelineNextRequestAt = Date.now() + TIMELINE_REQUEST_INTERVAL_MS;
    return task();
  });
  timelineRequestTail = job.catch(() => {});
  return job;
}

function timeCapsulePageUrl(siteBase, username, page) {
  const base = new URL(String(siteBase || 'https://bgm.tv'));
  if (!/^https?:$/.test(base.protocol)) throw new Error('时间胶囊地址必须使用 HTTP 或 HTTPS');
  const name = String(username || '').trim();
  if (!name || name.length > 120) throw new Error('Bangumi 用户名无效');
  const target = new URL(`/user/${encodeURIComponent(name)}/timeline`, base.origin);
  target.searchParams.set('type', 'all');
  target.searchParams.set('page', String(Math.max(1, Number(page) || 1)));
  return target.toString();
}

function appHtmlPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app', 'BangumiVault.html');
  }
  return path.join(__dirname, 'app', 'BangumiVault.html');
}


function assetPath(fileName) {
  const safe = safeName(fileName, 'icon.svg');
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'build', safe);
  }
  return path.join(__dirname, 'build', safe);
}

function windowIconPath() {
  if (process.platform === 'win32') return assetPath('icon.ico');
  return assetPath('icon.png');
}

function safeName(name, fallback = 'file') {
  const raw = String(name || '').trim() || fallback;
  // Windows-invalid characters plus path separators and control chars.
  return raw.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\.+$/, fallback);
}

function mimeByExt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js': return 'text/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.png': return 'image/png';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    case '.svg': return 'image/svg+xml';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    default: return 'application/octet-stream';
  }
}

function send(res, status, body, contentType = 'text/plain; charset=utf-8') {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? ''), 'utf8');
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': bytes.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(bytes);
}

async function sendFile(res, filePath, contentType) {
  try {
    const bytes = await fsp.readFile(filePath);
    send(res, 200, bytes, contentType || mimeByExt(filePath));
  } catch {
    send(res, 404, 'Not found');
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function guessImageExt(contentType, remoteUrl) {
  const type = String(contentType || '').toLowerCase();
  if (type.includes('png')) return '.png';
  if (type.includes('webp')) return '.webp';
  if (type.includes('gif')) return '.gif';
  if (type.includes('jpeg') || type.includes('jpg')) return '.jpg';
  try {
    const ext = path.extname(new URL(remoteUrl).pathname).toLowerCase();
    if (['.png', '.webp', '.gif', '.jpg', '.jpeg'].includes(ext)) return ext;
  } catch {}
  return '.jpg';
}

function normalizeContentType(headers) {
  if (!headers) return '';
  const direct = headers['content-type'] || headers['Content-Type'];
  if (Array.isArray(direct)) return direct[0] || '';
  return direct || '';
}

function cachedCoverExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ['.jpg', '.jpeg', '.png'].includes(ext) ? ext : '';
}

function cachedCoverDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null;

  // PNG: the IHDR width/height fields are fixed at offsets 16 and 20.
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  // JPEG: scan marker segments until a Start Of Frame marker is found.
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    const sofMarkers = new Set([
      0xc0, 0xc1, 0xc2, 0xc3,
      0xc5, 0xc6, 0xc7,
      0xc9, 0xca, 0xcb,
      0xcd, 0xce, 0xcf
    ]);
    while (offset + 4 <= buffer.length) {
      while (offset < buffer.length && buffer[offset] !== 0xff) offset += 1;
      while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
      if (offset >= buffer.length) break;
      const marker = buffer[offset++];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (marker === 0xd9 || marker === 0xda) break;
      if (offset + 2 > buffer.length) break;
      const segmentLength = buffer.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
      if (sofMarkers.has(marker) && segmentLength >= 7) {
        const height = buffer.readUInt16BE(offset + 3);
        const width = buffer.readUInt16BE(offset + 5);
        return width > 0 && height > 0 ? { width, height } : null;
      }
      offset += segmentLength;
    }
  }

  return null;
}

async function readCachedCoverDimensions(filePath, fileSize) {
  const probeSize = Math.min(Math.max(Number(fileSize) || 0, 24), 256 * 1024);
  const handle = await fsp.open(filePath, 'r');
  try {
    const probe = Buffer.allocUnsafe(probeSize);
    const { bytesRead } = await handle.read(probe, 0, probeSize, 0);
    return cachedCoverDimensions(probe.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

function optimizeCachedCoverBuffer(buffer, ext, knownDimensions = null) {
  const supportedExt = cachedCoverExtension(`cover${ext}`);
  if (!supportedExt || !Buffer.isBuffer(buffer) || !buffer.length) {
    return { optimized: false, buffer, reason: 'unsupported' };
  }

  let dimensions = knownDimensions || cachedCoverDimensions(buffer);
  if (dimensions && Math.max(dimensions.width, dimensions.height) <= MAX_CACHED_COVER_EDGE) {
    return { optimized: false, buffer, dimensions, reason: 'within-limit' };
  }

  const image = nativeImage.createFromBuffer(buffer);
  if (image.isEmpty()) return { optimized: false, buffer, dimensions, reason: 'decode-failed' };
  dimensions = image.getSize();
  const longestEdge = Math.max(dimensions.width, dimensions.height);
  if (!Number.isFinite(longestEdge) || longestEdge <= MAX_CACHED_COVER_EDGE) {
    return { optimized: false, buffer, dimensions, reason: 'within-limit' };
  }

  const resizeOptions = dimensions.width >= dimensions.height
    ? { width: MAX_CACHED_COVER_EDGE, quality: 'best' }
    : { height: MAX_CACHED_COVER_EDGE, quality: 'best' };
  const resized = image.resize(resizeOptions);
  if (resized.isEmpty()) return { optimized: false, buffer, dimensions, reason: 'resize-failed' };
  const target = resized.getSize();

  const output = supportedExt === '.png'
    ? resized.toPNG()
    : resized.toJPEG(CACHED_COVER_JPEG_QUALITY);
  if (!output?.length) return { optimized: false, buffer, dimensions, reason: 'encode-failed' };

  return {
    optimized: true,
    buffer: output,
    dimensions,
    target
  };
}

async function replaceFileSafely(filePath, buffer) {
  const tempPath = `${filePath}.opt-${process.pid}-${Date.now()}.tmp`;
  await fsp.writeFile(tempPath, buffer);
  try {
    await fsp.rename(tempPath, filePath);
  } catch (renameError) {
    try {
      await fsp.copyFile(tempPath, filePath);
      await fsp.unlink(tempPath).catch(() => {});
    } catch (copyError) {
      await fsp.unlink(tempPath).catch(() => {});
      throw copyError || renameError;
    }
  }
}

async function performCachedCoverOptimization(filePath) {
  const ext = cachedCoverExtension(filePath);
  if (!ext) return { optimized: false, reason: 'unsupported' };

  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    return { optimized: false, reason: 'missing' };
  }
  if (!stat.isFile()) return { optimized: false, reason: 'not-file' };

  let dimensions = null;
  try {
    dimensions = await readCachedCoverDimensions(filePath, stat.size);
  } catch {}
  if (dimensions && Math.max(dimensions.width, dimensions.height) <= MAX_CACHED_COVER_EDGE) {
    return { optimized: false, reason: 'within-limit', dimensions };
  }

  const original = await fsp.readFile(filePath);
  const result = optimizeCachedCoverBuffer(original, ext, dimensions);
  if (!result.optimized) return result;
  await replaceFileSafely(filePath, result.buffer);
  return {
    ...result,
    originalBytes: original.length,
    optimizedBytes: result.buffer.length
  };
}

function optimizeCachedCoverFile(filePath) {
  const key = path.resolve(filePath);
  const existing = coverOptimizationJobs.get(key);
  if (existing) return existing;
  const job = performCachedCoverOptimization(key)
    .catch(error => ({ optimized: false, reason: 'error', error }))
    .finally(() => coverOptimizationJobs.delete(key));
  coverOptimizationJobs.set(key, job);
  return job;
}

async function optimizeExistingOversizedCovers() {
  let entries = [];
  try {
    entries = await fsp.readdir(imagesDir, { withFileTypes: true });
  } catch {
    return;
  }

  let optimizedCount = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !/^\d+\.(?:jpe?g|png)$/i.test(entry.name)) continue;
    const result = await optimizeCachedCoverFile(path.join(imagesDir, entry.name));
    if (result.optimized) {
      optimizedCount += 1;
      console.log(
        `[cover-cache] optimized ${entry.name}: ` +
        `${result.dimensions.width}x${result.dimensions.height} -> ${result.target.width}x${result.target.height}`
      );
    }
    // Keep the background maintenance pass from monopolizing the event loop.
    await new Promise(resolve => setTimeout(resolve, 8));
  }
  if (optimizedCount > 0) console.log(`[cover-cache] optimized ${optimizedCount} oversized cover(s)`);
}

function downloadBufferViaNode(remoteUrl, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(remoteUrl); } catch (err) { reject(err); return; }
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(parsed, {
      method: 'GET',
      headers: {
        'User-Agent': APP_USER_AGENT,
        'Referer': 'https://bgm.tv/',
        'Accept': IMAGE_ACCEPT,
        'Accept-Language': 'zh-CN,zh;q=0.9,ja;q=0.8,en;q=0.6',
        'Cache-Control': 'no-cache'
      },
      timeout: 30000
    }, res => {
      const status = res.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status) && res.headers.location && redirectsLeft > 0) {
        res.resume();
        const next = new URL(res.headers.location, parsed).toString();
        downloadBufferViaNode(next, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (status < 200 || status >= 300) {
        res.resume();
        reject(new Error(`HTTP ${status}`));
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: normalizeContentType(res.headers) }));
    });
    req.on('timeout', () => req.destroy(new Error('Request timeout')));
    req.on('error', reject);
    req.end();
  });
}

function downloadBufferViaElectronNet(remoteUrl, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    if (!net || typeof net.request !== 'function') {
      reject(new Error('Electron net is unavailable'));
      return;
    }
    const req = net.request({ method: 'GET', url: remoteUrl });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { req.abort(); } catch {}
      reject(new Error('Request timeout'));
    }, 30000);
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    try {
      req.setHeader('User-Agent', APP_USER_AGENT);
      req.setHeader('Referer', 'https://bgm.tv/');
      req.setHeader('Accept', IMAGE_ACCEPT);
      req.setHeader('Accept-Language', 'zh-CN,zh;q=0.9,ja;q=0.8,en;q=0.6');
      req.setHeader('Cache-Control', 'no-cache');
    } catch {}
    req.on('redirect', (statusCode, method, redirectUrl) => {
      if (redirectsLeft > 0) {
        try { req.followRedirect(); } catch {}
      } else {
        finish(reject, new Error(`Too many redirects: ${statusCode} ${redirectUrl || ''}`.trim()));
        try { req.abort(); } catch {}
      }
    });
    req.on('response', res => {
      const status = res.statusCode || 0;
      if (status < 200 || status >= 300) {
        res.resume();
        finish(reject, new Error(`HTTP ${status}`));
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(Buffer.from(chunk)));
      res.on('end', () => finish(resolve, { buffer: Buffer.concat(chunks), contentType: normalizeContentType(res.headers) }));
      res.on('error', err => finish(reject, err));
    });
    req.on('error', err => finish(reject, err));
    req.end();
  });
}

async function downloadBuffer(remoteUrl) {
  try {
    // Prefer Chromium's network stack. It matches the in-app preview path better than Node's https module
    // and respects the user's system proxy / TLS / DNS behavior.
    return await downloadBufferViaElectronNet(remoteUrl);
  } catch (electronErr) {
    try {
      return await downloadBufferViaNode(remoteUrl);
    } catch (nodeErr) {
      const msg = `${electronErr?.message || electronErr}; fallback: ${nodeErr?.message || nodeErr}`;
      throw new Error(msg);
    }
  }
}


function downloadTextViaNode(remoteUrl, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(remoteUrl); } catch (err) { reject(err); return; }
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(parsed, {
      method: 'GET',
      headers: {
        'User-Agent': APP_USER_AGENT,
        'Referer': 'https://bgm.tv/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,ja;q=0.8,en;q=0.6'
      },
      timeout: 30000
    }, res => {
      const status = res.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status) && res.headers.location && redirectsLeft > 0) {
        res.resume();
        const next = new URL(res.headers.location, parsed).toString();
        downloadTextViaNode(next, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (status < 200 || status >= 300) {
        res.resume();
        reject(new Error(`HTTP ${status}`));
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('timeout', () => req.destroy(new Error('Request timeout')));
    req.on('error', reject);
    req.end();
  });
}

function downloadTextViaElectronNet(remoteUrl, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    if (!net || typeof net.request !== 'function') {
      reject(new Error('Electron net is unavailable'));
      return;
    }
    const req = net.request({ method: 'GET', url: remoteUrl });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { req.abort(); } catch {}
      reject(new Error('Request timeout'));
    }, 30000);
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    try {
      req.setHeader('User-Agent', APP_USER_AGENT);
      req.setHeader('Referer', 'https://bgm.tv/');
      req.setHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
      req.setHeader('Accept-Language', 'zh-CN,zh;q=0.9,ja;q=0.8,en;q=0.6');
    } catch {}
    req.on('redirect', (statusCode, method, redirectUrl) => {
      if (redirectsLeft > 0) {
        try { req.followRedirect(); } catch {}
      } else {
        finish(reject, new Error(`Too many redirects: ${statusCode} ${redirectUrl || ''}`.trim()));
        try { req.abort(); } catch {}
      }
    });
    req.on('response', res => {
      const status = res.statusCode || 0;
      if (status < 200 || status >= 300) {
        res.resume();
        finish(reject, new Error(`HTTP ${status}`));
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(Buffer.from(chunk)));
      res.on('end', () => finish(resolve, Buffer.concat(chunks).toString('utf8')));
      res.on('error', err => finish(reject, err));
    });
    req.on('error', err => finish(reject, err));
    req.end();
  });
}

async function downloadText(remoteUrl) {
  try {
    return await downloadTextViaElectronNet(remoteUrl);
  } catch (electronErr) {
    try {
      return await downloadTextViaNode(remoteUrl);
    } catch (nodeErr) {
      throw new Error(`${electronErr?.message || electronErr}; fallback: ${nodeErr?.message || nodeErr}`);
    }
  }
}

function decodeHtmlEntity(text) {
  return String(text || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripTags(html) {
  return decodeHtmlEntity(String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function extractSubjectPageTags(html) {
  const source = String(html || '');
  let start = source.search(/大家将[\s\S]{0,600}?标注为/);
  if (start < 0) start = source.search(/subject_tag_section|subject_tags|tagsWrapper/i);
  if (start < 0) return [];
  let segment = source.slice(start, start + 16000);
  const next = segment.slice(200).search(/<h2\b|<h3\b|id=["']subjectPanelCollect|class=["'][^"']*subject_section/i);
  if (next > 0) segment = segment.slice(0, 200 + next);
  const tags = [];
  const seen = new Set();
  const re = /<a\b([^>]*?href=(['"])([^'"]*\/tag\/[^'"]*)\2[^>]*)>([\s\S]*?)<\/a>([\s\S]{0,120})/gi;
  let match;
  while ((match = re.exec(segment))) {
    const href = decodeHtmlEntity(match[3] || '');
    if (!/\/(anime|book|music|game|real|subject)\/tag\//.test(href) && !/\/tag\//.test(href)) continue;
    let text = stripTags(match[4]);
    if (!text || /更多|more/i.test(text)) continue;
    let count = 0;
    const insideCount = text.match(/^(.*?)[\s\(（]+(\d+)[\)）]?$/);
    if (insideCount) {
      text = insideCount[1].trim();
      count = Number(insideCount[2]) || 0;
    } else {
      const tail = match[5] || '';
      const tailCount = tail.match(/<(?:span|small)\b[^>]*?(?:class=(['"])[^'"]*(?:num|count)[^'"]*\1)?[^>]*>\s*(\d+)\s*<\/(?:span|small)>/i);
      if (tailCount) count = Number(tailCount[2]) || 0;
    }
    text = text.replace(/\s+/g, ' ').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    tags.push({ name: text, count });
  }
  return tags;
}

async function handleRequest(req, res) {
  const requestUrl = new URL(req.url, 'http://127.0.0.1');
  const pathname = decodeURIComponent(requestUrl.pathname);

  if (req.method === 'GET' && (pathname === '/' || pathname === '/BangumiVault.html')) {
    await sendFile(res, appHtmlPath(), 'text/html; charset=utf-8');
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/assets/')) {
    const file = safeName(path.basename(pathname.slice('/assets/'.length)), 'icon.svg');
    await sendFile(res, assetPath(file), mimeByExt(file));
    return;
  }


  if (req.method === 'GET' && pathname === '/api/ping') {
    send(res, 200, JSON.stringify({ ok: true, desktop: true, dataDir }), 'application/json; charset=utf-8');
    return;
  }


  if (req.method === 'GET' && pathname === '/api/state') {
    try {
      const stat = await fsp.stat(stateFile);
      if (stat.size <= 0) {
        send(res, 204, '', 'application/json; charset=utf-8');
      } else {
        await sendFile(res, stateFile, 'application/json; charset=utf-8');
      }
    } catch {
      send(res, 204, '', 'application/json; charset=utf-8');
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/state') {
    const body = await readBody(req);
    await writeAtomic(stateFile, body);
    send(res, 200, JSON.stringify({ ok: true }), 'application/json; charset=utf-8');
    return;
  }

  if (req.method === 'GET' && pathname === '/api/collections') {
    try {
      const stat = await fsp.stat(collectionsFile);
      if (stat.size <= 0) send(res, 204, '', 'application/json; charset=utf-8');
      else await sendFile(res, collectionsFile, 'application/json; charset=utf-8');
    } catch {
      send(res, 204, '', 'application/json; charset=utf-8');
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/collections') {
    await writeAtomic(collectionsFile, await readBody(req));
    send(res, 200, JSON.stringify({ ok: true }), 'application/json; charset=utf-8');
    return;
  }

  if (req.method === 'GET' && pathname === '/api/details') {
    try {
      const stat = await fsp.stat(detailsFile);
      if (stat.size <= 0) send(res, 204, '', 'application/json; charset=utf-8');
      else await sendFile(res, detailsFile, 'application/json; charset=utf-8');
    } catch {
      send(res, 204, '', 'application/json; charset=utf-8');
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/details') {
    await writeAtomic(detailsFile, await readBody(req));
    send(res, 200, JSON.stringify({ ok: true }), 'application/json; charset=utf-8');
    return;
  }

  if (req.method === 'GET' && pathname === '/api/tags') {
    try {
      const stat = await fsp.stat(tagsFile);
      if (stat.size <= 0) send(res, 204, '', 'application/json; charset=utf-8');
      else await sendFile(res, tagsFile, 'application/json; charset=utf-8');
    } catch {
      send(res, 204, '', 'application/json; charset=utf-8');
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/tags') {
    await writeAtomic(tagsFile, await readBody(req));
    send(res, 200, JSON.stringify({ ok: true }), 'application/json; charset=utf-8');
    return;
  }

  if (req.method === 'GET' && pathname === '/api/history') {
    try {
      const stat = await fsp.stat(historyFile);
      if (stat.size <= 0) send(res, 204, '', 'application/json; charset=utf-8');
      else await sendFile(res, historyFile, 'application/json; charset=utf-8');
    } catch {
      send(res, 204, '', 'application/json; charset=utf-8');
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/history') {
    await writeAtomic(historyFile, await readBody(req));
    send(res, 200, JSON.stringify({ ok: true }), 'application/json; charset=utf-8');
    return;
  }

  if (req.method === 'GET' && pathname === '/api/timeline-cache') {
    try {
      const stat = await fsp.stat(timelineFile);
      if (stat.size <= 0) send(res, 204, '', 'application/json; charset=utf-8');
      else await sendFile(res, timelineFile, 'application/json; charset=utf-8');
    } catch {
      send(res, 204, '', 'application/json; charset=utf-8');
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/timeline-cache') {
    await writeAtomic(timelineFile, await readBody(req));
    send(res, 200, JSON.stringify({ ok: true }), 'application/json; charset=utf-8');
    return;
  }

  if (req.method === 'POST' && pathname === '/api/runtime-log') {
    let payload = {};
    try {
      payload = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    } catch {
      send(res, 400, JSON.stringify({ ok: false, error: 'invalid log payload' }), 'application/json; charset=utf-8');
      return;
    }
    const entries = runtimeLogEntries(payload);
    await appendRuntimeLogs(entries);
    send(res, 200, JSON.stringify({ ok: true, written: entries.length }), 'application/json; charset=utf-8');
    return;
  }

  if (req.method === 'GET' && pathname === '/api/timeline-page') {
    const username = requestUrl.searchParams.get('username');
    const siteBase = requestUrl.searchParams.get('siteBase');
    const page = requestUrl.searchParams.get('page');
    const sourceUrl = timeCapsulePageUrl(siteBase, username, page);
    const html = await queueTimelineRequest(() => downloadText(sourceUrl));
    send(res, 200, JSON.stringify({ ok: true, page: Number(page) || 1, html }), 'application/json; charset=utf-8');
    return;
  }

  if (req.method === 'POST' && pathname === '/api/cache-cover') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    const sid = safeName(body.subject_id, 'subject');
    const remoteUrl = String(body.url || '').trim();
    if (!sid || !remoteUrl) {
      send(res, 400, JSON.stringify({ ok: false, error: 'missing subject_id or url' }), 'application/json; charset=utf-8');
      return;
    }
    const downloaded = await downloadBuffer(remoteUrl);
    const ext = guessImageExt(downloaded.contentType, remoteUrl);
    const file = `${sid}${ext}`;
    const target = path.join(imagesDir, file);
    const optimized = optimizeCachedCoverBuffer(downloaded.buffer, ext);
    await fsp.writeFile(target, optimized.optimized ? optimized.buffer : downloaded.buffer);
    send(res, 200, JSON.stringify({
      ok: true,
      url: `/images/${file}`,
      file: `${IMAGES_DIR_NAME}/${file}`,
      optimized: !!optimized.optimized
    }), 'application/json; charset=utf-8');
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/images/')) {
    const file = safeName(path.basename(pathname.slice('/images/'.length)));
    const target = path.join(imagesDir, file);
    if (/^\d+\.(?:jpe?g|png)$/i.test(file)) {
      try {
        const stat = await fsp.stat(target);
        if (stat.size >= COVER_LAZY_OPTIMIZE_MIN_BYTES) await optimizeCachedCoverFile(target);
      } catch {}
    }
    await sendFile(res, target, mimeByExt(file));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/save-file') {
    const name = safeName(requestUrl.searchParams.get('name'), 'backup.bin');
    const body = await readBody(req);
    await fsp.writeFile(path.join(backupsDir, name), body);
    send(res, 200, JSON.stringify({ ok: true, file: `${BACKUPS_DIR_NAME}/${name}` }), 'application/json; charset=utf-8');
    return;
  }

  send(res, 404, 'Not found');
}

function startLocalServer() {
  return new Promise((resolve, reject) => {
    localServer = http.createServer((req, res) => {
      handleRequest(req, res).catch(err => {
        send(res, 500, JSON.stringify({ ok: false, error: err.message || String(err) }), 'application/json; charset=utf-8');
      });
    });
    localServer.on('error', reject);
    localServer.listen(0, '127.0.0.1', () => {
      const address = localServer.address();
      localServerUrl = `http://127.0.0.1:${address.port}/`;
      resolve(localServerUrl);
    });
  });
}

function createMainWindow() {
  const isMac = process.platform === 'darwin';
  const iconImage = nativeImage.createFromPath(windowIconPath());
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const adaptiveWidth = Math.max(1120, Math.min(1560, Math.round(workArea.width * 0.84)));
  const adaptiveHeight = Math.max(720, Math.min(940, Math.round(workArea.height * 0.86)));
  const saved = savedWindowState();
  const savedBounds = saved?.bounds;
  mainWindow = new BrowserWindow({
    width: savedBounds?.width || adaptiveWidth,
    height: savedBounds?.height || adaptiveHeight,
    ...(savedBounds ? { x: savedBounds.x, y: savedBounds.y } : {}),
    minWidth: 1040,
    minHeight: 680,
    show: false,
    title: APP_NAME,
    frame: true,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    backgroundColor: '#f6f4fb',
    ...(process.platform === 'win32' ? {
      titleBarOverlay: {
        color: '#00000000',
        symbolColor: '#5b5368',
        height: 36
      }
    } : {}),
    icon: iconImage,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    }
  });

  if (process.platform === 'win32' && !iconImage.isEmpty()) {
    mainWindow.setIcon(iconImage);
  }

  const browserUserAgent = mainWindow.webContents.session.getUserAgent();
  if (!browserUserAgent.includes(APP_USER_AGENT)) {
    mainWindow.webContents.session.setUserAgent(`${browserUserAgent} ${APP_USER_AGENT}`);
  }

  const notifyWindowState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('window:state', { maximized: mainWindow.isMaximized() });
  };
  mainWindow.on('resize', () => scheduleWindowStateSave(mainWindow));
  mainWindow.on('move', () => scheduleWindowStateSave(mainWindow));
  mainWindow.on('maximize', () => { scheduleWindowStateSave(mainWindow); notifyWindowState(); });
  mainWindow.on('unmaximize', () => { scheduleWindowStateSave(mainWindow); notifyWindowState(); });
  mainWindow.on('close', () => writeWindowState(mainWindow));

  mainWindow.once('ready-to-show', () => {
    if (!saved) mainWindow.center();
    if (saved?.maximized) mainWindow.maximize();
    mainWindow.show();
    notifyWindowState();
  });
  mainWindow.loadURL(localServerUrl);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function registerIpc() {
  ipcMain.handle('window:minimize', event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.minimize();
  });
  ipcMain.handle('window:toggle-maximize', event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    const maximize = !win.isMaximized();
    if (maximize) win.maximize(); else win.unmaximize();
    return maximize;
  });
  ipcMain.handle('window:get-state', event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return { maximized: !!win?.isMaximized() };
  });
  ipcMain.handle('window:close', event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  });
  ipcMain.handle('app:open-data-dir', async () => {
    await shell.openPath(dataDir);
  });
  ipcMain.handle('app:get-info', () => ({
    name: APP_NAME,
    version: app.getVersion(),
    platform: process.platform,
    dataDir,
    serverUrl: localServerUrl
  }));
}

app.setName(APP_NAME);

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    if (process.platform === 'darwin') {
      app.setAboutPanelOptions({
        applicationName: APP_NAME,
        applicationVersion: app.getVersion(),
        copyright: 'Copyright (c) 2026 AKISATO',
        credits: 'Independent third-party tool. Not affiliated with Bangumi.'
      });
    }
    Menu.setApplicationMenu(null);
    await ensureDataDirs();
    registerIpc();
    await startLocalServer();
    createMainWindow();
    setTimeout(() => {
      optimizeExistingOversizedCovers().catch(error => {
        console.warn('[cover-cache] background optimization failed:', error?.message || error);
      });
    }, 1200);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && localServerUrl) createMainWindow();
  });

  app.on('window-all-closed', () => {
    if (localServer) localServer.close();
    if (process.platform !== 'darwin') app.quit();
  });
}
