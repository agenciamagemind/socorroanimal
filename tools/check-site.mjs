import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=new URL('../site/',import.meta.url);
const html=fs.readFileSync(new URL('index.html',root),'utf8');
assert.ok(html.includes('lang=pt-BR'));
assert.equal(fs.readFileSync(new URL('CNAME',root),'utf8').trim(),'socorroanimal.online');
assert.ok(html.includes('https://lfvnnxdbphxbscnrrpoi.supabase.co/functions/v1/pix'));
for(const match of html.matchAll(/(?:src|href|poster)="((?:assets|videos)\/[^"]+)"/g))assert.ok(fs.existsSync(new URL(match[1],root)),match[1]);
function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,entry.name);if(entry.isDirectory())scan(f);else if(/\.(html|css|js)$/.test(f)){const text=fs.readFileSync(f,'utf8');assert.ok(!/\b(?:sk_live_|sk_test_|sb_secret_)[A-Za-z0-9]{16,}/.test(text),`Secret in ${f}`);}}}
scan(fileURLToPath(root));
console.log('Site estático válido; dependências locais presentes e nenhum segredo no conteúdo publicado.');
