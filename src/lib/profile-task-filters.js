import { ALL_TASK_TYPES, getEnabledTaskTypes } from "./enabled-task-types.js";

const FOCUS_MODULE_CANDIDATES = ["RA", "DI", "WFD", "RTS", "WE", "RS"];

function closedTaskTypes(options) {
  const enabled = new Set(getEnabledTaskTypes(options));
  return ALL_TASK_TYPES.filter((taskType) => !enabled.has(taskType));
}

// Profile data may be free text ("RA", "DI 描述图表"); drop any entry that names a closed task type.
export function withoutClosedTaskTypes(items, options = {}) {
  const closed = closedTaskTypes(options);
  return (Array.isArray(items) ? items : []).filter((item) => (
    !closed.some((taskType) => new RegExp(`\\b${taskType}\\b`, "i").test(`${item ?? ""}`))
  ));
}

// Least-practised open task types first, so the profile suggests what needs attention.
export function rankFocusModules(completedCounts = {}, options = {}) {
  const enabled = new Set(getEnabledTaskTypes(options));
  return FOCUS_MODULE_CANDIDATES
    .filter((taskType) => enabled.has(taskType))
    .map((taskType) => ({ taskType, count: Number(completedCounts?.[taskType] || 0) }))
    .sort((left, right) => left.count - right.count)
    .map((item) => item.taskType)
    .slice(0, 3);
}

// The total follows the visible tiles so a closed type's favorites never inflate the headline number.
export function visibleFavoriteTiles(tiles, countsByTask = {}, options = {}) {
  const enabled = new Set(getEnabledTaskTypes(options));
  const items = (Array.isArray(tiles) ? tiles : [])
    .filter((tile) => enabled.has(tile.type))
    .map((tile) => ({ ...tile, count: Number(countsByTask?.[tile.type] || 0) }));
  return { items, total: items.reduce((sum, tile) => sum + tile.count, 0) };
}
