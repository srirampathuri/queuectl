# queuectl

A simple job queue system I built for a project. You can add jobs to a queue and workers will process them. If a job fails, it retries automatically. Built with Node.js and PostgreSQL.

## Demo Video

[Watch Demo Video](https://drive.google.com/file/d/1VElGQ2l76n8rAQDQtbfXg2z7cCwm3gs7/view?usp=sharing)

## What it does

- Add jobs to a queue (like running commands)
- Workers pick up jobs and run them
- If a job fails, it retries with delays (exponential backoff)
- Jobs that fail too many times go to a "dead letter queue" (DLQ)
- All job outputs are saved to log files

## Quick Start

### 1. Install stuff

```bash
npm install
```

### 2. Setup PostgreSQL

First, make sure PostgreSQL is installed and running on your computer.

Then connect to it (usually as the `postgres` user):
- Windows: Open "SQL Shell (psql)" from Start Menu
- Linux/Mac: `sudo -u postgres psql`

Run these commands:
```sql
CREATE DATABASE queuectl;
CREATE USER queuectl WITH PASSWORD 'queuectl123';
GRANT ALL PRIVILEGES ON DATABASE queuectl TO queuectl;
\q
```

### 3. Check if everything works

```bash
node verify.js
```

This will tell you if the database connection works and if the table exists.

### 4. Try it out

Enqueue a job:
```bash
node queuectl.js enqueue '{"id":"test1","command":"echo Hello World"}'
```

Start a worker (open a new terminal):
```bash
node queuectl.js worker start --count 1
```

Check status:
```bash
node queuectl.js status
```

## Basic Commands

**Enqueue a job:**
```bash
node queuectl.js enqueue '{"id":"job1","command":"echo test"}'
```

**Start workers:**
```bash
node queuectl.js worker start --count 2
```

**Check status:**
```bash
node queuectl.js status
```

**List jobs:**
```bash
node queuectl.js list
node queuectl.js list --state pending
```

**Dead jobs (DLQ):**
```bash
node queuectl.js dlq list
node queuectl.js dlq retry job_id
```

**Config:**
```bash
node queuectl.js config set max-retries 5
node queuectl.js config get max-retries
```

## How it works (simple version)

Jobs go through different states:
- **pending** - waiting to be processed
- **processing** - currently running
- **completed** - finished successfully
- **dead** - failed too many times

When a job fails:
1. It increments the attempt counter
2. If attempts < max_retries, it schedules a retry
3. The delay increases each time (2 seconds, then 4, then 8, etc.)
4. If it fails too many times, it goes to the DLQ

The system uses PostgreSQL's `FOR UPDATE SKIP LOCKED` to make sure multiple workers don't pick the same job. Basically, when a worker grabs a job, it locks it so other workers skip it.

## Job Logs

After a job runs, you can find its output in `logs/<job_id>.log`. It shows stdout, stderr, and the exit code.

## Testing

Run the test script:
```bash
bash test.sh
```

Or on Windows with Git Bash:
```bash
bash test.sh
```

This will create some test jobs, start workers, and show you the results.

## Project Files

- `queuectl.js` - main CLI file
- `db.js` - database stuff
- `worker.js` - worker logic
- `enqueue.js` - adding jobs
- `migrations/001_init.sql` - database table creation
- `config.json` - settings
- `test.sh` - test script

## Notes

- Everything runs locally on your machine
- Workers check for jobs every second when idle
- Press Ctrl+C to stop workers (they finish current job first)
- All data is stored in PostgreSQL
- Logs are saved in the `logs/` folder

## Troubleshooting

**Can't connect to database?**
- Make sure PostgreSQL is running
- Check if the database and user exist
- Try connecting manually: `psql -U queuectl -d queuectl`

**Workers not processing jobs?**
- Make sure workers are actually running (check the terminal)
- Check if jobs are pending: `node queuectl.js list --state pending`

That's pretty much it. It's a simple queue system that works locally.
