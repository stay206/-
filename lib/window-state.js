'use strict';

const MIN_WINDOW_WIDTH = 1040;
const MIN_WINDOW_HEIGHT = 680;

function normalizeWindowState(saved, workAreas) {
  const bounds = saved?.bounds;
  if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return null;
  if (bounds.width < MIN_WINDOW_WIDTH || bounds.height < MIN_WINDOW_HEIGHT) return null;

  const areas = workAreas.filter(area => (
    area && [area.x, area.y, area.width, area.height].every(Number.isFinite) &&
    area.width > 0 && area.height > 0
  ));
  if (!areas.length) return null;

  const overlapArea = area => {
    const width = Math.max(0, Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x));
    const height = Math.max(0, Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y));
    return width * height;
  };
  const target = areas.reduce((best, area) => overlapArea(area) > overlapArea(best) ? area : best, areas[0]);
  const width = Math.max(MIN_WINDOW_WIDTH, Math.min(Math.round(bounds.width), Math.round(target.width)));
  const height = Math.max(MIN_WINDOW_HEIGHT, Math.min(Math.round(bounds.height), Math.round(target.height)));
  const maxX = target.x + Math.max(0, target.width - width);
  const maxY = target.y + Math.max(0, target.height - height);
  const x = Math.min(Math.max(Math.round(bounds.x), target.x), maxX);
  const y = Math.min(Math.max(Math.round(bounds.y), target.y), maxY);

  return { bounds: { x, y, width, height }, maximized: !!saved.maximized };
}

module.exports = { MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH, normalizeWindowState };
