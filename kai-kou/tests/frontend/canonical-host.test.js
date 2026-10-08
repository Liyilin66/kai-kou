import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../../src/main.js',import.meta.url),'utf8');
function redirects(host,flag){
 const calls=[];
 const body=source.slice(source.indexOf('function redirectToCanonicalHost()')).replaceAll('import.meta.env.VITE_RA_DIAGNOSIS',JSON.stringify(flag));
 const window={location:{hostname:host,pathname:'/ra',search:'?questionId=RA_024',hash:'',replace:value=>calls.push(value)}};
 vm.runInNewContext(body+'\nredirectToCanonicalHost();',{window});return calls;
}
test('diagnosis-enabled preview stays on its own deployment rather than production',()=>{
 assert.deepEqual(redirects('kai-preview.vercel.app','on'),[]);
});
test('legacy deployment canonical redirect remains unchanged when feature is off',()=>{
 assert.deepEqual(redirects('kai-old.vercel.app','off'),['https://kai-kou.vercel.app/ra?questionId=RA_024']);
 assert.deepEqual(redirects('kai-kou.vercel.app','off'),[]);
 assert.deepEqual(redirects('www.yli.cc.cd','off'),[]);
 assert.deepEqual(redirects('localhost','on'),[]);
});
