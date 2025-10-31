'use strict';

/**
 * Audit log script - compute checksums and log database integrity
 * Usage: node audit-log.js
 */

const fs = require('fs');
const crypto = require('crypto');
const { getDb, loadEnv, logCcc } = require('./lib');

/**
 * Compute SHA256 hash of a file
 */
function computeFileHash(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

/**
 * Get row counts from database
 */
function getRowCounts(db) {
  const counts = {};

  const tables = ['users', 'plaid_items', 'accounts', 'transactions'];

  for (const table of tables) {
    try {
      const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
      counts[table] = result.count;
    } catch (err) {
      counts[table] = 0;
    }
  }

  return counts;
}

/**
 * Main audit function
 */
async function runAudit() {
  const env = loadEnv();
  const db = getDb();

  console.log('Running database audit...');

  // Compute hashes
  const dbHash = computeFileHash(env.dbPath);
  const csvPath = './transactions.csv';
  const csvHash = computeFileHash(csvPath);

  // Get row counts
  const rowCounts = getRowCounts(db);

  // Build audit report
  const auditReport = {
    timestamp: new Date().toISOString(),
    database: {
      path: env.dbPath,
      sha256: dbHash,
      row_counts: rowCounts
    },
    csv: {
      path: csvPath,
      sha256: csvHash,
      exists: fs.existsSync(csvPath)
    }
  };

  console.log('\nAudit Report:');
  console.log('='.repeat(60));
  console.log(`Timestamp: ${auditReport.timestamp}`);
  console.log(`\nDatabase: ${env.dbPath}`);
  console.log(`  SHA256: ${dbHash}`);
  console.log('  Row Counts:');
  for (const [table, count] of Object.entries(rowCounts)) {
    console.log(`    ${table}: ${count}`);
  }
  console.log(`\nCSV: ${csvPath}`);
  console.log(`  Exists: ${auditReport.csv.exists}`);
  console.log(`  SHA256: ${csvHash || 'N/A'}`);
  console.log('='.repeat(60));

  // Log to ccc-results.txt
  logCcc({
    status: 'audit-complete',
    ...auditReport
  });

  console.log('\nAudit logged to ccc-results.txt');

  return auditReport;
}

// Run audit
if (require.main === module) {
  runAudit()
    .then(() => {
      console.log('\nAudit complete');
      process.exit(0);
    })
    .catch(err => {
      console.error('Audit failed:', err);
      logCcc({
        status: 'audit-error',
        error: err.message,
        timestamp: new Date().toISOString()
      });
      process.exit(1);
    });
}

module.exports = { runAudit };
