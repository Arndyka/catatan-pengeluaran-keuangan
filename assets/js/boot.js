import { hydrateIcons } from './icons.js';
hydrateIcons();
try { await import('./app.js?v=account-route-20261019-2'); }
catch(error) {
 console.error('Spendly startup failed',error);
 const notice=document.getElementById('authMessage');
 notice.className='notice error';
 notice.textContent='Spendly belum dapat terhubung. Periksa koneksi lalu muat ulang, atau coba ruang demo.';
}
if('serviceWorker' in navigator && (location.protocol==='https:' || ['localhost','127.0.0.1'].includes(location.hostname))) {
 navigator.serviceWorker.register('./sw.js').catch(error=>console.warn('Offline shell unavailable',error));
}
