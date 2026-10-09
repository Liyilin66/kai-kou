import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {ref, computed, reactive} from 'vue';
import {getEnabledTaskTypes, HOME_TASK_TYPES, hasUnavailableTaskRecommendation} from '../../src/lib/enabled-task-types.js';

// Run the real setup statements: source-string checks missed a TDZ that blanked /home.
function initialize(path, diEnabled = false) {
 const source=readFileSync(new URL(`../../${path}`,import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1]
  .replace(/^import[\s\S]*?from\s+["'][^"']+["'];?\s*\n/gm,'');
 const context=vm.createContext({console,Date,Intl,Map,Set,JSON,Math,Number,String,Boolean,Array,Object,
  ref,computed,reactive,nextTick:()=>{},onMounted:()=>{},onBeforeUnmount:()=>{},watch:()=>{},
  useRouter:()=>({push:()=>{},replace:()=>{}}),useRoute:()=>({path:'/home',fullPath:'/home',hash:'',query:{}}),
  useAuthStore:()=>({displayName:'测试同学',user:null,profile:{},loaded:true,isLoggedIn:true}),
  usePracticeStore:()=>({tasks:[]}),storeToRefs:()=>({tasks:ref([])}),isDIEnabled:()=>diEnabled,
  getEnabledTaskTypes,HOME_TASK_TYPES,hasUnavailableTaskRecommendation,createEmptyDesktopDashboardState:()=>({}),
 });
 vm.runInContext(source,context);
 return context;
}
for(const path of ['src/views/HomeView.vue','src/views/HomeReplicaView.vue']) {
 test(`${path} initializes disabled-DI suggestions without accessing uninitialized computed values`,()=>{
  const ctx=initialize(path);
  const state=vm.runInContext('dailyAiSuggestionState.value',ctx);
  assert.ok(state.suggestion);assert.ok(state.suggestion.tasks.every(x=>x.task_type!=='DI'));
 });
}

for(const path of ['src/views/HomeView.vue','src/views/HomeReplicaView.vue']) {
 test(`${path} rejects cached DI prose and falls back to open practice tasks`,()=>{
  const ctx=initialize(path);
  const output=vm.runInContext(`sanitizeDailySuggestion({main_task_type:'DI',headline:'练 DI',reason:'DI weak',advice:'练 DI',tasks:[{task_type:'DI',count:2}],cta_text:'DI'})`,ctx);
  assert.doesNotMatch(JSON.stringify(output), /\bDI\b/);
 });
}

for(const path of ['src/views/HomeView.vue','src/views/HomeReplicaView.vue']) {
 test(`${path} preserves a DI recommendation when DI is explicitly enabled`,()=>{
  const ctx=initialize(path,true);
  const output=vm.runInContext(`sanitizeDailySuggestion({main_task_type:'DI',advice:'先练 DI',tasks:[{task_type:'DI',count:2}]})`,ctx);
  assert.equal(output.main_task_type,'DI');assert.match(output.advice,/DI/);
 });
}
test('unavailable recommendation prose is detected case-insensitively while open recommendations are kept',()=>{
 assert.equal(hasUnavailableTaskRecommendation({advice:'practice di today'},{diEnabled:false}),true);
 assert.equal(hasUnavailableTaskRecommendation({advice:'practice DI today'},{diEnabled:true}),false);
});
test('enabled task list never invents unsupported task types or refills an intentionally empty list',()=>{
 assert.deepEqual(getEnabledTaskTypes({types:[],diEnabled:true}),[]);
 assert.deepEqual(getEnabledTaskTypes({types:['RA','unknown','RA','DI'],diEnabled:false}),['RA']);
});
