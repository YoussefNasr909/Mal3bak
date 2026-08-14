SELECT id, email, role, "isActive" FROM "User" WHERE email LIKE '%demo%' OR email LIKE '%player%' LIMIT 10;
