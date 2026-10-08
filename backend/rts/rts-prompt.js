function toText(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return num;
}

function toBoolean(value) {
  return Boolean(value);
}

export function buildRTSPrompt({
  transcript = "",
  questionContent = "",
  questionMeta = {},
  audioSignals = {}
} = {}) {
  const safeTranscript = toText(transcript);
  const safeQuestion = toText(questionContent);
  const safeMeta = {
    topic: toText(questionMeta?.topic),
    tone: toText(questionMeta?.tone),
    role: toText(questionMeta?.role),
    directions_head: toText(questionMeta?.directions_head)
  };
  const safeAudioSignals = {
    duration_sec: Math.max(0, Math.round(toNumber(audioSignals?.duration_sec))),
    duration_ms: Math.max(0, Math.round(toNumber(audioSignals?.duration_ms))),
    non_silent_frame_ratio: Math.max(0, Math.min(1, toNumber(audioSignals?.non_silent_frame_ratio))),
    silence_warning: toBoolean(audioSignals?.silence_warning),
    final_usable_reason: toText(audioSignals?.final_usable_reason),
    has_usable_audio: toBoolean(audioSignals?.has_usable_audio),
    playback_usable: toBoolean(audioSignals?.playback_usable)
  };

  return `
You are evaluating a PTE RTS (Respond to a Situation) response.
This is an AI estimated score, not official exam scoring.

Scenario:
"${safeQuestion}"

Learner transcript:
"${safeTranscript}"

Question meta:
${JSON.stringify(safeMeta)}

Audio signals (approx only):
${JSON.stringify(safeAudioSignals)}

Scoring target:
- Appropriacy (0-3, used as Content raw) is coverage-first.
- Judge coverage of key scenario information first:
  core object, core event, core problem, and response goal.
- Relevance gate for Content:
  only allow appropriacy >= 2 when the response shows real scenario relevance.
  It should hit at least two of these groups: core object / core event-problem / response action.
- If transcript covers most key points and stays in the same scenario, set appropriacy >= 2
  even when learner repeats the prompt wording.
- If coverage is very complete and scenario fit is strong, set appropriacy = 3.
- Only set appropriacy = 0 for clear off-topic, wrong response goal, unusable transcript, or meaningless output.
- Generic template phrases do NOT count as relevance evidence, for example:
  "hello", "excuse me", "do you have a minute", "thank you", "I hope this helps".
- Repeating original wording, template opening, simple grammar, or non-native phrasing can only be a light deduction
  after relevance is already established.
- Pronunciation (0-5): lightweight estimate only from transcript naturalness and audio signals; do NOT pretend this is full acoustic scoring.
- Oral Fluency (0-5): lightweight estimate from pacing/continuity cues and transcript coherence.
- Keep these three raw traits on their native scales exactly (0-3 / 0-5 / 0-5).
- Product policy is template-friendly and fluency-first. Do NOT treat template phrasing, prompt repetition, or partial completion as an automatic fail.

Gate rule:
- Only set gate.triggered=true for severe invalid responses:
  clear off-topic, almost no scenario response intent, unusable transcript, non-English/noise-heavy content, or blank response.
- Do NOT gate only because of template style, fixed opening phrase, partial remedy details, or tone/register mismatch.
- For rule_gated, provide reason_codes from this set:
  appropriacy_zero_off_topic
  appropriacy_zero_goal_not_met
  appropriacy_zero_context_incoherent
  appropriacy_zero_too_short
  transcript_empty
  audio_not_usable

Output constraints:
- Return strict JSON only.
- No markdown.
- feedback_zh should contain 2-4 short actionable Chinese bullets.
- For feedback_zh, do NOT over-criticize prompt repetition or "not using own words".
- If coverage is high, feedback should focus on specificity, clearer structure, and one clearer action step.
- better_expression_zh must be in simple English (student-friendly, CEFR A2-B1).
- better_expression_zh should use short sentences, common words, no rare vocabulary, and no long complex clauses.
- product.overall can be a rough estimate only; server will recompute final display overall.

JSON schema:
{
  "taskType": "RTS",
  "status": "scored|rule_gated",
  "official_traits": {
    "appropriacy": { "score": 0, "max": 3 },
    "pronunciation": { "score": 0, "max": 5 },
    "oral_fluency": { "score": 0, "max": 5 }
  },
  "gate": {
    "triggered": false,
    "reason_codes": [],
    "policy": "product_relaxed_fluency_first"
  },
  "product": {
    "overall": 0,
    "feedback_zh": ["", ""],
    "better_expression_zh": ""
  },
  "diagnostics": {
    "appropriacy_subsignals": {
      "task_completion": 0,
      "context_fit": 0,
      "info_completeness": 0,
      "naturalness": 0,
      "tone_politeness": 0
    },
    "transcript_metrics": {
      "word_count": 0,
      "unique_word_ratio": 0,
      "template_overlap_ratio": 0
    }
  },
  "feedback": ""
}
`.trim();
}

