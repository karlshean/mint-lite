'use strict';

const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const { loadEnv, getDb } = require('./lib');

const env = loadEnv();
const db = getDb();

const plaidConfig = new Configuration({
  basePath: PlaidEnvironments[env.plaidEnv],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': env.plaidClientId,
      'PLAID-SECRET': env.plaidSecret,
    },
  },
});
const plaidClient = new PlaidApi(plaidConfig);

async function fetchAccounts() {
  const items = db.prepare('SELECT * FROM plaid_items').all();

  console.log(`Fetching accounts for ${items.length} items...`);

  for (const item of items) {
    try {
      const response = await plaidClient.accountsGet({
        access_token: item.access_token,
      });

      const accounts = response.data.accounts;
      console.log(`\nItem ${item.item_id}: Found ${accounts.length} accounts`);

      const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO accounts
        (user_id, source, account_id, name, type, subtype, mask)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const account of accounts) {
        insertStmt.run(
          'user-1',
          'plaid',
          account.account_id,
          account.name,
          account.type,
          account.subtype,
          account.mask
        );
        console.log(`  - ${account.name} (${account.type} - ${account.subtype}) ...${account.mask || 'N/A'}`);
      }
    } catch (error) {
      console.error(`Error fetching accounts for item ${item.item_id}:`, error.message);
    }
  }

  const totalAccounts = db.prepare('SELECT COUNT(*) as count FROM accounts').get();
  console.log(`\n✅ Total accounts in database: ${totalAccounts.count}`);
}

fetchAccounts()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
