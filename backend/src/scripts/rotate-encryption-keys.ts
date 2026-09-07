/**
 * Rotate the at-rest encryption keys — re-encrypt every stored secret under new keys.
 *
 * WHY THIS EXISTS
 * ---------------
 * Until #81 an install could run for months on the placeholder keys shipped in
 * `.env.example`. #81 made the app refuse those keys in production (correctly —
 * they are published in source). But an install that upgrades across #81 then
 * cannot start, and if the operator "fixes" it by pasting a fresh key, every
 * secret already stored (the Google service-account key, the Microsoft client
 * secret, SMTP passwords, LLM API keys, initial passwords) is silently
 * undecryptable. An upgrade must never brick an install. This script is the
 * upgrade path: decrypt with the OLD keys, re-encrypt with the NEW ones, in one
 * transaction, verifying every value round-trips before committing.
 *
 * It mirrors each call site's key derivation EXACTLY (they differ — see below),
 * because it must read ciphertext those sites wrote and write ciphertext they
 * will read. Do not "simplify" the derivations here without changing the sites.
 *
 * Usage (inside the backend container, or locally with DB_* env set):
 *   OLD_ENCRYPTION_KEY=... NEW_ENCRYPTION_KEY=... \
 *   OLD_EMAIL_ENCRYPTION_KEY=... NEW_EMAIL_ENCRYPTION_KEY=... \
 *   [OLD_INITIAL_PASSWORD_KEY=... NEW_INITIAL_PASSWORD_KEY=...] \
 *   node dist/scripts/rotate-encryption-keys.js [--apply]
 *
 * Without --apply it is a DRY RUN: it decrypts everything with the old keys,
 * re-encrypts, verifies, and reports counts — writing nothing. With --apply it
 * commits. Run it BEFORE switching the container to the new keys.
 * INITIAL_PASSWORD_KEY falls back to ENCRYPTION_KEY (old and new), like the app.
 */
import crypto from 'crypto';
import { db } from '../database/connection.js';

type Cipher = { encrypt: (plain: string) => string; decrypt: (blob: string) => string };

/** encryption.service.ts: hex key of 32 bytes, else sha256(key). AES-256-CBC, iv:hex. */
function mainCipher(key: string): Cipher {
  let k = Buffer.from(key, 'hex');
  if (k.length !== 32) k = crypto.createHash('sha256').update(key).digest();
  return cbc(k);
}
/** email.service.ts: raw bytes of key padded/cut to 32 chars. */
function emailCipher(key: string): Cipher {
  return cbc(Buffer.from(key.padEnd(32, '0').slice(0, 32)));
}
/** initial-passwords.routes.ts: sha256(key), buffer-based update. Same wire format. */
function initialPasswordCipher(key: string): Cipher {
  return cbc(crypto.createHash('sha256').update(key).digest());
}
function cbc(k: Buffer): Cipher {
  return {
    encrypt(plain) {
      const iv = crypto.randomBytes(16);
      const c = crypto.createCipheriv('aes-256-cbc', k, iv);
      return iv.toString('hex') + ':' + Buffer.concat([c.update(plain, 'utf8'), c.final()]).toString('hex');
    },
    decrypt(blob) {
      const parts = blob.split(':');
      const iv = Buffer.from(parts.shift()!, 'hex');
      const d = crypto.createDecipheriv('aes-256-cbc', k, iv);
      return Buffer.concat([d.update(Buffer.from(parts.join(':'), 'hex')), d.final()]).toString('utf8');
    },
  };
}

interface Slot {
  table: string;
  column: string;
  cipher: 'main' | 'email' | 'initial';
}
/** Every encrypted column in the schema. Adding an encrypted column = adding a row here. */
const SLOTS: Slot[] = [
  { table: 'gw_credentials', column: 'service_account_key', cipher: 'main' },
  { table: 'ms_credentials', column: 'client_secret_encrypted', cipher: 'main' },
  { table: 'ms_credentials', column: 'access_token_encrypted', cipher: 'main' },
  { table: 'ai_config', column: 'primary_api_key_encrypted', cipher: 'main' },
  { table: 'ai_config', column: 'fallback_api_key_encrypted', cipher: 'main' },
  { table: 'smtp_settings', column: 'password_encrypted', cipher: 'email' },
  { table: 'user_initial_passwords', column: 'encrypted_password', cipher: 'initial' },
];

function need(name: string, fallback?: string): string {
  const v = process.env[name] || (fallback ? process.env[fallback] : undefined);
  if (!v) throw new Error(`${name} is required${fallback ? ` (or ${fallback})` : ''}`);
  return v;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const oldMain = need('OLD_ENCRYPTION_KEY');
  const newMain = need('NEW_ENCRYPTION_KEY');
  const oldEmail = need('OLD_EMAIL_ENCRYPTION_KEY');
  const newEmail = need('NEW_EMAIL_ENCRYPTION_KEY');
  const oldInitial = process.env.OLD_INITIAL_PASSWORD_KEY || oldMain;
  const newInitial = process.env.NEW_INITIAL_PASSWORD_KEY || newMain;
  if (newMain.trim().length < 32 || newEmail.trim().length < 32) {
    throw new Error('New keys must be >= 32 characters (openssl rand -hex 32)');
  }
  const ciphers = {
    main: { old: mainCipher(oldMain), new: mainCipher(newMain) },
    email: { old: emailCipher(oldEmail), new: emailCipher(newEmail) },
    initial: { old: initialPasswordCipher(oldInitial), new: initialPasswordCipher(newInitial) },
  };

  const client = await db.getClient();
  let total = 0;
  const report: string[] = [];
  try {
    await client.query('BEGIN');
    for (const slot of SLOTS) {
      const exists = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
        [slot.table, slot.column]
      );
      if (exists.rowCount === 0) {
        report.push(`${slot.table}.${slot.column}: column absent — skipped`);
        continue;
      }
      const rows = await client.query(
        `SELECT id, ${slot.column} AS v FROM ${slot.table} WHERE ${slot.column} IS NOT NULL AND ${slot.column} <> '' FOR UPDATE`
      );
      let n = 0;
      for (const row of rows.rows) {
        const { old: oc, new: nc } = ciphers[slot.cipher];
        let plain: string;
        try {
          plain = oc.decrypt(row.v);
        } catch (e: any) {
          throw new Error(`${slot.table}.${slot.column} id=${row.id}: does not decrypt with the OLD key (${e.message}). Aborting — nothing written.`);
        }
        const fresh = nc.encrypt(plain);
        if (nc.decrypt(fresh) !== plain) throw new Error(`${slot.table}.${slot.column} id=${row.id}: round-trip mismatch. Aborting.`);
        await client.query(`UPDATE ${slot.table} SET ${slot.column} = $1 WHERE id = $2`, [fresh, row.id]);
        n++;
      }
      total += n;
      report.push(`${slot.table}.${slot.column}: ${n} value(s) re-encrypted`);
    }
    if (apply) {
      await client.query('COMMIT');
    } else {
      await client.query('ROLLBACK');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch((): undefined => undefined);
    throw err;
  } finally {
    client.release();
  }
  for (const line of report) console.log('  ' + line);
  console.log(apply
    ? `\n✔ Rotated ${total} value(s). Now set the NEW keys in the environment and restart.`
    : `\nDRY RUN — ${total} value(s) would be re-encrypted. Re-run with --apply to commit.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('✗ ' + (err?.message || err));
    process.exit(1);
  });
