// Run with Node.js 24 from the target Expo app directory, before exporting/building.
const { loadEnvFile } = require('node:process');
const { isPublicSupabaseKey } = require('../src/ledgerly/native/public-config.ts');
const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';
for (const file of [`.env.${mode}.local`, '.env.local', `.env.${mode}`, '.env']) {
  try {
    loadEnvFile(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Public build configuration could not be loaded.');
  }
}
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
if (key && !isPublicSupabaseKey(key)) {
  console.error(
    'Build blocked: EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a publishable or anon key. Rejected values are not printed.',
  );
  process.exitCode = 1;
} else console.log('Native public-key configuration check passed.');
