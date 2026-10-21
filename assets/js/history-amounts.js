// Re-read ambiguous amount glyphs from pixels, preserving every known digit,
// decimal separator and sign. Never repair financial text by substitution alone.
export function confirmedAmountRetry(original,reading,confidence){
 if(!Number.isFinite(confidence)||confidence<80||!/[OIl]/.test(original)||!/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?$/.test(reading)||original.length!==reading.length)return false;
 return [...original].every((c,i)=>c===reading[i]||(c==='O'?reading[i]==='0':/[Il]/.test(c)&&reading[i]==='1'));
}
export async function readHistoryAmounts(data,canvas,worker,shouldCancel=()=>false){
 const lines=data.lines||[];if(!lines.length)return data.text||'';const output=[];
 try{
  await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'0123456789.,'});
  for(const line of lines){
   if(shouldCancel())throw new Error('Proses scan dibatalkan.');
   let text=line.text.trim();
   for(const word of line.words||[]){
    const match=word.text.match(/^([+-]?Rp)([0-9OIl.,]+)$/i);if(!match||!/[OIl]/.test(match[2]))continue;
    const symbols=word.symbols||[],start=symbols[match[1].length]?.bbox,last=symbols.at(-1)?.bbox;
    if(!start||!last||symbols.length!==word.text.length)continue;
    const x=start.x0-3,y=word.bbox.y0-4,w=last.x1-x+4,h=word.bbox.y1-y+4;if(w<=0||h<=0)continue;
    const crop=document.createElement('canvas');crop.width=w*3+40;crop.height=h*3+40;const ctx=crop.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,crop.width,crop.height);ctx.drawImage(canvas,x,y,w,h,20,20,w*3,h*3);
    const result=await worker.recognize(crop),reading=result.data.text.trim();
    if(confirmedAmountRetry(match[2],reading,result.data.confidence))text=text.replace(word.text,match[1]+reading);
   }
   output.push(text);
  }
 }finally{await worker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:'',preserve_interword_spaces:'1',user_defined_dpi:'300'});}
 return output.join('\n');
}
