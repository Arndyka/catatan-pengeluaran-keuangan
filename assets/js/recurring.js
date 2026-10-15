import {buildTransaction} from './accounting.js';
import {settleRecurringOccurrence} from './repository.js';
import {isSalaryRule,dueOccurrences,recurringMatches,validateSettlement} from './recurring-logic.js';
export {dueOccurrences} from './recurring-logic.js';
export async function confirmOccurrence(uid,rule,period,settings,{date,amount,existingTransactionId}={}) {
 if(existingTransactionId)return settleRecurringOccurrence(uid,rule.id,period,{existingTransactionId});
 const input={type:rule.type,date,amount:Number(amount),sourceAccountId:rule.sourceAccountId,destinationAccountId:rule.destinationAccountId||'',category:rule.category||'Lainnya',merchant:rule.name,description:`Transaksi rutin: ${rule.name}`,recurringRuleId:rule.id,recurringPeriod:period,origin:'recurring'};
 validateSettlement(rule,period,input);
 const transactionData=await buildTransaction(input,settings);
 return settleRecurringOccurrence(uid,rule.id,period,{transactionData});
}
export async function postDueRules(uid,rules,settings,transactions=[]) {
 let created=0,duplicate=0,needsReview=0;
 for(const rule of rules){
  for(const occurrence of dueOccurrences(rule)){
   if(isSalaryRule(rule)||recurringMatches(rule,occurrence.periodKey,transactions).length){needsReview++;continue;}
   const result=await confirmOccurrence(uid,rule,occurrence.periodKey,settings,{date:occurrence.date,amount:rule.amount});
   if(result.created)created++;else duplicate++;
  }
 }
 return {created,duplicate,needsReview};
}
