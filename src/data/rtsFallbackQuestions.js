import promptSource from "./rtsPromptSource.json";

const TONE_LABEL_MAP = {
  formal: "\u6b63\u5f0f\u8bed\u6c14",
  informal: "\u975e\u6b63\u5f0f\u8bed\u6c14",
  "semi-formal": "\u534a\u6b63\u5f0f\u8bed\u6c14"
};

const TOPIC_PRIORITY = ["work", "social", "service", "daily"];

const SERVICE_KEYWORDS = [
  "librarian",
  "library staff",
  "manager",
  "officer",
  "staff",
  "ticket inspector",
  "maintenance team",
  "school management",
  "cafeteria",
  "traffic light",
  "damaged facilities",
  "accommodation",
  "road maintenance",
  "report"
];

const WORK_KEYWORDS = [
  "assignment",
  "course",
  "tutorial",
  "professor",
  "teacher",
  "tutor",
  "lecturer",
  "class",
  "exam",
  "speech",
  "presentation",
  "research project",
  "deadline",
  "submit",
  "volunteer",
  "notes",
  "study room",
  "open week",
  "grade"
];

const SOCIAL_KEYWORDS = [
  "friend",
  "classmate",
  "roommate",
  "flatmate",
  "neighbor",
  "group member",
  "sam",
  "lisa",
  "tom",
  "wife"
];

const DAILY_KEYWORDS = ["hiking", "dinner party", "birthday", "apartment", "trip", "party", "tickets", "phone", "road", "shoes"];

const FORMAL_AUDIENCE_KEYWORDS = [
  "professor",
  "teacher",
  "tutor",
  "lecturer",
  "librarian",
  "manager",
  "officer",
  "staff",
  "inspector",
  "maintenance team",
  "management team",
  "accommodation"
];

const INFORMAL_AUDIENCE_KEYWORDS = ["friend", "classmate", "roommate", "flatmate", "neighbor", "group member"];

const INTENT_KEYWORDS = {
  advice: ["advice", "suggest", "calm down", "recommend"],
  report: ["report", "not working", "broken", "damaged", "missing", "locked", "fallen", "run out of battery"],
  reschedule: ["alternative arrangement", "extension", "change the time", "double booked", "late", "missed the deadline", "at the same time"],
  boundary: ["too noisy", "disappearing", "copy your nearly completed assignment", "dirty common areas", "keeps talking"],
  initiative: ["volunteer", "interested in", "participating", "enroll", "research project"],
  decline: ["cannot attend", "cannot join", "can not attend", "can not join"],
  correction: ["made a mistake", "correct this information", "wrong address"],
  coordination: ["group assignment", "what you can do", "when the party will", "switch rooms", "hasn't sent", "has not finished"]
};

const OPENING_BANK = {
  formal: [
    "Hello, do you have a minute to discuss this?",
    "Hi, I would like to explain a situation and ask for your help.",
    "Good day, I need some assistance regarding this matter.",
    "Excuse me, may I briefly raise an issue?"
  ],
  informal: [
    "Hey, can I quickly talk to you about something?",
    "Hi, I need your help with a quick situation.",
    "Hey, I wanted to check with you about something important.",
    "Hi, can we sort this out together?"
  ],
  "semi-formal": [
    "Hi, could I run something by you for a moment?",
    "Hello, I wanted to explain this situation briefly.",
    "Hi there, I am hoping we can work out a quick solution.",
    "Hello, could we discuss this for a minute?"
  ]
};

const CLOSING_BANK = {
  formal: [
    "Thank you for your understanding and support.",
    "I appreciate your time and guidance.",
    "Thanks for helping me handle this properly.",
    "I am grateful for your help."
  ],
  informal: ["Thanks a lot for understanding.", "I really appreciate your help.", "Thanks for being flexible with me.", "I owe you one for this."],
  "semi-formal": [
    "Thanks for understanding and helping out.",
    "I appreciate your support on this.",
    "Thank you for working this out with me.",
    "Thanks for your time and help."
  ]
};

