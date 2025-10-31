'use strict';

/**
 * Auto-daily script - runs the full daily workflow
 * Usage: node auto-daily.js
 *
 * Workflow:
 * 1. Run ingest.js (fetch new transactions from Plaid)
 * 2. Run export-csv.js (export to CSV)
 * 3. Run audit-log.js (log checksums and counts)
 * 4. Log summary to ccc-results.txt
 */

const { spawn } = require('child_process');
const { logCcc } = require('./lib');

/**
 * Execute a Node.js script and return result
 */
function runScript(scriptPath) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running: ${scriptPath}`);
    console.log('='.repeat(60));

    const startTime = Date.now();
    const child = spawn('node', [scriptPath], {
      stdio: 'inherit',
      cwd: __dirname
    });

    child.on('close', (code) => {
      const duration = Date.now() - startTime;

      if (code !== 0) {
        reject(new Error(`${scriptPath} exited with code ${code}`));
      } else {
        resolve({ script: scriptPath, duration, code });
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Main auto-daily workflow
 */
async function runAutoDaily() {
  console.log('Starting auto-daily workflow...');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const startTime = Date.now();
  const results = [];

  try {
    // Step 1: Ingest transactions
    const ingestResult = await runScript('./ingest.js');
    results.push(ingestResult);

    // Step 2: Export to CSV
    const exportResult = await runScript('./export-csv.js');
    results.push(exportResult);

    // Step 3: Audit log
    const auditResult = await runScript('./audit-log.js');
    results.push(auditResult);

    // Summary
    const totalDuration = Date.now() - startTime;

    const summary = {
      status: 'auto-daily-complete',
      timestamp: new Date().toISOString(),
      total_duration_ms: totalDuration,
      steps: results.map(r => ({
        script: r.script,
        duration_ms: r.duration,
        exit_code: r.code
      }))
    };

    console.log('\n' + '='.repeat(60));
    console.log('AUTO-DAILY WORKFLOW COMPLETE');
    console.log('='.repeat(60));
    console.log(`Total Duration: ${totalDuration}ms`);
    console.log('Steps:');
    results.forEach(r => {
      console.log(`  - ${r.script}: ${r.duration}ms (exit code: ${r.code})`);
    });
    console.log('='.repeat(60));

    // Log summary to ccc-results.txt
    logCcc(summary);
    console.log('\nSummary logged to ccc-results.txt');

    return summary;
  } catch (err) {
    const errorSummary = {
      status: 'auto-daily-error',
      timestamp: new Date().toISOString(),
      error: err.message,
      completed_steps: results.map(r => r.script)
    };

    console.error('\n' + '='.repeat(60));
    console.error('AUTO-DAILY WORKFLOW FAILED');
    console.error('='.repeat(60));
    console.error(`Error: ${err.message}`);
    console.error(`Completed steps: ${results.map(r => r.script).join(', ')}`);
    console.error('='.repeat(60));

    logCcc(errorSummary);

    throw err;
  }
}

// Run if executed directly
if (require.main === module) {
  runAutoDaily()
    .then(() => {
      console.log('\nAuto-daily workflow finished successfully');
      process.exit(0);
    })
    .catch(err => {
      console.error('\nAuto-daily workflow failed:', err.message);
      process.exit(1);
    });
}

module.exports = { runAutoDaily };
