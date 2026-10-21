// Livin card history uses unsigned purchases and raised cents. It must never
// share the debit-account parser or treat the card summary as new spending.
export function isMandiriCardHistory(text) {
  return /(?:^|\n)\s*Transaksi\b/i.test(text)
    && /\bBelum Tertagih\b/i.test(text)
    && (/e[- ]?Billing/i.test(text) || /Tagihan Berjalan/i.test(text) && /Sisa Limit/i.test(text));
}

export function cardHistory(text, {parseDate, parseMoney}) {
  const handled = isMandiriCardHistory(text);
  const rows = [], excluded = [];
  if (!handled) return {handled, rows, excluded};
  const body = text.slice(text.search(/(?:^|\n)\s*Transaksi\b/i));
  let date = '', active = null, number = 0;
  const flush = () => {
    if (!active) return;
    const description = active.description.join(' ').trim();
    const reason = !active.date ? 'Tanggal transaksi belum terbaca lengkap.'
      : !active.amount ? 'Nominal termasuk sen belum terbaca pasti; periksa gambar asli.'
      : /(?:^|\s)[+−–-]\s*(?:Rp|IDR)|\b(refund|pengembalian|pembayaran|payment received|payment thank|kredit kembali|CR)\b/i.test(active.raw+' '+description)
        ? 'Pembayaran/refund kartu perlu klasifikasi tersendiri; bukan belanja kartu.' : '';
    if (reason) excluded.push({row:active.row, reason});
    else rows.push({...active, description});
    active = null;
  };
  for (const original of body.split('\n')) {
    const line = original.trim();
    if (/^(?:Tagihan (?:Berjalan|Saat Ini)|Sisa Limit|Limit (?:Kredit|Kartu)|Jumlah Kredit|Kredit Tersedia|Jatuh Tempo|Saldo\b|Total\b|Ringkasan\b)/i.test(line)) {
      flush();continue;
    }
    if (/^\d{1,2}\s+[a-z]+\s+20\d{2}$/i.test(line)) {
      flush(); date = parseDate(line);
      const parsed = new Date(date+'T12:00:00Z');
      if (!date || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date) date = '';
      continue;
    }
    // A damaged or split heading must not inherit yesterday's date.
    if (/^(?:[\dOIlS ]{1,5}\s+)?(?:Jan\w*|Feb\w*|Mar\w*|Apr\w*|Mei|May|Jun\w*|Jul\w*|Agu\w*|Aug\w*|Sep\w*|Okt\w*|Oct\w*|Nov\w*|Des\w*|Dec\w*)(?:\s+[\dOIlS]{4})?[.,]?$/i.test(line) || /^[\dOIlS]{4}$/.test(line) || /^[\dOIlS]{1,4}[/.-][\dOIlS]{1,2}[/.-][\dOIlS]{1,4}[.,]?$/.test(line)) {
      flush();date='';continue;
    }
    if (/\b(?:Rp|IDR)\s*/i.test(line)) {
      flush(); number++;
      // Explicit two-digit cents are mandatory. Cropped raised cents are
      // independently OCR'd below; punctuation is never assumed to mean 00.
      const money = line.match(/\b(?:Rp|IDR)\s*((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*$/i);
      const amount = money ? parseMoney(money[1])?.amount : 0;
      const description = line.replace(/\b(?:Rp|IDR)\s*.*$/i,'').replace(/^[^\p{L}\p{N}]+/u,'').trim();
      active = {date, amount, raw:line, row:number, description:[description]};
    } else if (active && line && !/^(?:Cicil|Belum Tertagih|Transaksi|e-Billing)$/i.test(line)) {
      active.description.push(line);
    }
  }
  flush(); return {handled, rows, excluded};
}

// Re-read only the tiny raised cents at higher resolution. Digit whitelisting
// alone is insufficient: require two digits and confidence, or leave the row
// excluded. Geometry ensures the crop cannot include the last rupiah digit.
export async function readCardCents(data, canvas, worker, shouldCancel = () => false) {
  const lines = data.lines || [];
  if (!lines.length) return data.text || '';
  const output = [];
  let inHistory = false;
  try {
    await worker.setParameters({tessedit_pageseg_mode:'7', tessedit_char_whitelist:'0123456789'});
    for (const line of lines) {
      if (shouldCancel()) throw new Error('Proses scan dibatalkan.');
      let text = line.text.trim();
      if (/^Transaksi\b/i.test(text)) inHistory = true;
      if (inHistory && /\bRp\s*\d/i.test(text)) {
        const word = [...(line.words || [])].reverse().find(w => /^\d+(?:\.\d{3})*[^\d.]/.test(w.text));
        const prefix = word?.text.match(/^\d+(?:\.\d{3})*/)?.[0];
        const symbols = word?.symbols || [];
        const suffix = prefix && symbols.slice(prefix.length);
        const base = prefix && symbols[prefix.length-1]?.bbox;
        const raised = suffix && suffix.find(s => s.bbox.y0 < base.y0-3 && s.bbox.y1 < base.y1-3);
        if (raised) text = text.replace(word.text,`${prefix}[sen belum terbaca]`);
        if (raised && raised.bbox.x0 >= base.x1-3) {
          const box = raised.bbox;
          const width = word.bbox.x1-box.x0+8, height = box.y1-box.y0+8;
          if (width > 0 && width < (base.y1-base.y0)*2 && height > 0) {
            const crop = document.createElement('canvas');
            crop.width = width*5+40; crop.height = height*5+40;
            const ctx = crop.getContext('2d'); ctx.fillStyle='white';ctx.fillRect(0,0,crop.width,crop.height);
            ctx.drawImage(canvas,box.x0-4,box.y0-4,width,height,20,20,crop.width-40,crop.height-40);
            const result = await worker.recognize(crop);
            const cents = result.data.text.trim();
            if (/^\d{2}$/.test(cents) && result.data.confidence >= 75) text = text.replace(`${prefix}[sen belum terbaca]`,`${prefix},${cents}`);
          }
        }
      }
      output.push(text);
    }
  } finally {
    await worker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:'',preserve_interword_spaces:'1',user_defined_dpi:'300'});
  }
  return output.join('\n');
}
