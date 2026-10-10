<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import SpeakingPracticeShell from '@/components/SpeakingPracticeShell.vue';
import { getRAPlaybackUrl } from '@/lib/ra-history';
import { supabase } from '@/lib/supabase';
import { diagnosisWordItems, evidencePlaybackSeconds, loadRADiagnosisFeedback } from '@/lib/ra-diagnosis';
import { trackPracticeEvent } from '@/lib/practice-events';
import { compareDiagnoses, loadPreviousRADiagnosis } from '@/lib/ra-compare';
import { useAuthStore } from '@/stores/auth';

const props = defineProps({ result: { type: Object, required: true } });
const router = useRouter();
const authStore = useAuthStore();
const track = (event, values) => trackPracticeEvent(supabase, props.result, event, values);
const player = ref(null);
const audioUrl = ref('');
const playbackNotice = ref('');
const activeEvidence = ref('');
const feedback = ref(null);
const feedbackMeta = ref(null);
const comparison = ref(null);
const feedbackController = new AbortController();
const feedbackModel = computed(() => feedbackMeta.value?.provider === 'template' ? '模板建议' : [feedbackMeta.value?.provider, feedbackMeta.value?.model].filter(Boolean).join(' '));
const taskType = computed(() => String(props.result.task_type || props.result.question?.task_type || 'RA').trim().toUpperCase() === 'RS' ? 'RS' : 'RA');
const taskLabels = computed(() => taskType.value === 'RS'
  ? { back: '‹ 返回 RS', route: '/rs', practiceRoute: '/rs', title: '复述诊断', eyebrow: 'REPEAT SENTENCE', ruleTitle: '评分规则 · rs-score-0.1' }
  : { back: '‹ 返回 RA', route: '/ra', practiceRoute: '/ra/practice', title: '朗读诊断', eyebrow: 'READ ALOUD', ruleTitle: '评分规则 · ra-score-0.1' });
