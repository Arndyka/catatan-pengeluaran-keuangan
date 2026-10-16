import {$,escapeHtml as e,setNotice,formatDateLocal} from './utils.js';
import {state} from './state.js';
import {suggestTransaction,suggestionKey} from './transaction-quality.js';
import {predictLocalCategory} from './scanner-knowledge.js';
const FIELDS={type:'Jenis transaksi',category:'Kategori',merchant:'Merchant',description:'Keterangan',sourceAccountId:'Rekening sumber/penerima',destinationAccountId:'Rekening tujuan',amount:'Nominal',date:'Tanggal'};
const INPUTS={type:'transactionType',category:'transactionCategory',merchant:'transactionMerchant',description:'transactionDescription',sourceAccountId:'sourceAccount',destinationAccountId:'destinationAccount',amount:'transactionAmount',date:'transactionDate'};
export const transactionSignature=tx=>JSON.stringify(Object.keys(FIELDS).map(key=>String(tx[key]??'')));
export function remainingAiSuggestions(items,before,after,applied){
 return (items||[]).filter(s=>s.snapshot===transactionSignature(before)&&s.field!==applied.field&&String(s.before??'')===String(after[s.field]??'')).map(s=>({...s,snapshot:transactionSignature(after)}));
}
export function suggestionsFor(tx){
 const suggestions=[...suggestTransaction(tx,{history:state.transactions,accounts:state.settings?.accounts||[],today:formatDateLocal()}),...(tx.aiSuggestions||[]).filter(s=>s.snapshot===transactionSignature(tx))];
 const reviewed=state.transactions.filter(t=>t.id!==tx.id&&t.sourceMeta?.categoryReviewed===true).map(t=>({...t,labelStatus:'reviewed'}));
 const prediction=predictLocalCategory(tx,[...(state.scannerKnowledge?.examples||[]),...reviewed]);
 if(prediction&&prediction.category!==tx.category)suggestions.push({field:'category',before:tx.category||'',after:prediction.category,source:'Belajar lokal',reason:`Kategori dari ${prediction.support} contoh serupa yang sudah kamu konfirmasi. Periksa sebelum menerapkan.`});
 const seen=new Set();return suggestions.filter(s=>{const key=suggestionKey(s);if(seen.has(key)||(tx.dismissedSuggestions||[]).includes(key))return false;seen.add(key);return true;});
}
export function suggestionsHtml(items,scanIndex=null){
 if(!items.length)return '';
 const display=s=>s.field.endsWith('AccountId')?(state.settings?.accounts.find(a=>a.id===s.after)?.name||s.after):s.after;
 return `<div class="suggestion-list"><p class="section-label">SARAN PERBAIKAN · TINJAU DULU</p>${items.map((s,i)=>`<article class="suggestion-card"><div class="suggestion-title"><strong>${e(FIELDS[s.field]||s.field)}</strong><span>${e(s.source)}</span></div>${s.warning?'':`<p class="suggestion-change"><span>${e(s.before||'(kosong)')}</span><span aria-hidden="true">→</span><strong>${e(display(s))}</strong></p>`}<p>${e(s.reason)}</p><div class="suggestion-actions">${s.warning?'':`<button type="button" class="text-button" data-suggestion-action="apply" data-suggestion-index="${i}" ${scanIndex===null?'':`data-suggestion-scan="${scanIndex}"`}>Terapkan saran</button>`}<button type="button" class="text-button" data-suggestion-action="dismiss" data-suggestion-index="${i}" ${scanIndex===null?'':`data-suggestion-scan="${scanIndex}"`}>${s.warning?'Sudah diperiksa':'Abaikan'}</button></div></article>`).join('')}</div>`;
}
export function setupManualSuggestions(updateMode){
 let ai=[],dismissed=[],requestVersion=0;
 const read=()=>Object.fromEntries(Object.entries(INPUTS).map(([key,id])=>[key,key==='amount'?Number($(id).value):$(id).value]));
 const render=()=>{const tx={...read(),aiSuggestions:ai,dismissedSuggestions:dismissed};$('manualSuggestions').innerHTML=suggestionsHtml(suggestionsFor(tx));};
 $('transactionForm').addEventListener('input',event=>{if(!Object.values(INPUTS).includes(event.target.id))return;requestVersion++;ai=[];render();});
 $('transactionForm').addEventListener('change',event=>{if(Object.values(INPUTS).includes(event.target.id)){requestVersion++;ai=[];render();}});
 $('transactionForm').addEventListener('reset',()=>{requestVersion++;ai=[];dismissed=[];setTimeout(render,0);});
 $('checkManualButton').onclick=render;
 $('manualSuggestions').onclick=event=>{
  const button=event.target.closest('[data-suggestion-action]');if(!button)return;
  const tx={...read(),aiSuggestions:ai,dismissedSuggestions:dismissed},s=suggestionsFor(tx)[Number(button.dataset.suggestionIndex)];if(!s)return;
  if(button.dataset.suggestionAction==='apply'&&!s.warning){const input=$(INPUTS[s.field]);if(input.tagName==='SELECT'&&![...input.options].some(o=>o.value===s.after))input.add(new Option(s.after,s.after));input.value=s.after;if(s.field==='type')updateMode();requestVersion++;ai=remainingAiSuggestions(ai,tx,read(),s);}
  else dismissed.push(suggestionKey(s));render();
 };
}
