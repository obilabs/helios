/**
 * Set a new password for an admin who cannot sign in.
 *
 * Usage (on the server, in the folder with docker-compose.yml):
 *   docker compose exec backend node dist/scripts/reset-admin-password.js [admin-email]
 *
 * The password is typed at a hidden prompt, twice. It is never passed on the
 * command line, never echoed and never logged; only its hash is stored. The
 * email is needed only when there is more than one active admin.
 */
import readline from 'node:readline';
import { db } from '../database/connection.js';
import { resetAdminPassword, MIN_PASSWORD_LENGTH } from '../lib/admin-password-reset.js';

function askHidden(label: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    (rl as any)._writeToOutput = (text: string) => {
      if (!muted) process.stdout.write(text);
    };
    rl.question(label, (answer) => {
      process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

async function main(): Promise<number> {
  if (!process.stdin.isTTY) {
    console.error('Run this from an interactive terminal (docker compose exec, without -T).');
    return 2;
  }

  const email = process.argv[2];
  console.log(`Nothing you type will be shown. At least ${MIN_PASSWORD_LENGTH} characters.`);
  const first = await askHidden('New password: ');
  const second = await askHidden('Type it again: ');
  if (first !== second) {
    console.error('The two did not match. Nothing was changed.');
    return 1;
  }

  const client = await db.getClient();
  try {
    const outcome = await resetAdminPassword(client, { email, password: first });
    (outcome.ok ? console.log : console.error)(outcome.message);
    return outcome.ok ? 0 : 1;
  } finally {
    client.release();
  }
}

main()
  .then(async (code) => {
    await db.close();
    process.exit(code);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
