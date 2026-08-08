UPDATE organization_users
SET password_hash = '$2a$12$9zKCJET0jYcKx1vafZkuRe/MjXt6JL7hHcgiP4OUHiPIRMZwZePG6'
WHERE email = 'jack@gridworx.io';

SELECT email, LEFT(password_hash, 60) as password_hash_start
FROM organization_users
WHERE email = 'jack@gridworx.io';