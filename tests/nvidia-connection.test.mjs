import test from 'node:test';
import assert from 'node:assert/strict';
import {checkNvidiaBackend} from '../assets/js/nvidia-ai.js';

test('backend reachability alone does not mean AI credentials are configured',async()=>{
 const original=globalThis.fetch;
 try{
  for(const payload of [{ok:true,api_key_configured:false},{ok:true},{ok:false,api_key_configured:true}]){
   globalThis.fetch=async()=>new Response(JSON.stringify(payload),{status:200});
   await assert.rejects(()=>checkNvidiaBackend('https://ai.example.test'),/API key|belum siap/);
  }
  const ready={ok:true,api_key_configured:true};
  globalThis.fetch=async url=>{assert.equal(url,'https://ai.example.test/health');return new Response(JSON.stringify(ready));};
  assert.deepEqual(await checkNvidiaBackend('https://ai.example.test/'),ready);
 }finally{globalThis.fetch=original;}
});
