/**
 * Applies the SQL migration to the Supabase project via Management API.
 * Usage: node scripts/apply-migration.mjs <SUPABASE_ACCESS_TOKEN>
 *
 * Get your access token at: https://supabase.com/dashboard/account/tokens
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROJECT_REF = 'olnkshywagvxzolndtsg';
const MIGRATION_FILE = join(__dirname, '..', 'supabase', 'migrations', '20260808000001_social_and_vision_features.sql');

const accessToken = process.argv[2];
if (!accessToken) {
  console.error('?  Usage: node scripts/apply-migration.mjs <SUPABASE_ACCESS_TOKEN>');
  console.error('   Get your token at: https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

const sql = readFileSync(MIGRATION_FILE, 'utf-8');

console.log(`??  Applying migration to project ${PROJECT_REF}...`);
console.log(`??  SQL file: ${MIGRATION_FILE} (${sql.length} chars)`);

const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
});

const text = await response.text();

if (!response.ok) {
  console.error(`?  API error ${response.status}: ${text}`);
  process.exit(1);
}

console.log('?  Migration applied successfully!');
try {
  const json = JSON.parse(text);
  console.log(JSON.stringify(json, null, 2));
} catch {
  console.log(text);
}
