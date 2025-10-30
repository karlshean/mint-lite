#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

console.log('🔒 Mint-Lite Security Hardening Script\n');

// 1. Generate API key if not exists
const envPath = path.join(__dirname, '.env');
let envContent = fs.readFileSync(envPath, 'utf8');

if (!envContent.includes('API_KEY=')) {
  const apiKey = crypto.randomBytes(32).toString('hex');
  envContent += `\n# API Security\nAPI_KEY=${apiKey}\n`;
  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('✅ Generated new API_KEY');
  console.log(`   Key: ${apiKey.substring(0, 16)}...`);
} else {
  console.log('ℹ️  API_KEY already exists');
}

// 2. Generate encryption key for access tokens
if (!envContent.includes('ENCRYPTION_KEY=')) {
  const encryptionKey = crypto.randomBytes(32).toString('hex');
  envContent = fs.readFileSync(envPath, 'utf8'); // Re-read in case updated
  envContent += `ENCRYPTION_KEY=${encryptionKey}\n`;
  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('✅ Generated ENCRYPTION_KEY for database encryption');
} else {
  console.log('ℹ️  ENCRYPTION_KEY already exists');
}

// 3. Set host binding to localhost
if (!envContent.includes('HOST=')) {
  envContent = fs.readFileSync(envPath, 'utf8');
  envContent += `HOST=127.0.0.1\n`;
  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('✅ Set HOST=127.0.0.1 (localhost only)');
} else {
  console.log('ℹ️  HOST already configured');
}

// 4. Check file permissions (Windows doesn't support chmod the same way)
if (process.platform !== 'win32') {
  try {
    fs.chmodSync(envPath, 0o600);
    fs.chmodSync(path.join(__dirname, 'mint.db'), 0o600);
    console.log('✅ Set restrictive file permissions (600)');
  } catch (err) {
    console.log('⚠️  Could not set file permissions:', err.message);
  }
} else {
  console.log('ℹ️  Windows detected - file permissions managed by OS');
}

// 5. Create backup
const backupDir = path.join(__dirname, 'backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir);
}
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.copyFileSync(
  path.join(__dirname, 'mint.db'),
  path.join(backupDir, `mint-${timestamp}.db`)
);
console.log('✅ Created database backup');

console.log('\n📋 Next Steps:');
console.log('1. Run: npm install helmet @fastify/rate-limit @fastify/cors');
console.log('2. Restart the server');
console.log('3. Save your API_KEY from .env file');
console.log('4. Review SECURITY.md for additional hardening');
console.log('\n✨ Basic hardening complete!');
