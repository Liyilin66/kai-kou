const IMAGE_TYPE_ORDER = ["map", "bar", "process", "line", "pie"];

export const DI_IMAGE_TYPE_FILTERS = [
  { id: "map", label: "地图题" },
  { id: "bar", label: "柱状图" },
  { id: "process", label: "流程图" },
  { id: "line", label: "折线图" },
  { id: "pie", label: "饼图" }
];

const IMAGE_TYPE_META = {
  map: {
    label: "地图题",
    badgeClass: "bg-[#DBEAFE] text-[#1D4ED8]"
  },
  bar: {
    label: "柱状图",
    badgeClass: "bg-[#FFE8D6] text-[#C2410C]"
  },
  process: {
    label: "流程图",
    badgeClass: "bg-[#DCFCE7] text-[#166534]"
  },
  line: {
    label: "折线图",
    badgeClass: "bg-[#F3E8FF] text-[#7E22CE]"
  },
  pie: {
    label: "饼图",
    badgeClass: "bg-[#FEF3C7] text-[#A16207]"
  }
};

const TEMPLATE_DATA = {
  map: {
    title: "地图题模板",
    modelReading:
      "The map illustrates how a coastal town changed over time, highlighting key replacements in land use and infrastructure.",
    steps: [
      { num: 1, title: "整体概述", hint: "先说这是哪类地图，时间范围和总体变化。" },
      { num: 2, title: "描述关键区域", hint: "从左到右或从北到南，按区域讲变化。" },
      { num: 3, title: "对比变化", hint: "突出“被替换”“新增”“扩张”的位置。" },
      { num: 4, title: "总结", hint: "一句话收尾：最大变化点和趋势。" }
    ],
    exampleOpener:
      'The <span class="slot" data-word="map">map</span> illustrates the <span class="slot" data-word="changes">changes</span> in a coastal town over 50 years. Looking at the northern area, we can see that a <span class="slot" data-word="forest">forest</span> has been replaced by residential housing.',
    fullExample:
      "The map illustrates changes in a small coastal town between 1970 and 2020. Overall, the area became more urbanized and transport facilities were expanded. In the northern part, a large forested zone was converted into residential housing, while a new road connected this area to the town center. In the east, the old market was replaced by a shopping complex and a parking lot. By contrast, the southern waterfront remained relatively stable, although a walking path and a small pier were added. In short, the town shifted from natural land use to modern residential and commercial functions.",
    phrases: {
      location: ["in the northern area", "on the eastern side", "in the town center", "along the coastline", "to the west of"],
      change: ["was replaced by", "was converted into", "expanded significantly", "remained unchanged", "was newly introduced"],
      summary: ["Overall, the area became more urbanized.", "The most noticeable change is ...", "In short, the town developed toward ..."]
    },
    tips: [
      { em: "先总览后细节", text: "开头先概括“哪里变了、变得怎样”，再进区域细节。" },
      { em: "按路线描述", text: "固定方向（北→南）讲，避免来回跳点。" },
      { em: "对比词要明显", text: "多用 replaced / while / by contrast 强化结构感。" }
    ],
    vocab: [
      { word: "residential", pos: "adj.", defEn: "related to houses and living areas", defZh: "住宅的，居住区的" },
      { word: "adjacent", pos: "adj.", defEn: "next to or very close to", defZh: "邻近的，毗邻的" },
      { word: "demolish", pos: "v.", defEn: "to destroy a building completely", defZh: "拆除，拆毁" },
      { word: "construct", pos: "v.", defEn: "to build something such as roads or buildings", defZh: "建造，施工" },
      { word: "expand", pos: "v.", defEn: "to increase in size or area", defZh: "扩展，扩大" }
    ]
  },
  bar: {
    title: "柱状图模板",
    modelReading:
      "The bar chart compares three age groups across five years, showing a clear rise in the middle-aged segment.",
    steps: [
      { num: 1, title: "图表定位", hint: "先说比较对象、维度和单位。" },
      { num: 2, title: "抓最大最小", hint: "优先报最高组和最低组。" },
      { num: 3, title: "讲趋势和差距", hint: "用 rose/fell/by contrast 讲变化。" },
      { num: 4, title: "一句总结", hint: "总结主趋势，不要重复数字。" }
    ],
    exampleOpener:
      'The <span class="slot" data-word="bar chart">bar chart</span> compares spending patterns among three age groups. The most striking feature is that the middle group shows a steady <span class="slot" data-word="increase">increase</span>, while the oldest group remains relatively <span class="slot" data-word="stable">stable</span>.',
    fullExample:
      "The bar chart compares spending levels among young, middle-aged, and senior consumers from 2018 to 2022. Overall, the middle-aged group spent the most in every year, and the gap widened over time. In 2018, this group started at around 35 units, compared with 25 for young consumers and 20 for seniors. By 2022, middle-aged spending rose to approximately 50 units, while the young group climbed more moderately to about 32. In contrast, senior spending changed only slightly and stayed below 25 throughout the period. In summary, spending growth was strongest in the middle-aged segment and weakest among seniors.",
    phrases: {
      location: ["for each group", "across the period", "in the final year", "at the beginning", "in comparison with"],
      change: ["rose steadily", "increased sharply", "remained stable", "declined slightly", "showed a gradual rise"],
      summary: ["Overall, the middle segment led consistently.", "The key pattern is ...", "The gap became wider over time."]
    },
    tips: [
      { em: "数字少而准", text: "每段挑 2-3 个关键数，不要全报。" },
      { em: "先比较再趋势", text: "先说谁最高最低，再说如何变化。" },
      { em: "收尾要抽象", text: "总结“主趋势”，而不是再念一遍数值。" }
    ],
    vocab: [
      { word: "peak", pos: "n.", defEn: "the highest point or level", defZh: "峰值，最高点" },
      { word: "decline", pos: "v.", defEn: "to become less in amount", defZh: "下降，减少" },
      { word: "moderate", pos: "adj.", defEn: "not extreme; reasonable in size", defZh: "适度的，中等的" },
      { word: "segment", pos: "n.", defEn: "a part of a larger group", defZh: "群体中的一部分" },
      { word: "consistent", pos: "adj.", defEn: "staying the same in quality or pattern", defZh: "持续一致的" }
    ]
  },
  process: {
    title: "流程图模板",
    modelReading:
      "The process diagram outlines how coffee is produced, from harvesting beans to packaging the final product.",
    steps: [
      { num: 1, title: "流程总述", hint: "先说这是线性流程还是循环流程。" },
      { num: 2, title: "前半流程", hint: "按步骤编号讲前段动作。" },
      { num: 3, title: "后半流程", hint: "接着讲处理、输出和终点。" },
      { num: 4, title: "结论", hint: "强调关键阶段或耗时步骤。" }
    ],
    exampleOpener:
      'The <span class="slot" data-word="process">process</span> diagram shows how raw materials are transformed into a finished product. It is a <span class="slot" data-word="linear">linear</span> sequence with four major stages, beginning with collection and ending with <span class="slot" data-word="distribution">distribution</span>.',
    fullExample:
      "The process diagram illustrates how coffee is produced and delivered to consumers. Overall, it is a linear process with multiple treatment stages before packaging. First, coffee cherries are harvested and sorted to remove defective beans. Next, the beans are dried and then roasted at high temperature to develop flavor. After roasting, they are cooled and ground into fine powder. The powder is then packed in sealed containers to preserve freshness. In the final stage, the packaged coffee is transported to retail stores for sale. In summary, the process moves step by step from agricultural input to commercial distribution.",
    phrases: {
      location: ["in the first stage", "in the next step", "at this point", "in the final stage", "throughout the process"],
      change: ["is transferred to", "is processed by", "is heated and cooled", "is then packaged", "is delivered to"],
      summary: ["Overall, the process is linear.", "The key transformation occurs when ...", "Eventually, the final product is ..."]
    },
    tips: [
      { em: "严格按序", text: "流程题最怕跳步，必须按箭头顺序讲。" },
      { em: "多用被动语态", text: "如 is heated / is packaged，听起来更自然。" },
      { em: "结尾点终点", text: "最后一句说清最终产物和去向。" }
    ],
    vocab: [
      { word: "sequence", pos: "n.", defEn: "a set of actions in a particular order", defZh: "顺序，序列" },
      { word: "transform", pos: "v.", defEn: "to change completely in form", defZh: "转化，改变形态" },
      { word: "stage", pos: "n.", defEn: "a particular step in a process", defZh: "阶段，步骤" },
      { word: "output", pos: "n.", defEn: "the final product of a process", defZh: "产出，输出物" },
      { word: "distribute", pos: "v.", defEn: "to deliver goods to many places", defZh: "分发，配送" }
    ]
  },
  line: {
    title: "折线图模板",
    modelReading:
      "The line graph tracks online sales over twelve months and shows a sharp growth after mid-year.",
    steps: [
      { num: 1, title: "读图定位", hint: "先交代时间轴、指标和单位。" },
      { num: 2, title: "前段趋势", hint: "讲起点到中段的波动。" },
      { num: 3, title: "后段趋势", hint: "讲后半段峰值、低谷和转折。" },
      { num: 4, title: "总体结论", hint: "一句话总结整体走向。" }
    ],
    exampleOpener:
      'The <span class="slot" data-word="line graph">line graph</span> shows monthly sales over one year. Sales remained relatively <span class="slot" data-word="flat">flat</span> at first, then climbed <span class="slot" data-word="sharply">sharply</span> in the second half.',
    fullExample:
      "The line graph illustrates monthly online sales from January to December. Overall, sales were stable in the first half of the year, then increased rapidly and reached a peak in late autumn. At the beginning, the figure stayed around 15 to 18 units from January to May, with only minor fluctuations. From June onward, however, sales rose steadily and passed 30 units by August. The fastest growth occurred between September and November, when the value jumped to nearly 45 units. In December, there was a slight drop, but sales still ended far above the starting level. In summary, the chart shows a clear upward trend despite a small year-end correction.",
    phrases: {
      location: ["at the start of the year", "in the middle period", "toward the end", "between A and B", "over the whole period"],
      change: ["rose gradually", "jumped sharply", "dropped slightly", "peaked at", "remained stable"],
      summary: ["Overall, the trend is upward.", "The most notable shift happened in ...", "Despite fluctuations, the final level is higher."]
    },
    tips: [
      { em: "抓转折点", text: "折线图重点是拐点，不是每个点。" },
      { em: "分前后两段", text: "先讲前半走势，再讲后半走势更清晰。" },
      { em: "注意时态", text: "历史数据统一过去时，预测才用将来时。" }
    ],
    vocab: [
      { word: "fluctuate", pos: "v.", defEn: "to rise and fall irregularly", defZh: "波动，起伏" },
      { word: "surge", pos: "v.", defEn: "to increase suddenly and strongly", defZh: "激增，猛涨" },
      { word: "plateau", pos: "v.", defEn: "to stop rising and stay at one level", defZh: "进入平台期" },
      { word: "dip", pos: "n.", defEn: "a small and temporary fall", defZh: "小幅下降" },
      { word: "trajectory", pos: "n.", defEn: "the path of change over time", defZh: "变化轨迹" }
    ]
  },
  pie: {
    title: "饼图模板",
    modelReading:
      "The pie chart presents the distribution of household expenses, with housing taking the largest share.",
    steps: [
      { num: 1, title: "组成总览", hint: "先说这是占比图，点出最大项。" },
      { num: 2, title: "主次对比", hint: "比较前两大和最小项。" },
      { num: 3, title: "合并信息", hint: "把相近占比合并描述。" },
      { num: 4, title: "总结", hint: "归纳资源集中在哪些类别。" }
    ],
    exampleOpener:
      'The <span class="slot" data-word="pie chart">pie chart</span> illustrates how total spending is divided among five categories. Housing accounts for the <span class="slot" data-word="largest share">largest share</span>, while transport and leisure make up comparatively <span class="slot" data-word="smaller portions">smaller portions</span>.',
    fullExample:
      "The pie chart shows the percentage distribution of household expenditure across five categories. Overall, housing dominates the budget, whereas leisure receives the smallest proportion. Housing represents about 38 percent of total spending, clearly higher than food at roughly 24 percent. Transport and utilities account for similar shares, both close to 15 percent, and together they form nearly one-third of the total. Leisure contributes only around 8 percent, making it the least significant category. In summary, most spending is concentrated in essential needs, especially housing and food, while discretionary items remain limited.",
    phrases: {
      location: ["the largest proportion", "the second biggest share", "a relatively small segment", "roughly one third", "taken together"],
      change: ["accounts for", "makes up", "represents", "is slightly higher than", "is considerably lower than"],
      summary: ["Overall, spending is concentrated in essentials.", "The distribution is uneven.", "The chart highlights priority spending areas."]
    },
    tips: [
      { em: "先大后小", text: "先讲最大两项，再补最小项和合并项。" },
      { em: "避免机械报数", text: "用 share/proportion 让表达更自然。" },
      { em: "善用合并", text: "把接近比例合并，可减少信息噪音。" }
    ],
    vocab: [
      { word: "proportion", pos: "n.", defEn: "a part considered in relation to the whole", defZh: "比例，占比" },
      { word: "allocate", pos: "v.", defEn: "to distribute for a particular purpose", defZh: "分配，划拨" },
      { word: "dominant", pos: "adj.", defEn: "more important or larger than others", defZh: "占主导的" },
      { word: "marginal", pos: "adj.", defEn: "small and less important", defZh: "边缘的，较小的" },
      { word: "category", pos: "n.", defEn: "a group of similar items", defZh: "类别，项目" }
    ]
  }
};

