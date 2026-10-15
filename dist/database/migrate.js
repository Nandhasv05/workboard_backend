// AUTHOR : NANDHAKUMAR
// DATE : 2026-10-07
import { readFileSync } from 'node:fs';
import { getConnection, poolEnd } from './pool.js';
const schema = readFileSync(new URL('./schema_mssql.sql', import.meta.url), 'utf8');
const batches = schema.split(/^\s*GO\s*$/im).map(batch => batch.trim()).filter(Boolean);
const pool = await getConnection();
for (const batch of batches)
    await pool.request().batch(batch);
console.log(`Applied ${batches.length} schema batches.`);
await poolEnd();
