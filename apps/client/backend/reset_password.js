import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'helios_client',
    password: 'postgres',
    port: 5432,
});

async function reset() {
    try {
        console.log("Resetting password for mike@gridworx.io...");
        // We use pgcrypto's crypt function to generate a bcrypt hash from 'admin123'
        await pool.query(`
      UPDATE organization_users 
      SET password_hash = crypt('admin123', gen_salt('bf')),
          email_verified = true
      WHERE email = 'mike@gridworx.io'
    `);
        console.log("Password reset query executed.");

        const res = await pool.query("SELECT email, password_hash FROM organization_users WHERE email = 'mike@gridworx.io'");
        console.log("Updated user:", res.rows[0]);

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

reset();
