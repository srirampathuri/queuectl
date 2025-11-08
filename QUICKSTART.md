# Quick Start Guide - Testing queuectl

Follow these steps to get queuectl running and verify it works.

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Setup PostgreSQL

### Check if PostgreSQL is running:

**Windows:**
```powershell
# Check if PostgreSQL service is running
Get-Service postgresql*
```

**Linux/Mac:**
```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql
# or
pg_isready
```

### Create Database and User

Connect to PostgreSQL:
```bash
# On Linux/Mac (as postgres user)
sudo -u postgres psql

# On Windows, open psql from Start Menu or:
# "C:\Program Files\PostgreSQL\<version>\bin\psql.exe" -U postgres
```

Then run:
```sql
CREATE DATABASE queuectl;
CREATE USER queuectl WITH PASSWORD 'queuectl123';
GRANT ALL PRIVILEGES ON DATABASE queuectl TO queuectl;
\q
```

## Step 3: Run Migration

```bash
node -e "const db = require('./db'); (async () => { await db.testConnection(); await db.runMigration(); await db.close(); })()"
```

**Expected output:**
```
Migration completed successfully
```

If you see an error, check:
- PostgreSQL is running
- Database `queuectl` exists
- User `queuectl` has correct password

## Step 4: Test Basic Commands

### Test 1: Enqueue a Job

```bash
node queuectl.js enqueue '{"id":"test1","command":"echo Hello World"}'
```

**Expected output:**
```
Job test1 enqueued successfully
{
  "id": "test1",
  "command": "echo Hello World",
  "state": "pending",
  ...
}
```

### Test 2: Check Status

```bash
node queuectl.js status
```

**Expected output:**
```
=== Queue Status ===
Active Workers: 0

Job Counts by State:
  pending: 1
  processing: 0
  completed: 0
  failed: 0
  dead: 0
```

### Test 3: Start a Worker

Open a **new terminal window** and run:

```bash
node queuectl.js worker start --count 1
```

You should see:
```
Starting 1 worker(s)...
Press Ctrl+C to stop workers gracefully
[Worker 1] Started
[Worker] Processing job test1: echo Hello World
[Worker] Job test1 completed successfully
```

### Test 4: Check Status Again

In the **first terminal**, run:

```bash
node queuectl.js status
```

**Expected output:**
```
=== Queue Status ===
Active Workers: 1

Job Counts by State:
  pending: 0
  processing: 0
  completed: 1
  ...
```

### Test 5: Check Job Logs

```bash
# List completed jobs
node queuectl.js list --state completed

# Check the log file
cat logs/test1.log
```

**Expected log output:**
```
--- STDOUT ---
Hello World

--- STDERR ---

--- EXIT CODE: 0 ---
```

### Test 6: Test Failed Job and Retry

```bash
# Enqueue a job that will fail
node queuectl.js enqueue '{"id":"test2","command":"badcommand123"}'
```

Wait a few seconds (the worker will retry it), then check:

```bash
# Check DLQ
node queuectl.js dlq list

# Retry the dead job
node queuectl.js dlq retry test2

# Check status
node queuectl.js status
```

## Step 5: Run Full Test Script

For a comprehensive test, run:

```bash
bash test.sh
```

Or on Windows (Git Bash):
```bash
bash test.sh
```

This will:
1. Check PostgreSQL connection
2. Run migration
3. Enqueue 4 test jobs
4. Start 2 workers
5. Show status and results
6. Display logs

## Troubleshooting

### Error: "Cannot connect to PostgreSQL"

**Solutions:**
1. Make sure PostgreSQL is running:
   - Windows: Check Services (services.msc)
   - Linux: `sudo systemctl start postgresql`
   - Mac: `brew services start postgresql`

2. Check connection settings in `db.js` or set environment variables:
   ```bash
   export DB_HOST=localhost
   export DB_PORT=5432
   export DB_USER=queuectl
   export DB_PASSWORD=queuectl123
   export DB_NAME=queuectl
   ```

### Error: "database does not exist"

Run the SQL commands from Step 2 to create the database.

### Error: "password authentication failed"

Make sure the password matches. Default is `queuectl123`, or set `DB_PASSWORD` environment variable.

### Workers not processing jobs

1. Make sure workers are running (check the terminal where you started them)
2. Check if jobs are in `pending` state: `node queuectl.js list --state pending`
3. Check PostgreSQL connection from worker terminal

## Quick Verification Checklist

- [ ] `npm install` completed successfully
- [ ] PostgreSQL is running
- [ ] Database `queuectl` exists
- [ ] User `queuectl` created with password `queuectl123`
- [ ] Migration ran successfully
- [ ] Can enqueue a job
- [ ] Can start a worker
- [ ] Worker processes jobs
- [ ] Logs are created in `logs/` directory
- [ ] Status command shows correct counts

If all checkboxes are done, the system is working!

