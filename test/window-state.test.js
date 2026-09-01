'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeWindowState } = require('../lib/window-state');

test('moves a nearly off-screen window fully back into its display work area', () => {
  const saved = {
    bounds: { x: 1919, y: 200, width: 1200, height: 800 },
    maximized: false
  };
  const workAreas = [{ x: 0, y: 0, width: 1920, height: 1040 }];

  assert.deepEqual(normalizeWindowState(saved, workAreas), {
    bounds: { x: 720, y: 200, width: 1200, height: 800 },
    maximized: false
  });
});

test('uses the primary work area when the saved display no longer exists', () => {
  const saved = {
    bounds: { x: 5000, y: 300, width: 1400, height: 900 },
    maximized: true
  };
  const workAreas = [{ x: 0, y: 0, width: 1920, height: 1040 }];

  assert.deepEqual(normalizeWindowState(saved, workAreas), {
    bounds: { x: 520, y: 140, width: 1400, height: 900 },
    maximized: true
  });
});

test('keeps a window on the secondary display that contains most of it', () => {
  const saved = {
    bounds: { x: -1500, y: 50, width: 1200, height: 800 },
    maximized: false
  };
  const workAreas = [
    { x: 0, y: 0, width: 1920, height: 1040 },
    { x: -1600, y: 0, width: 1600, height: 900 }
  ];

  assert.deepEqual(normalizeWindowState(saved, workAreas), saved);
});
