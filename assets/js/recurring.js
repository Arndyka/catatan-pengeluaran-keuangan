import {
  addDays,
  formatDateLocal,
  parseLocalDate
} from "./utils.js";
import {
  saveTransaction
} from "./transactions.js";
import {
  updateRecurringRule
} from "./repository.js";

function safeMonthlyDate(year, monthIndex, day) {
  const maxDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(day, maxDay));
}

export function dueOccurrences(rule, throughDate = new Date()) {
  if (rule.active === false) return [];

  const start = parseLocalDate(rule.startDate);
  const end = rule.endDate ? parseLocalDate(rule.endDate) : null;

  if (!start) return [];

  const occurrences = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(throughDate.getFullYear(), throughDate.getMonth(), 1);

  while (cursor <= last) {
    const occurrence = safeMonthlyDate(
      cursor.getFullYear(),
      cursor.getMonth(),
      Number(rule.dayOfMonth || 1)
    );

    const periodKey = formatDateLocal(occurrence).slice(0, 7);

    if (
      occurrence >= start &&
      occurrence <= throughDate &&
      (!end || occurrence <= end) &&
      rule.lastPostedPeriod !== periodKey
    ) {
      occurrences.push({
        periodKey,
        date: formatDateLocal(occurrence)
      });
    }

    cursor.setMonth(cursor.getMonth() + 1);
  }

  return occurrences;
}

export async function postDueRules(uid, rules, settings) {
  let created = 0;
  let duplicate = 0;

  for (const rule of rules) {
    const occurrences = dueOccurrences(rule);

    for (const occurrence of occurrences) {
      const result = await saveTransaction(
        uid,
        {
          type: rule.type,
          date: occurrence.date,
          amount: rule.amount,
          sourceAccountId: rule.sourceAccountId,
          destinationAccountId: rule.destinationAccountId || "",
          category: rule.category || "Lainnya",
          merchant: rule.name,
          description: `Transaksi berulang: ${rule.name}`,
          recurringRuleId: rule.id,
          origin: "recurring"
        },
        settings
      );

      if (result.created) created += 1;
      else duplicate += 1;

      await updateRecurringRule(uid, rule.id, {
        lastPostedPeriod: occurrence.periodKey
      });
    }
  }

  return { created, duplicate };
}
