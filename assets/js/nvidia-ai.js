const DEFAULT_TIMEOUT_MS = 120000;
const BATCH_SIZE = 35;

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

async function fetchJson(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
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

export async function checkNvidiaBackend(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);

  if (!normalized) {
    throw new Error("URL backend NVIDIA AI belum diisi.");
  }

  return fetchJson(`${normalized}/health`, {
    method: "GET"
  }, 20000);
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
    validationStatus: candidate.validationStatus || ""
  };
}

export async function optimizeCandidatesWithNvidia({
  baseUrl,
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
