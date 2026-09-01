'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { initializeDesktop } = require('../lib/startup-sequence');

test('creates the window before waiting for data migration or the local server', async () => {
  const calls = [];
  let releaseData;
  const dataReady = new Promise(resolve => { releaseData = resolve; });

  const startup = initializeDesktop({
    configureDataPaths() { calls.push('paths'); },
    registerIpc() { calls.push('ipc'); },
    createMainWindow() { calls.push('window'); return { id: 1 }; },
    async ensureDataDirs() { calls.push('data:start'); await dataReady; calls.push('data:end'); },
    async startLocalServer() { calls.push('server'); },
    async loadMainPage() { calls.push('load'); }
  });

  await new Promise(resolve => setImmediate(resolve));
  try {
    assert.deepEqual(calls, ['paths', 'ipc', 'window', 'data:start']);
  } finally {
    releaseData();
  }
  await startup;
  assert.deepEqual(calls, ['paths', 'ipc', 'window', 'data:start', 'data:end', 'server', 'load']);
});

test('keeps the native window created when initialization rejects', async () => {
  const calls = [];
  const expected = new Error('blocked data directory');

  await assert.rejects(initializeDesktop({
    configureDataPaths() { calls.push('paths'); },
    registerIpc() { calls.push('ipc'); },
    createMainWindow() { calls.push('window'); return { id: 1 }; },
    async ensureDataDirs() { calls.push('data'); throw expected; },
    async startLocalServer() { calls.push('server'); },
    async loadMainPage() { calls.push('load'); }
  }), expected);

  assert.deepEqual(calls, ['paths', 'ipc', 'window', 'data']);
});