const resultSteps = [
  { label: '准备阅读' },
  { label: '开始录音' },
  { label: '提交评测' },
  { label: '查看结果' }
];
const memberLabel = computed(() => authStore.statusText || '未开通');
const evidenceById = computed(() => new Map((props.result.evidence || []).map(item => [item.id, item])));
async function loadFeedback() {
  try {
    const output = await loadRADiagnosisFeedback({ client: supabase, result: props.result, signal: feedbackController.signal });
    if (!feedbackController.signal.aborted) {
      feedback.value = output.feedback;
      feedbackMeta.value = output.feedback_meta;
    }
  } catch { /* Navigation aborts are intentionally invisible. */ }
}
async function loadComparison() {
  try {
    const previous = await loadPreviousRADiagnosis({ client: supabase, result: props.result });
    comparison.value = compareDiagnoses(previous, props.result);
    if (comparison.value) track('ra_compare_viewed', { improved: comparison.value.improved.length, ongoing: comparison.value.ongoing.length, new: comparison.value.newIssues.length });
  } catch {
    comparison.value = null;
  }
}
onBeforeUnmount(() => feedbackController.abort());
// docs/ui-guidelines.md 2.4: misread words are errors; disfluencies are notices. Class names only.
const ERROR_EVIDENCE = new Set(['omission', 'substitution']);
const evidenceTone = (type) => (ERROR_EVIDENCE.has(type) ? 'tone-error' : 'tone-notice');
const labels = { omission: '漏读', substitution: '可能读错或识别不清', repetition: '重复', insertion: '多读', hesitation: '犹豫', long_pause: '长停顿', late_start: '开口延迟' };
const words = computed(() => diagnosisWordItems(props.result.alignment, props.result.evidence, props.result.question?.content));
const metrics = computed(() => props.result.metrics || {});
const score = computed(() => metrics.value.score || null);
const showScoringRules = ref(false);
const contentCard = computed(() => {
  if (taskType.value === 'RS') {
    return {
      heading: `内容档位 ${score.value?.content?.band ?? '待确认'} / 3`,
      detail: `顺序匹配 ${score.value?.content?.matched ?? 0} / ${score.value?.content?.total ?? 0} 词` + (score.value?.content?.uncertain ? ` · ${score.value.content.uncertain} 词识别不确定，请回听确认；当前内容分仅按已确认部分` : '')
    };
  }
  return {
    heading: `正确 ${score.value?.content?.correct ?? 0} / ${score.value?.content?.total ?? 0} 词`,
    detail: `${score.value?.content?.errors ?? 0} 处错误`
  };
});
const rulesCopy = computed(() => taskType.value === 'RS'
  ? {
      official: 'Pearson Score Guide 第 16 页：RS 为部分得分，涉及 Listening 与 Speaking；Content 规则按正确顺序内容给 0–3 档。第 17 页另含 Pronunciation 与 Oral Fluency，第 46 页为 Oral Fluency 档位。',
      content: 'RS 不照搬 RA 的逐错扣分。本项目按可信顺序匹配词数判定：全部参考词按顺序匹配且无句中多词为 3；至少一半为 2；不足一半但有原句内容为 1；无原句内容为 0；全部只有低置信度识别时内容与总分待确认。同音词按语音等价处理；低置信度不算已确认正确，不标为用户错误，填充词不计内容。',
      formula: 'round(10 + 80 × (0.5 × Content档 / 3 + 0.5 × Fluency档 / 5))',
      zero: '内容为 0 档时总分直接为 10，流利度不评分。依据 Score Guide 第 8 页：Content 为 0 的回答不得分，也不再评其他项；10 是本项目换算的最低分。'
    }
  : {
      official: 'Pearson Score Guide 第 15 页：内容每处 replacement、omission、insertion 计一个错误；第 46 页：流利度按 0–5 分档描述。我们使用这些公开评分项，不声称复刻 Pearson 专有评分。',
      content: 'N 为归一化参考词数，内容比例=max(0,N−错误数)/N。同音词、低置信度、填充词不扣内容；同一原文位置替换与漏读只扣一次，多读含重复分别计错。',
      formula: 'round(10 + 80 × (0.5 × 内容比例 + 0.5 × 流利度档位 / 5))',
      zero: '内容比例为 0 时总分直接为 10，流利度不评分。依据 Score Guide 第 8 页：Content 为 0 的回答不得分，也不再评其他项；10 是本项目换算的最低分。'
    });
