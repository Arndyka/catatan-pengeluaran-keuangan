import test from 'node:test';
import assert from 'node:assert/strict';
import {checkNvidiaBackend,readPageWithNvidia,optimizeCandidatesWithNvidia} from '../assets/js/nvidia-ai.js';

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

test('hosted scanner requires access and warms server before sending private data',async()=>{
 const original=globalThis.fetch;
 const calls=[];
 try{
  globalThis.fetch=async(url,options)=>{
   calls.push({url,options});
   if(url.endsWith('/health'))return Response.json({ok:true,api_key_configured:true,auth_required:true,access_configured:true});
   assert.equal(options.headers.Authorization,'Bearer test-access-token');
   if(url.endsWith('/access'))return Response.json({ok:true});
   return Response.json({result:{transactions:[]},updates:[]});
  };
  await assert.rejects(()=>checkNvidiaBackend('https://ai.example.test'),/kode akses/i);
  assert.equal(calls.length,1);
  calls.length=0;
  await readPageWithNvidia({baseUrl:'https://ai.example.test',accessToken:'test-access-token',imageDataUrl:'data:image/png;base64,AAAA'});
  assert.deepEqual(calls.map(c=>new URL(c.url).pathname),['/health','/api/nvidia/access','/api/nvidia/read-page']);
  assert.equal(calls[0].options.body,undefined);
  calls.length=0;
  await optimizeCandidatesWithNvidia({baseUrl:'https://ai.example.test',accessToken:'test-access-token',candidates:[{amount:10000}]});
  assert.deepEqual(calls.map(c=>new URL(c.url).pathname),['/health','/api/nvidia/access','/api/nvidia/normalize-statement']);
 }finally{globalThis.fetch=original;}
});

test('scanner refuses unsafe backend URLs before transmitting credentials',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>{assert.fail('Unsafe destination must not receive a request');};
  for(const url of ['http://ai.example.test','https://user:password@ai.example.test','https://ai.example.test?key=secret','javascript:alert(1)']){
   await assert.rejects(()=>checkNvidiaBackend(url,'private-access'),/URL|HTTPS/);
  }
 }finally{globalThis.fetch=original;}
});
