import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import viteConfig from '../../vite.config.js';

const source=fs.readFileSync(new URL('../../src/main.js',import.meta.url),'utf8');
function redirects(host,stage,flag){
 const calls=[];
 const body=source.slice(source.indexOf('function redirectToCanonicalHost()'))
  .replaceAll('import.meta.env.VERCEL_ENV',JSON.stringify(stage))
  .replaceAll('import.meta.env.VITE_RA_DIAGNOSIS',JSON.stringify(flag));
 const window={location:{hostname:host,pathname:'/ra',search:'?questionId=RA_024',hash:'#recording',replace:value=>calls.push(value)}};
 vm.runInNewContext(body+'\nredirectToCanonicalHost();',{window});return calls;
}
for(const flag of ['on','off',undefined]){
 test(`Preview never redirects with diagnosis ${flag}`,()=>{
  assert.deepEqual(redirects('kai-preview.vercel.app','preview',flag),[]);
 });
 test(`Production redirect is independent of diagnosis ${flag}`,()=>{
  assert.deepEqual(redirects('kai-old.vercel.app','production',flag),['https://kai-kou.vercel.app/ra?questionId=RA_024#recording']);
  assert.deepEqual(redirects('kai-kou.vercel.app','production',flag),[]);
  assert.deepEqual(redirects('www.yli.cc.cd','production',flag),[]);
  assert.deepEqual(redirects('localhost','development',flag),[]);
 });
}
test('Vite explicitly embeds deployment stage for the browser and defaults local builds to development',()=>{
 const original=process.env.VERCEL_ENV;
 try{
  for(const stage of ['preview','production',undefined]){
   if(stage===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=stage;
   const config=viteConfig({mode:'production'});
   assert.equal(config.define?.['import.meta.env.VERCEL_ENV'],JSON.stringify(stage||'development'));
   assert.deepEqual(Object.keys(config.define),['import.meta.env.VERCEL_ENV']);
  }
 }finally{if(original===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=original;}
});
