import { db } from '../database/connection.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
    try {
        const migrationPath = path.join(__dirname, '../../database/migrations/062_create_onboarding_requests.sql');
        console.log(`Reading migration from: ${migrationPath}`);

        if (!fs.existsSync(migrationPath)) {
            console.error(`Migration file not found at ${migrationPath}`);
            process.exit(1);
        }

        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log('Executing migration...');
        await db.query(sql);

        console.log('✅ Migration 062_create_onboarding_requests.sql executed successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runMigration();
