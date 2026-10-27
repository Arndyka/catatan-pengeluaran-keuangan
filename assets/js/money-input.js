// UI-only rupiah parsing. Journals continue to receive numeric values.
function parts(value){
 const text=String(value??'').trim().replace(/^Rp\s*/i,'');
 if(!text)return null;
 const local=text.match(/^(\d+|\d{1,3}(?:\.\d{3})+)(?:,(\d{0,2}))?$/);
 if(local)return [local[1].replaceAll('.',''),local[2]];
 const decimal=text.match(/^(\d+)\.(\d{0,2})$/);
 return decimal?[decimal[1],decimal[2]]:null;
}
export function parseMoneyInput(value){
 const p=parts(value);if(!p)return NaN;
 const amount=Number(p[0]+'.'+(p[1]||'0'));
 return Number.isFinite(amount)&&amount<=Number.MAX_SAFE_INTEGER/100?amount:NaN;
}
export function formatMoneyInput(value){
 const p=parts(value);if(!p||!Number.isFinite(parseMoneyInput(value)))return String(value??'');
 const integer=p[0].replace(/^0+(?=\d)/,'').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
 return integer+(p[1]!==undefined?','+p[1]:'');
}
const selector=[
 '#transactionAmount','#recurringAmount','#officialStatementAmount','#ccLimitInput','#ccMinimumFloorInput','#budgetValue[data-money]',
 '[data-scan-field="amount"]','#transactionEditForm [name="amount"]','#openingBalanceForm [name="amount"]',
 '#settleRecurringForm [name="amount"]','#goalForm [name="target"]','#goalForm [name="saved"]','#limitForm [name="limit"]',
 ...['admin','card','minimum','penalty','held'].map(n=>`#bankRuleForm [name="${n}"]`),
 ...['price','fee','limitPrice','cost','bookValue'].map(n=>`#investmentForm [name="${n}"]`)
].join(',');
function validate(input){
 const value=parseMoneyInput(input.value),min=Number(input.getAttribute('min')||0),max=input.getAttribute('max');
 input.setCustomValidity(input.value===''?'':!Number.isFinite(value)?'Gunakan angka rupiah, misalnya 1.000.000,50 (maksimal 2 angka sen).':value<min?`Nominal minimal ${formatMoneyInput(min)}.`:max!==null&&value>Number(max)?`Nominal maksimal ${formatMoneyInput(max)}.`:'');
}
function formatField(input,preserveCaret=false){
 const before=input.value,caret=input.selectionStart;
 const decimalDot=/^\d+\.\d{0,2}$/.test(before);
 const significant=preserveCaret?(decimalDot?before.slice(0,caret):before.slice(0,caret).replaceAll('.','')).length:0;
 const next=formatMoneyInput(before);if(next!==before){input.value=next;if(preserveCaret){let count=0,pos=0;while(pos<next.length&&count<significant){if(next[pos]!=='.')count++;pos++;}input.setSelectionRange(pos,pos);}}
 validate(input);
}
export function refreshMoneyInputs(root=document){
 const budget=document.getElementById('budgetValue');
 if(budget){const nominal=document.getElementById('budgetMethod')?.value==='nominal';
  document.querySelector('label[for="budgetValue"]').textContent=nominal?'Nominal (Rp)':'Persentase (%)';
  if(nominal&&!budget.dataset.money){budget.dataset.money='true';budget.type='text';budget.inputMode='decimal';}
  else if(!nominal&&budget.dataset.money){delete budget.dataset.money;budget.value='';budget.type='number';budget.removeAttribute('inputmode');budget.setCustomValidity('');}
 }
 for(const input of root.querySelectorAll(selector)){
  if(!input.dataset.money){input.dataset.money='true';input.type='text';input.inputMode='decimal';input.placeholder='0';input.title='Rupiah: titik untuk ribuan, koma untuk sen';}
  if(input!==document.activeElement)formatField(input);
 }
}
export function moneyFormData(form){
 const data=Object.fromEntries(new FormData(form));
 for(const input of form.querySelectorAll(selector))if(input.name&&!input.disabled&&Object.hasOwn(data,input.name))data[input.name]=parseMoneyInput(input.value);
 return data;
}
function editDigits(input,type,text=''){
 let value=input.value,start=input.selectionStart,end=input.selectionEnd;
 if(parts(value)){start=value.slice(0,start).replaceAll('.','').length;end=value.slice(0,end).replaceAll('.','').length;value=value.replaceAll('.','');}
 if(start===end&&type==='deleteContentBackward')start=Math.max(0,start-1);
 if(start===end&&type==='deleteContentForward')end=Math.min(value.length,end+1);
 input.value=value.slice(0,start)+text+value.slice(end);input.setSelectionRange(start+text.length,start+text.length);
 input.dispatchEvent(new Event('input',{bubbles:true}));
}
export function setupMoneyInputs(){
 refreshMoneyInputs();
 // Apply text edits to ungrouped digits, then render again. Preventing the
 // native edit avoids WebKit applying an obsolete selection after formatting.
 document.addEventListener('beforeinput',event=>{
  const input=event.target;if(!input.matches?.(selector)||event.isComposing||!event.cancelable)return;
  if(!['insertText','deleteContentBackward','deleteContentForward'].includes(event.inputType))return;
  event.preventDefault();editDigits(input,event.inputType,event.inputType==='insertText'?(event.data==='.'?',':event.data??''):'');
 },true);
 document.addEventListener('paste',event=>{
  const input=event.target;if(!input.matches?.(selector)||input.readOnly||input.disabled||!event.clipboardData||!event.cancelable)return;
  event.preventDefault();editDigits(input,'paste',event.clipboardData.getData('text/plain'));
 },true);
 document.addEventListener('cut',event=>{
  const input=event.target;if(!input.matches?.(selector)||input.readOnly||input.disabled||!event.clipboardData||!event.cancelable)return;
  event.clipboardData.setData('text/plain',input.value.slice(input.selectionStart,input.selectionEnd));event.preventDefault();editDigits(input,'cut');
 },true);
 document.addEventListener('input',event=>{if(event.target.matches?.(selector)&&!event.isComposing)formatField(event.target,true);},true);
 document.addEventListener('focusin',event=>{if(event.target.matches?.(selector))formatField(event.target);});
 document.addEventListener('focusout',event=>{if(event.target.matches?.(selector))formatField(event.target);});
 document.addEventListener('reset',()=>setTimeout(()=>refreshMoneyInputs(),0));
 document.addEventListener('change',event=>{if(event.target.id==='budgetMethod'){document.getElementById('budgetValue').value='';refreshMoneyInputs();}});
 new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1)))refreshMoneyInputs();}).observe(document.body,{childList:true,subtree:true});
}
