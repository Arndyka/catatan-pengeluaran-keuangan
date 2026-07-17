import {
  formatDateLocal
} from "./utils.js";

function cleanLine(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseAmount(line) {
  const signed = line.match(/([+-])\s*(?:Rp|IDR)?\s*([0-9][0-9.,]{2,})/i);
  const unsigned = line.match(/(?:Rp|IDR)\s*([0-9][0-9.,]{2,})/i);

  if (!signed && !unsigned) return null;

  const raw = signed ? signed[2] : unsigned[1];
  const amount = Number(raw.replace(/[^\d]/g, ""));

  if (!amount || amount < 1000) return null;

  return {
    sign: signed ? signed[1] : "",
    amount
  };
}

function parseDate(line) {
  let match = line.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})/);

  if (match) {
    return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }

  const monthMap = {
    jan: "01", januari: "01",
    feb: "02", februari: "02",
    mar: "03", maret: "03",
    apr: "04", april: "04",
    mei: "05",
    jun: "06", juni: "06",
    jul: "07", juli: "07",
    agu: "08", agustus: "08",
    sep: "09", september: "09",
    okt: "10", oktober: "10",
    nov: "11", november: "11",
    des: "12", desember: "12"
  };

  match = line.toLowerCase().match(/(\d{1,2})\s+([a-z]+)\s+(20\d{2})/);

  if (match && monthMap[match[2]]) {
    return `${match[3]}-${monthMap[match[2]]}-${match[1].padStart(2, "0")}`;
  }

  return "";
}

function inferCategory(text) {
  const lower = text.toLowerCase();

  if (/(ayam|makan|nasi|mie|kopi|coffee|kedai|restaurant|resto|familymart)/.test(lower)) {
    return "Makan";
  }

  if (/(grab|gojek|taxi|tol|parkir|bensin|pertamina)/.test(lower)) {
    return "Transportasi";
  }

  if (/(pln|listrik|internet|wifi|tagihan|pulsa)/.test(lower)) {
    return "Tagihan";
  }

  if (/(tokopedia|shopee|lazada|mall|store)/.test(lower)) {
    return "Belanja";
  }

  return "Lainnya";
}

export function parseOcrTransactions(rawText, defaultAccountId) {
  const lines = String(rawText || "")
    .split("\n")
    .map(cleanLine)
    .filter(Boolean);

  const results = [];
  let currentDate = formatDateLocal();

  lines.forEach((line, index) => {
    const date = parseDate(line);

    if (date) {
      currentDate = date;
    }

    const amountInfo = parseAmount(line);

    if (!amountInfo) return;

    const context = lines
      .slice(Math.max(0, index - 3), Math.min(lines.length, index + 3))
      .join(" ");

    const type = amountInfo.sign === "+" ? "income" : "expense";
    const category = type === "income" ? "Pemasukan" : inferCategory(context);

    results.push({
      selected: true,
      type,
      date: currentDate,
      amount: amountInfo.amount,
      sourceAccountId: defaultAccountId,
      destinationAccountId: "",
      category,
      merchant: context.slice(0, 80),
      description: "Hasil OCR",
      origin: "ocr"
    });
  });

  return results;
}

export async function renderPdfPages(file) {
  if (!window.pdfjsLib) {
    throw new Error("PDF.js belum termuat.");
  }

  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const pdf = await window.pdfjsLib.getDocument({
    data: await file.arrayBuffer()
  }).promise;

  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: context,
      viewport
    }).promise;

    pages.push(canvas);
  }

  return pages;
}
