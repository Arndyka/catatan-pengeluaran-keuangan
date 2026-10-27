import { hydrateIcons } from './icons.js';
import {setupMoneyInputs} from './money-input.js';
hydrateIcons();
setupMoneyInputs();
try { await import('./app.js?v=rupiah-input-20261027'); }
catch(error) {
 console.error('Spendly startup failed',error);
 const notice=document.getElementById('authMessage');
 notice.className='notice error';
 notice.textContent='Spendly belum dapat terhubung. Periksa koneksi lalu muat ulang, atau coba ruang demo.';
}
if('serviceWorker' in navigator && (location.protocol==='https:' || ['localhost','127.0.0.1'].includes(location.hostname))) {
 navigator.serviceWorker.register('./sw.js').catch(error=>console.warn('Offline shell unavailable',error));
}
