const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const keyPath = path.resolve(process.env.USERPROFILE, 'Downloads', 'sistema-de-ventas-milam-firebase-adminsdk-fbsvc-1aa8f02017.json');
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

admin.initializeApp({ credential: admin.cert(serviceAccount) });

const db = admin.firestore();

async function backup() {
  const snapshot = await db.collection('products').get();
  const products = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;

  const outDir = path.resolve(__dirname, '..', 'backups');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, `productos-${dateStr}.json`);
  fs.writeFileSync(outPath, JSON.stringify(products, null, 2), 'utf8');

  console.log(`Backup completado: ${products.length} productos`);
  console.log(`Archivo: ${outPath}`);

  const tipos = {};
  products.forEach(p => { tipos[p.type] = (tipos[p.type] || 0) + 1; });
  console.log('Resumen por tipo:', JSON.stringify(tipos));
}

backup().catch(e => { console.error('Error:', e); process.exit(1); });
