import {
  cleanText,
  formatDateLocal,
  slugText
} from "./utils.js";

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

  const rounded = Math.round(numeric);
  const signedAmount = sign === "-" ? -rounded : rounded;

  return {
    amount: Math.abs(rounded),
    signedAmount,
    sign,
    raw: match[0]
  };
}

function parseDateFromText(value, fallbackYear = null) {
  const text = normalizeLine(value);

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
    krom: 0
  };

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

function parseBcaMetadata(pageText, existing = {}) {
  const metadata = { ...existing };

  const period = String(pageText || "").match(
    /PERIODE\s*:?\s*([A-Z]+)\s+(20\d{2})/i
  );

  if (period) {
    const month = MONTHS[period[1].toLowerCase()] || MONTHS[period[1].slice(0, 3).toLowerCase()];

    if (month) {
      metadata.periodStart = `${period[2]}-${month}-01`;
      metadata.periodEnd = monthEndDate(period[2], month);
      metadata.periodYear = Number(period[2]);
    }
  }

  const account = String(pageText || "").match(
    /NO\.\s*REKENING\s*:?\s*(\d{8,})/i
  );

  if (account) {
    metadata.accountMasked = account[1];
  }

  const summaryPatterns = {
    openingBalance: /SALDO AWAL\s*:\s*([\d,]+\.\d{2})/i,
    incomingTotal: /MUTASI CR\s*:\s*([\d,]+\.\d{2})/i,
    outgoingTotal: /MUTASI DB\s*:\s*([\d,]+\.\d{2})/i,
    closingBalance: /SALDO AKHIR\s*:\s*([\d,]+\.\d{2})/i
  };

  Object.entries(summaryPatterns).forEach(([key, pattern]) => {
    const match = String(pageText || "").match(pattern);

    if (match) {
      metadata[key] = Math.abs(parseIdrValue(match[1])?.signedAmount ?? 0);
    }
  });

  return metadata;
}

