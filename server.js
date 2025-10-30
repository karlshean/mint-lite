'use strict';

const fastify = require('fastify');
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const { loadEnv, getDb, logCcc, categorize } = require('./lib');

// Check for --init-only flag
const initOnly = process.argv.includes('--init-only');

// Load environment and initialize database
const env = loadEnv();
const db = getDb();

if (initOnly) {
  console.log('Database initialized. Exiting (--init-only mode).');
  logCcc({ status: 'init', message: 'Database initialized via --init-only', timestamp: new Date().toISOString() });
  process.exit(0);
}

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

// Initialize Fastify
const app = fastify({ logger: false });

/**
 * Health check
 */
app.get('/health', async (request, reply) => {
  return { ok: true };
});

/**
 * Create Plaid Link token
 */
app.get('/link-token', async (request, reply) => {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: 'user-1' },
      client_name: 'Mint Lite',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
    });

    logCcc({
      status: 'link-token-created',
      timestamp: new Date().toISOString(),
      link_token: response.data.link_token.substring(0, 20) + '...'
    });

    return { link_token: response.data.link_token };
  } catch (error) {
    logCcc({
      status: 'error',
      action: 'link-token-create',
      error: error.message,
      timestamp: new Date().toISOString()
    });
    reply.code(500).send({ error: error.message });
  }
});

/**
 * Exchange public token for access token
 */
app.post('/exchange-token', async (request, reply) => {
  try {
    const { public_token } = request.body;

    if (!public_token) {
      return reply.code(400).send({ error: 'Missing public_token in request body' });
    }

    const response = await plaidClient.itemPublicTokenExchange({
      public_token: public_token,
    });

    const accessToken = response.data.access_token;
    const itemId = response.data.item_id;

    // Store in database
    const stmt = db.prepare(`
      INSERT INTO plaid_items (user_id, item_id, access_token, created_at)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run('user-1', itemId, accessToken, new Date().toISOString());

    logCcc({
      status: 'token-exchanged',
      timestamp: new Date().toISOString(),
      item_id: itemId
    });

    return { success: true, item_id: itemId };
  } catch (error) {
    logCcc({
      status: 'error',
      action: 'exchange-token',
      error: error.message,
      timestamp: new Date().toISOString()
    });
    reply.code(500).send({ error: error.message });
  }
});

/**
 * Ingest transactions for all items
 */
async function ingestForAllItems(db) {
  const items = db.prepare('SELECT * FROM plaid_items').all();

  let totalFetched = 0;
  let totalInserted = 0;
  let totalCategorized = 0;

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  for (const item of items) {
    try {
      const response = await plaidClient.transactionsGet({
        access_token: item.access_token,
        start_date: startDate,
        end_date: endDate,
      });

      const transactions = response.data.transactions;
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
    } catch (error) {
      logCcc({
        status: 'error',
        action: 'ingest-item',
        item_id: item.item_id,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  return {
    total_items: items.length,
    total_fetched: totalFetched,
    total_inserted: totalInserted,
    total_categorized: totalCategorized
  };
}

/**
 * POST /ingest endpoint
 */
app.post('/ingest', async (request, reply) => {
  try {
    const result = await ingestForAllItems(db);

    logCcc({
      status: 'ingest-complete',
      timestamp: new Date().toISOString(),
      ...result
    });

    return result;
  } catch (error) {
    logCcc({
      status: 'error',
      action: 'ingest',
      error: error.message,
      timestamp: new Date().toISOString()
    });
    reply.code(500).send({ error: error.message });
  }
});

/**
 * Start server
 */
async function start() {
  try {
    await app.listen({ port: env.port, host: '0.0.0.0' });
    console.log(`Server running on http://localhost:${env.port}`);
    logCcc({
      status: 'server-started',
      timestamp: new Date().toISOString(),
      port: env.port
    });
  } catch (err) {
    console.error(err);
    logCcc({
      status: 'error',
      action: 'server-start',
      error: err.message,
      timestamp: new Date().toISOString()
    });
    process.exit(1);
  }
}

start();
