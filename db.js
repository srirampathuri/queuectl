const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'queuectl',
  password: process.env.DB_PASSWORD || 'queuectl123',
  database: process.env.DB_NAME || 'queuectl',
});

async function testConnection() {
  try {
    await pool.query('SELECT NOW()');
    return true;
  } catch (err) {
    console.error('Database connection failed:', err.message);
    return false;
  }
}

async function runMigration() {
  const migrationPath = path.join(__dirname, 'migrations', '001_init.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  
  try {
    await pool.query(sql);
    console.log('Migration completed successfully');
  } catch (err) {
    // Table might already exist, that's ok
    if (err.message.includes('already exists')) {
      console.log('Table already exists, skipping migration');
    } else {
      throw err;
    }
  }
}

async function insertJob(job) {
  const query = `
    INSERT INTO jobs (id, command, state, max_retries, created_at, updated_at)
    VALUES ($1, $2, $3, $4, now(), now())
    RETURNING *
  `;
  const maxRetries = job.max_retries || 3;
  const result = await pool.query(query, [
    job.id,
    job.command,
    'pending',
    maxRetries
  ]);
  return result.rows[0];
}

// Uses FOR UPDATE SKIP LOCKED so workers don't pick the same job
async function getAndLockJob() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const selectQuery = `
      SELECT * FROM jobs 
      WHERE state = 'pending' 
      AND (next_run_at IS NULL OR next_run_at <= now())
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;
    
    const selectResult = await client.query(selectQuery);
    
    if (selectResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    
    const job = selectResult.rows[0];
    
    const updateQuery = `
      UPDATE jobs 
      SET state = 'processing', 
          attempts = attempts + 1,
          updated_at = now()
      WHERE id = $1
      RETURNING *
    `;
    
    const updateResult = await client.query(updateQuery, [job.id]);
    await client.query('COMMIT');
    
    return updateResult.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateJobState(jobId, state, error = null) {
  const query = `
    UPDATE jobs 
    SET state = $1, 
        updated_at = now(),
        last_error = $2
    WHERE id = $3
    RETURNING *
  `;
  const result = await pool.query(query, [state, error, jobId]);
  return result.rows[0];
}

// Exponential backoff: delay = base^attempts seconds
async function scheduleRetry(jobId, attempts, backoffBase) {
  const delaySeconds = Math.pow(backoffBase, attempts);
  // Schedule it for later
  const query = `
    UPDATE jobs 
    SET state = 'pending',
        next_run_at = now() + ($1::text || ' seconds')::interval,
        updated_at = now()
    WHERE id = $2
    RETURNING *
  `;
  const result = await pool.query(query, [delaySeconds, jobId]);
  return result.rows[0];
}

async function getJobCounts() {
  const query = `
    SELECT state, COUNT(*) as count
    FROM jobs
    GROUP BY state
  `;
  const result = await pool.query(query);
  return result.rows;
}

async function listJobs(state = null) {
  let query = 'SELECT * FROM jobs';
  let params = [];
  
  if (state) {
    query += ' WHERE state = $1';
    params.push(state);
  }
  
  query += ' ORDER BY created_at DESC';
  
  const result = await pool.query(query, params);
  return result.rows;
}

// Reset dead job back to pending
async function retryDeadJob(jobId) {
  const query = `
    UPDATE jobs 
    SET state = 'pending',
        attempts = 0,
        last_error = NULL,
        next_run_at = NULL,
        updated_at = now()
    WHERE id = $1 AND state = 'dead'
    RETURNING *
  `;
  const result = await pool.query(query, [jobId]);
  return result.rows[0];
}

async function close() {
  await pool.end();
}

module.exports = {
  pool,
  testConnection,
  runMigration,
  insertJob,
  getAndLockJob,
  updateJobState,
  scheduleRetry,
  getJobCounts,
  listJobs,
  retryDeadJob,
  close
};

