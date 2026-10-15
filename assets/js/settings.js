import {
  DEFAULT_CREDIT_SETTINGS,
  DEFAULT_SETTINGS
} from "./accounting.js";
import {
  getSettings,
  saveSettings
} from "./repository.js";
import { cleanText, slugText } from "./utils.js";
import {validDate} from './recurring-logic.js';

export async function loadUserSettings(uid) {
  const profile = structuredClone(await getSettings(uid, "profile", DEFAULT_SETTINGS));
  const credit = {...DEFAULT_CREDIT_SETTINGS,...await getSettings(uid, "credit_card", DEFAULT_CREDIT_SETTINGS)};

  profile.accounts = Array.isArray(profile.accounts)
    ? profile.accounts
    : DEFAULT_SETTINGS.accounts;

  profile.merchantCategoryRules =
    profile.merchantCategoryRules || {};

  profile.transferAccountRules =
    profile.transferAccountRules || {};

  const requiredSystemAccounts =
    DEFAULT_SETTINGS.accounts.filter(
      (account) => account.system === true
    );

  let profileChanged = false;

  // Requested bank catalog addition; preserve any existing blu account and its ID.
  if(!profile.accounts.some(a=>a.id==='asset-blu'||/\bblu\b|bca digital/i.test(a.name||''))){
    profile.accounts.push({...DEFAULT_SETTINGS.accounts.find(a=>a.id==='asset-blu')});profileChanged=true;
  }

  requiredSystemAccounts.forEach((requiredAccount) => {
    const exists = profile.accounts.some(
      (account) => account.id === requiredAccount.id
    );

    if (!exists) {
      profile.accounts.push({ ...requiredAccount });
      profileChanged = true;
    }
  });

  if (profileChanged) {
    await saveSettings(uid, "profile", profile);
  }

  return { profile, credit };
}

export async function saveProfileSettings(uid, settings) {
  await saveSettings(uid, "profile", settings);
}

export async function saveCreditSettings(uid, settings) {
  validateCreditSettings(settings);
  await saveSettings(uid, "credit_card", settings);
}

export function validateCreditSettings(settings){
 for(const [key,min,max,whole] of [['limit',0,Number.MAX_SAFE_INTEGER/100],['statementDay',1,31,true],['dueDays',0,90,true],['reminderDays',0,90,true],['minimumPaymentPercent',0,100],['minimumPaymentFloor',0,Number.MAX_SAFE_INTEGER/100]]){
  const n=Number(settings[key]);if(!Number.isFinite(n)||n<min||n>max||(whole&&!Number.isInteger(n)))throw new Error('Periksa limit, tanggal cetak, jatuh tempo, dan minimum pembayaran kartu.');
 }
 if(settings.officialStatementDate){
  const d=new Date(settings.officialStatementDate+'T12:00:00Z');if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==settings.officialStatementDate)throw new Error('Tanggal cetak resmi tidak valid.');
  if(!Number.isFinite(Number(settings.officialStatementAmount))||Number(settings.officialStatementAmount)<0)throw new Error('Nominal tagihan resmi tidak valid.');
  if(settings.officialDueDate&&(!validDate(settings.officialDueDate)||settings.officialDueDate<settings.officialStatementDate))throw new Error('Jatuh tempo harus berupa tanggal valid dan tidak boleh sebelum tanggal cetak.');
 }else if(Number(settings.officialStatementAmount)>0||settings.officialDueDate)throw new Error('Isi tanggal cetak resmi agar tagihan digunakan pada siklus yang tepat.');
 return settings;
}

export function addAccount(settings, { name, type, subtype }) {
  const cleanName = cleanText(name);

  if (!cleanName) {
    throw new Error("Nama akun wajib diisi.");
  }
  if(!['asset','liability'].includes(type)||!['bank','cash','ewallet','investment','credit_card','other'].includes(subtype)||(type==='asset'&&subtype==='credit_card')||(type==='liability'&&subtype!=='credit_card'&&subtype!=='other'))throw new Error('Jenis akun dan kategori akun tidak sesuai. Kartu kredit memakai tipe kewajiban.');

  const id = `${type}-${slugText(cleanName)}`;
  const duplicate = settings.accounts.some((account) => account.id === id);

  if (duplicate) {
    throw new Error("Akun dengan nama dan tipe yang sama sudah ada.");
  }

  return {
    ...settings,
    accounts: [
      ...settings.accounts,
      {
        id,
        name: cleanName,
        type,
        subtype,
        active: true
      }
    ]
  };
}

export function toggleAccountActive(settings, accountId) {
  return {
    ...settings,
    accounts: settings.accounts.map((account) =>
      account.id === accountId
        ? { ...account, active: !account.active }
        : account
    )
  };
}

export function accountOptions(settings, {
  includeAssets = true,
  includeLiabilities = true,
  subtype = null
} = {}) {
  return settings.accounts
    .filter((account) => account.active !== false)
    .filter((account) => {
      if (!includeAssets && account.type === "asset") return false;
      if (!includeLiabilities && account.type === "liability") return false;
      if (subtype && account.subtype !== subtype) return false;
      return true;
    });
}
