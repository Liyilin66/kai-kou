import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAvatarUrl, uploadAndSaveAvatar} from '../../src/lib/avatar.js';
const blob = new Blob(['jpeg'],{type:'image/jpeg'});
function fixture({uploadError,metadataError,deleteError}={}) {
 const state={uploads:[],patches:[],removed:[],warnings:[]};
 const bucket={list:async()=>({data:[{name:'avatar-1.jpg'},{name:'unrelated.txt'}]}),
  upload:async(...args)=>{state.uploads.push(args);return {error:uploadError};},
  getPublicUrl:path=>({data:{publicUrl:`https://example.supabase.co/storage/v1/object/public/avatars/${path}`}}),
  remove:async paths=>{state.removed.push(paths);return {error:deleteError};}};
 return {state,input:{client:{storage:{from:name=>{assert.equal(name,'avatars');return bucket;}}},userId:'user-123',blob,
  saveMetadata:async patch=>{state.patches.push(patch);if(metadataError)throw metadataError;},warn:msg=>state.warnings.push(msg)}};
}
test('avatar URL accepts HTTPS and rejects data, HTTP and invalid URLs',()=>{
 assert.equal(normalizeAvatarUrl('data:image/jpeg;base64,abc'),'');assert.equal(normalizeAvatarUrl('http://example.com/a'),'');
 assert.equal(normalizeAvatarUrl('https://example.com/a'),'https://example.com/a');assert.equal(normalizeAvatarUrl('invalid'),'');
});
test('uploads JPEG to owner timestamp path and writes only a short public URL before deleting old files',async()=>{
 const {state,input}=fixture();const url=await uploadAndSaveAvatar(input);
 assert.match(state.uploads[0][0],/^user-123\/avatar-\d+\.jpg$/);assert.equal(state.uploads[0][2].contentType,'image/jpeg');
 assert.equal(state.patches[0].avatar_url,url);assert.ok(url.length<300);assert.deepEqual(state.removed,[['user-123/avatar-1.jpg']]);
});
test('failed upload never updates metadata or deletes old avatar',async()=>{
 const {state,input}=fixture({uploadError:new Error('network')});await assert.rejects(uploadAndSaveAvatar(input),/头像上传失败/);
 assert.equal(state.patches.length,0);assert.equal(state.removed.length,0);
});
test('metadata failure only cleans unreferenced new upload, preserves existing avatar',async()=>{
 const {state,input}=fixture({metadataError:new Error('save')});await assert.rejects(uploadAndSaveAvatar(input),/save/);
 assert.deepEqual(state.removed,[[state.uploads[0][0]]]);
});
test('old avatar deletion failure warns without failing successful save',async()=>{
 const {state,input}=fixture({deleteError:new Error('remove')});assert.ok(await uploadAndSaveAvatar(input));assert.equal(state.warnings.length,1);
});
test('rejects oversized or non-JPEG payload before upload',async()=>{
 const {state,input}=fixture();await assert.rejects(uploadAndSaveAvatar({...input,blob:new Blob(['png'],{type:'image/png'})}),/头像数据无效/);
 await assert.rejects(uploadAndSaveAvatar({...input,blob:new Blob([new Uint8Array(1024*1024+1)],{type:'image/jpeg'})}),/头像数据无效/);
 assert.equal(state.uploads.length,0);
});
