import {
  canonicalJson,
  cleanText,
  sha256,
  slugText,
  parseLocalDate,
  monthRange
} from "./utils.js";

export const DEFAULT_ACCOUNTS = [
  { id: "asset-mandiri", name: "Mandiri", type: "asset", subtype: "bank", active: true },
  { id: "asset-bca", name: "BCA", type: "asset", subtype: "bank", active: true },
  { id: "asset-krom", name: "Krom", type: "asset", subtype: "bank", active: true },
  { id: "asset-cash", name: "Tunai", type: "asset", subtype: "cash", active: true },
  { id: "asset-dana", name: "DANA", type: "asset", subtype: "ewallet", active: true },
  { id: "asset-investment", name: "Investasi / Portofolio", type: "asset", subtype: "investment", active: true },
  { id: "liability-mandiri-cc", name: "Mandiri Credit Card", type: "liability", subtype: "credit_card", active: true }
];

export const DEFAULT_SETTINGS = {
  accounts: DEFAULT_ACCOUNTS,
  hideBalanceDefault: true,
  currency: "IDR",
  accountingBasis: "hybrid-accrual",
  merchantCategoryRules: {},
  updatedAt: null
};

export const DEFAULT_CREDIT_SETTINGS = {
  cardAccountId: "liability-mandiri-cc",
  limit: 10000000,
  statementDay: 7,
  dueDays: 20,
  reminderDays: 5,
  minimumPaymentPercent: 5,
  minimumPaymentFloor: 50000,
  monthlyInterestPercent: 1.75,
  officialStatementAmount: 0,
  officialStatementDate: "",
  officialDueDate: "",
  reconciliationNote: ""
};

function accountById(settings, id) {
  return settings.accounts.find((account) => account.id === id);
}

function accountEntry(account, debit, credit) {
  if (!account) {
    throw new Error("Akun transaksi tidak ditemukan.");
  }

  return {
    accountId: account.id,
    accountName: account.name,
    accountType: account.type,
    accountSubtype: account.subtype,
    debit: Number(debit || 0),
    credit: Number(credit || 0)
  };
}

export function buildJournal(input, settings) {
  const amount = Number(input.amount || 0);
  const source = accountById(settings, input.sourceAccountId);
  const destination = accountById(settings, input.destinationAccountId);
  const category = cleanText(input.category || "Lainnya");
  const incomeAccount = {
    id: `income-${slugText(category)}`,
    name: `Pendapatan: ${category}`,
    type: "income",
    subtype: "income"
  };
  const expenseAccount = {
    id: `expense-${slugText(category)}`,
    name: `Beban: ${category}`,
    type: "expense",
    subtype: "expense"
  };

  switch (input.type) {
    case "income":
      return [
        accountEntry(source, amount, 0),
        accountEntry(incomeAccount, 0, amount)
      ];

    case "expense":
      return [
        accountEntry(expenseAccount, amount, 0),
        accountEntry(source, 0, amount)
      ];

    case "transfer":
      return [
        accountEntry(destination, amount, 0),
        accountEntry(source, 0, amount)
      ];

    case "credit_purchase":
      if (!source || source.type !== "liability") {
        throw new Error("Belanja kartu kredit harus memakai akun liabilitas kartu kredit.");
      }
      return [
        accountEntry(expenseAccount, amount, 0),
        accountEntry(source, 0, amount)
      ];

    case "credit_payment":
      if (!destination || destination.type !== "liability") {
        throw new Error("Pembayaran kartu kredit harus menuju akun kartu kredit.");
      }
      return [
        accountEntry(destination, amount, 0),
        accountEntry(source, 0, amount)
      ];

    case "investment":
      return [
        accountEntry(destination, amount, 0),
        accountEntry(source, 0, amount)
      ];

    default:
      throw new Error("Tipe transaksi tidak dikenali.");
  }
}

export function validateJournal(journal) {
  const debit = journal.reduce((sum, item) => sum + Number(item.debit || 0), 0);
  const credit = journal.reduce((sum, item) => sum + Number(item.credit || 0), 0);
  const difference = Math.abs(debit - credit);

  return {
    valid: difference < 0.01,
    debit,
    credit,
    difference
  };
}

