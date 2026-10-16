import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {publicRelativePath} from './public-path.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
http.createServer(async(req,res)=>{
 try{
  const relative=publicRelativePath(req.url);
  if(!relative){res.writeHead(404);res.end('Not found');return;}
  const file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep)||file.includes(`${path.sep}.`)||(!['.html','.js','.css','.json','.webmanifest','.svg','.png','.woff2'].includes(path.extname(file)))){res.writeHead(404);res.end('Not found');return;}
  const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(body);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(4173,'127.0.0.1',()=>console.log('Spendly: http://127.0.0.1:4173 — Demo: http://127.0.0.1:4173/?demo=1'));
