import {
  cleanText,
  formatDateLocal,
  slugText
} from "./utils.js";
import {visionCandidates,imageDataUrl} from './scan-vision.js';
import {scanExclusionReason} from './transaction-quality.js';
import {explicitBankReference} from './import-reconciliation.js';
import {screenshotHistory} from './screenshot-history.js';
import {isMandiriCardHistory,cardHistory,readCardCents} from './card-history.js';

const MONTHS = {
  jan: "01", januari: "01", january: "01",
  feb: "02", februari: "02", february: "02",
  mar: "03", maret: "03", march: "03",
  apr: "04", april: "04",
  mei: "05", may: "05",
  jun: "06", juni: "06", june: "06",
  jul: "07", juli: "07", july: "07",
  agu: "08", agustus: "08", aug: "08", august: "08",
  sep: "09", september: "09",
  okt: "10", oktober: "10", oct: "10", october: "10",
  nov: "11", november: "11",
  des: "12", desember: "12", dec: "12", december: "12"
};

const BANK_LABELS = {
  mandiri: "Mandiri",
  bca: "BCA",
  krom: "Krom",
  blu: "blu",
  generic: "Format Umum"
};

function normalizeLine(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[|_~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOcrCharacters(value) {
  return String(value || "")
    .replace(/[Oo](?=\d)/g, "0")
    .replace(/(\d)[Oo]/g, "$10")
    .replace(/[Il](?=\d)/g, "1");
}

export function parseIdrValue(value) {
  const normalized = normalizeOcrCharacters(value)
    .replace(/IDR|Rp/gi, "")
    .replace(/\s+/g, "");

  const match = normalized.match(
    /([+-])?((?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{2})?)/
  );

  if (!match) {
    return null;
  }

  const sign = match[1] || "";
  const raw = match[2];
  const lastDot = raw.lastIndexOf(".");
  const lastComma = raw.lastIndexOf(",");
  let decimalSeparator = "";

  if (lastDot >= 0 && lastComma >= 0) {
    decimalSeparator = lastDot > lastComma ? "." : ",";
  } else if (lastDot >= 0 && raw.length - lastDot - 1 === 2) {
    decimalSeparator = ".";
  } else if (lastComma >= 0 && raw.length - lastComma - 1 === 2) {
    decimalSeparator = ",";
  }

  let numeric;

  if (decimalSeparator) {
    const thousandsSeparator = decimalSeparator === "." ? "," : ".";
    numeric = Number(
      raw
        .split(thousandsSeparator)
        .join("")
        .replace(decimalSeparator, ".")
    );
  } else {
    numeric = Number(
      raw.replace(/[.,]/g, "")
    );
  }

  if (!Number.isFinite(numeric)) {
    return null;
  }

  const signedAmount = sign === "-" ? -numeric : numeric;

  return {
    amount: Math.abs(numeric),
    signedAmount,
    sign,
    raw: match[0]
  };
}

function parseDateFromText(value, fallbackYear = null) {
  const text = normalizeLine(value);
  const iso = text.match(/\b20\d{2}-\d{2}-\d{2}\b/);
  if (iso) return iso[0];

  // Prioritaskan nama bulan agar waktu seperti 09.20 tidak salah dibaca sebagai tanggal.
  let match = text.toLowerCase().match(
    /(\d{1,2})\s+([a-z]+)\s+(20\d{2})/
  );

  if (match && MONTHS[match[2]]) {
    return `${match[3]}-${MONTHS[match[2]]}-${match[1].padStart(2, "0")}`;
  }

  match = text.match(
    /(\d{1,2})[\/-](\d{1,2})(?:[\/-](20\d{2}))?/
  );

  if (match) {
    const year = Number(match[3] || fallbackYear);

    if (!year) {
      return "";
    }

    return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }

  return "";
}
function parseTimeFromText(value) {
  let match = normalizeLine(value).match(
    /([01]?\d|2[0-3])[:.]([0-5]\d)(?::([0-5]\d))?(?:\s*WIB)?/i
  );

  if (!match) {
    return "";
  }

  return `${match[1].padStart(2, "0")}:${match[2]}:${(match[3] || "00").padStart(2, "0")}`;
}

function monthEndDate(year, month) {
  const date = new Date(Number(year), Number(month), 0);
  return `${year}-${String(month).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function textContentToTokens(textContent) {
  return (textContent.items || [])
    .filter((item) => normalizeLine(item.str))
    .map((item) => ({
      text: normalizeLine(item.str),
      rawText: String(item.str).replace(/\s+/g, " ").trim(),
      x: Number(item.transform?.[4] || 0),
      y: Number(item.transform?.[5] || 0),
      width: Number(item.width || 0),
      height: Number(item.height || 0)
    }));
}

function tokensToLines(tokens, tolerance = 2.8) {
  const sorted = [...tokens].sort((a, b) => {
    if (Math.abs(b.y - a.y) > tolerance) {
      return b.y - a.y;
    }

    return a.x - b.x;
  });

  const lines = [];

  sorted.forEach((token) => {
    let line = lines.find((candidate) =>
      Math.abs(candidate.y - token.y) <= tolerance
    );

    if (!line) {
      line = {
        y: token.y,
        tokens: []
      };
      lines.push(line);
    }

    line.tokens.push(token);
  });

  return lines
    .map((line) => ({
      ...line,
      tokens: line.tokens.sort((a, b) => a.x - b.x),
      x0: Math.min(...line.tokens.map((token) => token.x)),
      x1: Math.max(...line.tokens.map((token) => token.x + token.width)),
      text: normalizeLine(
        line.tokens.map((token) => token.text).join(" ")
      )
    }))
    .sort((a, b) => b.y - a.y);
}

function tokensReadingText(tokens) {
  return tokensToLines(tokens)
    .map((line) => line.text)
    .filter(Boolean)
    .join(" ")
    .trim();
}

function firstMoneyAfterLabel(pageText, pattern) {
  const match = String(pageText || "").match(
    new RegExp(
      `${pattern}[\\s\\S]{0,100}?([+\\-]?\\s*(?:Rp)?\\s*(?:\\d{1,3}(?:[.,]\\d{3})+|\\d+)(?:[.,]\\d{2})?)`,
      "i"
    )
  );

  return match ? parseIdrValue(match[1])?.signedAmount ?? null : null;
}

function findMoneyNearLine(lines, tokens, labelPattern, pageWidth) {
  const label = lines.find((line) =>
    labelPattern.test(line.text)
  );

  if (!label) {
    return null;
  }

  const candidates = tokens
    .filter((token) =>
      Math.abs(token.y - label.y) <= 16 &&
      token.x > label.x0 &&
      token.x < pageWidth * 0.98 &&
      parseIdrValue(token.text)
    )
    .sort((a, b) => a.x - b.x);

  if (!candidates.length) {
    return null;
  }

  return parseIdrValue(candidates[candidates.length - 1].text)?.signedAmount ?? null;
}

export function detectBankFromText(pageText, fileName = "") {
  const text = `${pageText} ${fileName}`.toLowerCase();

  const scores = {
    mandiri: 0,
    bca: 0,
    krom: 0,
    blu: 0
  };
  if(/mybca/i.test(fileName))scores.bca+=15;
  if(/livin|mandiri/i.test(fileName))scores.mandiri+=15;
  if(/(?:^|[_\s-])blu(?:[.\s_-]|$)/i.test(fileName))scores.blu+=15;
  if(/krom/i.test(fileName))scores.krom+=15;
  if(isMandiriCardHistory(pageText))scores.mandiri+=20;
  // Shared screenshots lose their bank-specific filename. Livin's history
  // header and transaction controls identify the issuer, not the counterparty.
  if (/(?:^|\n)\s*Transaksi\s+e[- ]?Statement\s*(?:\n|$)/i.test(pageText)
      && /\b(?:QR\s*Bayar|Bayar\s*\/\s*Top[ -]*up|Transfer\s+Rupiah)\b/i.test(pageText)
      && /[+\u2212\u2013-]\s*IDR\s*\d/i.test(pageText)
      && /\b\d{1,2}\s+[a-z]+\s+20\d{2}\b/i.test(pageText)) scores.mandiri+=12;
  if (/\bAccount Information\b/i.test(pageText)
      && /\bAccount Transactions\s+Card\s+Pocket\b/i.test(pageText)
      && /\b(?:TRANSAKSI DEBIT|BI-FAST CR|TRSF E-BANKING (?:CR|DB))\b/i.test(pageText)
      && /\bIDR\s*\d/i.test(pageText)) scores.bca+=12;
  // blu puts each full date/time BELOW its amount. A merchant named Mandiri
  // must not switch this screenshot to a parser with dates above the amount.
  const historyBody=String(pageText||'').split(/\bRiwayat Transaksi\b/i)[1]||'';
  const firstHistoryAmount=historyBody.search(/Rp\s*\d/i);
  const firstHistoryDate=historyBody.search(/\b\d{1,2}\s+[a-z]+\s+20\d{2}\b/i);
  if (/\bRiwayat Transaksi\b/i.test(pageText)
      && firstHistoryAmount>=0 && firstHistoryDate>firstHistoryAmount
      && /\b(?:Pembayaran [QO]RIS|Dana Masuk|Uang Masuk|Transfer ke)\b/i.test(pageText)
      && /Rp\s*[\d.,]+[^\n]*\n(?:[^\n]*\n){0,3}\s*\d{1,2}\s+[a-z]+\s+20\d{2}\s+\d{2}:\d{2}(?::\d{2})?\s*WIB\b/i.test(pageText)) scores.blu+=12;
  // Issuer marks outweigh bank names mentioned in transaction descriptions.
  if (/bankmandiri\.co\.id|mandiri call/.test(text)) scores.mandiri += 12;
  if (/blubybcadigital\.id|\bbluaccount\b/.test(text)) scores.blu += 12;
  if(/\bblu\b|bca digital/.test(text))scores.blu+=5;
  if(/\bbca\b/.test(text)&&!scores.blu)scores.bca+=1;
  if(/\bmandiri\b/.test(text))scores.mandiri+=1;
  if(/\bkrom\b/.test(text))scores.krom+=1;

  if (/menara mandiri|bank mandiri|mandiri e-?statement/.test(text)) {
    scores.mandiri += 4;
  }
  if (/nominal \(idr\)|saldo \(idr\)|incoming transactions/.test(text)) {
    scores.mandiri += 2;
  }

  if (/rekening tahapan|tahapan xpresi|kcu darmo/.test(text)) {
    scores.bca += 4;
  }
  if (/tangg?al keterangan cbg mutasi saldo|mutasi cr|mutasi db/.test(text)) {
    scores.bca += 3;
  }

  if (/krom\.id|pt krom bank|krom bank indonesia/.test(text)) {
    scores.krom += 4;
  }
  if (/rincian transaksi|transaction history|ringkasan kantong|pocket summary/.test(text)) {
    scores.krom += 2;
  }

  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [bank, score] = entries[0];

  return {
    bank: score > 0 ? bank : "generic",
    label: BANK_LABELS[score > 0 ? bank : "generic"],
    confidence: score > 0
      ? Math.min(0.99, 0.55 + score * 0.07)
      : 0.35,
    scores
  };
}

function merchantFromDescription(description) {
  const clean = normalizeLine(description)
    .replace(/\b\d{8,}\b/g, " ")
    .replace(/\b(?:QRIS|BIF|FTSCY|FTFVA|ACSCY)[A-Z0-9/]*\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const qrMerchant = clean.match(
    /(?:Pembayaran\s+QRIS?|QRIS?\s+Payment|QR\s+Bayar)[\s\S]*?\bke\s+(.+)/i
  );

  if (qrMerchant) {
    return cleanText(
      qrMerchant[1]
        .replace(/\b\d{6,}\b/g, " ")
        .replace(/[-–—]\s*CP.*$/i, "")
    );
  }

  const transferFrom = clean.match(
    /Transfer\s+dari\s+(?:BANK\s+)?[A-Z]+\s+(.+)/i
  );

  if (transferFrom) {
    return cleanText(
      transferFrom[1]
        .replace(/\b\d{6,}\b/g, " ")
        .replace(/\bmaksi\s+lies\s+tks\b/i, "")
    );
  }

  if (/biaya\s+administrasi|biaya\s+adm/i.test(clean)) {
    return "Biaya Administrasi Bank";
  }

  if (/cashback\s+bonus/i.test(clean)) {
    return "Cashback Bonus";
  }

  if (/^bunga\b/i.test(clean)) {
    return "Bunga Bank";
  }

  if (/^pajak\b/i.test(clean)) {
    return "Pajak Bunga";
  }

  const bcaMerchant = clean
    .replace(/^(TRSF E-BANKING|BI-FAST|DB INTERCHANGE|TRANSAKSI DEBIT|BIAYA ADM)\s+(CR|DB)?/i, "")
    .replace(/\bTGL:\s*\d{2}\/\d{2}\b/i, "")
    .replace(/\b\d+(?:\.\d+)?\/(?:DANA|GOPAY|SHOPEEPAY)\b/i, "")
    .replace(/\bQRC?\d+\b/i, "")
    .replace(/\b\d{4,}\/[A-Z]\b/i, "")
    .replace(/\b\d{5,}\b/g, " ")
    .replace(/00000\.00/gi, "")
    .trim();

  return cleanText(bcaMerchant || clean.slice(0, 100));
}

function inferCategory(description, merchant, merchantRules = {}) {
  const learned =
    merchantRules[slugText(merchant)] ||
    merchantRules[slugText(description)];

  if (learned) {
    return learned;
  }

  const lower = `${description} ${merchant}`.toLowerCase();

  if (/(biaya administrasi|biaya adm|admin bank|materai|provisi)/.test(lower)) {
    return "Biaya Bank";
  }

  if (/(cashback)/.test(lower)) {
    return "Cashback";
  }

  if (/(\bbunga\b|interest)/.test(lower)) {
    return "Bunga";
  }

  if (/(\bpajak\b|\btax\b)/.test(lower)) {
    return "Pajak";
  }

  if (
    /(ayam|sambel|sambal|nasi|mie|bakso|sate|bubur|batagor|cilok|cendol|kopi|coffee|restaurant|resto|kedai|cafe|warteg|familymart|indomaret|alfamart|food|dapoer|masakan|soto)/.test(lower)
  ) {
    return "Makan";
  }

  if (
    /(grab|gojek|gocar|goride|taxi|taksi|parkir|parking|tol|bensin|spbu|pertamina|shell|mrt|krl|shuttle|tiketux)/.test(lower)
  ) {
    return "Transportasi";
  }

  if (
    /(pln|listrik|pdam|internet|wifi|indihome|pulsa|paket data|bpjs|tagihan)/.test(lower)
  ) {
    return "Tagihan";
  }

  if (
    /(tokopedia|shopee|lazada|blibli|official store|mall|store|alfamart|indomaret|belanja)/.test(lower)
  ) {
    return "Belanja";
  }

  if (
    /(apotek|pharmacy|klinik|rumah sakit|hospital|dokter|obat)/.test(lower)
  ) {
    return "Kesehatan";
  }

  if (
    /(netflix|spotify|youtube|bioskop|cinema|game|steam|hiburan)/.test(lower)
  ) {
    return "Hiburan";
  }

  if (
    /(salon|barbershop|laundry)/.test(lower)
  ) {
    return "Perawatan";
  }

  if (
    /(dana|gopay|shopeepay|ovo|linkaja)/.test(lower)
  ) {
    return "Top Up E-Wallet";
  }

  if (
    /(transfer dari|transfer masuk|dana masuk|incoming|setoran|pencairan)/.test(lower)
  ) {
    return "Transfer Masuk";
  }

  if (
    /(transfer keluar|outgoing transfer)/.test(lower)
  ) {
    return "Transfer Keluar";
  }

  return "Lainnya";
}

function createBaseCandidate({
  bank,
  type,
  date,
  time = "",
  amount,
  signedAmount,
  sourceAccountId,
  destinationAccountId = "",
  category,
  merchant,
  description,
  balanceAfter = null,
  pageNumber,
  rowNumber,
  method,
  confidence,
  statementAccountName = "",
  statementAccountNumber = "",
  reference = "",
  selected = true,
  internalMovement = false,
  possibleOwnTransfer = false
}) {
  return {
    selected,
    bank,
    bankLabel: BANK_LABELS[bank] || bank,
    type,
    date,
    time,
    amount,
    signedAmount,
    sourceAccountId,
    destinationAccountId,
    category,
    merchant,
    description,
    balanceAfter,
    sourcePage: pageNumber,
    sourceRow: rowNumber,
    extractionMethod: method,
    confidence,
    validationStatus: "pending",
    validationDifference: null,
    statementAccountName,
    statementAccountNumber,
    movementReference: reference,
    internalMovement,
    possibleOwnTransfer,
    origin: "statement-reader"
  };
}

function layoutMoney(text) {
  const value=String(text || '').trim();
  return /^[+\-]?\s*(?:Rp\s*)?(?:\d{1,3}(?:[.,]\d{3})+|\d+)[.,]\d{2}(?:\s*[DC])?$/i.test(value)
    ? parseIdrValue(value) : null;
}

function layoutSummaryValue(tokens, pattern, pageWidth) {
  const labels=tokens.filter(token=>pattern.test(token.text));
  for(const label of labels){
    const sameLine=tokens.filter(token=>token.x>pageWidth*.82 && token.x>label.x && Math.abs(token.y-label.y)<3 && layoutMoney(token.text));
    if(sameLine.length)return layoutMoney(sameLine.at(-1).text).signedAmount;
    const below=tokens.filter(token=>token.x>=label.x-2 && token.x<label.x+pageWidth*.20 && token.y<label.y-4 && token.y>label.y-23 && layoutMoney(token.text));
    if(below.length)return layoutMoney(below[0].text).signedAmount;
  }
  return null;
}

function parseBluMetadata({tokens,pageWidth,existing}) {
  const metadata={...existing};
  const text=tokensReadingText(tokens);
  const periodLabel=tokens.find(token=>/^Periode\s*\//i.test(token.text));
  if(periodLabel){
    const period=tokensReadingText(tokens.filter(token=>token.x>=periodLabel.x-2 && token.x<pageWidth*.54 && token.y<periodLabel.y-4 && token.y>periodLabel.y-23));
    const range=period.match(/(\d{1,2})\s*-\s*(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})/);
    const month=period.match(/([A-Za-z]+)\s+(20\d{2})/);
    if(range && MONTHS[range[3].toLowerCase()]){
      const m=MONTHS[range[3].toLowerCase()];
      metadata.periodStart=`${range[4]}-${m}-${range[1].padStart(2,'0')}`;
      metadata.periodEnd=`${range[4]}-${m}-${range[2].padStart(2,'0')}`;
    }else if(month && MONTHS[month[1].toLowerCase()]){
      const m=MONTHS[month[1].toLowerCase()];metadata.periodStart=`${month[2]}-${m}-01`;metadata.periodEnd=monthEndDate(month[2],m);
    }
  }
  const ownerLabel=tokens.find(token=>/^Nama\s*\//i.test(token.text));
  if(ownerLabel)metadata.ownerName=tokensReadingText(tokens.filter(token=>token.x<pageWidth*.32 && token.y<ownerLabel.y-4 && token.y>ownerLabel.y-23));
  const account=text.match(/bluAccount\s*-\s*((?:\d{4}\s*){3})/i);
  if(account)metadata.accountMasked=account[1].replace(/\s/g,'');
  for(const [key,pattern] of [['openingBalance',/^Saldo Awal/i],['incomingTotal',/^Total Pemasukan/i],['outgoingTotal',/^Total Pengeluaran/i],['closingBalance',/^Saldo Akhir/i]]){
    const value=layoutSummaryValue(tokens,pattern,pageWidth);
    if(value!==null)metadata[key]=key==='outgoingTotal'?Math.abs(value):value;
  }
  return metadata;
}

function parseBluPage({tokens,pageWidth,pageHeight,pageNumber,accountId,accountMap,merchantRules,metadata}) {
  const starts=tokens.filter(token=>token.x/pageWidth<.20 && /^\d{1,2}\s+[A-Za-z]+\s+20\d{2}$/.test(token.text)).sort((a,b)=>b.y-a.y);
  const summaryY=tokens.filter(token=>token.x<pageWidth*.4 && /^(Saldo Awal|Total Pemasukan|Total Pengeluaran|Saldo Akhir|Disclaimer)/i.test(token.text)).map(token=>token.y);
  const rows=[];
  starts.forEach((start,index)=>{
    const bottom=starts[index+1]?.y ?? Math.max(pageHeight*.08,...summaryY.filter(y=>y<start.y));
    const band=tokens.filter(token=>token.y<=start.y+3 && token.y>bottom+3);
    const detailTokens=band.filter(token=>token.x/pageWidth>=.20 && token.x/pageWidth<.60);
    const detailLines=tokensToLines(detailTokens).map(line=>line.tokens.map(token=>token.rawText ?? token.text).join(' ').trim());
    const description=detailLines.join(' ');
    const amount=layoutMoney(tokensReadingText(band.filter(token=>token.x/pageWidth>=.60 && token.x/pageWidth<.82)));
    const balance=layoutMoney(tokensReadingText(band.filter(token=>token.x/pageWidth>=.82)));
    if(!amount || !balance || !description)return;
    const reference=description.match(/\|\s*([A-Za-z0-9_/-]{6,})\s*$/)?.[1] || '';
    const title=detailLines[0] || '';
    const merchant=/Pembayaran QRIS/i.test(title) ? (detailLines.slice(1).join(' ').split('|')[0].trim() || title) : title.replace(/^(?:Dana Masuk dari|Transfer ke)\s+/i,'');
    const incoming=amount.signedAmount>=0;
    const owner=normalizeComparableName(metadata.ownerName);
    const own=owner.length>=6 && /^(?:Dana Masuk dari|Transfer ke)\s+/i.test(title) && normalizeComparableName(description).includes(owner);
    const other=own?inferKnownBankAccount(description,accountMap,'blu'):'';
    const candidate=createBaseCandidate({bank:'blu',type:own?'transfer':incoming?'income':'expense',date:parseDateFromText(start.text),time:parseTimeFromText(tokensReadingText(band.filter(token=>token.x/pageWidth<.20 && token!==start))),amount:amount.amount,signedAmount:amount.signedAmount,sourceAccountId:own&&incoming?other:accountId,destinationAccountId:own?(incoming?accountId:other):'',category:own?'Transfer Internal':/^Bunga$/i.test(title)?'Bunga':/^Pajak/i.test(title)?'Pajak Bunga':inferCategory(description,merchant,merchantRules),merchant,description,balanceAfter:balance.signedAmount,pageNumber,rowNumber:index+1,method:'blu-native-layout',confidence:.99,statementAccountName:'bluAccount',statementAccountNumber:metadata.accountMasked,reference,selected:!own,internalMovement:own,possibleOwnTransfer:own});
    candidate.transferNeedsMapping=own&&!other;rows.push(candidate);
  });
  return rows;
}

function parseMandiriConsolidatedMetadata({tokens,pageText,pageWidth,existing}) {
  const metadata={...existing,format:'mandiri-consolidated'};
  const period=pageText.match(/(\d{1,2}\/\d{2}\/\d{2,4})\s*s\/d\s*(\d{1,2}\/\d{2}\/\d{2,4})/i);
  const fullDate=value=>{const [d,m,y]=value.split('/');return `${y.length===2?'20'+y:y}-${m}-${d.padStart(2,'0')}`;};
  if(period){metadata.periodStart=fullDate(period[1]);metadata.periodEnd=fullDate(period[2]);}
  const account=tokens.find(token=>/^\d{3}-\d{2}-\d{7}-\d$/.test(token.text));
  if(account)metadata.accountMasked=account.text;
  for(const [key,pattern] of [['openingBalance',/^Saldo Awal\s*\//i],['incomingTotal',/^Mutasi Kredit\s*\//i],['outgoingTotal',/^Mutasi Debit\s*\//i],['closingBalance',/^Saldo Akhir\s*\//i]]){
    const value=layoutSummaryValue(tokens,pattern,pageWidth);
    if(value!==null)metadata[key]=value;
  }
  return metadata;
}

function parseMandiriConsolidatedPage({tokens,pageWidth,pageHeight,pageNumber,accountId,merchantRules,metadata,parserState}) {
  const header=tokens.find(token=>/^Rincian Transaksi\s*\//i.test(token.text));
  if(!header || !metadata.periodStart)return [];
  const bottom=Math.max(pageHeight*.055,...tokens.filter(token=>/^Saldo Awal\s*\//i.test(token.text)).map(token=>token.y));
  const starts=tokens.filter(token=>token.x/pageWidth<.12 && /^\d{2}\/\d{2}$/.test(token.text) && token.y<header.y-35 && token.y>bottom).sort((a,b)=>b.y-a.y);
  const details=band=>tokensReadingText(band.filter(token=>token.x/pageWidth>=.20 && token.x/pageWidth<.65));
  const continuation=details(tokens.filter(token=>token.y<header.y-35 && token.y>(starts[0]?.y ?? bottom)+3));
  if(continuation && parserState.mandiriLast){
    const previous=parserState.mandiriLast;
    previous.description+=' '+continuation;previous.merchant=merchantFromDescription(previous.description);previous.category=inferCategory(previous.description,previous.merchant,merchantRules);
  }
  const rows=[];
  starts.forEach((start,index)=>{
    const band=tokens.filter(token=>token.y<=start.y+3 && token.y>(starts[index+1]?.y ?? bottom)+3);
    const description=details(band);
    if(/^Saldo Awal\b/i.test(description))return;
    const amountText=tokensReadingText(band.filter(token=>token.x/pageWidth>=.65 && token.x/pageWidth<.82));
    const amount=layoutMoney(amountText),balance=layoutMoney(tokensReadingText(band.filter(token=>token.x/pageWidth>=.82)));
    if(!description || !amount || !balance)return;
    const debit=/\bD\s*$/i.test(amountText),merchant=merchantFromDescription(description);
    const candidate=createBaseCandidate({bank:'mandiri',type:debit?'expense':'income',date:parseDateFromText(start.text,Number(metadata.periodStart.slice(0,4))),amount:amount.amount,signedAmount:debit?-amount.amount:amount.amount,sourceAccountId:accountId,category:inferCategory(description,merchant,merchantRules),merchant,description,balanceAfter:balance.signedAmount,pageNumber,rowNumber:index+1,method:'mandiri-consolidated-native',confidence:.99,statementAccountName:'Mandiri Tabungan',statementAccountNumber:metadata.accountMasked,reference:explicitBankReference(description)});
    rows.push(candidate);parserState.mandiriLast=candidate;
  });
  return rows;
}

function parseMandiriMetadata(pageText, lines, tokens, pageWidth) {
  const metadata = {};

  const period = String(pageText || "").match(
    /(\d{1,2}\s+[A-Za-z]+\s+20\d{2})\s*-\s*(\d{1,2}\s+[A-Za-z]+\s+20\d{2})/i
  );

  if (period) {
    metadata.periodStart = parseDateFromText(period[1]);
    metadata.periodEnd = parseDateFromText(period[2]);
  }

  const account = String(pageText || "").match(
    /(?:Nomor Rekening|Account Number)[\s\S]{0,260}?(\d{10,})/i
  );

  if (account) {
    metadata.accountMasked = account[1];
  }

  const opening = findMoneyNearLine(
    lines,
    tokens,
    /Saldo Awal|Initial Balance/i,
    pageWidth
  );

  const incoming = findMoneyNearLine(
    lines,
    tokens,
    /Dana Masuk|Incoming Transactions/i,
    pageWidth
  );

  const outgoing = findMoneyNearLine(
    lines,
    tokens,
    /Dana Keluar|Outgoing Transactions/i,
    pageWidth
  );

  const closing = findMoneyNearLine(
    lines,
    tokens,
    /Saldo Akhir|Closing Balance/i,
    pageWidth
  );

  if (opening !== null) {
    metadata.openingBalance = Math.abs(opening);
  }

  if (incoming !== null) {
    metadata.incomingTotal = Math.abs(incoming);
  }

  if (outgoing !== null) {
    metadata.outgoingTotal = Math.abs(outgoing);
  }

  if (closing !== null) {
    metadata.closingBalance = Math.abs(closing);
  }

  return metadata;
}
function parseMandiriPage({
  tokens,
  pageWidth,
  pageHeight,
  pageNumber,
  accountId,
  merchantRules
}) {
  const lines = tokensToLines(tokens);
  const header = lines.find((line) =>
    /Tanggal|Date/i.test(line.text) &&
    /Keterangan|Remarks/i.test(line.text) &&
    /Nominal|Amount/i.test(line.text)
  );

  if (!header) {
    return [];
  }

  const rowStarts = tokens
    .filter((token) => {
      const ratio = token.x / pageWidth;

      return (
        /^\d{1,4}$/.test(token.text) &&
        ratio < 0.075 &&
        token.y < header.y - 5 &&
        token.y > pageHeight * 0.055
      );
    })
    .sort((a, b) => b.y - a.y)
    .filter((token, index, items) =>
      index === 0 ||
      Math.abs(items[index - 1].y - token.y) > 3
    );

  const candidates = [];

  rowStarts.forEach((start, index) => {
    const nextY =
      rowStarts[index + 1]?.y ??
      Math.max(pageHeight * 0.07, start.y - 48);

    const lowerBound = Math.max(
      nextY + 12,
      start.y - 48,
      pageHeight * 0.06
    );

    const rowTokens = tokens.filter((token) =>
      token.y <= start.y + 14 &&
      token.y > lowerBound
    );

    const dateText = tokensReadingText(
      rowTokens.filter((token) => {
        const ratio = token.x / pageWidth;
        return ratio >= 0.075 && ratio < 0.205;
      })
    );

    const description = tokensReadingText(
      rowTokens.filter((token) => {
        const ratio = token.x / pageWidth;
        return ratio >= 0.205 && ratio < 0.59;
      })
    );

    const amountText = tokensReadingText(
      rowTokens.filter((token) => {
        const ratio = token.x / pageWidth;
        return ratio >= 0.59 && ratio < 0.82;
      })
    );

    const balanceText = tokensReadingText(
      rowTokens.filter((token) =>
        token.x / pageWidth >= 0.82
      )
    );

    const date = parseDateFromText(dateText);
    const time = parseTimeFromText(dateText);
    const amountInfo = parseIdrValue(amountText);
    const balanceInfo = parseIdrValue(balanceText);

    if (!date || !amountInfo || !description) {
      return;
    }

    const type = amountInfo.signedAmount >= 0 ? "income" : "expense";
    const merchant = merchantFromDescription(description);

    candidates.push(
      createBaseCandidate({
        bank: "mandiri",
        type,
        date,
        time,
        amount: amountInfo.amount,
        signedAmount: amountInfo.signedAmount,
        sourceAccountId: accountId,
        category:
          type === "income"
            ? inferCategory(description, merchant, merchantRules)
            : inferCategory(description, merchant, merchantRules),
        merchant,
        description,
        balanceAfter: balanceInfo?.amount ?? null,
        pageNumber,
        rowNumber: Number(start.text),
        method: "mandiri-native-layout",
        confidence: Math.min(
          0.99,
          0.86 +
          (time ? 0.03 : 0) +
          (balanceInfo ? 0.05 : 0) +
          (description.length > 8 ? 0.03 : 0)
        )
      })
    );
  });

  return candidates;
}

function isEmptyBcaPocket(pageText) {
  return /FASILITAS\s*:\s*POKET RUPIAH/i.test(pageText) &&
    /TRANSAKSI TIDAK TERSEDIA/i.test(pageText);
}

function parseBcaMetadata(pageText, existing = {}) {
  const metadata = { ...existing };
  const text = String(pageText || "");

  // A pocket appendix has its own totals, separate from the main account.
  if (isEmptyBcaPocket(text)) return metadata;

  const period = text.match(
    /PERIODE\s*:?\s*([A-Z]+)\s+(20\d{2})/i
  );

  if (period) {
    const month =
      MONTHS[period[1].toLowerCase()] ||
      MONTHS[period[1].slice(0, 3).toLowerCase()];

    if (month) {
      metadata.periodStart = `${period[2]}-${month}-01`;
      metadata.periodEnd = monthEndDate(period[2], month);
      metadata.periodYear = Number(period[2]);
    }
  }

  const account = text.match(
    /NO\.\s*REKENING\s*:?\s*(\d{8,})/i
  );

  if (account) {
    metadata.accountMasked = account[1];
  }

  const lines = text
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  if (!metadata.ownerName) {
    const accountTypeIndex = lines.findIndex((line) =>
      /REKENING\s+TAHAPAN/i.test(line)
    );

    if (accountTypeIndex >= 0) {
      const owner = lines
        .slice(accountTypeIndex + 1, accountTypeIndex + 6)
        .find((line) =>
          /^[A-Z][A-Z .'-]{5,}$/.test(line) &&
          !/^(KCU|KCP|CABANG|BRANCH)\b/i.test(line) &&
          !/\b(JALAN|JL\.|BLOK|NO\.|RT\d|RW\d|KOTA|INDONESIA)\b/i.test(line)
        );

      if (owner) {
        metadata.ownerName = cleanText(owner);
      }
    }
  }

  const summaryPatterns = {
    openingBalance: /SALDO AWAL\s*:\s*([\d,]+\.\d{2})/i,
    incomingTotal: /MUTASI CR\s*:\s*([\d,]+\.\d{2})/i,
    outgoingTotal: /MUTASI DB\s*:\s*([\d,]+\.\d{2})/i,
    closingBalance: /SALDO AKHIR\s*:\s*([\d,]+\.\d{2})/i
  };

  Object.entries(summaryPatterns).forEach(([key, pattern]) => {
    const match = text.match(pattern);

    if (match) {
      metadata[key] = Math.abs(
        parseIdrValue(match[1])?.signedAmount ?? 0
      );
    }
  });

  return metadata;
}

function inferKnownBankAccount(
  description,
  accountMap,
  statementBank
) {
  const text = String(description || "").toLowerCase();

  const matches = [
    {
      bank: "mandiri",
      matched:
        /bank\s+mandiri|\bmandiri\b|livin/i.test(text)
    },
    {
      bank: "bca",
      matched:
        /bank\s+central\s+asia|\bbca\b|blu\s+by\s+bca/i.test(text)
    },
    {
      bank: "krom",
      matched:
        /krom\s+bank|bank\s+krom|\bkrom\b/i.test(text)
    }
  ];

  const match = matches.find(
    (item) =>
      item.matched &&
      item.bank !== statementBank
  );

  return match
    ? accountMap[match.bank] || ""
    : "";
}

function isOwnAccountName(description) {
  return /arnoldus|gratio|darryl|andyka/i.test(
    String(description || "")
  );
}

function isTransferDescription(description) {
  return /TRSF|TRANSFER|BI-FAST|BIF\s+TRANSFER/i.test(
    String(description || "")
  );
}

function normalizeComparableName(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(?:dr|bapak|ibu|sdr|sdri)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSamePersonName(description, ownerName) {
  const owner = normalizeComparableName(ownerName);
  const other = normalizeComparableName(description);

  if (!owner || !other) {
    return false;
  }

  const ownerTokens = owner
    .split(" ")
    .filter((token) => token.length >= 3);

  const matched = ownerTokens.filter((token) =>
    other.includes(token)
  );

  return matched.length >= Math.min(2, ownerTokens.length);
}

function canonicalBcaMerchant(description, transactionCode) {
  const text = normalizeLine(description);
  const upper = text.toUpperCase();

  if (/BIAYA\s+ADM/i.test(text)) {
    return "Biaya Administrasi BCA";
  }

  if (/GOOGLE\s+YOUTUBEPREM/i.test(upper)) {
    return "Google YouTube Premium";
  }

  if (/\bSPOTIFY\b/i.test(upper)) {
    return "Spotify";
  }

  if (/\bALFAMART\b/i.test(upper)) {
    return "Alfamart";
  }

  if (/\bSHOPEEPAY\b/i.test(upper)) {
    return "ShopeePay";
  }

  if (/\bGOPAY\b/i.test(upper)) {
    return "GoPay";
  }

  if (/\bDANA\b/i.test(upper)) {
    return "DANA";
  }

  if (/QPON\s+DIGITAL\s+INDON/i.test(upper)) {
    return "QPON Digital Indonesia";
  }

  const afterZeroAmount = text.match(
    /00000\.00\s*([A-Za-z][A-Za-z0-9 .&'-]+)/i
  );

  if (afterZeroAmount) {
    return cleanText(
      afterZeroAmount[1]
        .replace(/\s+R$/i, "")
    );
  }

  if (/^BI_FAST_/i.test(transactionCode)) {
    const transferName = text.match(
      /\b\d{3}\s+([A-Za-z][A-Za-z .'-]{3,})$/i
    );

    if (transferName) {
      return cleanText(transferName[1]);
    }
  }

  if (/^TRSF_EBANKING_/i.test(transactionCode)) {
    const cleaned = text
      .replace(/^TRSF\s+E-BANKING\s+(?:CR|DB)\s*/i, "")
      .replace(/\b\d{4}\/[A-Z]+\/[A-Z0-9]+\b/gi, " ")
      .replace(/\b\d+(?:\.\d+)?\/(?:DANA|GOPAY|SHOPEEPAY)\b/gi, " ")
      .replace(/\b\d{8,}\b/g, " ")
      .replace(/\bCOMM\b/gi, " ")
      .replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, " ")
      .replace(/(?:^|\s)-(?=\s|$)/g, " ")
      .replace(/\b\d+(?:\.\d+)?\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (cleaned) {
      return cleanText(cleaned);
    }
  }

  return merchantFromDescription(text);
}

function detectBcaTransactionCode(titleText) {
  const upper = normalizeLine(titleText).toUpperCase();

  if (/^TRSF\s+E-BANKING\s+CR\b/.test(upper)) {
    return "TRSF_EBANKING_CR";
  }

  if (/^TRSF\s+E-BANKING\s+DB\b/.test(upper)) {
    return "TRSF_EBANKING_DB";
  }

  if (/^BI-FAST\s+CR\b/.test(upper)) {
    return "BI_FAST_CR";
  }

  if (/^BI-FAST\s+DB\b/.test(upper)) {
    return "BI_FAST_DB";
  }

  if (/^DB\s+INTERCHANGE\b/.test(upper)) {
    return "CARD_INTERCHANGE_DB";
  }

  if (/^TRANSAKSI\s+DEBIT\b/.test(upper)) {
    return "DEBIT_CARD_DB";
  }

  if (/^BIAYA\s+ADM\b/.test(upper)) {
    return "ADMIN_FEE_DB";
  }

  return "BCA_OTHER";
}

function extractBcaReference(description) {
  return explicitBankReference(description);
}

function inferBcaCategory({
  transactionCode,
  description,
  merchant,
  type,
  ownTransfer,
  merchantRules
}) {
  if (ownTransfer) {
    return "Transfer Antar Rekening";
  }

  if (transactionCode === "ADMIN_FEE_DB") {
    return "Biaya Bank";
  }

  if (/\b(?:DANA|GOPAY|SHOPEEPAY|OVO|LINKAJA)\b/i.test(description)) {
    return "Top Up E-Wallet";
  }

  if (/GOOGLE\s+YOUTUBEPREM|SPOTIFY|NETFLIX/i.test(description)) {
    return "Hiburan";
  }

  if (/ALFAMART|INDOMARET|FAMILYMART/i.test(description)) {
    return "Belanja";
  }

  if (
    type === "income" &&
    /TRSF_EBANKING_CR|BI_FAST_CR/.test(transactionCode)
  ) {
    return "Pemasukan Lainnya";
  }

  if (
    type === "expense" &&
    /TRSF_EBANKING_DB|BI_FAST_DB/.test(transactionCode)
  ) {
    return "Transfer Keluar";
  }

  return inferCategory(
    description,
    merchant,
    merchantRules
  );
}

function reconstructBcaBalances(candidates, metadata) {
  const sorted = [...candidates].sort((a, b) => {
    if ((a.sourcePage || 0) !== (b.sourcePage || 0)) {
      return (a.sourcePage || 0) - (b.sourcePage || 0);
    }

    return (a.sourceRow || 0) - (b.sourceRow || 0);
  });

  let running = Number.isFinite(metadata.openingBalance)
    ? Number(metadata.openingBalance)
    : null;

  sorted.forEach((candidate) => {
    candidate.printedBalanceAfter = Number.isFinite(candidate.balanceAfter)
      ? Number(candidate.balanceAfter)
      : null;

    if (running === null) {
      candidate.balanceSource = candidate.printedBalanceAfter !== null
        ? "printed"
        : "unavailable";

      if (candidate.printedBalanceAfter !== null) {
        running = candidate.printedBalanceAfter;
      }

      return;
    }

    const calculated =
      running + Number(candidate.signedAmount || 0);

    candidate.calculatedBalanceAfter = calculated;

    if (candidate.printedBalanceAfter !== null) {
      candidate.balanceAfter = candidate.printedBalanceAfter;
      candidate.balanceSource = "printed";
    } else {
      candidate.balanceAfter = calculated;
      candidate.balanceSource = "calculated";
    }

    running = calculated;
  });

  return sorted;
}

function parseBcaPage({
  tokens,
  pageWidth,
  pageHeight,
  pageNumber,
  accountId,
  accountMap,
  merchantRules,
  metadata
}) {
  const year =
    metadata.periodYear ||
    Number(metadata.periodStart?.slice(0, 4)) ||
    new Date().getFullYear();

  const rowStarts = tokens
    .filter((token) =>
      token.x / pageWidth < 0.13 &&
      /^\d{2}\/\d{2}$/.test(token.text) &&
      token.y < pageHeight * 0.72 &&
      token.y > pageHeight * 0.08
    )
    .sort((a, b) => b.y - a.y)
    .filter((token, index, items) =>
      index === 0 ||
      Math.abs(items[index - 1].y - token.y) > 3
    );

  const candidates = [];

  rowStarts.forEach((start, index) => {
    const nextY =
      rowStarts[index + 1]?.y ??
      Math.max(pageHeight * 0.08, start.y - 78);

    const lowerBound = Math.max(
      nextY + 2,
      start.y - 78,
      pageHeight * 0.07
    );

    const rowTokens = tokens.filter((token) =>
      token.y <= start.y + 3 &&
      token.y > lowerBound
    );

    const titleText = tokensReadingText(
      rowTokens.filter((token) => {
        const ratio = token.x / pageWidth;
        return ratio >= 0.13 && ratio < 0.32;
      })
    );

    const detailText = tokensReadingText(
      rowTokens.filter((token) => {
        const ratio = token.x / pageWidth;
        return ratio >= 0.32 && ratio < 0.64;
      })
    );

    const amountText = tokensReadingText(
      rowTokens.filter((token) => {
        const ratio = token.x / pageWidth;
        return ratio >= 0.64 && ratio < 0.84;
      })
    );

    const balanceText = tokensReadingText(
      rowTokens.filter((token) =>
        token.x / pageWidth >= 0.84
      )
    );

    if (/SALDO AWAL/i.test(titleText)) {
      return;
    }

    const amountInfo = parseIdrValue(amountText);

    if (!amountInfo) {
      return;
    }

    const transactionCode =
      detectBcaTransactionCode(titleText);

    const isCredit =
      /_CR$/.test(transactionCode) ||
      /\bCR\b/i.test(titleText);

    const isDebit =
      /_DB$/.test(transactionCode) ||
      /\bDB\b|DEBIT|BIAYA ADM/i.test(
        `${titleText} ${amountText}`
      );

    const signedAmount =
      isDebit && !isCredit
        ? -Math.abs(amountInfo.amount)
        : Math.abs(amountInfo.amount);

    const date = parseDateFromText(start.text, year);
    const description = normalizeLine(
      `${titleText} ${detailText}`
    );
    const reference = extractBcaReference(description);
    const merchant = canonicalBcaMerchant(
      description,
      transactionCode
    );
    const balanceInfo = parseIdrValue(balanceText);
    const ownTransfer =
      isTransferDescription(description) &&
      isSamePersonName(
        `${merchant} ${description}`,
        metadata.ownerName
      );

    const inferredOtherBank =
      inferKnownBankAccount(
        description,
        accountMap,
        "bca"
      );

    const clearingAccount =
      accountMap.clearing ||
      "asset-transfer-clearing";

    let transactionType =
      signedAmount >= 0 ? "income" : "expense";
    let sourceAccountId = accountId;
    let destinationAccountId = "";
    let sourceInference = "";
    let destinationInference = "";

    if (ownTransfer) {
      transactionType = "transfer";

      if (signedAmount >= 0) {
        sourceAccountId =
          inferredOtherBank || clearingAccount;
        destinationAccountId = accountId;
        destinationInference =
          "Tujuan otomatis BCA karena dana masuk tercatat pada e-Statement BCA.";
        sourceInference = inferredOtherBank
          ? "Bank sumber dibaca dari keterangan transaksi."
          : "Nama bank sumber tidak tercantum pada e-Statement. Sumber sementara memakai Transfer Belum Dipetakan.";
      } else {
        sourceAccountId = accountId;
        destinationAccountId =
          inferredOtherBank || clearingAccount;
        sourceInference =
          "Sumber otomatis BCA karena dana keluar tercatat pada e-Statement BCA.";
        destinationInference = inferredOtherBank
          ? "Bank tujuan dibaca dari keterangan transaksi."
          : "Nama bank tujuan tidak tercantum pada e-Statement. Tujuan sementara memakai Transfer Belum Dipetakan.";
      }
    }

    const category = inferBcaCategory({
      transactionCode,
      description,
      merchant,
      type: transactionType,
      ownTransfer,
      merchantRules
    });

    const candidate = createBaseCandidate({
      bank: "bca",
      type: transactionType,
      date,
      amount: Math.abs(signedAmount),
      signedAmount,
      sourceAccountId,
      destinationAccountId,
      category,
      merchant,
      description,
      balanceAfter: balanceInfo?.amount ?? null,
      pageNumber,
      rowNumber: candidates.length + 1,
      method: "bca-native-layout-v3",
      confidence: Math.min(
        0.99,
        0.88 +
        (balanceInfo ? 0.03 : 0) +
        (transactionCode !== "BCA_OTHER" ? 0.04 : 0) +
        (merchant ? 0.02 : 0)
      ),
      possibleOwnTransfer: ownTransfer
    });

    candidate.transactionCode = transactionCode;
    candidate.reference = reference;
    candidate.counterpartyRaw = merchant;
    candidate.sourceInference = sourceInference;
    candidate.destinationInference = destinationInference;
    candidate.transferNeedsMapping =
      transactionType === "transfer" &&
      (
        sourceAccountId === clearingAccount ||
        destinationAccountId === clearingAccount
      );

    candidates.push(candidate);
  });

  return candidates;
}

function parseKromMetadata(pageText, existing = {}) {
  const metadata = { ...existing };

  const period = String(pageText || "").match(
    /E-Statement\s+([A-Za-z]+)\s+(20\d{2})/i
  );

  if (period) {
    const month = MONTHS[period[1].toLowerCase()] || MONTHS[period[1].slice(0, 3).toLowerCase()];

    if (month) {
      metadata.periodStart = `${period[2]}-${month}-01`;
      metadata.periodEnd = monthEndDate(period[2], month);
    }
  }

  const owner = String(pageText || "").match(
    /Pemilik Rekening\s*\/Account Owner\s*([\s\S]{0,80}?)(?:Saldo Sebelumnya|Previous Balance)/i
  );

  if (owner) {
    metadata.ownerName = normalizeLine(owner[1]);
  }

  const account = String(pageText || "").match(
    /No\. Rek\. Utama\s*\/Main Savings Acc\. No\s*(\d{8,})/i
  );

  if (account) {
    metadata.accountMasked = account[1];
  }

  const summaryPatterns = {
    openingBalance: /Saldo Sebelumnya\s*\/Previous Balance\s*Rp([\d.]+,\d{2})/i,
    incomingTotal: /Total Pemasukan\s*\/Total Incoming\s*\+Rp([\d.]+,\d{2})/i,
    outgoingTotal: /Total Pengeluaran\s*\/Total Outgoing\s*-Rp([\d.]+,\d{2})/i,
    closingBalance: /Saldo Akhir\s*\/Ending Balance\s*Rp([\d.]+,\d{2})/i
  };

  Object.entries(summaryPatterns).forEach(([key, pattern]) => {
    const match = String(pageText || "").match(pattern);

    if (match) {
      metadata[key] = Math.abs(parseIdrValue(match[1])?.signedAmount ?? 0);
    }
  });

  return metadata;
}

function detectKromSections(lines) {
  const sections = [];

  lines.forEach((line, index) => {
    if (!/No\. Rek\.\s*\/Acc\. No\./i.test(line.text)) {
      return;
    }

    const previous = lines[index - 1];

    if (!previous) {
      return;
    }

    const accountMatch = line.text.match(/(\d{8,})/);
    const name = normalizeLine(previous.text);

    if (
      !name ||
      /^\d{1,2}[.:]\d{2}\s+WIB$/i.test(name)
    ) {
      return;
    }

    sections.push({
      y: previous.y,
      name,
      accountNumber: accountMatch?.[1] || ""
    });
  });

  return sections.sort((a, b) => b.y - a.y);
}

function parseKromPage({
  tokens,
  pageWidth,
  pageHeight,
  pageNumber,
  accountId,
  accountMap,
  merchantRules,
  metadata,
  parserState
}) {
  const lines = tokensToLines(tokens);
  const sections = detectKromSections(lines);

  const rowStarts = lines
    .filter((line) =>
      line.x0 / pageWidth < 0.16 &&
      /^\d{2}\s+[A-Za-z]+\s+20\d{2}\b/.test(line.text)
    )
    .sort((a, b) => b.y - a.y);

  const candidates = [];
  let activeSection = parserState.activeKromSection || "Tabungan Utama";
  let activeAccountNumber = parserState.activeKromAccountNumber || metadata.accountMasked || "";

  rowStarts.forEach((start, index) => {
    const sectionAbove = sections
      .filter((section) => section.y > start.y)
      .sort((a, b) => a.y - b.y)[0];

    if (sectionAbove) {
      activeSection = sectionAbove.name;
      activeAccountNumber = sectionAbove.accountNumber;
    }

    const nextDateY =
      rowStarts[index + 1]?.y ??
      Math.max(pageHeight * 0.06, start.y - 50);

    const nextSectionY = sections
      .filter((section) => section.y < start.y)
      .sort((a, b) => b.y - a.y)[0]?.y;

    const lowerBound = Math.max(
      nextDateY + 2,
      nextSectionY !== undefined ? nextSectionY + 2 : pageHeight * 0.05,
      start.y - 50
    );

    const rowTokens = tokens.filter((token) =>
      token.y <= start.y + 3 &&
      token.y > lowerBound
    );

    const dateText = tokensReadingText(
      rowTokens.filter((token) =>
        token.x / pageWidth < 0.18
      )
    );

    const description = tokensReadingText(
      rowTokens.filter((token) => {
        const ratio = token.x / pageWidth;
        return ratio >= 0.18 && ratio < 0.57;
      })
    );

    const transactionTypeText = tokensReadingText(
      rowTokens.filter((token) => {
        const ratio = token.x / pageWidth;
        return ratio >= 0.57 && ratio < 0.84;
      })
    );

    const amountText = tokensReadingText(
      rowTokens.filter((token) =>
        token.x / pageWidth >= 0.84
      )
    );

    const date = parseDateFromText(dateText);
    const time = parseTimeFromText(dateText);
    const amountInfo = parseIdrValue(amountText);

    if (!date || !amountInfo || !description) {
      return;
    }

    const merchant = merchantFromDescription(description);
    const isMovement = /Pemindahan Saldo|Balance Movement/i.test(transactionTypeText);
    // Unlabeled Krom IDs can pair the two internal pocket legs, but ordinary
    // payments may contain sender account numbers and must not dedupe on them.
    const reference = explicitBankReference(description) || (isMovement ? description.match(/\b([A-Za-z0-9]{12,})\b/)?.[1] || "" : "");
    const ownerTokens = normalizeLine(metadata.ownerName || "")
      .toLowerCase()
      .split(" ")
      .filter((token) => token.length >= 4);

    const descriptionLower = description.toLowerCase();
    const mentionsOwner =
      ownerTokens.length >= 2 &&
      ownerTokens.filter((token) => descriptionLower.includes(token)).length >= 2;

    let type = amountInfo.signedAmount >= 0 ? "income" : "expense";
    let sourceAccountId = accountId;
    let destinationAccountId = "";
    let possibleOwnTransfer = false;

    if (isMovement) {
      type = "transfer";
      sourceAccountId = accountId;
      destinationAccountId = accountId;
    } else if (/Transfer Masuk|Incoming Transfer/i.test(transactionTypeText)) {
      const sourceBank =
        /mandiri/i.test(description)
          ? accountMap.mandiri
          : /bca|blu by bca/i.test(description)
            ? accountMap.bca
            : /krom/i.test(description)
              ? accountMap.krom
              : "";

      if (mentionsOwner && sourceBank) {
        type = "transfer";
        sourceAccountId = sourceBank;
        destinationAccountId = accountId;
      } else {
        possibleOwnTransfer = mentionsOwner;
      }
    } else if (/Transfer Keluar|Outgoing Transfer/i.test(transactionTypeText)) {
      const destinationBank =
        /mandiri/i.test(description)
          ? accountMap.mandiri
          : /bca|blu by bca/i.test(description)
            ? accountMap.bca
            : /krom/i.test(description)
              ? accountMap.krom
              : "";

      // Statement ini milik Krom, sehingga rekening pengirim selalu Krom.
      sourceAccountId = accountId;

      if (mentionsOwner && destinationBank) {
        type = "transfer";
        destinationAccountId = destinationBank;
      } else {
        possibleOwnTransfer = mentionsOwner;
      }
    }

    candidates.push(
      createBaseCandidate({
        bank: "krom",
        type,
        date,
        time,
        amount: amountInfo.amount,
        signedAmount: amountInfo.signedAmount,
        sourceAccountId,
        destinationAccountId,
        category:
          isMovement
            ? "Transfer Internal Krom"
            : inferCategory(description, merchant, merchantRules),
        merchant,
        description: normalizeLine(`${description} ${transactionTypeText}`),
        pageNumber,
        rowNumber: candidates.length + 1,
        method: "krom-native-layout",
        confidence: Math.min(
          0.99,
          0.86 +
          (time ? 0.03 : 0) +
          (transactionTypeText ? 0.04 : 0) +
          (reference ? 0.03 : 0)
        ),
        statementAccountName: activeSection,
        statementAccountNumber: activeAccountNumber,
        reference,
        selected: !isMovement,
        internalMovement: isMovement,
        possibleOwnTransfer
      })
    );
  });

  if (sections.length) {
    const lastSection = sections[sections.length - 1];
    parserState.activeKromSection = lastSection.name;
    parserState.activeKromAccountNumber = lastSection.accountNumber;
  } else {
    parserState.activeKromSection = activeSection;
    parserState.activeKromAccountNumber = activeAccountNumber;
  }

  return candidates;
}

export function parseReceiptText(rawText,{bank,accountId,pageNumber=1,merchantRules={}}) {
 const text=String(rawText||'');
 const dateText=text.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0] || text.match(/\b\d{1,2}[\/-]\d{1,2}[\/-]20\d{2}\b|\b\d{1,2}\s+[a-z]+\s+20\d{2}\b/i)?.[0] || '';
 const date=/^20\d{2}-/.test(dateText)?dateText:dateText?parseDateFromText(dateText):'';
 const parsedDate=new Date(date+'T12:00:00Z');
 if(!date||Number.isNaN(parsedDate.getTime())||parsedDate.toISOString().slice(0,10)!==date||scanExclusionReason({description:text}))return [];
 if(!/\b(berhasil|sukses|successful|completed|settled)\b/i.test(text))return [];
 const lines=text.split('\n').map(normalizeLine).filter(Boolean);
 const labelled=text.match(/(?:total\s+(?:transaksi|pembayaran|transfer)|nominal|jumlah(?:\s+transfer)?)\s*[:\s]*(?:Rp|IDR)?\s*([\d.,]+)/i);
 const currencies=[...text.matchAll(/(?:Rp|IDR)\s*([\d.,]+)/gi)];
 // Multiple unlabelled amounts can be fees, balance or total: leave them for AI/review.
 const amount=parseIdrValue(labelled?.[1] || (currencies.length===1?currencies[0][1]:''));
 if(!amount||amount.amount<=0)return [];
 const incoming=/uang masuk|transfer masuk|dana diterima|penerimaan/i.test(text);
 const reference=text.match(/(?:no\.?\s*referensi|nomor referensi|reference|ref(?:erensi)?\.?|id transaksi)\s*[:#]?\s*([A-Z0-9-]{6,})/i)?.[1]||'';
 const description=lines.filter(line=>!/^saldo|rekening|nomor rekening/i.test(line)).join(' ').slice(0,1000);
 const time=text.match(/\b([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/);
 return [createBaseCandidate({bank,type:incoming?'income':'expense',date,time:time?`${time[1]}:${time[2]}:${time[3]||'00'}`:'',amount:amount.amount,signedAmount:incoming?amount.amount:-amount.amount,sourceAccountId:accountId,category:inferCategory(description,'',merchantRules),merchant:'',description,pageNumber,rowNumber:1,method:'receipt-ocr',confidence:0.6,reference,selected:false})];
}

export function parseImageText(rawText,options){
 const history=parseScreenshotHistory(rawText,options);
 if(history.handled)return history.candidates;
 if(/mutasi|rekening koran|account statement|riwayat transaksi/i.test(rawText))return parseGenericText(rawText,options);
 if(scanExclusionReason({description:rawText}))return [];
 const receipt=parseReceiptText(rawText,options);
 // A signed amount on an unpaid request is not proof of a posted transaction.
 return receipt;
}

export function parseScreenshotHistory(rawText,options){
 const card=cardHistory(rawText,{parseDate:parseDateFromText,parseMoney:parseIdrValue});
 if(card.handled)return {...card,candidates:card.rows.map(row=>({...createBaseCandidate({bank:'mandiri',type:'credit_purchase',date:row.date,amount:row.amount,signedAmount:-row.amount,sourceAccountId:options.cardAccountId||'',category:inferCategory(row.description,'',options.merchantRules||{}),merchant:'',description:row.description,pageNumber:options.pageNumber||1,rowNumber:row.row,method:'mandiri-card-history-ocr',confidence:.7,statementAccountName:'Kartu kredit · Belum tertagih',selected:false}),cardBillingStatus:'unbilled',aiReason:'Belanja kartu kredit. Periksa kartu, tanggal, nominal, dan kecocokan transaksi sebelum menyimpan.'}))};
 const parsed=screenshotHistory(rawText,{...options,parseMoney:parseIdrValue});
 return {...parsed,candidates:parsed.rows.map(row=>({...createBaseCandidate({bank:options.bank,type:row.signedAmount>0?'income':'expense',date:row.date,time:row.time,amount:row.amount,signedAmount:row.signedAmount,sourceAccountId:options.accountId,category:inferCategory(row.description,merchantFromDescription(row.description),options.merchantRules||{}),merchant:merchantFromDescription(row.description),description:row.description,pageNumber:options.pageNumber||1,rowNumber:row.row,method:`${options.bank}-history-ocr`,confidence:.7,selected:false}),aiReason:'Hasil OCR history: periksa nominal, tanggal, dan apakah ini transfer milik sendiri sebelum memilih.'}))};
}

export function chooseHistoryReading(primary,retry){
 const key=r=>JSON.stringify([r.date,r.time,r.signedAmount]);
 const counts=new Map();for(const r of retry.candidates)counts.set(key(r),(counts.get(key(r))||0)+1);
 const preserves=primary.candidates.every(r=>{const k=key(r),n=counts.get(k)||0;counts.set(k,n-1);return n>0;});
 return retry.handled&&preserves&&retry.candidates.length>primary.candidates.length?retry:primary;
}

async function highContrastImage(file){
 const bitmap=await createImageBitmap(file),scale=Math.min(1600/bitmap.width,Math.sqrt(8000000/(bitmap.width*bitmap.height)));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
 for(let i=0;i<pixels.data.length;i+=4){const gray=.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2];pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=gray<210?0:255;}
 ctx.putImageData(pixels,0,0);return canvas;
}

function parseGenericText(
  rawText,
  {
    bank,
    pageNumber,
    accountId,
    merchantRules
  }
) {
  const lines = String(rawText || "")
    .split("\n")
    .map(normalizeLine)
    .filter(Boolean);

  const candidates = [];
  let active = null;

  const flush = () => {
    if (!active) {
      return;
    }

    // Remove only the date token, not its entire line; the same line can hold
    // merchant, amount and failure status. A date's '-' is never a money sign.
    const context = active.lines.join(" ").replace(active.dateText, "");
    const amounts = [...context.matchAll(
      /([+-])\s*(?:Rp|IDR)?\s*((?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{2})?)/gi
    )];

    const amountInfo = amounts.length
      ? parseIdrValue(amounts[0][0])
      : null;

    if (!amountInfo || !active.date) {
      active = null;
      return;
    }

    const withoutAmount = context.replace(amounts[0][0], "");
    const timeText = withoutAmount.match(/(?<![\d.,])(?:[01]?\d|2[0-3])[:.][0-5]\d(?::[0-5]\d)?(?![\d.,])(?:\s*WIB)?/i)?.[0] || "";
    const time = timeText ? parseTimeFromText(timeText) : "";
    const description = normalizeLine(withoutAmount.replace(timeText, ""));
    if (scanExclusionReason({description})) {
      active = null;
      return;
    }

    const merchant = merchantFromDescription(description);
    const type = amountInfo.signedAmount >= 0 ? "income" : "expense";

    candidates.push(
      createBaseCandidate({
        bank,
        type,
        date: active.date,
        time,
        amount: amountInfo.amount,
        signedAmount: amountInfo.signedAmount,
        sourceAccountId: accountId,
        category: inferCategory(description, merchant, merchantRules),
        merchant,
        description,
        pageNumber,
        rowNumber: candidates.length + 1,
        method: `${bank}-ocr-fallback`,
        confidence: 0.68
      })
    );

    active = null;
  };

  lines.forEach((line) => {
    const dateText = line.match(/\b20\d{2}-\d{2}-\d{2}\b|\b\d{1,2}[\/-]\d{1,2}[\/-]20\d{2}\b|\b\d{1,2}\s+[a-z]+\s+20\d{2}\b/i)?.[0] || "";
    const date = dateText ? parseDateFromText(dateText) : "";

    if (date) {
      flush();
      active = {
        date,
        dateText,
        lines: [line]
      };
      return;
    }

    if (active) {
      active.lines.push(line);
    }
  });

  flush();
  return candidates;
}

function mergeMetadata(base, incoming) {
  const result = { ...base };

  Object.entries(incoming || {}).forEach(([key, value]) => {
    if (
      value !== null &&
      value !== undefined &&
      value !== ""
    ) {
      result[key] = value;
    }
  });

  return result;
}

function validateRunningBalances(candidates, metadata) {
  const cents=value=>Math.round(Number(value)*100);
  const rounded=value=>cents(value)/100;
  const sorted = [...candidates].sort((a, b) => {
    if ((a.sourceFileOrder || 0) !== (b.sourceFileOrder || 0)) {
      return (a.sourceFileOrder || 0) - (b.sourceFileOrder || 0);
    }

    if ((a.sourcePage || 0) !== (b.sourcePage || 0)) {
      return (a.sourcePage || 0) - (b.sourcePage || 0);
    }

    return (a.sourceRow || 0) - (b.sourceRow || 0);
  });

  let previous =
    Number.isFinite(metadata.openingBalance)
      ? metadata.openingBalance
      : null;

  sorted.forEach((candidate) => {
    if (
      previous === null ||
      !Number.isFinite(candidate.balanceAfter)
    ) {
      candidate.validationStatus = "not-available";
      candidate.validationDifference = null;

      if (Number.isFinite(candidate.balanceAfter)) {
        previous = candidate.balanceAfter;
      }

      return;
    }

    const expected =
      (cents(previous) + cents(candidate.signedAmount || 0))/100;
    const difference =
      rounded(Number(candidate.balanceAfter) - expected);

    candidate.validationDifference = difference;

    if (candidate.balanceSource === "calculated") {
      candidate.validationStatus =
        difference === 0
          ? "calculated"
          : "mismatch";
    } else {
      candidate.validationStatus =
        difference === 0
          ? "valid"
          : "mismatch";
    }

    previous = expected;
  });

  const totalIncoming = sorted
    .filter((item) => item.signedAmount > 0)
    .reduce((sum, item) => sum + cents(item.amount), 0)/100;

  const totalOutgoing = sorted
    .filter((item) => item.signedAmount < 0)
    .reduce((sum, item) => sum + cents(item.amount), 0)/100;

  const expectedClosing =
    Number.isFinite(metadata.openingBalance)
      ? (cents(metadata.openingBalance) + cents(totalIncoming) - cents(totalOutgoing))/100
      : null;

  const closingDifference =
    expectedClosing !== null &&
    Number.isFinite(metadata.closingBalance)
      ? rounded(metadata.closingBalance - expectedClosing)
      : null;

  const incomingDifference =
    Number.isFinite(metadata.incomingTotal)
      ? rounded(metadata.incomingTotal - totalIncoming)
      : null;

  const outgoingDifference =
    Number.isFinite(metadata.outgoingTotal)
      ? rounded(metadata.outgoingTotal - totalOutgoing)
      : null;

  const summaryBalanced =
    [closingDifference, incomingDifference, outgoingDifference]
      .filter((value) => value !== null)
      .every((value) => value === 0);

  return {
    candidates: sorted,
    reconciliation: {
      transactionCount: sorted.length,
      totalIncoming,
      totalOutgoing,
      expectedClosing,
      closingDifference,
      incomingDifference,
      outgoingDifference,
      balanced:
        closingDifference === null &&
        incomingDifference === null &&
        outgoingDifference === null
          ? null
          : summaryBalanced && !sorted.some(item=>item.validationStatus==='mismatch'),
      rowMismatchCount: sorted.filter(
        (item) => item.validationStatus === "mismatch"
      ).length,
      calculatedBalanceCount: sorted.filter(
        (item) => item.balanceSource === "calculated"
      ).length
    }
  };
}

function collapseKromInternalMovements(candidates, accountId) {
  const movementGroups = new Map();
  const normal = [];

  candidates.forEach((candidate) => {
    if (
      candidate.bank === "krom" &&
      candidate.internalMovement &&
      candidate.movementReference
    ) {
      if (!movementGroups.has(candidate.movementReference)) {
        movementGroups.set(candidate.movementReference, []);
      }

      movementGroups.get(candidate.movementReference).push(candidate);
    } else {
      normal.push(candidate);
    }
  });

  const collapsed = [];
  let pairCount = 0;
  let unpairedCount = 0;

  movementGroups.forEach((items, reference) => {
    const outgoing = items.find((item) => item.signedAmount < 0);
    const incoming = items.find((item) => item.signedAmount > 0);

    if (
      outgoing &&
      incoming &&
      Math.abs(outgoing.amount - incoming.amount) <= 1
    ) {
      pairCount += 1;

      collapsed.push(
        createBaseCandidate({
          bank: "krom",
          type: "transfer",
          date: outgoing.date || incoming.date,
          time: outgoing.time || incoming.time,
          amount: outgoing.amount,
          signedAmount: 0,
          sourceAccountId: accountId,
          destinationAccountId: accountId,
          category: "Transfer Internal Krom",
          merchant: `${outgoing.statementAccountName || "Krom"} → ${incoming.statementAccountName || "Krom"}`,
          description: `Pemindahan saldo internal Krom ${reference}. Tidak memengaruhi total aset.`,
          pageNumber: outgoing.sourcePage,
          rowNumber: outgoing.sourceRow,
          method: "krom-internal-pair",
          confidence: Math.min(outgoing.confidence, incoming.confidence),
          statementAccountName: `${outgoing.statementAccountName} → ${incoming.statementAccountName}`,
          statementAccountNumber: "",
          reference,
          selected: false,
          internalMovement: true
        })
      );
    } else {
      unpairedCount += items.length;

      items.forEach((item) => {
        collapsed.push({
          ...item,
          type: "transfer",
          sourceAccountId: accountId,
          destinationAccountId: accountId,
          selected: false,
          category: "Transfer Internal Krom",
          description: `${item.description}. Pasangan transfer internal belum ditemukan; tidak dipilih otomatis.`
        });
      });
    }
  });

  return {
    candidates: [...normal, ...collapsed].sort((a, b) => {
      if (a.sourcePage !== b.sourcePage) {
        return a.sourcePage - b.sourcePage;
      }
      return a.sourceRow - b.sourceRow;
    }),
    pairCount,
    unpairedCount
  };
}

function parseNativePage({
  bank,
  tokens,
  pageText,
  pageWidth,
  pageHeight,
  pageNumber,
  bankAccountMap,
  merchantRules,
  metadata,
  parserState
}) {
  const accountId =
    bankAccountMap[bank] ||
    bankAccountMap.generic;

  if (bank === "mandiri") {
    if(metadata.format==='mandiri-consolidated')return parseMandiriConsolidatedPage({tokens,pageWidth,pageHeight,pageNumber,accountId,merchantRules,metadata,parserState});
    return parseMandiriPage({
      tokens,
      pageWidth,
      pageHeight,
      pageNumber,
      accountId,
      merchantRules
    });
  }

  if(bank==='blu')return parseBluPage({tokens,pageWidth,pageHeight,pageNumber,accountId,accountMap:bankAccountMap,merchantRules,metadata});

  if (bank === "bca") {
    return parseBcaPage({
      tokens,
      pageWidth,
      pageHeight,
      pageNumber,
      accountId,
      accountMap: bankAccountMap,
      merchantRules,
      metadata
    });
  }

  if (bank === "krom") {
    return parseKromPage({
      tokens,
      pageWidth,
      pageHeight,
      pageNumber,
      accountId,
      accountMap: bankAccountMap,
      merchantRules,
      metadata,
      parserState
    });
  }

  return [];
}

function metadataForPage({
  bank,
  pageText,
  lines,
  tokens,
  pageWidth,
  existing
}) {
  if(bank==='blu')return parseBluMetadata({tokens,pageWidth,existing});
  if (bank === "mandiri") {
    if(existing.format==='mandiri-consolidated' || /Rekening Koran\s*\/|Rincian Transaksi\s*\/\s*Nomor Referensi/i.test(pageText))return parseMandiriConsolidatedMetadata({tokens,pageText,pageWidth,existing});
    return mergeMetadata(
      existing,
      parseMandiriMetadata(pageText, lines, tokens, pageWidth)
    );
  }

  if (bank === "bca") {
    return parseBcaMetadata(pageText, existing);
  }

  if (bank === "krom") {
    return parseKromMetadata(pageText, existing);
  }

  return existing;
}

async function openPdf(file, password = "") {
  if (!window.pdfjsLib) {
    throw new Error("PDF.js belum termuat.");
  }

  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  try {
    return await window.pdfjsLib.getDocument({
      data: await file.arrayBuffer(),
      password: password || undefined
    }).promise;
  } catch (error) {
    const message = String(error?.message || "");
    const passwordError =
      error?.name === "PasswordException" ||
      error?.code === 1 ||
      error?.code === 2 ||
      /password/i.test(message);

    if (passwordError) {
      if (
        error?.code === 2 ||
        /incorrect|salah/i.test(message)
      ) {
        throw new Error(
          `Password PDF untuk "${file.name}" salah.`
        );
      }

      throw new Error(
        `PDF "${file.name}" membutuhkan password.`
      );
    }

    throw new Error(
      `Gagal membuka PDF "${file.name}": ${message || "format tidak didukung."}`
    );
  }
}

async function renderPageCanvas(page, scale = 2.5) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", {
    willReadFrequently: true
  });

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  await page.render({
    canvasContext: context,
    viewport
  }).promise;

  return canvas;
}

function preprocessCanvas(sourceCanvas) {
  const targetWidth = Math.min(
    3200,
    Math.max(sourceCanvas.width, 1900)
  );

  const scale = targetWidth / sourceCanvas.width;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", {
    willReadFrequently: true
  });

  canvas.width = Math.round(sourceCanvas.width * scale);
  canvas.height = Math.round(sourceCanvas.height * scale);

  context.drawImage(
    sourceCanvas,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const imageData = context.getImageData(
    0,
    0,
    canvas.width,
    canvas.height
  );

  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const gray =
      0.299 * data[index] +
      0.587 * data[index + 1] +
      0.114 * data[index + 2];

    const contrast = Math.max(
      0,
      Math.min(255, (gray - 128) * 1.6 + 128)
    );

    data[index] = contrast;
    data[index + 1] = contrast;
    data[index + 2] = contrast;
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

async function createOcrWorker(onProgress) {
  if (!window.Tesseract?.createWorker) {
    throw new Error(
      "Tesseract OCR belum termuat."
    );
  }

  const worker = await window.Tesseract.createWorker(
    "ind+eng",
    1,
    {
      logger(message) {
        if (
          message.status === "recognizing text" &&
          typeof onProgress === "function"
        ) {
          onProgress(message.progress || 0);
        }
      }
    }
  );

  await worker.setParameters({
    tessedit_pageseg_mode: "6",
    preserve_interword_spaces: "1",
    user_defined_dpi: "300"
  });

  return worker;
}

function isExpectedTransactionPage(bank, pageText) {
  const text = String(pageText || "");

  if (bank === "mandiri") {
    return (
      /Rincian Transaksi\s*\/\s*Nomor Referensi/i.test(text) ||
      /No\s+Tanggal\s+Keterangan/i.test(text) ||
      /Nominal\s*\(IDR\).*Saldo\s*\(IDR\)/is.test(text)
    );
  }

  if(bank==='blu')return /Tanggal\s*&\s*Jam|^\d{1,2}\s+[A-Za-z]+\s+20\d{2}/m.test(text);

  if (bank === "bca") {
    if (isEmptyBcaPocket(text)) return false;
    return (
      /TANGGAL\s+KETERANGAN\s+CBG\s+MUTASI\s+SALDO/i.test(text) ||
      /^\d{2}\/\d{2}\s+/m.test(text)
    );
  }

  if (bank === "krom") {
    return (
      /Rincian Transaksi\s*\/Transaction History/i.test(text) ||
      /Tanggal\s*&\s*Waktu.*Detail Transaksi.*Jumlah/is.test(text) ||
      /^\d{2}\s+[A-Za-z]+\s+20\d{2}/m.test(text)
    );
  }

  return (
    /Tanggal|Date/i.test(text) &&
    /Nominal|Amount|Mutasi/i.test(text)
  );
}

function initialMetadata() {
  return {
    periodStart: "",
    periodEnd: "",
    openingBalance: null,
    incomingTotal: null,
    outgoingTotal: null,
    closingBalance: null,
    accountMasked: "",
    ownerName: ""
  };
}

async function readPdfStatement({
  file,
  password,
  fileOrder,
  bankAccountMap,
  merchantRules,
  onProgress,
  shouldCancel,
  getOcrWorker,
  visionReader
}) {
  const pdf = await openPdf(file, password);
  let bank = "generic";
  let bankDetection = null;
  let metadata = initialMetadata();
  const parserState = {};
  const rawCandidates = [];
  const fallbackPages = [];
  let nativePages = 0;
  let ocrPages = 0;
  let aiPages = 0;
  let excludedCount = 0;
  let informationalPages = 0;
  let parserFailedPages = 0;
  let ocrFailedPages = 0;

  for (
    let pageNumber = 1;
    pageNumber <= pdf.numPages;
    pageNumber += 1
  ) {
    if (shouldCancel()) {
      throw new Error("Proses scan dibatalkan.");
    }

    onProgress({
      stage: "native",
      fileName: file.name,
      bank,
      pageNumber,
      pageCount: pdf.numPages,
      stageProgress: 0
    });

    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent({
      disableNormalization: false,
      includeMarkedContent: false
    });

    const tokens = textContentToTokens(textContent);
    const lines = tokensToLines(tokens);
    const pageText = lines.map((line) => line.text).join("\n");

    if (pageNumber === 1 || bank === "generic") {
      const detected = detectBankFromText(pageText, file.name);

      if (
        !bankDetection ||
        detected.confidence > bankDetection.confidence
      ) {
        bankDetection = detected;
        bank = detected.bank;
      }
    }

    metadata = metadataForPage({
      bank,
      pageText,
      lines,
      tokens,
      pageWidth: viewport.width,
      existing: metadata
    });

    const parsed = parseNativePage({
      bank,
      tokens,
      pageText,
      pageWidth: viewport.width,
      pageHeight: viewport.height,
      pageNumber,
      bankAccountMap,
      merchantRules,
      metadata,
      parserState
    }).map((item) => Object.assign(item, {
      sourceFile: file.name,
      sourceFileOrder: fileOrder
    }));

    if (parsed.length) {
      nativePages += 1;
      rawCandidates.push(...parsed);
    } else {
      const expectedTransactionPage =
        isExpectedTransactionPage(bank, pageText);

      const readableBluDisclaimer=bank==='blu' && !expectedTransactionPage && /\bDisclaimer\b/i.test(pageText) && /Laporan ini|This report/i.test(pageText);
      if(readableBluDisclaimer || (bank === 'bca' && isEmptyBcaPocket(pageText))){
        informationalPages += 1;
      } else if (tokens.length < 35 || (visionReader && expectedTransactionPage)) {
        fallbackPages.push({
          pageNumber,
          expectedTransactionPage
        });
      } else if (expectedTransactionPage) {
        parserFailedPages += 1;
      } else {
        informationalPages += 1;
      }
    }

    page.cleanup();

    onProgress({
      stage: "native",
      fileName: file.name,
      bank,
      pageNumber,
      pageCount: pdf.numPages,
      stageProgress: 1
    });
  }

  for (const fallbackPage of fallbackPages) {
    const pageNumber = fallbackPage.pageNumber;
    if (shouldCancel()) {
      throw new Error("Proses scan dibatalkan.");
    }

    const page = await pdf.getPage(pageNumber);
    const sourceCanvas = await renderPageCanvas(page);
    if (visionReader) {
      onProgress({stage:'ai',fileName:file.name,bank,pageNumber,pageCount:pdf.numPages,stageProgress:0});
      const result = await visionReader({imageDataUrl:await imageDataUrl(sourceCanvas),bankHint:bank,pageNumber});
      if(shouldCancel())throw new Error('Proses scan dibatalkan.');
      const detected=detectBankFromText(JSON.stringify(result),file.name);
      if(bank==='generic')bank=['bca','mandiri','krom','blu'].includes(result.bank)?result.bank:detected.bank;
      const parsed=visionCandidates(result,{bank,accountId:bankAccountMap[bank]||bankAccountMap.generic,pageNumber});
      excludedCount+=Number(result.excluded_count||0)+(result.transactions?.length||0)-parsed.length;
      rawCandidates.push(...parsed.map(item=>({...item,sourceFile:file.name,sourceFileOrder:fileOrder})));
      aiPages+=1;if(!parsed.length)ocrFailedPages+=1;
      sourceCanvas.width=0;sourceCanvas.height=0;page.cleanup();
      continue;
    }
    const preparedCanvas = preprocessCanvas(sourceCanvas);

    const worker = await getOcrWorker((progress) => {
      onProgress({
        stage: "ocr",
        fileName: file.name,
        bank,
        pageNumber,
        pageCount: pdf.numPages,
        stageProgress: progress
      });
    });

    const result = await worker.recognize(preparedCanvas);
    const ocrText = result?.data?.text || "";

    if (bank === "generic") {
      bankDetection = detectBankFromText(ocrText, file.name);
      bank = bankDetection.bank;
    }

    const parsed = parseGenericText(
      ocrText,
      {
        bank,
        pageNumber,
        accountId:
          bankAccountMap[bank] ||
          bankAccountMap.generic,
        merchantRules
      }
    ).map((item) => ({
      ...item,
      sourceFile: file.name,
      sourceFileOrder: fileOrder
    }));

    if (parsed.length) {
      ocrPages += 1;
      rawCandidates.push(...parsed);
    } else if (fallbackPage.expectedTransactionPage) {
      ocrFailedPages += 1;
    } else {
      informationalPages += 1;
    }

    sourceCanvas.width = 0;
    sourceCanvas.height = 0;
    preparedCanvas.width = 0;
    preparedCanvas.height = 0;
    page.cleanup();
  }

  const candidatesForValidation =
    bank === "bca"
      ? reconstructBcaBalances(
          rawCandidates,
          metadata
        )
      : rawCandidates;

  const validated = validateRunningBalances(
    candidatesForValidation,
    metadata
  );

  let saveCandidates = validated.candidates;
  let internalPairCount = 0;
  let unpairedInternalCount = 0;

  if (bank === "krom") {
    const collapsed = collapseKromInternalMovements(
      validated.candidates,
      bankAccountMap.krom || bankAccountMap.generic
    );

    saveCandidates = collapsed.candidates;
    internalPairCount = collapsed.pairCount;
    unpairedInternalCount = collapsed.unpairedCount;
  }

  return {
    candidates: saveCandidates,
    statement: {
      fileName: file.name,
      bank,
      bankLabel: BANK_LABELS[bank],
      bankConfidence: bankDetection?.confidence || 0.35,
      pageCount: pdf.numPages,
      nativePages,
      ocrPages,
      aiPages,
      excludedCount,
      informationalPages,
      parserFailedPages,
      ocrFailedPages,
      failedPages: parserFailedPages + ocrFailedPages,
      rawTransactionCount: validated.candidates.length,
      reviewCandidateCount: saveCandidates.length,
      internalPairCount,
      unpairedInternalCount,
      metadata,
      reconciliation: validated.reconciliation
    }
  };
}

async function readImageStatement({
  file,
  fileOrder,
  bankAccountMap,
  merchantRules,
  onProgress,
  shouldCancel,
  getOcrWorker,
  visionReader
}) {
  if (shouldCancel()) {
    throw new Error("Proses scan dibatalkan.");
  }

  if(visionReader) {
    onProgress({stage:'ai',fileName:file.name,pageNumber:1,pageCount:1,stageProgress:0});
    const result=await visionReader({imageDataUrl:await imageDataUrl(file),pageNumber:1});
    if(shouldCancel())throw new Error('Proses scan dibatalkan.');
    const detected=detectBankFromText(JSON.stringify(result),file.name),bank=['bca','mandiri','krom','blu'].includes(result.bank)?result.bank:detected.bank;
    const candidates=visionCandidates(result,{bank,accountId:bankAccountMap[bank]||bankAccountMap.generic,pageNumber:1}).map(item=>({...item,sourceFile:file.name,sourceFileOrder:fileOrder}));
    return {candidates,statement:{fileName:file.name,bank,bankLabel:BANK_LABELS[bank],pageCount:1,nativePages:0,ocrPages:0,aiPages:1,excludedCount:Number(result.excluded_count||0)+(result.transactions?.length||0)-candidates.length,failedPages:candidates.length?0:1,reviewCandidateCount:candidates.length,metadata:{},reconciliation:{}}};
  }

  const worker = await getOcrWorker((progress) => {
    onProgress({
      stage: "ocr",
      fileName: file.name,
      bank: "generic",
      pageNumber: 1,
      pageCount: 1,
      stageProgress: progress
    });
  });

  const result = await worker.recognize(file);
  if(shouldCancel())throw new Error('Proses scan dibatalkan.');
  const rawText = result?.data?.text || "";
  const detection = detectBankFromText(rawText, file.name);
  const bank = detection.bank;
  const options={bank,pageNumber:1,accountId:bankAccountMap[bank]||bankAccountMap.generic,cardAccountId:bankAccountMap.mandiriCard||'',merchantRules};
  let history=parseScreenshotHistory(rawText,options);
  const cardHistoryImage=isMandiriCardHistory(rawText);
  if(cardHistoryImage){
    const canvas=await highContrastImage(file);
    const retry=await worker.recognize(canvas);
    const text=await readCardCents(retry.data,canvas,worker,shouldCancel);
    if(shouldCancel())throw new Error('Proses scan dibatalkan.');
    // Contrast recovers the faint date headings; never borrow the due date.
    history=parseScreenshotHistory(text,options);
  } else if(history.handled&&(!history.candidates.length||history.excluded.some(e=>/nominal OCR ambigu/i.test(e.reason)))){
    onProgress({stage:'ocr',fileName:file.name,bank,pageNumber:1,pageCount:1,stageProgress:0});
    const retry=await worker.recognize(await highContrastImage(file));
    if(shouldCancel())throw new Error('Proses scan dibatalkan.');
    history=chooseHistoryReading(history,parseScreenshotHistory(retry?.data?.text||'',options));
  }
  const parsed = (history.handled?history.candidates:parseImageText(rawText,options)).map((item) => ({
    ...item,
    ...(history.handled?{sourceRevision:cardHistoryImage?'card-history-v1':'history-v1'}:{}),
    sourceFile: file.name,
    sourceFileOrder: fileOrder
  }));

  const validated = validateRunningBalances(parsed, {});
  const informational=!parsed.length&&!history.handled&&/total saldo|active balance|akumulasi bunga|spaylater|bluloyalty|saldo tersedia/i.test(rawText);

  return {
    candidates: validated.candidates,
    excluded:history.handled?history.excluded.map(e=>({fileName:file.name,page:1,reason:`Baris ${e.row}: ${e.reason}`})):informational?[{fileName:file.name,page:1,reason:'Gambar saldo, limit, atau promo; bukan bukti transaksi baru.'}]:[],
    statement: {
      fileName: file.name,
      bank,
      bankLabel: BANK_LABELS[bank],
      bankConfidence: detection.confidence,
      pageCount: 1,
      nativePages: 0,
      ocrPages: parsed.length ? 1 : 0,
      informationalPages: informational?1:0,
      parserFailedPages: 0,
      ocrFailedPages: parsed.length||informational ? 0 : 1,
      failedPages: parsed.length||informational ? 0 : 1,
      rawTransactionCount: parsed.length,
      reviewCandidateCount: parsed.length,
      internalPairCount: 0,
      unpairedInternalCount: 0,
      metadata: {},
      reconciliation: validated.reconciliation
    }
  };
}

export async function scanStatementFiles({
  files,
  password = "",
  bankAccountMap,
  merchantRules = {},
  onProgress = () => {},
  shouldCancel = () => false,
  visionReader = null
}) {
  const candidates = [];
  const statements = [];
  const excluded = [];
  let ocrWorker = null;
  let currentOcrProgress=null;

  const getOcrWorker = async (progressCallback) => {
    currentOcrProgress=progressCallback;
    if (!ocrWorker) {
      ocrWorker = await createOcrWorker(
        progress=>currentOcrProgress?.(progress)
      );
    }

    return ocrWorker;
  };

  try {
    for (
      let fileOrder = 0;
      fileOrder < files.length;
      fileOrder += 1
    ) {
      const file = files[fileOrder];

      if (shouldCancel()) {
        throw new Error("Proses scan dibatalkan.");
      }

      const isPdf =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");

      const result = isPdf
        ? await readPdfStatement({
            file,
            password,
            fileOrder,
            bankAccountMap,
            merchantRules,
            onProgress,
            shouldCancel,
            getOcrWorker,
            visionReader
          })
        : await readImageStatement({
            file,
            fileOrder,
            bankAccountMap,
            merchantRules,
            onProgress,
            shouldCancel,
            getOcrWorker,
            visionReader
          });

      const bytes=await file.arrayBuffer();
      excluded.push(...(result.excluded||[]));
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const sourceHash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      for(const item of result.candidates){const reason=scanExclusionReason(item);if(reason)excluded.push({fileName:file.name,page:item.sourcePage,reason});else candidates.push({...item,sourceHash});}
      if(result.statement.excludedCount)excluded.push({fileName:file.name,reason:`${result.statement.excludedCount} baris AI bukan transaksi selesai atau tidak cukup terbaca.`});
      statements.push({...result.statement,sourceHash});
    }
  } finally {
    if (ocrWorker) {
      await ocrWorker.terminate();
    }
  }

  return {
    candidates,
    statements,
    excluded
  };
}

/*
 * Pure test entry point. It uses token pages without PDF.js/browser APIs.
 * Token Y coordinates must follow PDF.js orientation: larger Y = higher on page.
 */
export function parseStatementTokenPagesForTest({
  fileName,
  pages,
  bankAccountMap,
  merchantRules = {}
}) {
  let bank = "generic";
  let detection = null;
  let metadata = initialMetadata();
  const parserState = {};
  const rawCandidates = [];
  let nativePages = 0;

  pages.forEach((page, pageIndex) => {
    const lines = tokensToLines(page.tokens);
    const pageText = page.pageText || lines.map((line) => line.text).join("\n");

    if (pageIndex === 0 || bank === "generic") {
      const current = detectBankFromText(pageText, fileName);

      if (!detection || current.confidence > detection.confidence) {
        detection = current;
        bank = current.bank;
      }
    }

    metadata = metadataForPage({
      bank,
      pageText,
      lines,
      tokens: page.tokens,
      pageWidth: page.pageWidth,
      existing: metadata
    });

    const parsed = parseNativePage({
      bank,
      tokens: page.tokens,
      pageText,
      pageWidth: page.pageWidth,
      pageHeight: page.pageHeight,
      pageNumber: pageIndex + 1,
      bankAccountMap,
      merchantRules,
      metadata,
      parserState
    }).map((item) => Object.assign(item, {
      sourceFile: fileName,
      sourceFileOrder: 0
    }));

    if (parsed.length) {
      nativePages += 1;
      rawCandidates.push(...parsed);
    }
  });

  const candidatesForValidation =
    bank === "bca"
      ? reconstructBcaBalances(
          rawCandidates,
          metadata
        )
      : rawCandidates;

  const validated = validateRunningBalances(
    candidatesForValidation,
    metadata
  );

  let saveCandidates = validated.candidates;
  let internalPairCount = 0;
  let unpairedInternalCount = 0;

  if (bank === "krom") {
    const collapsed = collapseKromInternalMovements(
      validated.candidates,
      bankAccountMap.krom || bankAccountMap.generic
    );

    saveCandidates = collapsed.candidates;
    internalPairCount = collapsed.pairCount;
    unpairedInternalCount = collapsed.unpairedCount;
  }

  return {
    candidates: saveCandidates,
    statement: {
      fileName,
      bank,
      bankLabel: BANK_LABELS[bank],
      bankConfidence: detection?.confidence || 0.35,
      pageCount: pages.length,
      nativePages,
      ocrPages: 0,
      informationalPages: Math.max(0, pages.length - nativePages),
      parserFailedPages: 0,
      ocrFailedPages: 0,
      failedPages: 0,
      rawTransactionCount: validated.candidates.length,
      reviewCandidateCount: saveCandidates.length,
      internalPairCount,
      unpairedInternalCount,
      metadata,
      reconciliation: validated.reconciliation
    }
  };
}
