import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL and key in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  const { data, error, count } = await supabase
    .from('stay_certified')
    .select('equipa,email,codigo_certificacao', { count: 'exact' })
    .limit(1);

  if (error) {
    console.error('Table check failed:', error.message);
    process.exit(1);
  }

  console.log('Table stay_certified is accessible.');
  console.log(`Current rows: ${count ?? 0}`);
  console.log(`Probe rows fetched: ${data?.length ?? 0}`);
}

run().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
