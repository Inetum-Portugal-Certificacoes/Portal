import 'dotenv/config';
import fs from 'node:fs/promises';

const accessToken = process.env.SUPABASE_ACCESS_TOKEN || '';
const supabaseUrl = process.env.SUPABASE_URL || '';

if (!accessToken || !supabaseUrl) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_URL in environment.');
  process.exit(1);
}

const projectRef = new URL(supabaseUrl).host.split('.')[0];

async function run() {
  const sql = await fs.readFile('init-table.sql', 'utf8');

  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  const body = await response.text();

  if (!response.ok) {
    console.error(`Failed to create table. Status: ${response.status}`);
    console.error(body);
    process.exit(1);
  }

  console.log('Table stay_certified created/validated successfully.');
}

run().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
