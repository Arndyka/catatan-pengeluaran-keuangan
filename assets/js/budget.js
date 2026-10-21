import {
  incomeStatement, transactionExpense
} from "./accounting.js";
import {
  monthRange,
  formatDateLocal,
  parseLocalDate
} from "./utils.js";

const NEED_CATEGORIES = [
  "Makan",
  "Transportasi",
  "Tagihan",
  "Kesehatan",
  "Pendidikan"
];

export function validateBudgetItem(item,existing=[]){
 const next={...item,name:String(item.name||'').trim(),value:Number(item.value)};
 if(!next.name||!Number.isFinite(next.value)||next.value<0||!['nominal','percentage'].includes(next.method))throw new Error('Nama, metode, dan nilai budget harus valid.');
 if(next.method==='percentage'&&(next.value>100||existing.filter(i=>i.method==='percentage').reduce((n,i)=>n+Number(i.value),0)+next.value>100))throw new Error('Total alokasi persentase tidak boleh melebihi 100%.');
 const covered=category=>category==='needs'?NEED_CATEGORIES:[category];
 if(existing.some(i=>covered(i.category).some(c=>covered(next.category).includes(c))))throw new Error('Kategori ini sudah tercakup pada pos lain. Gunakan satu pos agar aktual tidak dihitung dua kali.');
 return next;
}

export function budgetActual(transactions, month, item) {
  const { start, end } = monthRange(month);

  return transactions
    .filter((tx) => {
      const date = parseLocalDate(tx.date);
      return date && date >= start && date <= end && tx.date<=formatDateLocal();
    })
    .filter((tx) => {
      if (item.category === "needs") {
        return (
          transactionExpense(tx)>0 &&
          NEED_CATEGORIES.includes(tx.category)
        );
      }

      if (item.category === "Investasi") {
        return tx.type === "investment";
      }

      return (
        transactionExpense(tx)>0 &&
        tx.category === item.category
      );
    })
    .reduce((sum, tx) => sum + (item.category === "Investasi" ? Number(tx.amount || 0) : transactionExpense(tx)), 0);
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
      overBudget: actual > target
    };
  });

  const overlap=(plan.items||[]).some((item,index)=>(plan.items||[]).slice(0,index).some(other=>(item.category==='needs'?NEED_CATEGORIES:[item.category]).some(c=>(other.category==='needs'?NEED_CATEGORIES:[other.category]).includes(c))));
  const totalPercentage = (plan.items || [])
    .filter((item) => item.method === "percentage")
    .reduce((sum, item) => sum + Number(item.value || 0), 0);

  return {
    month,
    income: statement.income,
    rows,
    totalPercentage,
    overlap,
    percentageValid: totalPercentage >= 0 && totalPercentage <= 100
  };
}