const REQUEST_BANK = {
  advice: [
    "Could you try this plan for a week and see how it goes?",
    "Start with one small action first, then build from there.",
    "Would it help if you set one clear goal for this week?",
    "Try asking for support early instead of waiting."
  ],
  report: [
    "Could you please check this issue and advise me on the next step?",
    "Would you be able to record this problem and arrange a fix?",
    "Can you tell me what process I should follow now?",
    "Could you help me resolve this as soon as possible?"
  ],
  reschedule: [
    "Could we move this to another time that works for both sides?",
    "May I request an extension so I can submit proper work?",
    "Would an alternative arrangement be possible?",
    "Could we agree on a revised time and deadline?"
  ],
  boundary: [
    "Could we keep the noise down so I can focus?",
    "Please stop using my things without asking first.",
    "Can we agree on a fair rule for shared spaces?",
    "Could we solve this in a respectful way?"
  ],
  initiative: [
    "I would like to take part and can commit my time.",
    "Could you share the requirements so I can prepare well?",
    "I am interested in helping and taking responsibility.",
    "Would you consider me for this role?"
  ],
  decline: [
    "I really want to join, but I cannot commit this time.",
    "Could we plan another time so I do not let you down?",
    "I hope you can understand this conflict in schedule.",
    "Can I support in another way instead?"
  ],
  correction: [
    "I need to correct the information I gave earlier.",
    "Please ignore my previous message and use this updated detail.",
    "I am sorry for the confusion and want to fix it now.",
    "Can you update your plan based on the correct time?"
  ],
  coordination: [
    "Can we divide tasks so everything still gets done on time?",
    "Could we agree on a practical backup plan now?",
    "Would you be okay with this adjusted arrangement?",
    "Can we confirm the new timing and responsibilities?"
  ],
  help: [
    "Could you please help me with this when you have a moment?",
    "Would you mind sharing your notes or guidance?",
    "Can you point me to the fastest solution?",
    "Could we handle this together quickly?"
  ],
  general: [
    "Could you help me with this situation?",
    "Would you mind discussing a practical solution?",
    "Can we agree on the best next step?",
    "Could we sort this out today?"
  ]
};

const TIP_BANK = {
  advice: [
    "Acknowledge feelings before giving advice.",
    "Offer two concrete actions, not vague motivation.",
    "Use realistic time frames and simple steps.",
    "Close with encouragement and availability."
  ],
  report: [
    "State what is broken in one clear sentence.",
    "Include location, time, and urgency if relevant.",
    "Ask for next steps instead of waiting silently.",
    "Keep a calm and cooperative tone."
  ],
  reschedule: [
    "Explain the conflict early and honestly.",
    "Show responsibility for the original commitment.",
    "Propose a specific alternative time or deadline.",
    "Thank the listener for flexibility."
  ],
  boundary: [
    "Describe behavior, not personal attacks.",
    "Explain impact on study, sleep, or deadlines.",
    "Request one clear change in behavior.",
    "Stay calm to avoid escalation."
  ],
  initiative: [
    "Show interest and readiness with specifics.",
    "Mention how your skills match the task.",
    "Ask practical questions about timing and scope.",
    "End with a clear willingness to follow up."
  ],
  decline: [
    "Express appreciation before declining.",
    "Give a brief and truthful reason.",
    "Offer an alternative if possible.",
    "Keep the relationship warm and respectful."
  ],
  correction: [
    "Correct wrong information immediately.",
    "State the accurate detail very clearly.",
    "Apologize briefly without overexplaining.",
    "Confirm the listener has received the update."
  ],
  coordination: [
    "Align on roles and deadlines quickly.",
    "Mention dependencies and blockers directly.",
    "Suggest one practical backup option.",
    "Confirm the final plan in one sentence."
  ],
  help: [
    "Say what you need in one sentence.",
    "Give context so the other person can respond fast.",
    "Offer flexibility in timing or format.",
    "Close with appreciation."
  ],
  general: [
    "Open politely and get to the point.",
    "Keep your request specific and actionable.",
    "Use a tone that matches the relationship.",
    "Finish with thanks and next steps."
  ]
};

function cleanContent(value) {
  return `${value || ""}`
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .trim();
}

