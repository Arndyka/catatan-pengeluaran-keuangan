/*
  PENTING: copy firebaseConfig lama kamu ke bagian ini sebelum upload.
*/
const firebaseConfig = {
  apiKey: "ISI_API_KEY_KAMU",
  authDomain: "ISI_PROJECT_ID.firebaseapp.com",
  projectId: "ISI_PROJECT_ID",
  storageBucket: "ISI_PROJECT_ID.appspot.com",
  messagingSenderId: "ISI_MESSAGING_SENDER_ID",
  appId: "ISI_APP_ID"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, addDoc, deleteDoc, doc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let authMode = "login", currentUser = null, unsubscribers = [];
let incomes = [], expenses = [], transfers = [];

const $ = (id) => document.getElementById(id);
const authScreen = $("authScreen"), appScreen = $("appScreen");
const loginTab = $("loginTab"), registerTab = $("registerTab"), authTitle = $("authTitle"), authSubtitle = $("authSubtitle"), authForm = $("authForm"), authEmail = $("authEmail"), authPassword = $("authPassword"), authButton = $("authButton"), authMessage = $("authMessage");
const userEmail = $("userEmail"), userInitial = $("userInitial"), logoutButton = $("logoutButton");
const incomeTab = $("incomeTab"), expenseTab = $("expenseTab"), transferTab = $("transferTab");
const incomeForm = $("incomeForm"), expenseForm = $("expenseForm"), transferForm = $("transferForm");
const incomeTanggal = $("incomeTanggal"), incomeBank = $("incomeBank"), incomeSource = $("incomeSource"), incomeNominal = $("incomeNominal"), incomeKeterangan = $("incomeKeterangan"), saveIncomeButton = $("saveIncomeButton");
const expenseTanggal = $("expenseTanggal"), expenseBank = $("expenseBank"), expenseKategori = $("expenseKategori"), expenseNominal = $("expenseNominal"), expenseKeterangan = $("expenseKeterangan"), saveExpenseButton = $("saveExpenseButton");
const transferTanggal = $("transferTanggal"), transferFromBank = $("transferFromBank"), transferToBank = $("transferToBank"), transferNominal = $("transferNominal"), transferKeterangan = $("transferKeterangan"), saveTransferButton = $("saveTransferButton");
const transactionMessage = $("transactionMessage");
const sisaUang = $("sisaUang"), totalPemasukan = $("totalPemasukan"), totalPengeluaran = $("totalPengeluaran"), jumlahBank = $("jumlahBank"), bankBalanceGrid = $("bankBalanceGrid"), tabelContainer = $("tabelContainer");
const filterTanggal = $("filterTanggal"), filterTipe = $("filterTipe"), filterBank = $("filterBank"), resetFilterButton = $("resetFilterButton"), downloadCsvButton = $("downloadCsvButton"), downloadExcelButton = $("downloadExcelButton");

const ALIASES = {
  mandiri: ["mandiri", "bank mandiri", "pt bank mandiri", "mandiri bank"],
  bca: ["bca", "bank bca", "bank central asia"],
  bri: ["bri", "bank bri", "bank rakyat indonesia"],
  bni: ["bni", "bank bni", "bank negara indonesia"],
  bsi: ["bsi", "bank bsi", "bank syariah indonesia"],
  cimb: ["cimb", "cimb niaga", "bank cimb", "bank cimb niaga"],
  dana: ["dana"], gopay: ["gopay", "go pay"], ovo: ["ovo"], shopeepay: ["shopeepay", "shopee pay"], cash: ["cash", "tunai", "uang tunai"]
};
const DISPLAY = { mandiri: "Mandiri", bca: "BCA", bri: "BRI", bni: "BNI", bsi: "BSI", cimb: "CIMB Niaga", dana: "DANA", gopay: "GoPay", ovo: "OVO", shopeepay: "ShopeePay", cash: "Tunai" };

function notice(el, type, text){ el.className = `notice ${type}`; el.textContent = text; }
function clean(v){ return String(v || "").trim().replace(/\s+/g, " "); }
function normBasic(v){ return clean(v).toLowerCase().replace(/[^\w\s]/g," ").replace(/\s+/g," ").trim(); }
function title(v){ return String(v || "").split(" ").filter(Boolean).map(w => w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" "); }
function normalizeBank(raw){
  const first = normBasic(raw);
  if(!first) return {key:"", display:""};
  for(const [key, aliases] of Object.entries(ALIASES)) if(aliases.includes(first)) return {key, display: DISPLAY[key] || title(key)};
  const stripped = first.replace(/\bbank\b/g,"").replace(/\bpt\b/g,"").replace(/\bindonesia\b/g,"").replace(/\s+/g," ").trim();
  for(const [key, aliases] of Object.entries(ALIASES)){
    const cleanAliases = aliases.map(a => normBasic(a).replace(/\bbank\b/g,"").trim());
    if(cleanAliases.includes(stripped)) return {key, display: DISPLAY[key] || title(key)};
  }
  return {key: stripped.replace(/\s+/g,"-"), display: title(stripped)};
}
function today(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function rupiah(v){ return "Rp " + Number(v || 0).toLocaleString("id-ID"); }
function dateID(v){ return new Date(v + "T00:00:00").toLocaleDateString("id-ID", {year:"numeric", month:"short", day:"numeric"}); }
function html(v){ return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
function csv(v){ return `"${String(v ?? "").replace(/"/g, '""')}"`; }
function err(code){ return {"auth/invalid-email":"Format email tidak valid.","auth/email-already-in-use":"Email sudah terdaftar.","auth/weak-password":"Password minimal 6 karakter.","auth/invalid-credential":"Email atau password salah.","permission-denied":"Akses database ditolak. Periksa Firestore Rules."}[code] || `Terjadi error: ${code}`; }

function switchAuth(mode){ authMode=mode; loginTab.classList.toggle("active",mode==="login"); registerTab.classList.toggle("active",mode==="register"); authTitle.textContent=mode==="login"?"Masuk ke akun":"Buat akun baru"; authSubtitle.textContent=mode==="login"?"Gunakan email dan password untuk mengakses budget tracker.":"Daftar akun agar data budget tersimpan online."; authButton.textContent=mode==="login"?"Login":"Register"; }
async function authSubmit(e){
  e.preventDefault(); const email=authEmail.value.trim(), pass=authPassword.value;
  if(!email) return notice(authMessage,"error","Email wajib diisi.");
  if(pass.length<6) return notice(authMessage,"error","Password minimal 6 karakter.");
  authButton.disabled=true; authButton.textContent="Memproses...";
  try{ authMode==="login" ? await signInWithEmailAndPassword(auth,email,pass) : await createUserWithEmailAndPassword(auth,email,pass); authEmail.value=""; authPassword.value=""; }
  catch(e){ notice(authMessage,"error",err(e.code)); }
  finally{ authButton.disabled=false; authButton.textContent=authMode==="login"?"Login":"Register"; }
}
function ref(name){ return collection(db,"users",currentUser.uid,name); }
function listen(name, cb){ const unsub=onSnapshot(query(ref(name), orderBy("tanggal","desc")), snap=>{ cb(snap.docs.map(d=>({id:d.id,...d.data()}))); render(); }, e=>notice(transactionMessage,"error",err(e.code))); unsubscribers.push(unsub); }
function listenData(){ unsubscribers.forEach(u=>u()); unsubscribers=[]; listen("incomes", x=>incomes=x); listen("expenses", x=>expenses=x); listen("transfers", x=>transfers=x); }
function inputMode(mode){ incomeTab.classList.toggle("active",mode==="income"); expenseTab.classList.toggle("active",mode==="expense"); transferTab.classList.toggle("active",mode==="transfer"); incomeForm.classList.toggle("hidden",mode!=="income"); expenseForm.classList.toggle("hidden",mode!=="expense"); transferForm.classList.toggle("hidden",mode!=="transfer"); }
async function saveIncome(e){ e.preventDefault(); const b=normalizeBank(incomeBank.value), n=Number(incomeNominal.value), sumber=clean(incomeSource.value); if(!incomeTanggal.value||!b.key||!sumber||n<=0) return notice(transactionMessage,"error","Tanggal, bank, sumber pemasukan, dan nominal wajib diisi."); saveIncomeButton.disabled=true; try{ await addDoc(ref("incomes"),{tanggal:incomeTanggal.value,bankKey:b.key,bankName:b.display,sumber,nominal:n,keterangan:clean(incomeKeterangan.value),createdAt:serverTimestamp()}); incomeSource.value=""; incomeNominal.value=""; incomeKeterangan.value=""; notice(transactionMessage,"success","Pemasukan berhasil disimpan."); }catch(e){notice(transactionMessage,"error",err(e.code));}finally{saveIncomeButton.disabled=false;} }
async function saveExpense(e){ e.preventDefault(); const b=normalizeBank(expenseBank.value), n=Number(expenseNominal.value), ket=clean(expenseKeterangan.value); if(!expenseTanggal.value||!b.key||n<=0||!ket) return notice(transactionMessage,"error","Tanggal, bank, nominal, dan keterangan wajib diisi."); saveExpenseButton.disabled=true; try{ await addDoc(ref("expenses"),{tanggal:expenseTanggal.value,bankKey:b.key,bankName:b.display,kategori:expenseKategori.value,nominal:n,keterangan:ket,createdAt:serverTimestamp()}); expenseNominal.value=""; expenseKeterangan.value=""; notice(transactionMessage,"success","Pengeluaran berhasil disimpan."); }catch(e){notice(transactionMessage,"error",err(e.code));}finally{saveExpenseButton.disabled=false;} }
async function saveTransfer(e){ e.preventDefault(); const from=normalizeBank(transferFromBank.value), to=normalizeBank(transferToBank.value), n=Number(transferNominal.value); if(!transferTanggal.value||!from.key||!to.key||n<=0) return notice(transactionMessage,"error","Tanggal, bank asal, bank tujuan, dan nominal wajib diisi."); if(from.key===to.key) return notice(transactionMessage,"error","Bank asal dan tujuan terbaca sama."); saveTransferButton.disabled=true; try{ await addDoc(ref("transfers"),{tanggal:transferTanggal.value,fromBankKey:from.key,fromBankName:from.display,toBankKey:to.key,toBankName:to.display,nominal:n,keterangan:clean(transferKeterangan.value),createdAt:serverTimestamp()}); transferNominal.value=""; transferKeterangan.value=""; notice(transactionMessage,"success","Transfer berhasil disimpan."); }catch(e){notice(transactionMessage,"error",err(e.code));}finally{saveTransferButton.disabled=false;} }
function balances(){ const m={}; const ensure=(k,n)=>{ if(!m[k]) m[k]={key:k,name:n,balance:0,income:0,expense:0,transferIn:0,transferOut:0}; };
  incomes.forEach(x=>{ const k=x.bankKey||normalizeBank(x.bankName).key||"unknown", n=x.bankName||title(k); ensure(k,n); m[k].balance+=Number(x.nominal||0); m[k].income+=Number(x.nominal||0); });
  expenses.forEach(x=>{ const nb=x.bankKey?{key:x.bankKey,display:x.bankName||title(x.bankKey.replaceAll("-"," "))}:normalizeBank(x.bankName||"Belum Dicatat"); const k=nb.key||"unknown", n=nb.display||"Belum Dicatat"; ensure(k,n); m[k].balance-=Number(x.nominal||0); m[k].expense+=Number(x.nominal||0); });
  transfers.forEach(x=>{ ensure(x.fromBankKey,x.fromBankName); ensure(x.toBankKey,x.toBankName); m[x.fromBankKey].balance-=Number(x.nominal||0); m[x.fromBankKey].transferOut+=Number(x.nominal||0); m[x.toBankKey].balance+=Number(x.nominal||0); m[x.toBankKey].transferIn+=Number(x.nominal||0); });
  return Object.values(m).sort((a,b)=>b.balance-a.balance);
}
function transactions(){ const rows=[...incomes.map(x=>({id:x.id,type:"income",tanggal:x.tanggal,bankKey:x.bankKey,bankName:x.bankName,title:x.sumber||"Pemasukan",nominal:Number(x.nominal||0),keterangan:x.keterangan||"",createdAt:x.createdAt?.seconds||0})),...expenses.map(x=>({id:x.id,type:"expense",tanggal:x.tanggal,bankKey:x.bankKey||normalizeBank(x.bankName||"Belum Dicatat").key,bankName:x.bankName||"Belum Dicatat",title:x.kategori||"Pengeluaran",nominal:Number(x.nominal||0),keterangan:x.keterangan||"",createdAt:x.createdAt?.seconds||0})),...transfers.map(x=>({id:x.id,type:"transfer",tanggal:x.tanggal,bankKey:`${x.fromBankKey}|${x.toBankKey}`,bankName:`${x.fromBankName} → ${x.toBankName}`,title:"Transfer",nominal:Number(x.nominal||0),keterangan:x.keterangan||"",createdAt:x.createdAt?.seconds||0}))]; return rows.filter(matchFilter).sort((a,b)=>a.tanggal===b.tanggal?b.createdAt-a.createdAt:b.tanggal.localeCompare(a.tanggal)); }
function matchFilter(x){ const tgl=filterTanggal.value, tipe=filterTipe.value, b=clean(filterBank.value), nb=normalizeBank(b); return (!tgl||x.tanggal===tgl) && (tipe==="Semua"||x.type===tipe) && (!b || String(x.bankKey||"").includes(nb.key) || String(x.bankName||"").toLowerCase().includes(b.toLowerCase())); }
function render(){ renderStats(); renderBanks(); renderTable(); }
function renderStats(){ const inc=incomes.reduce((s,x)=>s+Number(x.nominal||0),0), exp=expenses.reduce((s,x)=>s+Number(x.nominal||0),0), bs=balances(); totalPemasukan.textContent=rupiah(inc); totalPengeluaran.textContent=rupiah(exp); sisaUang.textContent=rupiah(inc-exp); jumlahBank.textContent=bs.length; }
function renderBanks(){ const bs=balances(); if(!bs.length){ bankBalanceGrid.innerHTML=`<div class="empty no-margin"><div>▣</div><h3>Belum ada saldo bank</h3><p>Input pemasukan terlebih dahulu.</p></div>`; return; } bankBalanceGrid.innerHTML=bs.map(b=>`<article class="bank-card"><div class="bank-top"><div><div class="bank-name">${html(b.name)}</div><div class="bank-key">Key: ${html(b.key)}</div></div><span class="bank-pill">Saldo</span></div><div class="bank-balance ${b.balance<0?"negative":""}">${rupiah(b.balance)}</div><div class="bank-detail">Masuk: ${rupiah(b.income)} · Keluar: ${rupiah(b.expense)}<br>Transfer in: ${rupiah(b.transferIn)} · Transfer out: ${rupiah(b.transferOut)}</div></article>`).join(""); }
function typeBadge(t){ return `<span class="badge ${t}">${{income:"Pemasukan",expense:"Pengeluaran",transfer:"Transfer"}[t]}</span>`; }
function amt(x){ if(x.type==="income") return `<span class="amount income">+ ${rupiah(x.nominal)}</span>`; if(x.type==="expense") return `<span class="amount expense">- ${rupiah(x.nominal)}</span>`; return `<span class="amount transfer">${rupiah(x.nominal)}</span>`; }
function renderTable(){ const rows=transactions(); if(!rows.length){ tabelContainer.innerHTML=`<div class="empty"><div>▦</div><h3>Belum ada transaksi</h3><p>Input pemasukan, pengeluaran, atau transfer.</p></div>`; return; } tabelContainer.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Tipe</th><th>Bank/Dompet</th><th>Kategori/Sumber</th><th>Nominal</th><th>Keterangan</th><th>Aksi</th></tr></thead><tbody>${rows.map(x=>`<tr><td class="date">${dateID(x.tanggal)}</td><td>${typeBadge(x.type)}</td><td><span class="badge bank">${html(x.bankName||"-")}</span></td><td>${html(x.title)}</td><td>${amt(x)}</td><td class="muted">${html(x.keterangan||"-")}</td><td><button class="delete" data-type="${x.type}" data-id="${x.id}">Hapus</button></td></tr>`).join("")}</tbody></table></div>`; document.querySelectorAll(".delete").forEach(btn=>btn.addEventListener("click",()=>deleteTx(btn.dataset.type,btn.dataset.id))); }
async function deleteTx(type,id){ if(!confirm("Yakin ingin menghapus transaksi ini?")) return; const name={income:"incomes",expense:"expenses",transfer:"transfers"}[type]; try{ await deleteDoc(doc(db,"users",currentUser.uid,name,id)); notice(transactionMessage,"success","Transaksi berhasil dihapus."); }catch(e){notice(transactionMessage,"error",err(e.code));} }
function resetFilters(){ filterTanggal.value=""; filterTipe.value="Semua"; filterBank.value=""; render(); }
function downloadCSV(){ const data=transactions(); if(!data.length) return alert("Belum ada data."); let out="Tanggal,Tipe,Bank,Kategori/Sumber,Nominal,Keterangan\n"; data.forEach(x=>out += [csv(x.tanggal),csv(x.type),csv(x.bankName),csv(x.title),x.nominal,csv(x.keterangan)].join(",")+"\n"); const blob=new Blob([out],{type:"text/csv;charset=utf-8;"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="budget_tracker.csv"; a.click(); URL.revokeObjectURL(url); }
function downloadExcel(){ const data=transactions(); if(!data.length) return alert("Belum ada data."); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(balances().map(b=>({Bank:b.name,Key:b.key,Saldo:b.balance,Pemasukan:b.income,Pengeluaran:b.expense,Transfer_Masuk:b.transferIn,Transfer_Keluar:b.transferOut}))),"Saldo Bank"); const rows=data.map(x=>({Tanggal:x.tanggal,Tipe:x.type,Bank:x.bankName,Kategori_Sumber:x.title,Nominal:x.nominal,Keterangan:x.keterangan})); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),"Semua Transaksi"); const grouped={}; rows.forEach(x=>{if(!grouped[x.Tanggal])grouped[x.Tanggal]=[]; grouped[x.Tanggal].push(x);}); Object.keys(grouped).sort().forEach(t=>XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(grouped[t]),t.replaceAll("-","_"))); XLSX.writeFile(wb,"budget_tracker.xlsx"); }
function showAuth(){ authScreen.classList.remove("hidden"); appScreen.classList.add("hidden"); incomes=[]; expenses=[]; transfers=[]; }
function showApp(u){ authScreen.classList.add("hidden"); appScreen.classList.remove("hidden"); userEmail.textContent=u.email; userInitial.textContent=u.email?u.email[0].toUpperCase():"U"; listenData(); }
onAuthStateChanged(auth,u=>{ if(u){ currentUser=u; showApp(u); } else { currentUser=null; unsubscribers.forEach(x=>x()); unsubscribers=[]; showAuth(); } });
loginTab.addEventListener("click",()=>switchAuth("login")); registerTab.addEventListener("click",()=>switchAuth("register")); authForm.addEventListener("submit",authSubmit);
incomeTab.addEventListener("click",()=>inputMode("income")); expenseTab.addEventListener("click",()=>inputMode("expense")); transferTab.addEventListener("click",()=>inputMode("transfer"));
incomeForm.addEventListener("submit",saveIncome); expenseForm.addEventListener("submit",saveExpense); transferForm.addEventListener("submit",saveTransfer);
logoutButton.addEventListener("click",()=>signOut(auth)); filterTanggal.addEventListener("change",render); filterTipe.addEventListener("change",render); filterBank.addEventListener("input",render); resetFilterButton.addEventListener("click",resetFilters); downloadCsvButton.addEventListener("click",downloadCSV); downloadExcelButton.addEventListener("click",downloadExcel);
incomeTanggal.value=expenseTanggal.value=transferTanggal.value=today();
