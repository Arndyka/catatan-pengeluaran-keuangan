import {icon} from './icons.js';
const brands=[['blu',/\bblu\b|bca digital/i,'blu.png'],['krom',/krom/i,'krom.png'],['mandiri',/mandiri/i,'mandiri.png'],['bca',/\bbca\b|bank central asia/i,'bca.svg']];
export function accountBrand(account){
 const brand=brands.find(([,pattern])=>pattern.test(account.name||''));
 if(brand)return `<span class="bank-mark bank-logo"><img src="${new URL('../banks/'+brand[2],import.meta.url).href}" alt="Logo ${brand[0]==='bca'?'BCA':brand[0]}" width="96" height="32" loading="lazy"></span>`;
 const symbol=account.type==='liability'?'card':account.subtype==='investment'?'chart':account.subtype==='clearing'?'arrows':account.subtype==='bank'?'bank':account.subtype==='cash'?'cash':'wallet';
 return `<span class="bank-mark bank-symbol">${icon(symbol)}</span>`;
}
