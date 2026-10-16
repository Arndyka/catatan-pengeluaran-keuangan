export function publicRelativePath(url){
 try{
  let pathname=decodeURIComponent(new URL(url,'http://localhost').pathname).replace(/^\/catatan-pengeluaran-keuangan(?=\/|$)/,'');
  if(pathname==='/'||pathname==='')return 'index.html';
  if(pathname.includes('\\')||pathname.includes('\0')||pathname.split('/').some(part=>part.startsWith('.'))||/\.private\./i.test(pathname))return null;
  if(['/index.html','/offline.html','/manifest.webmanifest','/sw.js'].includes(pathname))return pathname.slice(1);
  return /^\/assets\/.+\.(js|css|json|svg|png|woff2)$/i.test(pathname)?pathname.slice(1):null;
 }catch{return null;}
}