function toLower(value) {
  return cleanContent(value).toLowerCase();
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function countMatches(text, keywords) {
  return keywords.reduce((sum, keyword) => sum + (text.includes(keyword) ? 1 : 0), 0);
}

const MANUAL_TOPIC_GROUPS = {
  service: new Set([1, 4, 5, 10, 22, 32, 37, 45, 47, 51, 55]),
  daily: new Set([20, 36, 52, 56]),
  social: new Set([3, 6, 7, 8, 11, 12, 13, 14, 16, 18, 19, 21, 23, 26, 27, 30, 31, 39, 43, 46, 50, 53, 57, 59])
};

const MANUAL_DIFFICULTY = {
  easy: new Set([4, 8, 11, 14, 16, 19, 22, 23, 24, 25, 27, 29, 36, 40, 42, 43, 45, 47, 52, 54, 57, 60]),
  hard: new Set([6, 7, 9, 30, 35, 41, 48, 58, 61])
};

function resolveTopic(content, index) {
  const no = Number(index) + 1;
  if (MANUAL_TOPIC_GROUPS.service.has(no)) return "service";
  if (MANUAL_TOPIC_GROUPS.daily.has(no)) return "daily";
  if (MANUAL_TOPIC_GROUPS.social.has(no)) return "social";

  const lower = toLower(content);
  const scores = { work: 0, daily: 0, service: 0, social: 0 };

  scores.service += countMatches(lower, SERVICE_KEYWORDS) * 3;
  scores.work += countMatches(lower, WORK_KEYWORDS) * 2;
  scores.social += countMatches(lower, SOCIAL_KEYWORDS) * 2;
  scores.daily += countMatches(lower, DAILY_KEYWORDS) * 2;

  if (includesAny(lower, ["library", "cafeteria", "ticket", "management team", "maintenance"])) scores.service += 4;
  if (includesAny(lower, ["assignment", "professor", "teacher", "tutor", "lecturer", "exam", "course"])) scores.work += 5;
  if (includesAny(lower, ["friend", "roommate", "flatmate", "classmate", "neighbor"])) scores.social += 4;
  if (includesAny(lower, ["hiking", "birthday", "dinner party", "apartment"])) scores.daily += 4;

  if (Object.values(scores).every((value) => value === 0)) {
    return index % 2 === 0 ? "work" : "daily";
  }

  return TOPIC_PRIORITY.reduce((best, key) => (scores[key] > scores[best] ? key : best), "work");
}

function resolveAudience(content) {
  const lower = toLower(content);
  if (includesAny(lower, ["professor", "teacher", "tutor", "lecturer"])) return "your teacher or tutor";
  if (includesAny(lower, ["librarian", "library staff"])) return "library staff";
  if (includesAny(lower, ["manager"])) return "the manager";
  if (includesAny(lower, ["officer"])) return "the officer";
  if (includesAny(lower, ["ticket inspector"])) return "the ticket inspector";
  if (includesAny(lower, ["maintenance team", "management team"])) return "the support team";
  if (includesAny(lower, ["roommate", "flatmate"])) return "your roommate";
  if (includesAny(lower, ["neighbor"])) return "your neighbor";
  if (includesAny(lower, ["friend", "lisa", "tom"])) return "your friend";
  if (includesAny(lower, ["classmate", "group member", "students"])) return "your classmate(s)";
  return "the relevant person";
}

function resolveTone(content, topic, audience) {
  const lower = toLower(content);
  if (includesAny(lower, FORMAL_AUDIENCE_KEYWORDS) || topic === "service") return "formal";
  if (includesAny(lower, INFORMAL_AUDIENCE_KEYWORDS) || audience.includes("friend") || audience.includes("roommate")) return "informal";
  if (topic === "work") return "semi-formal";
  return "semi-formal";
}

function resolveIntent(content) {
  const lower = toLower(content);
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (includesAny(lower, keywords)) return intent;
  }
  if (includesAny(lower, ["borrow", "lend", "help", "ask"])) return "help";
  return "general";
}

function resolveDifficulty(content, intentMeta) {
  const no = Number(intentMeta?.__no || 0);
  if (MANUAL_DIFFICULTY.easy.has(no)) return 1;
  if (MANUAL_DIFFICULTY.hard.has(no)) return 3;
  return 2;
}

function stripPromptTail(content) {
  return cleanContent(content)
    .replace(/\s*what would you say.*$/i, "")
    .replace(/\s*what should you say.*$/i, "")
    .replace(/\s*how would you.*$/i, "")
    .replace(/\s*what will you say.*$/i, "")
    .replace(/\s*what do you say.*$/i, "")
    .replace(/\s*what are you going to say.*$/i, "")
    .trim();
}

