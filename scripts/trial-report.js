import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createTrialClient, findTrialUser, readAll } from './lib/trial-admin.js';

function dateKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function toIsoStart(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00.000Z`)) || new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date) {
    throw new Error('--since 必须是 YYYY-MM-DD 日期');
  }
  return `${date}T00:00:00.000Z`;
}

function scoreTotal(row) {
  const score = row.score_json;
  const total = row.score_total ?? row.legacy_total ?? score?.metrics?.score?.total ?? score?.score?.total ?? score?.scores?.overall ?? score?.total;
  return Number.isFinite(total) ? total : null;
}

function avg(numbers) {
  const clean = numbers.filter(Number.isFinite);
  return clean.length ? Math.round((clean.reduce((sum, n) => sum + n, 0) / clean.length) * 10) / 10 : null;
}

function distribution(values) {
  const buckets = {};
  for (const value of values) buckets[String(value)] = (buckets[String(value)] || 0) + 1;
  return buckets;
}

function participantLabel(index) {
  return `参与者 ${index + 1}`;
}

function eventCount(events, name) {
  return events.filter(event => event.event === name).length;
}

function activityDates(practices, events) {
  return [...new Set([...practices.map(row => dateKey(row.created_at)), ...events.map(row => dateKey(row.created_at))])].sort();
}

function viewedEvidenceFraction(events) {
  const viewed = new Set(events.filter(event => event.event === 'ra_result_viewed' && event.analysis_id).map(event => event.analysis_id));
  if (!viewed.size) return null;
  const replayed = new Set(events.filter(event => event.event === 'ra_evidence_played' && viewed.has(event.analysis_id)).map(event => event.analysis_id));
  return Math.round((replayed.size / viewed.size) * 1000) / 1000;
}

function scoreReference(practicesSince, allPracticesForUser) {
  const days = [...new Set(practicesSince.map(row => dateKey(row.created_at)))].sort();
  if (!days.length) return { first_day_avg: null, final_day_new_question_avg: null, delta: null, final_day_new_question_count: 0 };
  const firstDay = days[0];
  const finalDay = days[days.length - 1];
  const firstDayAvg = avg(practicesSince.filter(row => dateKey(row.created_at) === firstDay).map(scoreTotal));
  const finalRows = firstDay === finalDay ? [] : practicesSince.filter(row => dateKey(row.created_at) === finalDay);
  const novelFinalRows = finalRows.filter(row => row.question_id && !allPracticesForUser.some(other => other.question_id === row.question_id && new Date(other.created_at) < new Date(row.created_at)));
  const finalNovelAvg = avg(novelFinalRows.map(scoreTotal));
  return {
    first_day: firstDay,
    final_day: finalDay,
    first_day_avg: firstDayAvg,
    final_day_new_question_avg: finalNovelAvg,
    delta: firstDayAvg !== null && finalNovelAvg !== null ? Math.round((finalNovelAvg - firstDayAvg) * 10) / 10 : null,
    final_day_new_question_count: novelFinalRows.length
  };
}

export function parseReportArgs(args) {
  const { values } = parseArgs({ args, options: { since: { type: 'string' }, emails: { type: 'string' } } });
  if (!values.since) throw new Error('请提供 --since YYYY-MM-DD');
  if (!values.emails) throw new Error('请提供 --emails a@x.com,b@y.com');
  const since = toIsoStart(values.since);
  const emails = [...new Set(values.emails.split(',').map(email => email.trim().toLowerCase()).filter(Boolean))];
  if (!emails.length || emails.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error('请提供有效的 --emails');
  return { since, emails };
}

export function buildTrialReport({ since, participants, practices = [], events = [] }) {
  const sinceTime = new Date(since).getTime();
  const rows = participants.map((participant, index) => {
    const label = participantLabel(index);
    if (!participant.user_id) {
      return { participant: label, registered: false, status: '对方还没注册' };
    }
    const userPracticesAll = practices.filter(row => row.user_id === participant.user_id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const userPracticesSince = userPracticesAll.filter(row => new Date(row.created_at).getTime() >= sinceTime);
    const userEvents = events.filter(row => row.user_id === participant.user_id && new Date(row.created_at).getTime() >= sinceTime);
    const dates = activityDates(userPracticesSince, userEvents);
    return {
      participant: label,
      registered: true,
      practice_count: userPracticesSince.length,
      active_days: new Set(userPracticesSince.map(row => dateKey(row.created_at))).size,
      result_views: eventCount(userEvents, 'ra_result_viewed'),
      evidence_replay_result_page_fraction: viewedEvidenceFraction(userEvents),
      rules_opens: eventCount(userEvents, 'ra_rules_opened'),
      retries: eventCount(userEvents, 'ra_retry_started'),
      returned_after_first_day: dates.length > 1,
      score_reference: scoreReference(userPracticesSince, userPracticesAll)
    };
  });
  const registeredRows = rows.filter(row => row.registered);
  return {
    generated_at: new Date().toISOString(),
    since,
    timezone: 'UTC',
    scope: 'RA only',
    participants: rows,
    summary: {
      participant_count: rows.length,
      registered_count: registeredRows.length,
      missing_registration_count: rows.length - registeredRows.length,
      practice_count_distribution: distribution(registeredRows.map(row => row.practice_count)),
      active_days_distribution: distribution(registeredRows.map(row => row.active_days)),
      result_views_distribution: distribution(registeredRows.map(row => row.result_views)),
      evidence_replay_fraction_distribution: distribution(registeredRows.map(row => row.evidence_replay_result_page_fraction ?? 'no_result_views')),
      rules_opens_distribution: distribution(registeredRows.map(row => row.rules_opens)),
      retries_distribution: distribution(registeredRows.map(row => row.retries)),
      returned_after_first_day_count: registeredRows.filter(row => row.returned_after_first_day).length,
      final_new_question_score_deltas: registeredRows.map(row => row.score_reference.delta).filter(Number.isFinite)
    }
  };
}

function markdown(report) {
  const lines = [`# 试用统计报告`, '', `生成时间：${report.generated_at}`, `统计起点：${report.since.slice(0, 10)}`, '', '## 参与者'];
  for (const row of report.participants) {
    if (!row.registered) {
      lines.push('', `### ${row.participant}`, '', '- 状态：对方还没注册');
      continue;
    }
    lines.push('', `### ${row.participant}`, '',
      `- 练习次数：${row.practice_count}`,
      `- 练习天数：${row.active_days}`,
      `- 结果页打开次数：${row.result_views}`,
      `- 回听过证据的结果页占比：${row.evidence_replay_result_page_fraction === null ? '无结果页' : `${Math.round(row.evidence_replay_result_page_fraction * 100)}%`}`,
      `- 规则弹窗打开次数：${row.rules_opens}`,
      `- 重练次数：${row.retries}`,
      `- 首日之后是否回访：${row.returned_after_first_day ? '是' : '否'}`,
      `- 最后一天未做过题相对首日总分变化：${row.score_reference.delta === null ? '样本不足' : row.score_reference.delta}`);
  }
  lines.push('', '## 汇总', '',
    `- 参与者数：${report.summary.participant_count}`,
    `- 已注册人数：${report.summary.registered_count}`,
    `- 未注册人数：${report.summary.missing_registration_count}`,
    `- 首日之后回访人数：${report.summary.returned_after_first_day_count}`,
    `- 最后一天未做过题分数变化样本：${report.summary.final_new_question_score_deltas.length}`,
    '',
    '说明：仅统计 RA，日期按 UTC 划分；首次与末次必须在不同日期。最后一天未做过题的分数变化只作描述性参考，不代表提分结论，题目差异和评分版本均可能影响分数。');
  return `${lines.join('\n')}\n`;
}

