'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const packageJson = require('../package.json');
const packageLock = require('../package-lock.json');

const root = path.join(__dirname, '..');

function sourceManifestEntries() {
  return fs.readFileSync(path.join(root, 'scripts', 'source-package-manifest.txt'), 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
}

test('packages the startup helper modules used by main.js', () => {
  assert.ok(packageJson.build.files.includes('lib/**/*'));
});

test('packages the HTML application and Windows build resources', () => {
  const resources = new Map(packageJson.build.extraResources.map(item => [item.from, item.to]));
  assert.equal(resources.get('app'), 'app');
  assert.equal(resources.get('build'), 'build');
  assert.equal(packageJson.build.win.icon, 'build/icon.ico');
  assert.equal(packageJson.build.nsis.include, 'build/installer.nsh');
});

test('uses the same Electron version for source startup and release builds', () => {
  const version = packageJson.devDependencies.electron.replaceAll('.', '\\.');
  const launcher = fs.readFileSync(path.join(root, 'Start-BangumiVault-Desktop.cmd'), 'utf8');
  const installer = fs.readFileSync(path.join(root, 'Install-Desktop-Dependencies.cmd'), 'utf8');
  const builder = fs.readFileSync(path.join(root, 'Build-Windows-Desktop.cmd'), 'utf8');
  const runtime = fs.readFileSync(path.join(root, 'Install-Electron-Runtime.ps1'), 'utf8');
  assert.match(launcher, new RegExp(`ELECTRON_VERSION=${version}`));
  assert.match(installer, new RegExp(`ELECTRON_VERSION=${version}`));
  assert.match(builder, new RegExp(`-Version ${version}`));
  assert.match(runtime, new RegExp(`Version = "${version}"`));
});

test('keeps package-lock root dependencies aligned with package.json', () => {
  assert.deepEqual(packageLock.packages[''].devDependencies, packageJson.devDependencies);
});

test('source archive exactly matches its manifest and emits a verified checksum', t => {
  assert.match(packageJson.scripts['source:zip'], /scripts\/package-source\.ps1/);
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bangumi-vault-source-'));
  t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));

  const archiveName = `Bangumi-Vault-v${packageJson.version}-source.zip`;
  const archivePath = path.join(temporaryDirectory, archiveName);
  const scriptPath = path.join(root, 'scripts', 'package-source.ps1');
  const packaged = childProcess.spawnSync('powershell', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', scriptPath,
    '-OutputPath', archivePath
  ], { encoding: 'utf8' });
  assert.equal(packaged.status, 0, `${packaged.stdout}\n${packaged.stderr}`);

  const checksumPath = `${archivePath}.sha256`;
  assert.ok(fs.existsSync(archivePath));
  assert.ok(fs.existsSync(checksumPath));
  const hash = crypto.createHash('sha256').update(fs.readFileSync(archivePath)).digest('hex');
  assert.equal(fs.readFileSync(checksumPath, 'utf8').trim(), `${hash}  ${archiveName}`);

  const listArchive = String.raw`
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($env:BANGUMI_SOURCE_ARCHIVE)
    try {
      $archive.Entries | Where-Object { $_.Name } | ForEach-Object {
        [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($_.FullName))
      }
    } finally {
      $archive.Dispose()
    }
  `;
  const listed = childProcess.spawnSync('powershell', ['-NoProfile', '-Command', listArchive], {
    encoding: 'utf8',
    env: { ...process.env, BANGUMI_SOURCE_ARCHIVE: archivePath }
  });
  assert.equal(listed.status, 0, `${listed.stdout}\n${listed.stderr}`);

  const archiveRoot = `Bangumi-Vault-v${packageJson.version}-source`;
  const actualEntries = listed.stdout.trim().split(/\r?\n/).filter(Boolean)
    .map(value => Buffer.from(value.trim(), 'base64').toString('utf8'))
    .sort();
  const expectedEntries = sourceManifestEntries().map(value => `${archiveRoot}/${value}`).sort();
  assert.deepEqual(actualEntries, expectedEntries);
  for (const forbidden of ['/node_modules/', '/dist/', '/release/', '/VaultData/', '/资料库/']) {
    assert.ok(actualEntries.every(entry => !entry.includes(forbidden)), `forbidden archive path: ${forbidden}`);
  }
});
