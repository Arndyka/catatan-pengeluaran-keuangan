import {
  canonicalJson,
  cleanText,
  sha256,
  slugText,
  parseLocalDate,
  formatDateLocal,
  monthRange
} from "./utils.js";

export const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const cents = value => Math.round(Number(value || 0) * 100);
export const actualTransactions = (transactions, today = formatDateLocal()) => transactions.filter(tx => tx.date && tx.date <= today);

export const DEFAULT_ACCOUNTS = [
  { id: "asset-mandiri", name: "Mandiri", type: "asset", subtype: "bank", active: true },
  { id: "asset-bca", name: "BCA", type: "asset", subtype: "bank", active: true },
  { id: "asset-krom", name: "Krom", type: "asset", subtype: "bank", active: true },
  { id: "asset-blu", name: "blu", type: "asset", subtype: "bank", active: true },
  { id: "asset-cash", name: "Tunai", type: "asset", subtype: "cash", active: true },
  { id: "asset-dana", name: "DANA", type: "asset", subtype: "ewallet", active: true },
  { id: "asset-investment", name: "Investasi / Portofolio", type: "asset", subtype: "investment", active: true },
  {
    id: "asset-transfer-clearing",
    name: "Transfer Belum Dipetakan",
    type: "asset",
    subtype: "clearing",
    active: true,
    system: true
  },
  { id: "liability-mandiri-cc", name: "Mandiri Credit Card", type: "liability", subtype: "credit_card", active: true }
];

