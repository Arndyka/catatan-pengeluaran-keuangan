import {
  buildTransaction
} from "./accounting.js";
import {
  createTransactionPermanent
} from "./repository.js";

export async function saveTransaction(uid, input, settings) {
  const transaction = await buildTransaction(input, settings);
  return createTransactionPermanent(uid, transaction);
}

export function transactionTypeLabel(type) {
  const labels = {
    opening_balance: "Saldo Awal",
    balance_adjustment: "Penyesuaian Saldo",
    income: "Pemasukan",
    expense: "Pengeluaran",
    transfer: "Transfer",
    credit_purchase: "Belanja Kredit / PayLater",
    credit_payment: "Bayar Kredit / PayLater",
    investment: "Investasi",
    investment_buy: "Beli Saham",
    investment_settlement: "Penyelesaian Saham",
    investment_sell: "Jual Saham",
    investment_valuation: "Penilaian Investasi",
    loan_disbursement: 'Pencairan Pinjaman'
  };

  return labels[type] || type;
}
