import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(resolve(homedir(), '.config', 'configstore', 'firebase-tools.json'), 'utf8'));
const token = cfg.tokens.access_token.replace(/\s+/g, '');

const BASE = 'https://firestore.googleapis.com/v1/projects/sistema-de-ventas-milam/databases/(default)/documents';

function req(url) {
  return new Promise((resolve, reject) => {
    const opts = { headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } };
    https.get(url, opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch (e) { reject(new Error('Parse fail (status ' + res.statusCode + '): ' + d.substring(0, 500))); }
      });
    }).on('error', reject);
  });
}

// Fetch all products
async function getAll(collection) {
  let all = [], pt = null;
  do {
    const url = BASE + '/' + collection + '?pageSize=500' + (pt ? '&pageToken=' + pt : '');
    const r = await req(url);
    if (r.status !== 200) { console.error('Error fetching:', JSON.stringify(r.body).substring(0, 300)); break; }
    if (r.body.documents) all.push(...r.body.documents);
    pt = r.body.nextPageToken;
  } while (pt);
  return all;
}

function extractVal(v) {
  if (!v) return null;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return parseInt(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.arrayValue) return (v.arrayValue.values || []).map(extractVal);
  if (v.mapValue) {
    const obj = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) obj[k] = extractVal(val);
    return obj;
  }
  return null;
}

function docToObj(doc) {
  return { id: doc.name.split('/').pop(), ...extractVal({ mapValue: { fields: doc.fields } }) };
}

const docs = await getAll('products');
const products = docs.map(docToObj);

const now = new Date();
const y = now.getFullYear();
const m = String(now.getMonth() + 1).padStart(2, '0');
const dd = String(now.getDate()).padStart(2, '0');
const h = String(now.getHours()).padStart(2, '0');
const min = String(now.getMinutes()).padStart(2, '0');
const dateStr = `${y}${m}${dd}_${h}${min}`;

const outDir = resolve(__dirname, '..', 'backups');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const outPath = resolve(outDir, `productos-${dateStr}.json`);
writeFileSync(outPath, JSON.stringify(products, null, 2), 'utf8');

console.log(`Backup completado: ${products.length} productos`);
console.log(`Archivo: ${outPath}`);

const tipos = {};
products.forEach(p => { tipos[p.type] = (tipos[p.type] || 0) + 1; });
console.log('Resumen por tipo:', JSON.stringify(tipos));
