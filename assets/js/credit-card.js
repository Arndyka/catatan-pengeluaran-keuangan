import { addDays, formatDateLocal, parseLocalDate } from './utils.js';

const cents = value => Math.round(Number(value || 0) * 100);
const money = value => cents(value) / 100;

function numberSetting(value, fallback, min = 0, max = Infinity) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

function validDate(value) {
  const date = parseLocalDate(value);
  return date && !Number.isNaN(date.getTime()) && formatDateLocal(date) === value ? date : null;
}

function safeDate(year, monthIndex, day) {
  return new Date(year, monthIndex, Math.min(day, new Date(year, monthIndex + 1, 0).getDate()));
}

function monthDifference(from, to) {
  return (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth();
}

export function billingCycle(settings, referenceDate = new Date()) {
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const statementDay = Math.trunc(numberSetting(settings.statementDay, 7, 1, 31));
  const thisMonth = safeDate(today.getFullYear(), today.getMonth(), statementDay);
  const lastStatement = today >= thisMonth ? thisMonth : safeDate(today.getFullYear(), today.getMonth() - 1, statementDay);
  const previousStatement = safeDate(lastStatement.getFullYear(), lastStatement.getMonth() - 1, statementDay);
  const nextStatement = safeDate(lastStatement.getFullYear(), lastStatement.getMonth() + 1, statementDay);
  const officialDate = validDate(settings.officialStatementDate);
  const officialAmount = Number(settings.officialStatementAmount);
  const officialStatementApplied = !!officialDate && officialDate.getTime() === lastStatement.getTime() &&
    Number.isFinite(officialAmount) && officialAmount >= 0;
  const officialDue = officialStatementApplied ? validDate(settings.officialDueDate) : null;
  const dueDate = officialDue && officialDue >= lastStatement
    ? officialDue : addDays(lastStatement, numberSetting(settings.dueDays, 20));
  return {
    today, previousStatement, lastStatement, nextStatement, dueDate,
    reminderDate: addDays(dueDate, -numberSetting(settings.reminderDays, 5)),
    officialStatementApplied,
    officialStatementStale: !!(settings.officialStatementDate || Number(settings.officialStatementAmount) > 0 || settings.officialDueDate) && !officialStatementApplied
  };
}

function statementDateForPurchase(date, settings) {
  const day = Math.trunc(numberSetting(settings.statementDay, 7, 1, 31));
  const sameMonth = safeDate(date.getFullYear(), date.getMonth(), day);
  return date <= sameMonth ? sameMonth : safeDate(date.getFullYear(), date.getMonth() + 1, day);
}

function installmentInfo(transaction, statementDate, settings) {
  const tenor = Math.max(1, Math.trunc(numberSetting(transaction.installmentTenor, 1, 1)));
  const amount = cents(transaction.amount);
  const monthly = Math.round(amount / tenor) / 100;
  const firstBill = statementDateForPurchase(validDate(transaction.date), settings);
  const elapsed = statementDate >= firstBill ? monthDifference(firstBill, statementDate) + 1 : 0;
  const billedCount = Math.min(tenor, Math.max(0, elapsed));
  const billedPrincipal = Math.round(amount * billedCount / tenor);
  const priorPrincipal = Math.round(amount * Math.max(0, billedCount - 1) / tenor);
  return {
    tenor, monthly, firstBill, billedCount,
    billedPrincipal: billedPrincipal / 100,
    installmentDue: elapsed >= 1 && elapsed <= tenor ? (billedPrincipal - priorPrincipal) / 100 : 0,
    remainingSchedules: tenor - billedCount,
    remainingPrincipal: (amount - billedPrincipal) / 100
  };
}

// Read the recorded journal first: legacy expenses, transfers and refunds may
// affect the card even if their transaction type is not a credit-card label.
function cardMovement(transaction, cardId) {
  if (Array.isArray(transaction.journal) && transaction.journal.length) {
    return transaction.journal.filter(entry => entry?.accountId === cardId)
      .reduce((sum, entry) => sum + cents(entry.credit) - cents(entry.debit), 0) / 100;
  }
  if (transaction.type === 'credit_purchase' && transaction.sourceAccountId === cardId) return Number(transaction.amount || 0);
  if (transaction.type === 'credit_payment' && transaction.destinationAccountId === cardId) return -Number(transaction.amount || 0);
  return 0;
}

export function creditCardSnapshot(transactions, settings, referenceDate = new Date()) {
  const cycle = billingCycle(settings, referenceDate);
  const movements = transactions.flatMap(transaction => {
    const date = validDate(transaction.date);
    if (!date || date > cycle.today) return [];
    const amount = cardMovement(transaction, settings.cardAccountId);
    return Number.isFinite(amount) && amount !== 0 ? [{transaction, date, amount}] : [];
  });
  const netBalance = movements.reduce((sum, movement) => sum + cents(movement.amount), 0) / 100;
  const used = Math.max(0, netBalance);
  const creditBalance = Math.max(0, -netBalance);
  const limit = numberSetting(settings.limit, 0);
  const available = Math.max(0, money(limit - used));
  let scheduledBilled = 0;
  let creditsBeforeStatement = 0;
  let paymentsAfterStatement = 0;
  let qualifyingPaymentsAfterStatement = 0;
  let unbilled = 0;
  let installmentThisMonth = 0;
  const activeInstallments = [];

  for (const {transaction, date, amount} of movements) {
    if (amount < 0) {
      if (date <= cycle.lastStatement) creditsBeforeStatement -= amount;
      else {
        paymentsAfterStatement -= amount;
        // Refunds reduce the balance but are not assumed to meet the issuer's
        // minimum-payment requirement. Count repayments or asset-funded debits.
        const funded = (Array.isArray(transaction.journal) ? transaction.journal : []).filter(entry => entry?.accountType === 'asset')
          .reduce((sum, entry) => sum + cents(entry.credit) - cents(entry.debit), 0) / 100;
        if (transaction.type === 'credit_payment') qualifyingPaymentsAfterStatement -= amount;
        else qualifyingPaymentsAfterStatement += Math.max(0, Math.min(-amount, funded));
      }
      continue;
    }
    if (transaction.type === 'credit_purchase' && Number(transaction.installmentTenor) > 1) {
      const installment = {...transaction, amount};
      const current = installmentInfo(installment, cycle.lastStatement, settings);
      const next = installmentInfo(installment, cycle.nextStatement, settings);
      scheduledBilled += current.billedPrincipal;
      installmentThisMonth += current.installmentDue;
      unbilled += next.billedPrincipal - current.billedPrincipal;
      if (current.remainingSchedules > 0) activeInstallments.push({...transaction, ...current});
    } else if (date <= cycle.lastStatement) {
      scheduledBilled += amount;
    } else {
      unbilled += amount;
    }
  }

  // Carry unpaid older bills and subtract pre-statement payments exactly once.
  const estimatedBilled = Math.max(0, money(scheduledBilled - creditsBeforeStatement));
  const official = numberSetting(settings.officialStatementAmount, 0);
  const statementAmount = cycle.officialStatementApplied ? official : estimatedBilled;
  const outstandingBill = Math.max(0, money(statementAmount - paymentsAfterStatement));
  // Credit left after settling billed charges also offsets the next charges.
  const unbilledExposure = Math.max(0, Math.min(money(unbilled), money(used - outstandingBill)));
  const statementMinimum = statementAmount > 0 ? money(Math.min(statementAmount, Math.max(
    numberSetting(settings.minimumPaymentFloor, 0),
    statementAmount * numberSetting(settings.minimumPaymentPercent, 0, 0, 100) / 100
  ))) : 0;
  const minimumPayment = Math.max(0, money(Math.min(outstandingBill, statementMinimum - qualifyingPaymentsAfterStatement)));

  return {
    cycle, limit, used, creditBalance, available, estimatedBilled,
    officialBilled: official, billed: outstandingBill, unbilled: unbilledExposure,
    installmentThisMonth: money(installmentThisMonth), activeInstallments, minimumPayment, paymentsAfterStatement: money(paymentsAfterStatement),
    statementMinimum, qualifyingPaymentsAfterStatement: money(qualifyingPaymentsAfterStatement),
    officialStatementApplied: cycle.officialStatementApplied,
    officialStatementStale: cycle.officialStatementStale,
    reconciliationDifference: cycle.officialStatementApplied ? money(official - estimatedBilled) : 0
  };
}
