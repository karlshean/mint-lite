'use strict';

const fs = require('fs');
const path = require('path');
require('dotenv').config();
const Database = require('better-sqlite3');

/**
 * Load environment variables
 */
function loadEnv() {
  const required = ['PLAID_CLIENT_ID', 'PLAID_SECRET', 'PLAID_ENV'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  return {
    port: process.env.PORT || 8080,
    dbPath: process.env.DB_PATH || './mint.db',
    plaidEnv: process.env.PLAID_ENV || 'production',
    plaidClientId: process.env.PLAID_CLIENT_ID,
    plaidSecret: process.env.PLAID_SECRET,
    logPath: process.env.LOG_PATH || './ccc-results.txt'
  };
}

/**
 * Open SQLite database and initialize schema if needed
 */
function getDb() {
  const env = loadEnv();
  const db = new Database(env.dbPath);

  // Check if tables exist
  const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();

  if (!tableCheck) {
    // Initialize database with schema
    const initSql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
    db.exec(initSql);
    console.log('Database initialized with schema from init.sql');
  }

  return db;
}

/**
 * Log results to ccc-results.txt
 */
function logCcc(resultObj) {
  const env = loadEnv();
  const logPath = env.logPath;

  let output;
  if (typeof resultObj === 'string') {
    output = resultObj;
  } else {
    output = JSON.stringify(resultObj, null, 2);
  }

  const timestamp = new Date().toISOString();
  const entry = `\n[${timestamp}]\n${output}\n${'='.repeat(60)}\n`;

  fs.appendFileSync(logPath, entry, 'utf8');
  console.log('Logged to', logPath);
}

/**
 * Simple keyword-based transaction categorization
 */
function categorize(name, merchant, rawCategory) {
  const combined = `${name || ''} ${merchant || ''} ${rawCategory || ''}`.toLowerCase();

  // Fuel
  if (combined.match(/shell|exxon|chevron|bp |gas station|fuel|mobil/)) {
    return { category: 'Auto:Fuel', confidence: 0.9 };
  }

  // Groceries
  if (combined.match(/walmart|publix|costco|kroger|whole foods|trader joe|safeway|grocery/)) {
    return { category: 'Groceries', confidence: 0.9 };
  }

  // Coffee
  if (combined.match(/starbucks|dunkin|coffee/)) {
    return { category: 'Dining:Coffee', confidence: 0.9 };
  }

  // Home improvement
  if (combined.match(/home depot|lowes|hardware/)) {
    return { category: 'Property:Materials', confidence: 0.9 };
  }

  // Restaurants
  if (combined.match(/restaurant|dining|pizza|burger|chipotle|panera/)) {
    return { category: 'Dining:Restaurant', confidence: 0.9 };
  }

  // Utilities
  if (combined.match(/electric|water|utility|internet|cable|phone/)) {
    return { category: 'Utilities', confidence: 0.9 };
  }

  // Default
  return { category: 'Uncategorized', confidence: 0.3 };
}

module.exports = {
  loadEnv,
  getDb,
  logCcc,
  categorize
};
