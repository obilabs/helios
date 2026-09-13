/**
 * Load and validate the environment BEFORE any other backend module is
 * evaluated.
 *
 * ES module imports are hoisted: every `import` in index.ts is evaluated before
 * index.ts's own body runs. Modules such as lib/auth.ts read their secrets at
 * import time, so `.env` has to be loaded — and the secrets validated — by a
 * module that index.ts imports FIRST. That is this file.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateEnv } from './env-validation.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// .env lives at the repository root: src/config -> src -> backend -> root.
dotenv.config({ path: path.join(here, '..', '..', '..', '.env') });

try {
  validateEnv();
  console.log(`✅ Environment validated (${process.env['NODE_ENV'] || 'development'} mode)`);
} catch {
  console.error('❌ Environment validation failed. Exiting...');
  process.exit(1);
}
