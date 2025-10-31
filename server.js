'use strict';

const path = require('path');
const fs = require('fs');
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
 * Serve HTML page at root
 */
app.get('/', async (request, reply) => {
  const filePath = path.join(__dirname, 'public', 'link.html');
  if (fs.existsSync(filePath)) {
    const html = fs.readFileSync(filePath, 'utf8');
    return reply.type('text/html').send(html);
  }
  return { message: 'Mint Lite API - link.html not found' };
});

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
 * API Key authentication hook for /manual/* routes
 */
app.addHook('preHandler', async (request, reply) => {
  // Only enforce API key on /manual/* routes
  if (request.url.startsWith('/manual/')) {
    const apiKey = request.headers['x-api-key'];

    if (!apiKey || apiKey !== process.env.API_KEY) {
      reply.code(401).send({ error: 'Unauthorized - Invalid or missing API key' });
      return;
    }
  }
});

/**
 * GET /manual/accounts - List all accounts
 */
app.get('/manual/accounts', {
  schema: {
    response: {
      200: {
        type: 'object',
        properties: {
          accounts: { type: 'array' },
          total: { type: 'number' }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const accounts = db.prepare('SELECT * FROM accounts').all();

    logCcc({
      status: 'manual-accounts-fetched',
      timestamp: new Date().toISOString(),
      count: accounts.length
    });

    return { accounts, total: accounts.length };
  } catch (error) {
    logCcc({
      status: 'error',
      action: 'manual-accounts',
      error: error.message,
      timestamp: new Date().toISOString()
    });
    reply.code(500).send({ error: 'Internal server error' });
  }
});

/**
 * GET /manual/transactions - List transactions with optional filters
 */
app.get('/manual/transactions', {
  schema: {
    querystring: {
      type: 'object',
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 1000 },
        offset: { type: 'number', minimum: 0 }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          transactions: { type: 'array' },
          total: { type: 'number' },
          limit: { type: 'number' },
          offset: { type: 'number' }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const limit = request.query.limit || 100;
    const offset = request.query.offset || 0;

    const transactions = db.prepare(`
      SELECT * FROM transactions
      ORDER BY posted_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    const totalResult = db.prepare('SELECT COUNT(*) as count FROM transactions').get();

    logCcc({
      status: 'manual-transactions-fetched',
      timestamp: new Date().toISOString(),
      returned: transactions.length,
      total: totalResult.count
    });

    return {
      transactions,
      total: totalResult.count,
      limit,
      offset
    };
  } catch (error) {
    logCcc({
      status: 'error',
      action: 'manual-transactions',
      error: error.message,
      timestamp: new Date().toISOString()
    });
    reply.code(500).send({ error: 'Internal server error' });
  }
});

/**
 * POST /manual/ingest - Manually trigger transaction ingestion
 */
app.post('/manual/ingest', {
  schema: {
    response: {
      200: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          total_items: { type: 'number' },
          total_fetched: { type: 'number' },
          total_inserted: { type: 'number' },
          total_categorized: { type: 'number' }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const result = await ingestForAllItems(db);

    logCcc({
      status: 'manual-ingest-complete',
      timestamp: new Date().toISOString(),
      ...result
    });

    return { status: 'success', ...result };
  } catch (error) {
    logCcc({
      status: 'error',
      action: 'manual-ingest',
      error: error.message,
      timestamp: new Date().toISOString()
    });
    reply.code(500).send({ error: 'Internal server error' });
  }
});

/**
 * Start server with port guard
 */
async function start() {
  try {
    // Port guard - check if port is already in use
    const portInUse = await checkPortInUse(env.port);
    if (portInUse) {
      const errorMsg = `Port ${env.port} is already in use. Server not started.`;
      console.error(errorMsg);
      logCcc({
        status: 'error',
        action: 'server-start',
        error: errorMsg,
        timestamp: new Date().toISOString()
      });
      process.exit(1);
    }

    await app.listen({ port: env.port, host: process.env.HOST || '127.0.0.1' });
    console.log(`Server running on http://${process.env.HOST || '127.0.0.1'}:${env.port}`);
    logCcc({
      status: 'server-started',
      timestamp: new Date().toISOString(),
      port: env.port,
      host: process.env.HOST || '127.0.0.1'
    });
  } catch (err) {
    const errorMsg = err.code === 'EADDRINUSE'
      ? `Port ${env.port} is already in use`
      : err.message;

    console.error('Server start error:', errorMsg);
    logCcc({
      status: 'error',
      action: 'server-start',
      error: errorMsg,
      timestamp: new Date().toISOString()
    });
    process.exit(1);
  }
}

/**
 * Check if port is in use
 */
function checkPortInUse(port) {
  return new Promise((resolve) => {
    const net = require('net');
    const tester = net.createServer()
      .once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve(true);
        } else {
          resolve(false);
        }
      })
      .once('listening', () => {
        tester.once('close', () => {
          resolve(false);
        }).close();
      })
      .listen(port, process.env.HOST || '127.0.0.1');
  });
}

start();
