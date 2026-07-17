import { db } from "./firebase.js";
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
  updateDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

function userCollection(uid, name) {
  return collection(db, "users", uid, name);
}

function userDoc(uid, collectionName, docId) {
  return doc(db, "users", uid, collectionName, docId);
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

    if (existing.exists()) {
      return {
        created: false,
        duplicate: true,
        id: existing.id
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

export async function deleteTransaction(uid, id) {
  await deleteDoc(userDoc(uid, "transactions", id));
}

export async function deleteAllTransactions(uid) {
  const snapshot = await getDocs(userCollection(uid, "transactions"));
  const docs = snapshot.docs;
  let deleted = 0;

  for (let index = 0; index < docs.length; index += 450) {
    const batch = writeBatch(db);
    docs.slice(index, index + 450).forEach((item) => {
      batch.delete(item.ref);
      deleted += 1;
    });
    await batch.commit();
  }

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
