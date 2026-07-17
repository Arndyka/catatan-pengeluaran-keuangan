import {
  incomeStatement
} from "./accounting.js";
import {
  monthRange,
  parseLocalDate
} from "./utils.js";

const NEED_CATEGORIES = [
  "Makan",
  "Transportasi",
  "Tagihan",
  "Kesehatan",
  "Pendidikan"
];

export function budgetActual(transactions, month, item) {
  const { start, end } = monthRange(month);

  return transactions
    .filter((tx) => {
      const date = parseLocalDate(tx.date);
      return date && date >= start && date <= end;
    })
    .filter((tx) => {
      if (item.category === "needs") {
        return (
          ["expense", "credit_purchase"].includes(tx.type) &&
          NEED_CATEGORIES.includes(tx.category)
        );
      }

      if (item.category === "Investasi") {
        return tx.type === "investment";
      }

      return (
        ["expense", "credit_purchase"].includes(tx.type) &&
        tx.category === item.category
      );
    })
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
}

export function budgetTarget(transactions, month, item) {
  if (item.method === "nominal") {
    return Number(item.value || 0);
  }

  const statement = incomeStatement(transactions, month);
  return statement.income * Number(item.value || 0) / 100;
}

export function budgetAnalysis(transactions, month, plan) {
  const statement = incomeStatement(transactions, month);

  const rows = (plan.items || []).map((item) => {
    const target = budgetTarget(transactions, month, item);
    const actual = budgetActual(transactions, month, item);
    const remaining = target - actual;
    const usage = target > 0 ? actual / target * 100 : 0;

    return {
      ...item,
      target,
      actual,
      remaining,
      usage,
      overBudget: actual > target && target > 0
    };
  });

  const totalPercentage = (plan.items || [])
    .filter((item) => item.method === "percentage")
    .reduce((sum, item) => sum + Number(item.value || 0), 0);

  return {
    month,
    income: statement.income,
    rows,
    totalPercentage,
    percentageValid: totalPercentage <= 100
  };
}
