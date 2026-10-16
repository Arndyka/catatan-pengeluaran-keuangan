const DEFAULT_TIMEOUT_MS = 120000;
const BATCH_SIZE = 35;

export async function readPageWithNvidia({baseUrl,accessToken='',imageDataUrl,bankHint='generic',pageNumber=1}) {
 const normalized=normalizeBaseUrl(baseUrl);
 if(!normalized)throw new Error('Isi URL backend AI sebelum memakai scan AI.');
 await checkNvidiaBackend(normalized,accessToken);
 const response=await fetchJson(`${normalized}/api/nvidia/read-page`,{method:'POST',headers:accessHeaders(accessToken),body:JSON.stringify({image_data_url:imageDataUrl,bank_hint:bankHint,page_number:pageNumber})});
 if(!Array.isArray(response.result?.transactions))throw new Error('AI tidak mengembalikan daftar transaksi. Coba OCR lokal atau gambar lebih jelas.');
 return response.result;
}

function normalizeBaseUrl(value) {
  const text = String(value || "").trim().replace(/\/+$/, "");
  if (!text) return "";
  let url;
  try { url = new URL(text); } catch { throw new Error("URL backend AI tidak valid."); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) {
    throw new Error("Gunakan URL backend HTTPS tanpa password atau parameter. HTTP hanya diizinkan untuk localhost.");
  }
  return url.href.replace(/\/+$/, "");
}

function accessHeaders(token) {
  const value = String(token || '').trim();
  return value ? {Authorization: `Bearer ${value}`} : {};
}

async function fetchJson(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        payload.detail ||
        payload.error ||
        `Backend NVIDIA AI merespons HTTP ${response.status}.`
      );
    }

    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Permintaan NVIDIA AI melewati batas waktu.");
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkNvidiaBackend(baseUrl, accessToken = '') {
  const normalized = normalizeBaseUrl(baseUrl);

  if (!normalized) {
    throw new Error("URL backend NVIDIA AI belum diisi.");
  }

  const health = await fetchJson(`${normalized}/health`, {
    method: "GET"
  }, 90000);
  if (health.ok !== true) {
    throw new Error("Backend AI belum siap. Periksa layanan backend.");
  }
  if (health.api_key_configured !== true) {
    throw new Error("API key NVIDIA belum dikonfigurasi di backend. Isi NVIDIA_API_KEY pada server, bukan di browser.");
  }
  if (health.auth_required) {
    if (health.access_configured !== true) throw new Error("Kode akses AI belum dikonfigurasi pada server.");
    if (!String(accessToken || '').trim()) throw new Error("Isi kode akses AI pada pengaturan scanner.");
    await fetchJson(`${normalized}/api/nvidia/access`, {method:'GET', headers:accessHeaders(accessToken)});
  }
  return health;
}

function sanitizeCandidate(candidate, index) {
  return {
    index,
    bank: candidate.bank || "generic",
    type: candidate.type || "",
    date: candidate.date || "",
    time: candidate.time || "",
    amount: Number(candidate.amount || 0),
    signedAmount: Number(candidate.signedAmount || 0),
    category: candidate.category || "",
    merchant: candidate.merchant || "",
    description: candidate.description || "",
    sourceAccountId: candidate.sourceAccountId || "",
    destinationAccountId: candidate.destinationAccountId || "",
    possibleOwnTransfer: candidate.possibleOwnTransfer === true,
    internalMovement: candidate.internalMovement === true,
    extractionMethod: candidate.extractionMethod || "",
    confidence: Number(candidate.confidence || 0),
    validationStatus: candidate.validationStatus || "",
    transactionCode: candidate.transactionCode || "",
    reference: candidate.reference || "",
    counterpartyRaw: candidate.counterpartyRaw || "",
    balanceAfter:
      candidate.balanceAfter === null || candidate.balanceAfter === undefined
        ? null
        : Number(candidate.balanceAfter),
    balanceSource: candidate.balanceSource || ""
  };
}

export async function optimizeCandidatesWithNvidia({
  baseUrl,
  accessToken = '',
  candidates,
  statements,
  accounts,
  onProgress = () => {}
}) {
  const normalized = normalizeBaseUrl(baseUrl);

  if (!normalized) {
    throw new Error("URL backend NVIDIA AI belum diisi.");
  }

  if (!Array.isArray(candidates) || !candidates.length) {
    throw new Error("Belum ada kandidat transaksi untuk dioptimalkan.");
  }

  const allUpdates = [];
  await checkNvidiaBackend(normalized, accessToken);
  const totalBatches = Math.ceil(candidates.length / BATCH_SIZE);

  for (let start = 0; start < candidates.length; start += BATCH_SIZE) {
    const batchNumber = Math.floor(start / BATCH_SIZE) + 1;
    const batch = candidates
      .slice(start, start + BATCH_SIZE)
      .map((candidate, offset) =>
        sanitizeCandidate(candidate, start + offset)
      );

    onProgress({
      batchNumber,
      totalBatches,
      processed: start,
      total: candidates.length
    });

    const response = await fetchJson(
      `${normalized}/api/nvidia/normalize-statement`,
      {
        method: "POST",
        headers: accessHeaders(accessToken),
        body: JSON.stringify({
          statements: (statements || []).map((statement) => ({
            fileName: statement.fileName || "",
            bank: statement.bank || "",
            bankLabel: statement.bankLabel || "",
            metadata: statement.metadata || {},
            reconciliation: statement.reconciliation || {}
          })),
          accounts: (accounts || []).map((account) => ({
            id: account.id,
            name: account.name,
            type: account.type,
            subtype: account.subtype
          })),
          candidates: batch
        })
      }
    );

    if (Array.isArray(response.updates)) {
      allUpdates.push(...response.updates);
    }
  }

  onProgress({
    batchNumber: totalBatches,
    totalBatches,
    processed: candidates.length,
    total: candidates.length
  });

  return {
    updates: allUpdates
  };
}
