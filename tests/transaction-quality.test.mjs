import test from 'node:test';
import assert from 'node:assert/strict';
import {scanExclusionReason,suggestTransaction,stageAiSuggestions,manualRecurringMatches} from '../assets/js/transaction-quality.js';
const base={type:'expense',date:'2026-10-15',amount:50000,sourceAccountId:'bca',merchant:'Alfamrt',description:'Belanja',category:'Lainnya'};
test('noise, unpaid bills and failed/pending instructions are excluded; posted fees/refunds survive',()=>{
 for(const description of ['Saldo awal Rp100000','Total pengeluaran bulan ini','Promo cashback 50%','Tagihan belum dibayar','Status: pending','Transaksi gagal','Mandiri QRIS 15/10/2026 Nominal Rp 50000 Menunggu pembayaran'])assert.ok(scanExclusionReason({...base,description}));
 for(const description of ['Biaya administrasi','Bunga tabungan','Pajak bunga','Refund pembelian','Biaya transaksi gagal'])assert.equal(scanExclusionReason({...base,description}),'');
 assert.ok(scanExclusionReason({...base,record_kind:'advertisement'}));
});
test('typo corrections are suggestions and never mutate source data',()=>{
 const tx={...base};const s=suggestTransaction(tx,{today:'2026-10-15'});
 assert.equal(s.find(i=>i.field==='merchant')?.after,'Alfamart');assert.equal(tx.merchant,'Alfamrt');
});
test('unusual amounts warn without inventing a replacement',()=>{
 const tx={...base,merchant:'Kopi',amount:500000};
 const history=Array.from({length:5},()=>({...base,merchant:'Kopi',amount:25000}));
 const s=suggestTransaction(tx,{history,today:'2026-10-15'});
 assert.ok(s.some(i=>i.field==='amount'&&i.warning));assert.ok(s.filter(i=>i.field==='amount').every(i=>i.after===undefined));
});
test('AI changes are staged, restricted to allowed fields and valid accounts',()=>{
 const s=stageAiSuggestions(base,{amount:5,date:'2000-01-01',merchant:'Alfamart',sourceAccountId:'unknown',reason:'typo'},[{id:'bca'}]);
 assert.deepEqual(s.map(i=>i.field),['merchant']);assert.equal(base.amount,50000);
});

test('manual salary matching requests review without treating every income as salary',()=>{
 const salary={...base,type:'income',category:'Gaji',merchant:'Kantor',recurringRuleId:'salary-1'};
 assert.equal(manualRecurringMatches({...salary,recurringRuleId:'',date:'2026-10-10'},[salary]).length,1);
 assert.equal(manualRecurringMatches({...salary,amount:60000},[salary]).length,1);
 assert.equal(manualRecurringMatches({...salary,sourceAccountId:'other'},[salary]).length,0);
 assert.equal(manualRecurringMatches({...salary,date:'2026-11-15'},[salary]).length,0);
 assert.equal(manualRecurringMatches({...base,type:'income',amount:1000},[salary]).length,0);
});
test('manual entry also warns about salary received in the previous month for this period',()=>{
 const salary={...base,type:'income',date:'2026-10-30',category:'Gaji',merchant:'Kantor',recurringRuleId:'salary-1',sourceMeta:{recurringPeriod:'2026-11'}};
 assert.equal(manualRecurringMatches({...salary,recurringRuleId:'',sourceMeta:{},date:'2026-11-01'},[salary]).length,1);
 assert.equal(manualRecurringMatches({...salary,recurringRuleId:'',sourceMeta:{},date:'2026-12-01'},[salary]).length,0);
});
