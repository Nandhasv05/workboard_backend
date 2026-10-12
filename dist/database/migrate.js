// AUTHOR : NANDHAKUMAR
// DATE : 2026-10-07
import { readFileSync } from 'node:fs';
import { execute } from './pool.js';
const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
const statements = schema.split(/;\s*\n(?=CREATE|ALTER|DROP|CREATE INDEX)/).filter(Boolean);
for (const statement of statements)
    await execute(statement.trim() + ';');
console.log(`Applied ${statements.length} database statements.`);
