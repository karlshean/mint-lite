'use strict';

const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const { loadEnv, getDb, logCcc, categorize } = require('./lib');

// Parse command-line arguments
const args = process.argv.slice(2);
const shouldLog = !args.includes('--no-log');
const daysArg = args.find(arg => arg.startsWith('--days='));
const lookbackDays = daysArg ? parseInt(daysArg.split('=')[1]) : 30;

// Load environment and database
const env = loadEnv();
const db = getDb();

// Initialize Plaid client
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

/**
 * Main ingest function
 */
async function ingest() {
  console.log(`Starting ingest with ${lookbackDays} days lookback...`);

  const items = db.prepare('SELECT * FROM plaid_items').all();

  if (items.length === 0) {
    console.log('No Plaid items found. Link an account first via /link-token and /exchange-token.');
    if (shouldLog) {
      logCcc({
        status: 'ingest-skipped',
        reason: 'no-items',
        timestamp: new Date().toISOString()
      });
    }
    return;
  }

  let totalFetched = 0;
  let totalInserted = 0;
  let totalCategorized = 0;
  const errors = [];

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  console.log(`Fetching transactions from ${startDate} to ${endDate}`);

  for (const item of items) {
    console.log(`Processing item: ${item.item_id}`);

    try {
      const response = await plaidClient.transactionsGet({
        access_token: item.access_token,
        start_date: startDate,
        end_date: endDate,
      });

      const transactions = response.data.transactions;
      console.log(`  Found ${transactions.length} transactions`);
      totalFetched += transactions.length;

      const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO transactions
        (user_id, item_id, account_id, transaction_id, name, merchant, amount, iso_currency, posted_at, raw_category, ai_category, ai_confidence, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const txn of transactions) {
        const cat = categorize(txn.name, txn.merchant_name, txn.category ? txn.category.join(',') : '');

        const result = insertStmt.run(
          'user-1',
          item.item_id,
          txn.account_id,
          txn.transaction_id,
          txn.name,
          txn.merchant_name || null,
          txn.amount,
          txn.iso_currency_code,
          txn.date,
          txn.category ? txn.category.join(',') : null,
          cat.category,
          cat.confidence,
          new Date().toISOString()
        );

        if (result.changes > 0) {
          totalInserted++;
          totalCategorized++;
        }
      }

      console.log(`  Inserted ${totalInserted} new transactions`);
    } catch (error) {
      console.error(`  Error processing item ${item.item_id}:`, error.message);
      errors.push({ item_id: item.item_id, error: error.message });
    }
  }

  // Summary
  const summary = {
    status: 'ingest-complete',
    timestamp: new Date().toISOString(),
    lookback_days: lookbackDays,
    total_items: items.length,
    total_transactions_fetched: totalFetched,
    inserted: totalInserted,
    categorized: totalCategorized,
    errors: errors.length > 0 ? errors : undefined
  };

  console.log('\n--- Ingest Summary ---');
  console.log(`Total items: ${summary.total_items}`);
  console.log(`Transactions fetched: ${summary.total_transactions_fetched}`);
  console.log(`New transactions inserted: ${summary.inserted}`);
  console.log(`Transactions categorized: ${summary.categorized}`);
  if (errors.length > 0) {
    console.log(`Errors: ${errors.length}`);
  }

  if (shouldLog) {
    logCcc(summary);
  }

  console.log('\nIngest complete!');
}

// Run
ingest()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    if (shouldLog) {
      logCcc({
        status: 'error',
        action: 'ingest',
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
    process.exit(1);
  });