const fluencyEvidence = computed(() => (props.result.evidence || []).filter(item => ['hesitation','long_pause','repetition'].includes(item.type)));
const cards = computed(() => [
  { label: '内容完整度', value: `${Math.round((metrics.value.completeness || 0) * 100)}%` },
  { label: '语速', value: `${Math.round(metrics.value.wpm || 0)} 词/分` },
  { label: '犹豫', value: `${metrics.value.hesitation_count || 0} 次` },
  { label: '长停顿', value: `${metrics.value.long_pause_count || 0} 次` },
  { label: '开口延迟', value: Number.isFinite(metrics.value.speech_onset_ms) ? `${(metrics.value.speech_onset_ms / 1000).toFixed(1)} 秒` : '未检测到语音' }
]);
const comparisonGroups = computed(() => comparison.value ? [
  { key: 'improved', title: '已改善', note: '上次有，这次没有', items: comparison.value.improved, playable: false },
  { key: 'ongoing', title: '仍需练习', note: '两次都出现', items: comparison.value.ongoing, playable: true },
  { key: 'newIssues', title: '新出现', note: '这次新增', items: comparison.value.newIssues, playable: true }
] : []);
async function loadAudio() {
  try { audioUrl.value = await getRAPlaybackUrl(props.result.audio); }
  catch { audioUrl.value = ''; }
  if (!audioUrl.value) playbackNotice.value = '录音暂时无法播放，请稍后重试。';
}
onMounted(() => { track('ra_result_viewed', { total: score.value?.total }); void loadAudio(); void loadFeedback(); void loadComparison(); });
async function playEvidence(item) {
  track('ra_evidence_played', { evidence_type: item.type });
  const seconds = evidencePlaybackSeconds(item, props.result.alignment);
  if (seconds === null) { playbackNotice.value = '此处没有可靠的时间定位，请在录音中手动回听。'; return; }
  if (!audioUrl.value) await loadAudio();
  if (!audioUrl.value || !player.value) return;
  activeEvidence.value = item.id;
  playbackNotice.value = '';
  try {
    if (player.value.readyState < 1) {
      await new Promise((resolve, reject) => {
        const audio = player.value;
        const timer = setTimeout(() => finish(new Error('metadata timeout')), 10000);
        function finish(error) { clearTimeout(timer); audio.removeEventListener('loadedmetadata', ready); audio.removeEventListener('error', failed); error ? reject(error) : resolve(); }
        function ready() { finish(); }
        function failed() { finish(new Error('audio unavailable')); }
        audio.addEventListener('loadedmetadata', ready, { once: true });
        audio.addEventListener('error', failed, { once: true });
        audio.load();
      });
    }
    player.value.currentTime = Math.min(seconds, Number.isFinite(player.value.duration) ? player.value.duration : seconds);
    await player.value.play();
  } catch { playbackNotice.value = '播放未成功，请点击录音播放器重试。'; }
}
function comparisonClass(change) {
  return change?.trend === 'better' ? 'better' : change?.trend === 'worse' ? 'worse' : 'neutral';
}
function openScoringRules() { showScoringRules.value = true; track('ra_rules_opened'); }
function retrySameQuestion() {
  track('ra_retry_started');
  const questionId = `${props.result.question?.id || ''}`.trim();
  router.push({ path: taskLabels.value.practiceRoute, query: questionId ? { questionId } : {} });
}
</script>

