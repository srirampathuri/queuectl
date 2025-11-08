#!/usr/bin/env node

/**
 * Simple verification script to check if queuectl is set up correctly
 */

const db = require('./db');
const fs = require('fs');
const path = require('path');

async function verify() {
  console.log('Verifying queuectl setup...\n');
  
  let allGood = true;
  
  // Check 1: Database connection
  console.log('1. Checking database connection...');
  try {
    const connected = await db.testConnection();
    if (connected) {
      console.log('   [OK] Database connection successful\n');
    } else {
      console.log('   [FAIL] Cannot connect to database\n');
      allGood = false;
      return;
    }
  } catch (error) {
    console.log(`   [FAIL] Database connection failed: ${error.message}\n`);
    console.log('   [TIP] Make sure PostgreSQL is running and database is set up\n');
    allGood = false;
    return;
  }
  
  // Check 2: Database migration
  console.log('2. Checking database schema...');
  try {
    const result = await db.pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'jobs'
      );
    `);
    
    if (result.rows[0].exists) {
      console.log('   [OK] Jobs table exists\n');
    } else {
      console.log('   [WARN] Jobs table not found, running migration...');
      await db.runMigration();
      console.log('   [OK] Migration completed\n');
    }
  } catch (error) {
    console.log(`   [FAIL] Schema check failed: ${error.message}\n`);
    allGood = false;
  }
  
  // Check 3: Dependencies
  console.log('3. Checking dependencies...');
  try {
    require('commander');
    require('pg');
    console.log('   [OK] All dependencies installed\n');
  } catch (error) {
    console.log(`   [FAIL] Missing dependencies: ${error.message}\n`);
    console.log('   [TIP] Run: npm install\n');
    allGood = false;
  }
  
  // Check 4: Config file
  console.log('4. Checking config file...');
  const configPath = path.join(__dirname, 'config.json');
  if (fs.existsSync(configPath)) {
    console.log('   [OK] Config file exists\n');
  } else {
    console.log('   [WARN] Config file not found (will be created on first use)\n');
  }
  
  // Check 5: Test enqueue
  console.log('5. Testing job enqueue...');
  try {
    const testJob = {
      id: `verify-${Date.now()}`,
      command: 'echo "verification test"'
    };
    
    await db.insertJob(testJob);
    console.log('   [OK] Can enqueue jobs\n');
    
    // Clean up test job
    await db.pool.query('DELETE FROM jobs WHERE id = $1', [testJob.id]);
  } catch (error) {
    console.log(`   [FAIL] Cannot enqueue jobs: ${error.message}\n`);
    allGood = false;
  }
  
  // Summary
  console.log('==========================================');
  if (allGood) {
    console.log('[PASS] All checks passed! queuectl is ready to use.');
    console.log('\nNext steps:');
    console.log('  1. Enqueue a job: node queuectl.js enqueue \'{"id":"job1","command":"echo Hello"}\'');
    console.log('  2. Start a worker: node queuectl.js worker start --count 1');
    console.log('  3. Check status: node queuectl.js status');
  } else {
    console.log('[FAIL] Some checks failed. Please fix the issues above.');
  }
  console.log('==========================================\n');
  
  await db.close();
  process.exit(allGood ? 0 : 1);
}

verify().catch(error => {
  console.error('Verification error:', error);
  process.exit(1);
});

