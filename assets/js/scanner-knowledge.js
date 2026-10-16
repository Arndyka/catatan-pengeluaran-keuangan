// Local statement examples. Financial facts stay separate from reviewed labels.
const norm=value=>String(value??'').trim().replace(/\s+/g,' ');
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
const facts=row=>({date:row.date||'',time:row.time||'',amount:row.amount,signedAmount:row.signedAmount,description:norm(row.description),merchant:norm(row.merchant),balanceAfter:row.balanceAfter??null,reference:row.reference||row.movementReference||''});

export function knowledgeSummary(knowledge){
 const examples=knowledge?.examples||[],reviewed=examples.filter(e=>e.labelStatus==='reviewed');
 return `${knowledge?.statements?.length||0} statement unik · ${examples.length} contoh referensi · ${reviewed.length} label kategori terkonfirmasi. Data referensi terpisah dari pembukuan.`;
}

// A small nearest-neighbour classifier. Only explicit human labels are evidence.
// Numbers are excluded: a matching amount/account number is not a category.
export function predictLocalCategory(tx,examples=[]){
 if(!['income','expense'].includes(tx.type))return null;
 const features=row=>{
  const text=[row.merchant,row.description].join(' ').toLowerCase().replace(/\d+/g,' ').replace(/[^\p{L}\s]/gu,' ').replace(/\s+/g,' ').trim();
  return new Set(text.length<6?[]:Array.from({length:text.length-2},(_,i)=>text.slice(i,i+3)));
 };
 const query=features(tx);if(!query.size)return null;
 const seen=new Set(),matches=[];
 for(const example of examples){
  if(!example.id||seen.has(example.id)||example.labelStatus!=='reviewed'||example.type!==tx.type||!example.category)continue;
  seen.add(example.id);const values=features(example);if(!values.size)continue;
  const overlap=[...query].filter(value=>values.has(value)).length;
  const score=overlap/Math.sqrt(query.size*values.size);
  if(score>=0.9)matches.push({category:example.category,score});
 }
 if(matches.length<2||new Set(matches.map(item=>item.category)).size!==1)return null;
 return {category:matches[0].category,support:matches.length,similarity:Math.min(...matches.map(item=>item.score))};
}

export async function consolidateStatements(results=[]) {
 const groups=new Map(),examples=[],rejected=[];let duplicateFiles=0,duplicateRows=0;
 for(const {statement:s,candidates:rows=[]} of results){
  const m=s?.metadata||{},rec=s?.reconciliation||{};
  if(!s||!rec.balanced||rec.rowMismatchCount||!m.accountMasked||!m.periodStart||!m.periodEnd||!rows.length||rows.some(r=>!Number.isFinite(r.amount)||r.amount<=0||!Number.isFinite(r.signedAmount))){
   rejected.push({fileName:s?.fileName||'',reason:'Rekonsiliasi, identitas rekening, periode, atau nominal belum lengkap.'});continue;
  }
  const identity={bank:s.bank,account:norm(m.accountMasked),periodStart:m.periodStart,periodEnd:m.periodEnd,openingBalance:m.openingBalance,closingBalance:m.closingBalance,incomingTotal:m.incomingTotal,outgoingTotal:m.outgoingTotal,rows:rows.map(facts)};
  const id=await digest(identity),existing=groups.get(id);
  if(existing){
   if(!existing.sourceFiles.includes(s.fileName))existing.sourceFiles.push(s.fileName);
   duplicateFiles++;duplicateRows+=rows.length;continue;
  }
  groups.set(id,{id,bank:s.bank,accountMasked:m.accountMasked,periodStart:m.periodStart,periodEnd:m.periodEnd,openingBalance:m.openingBalance,closingBalance:m.closingBalance,incomingTotal:m.incomingTotal,outgoingTotal:m.outgoingTotal,rowCount:rows.length,pageCount:s.pageCount,sourceFiles:[s.fileName],reconciled:true});
  for(const [index,row] of rows.entries()){
   examples.push({id:`${id}-${index+1}`,statementId:id,bank:s.bank,...facts(row),type:row.type,sourcePage:row.sourcePage||0,sourceRow:row.sourceRow||index+1,extractionMethod:row.extractionMethod||'native',category:'',suggestedCategory:row.category||'',labelStatus:'unreviewed'});
  }
 }
 return {version:1,statements:[...groups.values()],examples,duplicateFiles,duplicateRows,rejected};
}