export function buildRTSResponseJsonSchema() {
  return {
    type: "object",
    additionalProperties: true,
    properties: {
      taskType: {
        type: "string",
        enum: ["RTS"]
      },
      status: {
        type: "string",
        enum: ["scored", "rule_gated"]
      },
      official_traits: {
        type: "object",
        additionalProperties: true,
        properties: {
          appropriacy: {
            type: "object",
            additionalProperties: true,
            properties: {
              score: { type: "integer", minimum: 0, maximum: 3 },
              max: { type: "integer", enum: [3] }
            },
            required: ["score", "max"]
          },
          pronunciation: {
            type: "object",
            additionalProperties: true,
            properties: {
              score: { type: "integer", minimum: 0, maximum: 5 },
              max: { type: "integer", enum: [5] }
            },
            required: ["score", "max"]
          },
          oral_fluency: {
            type: "object",
            additionalProperties: true,
            properties: {
              score: { type: "integer", minimum: 0, maximum: 5 },
              max: { type: "integer", enum: [5] }
            },
            required: ["score", "max"]
          }
        },
        required: ["appropriacy", "pronunciation", "oral_fluency"]
      },
      gate: {
        type: "object",
        additionalProperties: true,
        properties: {
          triggered: { type: "boolean" },
          reason_codes: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "appropriacy_zero_off_topic",
                "appropriacy_zero_goal_not_met",
                "appropriacy_zero_template_like",
                "appropriacy_zero_context_incoherent",
                "appropriacy_zero_register_mismatch",
                "appropriacy_zero_too_short",
                "transcript_empty",
                "audio_not_usable"
              ]
            }
          },
          policy: {
            type: "string",
            enum: ["product_relaxed_fluency_first", "strict_official", "product_enhanced"]
          }
        },
        required: ["triggered", "reason_codes", "policy"]
      },
      product: {
        type: "object",
        additionalProperties: true,
        properties: {
          overall: { type: "integer", minimum: 0, maximum: 90 },
          feedback_zh: {
            type: "array",
            minItems: 2,
            maxItems: 4,
            items: { type: "string" }
          },
          better_expression_zh: { type: "string" }
        },
        required: ["overall", "feedback_zh", "better_expression_zh"]
      },
      diagnostics: {
        type: "object",
        additionalProperties: true,
        properties: {
          appropriacy_subsignals: {
            type: "object",
            additionalProperties: true,
            properties: {
              task_completion: { type: "integer", minimum: 0, maximum: 2 },
              context_fit: { type: "integer", minimum: 0, maximum: 2 },
              info_completeness: { type: "integer", minimum: 0, maximum: 2 },
              naturalness: { type: "integer", minimum: 0, maximum: 2 },
              tone_politeness: { type: "integer", minimum: 0, maximum: 2 }
            },
            required: ["task_completion", "context_fit", "info_completeness", "naturalness", "tone_politeness"]
          },
          transcript_metrics: {
            type: "object",
            additionalProperties: true,
            properties: {
              word_count: { type: "integer", minimum: 0 },
              unique_word_ratio: { type: "number", minimum: 0, maximum: 1 },
              template_overlap_ratio: { type: "number", minimum: 0, maximum: 1 }
            },
            required: ["word_count", "unique_word_ratio", "template_overlap_ratio"]
          }
        },
        required: ["appropriacy_subsignals", "transcript_metrics"]
      },
      feedback: { type: "string" }
    },
    required: ["taskType", "status", "official_traits", "gate", "product", "diagnostics", "feedback"]
  };
}