export async function buildTransaction(input, settings) {
  const date = input.date;
  const amount = Number(input.amount || 0);

  if (!date || !amount || amount <= 0) {
    throw new Error("Tanggal dan nominal wajib diisi.");
  }

  const normalized = {
    type: input.type,
    date,
    amount,
    sourceAccountId: input.sourceAccountId || "",
    destinationAccountId: input.destinationAccountId || "",
    category: cleanText(input.category || "Lainnya"),
    merchant: cleanText(input.merchant || ""),
    description: cleanText(input.description || ""),
    installmentTenor: Number(input.installmentTenor || 1),
    recurringRuleId: input.recurringRuleId || "",
    origin: input.origin || "manual",
    sourceMeta: input.sourceMeta || null,
    confidence:
      input.confidence === null || input.confidence === undefined
        ? null
        : Number(input.confidence),
    externalBalance:
      input.externalBalance === null || input.externalBalance === undefined
        ? null
        : Number(input.externalBalance),
    validationStatus: input.validationStatus || ""
  };

  const journal = buildJournal(normalized, settings);
  const journalCheck = validateJournal(journal);

  if (!journalCheck.valid) {
    throw new Error("Jurnal tidak seimbang.");
  }

  const fingerprintPayload = {
    type: normalized.type,
    date: normalized.date,
    amount: normalized.amount,
    sourceAccountId: normalized.sourceAccountId,
    destinationAccountId: normalized.destinationAccountId,
    category: slugText(normalized.category),
    merchant: slugText(normalized.merchant),
    description: slugText(normalized.description),
    recurringRuleId: normalized.recurringRuleId
  };

  const fingerprint = await sha256(canonicalJson(fingerprintPayload));

  return {
    id: fingerprint,
    fingerprint,
    ...normalized,
    journal,
    journalCheck,
    createdAtClient: new Date().toISOString(),
    updatedAtClient: new Date().toISOString()
  };
}

export function deriveLedger(transactions) {
  const accountMap = new Map();
  let totalDebits = 0;
  let totalCredits = 0;

  transactions.forEach((transaction) => {
    (transaction.journal || []).forEach((entry) => {
      totalDebits += Number(entry.debit || 0);
      totalCredits += Number(entry.credit || 0);

      if (!accountMap.has(entry.accountId)) {
        accountMap.set(entry.accountId, {
          accountId: entry.accountId,
          accountName: entry.accountName,
          accountType: entry.accountType,
          accountSubtype: entry.accountSubtype,
          debit: 0,
          credit: 0
        });
      }

      const account = accountMap.get(entry.accountId);
      account.debit += Number(entry.debit || 0);
      account.credit += Number(entry.credit || 0);
    });
  });

  const accounts = [...accountMap.values()].map((account) => {
    const normalDebit = ["asset", "expense"].includes(account.accountType);
    const balance = normalDebit
      ? account.debit - account.credit
      : account.credit - account.debit;

    return {
      ...account,
      balance
    };
  });

  return {
    accounts,
    totalDebits,
    totalCredits,
    balanced: Math.abs(totalDebits - totalCredits) < 0.01
  };
}

export function balanceSheet(transactions, asOfDate = null) {
  const filtered = asOfDate
    ? transactions.filter((tx) => {
        const date = parseLocalDate(tx.date);
        return date && date <= asOfDate;
      })
    : transactions;

  const ledger = deriveLedger(filtered);
  const assets = ledger.accounts
    .filter((account) => account.accountType === "asset")
    .reduce((sum, account) => sum + account.balance, 0);

  const liabilities = ledger.accounts
    .filter((account) => account.accountType === "liability")
    .reduce((sum, account) => sum + account.balance, 0);

  const equity = assets - liabilities;

  return {
    assets,
    liabilities,
    equity,
    balanced: Math.abs(assets - (liabilities + equity)) < 0.01,
    ledger
  };
}

export function incomeStatement(transactions, month) {
  const { start, end } = monthRange(month);
  const filtered = transactions.filter((tx) => {
    const date = parseLocalDate(tx.date);
    return date && date >= start && date <= end;
  });

  const ledger = deriveLedger(filtered);
  const income = ledger.accounts
    .filter((account) => account.accountType === "income")
    .reduce((sum, account) => sum + account.balance, 0);

  const expenses = ledger.accounts
    .filter((account) => account.accountType === "expense")
    .reduce((sum, account) => sum + account.balance, 0);

  return {
    income,
    expenses,
    netIncome: income - expenses,
    accounts: ledger.accounts
  };
}

export function cashFlowStatement(transactions, month, settings) {
  const { start, end } = monthRange(month);
  const filtered = transactions.filter((tx) => {
    const date = parseLocalDate(tx.date);
    return date && date >= start && date <= end;
  });

  let operatingInflow = 0;
  let operatingOutflow = 0;
  let investingOutflow = 0;
  let financingOutflow = 0;

  filtered.forEach((tx) => {
    if (tx.type === "income") {
      operatingInflow += Number(tx.amount || 0);
    }

    if (tx.type === "expense") {
      operatingOutflow += Number(tx.amount || 0);
    }

    if (tx.type === "investment") {
      investingOutflow += Number(tx.amount || 0);
    }

    if (tx.type === "credit_payment") {
      financingOutflow += Number(tx.amount || 0);
    }
  });

  return {
    operatingInflow,
    operatingOutflow,
    netOperating: operatingInflow - operatingOutflow,
    investingOutflow,
    financingOutflow,
    netCashFlow:
      operatingInflow -
      operatingOutflow -
      investingOutflow -
      financingOutflow
  };
}

export function trialBalance(transactions, asOfDate = null) {
  const filtered = asOfDate
    ? transactions.filter((tx) => {
        const date = parseLocalDate(tx.date);
        return date && date <= asOfDate;
      })
    : transactions;

  const ledger = deriveLedger(filtered);

  return {
    rows: ledger.accounts,
    totalDebits: ledger.totalDebits,
    totalCredits: ledger.totalCredits,
    balanced: ledger.balanced
  };
}