const TYPE_KEYWORDS = {
  map: ["map", "city", "town", "region", "location", "urban", "forest", "campus", "路线", "地图", "位置", "区域"],
  bar: ["bar", "column", "comparison", "category", "柱状", "条形", "对比"],
  process: ["process", "flow", "stage", "cycle", "步骤", "流程", "生产", "制造"],
  line: ["line", "trend", "time series", "over time", "折线", "趋势", "时间"],
  pie: ["pie", "share", "percentage", "distribution", "饼图", "占比", "比例"]
};

export function normalizeDIImageType(value) {
  const normalized = `${value || ""}`.trim().toLowerCase();
  if (IMAGE_TYPE_ORDER.includes(normalized)) return normalized;
  return "";
}

export function inferDIImageTypeFromText(...fields) {
  const merged = fields.map((item) => `${item || ""}`.toLowerCase()).join(" ");
  for (const type of IMAGE_TYPE_ORDER) {
    const keywords = TYPE_KEYWORDS[type] || [];
    if (keywords.some((keyword) => merged.includes(keyword))) {
      return type;
    }
  }
  return "";
}

export function getDIImageTypeMeta(type) {
  const normalizedType = normalizeDIImageType(type) || "map";
  return IMAGE_TYPE_META[normalizedType] || IMAGE_TYPE_META.map;
}

export function getDITemplateByType(type) {
  const normalizedType = normalizeDIImageType(type) || "map";
  return TEMPLATE_DATA[normalizedType] || TEMPLATE_DATA.map;
}
