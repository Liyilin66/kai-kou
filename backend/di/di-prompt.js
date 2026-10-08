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

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function limitText(value, maxLength = 180) {
  const text = toText(value).replace(/\s+/g, " ");
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function normalizePoint(item) {
  if (typeof item === "string") return limitText(item, 80);
  if (!item || typeof item !== "object") return "";
  return limitText(
    item.text
    || item.label
    || item.title
    || item.name
    || item.head
    || item.point
    || item.keyword
    || item.value,
    80
  );
}

function normalizeWord(item) {
  if (typeof item === "string") return limitText(item, 40);
  if (!item || typeof item !== "object") return "";
  return limitText(item.word || item.label || item.name || item.value, 40);
}

function normalizeQuestionMeta(questionMeta = {}) {
  const keyPoints = toArray(questionMeta?.key_points)
    .map((item) => normalizePoint(item))
    .filter(Boolean)
    .slice(0, 6);
  const keyTerms = toArray(questionMeta?.key_terms)
    .map((item) => normalizeWord(item))
    .filter(Boolean)
    .slice(0, 8);
  const keyElements = toArray(questionMeta?.key_elements)
    .map((item) => normalizePoint(item))
    .filter(Boolean)
    .slice(0, 6);
  const relations = toArray(questionMeta?.relations)
    .map((item) => normalizePoint(item))
    .filter(Boolean)
    .slice(0, 6);
  const implicationsOrConclusion = toArray(questionMeta?.implications_or_conclusion)
    .map((item) => normalizePoint(item))
    .filter(Boolean)
    .slice(0, 4);
  const numbersOrExtremes = toArray(questionMeta?.numbers_or_extremes)
    .map((item) => normalizePoint(item))
    .filter(Boolean)
    .slice(0, 6);
  const sequenceOrTrend = toArray(questionMeta?.sequence_or_trend)
    .map((item) => normalizePoint(item))
    .filter(Boolean)
    .slice(0, 5);
  const comparisonAxes = toArray(questionMeta?.comparison_axes)
    .map((item) => normalizePoint(item))
    .filter(Boolean)
    .slice(0, 5);

  return {
    title: limitText(questionMeta?.title, 120),
    question_content: limitText(questionMeta?.question_content, 180),
    image_type: limitText(questionMeta?.image_type, 24),
    metadata_quality: limitText(questionMeta?.metadata_quality, 16),
    key_points: keyPoints,
    key_terms: keyTerms,
    key_elements: keyElements,
    relations,
    implications_or_conclusion: implicationsOrConclusion,
    numbers_or_extremes: numbersOrExtremes,
    sequence_or_trend: sequenceOrTrend,
    comparison_axes: comparisonAxes,
    visual_features: {
      has_trend: toBoolean(questionMeta?.visual_features?.has_trend),
      has_comparison: toBoolean(questionMeta?.visual_features?.has_comparison),
      has_extreme: toBoolean(questionMeta?.visual_features?.has_extreme),
      has_numbers: toBoolean(questionMeta?.visual_features?.has_numbers)
    }
  };
}

function normalizeAudioSignals(audioSignals = {}) {
  return {
    duration_sec: Math.max(0, Math.round(toNumber(audioSignals?.duration_sec))),
    duration_ms: Math.max(0, Math.round(toNumber(audioSignals?.duration_ms))),
    non_silent_frame_ratio: Math.max(0, Math.min(1, toNumber(audioSignals?.non_silent_frame_ratio))),
    silence_frame_ratio: Math.max(
      0,
      Math.min(1, toNumber(audioSignals?.silence_frame_ratio, 1 - toNumber(audioSignals?.non_silent_frame_ratio)))
    ),
    peak_amplitude: Math.max(0, Math.min(1, toNumber(audioSignals?.peak_amplitude))),
    rms_amplitude: Math.max(0, Math.min(1, toNumber(audioSignals?.rms_amplitude))),
    mean_abs_amplitude: Math.max(0, Math.min(1, toNumber(audioSignals?.mean_abs_amplitude))),
    amplitude_dynamic_range: Math.max(0, Math.min(1, toNumber(audioSignals?.amplitude_dynamic_range))),
    transcript_word_count: Math.max(0, Math.round(toNumber(audioSignals?.transcript_word_count))),
    speech_rate_wps: Math.max(0, Math.min(8, toNumber(audioSignals?.speech_rate_wps))),
    sample_rate: Math.max(0, Math.round(toNumber(audioSignals?.sample_rate))),
    channel_count: Math.max(0, Math.round(toNumber(audioSignals?.channel_count))),
    final_usable_reason: limitText(audioSignals?.final_usable_reason, 40),
    has_usable_audio: toBoolean(audioSignals?.has_usable_audio),
    playback_usable: toBoolean(audioSignals?.playback_usable)
  };
}

export function buildDIPrompt({
  transcript = "",
  questionContent = "",
  questionMeta = {},
  audioSignals = {}
} = {}) {
  const safeTranscript = limitText(transcript, 1200);
  const safeQuestionContent = limitText(questionContent, 180);
  const safeMeta = normalizeQuestionMeta(questionMeta);
  const safeAudio = normalizeAudioSignals(audioSignals);

  return `
You are evaluating a PTE Academic Describe Image response.
Use BOTH the structured image metadata and the learner transcript. Do not score from transcript alone.
This is an estimated score aligned to public Pearson-style raw traits, but it must stay realistic.

Image metadata:
${JSON.stringify({
    ...safeMeta,
    question_content: safeMeta.question_content || safeQuestionContent
  })}

Learner transcript:
"${safeTranscript}"

Audio signals (lightweight only):
${JSON.stringify(safeAudio)}

Official raw traits:
- Content: 0-6
- Pronunciation: 0-5
- Oral Fluency: 0-5

Core scoring principles:
- The learner does NOT need to repeat every word visible in the image.
- However, the response MUST clearly correspond to the image topic, chart objects, key elements, or major relationships.
- Ground Content in the image metadata:
  title / topic,
  chart type,
  key entities,
  comparisons / relationships / sequence / trend,
  and a brief takeaway when possible.
- Short but clearly relevant answers should not be punished the same way as long off-topic answers.
- Generic DI filler, empty template language, or weakly related talk should be treated as weak relevance.
- If the answer is largely unrelated to the image, do NOT give high Content or high Overall.
- Do not reward mechanical item-by-item listing without synthesis.
- If metadata is limited, stay conservative and do not invent unseen image details.
- Pronunciation and Oral Fluency are still speech traits, but when content is clearly off-topic they must not stay at a high tier.
- Do not default Pronunciation and Oral Fluency to the same raw score unless the evidence is genuinely very close.
- Raw 0-1 for Pronunciation or Oral Fluency should still be rare and mainly reserved for severely invalid or unusable audio cases.

Diagnostics requirements:
- Always include a diagnostics object.
- Use these exact discrete bands:
  relevance_band: severe_off_topic | weak_related | partial_related | grounded
  coverage_band: none | limited | partial | solid
  accuracy_band: wrong | mixed | mostly_correct | accurate
  response_pattern: short_but_relevant | long_but_off_topic | template_only | generic_related | grounded_description
- off_topic_level must be an integer:
  0 = none
  1 = mild
  2 = clear
  3 = severe
- grounding_signals must judge these anchors:
  title_topic_grounding
  chart_type_grounding
  entity_grounding
  relation_trend_grounding
  detail_grounding
- If the learner mainly uses template talk with little real grounding, mark relevance_band as weak_related or severe_off_topic, not grounded.
- If the answer is short but clearly matches the image theme and at least one real anchor, prefer short_but_relevant over long_but_off_topic.

Trait guidance:
- If Content = 0, do not continue judging Pronunciation or Oral Fluency.
  In that case set their score to 0 and judged=false.
- Content 5-6 needs the main theme plus meaningful grounding, with at least one relationship/trend/sequence/comparison and a clear takeaway.
- Content must be conservative when relevance is weak, coverage is poor, or accuracy is mixed.

Return strict JSON only:
{
  "taskType": "DI",
  "status": "scored",
  "reason_code": "",
  "official_traits": {
    "content": { "score": 0, "max": 6, "judged": true },
    "pronunciation": { "score": 0, "max": 5, "judged": true },
    "oral_fluency": { "score": 0, "max": 5, "judged": true }
  },
  "diagnostics": {
    "relevance_band": "grounded",
    "coverage_band": "solid",
    "accuracy_band": "accurate",
    "response_pattern": "grounded_description",
    "off_topic_level": 0,
    "grounding_signals": {
      "title_topic_grounding": true,
      "chart_type_grounding": true,
      "entity_grounding": true,
      "relation_trend_grounding": true,
      "detail_grounding": true
    }
  },
  "product": {
    "feedback_zh": "",
    "better_response": ""
  }
}`.trim();
}

export function buildDIResponseJsonSchema() {
  return {
    type: "object",
    additionalProperties: true,
    properties: {
      taskType: {
        type: "string",
        enum: ["DI"]
      },
      status: {
        type: "string",
        enum: ["scored"]
      },
      reason_code: {
        type: "string"
      },
      official_traits: {
        type: "object",
        additionalProperties: true,
        properties: {
          content: {
            type: "object",
            additionalProperties: true,
            properties: {
              score: { type: "integer", minimum: 0, maximum: 6 },
              max: { type: "integer", enum: [6] },
              judged: { type: "boolean" }
            },
            required: ["score", "max", "judged"]
          },
          pronunciation: {
            type: "object",
            additionalProperties: true,
            properties: {
              score: { type: "integer", minimum: 0, maximum: 5 },
              max: { type: "integer", enum: [5] },
              judged: { type: "boolean" }
            },
            required: ["score", "max", "judged"]
          },
          oral_fluency: {
            type: "object",
            additionalProperties: true,
            properties: {
              score: { type: "integer", minimum: 0, maximum: 5 },
              max: { type: "integer", enum: [5] },
              judged: { type: "boolean" }
            },
            required: ["score", "max", "judged"]
          }
        },
        required: ["content", "pronunciation", "oral_fluency"]
      },
      diagnostics: {
        type: "object",
        additionalProperties: true,
        properties: {
          relevance_band: {
            type: "string",
            enum: ["severe_off_topic", "weak_related", "partial_related", "grounded"]
          },
          coverage_band: {
            type: "string",
            enum: ["none", "limited", "partial", "solid"]
          },
          accuracy_band: {
            type: "string",
            enum: ["wrong", "mixed", "mostly_correct", "accurate"]
          },
          response_pattern: {
            type: "string",
            enum: ["short_but_relevant", "long_but_off_topic", "template_only", "generic_related", "grounded_description"]
          },
          off_topic_level: {
            type: "integer",
            minimum: 0,
            maximum: 3
          },
          grounding_signals: {
            type: "object",
            additionalProperties: true,
            properties: {
              title_topic_grounding: { type: "boolean" },
              chart_type_grounding: { type: "boolean" },
              entity_grounding: { type: "boolean" },
              relation_trend_grounding: { type: "boolean" },
              detail_grounding: { type: "boolean" }
            }
          }
        }
      },
      product: {
        type: "object",
        additionalProperties: true,
        properties: {
          feedback_zh: { type: "string" },
          better_response: { type: "string" }
        },
        required: ["feedback_zh", "better_response"]
      }
    },
    required: ["taskType", "status", "reason_code", "official_traits", "product"]
  };
}
