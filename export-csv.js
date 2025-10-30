'use strict';

const fs = require('fs');
const { getDb } = require('./lib');

// Open database
const db = getDb();

// Get all transactions with account names
const transactions = db.prepare(`
  SELECT
    t.posted_at as date,
    t.name,
    t.merchant,
    t.amount,
    t.iso_currency as currency,
    t.ai_category as category,
    t.ai_confidence as confidence,
    t.raw_category,
    t.account_id,
    a.name as account_name,
    a.type as account_type,
    a.mask as account_mask
  FROM transactions t
  LEFT JOIN accounts a ON t.account_id = a.account_id
  ORDER BY t.posted_at DESC
`).all();

console.log(`Found ${transactions.length} transactions`);

// Create CSV header
const csvLines = [
  'Date,Account,Account Type,Last 4,Transaction Name,Merchant,Amount,Currency,Category,Confidence,Original Category'
];

// Add each transaction
for (const txn of transactions) {
  const escapeCsv = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  csvLines.push([
    escapeCsv(txn.date),
    escapeCsv(txn.account_name || 'Unknown'),
    escapeCsv(txn.account_type || ''),
    escapeCsv(txn.account_mask || ''),
    escapeCsv(txn.name),
    escapeCsv(txn.merchant),
    escapeCsv(txn.amount),
    escapeCsv(txn.currency),
    escapeCsv(txn.category),
    escapeCsv(txn.confidence),
    escapeCsv(txn.raw_category)
  ].join(','));
}

// Write to file
const csvContent = csvLines.join('\n');
const outputPath = 'transactions.csv';
fs.writeFileSync(outputPath, csvContent, 'utf8');

console.log(`✅ Exported to ${outputPath}`);
console.log(`Total transactions: ${transactions.length}`);
