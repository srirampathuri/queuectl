# queuectl

A simple CLI tool for managing background job queues. Built with Node.js and PostgreSQL. Handles job execution, retries with exponential backoff, and has a dead letter queue for failed jobs.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Setup PostgreSQL** (see Setup section below for details)
   - Create database: `CREATE DATABASE queuectl;`
   - Create user: `CREATE USER queuectl WITH PASSWORD 'queuectl123';`

3. **Verify setup:**
   ```bash
   node verify.js
   ```

4. **Test it:**
   ```bash
   # Enqueue a job
   node queuectl.js enqueue '{"id":"test1","command":"echo Hello World"}'
   
   # Start a worker (in a new terminal)
   node queuectl.js worker start --count 1
   
   # Check status
   node queuectl.js status
   ```

For detailed instructions, see [QUICKSTART.md](QUICKSTART.md)

## Features

- Enqueue jobs with commands to execute
- Worker processes that pick up and execute jobs
- Automatic retry with exponential backoff
- Dead Letter Queue (DLQ) for failed jobs
- Job output logging to local files
- Atomic job selection using PostgreSQL's `FOR UPDATE SKIP LOCKED`
- Graceful worker shutdown

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL installed and running locally
- npm

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Local PostgreSQL

1. **Make sure PostgreSQL is installed and running**

   On Windows:
   - Download and install from [postgresql.org](https://www.postgresql.org/download/windows/)
   - Or use a package manager like Chocolatey: `choco install postgresql`
   - The service should start automatically

   On Linux (Ubuntu/Debian):
   ```bash
   sudo apt-get update
   sudo apt-get install postgresql postgresql-contrib
   sudo systemctl start postgresql
   ```

   On Mac:
   ```bash
   brew install postgresql
   brew services start postgresql
   ```

2. **Create the database and user**

   Connect to PostgreSQL (usually as the `postgres` user):
   ```bash
   # On Linux/Mac
   sudo -u postgres psql
   
   # On Windows, use psql from the PostgreSQL installation
   # Or use pgAdmin
   ```

   Then run these SQL commands:
   ```sql
   CREATE DATABASE queuectl;
   CREATE USER queuectl WITH PASSWORD 'queuectl123';
   GRANT ALL PRIVILEGES ON DATABASE queuectl TO queuectl;
   \q
   ```

3. **Configure database connection (optional)**

   By default, the app connects to:
   - Host: `localhost`
   - Port: `5432`
   - User: `queuectl`
   - Password: `queuectl123`
   - Database: `queuectl`

   If you need different settings, set environment variables:
   ```bash
   # Windows PowerShell
   $env:DB_HOST="localhost"
   $env:DB_PORT="5432"
   $env:DB_USER="your_username"
   $env:DB_PASSWORD="your_password"
   $env:DB_NAME="queuectl"
   
   # Linux/Mac
   export DB_HOST=localhost
   export DB_PORT=5432
   export DB_USER=your_username
   export DB_PASSWORD=your_password
   export DB_NAME=queuectl
   ```

### 3. Run Database Migration

```bash
node -e "const db = require('./db'); (async () => { await db.testConnection(); await db.runMigration(); await db.close(); })()"
```

Or you can run the SQL file directly:
```bash
psql -U queuectl -d queuectl -f migrations/001_init.sql
```

**Note:** You'll be prompted for the password (`queuectl123` by default).

## Usage

### Enqueue a Job

```bash
node queuectl.js enqueue '{"id":"job1","command":"echo \"Hello World\""}'
```

### Start Workers

Start 2 workers to process jobs:
```bash
node queuectl.js worker start --count 2
```

Workers will continuously poll for pending jobs and execute them.

### Stop Workers

Press `Ctrl+C` to gracefully stop workers. They will finish processing current jobs before exiting.

### Check Status

```bash
node queuectl.js status
```

Shows:
- Number of active workers
- Job counts by state (pending, processing, completed, failed, dead)

### List Jobs

List all jobs:
```bash
node queuectl.js list
```

List jobs by state:
```bash
node queuectl.js list --state pending
```

### Dead Letter Queue (DLQ)

List all dead jobs:
```bash
node queuectl.js dlq list
```

Retry a dead job:
```bash
node queuectl.js dlq retry job4
```

This resets the job to `pending` state with `attempts = 0`.

### Configuration

Set max retries:
```bash
node queuectl.js config set max-retries 5
```

Set backoff base (for exponential backoff):
```bash
node queuectl.js config set backoff-base 2
```

Get a config value:
```bash
node queuectl.js config get max-retries
```

## Architecture

### Job States

- **pending**: Job is waiting to be processed
- **processing**: Job is currently being executed
- **completed**: Job finished successfully
- **failed**: Job failed but may be retried
- **dead**: Job failed after max retries (moved to DLQ)

### Atomic Job Selection

The system uses PostgreSQL's `FOR UPDATE SKIP LOCKED` feature to ensure that multiple workers don't pick up the same job:

```sql
SELECT * FROM jobs 
WHERE state = 'pending' 
AND (next_run_at IS NULL OR next_run_at <= now())
ORDER BY created_at ASC
LIMIT 1
FOR UPDATE SKIP LOCKED
```

This query:
- Selects the oldest pending job
- Locks it so other workers skip it
- Ensures no duplicate processing

### Retry and Exponential Backoff

When a job fails:
1. The `attempts` counter is incremented
2. If `attempts < max_retries`, the job is scheduled for retry
3. The retry delay is calculated as: `delay = base^attempts` seconds
4. The job's `next_run_at` is set to `now() + delay`
5. The job state is set back to `pending`

Example with `backoff-base = 2`:
- Attempt 1: 2 seconds delay
- Attempt 2: 4 seconds delay
- Attempt 3: 8 seconds delay

### Dead Letter Queue (DLQ)

Jobs that fail after `max_retries` attempts are moved to the `dead` state. These jobs:
- Are no longer automatically retried
- Can be manually retried using `queuectl dlq retry <job_id>`
- Retrying resets `attempts` to 0 and clears the error

### Job Output Logging

After each job execution, the output is saved to `logs/<job_id>.log`:

```
--- STDOUT ---
Hello World

--- STDERR ---

--- EXIT CODE: 0 ---
```

## Quick Verification

Before running tests, verify your setup:

```bash
node verify.js
```

This will check:
- Database connection
- Database schema (runs migration if needed)
- Dependencies installed
- Can enqueue jobs

## Running Tests

Run the test script to verify everything works:

**On Linux/Mac:**
```bash
bash test.sh
```

**On Windows:**
You can use Git Bash, WSL, or PowerShell. If using PowerShell, you may need to run the commands manually or use Git Bash:
```bash
# In Git Bash
bash test.sh
```

The test script:
1. Checks PostgreSQL connection
2. Runs the migration
3. Enqueues 4 test jobs (2 successful, 1 with delay, 1 that will fail)
4. Starts 2 workers
5. Waits for processing
6. Shows status and DLQ contents
7. Displays job logs

**Important:** Make sure PostgreSQL is running and the database is set up before running the test script.

## Project Structure

```
queuectl/
├── migrations/
│   └── 001_init.sql       # Database schema
├── queuectl.js            # CLI entrypoint
├── db.js                  # Database helper functions
├── worker.js              # Worker logic
├── enqueue.js             # Job enqueueing
├── config.json            # Configuration file
├── logs/                  # Job output logs (created at runtime)
├── package.json
├── README.md
└── test.sh                # Test script
```

**Note:** If you see `docker-compose.yml` in the project, it's not needed for local PostgreSQL setup. You can ignore or delete it.

## Cleanup

To clean up the database (remove all jobs):

```sql
-- Connect to PostgreSQL
psql -U queuectl -d queuectl

-- Drop and recreate the jobs table
DROP TABLE IF EXISTS jobs;
\i migrations/001_init.sql
\q
```

Or simply drop the entire database:
```sql
DROP DATABASE queuectl;
```

## Notes

Everything runs locally - no cloud stuff needed. Workers check for jobs every second if nothing is pending. When you stop workers with Ctrl+C, they finish whatever job they're working on before exiting.

