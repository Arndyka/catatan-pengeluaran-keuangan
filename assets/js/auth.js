import { isDemo, DEMO_UID } from './demo.js';
const cloud = isDemo ? null : await import('./auth-cloud.js');
export function setupAuth(options) { if (cloud) cloud.setupAuth(options); }
export function observeAuth(callback) { if (cloud) return cloud.observeAuth(callback); queueMicrotask(()=>callback({uid:DEMO_UID,email:'demo@spendly.app',displayName:'Teman Spendly'})); return ()=>{}; }
export function logout() { if (cloud) return cloud.logout(); location.href = location.pathname; }
