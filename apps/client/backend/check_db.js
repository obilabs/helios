import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'helios_client',
    password: 'postgres',
    port: 5432,
});

async function check() {
    try {
        console.log("Checking Organizations...");
        const orgs = await pool.query('SELECT id, name, is_setup_complete FROM organizations');
        console.log(JSON.stringify(orgs.rows, null, 2));

        console.log("\nChecking Users...");
        const users = await pool.query('SELECT id, email, role, password_hash FROM organization_users');
        console.log(JSON.stringify(users.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

check();
