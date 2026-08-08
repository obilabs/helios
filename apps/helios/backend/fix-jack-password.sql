-- Fix Jack's password hash
UPDATE organization_users
SET password_hash = '$2a$12$8MqfsMEFMZruP0Iu9asl4OC6EiYV9nYEWMhjIx30WBZDgTp7LO3c2'
WHERE email = 'jack@gridworx.io';