export const DEFAULT_SETTINGS = {
  accounts: DEFAULT_ACCOUNTS,
  hideBalanceDefault: true,
  currency: "IDR",
  accountingBasis: "hybrid-accrual",
  merchantCategoryRules: {},
  transferAccountRules: {},
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
    case "opening_balance": {
      const equity={id:'equity-opening',name:'Saldo awal',type:'equity',subtype:'opening'};
      return source.type==='asset'?[accountEntry(source,amount,0),accountEntry(equity,0,amount)]:[accountEntry(equity,amount,0),accountEntry(source,0,amount)];
    }
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

// Tolerate damaged persisted rows in read-only views, while validation still
// reports the original journal as invalid. Never rewrite the stored evidence.
export const journalEntries = journal => (Array.isArray(journal)?journal:[]).filter(item=>item&&typeof item.accountId==='string'&&[item.debit,item.credit].every(v=>v!==null&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0));
export function validateJournal(journal) {
  const entries=journalEntries(journal);
  const validEntries=Array.isArray(journal)&&journal.length>=2&&entries.length===journal.length&&entries.every(item=>['asset','liability','equity','income','expense'].includes(item.accountType));
  const debit = entries.reduce((sum, item) => sum + cents(item.debit), 0)/100;
  const credit = entries.reduce((sum, item) => sum + cents(item.credit), 0)/100;
  const difference = roundMoney(Math.abs(debit - credit));

  return {
    valid: validEntries && debit>0 && difference === 0,
    debit,
    credit,
    difference
  };
}

export async function buildTransaction(input, settings) {
  const date = input.date;
  const amount = roundMoney(input.amount || 0);

  if (!date || !Number.isSafeInteger(cents(amount)) || amount <= 0) {
    throw new Error("Tanggal dan nominal wajib diisi.");
  }

  const parsedDate = parseLocalDate(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !parsedDate || Number.isNaN(parsedDate.getTime()) || formatDateLocal(parsedDate) !== date) {
    throw new Error("Tanggal transaksi tidak valid.");
  }
  if (["transfer", "investment", "credit_payment"].includes(input.type) && input.sourceAccountId === input.destinationAccountId) {
    throw new Error("Akun sumber dan tujuan harus berbeda.");
  }
  const source=accountById(settings,input.sourceAccountId),target=accountById(settings,input.destinationAccountId);
  if(!source||source.active===false)throw new Error('Pilih rekening sumber/penerima yang aktif.');
  if(input.type==='opening_balance'){
    if(!['asset','liability'].includes(source.type)||source.subtype==='clearing')throw new Error('Saldo awal memerlukan akun aset atau kewajiban.');
  }else if(input.type==='credit_purchase'){
    if(source.type!=='liability'||source.subtype!=='credit_card')throw new Error('Pilih akun kartu kredit untuk belanja kartu.');
  }else if(source.type!=='asset')throw new Error('Pilih akun aset. Belanja kartu dicatat sebagai Belanja Kartu Kredit.');
  if(['transfer','investment','credit_payment'].includes(input.type)){
    if(!target||target.active===false)throw new Error('Pilih akun tujuan yang aktif.');
    if(input.type==='credit_payment'?(target.type!=='liability'||target.subtype!=='credit_card'):target.type!=='asset')throw new Error('Jenis akun tujuan tidak sesuai transaksi.');
    if(input.type==='investment'&&target.subtype!=='investment')throw new Error('Pembelian investasi harus menuju akun investasi. Untuk tabungan gunakan Transfer.');
  }
  const tenor=Number(input.installmentTenor||1);
  if(!Number.isInteger(tenor)||tenor<1||tenor>360)throw new Error('Tenor harus berupa jumlah bulan bulat 1–360.');

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

  let fingerprintPayload = {
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

  // Scan identity keeps distinct bank references/rows apart. Legacy/manual keys are unchanged.
  if(input.importIdentity) fingerprintPayload={importIdentity:String(input.importIdentity),type:normalized.type,date,amount,sourceAccountId:normalized.sourceAccountId,destinationAccountId:normalized.destinationAccountId};
  if(input.recurringRuleId) fingerprintPayload={recurringRuleId:input.recurringRuleId,period:input.recurringPeriod||date.slice(0,7)};
  if(input.type==='opening_balance')fingerprintPayload={openingBalance:source.id};

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

  let journalsValid=true;
  actualTransactions(transactions).forEach((transaction) => {
    if(!validateJournal(transaction.journal||[]).valid)journalsValid=false;
    journalEntries(transaction.journal).forEach((entry) => {
      totalDebits += cents(entry.debit);
      totalCredits += cents(entry.credit);

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
      account.debit += cents(entry.debit);
      account.credit += cents(entry.credit);
    });
  });

  const accounts = [...accountMap.values()].map((account) => {
    const normalDebit = ["asset", "expense"].includes(account.accountType);
    const balance = normalDebit
      ? account.debit - account.credit
      : account.credit - account.debit;

    return {
      ...account,
      debit:account.debit/100,
      credit:account.credit/100,
      balance:balance/100
    };
  });

  return {
    accounts,
    totalDebits:totalDebits/100,
    totalCredits:totalCredits/100,
    balanced: journalsValid && totalDebits === totalCredits
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

  const equity = roundMoney(assets - liabilities);

  return {
    assets:roundMoney(assets),
    liabilities:roundMoney(liabilities),
    equity,
    balanced: ledger.balanced,
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
    income:roundMoney(income),
    expenses:roundMoney(expenses),
    netIncome: roundMoney(income - expenses),
    accounts: ledger.accounts
  };
}

export function cashFlowStatement(transactions, month, settings) {
  const cashEntry=entry=>{
    const account=settings?.accounts?.find(a=>a.id===entry.accountId);
    return (account?.type||entry.accountType)==='asset'&&!['investment','clearing'].includes(account?.subtype||entry.accountSubtype);
  };
  let operatingInflow=0,operatingOutflow=0,investingInflow=0,investingOutflow=0,financingOutflow=0,otherNet=0,openingAdjustments=0;
  for(const tx of actualTransactions(transactions).filter(tx=>tx.date.startsWith(month))){
    const entries=journalEntries(tx.journal);
    const delta=entries.filter(cashEntry).reduce((n,j)=>n+cents(j.debit)-cents(j.credit),0)/100;
    if(tx.type==='opening_balance'){openingAdjustments+=delta;continue;}
    if(!delta)continue;
    const investment=entries.some(j=>(settings?.accounts?.find(a=>a.id===j.accountId)?.subtype||j.accountSubtype)==='investment');
    if(investment){if(delta>0)investingInflow+=delta;else investingOutflow-=delta;}
    else if(tx.type==='credit_payment')financingOutflow-=delta;
    else if(tx.type==='income'||tx.type==='expense'){if(delta>0)operatingInflow+=delta;else operatingOutflow-=delta;}
    else otherNet+=delta;
  }
  const values={operatingInflow,operatingOutflow,investingInflow,investingOutflow,financingOutflow,otherNet,openingAdjustments,netOperating:operatingInflow-operatingOutflow,netInvesting:investingInflow-investingOutflow,netCashFlow:operatingInflow-operatingOutflow+investingInflow-investingOutflow-financingOutflow+otherNet};
  return Object.fromEntries(Object.entries(values).map(([key,value])=>[key,roundMoney(value)]));
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
