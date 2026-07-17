import {
  balanceSheet,
  cashFlowStatement,
  incomeStatement,
  trialBalance
} from "./accounting.js";

export function buildMonthlyReport(transactions, month, settings) {
  const income = incomeStatement(transactions, month);
  const cashFlow = cashFlowStatement(transactions, month, settings);

  const [year, monthNumber] = month.split("-").map(Number);
  const endDate = new Date(year, monthNumber, 0);

  const balance = balanceSheet(transactions, endDate);
  const trial = trialBalance(transactions, endDate);

  return {
    month,
    income,
    cashFlow,
    balance,
    trial
  };
}