<template>
  <SpeakingPracticeShell
    data-testid="ra-diagnosis-result"
    :back-label="taskLabels.back"
    :back-icon="false"
    :title="taskLabels.title"
    :steps="resultSteps"
    :current-step="3"
    :member-label="memberLabel"
    @back="router.push(taskLabels.route)"
    @exit="router.push(taskLabels.route)"
  >
  <main class="diagnosis-page">
    <section class="intro"><p class="eyebrow">{{ taskLabels.eyebrow }}</p><h1>听见问题，再练一次</h1><p>诊断依据录音识别与停顿。识别可能有误，请点击标注回听核验。</p></section>
    <section v-if="score" class="panel score-panel" aria-label="参考评分">
      <div class="score-heading"><div><span class="eyebrow">{{ taskLabels.eyebrow }}</span><div><strong class="total-score" data-testid="ra-reference-total">{{ score.total ?? '—' }}</strong><span> / 90</span></div></div><button type="button" @click="openScoringRules">评分规则</button></div>
      <div class="score-grid">
        <article data-testid="ra-score-card-content"><h2>内容</h2><strong>{{ contentCard.heading }}</strong><p>{{ contentCard.detail }}</p></article>
        <article data-testid="ra-score-card-fluency"><h2>流利度</h2>
          <template v-if="score.fluency.band === null"><strong>内容为 0，不评分</strong><p>Score Guide 第 8 页：内容为 0 时，本题不再评流利度和发音。</p></template>
          <template v-else><strong>{{ score.fluency.band }} / 5（{{ score.fluency.label }}）</strong><p>{{ score.fluency.evidence.D }} 次犹豫／重复 · {{ score.fluency.evidence.L }} 次长停顿</p>
          <div class="evidence-tags"><button v-for="item in fluencyEvidence" :key="item.id" type="button" :class="evidenceTone(item.type)" @click="playEvidence(item)">▶ {{ labels[item.type] }}<span v-if="item.text"> · {{ item.text }}</span></button></div></template>
        </article>
        <article data-testid="ra-score-card-pronunciation"><h2>发音</h2><strong>本版本未评估</strong><p>现有技术无法可靠测量发音，测不出来的项不给分。</p></article>
      </div>
    </section>
    <div v-if="showScoringRules" class="rules-overlay" @click.self="showScoringRules = false">
      <section class="rules-dialog" role="dialog" aria-modal="true" aria-labelledby="score-rules-title"><button class="rules-close" type="button" aria-label="关闭评分规则" @click="showScoringRules = false">关闭</button><h2 id="score-rules-title">{{ taskLabels.ruleTitle }}</h2>
        <h3>官方公开规则</h3><p>{{ rulesCopy.official }}</p>
        <h3>项目判定与阈值</h3><p>{{ rulesCopy.content }}</p>
        <p>D=犹豫次数＋识别重复次数，L=长停顿次数，W=词/分，R=最长无≥0.5秒停顿片段的词数。犹豫沿用句中≥0.5秒，长停顿沿用≥2秒，均为项目自定。</p>
        <ol start="0"><li>Disfluent：L≥2且R&lt;3，或W&lt;40。</li><li>Limited：否则L≥2，或D≥6。</li><li>Intermediate：否则L=1，或D为4–5。</li><li>Good：否则D为2–3。</li><li>Advanced：否则D=1，或D=0且W&lt;90。</li><li>Highly proficient：否则D=0、L=0、W≥90。</li></ol>
        <h3>总分换算与未评估项</h3><p class="score-formula">{{ rulesCopy.formula }}</p><p data-testid="score-rules-zero-content">{{ rulesCopy.zero }}</p><p>这是项目自定 10–90 换算，不包含发音，不等于 Pearson 官方单题分。官方未公开单题合成公式及两项权重。本版本不为发音提供数字；假开头无法检测，重复依赖识别且可能漏检。</p>
        <a href="https://www.pearsonpte.com/content/dam/ELL/pte/pearsonpte/resources/PTE-Academic-Test-Taker-Score-Guide.pdf" target="_blank" rel="noopener noreferrer">查看 Pearson 官方 Score Guide</a>
      </section>
    </div>
    <section class="metric-grid" aria-label="本次诊断指标"><article v-for="card in cards" :key="card.label"><span>{{ card.label }}</span><strong>{{ card.value }}</strong></article></section>
    <section v-if="comparison" class="panel compare-panel" aria-label="和上次比" data-testid="ra-comparison-card">
      <div class="compare-head"><div><p class="eyebrow">RETRY COMPARE</p><h2>和上次比</h2></div><button type="button" @click="retrySameQuestion">再练一次这题</button></div>
      <div class="compare-metrics">
        <article v-for="change in comparison.metricChanges" :key="change.key" :class="comparisonClass(change)">
          <span>{{ change.label }}</span><strong>{{ change.beforeText }} → {{ change.afterText }}</strong>
        </article>
      </div>
      <div class="compare-groups">
        <section v-for="group in comparisonGroups" :key="group.key" class="compare-group">
          <h3>{{ group.title }} <small>{{ group.note }}</small></h3>
          <div v-if="group.items.length" class="compare-tags">
            <button v-for="item in group.items" :key="item.key" type="button" data-testid="ra-comparison-chip" :class="evidenceTone(item.type)" :disabled="!group.playable" @click="group.playable && playEvidence(item.evidence)">
              {{ labels[item.type] || item.type }}<span v-if="item.text"> · {{ item.text }}</span>
            </button>
          </div>
          <p v-else class="note">暂无</p>
        </section>
      </div>
    </section>
    <section class="panel feedback-panel" aria-label="练习建议" :aria-busy="!feedback">
      <h2>练习建议</h2>
      <p v-if="!feedback" role="status" class="note">正在根据本次证据整理练习建议…</p>
      <template v-else>
        <p class="feedback-summary">{{ feedback.summary }}</p>
        <ol v-if="feedback.suggestions.length" class="suggestions">
          <li v-for="(suggestion, index) in feedback.suggestions" :key="index">
            <strong>{{ suggestion.issue }}</strong>
            <p>{{ suggestion.action }}</p>
            <div class="evidence-tags">
              <template v-for="id in suggestion.evidence_ids" :key="id">
                <button v-if="evidenceById.has(id)" type="button" :class="evidenceTone(evidenceById.get(id).type)" @click="playEvidence(evidenceById.get(id))" :aria-label="`回听证据 ${id}：${labels[evidenceById.get(id).type] || ''}`">▶ {{ id }} · {{ labels[evidenceById.get(id).type] || '回听' }}</button>
              </template>
            </div>
          </li>
        </ol>
      </template>
    </section>
    <section class="panel"><details :open="taskType !== 'RS'"><summary><h2>原文与标注</h2></summary><p class="legend"><span class="legend-item"><i class="swatch swatch-error" aria-hidden="true"></i>漏读 / 可能读错或识别不清</span><span class="legend-item"><i class="swatch swatch-notice" aria-hidden="true"></i>重复 / 多读 · 犹豫 / 长停顿</span></p>
      <div class="annotated-text">
        <template v-for="word in words" :key="word.index">
          <button v-if="word.annotations.length" type="button" :class="['word', word.type]" :title="word.annotations.map(item => labels[item.type]).join('、')" @click="playEvidence(word.annotations[0])">{{ word.text }}</button>
          <span v-else :class="['word', word.type]" :title="word.uncertain ? '同音词或识别不确定，不计为用户错误' : ''">{{ word.text }}</span>{{ ' ' }}
        </template>
      </div></details>
      <p v-if="words.some(word => word.uncertain)" class="note">灰色词语为同音词或识别不确定，不计为用户错误。</p>
      <audio v-if="audioUrl" ref="player" :src="audioUrl" controls preload="metadata" @error="playbackNotice = '录音加载失败，请重试。'" />
      <p v-if="playbackNotice" role="status" class="note">{{ playbackNotice }} <button type="button" @click="loadAudio">重新加载</button></p>
    </section>
    <section class="panel"><h2>可回听的证据</h2>
      <p v-if="!result.evidence?.length">本次未检测到符合当前规则的明显问题。</p>
      <button v-for="item in result.evidence || []" :key="item.id" type="button" :class="['evidence', { active: activeEvidence === item.id }]" @click="playEvidence(item)">
        <span><strong :class="['ev-tag', evidenceTone(item.type)]">{{ labels[item.type] || item.type }}</strong><span v-if="item.text"> · {{ item.text }}</span><small>{{ item.detail?.description || (item.detail?.pause_ms ? `持续 ${(item.detail.pause_ms / 1000).toFixed(1)} 秒` : '点击回听核验') }}</small></span><span aria-hidden="true">▶</span>
      </button>
    </section>
    <button class="primary-action retry" type="button" @click="retrySameQuestion">再练一次</button>
    <footer>识别：{{ result.provider }} {{ result.model }} · 规则 {{ result.rules_version }} · 发音未评估<span v-if="feedback"> · 反馈：{{ feedbackModel || '已生成' }}</span></footer>
  </main>
  </SpeakingPracticeShell>