async function loadRows(client, users, since) {
  if (!users.length) return { practices: [], events: [] };
  const ids = users.map(user => user.id);
  const practices = await readAll((start, end) => client.from('practice_logs')
    .select('id,user_id,task_type,question_id,score_total:score_json->metrics->score->total,legacy_total:score_json->scores->overall,created_at')
    .in('user_id', ids).eq('task_type', 'RA').order('created_at', { ascending: true }).range(start, end));
  const events = await readAll((start, end) => client.from('practice_events')
    .select('id,user_id,event,analysis_id,question_id,created_at')
    .in('user_id', ids).gte('created_at', since).order('created_at', { ascending: true }).range(start, end));
  return { practices, events };
}

export async function runTrialReport(client, options) {
  const users = [];
  const participants = [];
  for (const email of options.emails) {
    const user = await findTrialUser(client, email);
    if (user) users.push(user);
    participants.push({ user_id: user?.id ?? null });
  }
  const { practices, events } = await loadRows(client, users, options.since);
  const report = buildTrialReport({ since: options.since, participants, practices, events });
  await fs.mkdir('output/trial', { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join('output/trial', `trial-report-${stamp}.json`);
  const mdPath = path.join('output/trial', `trial-report-${stamp}.md`);
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(mdPath, markdown(report));
  return { report, jsonPath, mdPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { jsonPath, mdPath, report } = await runTrialReport(createTrialClient(), parseReportArgs(process.argv.slice(2)));
    console.log(JSON.stringify({ jsonPath, mdPath, participants: report.summary.participant_count, registered: report.summary.registered_count }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