function truncateWords(text, maxWords) {
  const words = cleanContent(text).split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ");
}

function toFirstPerson(text) {
  return cleanContent(text)
    .replace(/\b[Yy]our\b/g, "my")
    .replace(/\b[Yy]ou're\b/g, "I'm")
    .replace(/\b[Yy]ou've\b/g, "I've")
    .replace(/^You are\b/i, "I am")
    .replace(/^You were\b/i, "I was")
    .replace(/^You have\b/i, "I have")
    .replace(/^You just\b/i, "I just")
    .replace(/\b[Yy]ou are\b/g, "I am")
    .replace(/\b[Yy]ou were\b/g, "I was")
    .replace(/\b[Yy]ou have\b/g, "I have")
    .replace(/\b[Yy]ou need to\b/g, "I need to")
    .replace(/\b[Yy]ou need\b/g, "I need")
    .replace(/\b[Yy]ou want to\b/g, "I want to")
    .replace(/\b[Yy]ou want\b/g, "I want")
    .replace(/\b[Yy]ou can\b/g, "I can")
    .replace(/\b[Yy]ou cannot\b/g, "I cannot")
    .replace(/\b[Yy]ou should\b/g, "I should")
    .replace(/\bhelp you\b/gi, "help me")
    .replace(/\bfor you\b/gi, "for me")
    .replace(/\bwith you\b/gi, "with me")
    .replace(/^You\b/i, "I");
}

function pickRotating(list, count, seed) {
  if (!Array.isArray(list) || !list.length) return [];
  const offset = Math.abs(Number(seed || 0)) % list.length;
  const output = [];
  for (let i = 0; i < Math.max(1, count); i += 1) {
    output.push(list[(offset + i) % list.length]);
  }
  return [...new Set(output)].slice(0, count);
}

function splitScenarioClauses(text) {
  const normalized = cleanContent(text)
    .replace(/[!?]+/g, ".")
    .replace(/\s*;\s*/g, ". ")
    .replace(/\s*,\s*(but|and|so|because|while|however|which)\b/gi, ". ");

  return normalized
    .split(/(?<=[.])\s+|\.\s+/)
    .map((line) => cleanContent(line))
    .filter(Boolean);
}

function buildScenarioSummary(scenario) {
  const clauses = splitScenarioClauses(toFirstPerson(scenario)).filter(Boolean);

  const best = clauses[0] || toFirstPerson(scenario) || "I need to explain a quick situation";
  return truncateWords(best, 22);
}

function buildDirections(intent, scenario) {
  const concise = truncateWords(scenario, 20);
  const ruleMap = {
    advice: [
      { head: "Start with empathy", body: "Acknowledge the other person's feelings before advice.", eg: "I understand this feels stressful, and that reaction is completely normal." },
      { head: "Give practical actions", body: "Offer two realistic steps that can be done this week.", eg: "Try one small action today, then repeat it at the same time tomorrow." },
      { head: "Finish with support", body: "Encourage them and offer follow-up support.", eg: "If you want, we can check in again after you try this plan." }
    ],
    report: [
      { head: "Report the issue clearly", body: "State what is wrong and where it happened.", eg: `I'm reporting a problem: ${concise}.` },
      { head: "Explain urgency or impact", body: "Briefly describe why the issue needs attention.", eg: "This is affecting my study schedule and needs a quick fix." },
      { head: "Ask for next steps", body: "Request the exact process or timeline.", eg: "Could you tell me the next step and expected timeline?" }
    ],
    reschedule: [
      { head: "Explain the conflict early", body: "Share the reason and timing in one concise statement.", eg: "I have a schedule conflict and want to inform you as early as possible." },
      { head: "Request an alternative", body: "Suggest a specific new time or extension.", eg: "Would it be possible to move this to another slot or extend the deadline?" },
      { head: "Show responsibility", body: "Commit to completing the task properly.", eg: "I will still complete the work to the expected standard." }
    ],
    boundary: [
      { head: "Describe behavior calmly", body: "Focus on facts instead of blame.", eg: "I want to mention one issue that has been happening recently." },
      { head: "State the impact", body: "Explain how it affects your study, sleep, or work.", eg: "It is affecting my concentration and I need to fix it." },
      { head: "Set a clear request", body: "Ask for one concrete change in behavior.", eg: "Could we agree on a clear rule from now on?" }
    ],
    initiative: [
      { head: "Express interest clearly", body: "Say you want to join and contribute.", eg: "I am very interested in this opportunity and would like to join." },
      { head: "Show suitability", body: "Mention one or two strengths relevant to the task.", eg: "I can contribute reliably and communicate well with the team." },
      { head: "Ask practical details", body: "Confirm requirements, timing, and responsibilities.", eg: "Could you share the requirements and expected timeline?" }
    ],
    decline: [
      { head: "Appreciate the invitation", body: "Start positively to protect the relationship.", eg: "Thanks for inviting me. I really appreciate it." },
      { head: "Explain briefly", body: "Give a short, truthful reason for declining.", eg: "I have a conflict this time and cannot join properly." },
      { head: "Offer an alternative", body: "Suggest another way to stay supportive.", eg: "I can still help in another way or join next time." }
    ],
    correction: [
      { head: "Correct quickly", body: "State that your earlier information was wrong.", eg: "I need to correct the information I gave you earlier." },
      { head: "Give the exact update", body: "Provide the corrected detail in one sentence.", eg: "The updated time is different, so please use this corrected version." },
      { head: "Confirm receipt", body: "Ask the listener to confirm they saw the correction.", eg: "Could you confirm you received this update?" }
    ],
    coordination: [
      { head: "State the blocker", body: "Explain what is missing or conflicting.", eg: "One key part is delayed, so we need to adjust quickly." },
      { head: "Propose a plan", body: "Suggest a practical split of tasks or revised timeline.", eg: "Can we divide tasks and lock a new deadline now?" },
      { head: "Align expectations", body: "Confirm responsibilities and next update point.", eg: "Let's confirm who does what and when we check back." }
    ],
    help: [
      { head: "Share context", body: "Explain the situation in one short line.", eg: `I am in a situation where ${concise}.` },
      { head: "Ask for specific help", body: "State exactly what help you need.", eg: "Could you help me with the key part that I'm missing?" },
      { head: "Close politely", body: "Thank them and offer flexibility.", eg: "I really appreciate it, and I can adjust to your time." }
    ],
    general: [
      { head: "Open clearly", body: "Introduce the situation in a direct way.", eg: "I wanted to explain this situation briefly." },
      { head: "Make the request", body: "Ask for one concrete action.", eg: "Could we agree on a practical solution today?" },
      { head: "Confirm next step", body: "End with timeline and appreciation.", eg: "Thanks for understanding. Please let me know the next step." }
    ]
  };
  return ruleMap[intent] || ruleMap.general;
}

function ensureWordRange(text, minWords, maxWords) {
  const filler = [
    "I want to handle this responsibly and avoid creating extra problems for others.",
    "If there is a better process, I am happy to follow it exactly.",
    "I am trying to communicate early so we can solve this smoothly."
  ];

  let words = cleanContent(text).split(/\s+/).filter(Boolean);
  let cursor = 0;
  while (words.length < minWords) {
    words = words.concat(filler[cursor % filler.length].split(/\s+/).filter(Boolean));
    cursor += 1;
  }

  if (words.length > maxWords) words = words.slice(0, maxWords);

  let output = words.join(" ").replace(/\s+([,.!?;:])/g, "$1");
  if (!/[.!?]$/.test(output)) output += ".";
  return output;
}

function buildTemplateOpener(tone, index) {
  return pickRotating(OPENING_BANK[tone] || OPENING_BANK["semi-formal"], 1, index)[0] || OPENING_BANK["semi-formal"][0];
}

function buildTemplateFull({ tone, intent, scenario, index }) {
  const opener = buildTemplateOpener(tone, index);
  const scenarioLine = buildScenarioSummary(scenario);

  const impactMap = {
    advice: "I know this can feel overwhelming, so I want to give practical support that is easy to follow.",
    report: "This problem is affecting normal study or daily activity, so I want to report it clearly and early.",
    reschedule: "I still care about completing the task well, and I do not want this conflict to reduce quality.",
    boundary: "I want to solve this respectfully, while still protecting study focus and shared rules.",
    initiative: "I am motivated to contribute and I am ready to take responsibility if selected.",
    decline: "I value this invitation and I do not want my schedule conflict to seem disrespectful.",
    correction: "I am correcting this immediately so no one is misled by my earlier message.",
    coordination: "I want us to stay aligned so the final result is not delayed.",
    help: "I am reaching out early so we can fix this efficiently.",
    general: "I am hoping we can find a practical solution quickly."
  };

  const requestMap = {
    advice: "My suggestion is to take one clear step today, then review what worked before the next task.",
    report: "Could you please advise me on the exact process and expected timeline for resolving it?",
    reschedule: "Would it be possible to arrange an alternative time or extension so I can submit properly?",
    boundary: "Could we agree on one clear rule from now on to prevent the same issue happening again?",
    initiative: "Could you share the requirements so I can prepare and contribute in the most useful way?",
    decline: "I cannot commit this time, but I would be happy to support in another way if that helps.",
    correction: "Please use this corrected information from now on, and let me know if anything is still unclear.",
    coordination: "Can we lock an updated plan now, including who handles each part and by when?",
    help: "Could you help me with the key part I am missing, or point me to the fastest solution?",
    general: "Could we discuss the best next step so this can be solved efficiently?"
  };

  const close = pickRotating(CLOSING_BANK[tone] || CLOSING_BANK["semi-formal"], 1, index + 1)[0];
  const message = [
    opener,
    `I am reaching out because ${scenarioLine}.`,
    impactMap[intent] || impactMap.general,
    requestMap[intent] || requestMap.general,
    "I am open to your suggestion and ready to cooperate with the final arrangement.",
    close
  ]
    .map((part) => cleanContent(part))
    .filter(Boolean)
    .join(" ");

  return ensureWordRange(message, 72, 108);
}

function buildPhrases(tone, intent, index) {
  return {
    opening: pickRotating(OPENING_BANK[tone] || OPENING_BANK["semi-formal"], 4, index),
    request: pickRotating(REQUEST_BANK[intent] || REQUEST_BANK.general, 4, index + 1),
    closing: pickRotating(CLOSING_BANK[tone] || CLOSING_BANK["semi-formal"], 4, index + 2)
  };
}

function buildTips(intent, index) {
  const tips = pickRotating(TIP_BANK[intent] || TIP_BANK.general, 4, index);
  return tips.length === 4 ? tips : pickRotating(TIP_BANK.general, 4, index + 3);
}

function buildRole(audience, intent) {
  const actionMap = {
    advice: "give practical advice",
    report: "report an issue and request handling",
    reschedule: "request a schedule change responsibly",
    boundary: "set a respectful boundary",
    initiative: "express interest and ask for details",
    decline: "decline politely while keeping goodwill",
    correction: "correct information quickly",
    coordination: "coordinate tasks and timing",
    help: "ask for specific help",
    general: "communicate and solve the situation clearly"
  };
  return `You are a student speaking to ${audience} to ${actionMap[intent] || actionMap.general}.`;
}

function buildQuestion(prompt, index) {
  const no = index + 1;
  const content = cleanContent(prompt);
  const topic = resolveTopic(content, index);
  const audience = resolveAudience(content);
  const intent = resolveIntent(content);
  const tone = resolveTone(content, topic, audience);
  const difficulty = resolveDifficulty(content, { __no: no, key: intent });
  const scenario = stripPromptTail(content);

  return {
    id: `RTS_Q${String(index + 1).padStart(3, "0")}`,
    task_type: "RTS",
    content,
    audio_url: "",
    topic,
    difficulty,
    is_active: true,
    key_points: {
      role: buildRole(audience, intent),
      tone,
      toneLabel: TONE_LABEL_MAP[tone],
      directions: buildDirections(intent, scenario),
      templateOpener: buildTemplateOpener(tone, index),
      templateFull: buildTemplateFull({ tone, intent, scenario, index }),
      phrases: buildPhrases(tone, intent, index),
      tips: buildTips(intent, index)
    }
  };
}

export const RTS_FALLBACK_QUESTIONS = (Array.isArray(promptSource) ? promptSource : []).map((prompt, index) => buildQuestion(prompt, index));
