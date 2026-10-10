import { getEnabledTaskTypes } from "./enabled-task-types.js";

// Each open task type links straight to its own page. RS/RL names follow src/stores/practice.js;
// the rest match the home task cards.
export const PRACTICE_NAV_META = {
  RA: { name: "朗读句子", to: "/ra" },
  RS: { name: "复述句子", to: "/rs" },
  RL: { name: "复述讲座", to: "/rl" },
  WFD: { name: "听写句子", to: "/wfd" },
  RTS: { name: "情景回应", to: "/rts" },
  DI: { name: "描述图表", to: "/di" },
  WE: { name: "写作议论文", to: "/we" }
};

export const PRIMARY_NAV_ITEMS = [
  { key: "home", label: "首页", short: "首页", to: "/home" },
  { key: "agent", label: "AI 私教", short: "AI 私教", to: "/agent" },
  { key: "profile", label: "个人中心", short: "我的", to: "/profile" }
];

export function buildPracticeNavItems(options = {}) {
  return getEnabledTaskTypes(options).map((taskType) => ({
    key: taskType,
    code: taskType,
    label: PRACTICE_NAV_META[taskType].name,
    to: PRACTICE_NAV_META[taskType].to
  }));
}

// A practice entry stays highlighted on its sub-pages (/rts/list, /wfd/practice…).
export function isNavItemActive(item, path = "") {
  const current = `${path || ""}`.split(/[?#]/)[0] || "/";
  if (item.key === "home") return current === "/home" || current === "/";
  return current === item.to || current.startsWith(`${item.to}/`);
}
