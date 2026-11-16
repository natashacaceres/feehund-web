// Convierte una copia semanal de R2 (semanal/AAAA-MM-DD.json) al formato de «wrangler kv bulk put», para devolverla a KV.
// Los valores siguen cifrados con DATA_KEY: hay que usar la MISMA DATA_KEY en la web para poder leerlos.
//   1. Descargar la copia: Cloudflare › R2 › feehund-copias › semanal/… › Download
//   2. node workers/baja-tarea/restaurar.mjs copia.json > para-kv.json
//   3. npx wrangler kv bulk put para-kv.json --namespace-id <id de feehund-baja>
import fs from 'node:fs';
const copia = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (copia.version !== 1) throw new Error('versión de copia desconocida');
process.stdout.write(JSON.stringify(copia.filas.map((f) => ({ key: f.k, value: f.v, metadata: f.meta })), null, 1) + '\n');