function parseBcaPage({
  tokens,
  pageWidth,
  pageHeight,
  pageNumber,
  accountId,
  merchantRules,
  metadata
}) {
  const lines = tokensToLines(tokens);
  const year = metadata.periodYear || Number(metadata.periodStart?.slice(0, 4)) || new Date().getFullYear();

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
      Math.max(pageHeight * 0.08, start.y - 70);

    const lowerBound = Math.max(
      nextY + 2,
      start.y - 70,
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

    const isCredit = /\bCR\b/i.test(titleText);
    const isDebit =
      /\bDB\b|DEBIT|BIAYA ADM/i.test(`${titleText} ${amountText}`);

    const signedAmount =
      isDebit && !isCredit
        ? -Math.abs(amountInfo.amount)
        : Math.abs(amountInfo.amount);

    const date = parseDateFromText(start.text, year);
    const description = normalizeLine(`${titleText} ${detailText}`);
    const merchant = merchantFromDescription(description);
    const balanceInfo = parseIdrValue(balanceText);
    const possibleOwnTransfer =
      isCredit &&
      /BI-FAST|TRANSFER/i.test(description) &&
      /arnoldus|darryl|andyka/i.test(description);

    candidates.push(
      createBaseCandidate({
        bank: "bca",
        type: signedAmount >= 0 ? "income" : "expense",
        date,
        amount: Math.abs(signedAmount),
        signedAmount,
        sourceAccountId: accountId,
        category: inferCategory(description, merchant, merchantRules),
        merchant,
        description,
        balanceAfter: balanceInfo?.amount ?? null,
        pageNumber,
        rowNumber: candidates.length + 1,
        method: "bca-native-layout",
        confidence: Math.min(
          0.98,
          0.83 +
          (balanceInfo ? 0.05 : 0) +
          (/\b(?:CR|DB)\b/i.test(`${titleText} ${amountText}`) ? 0.05 : 0) +
          (description.length > 8 ? 0.03 : 0)
        ),
        possibleOwnTransfer
      })
    );
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

    const reference =
      description.match(/\b([A-Za-z0-9]{12,})\b/)?.[1] || "";
    const merchant = merchantFromDescription(description);
    const isMovement = /Pemindahan Saldo|Balance Movement/i.test(transactionTypeText);
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

      // Statement ini milik Krom, sehingga rekening penerima selalu Krom.
      destinationAccountId = accountId;

      if (mentionsOwner && sourceBank) {
        type = "transfer";
        sourceAccountId = sourceBank;
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

    const context = active.lines.join(" ");
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

    const description = normalizeLine(
      context
        .replace(active.dateText, "")
        .replace(active.time || "", "")
        .replace(amounts[0][0], "")
    );

    const merchant = merchantFromDescription(description);
    const type = amountInfo.signedAmount >= 0 ? "income" : "expense";

    candidates.push(
      createBaseCandidate({
        bank,
        type,
        date: active.date,
        time: active.time,
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
    const date = parseDateFromText(line);

    if (date) {
      flush();
      active = {
        date,
        dateText: line,
        time: parseTimeFromText(line),
        lines: [line]
      };
      return;
    }

    if (active) {
      if (!active.time) {
        active.time = parseTimeFromText(line);
      }

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
      previous + Number(candidate.signedAmount || 0);
    const difference =
      Number(candidate.balanceAfter) - expected;

    candidate.validationDifference = difference;
    candidate.validationStatus =
      Math.abs(difference) <= 1
        ? "valid"
        : "mismatch";

    previous = Number(candidate.balanceAfter);
  });

  const totalIncoming = sorted
    .filter((item) => item.signedAmount > 0)
    .reduce((sum, item) => sum + item.amount, 0);

  const totalOutgoing = sorted
    .filter((item) => item.signedAmount < 0)
    .reduce((sum, item) => sum + item.amount, 0);

  const expectedClosing =
    Number.isFinite(metadata.openingBalance)
      ? metadata.openingBalance + totalIncoming - totalOutgoing
      : null;

  const closingDifference =
    expectedClosing !== null &&
    Number.isFinite(metadata.closingBalance)
      ? metadata.closingBalance - expectedClosing
      : null;

  const incomingDifference =
    Number.isFinite(metadata.incomingTotal)
      ? metadata.incomingTotal - totalIncoming
      : null;

  const outgoingDifference =
    Number.isFinite(metadata.outgoingTotal)
      ? metadata.outgoingTotal - totalOutgoing
      : null;

  const summaryBalanced =
    [closingDifference, incomingDifference, outgoingDifference]
      .filter((value) => value !== null)
      .every((value) => Math.abs(value) <= 2);

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
          : summaryBalanced,
      rowMismatchCount: sorted.filter(
        (item) => item.validationStatus === "mismatch"
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
    return parseMandiriPage({
      tokens,
      pageWidth,
      pageHeight,
      pageNumber,
      accountId,
      merchantRules
    });
  }

  if (bank === "bca") {
    return parseBcaPage({
      tokens,
      pageWidth,
      pageHeight,
      pageNumber,
      accountId,
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
  if (bank === "mandiri") {
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
      /No\s+Tanggal\s+Keterangan/i.test(text) ||
      /Nominal\s*\(IDR\).*Saldo\s*\(IDR\)/is.test(text)
    );
  }

  if (bank === "bca") {
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
  getOcrWorker
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
    }).map((item) => ({
      ...item,
      sourceFile: file.name,
      sourceFileOrder: fileOrder
    }));

    if (parsed.length) {
      nativePages += 1;
      rawCandidates.push(...parsed);
    } else {
      const expectedTransactionPage =
        isExpectedTransactionPage(bank, pageText);

      if (tokens.length < 35) {
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

  const validated = validateRunningBalances(
    rawCandidates,
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
  getOcrWorker
}) {
  if (shouldCancel()) {
    throw new Error("Proses scan dibatalkan.");
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
  const rawText = result?.data?.text || "";
  const detection = detectBankFromText(rawText, file.name);
  const bank = detection.bank;
  const parsed = parseGenericText(
    rawText,
    {
      bank,
      pageNumber: 1,
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

  const validated = validateRunningBalances(parsed, {});

  return {
    candidates: validated.candidates,
    statement: {
      fileName: file.name,
      bank,
      bankLabel: BANK_LABELS[bank],
      bankConfidence: detection.confidence,
      pageCount: 1,
      nativePages: 0,
      ocrPages: parsed.length ? 1 : 0,
      informationalPages: 0,
      parserFailedPages: 0,
      ocrFailedPages: parsed.length ? 0 : 1,
      failedPages: parsed.length ? 0 : 1,
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
  shouldCancel = () => false
}) {
  const candidates = [];
  const statements = [];
  let ocrWorker = null;

  const getOcrWorker = async (progressCallback) => {
    if (!ocrWorker) {
      ocrWorker = await createOcrWorker(
        progressCallback
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
            getOcrWorker
          })
        : await readImageStatement({
            file,
            fileOrder,
            bankAccountMap,
            merchantRules,
            onProgress,
            shouldCancel,
            getOcrWorker
          });

      candidates.push(...result.candidates);
      statements.push(result.statement);
    }
  } finally {
    if (ocrWorker) {
      await ocrWorker.terminate();
    }
  }

  return {
    candidates,
    statements
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
    }).map((item) => ({
      ...item,
      sourceFile: fileName,
      sourceFileOrder: 0
    }));

    if (parsed.length) {
      nativePages += 1;
      rawCandidates.push(...parsed);
    }
  });

  const validated = validateRunningBalances(
    rawCandidates,
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
