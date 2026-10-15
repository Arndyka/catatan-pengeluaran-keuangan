import {scanExclusionReason} from './transaction-quality.js';
export function visionCandidates(result,{bank,accountId,pageNumber}) {
 return (Array.isArray(result?.transactions)?result.transactions:[]).flatMap((row,index)=>{
  const date=String(row.date||''), parsed=new Date(date+'T12:00:00Z');
  if(row.record_kind!=='transaction'||!row.status||scanExclusionReason(row))return [];
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==date||typeof row.amount!=='number'||!Number.isFinite(row.amount)||row.amount<=0||!['incoming','outgoing','internal_transfer'].includes(row.direction))return [];
  const incoming=row.direction==='incoming',internal=row.direction==='internal_transfer';
  return [{date,time:/^\d{2}:\d{2}(:\d{2})?$/.test(row.time||'')?row.time:'',amount:row.amount,type:internal?'transfer':incoming?'income':'expense',signedAmount:incoming?row.amount:-row.amount,description:String(row.description||'').slice(0,2000),merchant:String(row.merchant||'').slice(0,200),reference:String(row.reference||'').slice(0,120),sourceAccountId:accountId,destinationAccountId:'',category:'Lainnya',bank,bankLabel:bank,sourcePage:pageNumber,sourceRow:index+1,selected:false,internalMovement:internal,transferNeedsMapping:internal,confidence:Math.max(0,Math.min(1,Number(row.confidence)||0)),validationStatus:'pending',extractionMethod:'nvidia-vision',balanceAfter:typeof row.balance_after==='number'&&Number.isFinite(row.balance_after)?row.balance_after:null,origin:'statement-reader',aiReason:'Hasil AI: periksa tanggal, nominal, jenis, dan rekening sebelum memilih.'}];
 });
}

export async function imageDataUrl(source) {
 // Send a bounded PNG/JPEG image, never the original PDF or its password.
 const bitmap=source instanceof Blob?await createImageBitmap(source):source;
 try{
  const scale=Math.min(1,2200/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
  const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/jpeg',0.9);
 }finally{if(source instanceof Blob)bitmap.close();}
}