</template>

<style scoped>
/* Visual rules: docs/ui-guidelines.md 2.4. Action colour only on "再练一次"; marks use status colours. */
.diagnosis-page {
  width: 100%;
  max-width: 880px;
  margin: 0 auto;
  padding: 16px 16px 40px;
  color: var(--kk-ink);
}

button {
  cursor: pointer;
  font: inherit;
}

.intro {
  margin: 8px 0 20px;
}

.eyebrow {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .08em;
  color: var(--kk-ink-3);
}

h1 {
  margin: 4px 0 8px;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
}

h2 {
  margin: 0 0 12px;
  font-size: 17px;
  font-weight: 600;
}

.intro > p:last-child,
.legend,
.note,
footer {
  font-size: 13px;
  line-height: 1.7;
  color: var(--kk-ink-2);
}

.panel,
.metric-grid article {
  border: 1px solid var(--kk-line);
  border-radius: var(--speaking-card-radius);
  background: var(--kk-surface);
  box-shadow: var(--kk-shadow);
  padding: 20px;
}

.panel {
  margin-top: 16px;
}

.score-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.total-score {
  font-family: var(--kk-font-num);
  font-size: 56px;
  font-weight: 800;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.score-heading button,
.rules-close,
.compare-head button {
  min-height: 44px;
  padding: 0 18px;
  border: 1px solid var(--kk-line);
  border-radius: 999px;
  background: var(--kk-surface);
  color: var(--kk-ink);
  font-size: 14px;
  font-weight: 600;
}

.score-heading button:hover,
.rules-close:hover,
.compare-head button:hover {
  background: var(--kk-surface-2);
}

.score-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
  margin-top: 16px;
}

