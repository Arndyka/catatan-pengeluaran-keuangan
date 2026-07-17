import {
  addDays,
  formatDateLocal,
  parseLocalDate
} from "./utils.js";

function safeDate(year, monthIndex, day) {
  const maxDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(day, maxDay));
}

function monthDifference(fromDate, toDate) {
  return (
    (toDate.getFullYear() - fromDate.getFullYear()) * 12 +
    (toDate.getMonth() - fromDate.getMonth())
  );
}

export function billingCycle(settings, referenceDate = new Date()) {
  const today = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );

  const statementDay = Number(settings.statementDay || 7);
  const thisMonthStatement = safeDate(
    today.getFullYear(),
    today.getMonth(),
    statementDay
  );

  const lastStatement =
    today >= thisMonthStatement
      ? thisMonthStatement
      : safeDate(today.getFullYear(), today.getMonth() - 1, statementDay);

  const previousStatement = safeDate(
    lastStatement.getFullYear(),
    lastStatement.getMonth() - 1,
    statementDay
  );

  const nextStatement = safeDate(
    lastStatement.getFullYear(),
    lastStatement.getMonth() + 1,
    statementDay
  );

  const dueDate = settings.officialDueDate
    ? parseLocalDate(settings.officialDueDate)
    : addDays(lastStatement, Number(settings.dueDays || 20));

  return {
    today,
    previousStatement,
    lastStatement,
    nextStatement,
    dueDate,
    reminderDate: addDays(
      dueDate,
      -Number(settings.reminderDays || 5)
    )
  };
}

function statementDateForPurchase(date, settings) {
  const sameMonth = safeDate(
    date.getFullYear(),
    date.getMonth(),
    Number(settings.statementDay || 7)
  );

  return date <= sameMonth
    ? sameMonth
    : safeDate(
        date.getFullYear(),
        date.getMonth() + 1,
        Number(settings.statementDay || 7)
      );
}

function installmentInfo(transaction, statementDate, settings) {
  const tenor = Math.max(1, Number(transaction.installmentTenor || 1));
  const monthly = Number(transaction.amount || 0) / tenor;
  const purchaseDate = parseLocalDate(transaction.date);
  const firstBill = statementDateForPurchase(purchaseDate, settings);

  let billedCount = 0;

  if (statementDate >= firstBill) {
    billedCount = Math.min(
      tenor,
      Math.max(0, monthDifference(firstBill, statementDate) + 1)
    );
  }

  return {
    tenor,
    monthly,
    firstBill,
    billedCount,
    remainingSchedules: Math.max(0, tenor - billedCount),
    remainingPrincipal: Math.max(
      0,
      Number(transaction.amount || 0) - monthly * billedCount
    )
  };
}

export function creditCardSnapshot(transactions, settings) {
  const cycle = billingCycle(settings);
  const cardId = settings.cardAccountId;

  const purchases = transactions.filter(
    (tx) =>
      tx.type === "credit_purchase" &&
      tx.sourceAccountId === cardId
  );

  const payments = transactions.filter(
    (tx) =>
      tx.type === "credit_payment" &&
      tx.destinationAccountId === cardId
  );

  const totalPurchases = purchases.reduce(
    (sum, tx) => sum + Number(tx.amount || 0),
    0
  );

  const totalPayments = payments.reduce(
    (sum, tx) => sum + Number(tx.amount || 0),
    0
  );

  const used = Math.max(0, totalPurchases - totalPayments);
  const limit = Number(settings.limit || 0);
  const available = Math.max(0, limit - used);

  let estimatedBilled = 0;
  let unbilled = 0;
  let installmentThisMonth = 0;
  const activeInstallments = [];

  purchases.forEach((tx) => {
    const purchaseDate = parseLocalDate(tx.date);
    if (!purchaseDate) return;

    const tenor = Number(tx.installmentTenor || 1);

    if (tenor > 1) {
      const current = installmentInfo(tx, cycle.lastStatement, settings);
      const next = installmentInfo(tx, cycle.nextStatement, settings);

      if (
        current.billedCount > 0 &&
        current.billedCount <= current.tenor
      ) {
        estimatedBilled += current.monthly;
        installmentThisMonth += current.monthly;
      }

      if (next.billedCount > current.billedCount) {
        unbilled += next.monthly;
      }

      if (current.remainingSchedules > 0) {
        activeInstallments.push({
          ...tx,
          ...current
        });
      }

      return;
    }

    if (
      purchaseDate > cycle.previousStatement &&
      purchaseDate <= cycle.lastStatement
    ) {
      estimatedBilled += Number(tx.amount || 0);
    } else if (
      purchaseDate > cycle.lastStatement &&
      purchaseDate <= cycle.nextStatement
    ) {
      unbilled += Number(tx.amount || 0);
    }
  });

  const official = Number(settings.officialStatementAmount || 0);
  const billed = official > 0 ? official : estimatedBilled;

  const paymentsAfterStatement = payments
    .filter((tx) => {
      const date = parseLocalDate(tx.date);
      return date && date > cycle.lastStatement;
    })
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

  const outstandingBill = Math.max(0, billed - paymentsAfterStatement);
  const minimumPayment = outstandingBill > 0
    ? Math.min(
        outstandingBill,
        Math.max(
          Number(settings.minimumPaymentFloor || 0),
          outstandingBill * Number(settings.minimumPaymentPercent || 0) / 100
        )
      )
    : 0;

  return {
    cycle,
    limit,
    used,
    available,
    estimatedBilled,
    officialBilled: official,
    billed: outstandingBill,
    unbilled,
    installmentThisMonth,
    activeInstallments,
    minimumPayment,
    paymentsAfterStatement,
    reconciliationDifference:
      official > 0 ? official - estimatedBilled : 0
  };
}
