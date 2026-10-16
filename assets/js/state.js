export const state = {
  user: null,
  transactions: [],
  recurringRules: [],
  budgetPlan: {
    month: "",
    items: []
  },
  settings: null,
  scannerKnowledge: null,
  creditSettings: null,
  paylater: null,
  hideBalances: true,
  unsubscribe: []
};

export function resetState() {
  state.user = null;
  state.transactions = [];
  state.recurringRules = [];
  state.budgetPlan = { month: "", items: [] };
  state.settings = null;
  state.scannerKnowledge = null;
  state.creditSettings = null;
  state.paylater = null;
  state.hideBalances = true;

  state.unsubscribe.forEach((fn) => {
    try {
      fn();
    } catch {
      // noop
    }
  });

  state.unsubscribe = [];
}
