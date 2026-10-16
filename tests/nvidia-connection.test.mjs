import test from 'node:test';
import assert from 'node:assert/strict';
import {checkNvidiaBackend,readPageWithNvidia,optimizeCandidatesWithNvidia} from '../assets/js/nvidia-ai.js';
test('retired LLM entry points never transmit documents or credentials',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw new Error('Network must not be used');};
 try{
  for(const call of [()=>checkNvidiaBackend('https://ai.example.test','secret'),()=>readPageWithNvidia({baseUrl:'https://ai.example.test',imageDataUrl:'data:image/png;base64,AAAA'}),()=>optimizeCandidatesWithNvidia({baseUrl:'https://ai.example.test',candidates:[{amount:123}]})])await assert.rejects(call,/dinonaktifkan/);
  assert.equal(calls,0);
 }finally{globalThis.fetch=original;}
});
