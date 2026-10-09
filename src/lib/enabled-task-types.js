import { isDIEnabled } from "./di-feature.js";

export const ALL_TASK_TYPES = ["RA", "RS", "RL", "WFD", "RTS", "DI", "WE"];
export const HOME_TASK_TYPES = ["RA", "WFD", "RTS", "DI", "WE"];
export const HOME_TASK_TYPE_ORDER = HOME_TASK_TYPES;

export const HOME_TASK_TYPE_META = {
  RA: { label: "RA", name: "朗读句子", path: "/ra" },
  WFD: { label: "WFD", name: "写作填空", path: "/wfd" },
  RTS: { label: "RTS", name: "情景回应", path: "/rts" },
  DI: { label: "DI", name: "描述图表", path: "/di" },
  WE: { label: "WE", name: "写作议论文", path: "/we" }
};

export function getEnabledTaskTypes(options = {}) {
  const sourceTypes = Array.isArray(options.types)
    ? options.types
    : ALL_TASK_TYPES;
  const diEnabled = typeof options.diEnabled === "boolean"
    ? options.diEnabled
    : isDIEnabled();

  return sourceTypes
    .map((taskType) => `${taskType || ""}`.trim().toUpperCase())
    .filter((taskType, index, list) => ALL_TASK_TYPES.includes(taskType) && list.indexOf(taskType) === index)
    .filter((taskType) => taskType !== "DI" || diEnabled);
}

export function getEnabledTaskTypeSet(options = {}) {
  return new Set(getEnabledTaskTypes(options));
}

// Cached/model-written prose can mention a closed task even after its task list was filtered.
export function hasUnavailableTaskRecommendation(suggestion, options = {}) {
  const source = suggestion && typeof suggestion === 'object' ? suggestion : {};
  const available = new Set(getEnabledTaskTypes(options));
  const closed = ALL_TASK_TYPES.filter(type => !available.has(type));
  const codes = [source.main_task_type, ...(Array.isArray(source.tasks) ? source.tasks.map(task => task?.task_type) : [])];
  const text = [source.headline, source.reason, source.advice, source.cta_text].filter(Boolean).join(' ');
  return closed.some(type => codes.some(code => String(code || '').toUpperCase() === type) || new RegExp(`\\b${type}\\b`, 'i').test(text));
}