.score-grid article {
  min-width: 0;
  padding: 14px 0;
  border-top: 1px solid var(--kk-line);
}

.score-grid article:last-child {
  padding-bottom: 0;
}

.score-grid h2 {
  margin-bottom: 4px;
  font-size: 13px;
  color: var(--kk-ink-2);
}

.score-grid strong {
  font-size: 17px;
}

.score-grid p {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--kk-ink-2);
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}

.metric-grid article {
  padding: 14px 16px;
}

.metric-grid span {
  font-size: 13px;
  color: var(--kk-ink-2);
}

.metric-grid strong {
  display: block;
  margin-top: 6px;
  font-family: var(--kk-font-num);
  font-size: 22px;
  font-weight: 800;
}

details > summary {
  cursor: pointer;
  list-style-position: inside;
}

details > summary h2 {
  display: inline;
}

.legend {
  margin: 8px 0 14px;
}

.annotated-text {
  font-family: var(--kk-font-text);
  font-size: 20px;
  line-height: 2.1;
  overflow-wrap: anywhere;
}

.word {
  display: inline;
  padding: 2px 3px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: inherit;
  font: inherit;
  line-height: inherit;
}

.omission,
.substitution {
  background: var(--kk-error-bg);
  text-decoration: underline 2px var(--kk-error-line);
  text-underline-offset: 4px;
}

.repetition,
.insertion,
.hesitation,
.long_pause,
.late_start {
  background: var(--kk-notice-bg);
}

.uncertain {
  color: var(--kk-ink-3);
  text-decoration: underline dotted;
  text-underline-offset: 4px;
}

.match {
  padding: 0;
}

audio {
  width: 100%;
  margin-top: 16px;
}

.evidence {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 56px;
  margin-top: 8px;
  padding: 10px 14px;
  border: 1px solid var(--kk-line);
  border-radius: 12px;
  background: var(--kk-surface);
  color: inherit;
  text-align: left;
  font-size: 14px;
  overflow-wrap: anywhere;
}

.evidence:hover {
  background: var(--kk-surface-2);
}

.evidence small {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--kk-ink-3);
}

.evidence.active {
  border-color: var(--kk-ink);
  box-shadow: inset 0 0 0 1px var(--kk-ink);
}

.ev-tag {
  display: inline-flex;
  align-items: center;
  height: 24px;
  margin-right: 6px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.ev-tag.tone-error,
.evidence-tags button.tone-error,
.compare-tags button.tone-error {
  background: var(--kk-error-bg);
  color: var(--kk-error);
  border-color: var(--kk-error-line);
}

.ev-tag.tone-notice,
.evidence-tags button.tone-notice,
.compare-tags button.tone-notice {
  background: var(--kk-notice-bg);
  color: var(--kk-notice);
  border-color: var(--kk-notice-line);
}

.retry {
  margin-top: 24px;
}

footer {
  margin-top: 20px;
  text-align: center;
  color: var(--kk-ink-3);
  overflow-wrap: anywhere;
}

button:focus-visible {
  outline: 3px solid var(--kk-ink);
  outline-offset: 3px;
}

.rules-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--speaking-overlay);
}

