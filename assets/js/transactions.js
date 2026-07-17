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
    income: "Pemasukan",
    expense: "Pengeluaran",
    transfer: "Transfer",
    credit_purchase: "Belanja Kartu Kredit",
    credit_payment: "Bayar Kartu Kredit",
    investment: "Investasi"
  };

  return labels[type] || type;
}
