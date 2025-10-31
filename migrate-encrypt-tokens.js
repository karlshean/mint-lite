'use strict';

/**
 * Migration script to encrypt existing plain-text access tokens
 * Usage: node migrate-encrypt-tokens.js
 */

const { getDb, encrypt, logCcc } = require('./lib');

async function migrateTokens() {
  const db = getDb();

  console.log('Starting token encryption migration...');

  // 1. Add access_token_enc column if it doesn't exist
  try {
    db.exec(`ALTER TABLE plaid_items ADD COLUMN access_token_enc TEXT`);
    console.log('Added access_token_enc column');
  } catch (err) {
    if (err.message.includes('duplicate column')) {
      console.log('access_token_enc column already exists');
    } else {
      throw err;
    }
  }

  // 2. Get all items with plain access tokens (not encrypted yet)
  const items = db.prepare(`
    SELECT id, item_id, access_token
    FROM plaid_items
    WHERE access_token_enc IS NULL AND access_token IS NOT NULL
  `).all();

  console.log(`Found ${items.length} items to encrypt`);

  if (items.length === 0) {
    console.log('No items to migrate. All tokens already encrypted.');
    logCcc({
      status: 'migration-complete',
      message: 'No tokens to encrypt (already encrypted)',
      timestamp: new Date().toISOString()
    });
    return;
  }

  // 3. Encrypt each token
  const updateStmt = db.prepare(`
    UPDATE plaid_items
    SET access_token_enc = ?
    WHERE id = ?
  `);

  let encrypted = 0;
  let errors = 0;

  for (const item of items) {
    try {
      // Skip if token looks already encrypted (contains colons from our format)
      if (item.access_token.includes(':') && item.access_token.split(':').length === 3) {
        console.log(`Skipping item ${item.id} (already encrypted format)`);
        continue;
      }

      const encryptedToken = encrypt(item.access_token);
      updateStmt.run(encryptedToken, item.id);
      encrypted++;
      console.log(`Encrypted token for item ${item.id} (${item.item_id})`);
    } catch (err) {
      console.error(`Failed to encrypt token for item ${item.id}:`, err.message);
      errors++;
    }
  }

  // 4. Verify encryption worked
  const verifyStmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM plaid_items
    WHERE access_token_enc IS NOT NULL
  `);
  const verifyResult = verifyStmt.get();

  console.log('\nMigration complete:');
  console.log(`- Total items: ${items.length}`);
  console.log(`- Encrypted: ${encrypted}`);
  console.log(`- Errors: ${errors}`);
  console.log(`- Total encrypted in DB: ${verifyResult.count}`);

  logCcc({
    status: 'migration-complete',
    total_items: items.length,
    encrypted: encrypted,
    errors: errors,
    total_encrypted_db: verifyResult.count,
    timestamp: new Date().toISOString()
  });

  if (encrypted > 0) {
    console.log('\nWARNING: Plain text tokens still in access_token column.');
    console.log('Consider removing them after verifying encrypted tokens work:');
    console.log('  UPDATE plaid_items SET access_token = NULL WHERE access_token_enc IS NOT NULL;');
  }

  return {
    total: items.length,
    encrypted,
    errors
  };
}

// Run migration
migrateTokens()
  .then(result => {
    console.log('\nMigration finished successfully');
    process.exit(0);
  })
  .catch(err => {
    console.error('Migration failed:', err);
    logCcc({
      status: 'migration-error',
      error: err.message,
      timestamp: new Date().toISOString()
    });
    process.exit(1);
  });