.rules-dialog {
  width: min(700px, 100%);
  max-height: 90vh;
  overflow: auto;
  padding: 24px;
  border-radius: var(--speaking-card-radius);
  background: var(--kk-surface);
  box-shadow: var(--kk-shadow-pop);
  font-size: 14px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.rules-dialog h2 {
  font-size: 20px;
  font-weight: 700;
}

.rules-close {
  float: right;
}

.rules-dialog h3 {
  margin-top: 20px;
  font-size: 15px;
}

.rules-dialog a {
  color: var(--kk-action-text);
  font-weight: 600;
}

.score-formula {
  font-family: ui-monospace, monospace;
  font-size: 13px;
}

.feedback-summary {
  margin: 0;
  font-size: 15px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.suggestions {
  margin: 16px 0 0;
  padding-left: 22px;
}

.suggestions li + li {
  margin-top: 20px;
}

.suggestions li > p {
  margin: 6px 0 10px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--kk-ink-2);
  overflow-wrap: anywhere;
}

.evidence-tags,
.compare-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.evidence-tags button,
.compare-tags button {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--kk-line);
  border-radius: 999px;
  background: var(--kk-surface);
  color: var(--kk-ink);
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.evidence-tags button {
  min-height: 44px;
}

.compare-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.compare-head .eyebrow {
  margin: 0 0 4px;
}

.compare-head h2 {
  margin: 0;
}

.compare-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.compare-metrics article {
  padding: 12px 14px;
  border: 1px solid var(--kk-line);
  border-radius: 12px;
  background: var(--kk-surface);
}

.compare-metrics span {
  display: block;
  font-size: 13px;
  color: inherit;
  opacity: .9;
}

.compare-metrics strong {
  display: block;
  margin-top: 4px;
  font-family: var(--kk-font-num);
  font-size: 16px;
}

.compare-metrics .better {
  border-color: var(--kk-success-line);
  background: var(--kk-success-bg);
  color: var(--kk-success);
}

.compare-metrics .worse {
  border-color: var(--kk-notice-line);
  background: var(--kk-notice-bg);
  color: var(--kk-notice);
}

.compare-metrics .neutral {
  border-color: var(--kk-line);
  color: var(--kk-ink);
}

.compare-groups {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  margin-top: 16px;
}

.compare-group {
  min-width: 0;
}

.compare-group h3 {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
}

.compare-group small {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  font-weight: 400;
  color: var(--kk-ink-3);
}

.compare-tags button:disabled {
  cursor: default;
  opacity: .85;
}

@media (min-width: 768px) {
  .diagnosis-page {
    padding: 24px 24px 56px;
  }

  h1 {
    font-size: 28px;
  }

  .panel {
    padding: 24px;
  }

  .total-score {
    font-size: 64px;
  }

  .score-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 20px;
  }

  .score-grid article,
  .score-grid article:last-child {
    padding: 14px 0 0;
  }

  .metric-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .compare-metrics {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .compare-groups {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .annotated-text {
    font-size: 22px;
  }

  .retry {
    width: auto;
    min-width: 280px;
    display: block;
    margin-left: auto;
    margin-right: auto;
  }
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.swatch {
  display: inline-block;
  width: 22px;
  height: 14px;
  border-radius: 3px;
}

.swatch-error {
  background: var(--kk-error-bg);
  border-bottom: 2px solid var(--kk-error-line);
}

.swatch-notice {
  background: var(--kk-notice-bg);
}
</style>
