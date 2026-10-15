import test from 'node:test';
import assert from 'node:assert/strict';
import { creditCardSnapshot, billingCycle } from '../assets/js/credit-card.js';
import { DEFAULT_CREDIT_SETTINGS as settings } from '../assets/js/accounting.js';
import { formatDateLocal } from '../assets/js/utils.js';

const today = new Date(2026, 9, 15);
const purchase = (date, amount, installmentTenor = 1) => ({type:'credit_purchase', sourceAccountId:settings.cardAccountId,date,amount,installmentTenor});
const payment = (date, amount) => ({type:'credit_payment', destinationAccountId:settings.cardAccountId,date,amount});
const snapshot = (tx, overrides = {}) => creditCardSnapshot(tx,{...settings,...overrides},today);

test('fully paid completed installments never create another monthly bill', () => {
  const result = snapshot([purchase('2026-01-01',1200,3),payment('2026-03-15',1200)]);
  assert.equal(result.installmentThisMonth,0);
  assert.equal(result.estimatedBilled,0);
  assert.equal(result.billed,0);
  assert.equal(result.activeInstallments.length,0);
});
test('unpaid earlier statements carry into the current bill', () => {
  const result = snapshot([purchase('2026-08-01',1000),payment('2026-08-20',400)]);
  assert.equal(result.estimatedBilled,600);
  assert.equal(result.billed,600);
});
test('payment before or on statement date reduces estimated statement balance', () => {
  for(const date of ['2026-10-05','2026-10-07']) {
    const result = snapshot([purchase('2026-10-01',1000),payment(date,1000)]);
    assert.equal(result.billed,0);
    assert.equal(result.used,0);
  }
});
test('future purchases and payments cannot affect current balances', () => {
  const result = snapshot([purchase('2026-10-01',1000),payment('2026-11-01',1000),purchase('2026-12-01',2000,3)]);
  assert.equal(result.used,1000);
  assert.equal(result.billed,1000);
  assert.equal(result.paymentsAfterStatement,0);
  assert.equal(result.activeInstallments.length,0);
});
test('reference date controls cycles and ignores purchases beyond that day', () => {
  const result = creditCardSnapshot([purchase('2026-10-01',1000)],settings,new Date(2026,8,15));
  assert.equal(formatDateLocal(result.cycle.lastStatement),'2026-09-07');
  assert.equal(result.used,0);
});
test('stale official statement and due date do not override the current cycle', () => {
  const result = snapshot([purchase('2026-10-01',500)],{officialStatementAmount:1000,officialStatementDate:'2026-01-07',officialDueDate:'2026-01-27'});
  assert.equal(result.billed,500);
  assert.equal(formatDateLocal(result.cycle.dueDate),'2026-10-27');
  assert.equal(result.officialStatementApplied,false);
  assert.equal(result.officialStatementStale,true);
});
test('current official statement uses its amount and subtracts later payments', () => {
  const result = snapshot([purchase('2026-10-01',500),payment('2026-10-09',200)],{officialStatementAmount:700,officialStatementDate:'2026-10-07',officialDueDate:'2026-10-30'});
  assert.equal(result.billed,500);
  assert.equal(formatDateLocal(result.cycle.dueDate),'2026-10-30');
  assert.equal(result.reconciliationDifference,200);
  assert.equal(result.officialStatementApplied,true);
});
test('a dated official zero statement is honored', () => {
  const result = snapshot([purchase('2026-10-01',500)],{officialStatementAmount:0,officialStatementDate:'2026-10-07'});
  assert.equal(result.billed,0);
  assert.equal(result.officialStatementApplied,true);
});
test('journal card charges and refunds reconcile existing nonstandard transaction types', () => {
  const charge={type:'expense',date:'2026-10-01',amount:1000,journal:[{accountId:settings.cardAccountId,debit:0,credit:1000}]};
  const refund={type:'refund',date:'2026-10-09',amount:300,journal:[{accountId:settings.cardAccountId,debit:300,credit:0}]};
  const result=snapshot([charge,refund]);
  assert.equal(result.used,700);
  assert.equal(result.billed,700);
});
test('installments bill only elapsed schedules and carry unpaid billed principal', () => {
  const result=snapshot([purchase('2026-08-01',1200,4),payment('2026-08-15',300)]);
  assert.equal(result.used,900);
  assert.equal(result.estimatedBilled,600);
  assert.equal(result.installmentThisMonth,300);
  assert.equal(result.unbilled,300);
});
test('zero reminder and due offsets are respected and short months clamp statement day', () => {
  const result=billingCycle({...settings,statementDay:31,dueDays:0,reminderDays:0},new Date(2026,1,28));
  assert.equal(formatDateLocal(result.lastStatement),'2026-02-28');
  assert.equal(formatDateLocal(result.dueDate),'2026-02-28');
  assert.equal(formatDateLocal(result.reminderDate),'2026-02-28');
});
test('decimal repayments leave no phantom debt or minimum payment', () => {
  const result=snapshot([purchase('2026-10-01',0.1),purchase('2026-10-01',0.2),payment('2026-10-09',0.3)]);
  assert.equal(result.used,0);
  assert.equal(result.billed,0);
  assert.equal(result.minimumPayment,0);
});
test('installment schedules preserve cents and distribute the final remainder', () => {
  const result=snapshot([purchase('2026-09-01',100,3)]);
  assert.equal(result.estimatedBilled,66.67);
  assert.equal(result.installmentThisMonth,33.34);
  assert.equal(result.unbilled,33.33);
  assert.equal(result.activeInstallments[0].remainingPrincipal,33.33);
});
test('advance payments reduce unbilled exposure instead of showing an already paid charge', () => {
  const result=snapshot([purchase('2026-10-10',1000),payment('2026-10-12',1200)]);
  assert.equal(result.used,0);
  assert.equal(result.billed,0);
  assert.equal(result.unbilled,0);
  assert.equal(result.creditBalance,200);
});
test('paying the statement minimum satisfies it instead of demanding a new minimum', () => {
  const result=snapshot([purchase('2026-10-01',1000000),payment('2026-10-10',50000)]);
  assert.equal(result.billed,950000);
  assert.equal(result.minimumPayment,0);
});
test('partial payments reduce the original percentage minimum by the amount paid', () => {
  const result=snapshot([purchase('2026-10-01',2000000),payment('2026-10-10',30000)]);
  assert.equal(result.minimumPayment,70000);
});
test('merchant refunds reduce debt without pretending a qualifying minimum payment was made', () => {
  const refund={type:'refund',date:'2026-10-10',amount:50000,journal:[{accountId:settings.cardAccountId,debit:50000,credit:0}]};
  const result=snapshot([purchase('2026-10-01',1000000),refund]);
  assert.equal(result.billed,950000);
  assert.equal(result.minimumPayment,50000);
});
test('damaged journal entries do not crash the credit snapshot', () => {
  const damaged={date:'2026-10-01',journal:[null,{accountId:settings.cardAccountId,debit:0,credit:1000}]};
  assert.equal(snapshot([damaged]).used,1000);
});
