import { db } from "./firebase.js";
import {settlePaylater} from './paylater-settlement.js';
import {reopenRecurringTransaction,isSalaryRule,isSettled,validateSettlement} from './recurring-logic.js';
import {updateStoredTransaction,transactionKeys} from './transaction-edit.js';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

function userCollection(uid, name) {
  return collection(db, "users", uid, name);
}

function userDoc(uid, collectionName, docId) {
  return doc(db, "users", uid, collectionName, docId);
}

export async function settlePaylaterBill(uid,billId,details){
 return runTransaction(db,async transaction=>{
  const read=async(collection,id)=>{const snapshot=await transaction.get(userDoc(uid,collection,id));return snapshot.exists()?{...snapshot.data(),...(collection==='transactions'?{id:snapshot.id}:{})}:null;};
  return settlePaylater({
   getPlan:()=>read('settings','paylater'),getProfile:()=>read('settings','profile'),getTransaction:id=>read('transactions',id),
   putTransaction:(tx,linked)=>transaction.set(userDoc(uid,'transactions',tx.id),{...tx,...(!linked?{createdAt:serverTimestamp()}:{}),updatedAt:serverTimestamp()}),
   putPlan:plan=>transaction.set(userDoc(uid,'settings','paylater'),{...plan,updatedAt:serverTimestamp()})
  },billId,details);
 });
}

