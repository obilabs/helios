const bcrypt = require('bcryptjs');

const password = 'Jack123!';
const hash = '$2a$12$9zKCJET0jYcKx1vafZkuRe/MjXt6JL7hHcgiP4OUHiPIRMZwZePG6';

bcrypt.compare(password, hash, (err, result) => {
  if (err) {
    console.error('Error comparing:', err);
    return;
  }

  console.log('Password:', password);
  console.log('Hash:', hash);
  console.log('Match:', result);
});