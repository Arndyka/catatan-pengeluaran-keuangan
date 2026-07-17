import {
  DEFAULT_CREDIT_SETTINGS,
  DEFAULT_SETTINGS
} from "./accounting.js";
import {
  getSettings,
  saveSettings
} from "./repository.js";
import { cleanText, slugText } from "./utils.js";

export async function loadUserSettings(uid) {
  const profile = await getSettings(uid, "profile", DEFAULT_SETTINGS);
  const credit = await getSettings(uid, "credit_card", DEFAULT_CREDIT_SETTINGS);

  profile.accounts = Array.isArray(profile.accounts)
    ? profile.accounts
    : DEFAULT_SETTINGS.accounts;

  return { profile, credit };
}

export async function saveProfileSettings(uid, settings) {
  await saveSettings(uid, "profile", settings);
}

export async function saveCreditSettings(uid, settings) {
  await saveSettings(uid, "credit_card", settings);
}

export function addAccount(settings, { name, type, subtype }) {
  const cleanName = cleanText(name);

  if (!cleanName) {
    throw new Error("Nama akun wajib diisi.");
  }

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
