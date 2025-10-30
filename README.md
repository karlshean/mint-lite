# mint-lite

A single-user, SQLite-based, Plaid-connected personal finance hub.

Built with WireGuard mentality: one config, one DB, small codebase.

## Features

- Single-user finance tracking (hardcoded `user-1`)
- Plaid integration for bank account connections
- SQLite database for local data storage
- Automatic transaction categorization
- Simple HTTP JSON API
- No front-end framework required

## Prerequisites

- Node.js 18+
- Plaid account with API credentials

## Installation

```bash
# Install dependencies
npm install
```

## Configuration

Edit `.env` and add your Plaid credentials:

```env
PORT=8080
DB_PATH=./mint.db
PLAID_ENV=production
PLAID_CLIENT_ID=your_actual_client_id
PLAID_SECRET=your_actual_secret
LOG_PATH=./ccc-results.txt
```

## Database Setup

Initialize the database:

```bash
npm run init
```

Or manually with SQLite:

```bash
sqlite3 mint.db < init.sql
```

## Usage

### Start the server

```bash
npm run dev
```

Server will run on `http://localhost:8080`

### API Endpoints

**Health Check**
```
GET /health
Response: { "ok": true }
```

**Create Link Token** (for Plaid Link)
```
GET /link-token
Response: { "link_token": "link-production-..." }
```

Use this link token in Plaid Link to connect a bank account.

**Exchange Public Token**
```
POST /exchange-token
Body: { "public_token": "public-production-..." }
Response: { "success": true, "item_id": "..." }
```

After completing Plaid Link flow, exchange the public token for an access token.

**Ingest Transactions**
```
POST /ingest
Response: {
  "total_items": 1,
  "total_fetched": 45,
  "total_inserted": 12,
  "total_categorized": 12
}
```

### CLI Ingest

Run transaction ingest from command line:

```bash
# Default: fetch last 30 days, log to ccc-results.txt
npm run ingest

# Fetch last 60 days
node ingest.js --days=60

# Skip logging
node ingest.js --no-log
```

## Transaction Categories

Automatic categorization includes:
- `Auto:Fuel` - Gas stations (Shell, Exxon, etc.)
- `Groceries` - Walmart, Publix, Costco, etc.
- `Dining:Coffee` - Starbucks, Dunkin, etc.
- `Dining:Restaurant` - Restaurants, pizza, etc.
- `Property:Materials` - Home Depot, Lowe's
- `Utilities` - Electric, water, internet, etc.
- `Uncategorized` - Everything else

## Results Logging

All operations log to `ccc-results.txt` with timestamps and status information.

## Database Schema

- **users** - Single user record (`user-1`)
- **plaid_items** - Connected Plaid bank accounts
- **accounts** - Individual bank accounts
- **transactions** - All financial transactions with categories

## Architecture

- `server.js` - Fastify HTTP server with Plaid routes
- `ingest.js` - CLI script for batch transaction fetching
- `lib.js` - Shared utilities (DB, logging, categorization)
- `init.sql` - Database schema
- `.env` - Configuration
- `mint.db` - SQLite database (created on first run)

## Security Notes

- Never commit `.env` or `mint.db` to version control
- Keep your Plaid credentials secure
- This is a single-user application - no authentication included
- Run behind a reverse proxy if exposing to network

## Troubleshooting

Check `ccc-results.txt` for detailed operation logs.

Ensure your Plaid credentials are valid for the selected environment (sandbox/development/production).

## License

MIT
