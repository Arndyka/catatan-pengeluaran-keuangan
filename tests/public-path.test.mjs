import test from 'node:test';
import assert from 'node:assert/strict';
import {publicRelativePath} from '../tools/public-path.mjs';
test('development server serves only public application assets',()=>{
 for(const [url,expected] of [['/','index.html'],['/assets/js/app.js','assets/js/app.js'],['/manifest.webmanifest','manifest.webmanifest'],['/catatan-pengeluaran-keuangan/assets/icon.svg','assets/icon.svg']])assert.equal(publicRelativePath(url),expected);
 for(const url of ['/artifacts/account-session.private.json','/Estatement-mybca/example.pdf','/backend_nvidia/server.py','/.env','/assets/../artifacts/data.json','/assets/%2e%2e/artifacts/data.json','/assets/sample.private.json','/tests/sample.html','/assets/..%5cartifacts%5cdata.json'])assert.equal(publicRelativePath(url),null,url);
});