export async function getSettings(uid, docId, fallback) {
  const snapshot = await getDoc(userDoc(uid, "settings", docId));

  if (!snapshot.exists()) {
    await setDoc(userDoc(uid, "settings", docId), {
      ...fallback,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return { ...fallback };
  }

  return {
    ...fallback,
    ...snapshot.data()
  };
}

export async function saveSettings(uid, docId, data) {
  await setDoc(
    userDoc(uid, "settings", docId),
    {
      ...data,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export function listenTransactions(uid, callback, errorCallback) {
  const q = query(userCollection(uid, "transactions"), orderBy("date", "desc"));

  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    },
    errorCallback
  );
}

export async function createTransactionPermanent(uid, transactionData) {
  const ref = userDoc(uid, "transactions", transactionData.fingerprint);

  return runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ref);
    const alias=await transaction.get(userDoc(uid,'settings',`transaction-key-${transactionData.fingerprint}`));

    if (existing.exists()||alias.exists()) {
      return {
        created: false,
        duplicate: true,
        id: existing.exists()?existing.id:alias.data().transactionId
      };
    }

    transaction.set(ref, {
      ...transactionData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    return {
      created: true,
      duplicate: false,
      id: ref.id
    };
  });
}

export async function updateTransaction(uid,id,patch,expected){
 return runTransaction(db,async transaction=>{
  const read=async(collection,id)=>{const s=await transaction.get(userDoc(uid,collection,id));return s.exists()?{...s.data(),...(collection==='transactions'||collection==='recurring_rules'?{id:s.id}:{})}:null;};
  return updateStoredTransaction({getTransaction:id=>read('transactions',id),getProfile:()=>read('settings','profile'),getPlan:()=>read('settings','paylater'),getRule:id=>read('recurring_rules',id),
   keyOwner:async key=>{const tx=await read('transactions',key),alias=await read('settings',`transaction-key-${key}`);return tx?.id||alias?.transactionId;},
   putTransaction:tx=>transaction.set(userDoc(uid,'transactions',id),{...tx,updatedAt:serverTimestamp()}),
   putKey:(key,owner)=>transaction.set(userDoc(uid,'settings',`transaction-key-${key}`),{transactionId:owner})
  },id,patch,expected);
 });
}

export async function deleteTransaction(uid, id) {
  const ref=userDoc(uid,'transactions',id);
  await runTransaction(db,async transaction=>{
    const snapshot=await transaction.get(ref);if(!snapshot.exists())return;
    const tx=snapshot.data();
    if(tx.recurringRuleId){
      const ruleRef=userDoc(uid,'recurring_rules',tx.recurringRuleId),rule=await transaction.get(ruleRef);
      if(rule.exists())transaction.update(ruleRef,{...reopenRecurringTransaction(rule.data(),tx,id),updatedAt:serverTimestamp()});
    }
    for(const key of transactionKeys({...tx,id}))if(key!==id)transaction.delete(userDoc(uid,'settings',`transaction-key-${key}`));
    transaction.delete(ref);
  });
}

export async function deleteAllTransactions(uid) {
  const snapshot = await getDocs(userCollection(uid, "transactions"));
  const docs = snapshot.docs;
  let deleted = 0;

  for(const item of docs){await deleteTransaction(uid,item.id);deleted+=1;}

  return deleted;
}

export function listenRecurringRules(uid, callback, errorCallback) {
  return onSnapshot(
    userCollection(uid, "recurring_rules"),
    (snapshot) => {
      callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    },
    errorCallback
  );
}

export async function saveRecurringRule(uid, rule) {
  const ref = doc(userCollection(uid, "recurring_rules"));

  await setDoc(ref, {
    ...rule,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return ref.id;
}

export async function updateRecurringRule(uid, id, data) {
  await updateDoc(userDoc(uid, "recurring_rules", id), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

export async function deleteRecurringRule(uid, id) {
  await deleteDoc(userDoc(uid, "recurring_rules", id));
}

export async function settleRecurringOccurrence(uid,ruleId,period,{transactionData,existingTransactionId}){
 const ruleRef=userDoc(uid,'recurring_rules',ruleId);
 return runTransaction(db,async transaction=>{
  const snapshot=await transaction.get(ruleRef);
  if(!snapshot.exists())throw new Error('Jadwal tidak ditemukan.');
  const rule={...snapshot.data(),id:ruleId};
  if(isSettled(rule,period))return {created:false,duplicate:true,id:rule.settledPeriods?.[period]||''};
  const id=existingTransactionId||transactionData?.id;
  if(!id)throw new Error('Pilih transaksi untuk periode ini.');
  const txRef=userDoc(uid,'transactions',id),txSnapshot=await transaction.get(txRef);
  if(existingTransactionId&&!txSnapshot.exists())throw new Error('Transaksi yang dipilih sudah tidak tersedia.');
  const data=txSnapshot.exists()?txSnapshot.data():transactionData;
  validateSettlement(rule,period,{...data,id});
  const sourceMeta={...data.sourceMeta,recurringPeriod:period,recurringKind:isSalaryRule(rule)?'salary':'standard'};
  if(txSnapshot.exists())transaction.update(txRef,{recurringRuleId:ruleId,sourceMeta,updatedAt:serverTimestamp()});
  else transaction.set(txRef,{...data,recurringRuleId:ruleId,sourceMeta,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  transaction.update(ruleRef,{settledPeriods:{...rule.settledPeriods,[period]:id},updatedAt:serverTimestamp()});
  return {created:!txSnapshot.exists(),duplicate:false,linked:txSnapshot.exists(),id};
 });
}

export async function getBudgetPlan(uid, month) {
  const snapshot = await getDoc(userDoc(uid, "budget_plans", month));

  if (!snapshot.exists()) {
    return {
      month,
      items: [
        {
          id: "needs-default",
          name: "Kebutuhan Pokok",
          category: "needs",
          method: "percentage",
          value: 70
        },
        {
          id: "investment-default",
          name: "Investasi / Tabungan",
          category: "Investasi",
          method: "percentage",
          value: 30
        }
      ]
    };
  }

  return {
    month,
    ...snapshot.data()
  };
}

export async function saveBudgetPlan(uid, month, data) {
  await setDoc(
    userDoc(uid, "budget_plans", month),
    {
      ...data,
      month,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function migrateLegacyCollections(uid, buildTransaction, settings) {
  const legacySpecs = [
    { collection: "incomes", type: "income" },
    { collection: "expenses", type: "expense" },
    { collection: "transfers", type: "transfer" }
  ];

  let created = 0;
  let duplicate = 0;

  for (const spec of legacySpecs) {
    const snapshot = await getDocs(userCollection(uid, spec.collection));

    for (const item of snapshot.docs) {
      const data = item.data();

      const sourceAccountId = settings.accounts.find((account) =>
        account.name.toLowerCase() === String(
          data.bankName || data.fromBankName || ""
        ).toLowerCase()
      )?.id || "asset-mandiri";

      const destinationAccountId = settings.accounts.find((account) =>
        account.name.toLowerCase() === String(
          data.toBankName || ""
        ).toLowerCase()
      )?.id || "";

      const transactionData = await buildTransaction(
        {
          type: spec.type,
          date: data.tanggal,
          amount: data.nominal,
          sourceAccountId,
          destinationAccountId,
          category:
            data.kategori ||
            data.sumber ||
            (spec.type === "income" ? "Pemasukan" : "Lainnya"),
          merchant: data.merchant || "",
          description: data.keterangan || "",
          origin: "legacy-migration"
        },
        settings
      );

      const result = await createTransactionPermanent(uid, transactionData);

      if (result.created) created += 1;
      else duplicate += 1;
    }
  }

  return { created, duplicate };
}
