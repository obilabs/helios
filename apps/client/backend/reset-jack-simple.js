const bcrypt = require('bcryptjs');

// Generate hash for simpler password
const password = 'Jack123';
const saltRounds = 12;

bcrypt.hash(password, saltRounds, (err, hash) => {
  if (err) {
    console.error('Error generating hash:', err);
    return;
  }

  console.log('Password:', password);
  console.log('Hash:', hash);
  console.log('\nSQL to update Jack\'s password:');
  console.log(`UPDATE organization_users SET password_hash = '${hash}' WHERE email = 'jack@gridworx.io';`);
});