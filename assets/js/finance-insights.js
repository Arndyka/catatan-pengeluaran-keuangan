import { formatDateLocal } from './utils.js';

export function dailyAllowance(transactions, limit, today = formatDateLocal()) {
  const [year, month, day] = today.split('-').map(Number);
  const daysLeft = Math.max(1, new Date(year, month, 0).getDate() - day + 1);
  const expenses = transactions.filter(tx => ['expense', 'credit_purchase'].includes(tx.type) && tx.date?.startsWith(today.slice(0,7)) && tx.date <= today);
  const spent = expenses.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const todaySpent = expenses.filter(tx => tx.date === today).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const configured = Number.isFinite(Number(limit)) && Number(limit) > 0;
  const remaining = configured ? Number(limit) - spent : 0;
  return { spent, remaining, daysLeft, daily: Math.max(0, remaining) / daysLeft, todaySpent, configured };
}

export function validateGoal(input) {
  const name = String(input.name || '').trim().slice(0,80);
  const target = Number(input.target);
  const saved = Number(input.saved || 0);
  const dueDate = String(input.dueDate || '');
  const parsed = new Date(`${dueDate}T12:00:00`);
  if (!name) throw new Error('Beri nama untuk tujuanmu.');
  if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(saved) || saved < 0) throw new Error('Target harus lebih dari nol dan tabungan tidak boleh negatif.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(parsed.getTime()) || formatDateLocal(parsed) !== dueDate) throw new Error('Pilih tanggal target yang valid.');
  return { name, target, saved, dueDate, icon: ['home','plane','shield','book','sparkles','heart'].includes(input.icon) ? input.icon : 'sparkles' };
}

export function goalProgress(goal, today = formatDateLocal()) {
  const target = Number(goal.target) || 0;
  const saved = Math.max(0, Number(goal.saved) || 0);
  const [year, month] = today.split('-').map(Number);
  const [dueYear, dueMonth] = String(goal.dueDate || today).split('-').map(Number);
  const monthsLeft = Math.max(1, (dueYear-year)*12 + dueMonth-month+1);
  const remaining = Math.max(0, target-saved);
  return {percent:target > 0 ? Math.min(100,saved/target*100) : 0, remaining, monthly:remaining/monthsLeft, monthsLeft, complete:target>0 && saved>=target, overdue:remaining>0 && goal.dueDate<today};
}
