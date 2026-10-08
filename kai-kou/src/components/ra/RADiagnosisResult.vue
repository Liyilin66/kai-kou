<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getRAPlaybackUrl } from '@/lib/ra-history';
import { diagnosisWordItems, evidencePlaybackSeconds } from '@/lib/ra-diagnosis';

const props = defineProps({ result: { type: Object, required: true } });
const router = useRouter();
const player = ref(null);
const audioUrl = ref('');
const playbackNotice = ref('');
const activeEvidence = ref('');
const labels = { omission: '漏读', substitution: '可能读错或识别不清', repetition: '重复', insertion: '多读', hesitation: '犹豫', long_pause: '长停顿', late_start: '开口延迟' };
const words = computed(() => diagnosisWordItems(props.result.alignment, props.result.evidence, props.result.question?.content));
const metrics = computed(() => props.result.metrics || {});
const cards = computed(() => [
  { label: '内容完整度', value: `${Math.round((metrics.value.completeness || 0) * 100)}%` },
  { label: '语速', value: `${Math.round(metrics.value.wpm || 0)} 词/分` },
  { label: '犹豫', value: `${metrics.value.hesitation_count || 0} 次` },
  { label: '长停顿', value: `${metrics.value.long_pause_count || 0} 次` },
  { label: '开口延迟', value: Number.isFinite(metrics.value.speech_onset_ms) ? `${(metrics.value.speech_onset_ms / 1000).toFixed(1)} 秒` : '未检测到语音' }
]);
async function loadAudio() {
  try { audioUrl.value = await getRAPlaybackUrl(props.result.audio); }
  catch { audioUrl.value = ''; }
  if (!audioUrl.value) playbackNotice.value = '录音暂时无法播放，请稍后重试。';
}
onMounted(loadAudio);
async function playEvidence(item) {
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
</script>

<template>
  <main class="diagnosis-page" data-testid="ra-diagnosis-result">
    <header><button type="button" @click="router.push('/ra')">‹ 返回 RA</button><span>朗读诊断</span></header>
    <section class="intro"><p class="eyebrow">READ ALOUD</p><h1>听见问题，再练一次</h1><p>诊断依据录音识别与停顿。识别可能有误，请点击标注回听核验。</p></section>
    <section class="metric-grid" aria-label="本次诊断指标"><article v-for="card in cards" :key="card.label"><span>{{ card.label }}</span><strong>{{ card.value }}</strong></article></section>
    <section class="panel"><h2>原文与标注</h2><p class="legend">漏读 / 可能读错或识别不清 · 重复 / 多读 · 犹豫 / 长停顿</p>
      <div class="annotated-text">
        <template v-for="word in words" :key="word.index">
          <button v-if="word.annotations.length" type="button" :class="['word', word.type]" :title="word.annotations.map(item => labels[item.type]).join('、')" @click="playEvidence(word.annotations[0])">{{ word.text }}</button>
          <span v-else :class="['word', word.type]" :title="word.uncertain ? '同音词或识别不确定，不计为用户错误' : ''">{{ word.text }}</span>{{ ' ' }}
        </template>
      </div>
      <p v-if="words.some(word => word.uncertain)" class="note">灰色词语为同音词或识别不确定，不计为用户错误。</p>
      <audio v-if="audioUrl" ref="player" :src="audioUrl" controls preload="metadata" @error="playbackNotice = '录音加载失败，请重试。'" />
      <p v-if="playbackNotice" role="status" class="note">{{ playbackNotice }} <button type="button" @click="loadAudio">重新加载</button></p>
    </section>
    <section class="panel"><h2>可回听的证据</h2>
      <p v-if="!result.evidence?.length">本次未检测到符合当前规则的明显问题。</p>
      <button v-for="item in result.evidence || []" :key="item.id" type="button" :class="['evidence', { active: activeEvidence === item.id }]" @click="playEvidence(item)">
        <span><strong>{{ labels[item.type] || item.type }}</strong><span v-if="item.text"> · {{ item.text }}</span><small>{{ item.detail?.description || (item.detail?.pause_ms ? `持续 ${(item.detail.pause_ms / 1000).toFixed(1)} 秒` : '点击回听核验') }}</small></span><span aria-hidden="true">▶</span>
      </button>
    </section>
    <button class="retry" type="button" @click="router.push({ path: '/ra/practice', query: { questionId: result.question?.id } })">再练一次</button>
    <footer>识别：{{ result.provider }} {{ result.model }} · 规则 {{ result.rules_version }} · 发音未评估</footer>
  </main>
</template>

<style scoped>
.diagnosis-page{max-width:960px;margin:0 auto;padding:24px 28px 48px;color:var(--c0,#302820);box-sizing:border-box}.diagnosis-page *{box-sizing:border-box}header{display:flex;justify-content:space-between;align-items:center;font-weight:700}button{font:inherit;cursor:pointer}header button{border:0;background:transparent;color:inherit;padding:12px 0}.intro{margin:28px 0}.eyebrow{font-size:12px;letter-spacing:2px;color:#a46c37}h1{font-size:30px;margin:8px 0 12px}.intro>p:last-child,.legend,.note,footer{font-size:13px;color:var(--muted,#756b60);line-height:1.7}.metric-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.metric-grid article,.panel{border:1px solid var(--bdr,#e1d8c9);background:var(--card,#fffaf3);border-radius:14px;padding:18px}.metric-grid span{font-size:12px;color:var(--muted,#756b60)}.metric-grid strong{display:block;font-size:23px;margin-top:10px}.panel{margin-top:20px}h2{font-size:17px;margin:0 0 12px}.annotated-text{line-height:2.3;font-size:19px;overflow-wrap:anywhere}.word{display:inline;border:0;padding:2px 3px;border-radius:4px;color:inherit;background:none;font-size:inherit;line-height:inherit}.omission,.substitution{background:#fbe1d9;text-decoration:underline;text-decoration-color:#bd614d}.repetition,.insertion{background:#e8def6}.hesitation,.long_pause{background:#fff0bf}.uncertain{color:#80796e;text-decoration:underline dotted}.match{padding:0}audio{width:100%;margin-top:20px}.evidence{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;text-align:left;border:1px solid var(--bdr,#e1d8c9);background:transparent;border-radius:9px;margin-top:10px;padding:12px;overflow-wrap:anywhere}.evidence small{display:block;font-size:12px;color:var(--muted,#756b60);margin-top:5px}.evidence.active{border-color:#a46c37;background:#fff0d8}.retry{width:100%;margin-top:24px;padding:14px;border:0;border-radius:10px;background:#a46c37;color:#fff;font-weight:700}footer{margin-top:20px;text-align:center;overflow-wrap:anywhere}button:focus-visible{outline:3px solid #a46c37;outline-offset:3px}@media(max-width:600px){.diagnosis-page{padding:12px 16px 32px}.intro{margin:18px 0}h1{font-size:25px}.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.metric-grid article{padding:14px}.metric-grid strong{font-size:21px}.panel{padding:14px}.annotated-text{font-size:18px}.evidence{min-height:48px}header button{min-height:44px}.word{min-height:36px}}
</style>
