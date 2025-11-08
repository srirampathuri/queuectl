#!/bin/bash

# Test script for queuectl
# This script tests the basic functionality of the job queue system
# Requires local PostgreSQL to be installed and running

set -e

echo "=========================================="
echo "queuectl Test Script"
echo "=========================================="
echo ""

# Step 1: Check if PostgreSQL is running
echo "Step 1: Checking PostgreSQL connection..."
if node -e "const db = require('./db'); (async () => { const connected = await db.testConnection(); await db.close(); if (!connected) process.exit(1); })()" 2>/dev/null; then
    echo "PostgreSQL connection successful!"
else
    echo "ERROR: Cannot connect to PostgreSQL."
    echo "Please make sure:"
    echo "  1. PostgreSQL is installed and running"
    echo "  2. Database 'queuectl' exists"
    echo "  3. User 'queuectl' exists with password 'queuectl123'"
    echo "  4. Or set DB_* environment variables correctly"
    exit 1
fi

# Step 2: Run migration
echo ""
echo "Step 2: Running database migration..."
node -e "const db = require('./db'); (async () => { await db.testConnection(); await db.runMigration(); await db.close(); })()"

# Step 3: Enqueue test jobs
echo ""
echo "Step 3: Enqueueing test jobs..."
node queuectl.js enqueue '{"id":"job1","command":"echo \"Hello from job1\""}'
node queuectl.js enqueue '{"id":"job2","command":"echo \"Hello from job2\""}'
node queuectl.js enqueue '{"id":"job3","command":"sleep 2"}'
node queuectl.js enqueue '{"id":"job4","command":"badcommand123"}'

# Step 4: Start workers in background
echo ""
echo "Step 4: Starting 2 workers in background..."
node queuectl.js worker start --count 2 &
WORKER_PID=$!

# Step 5: Wait for jobs to process
echo ""
echo "Step 5: Waiting 10 seconds for jobs to process..."
sleep 10

# Step 6: Check status
echo ""
echo "Step 6: Checking queue status..."
node queuectl.js status

# Step 7: Wait a bit more for retries
echo ""
echo "Step 7: Waiting 15 more seconds for retries to complete..."
sleep 15

# Step 8: Check DLQ
echo ""
echo "Step 8: Checking Dead Letter Queue..."
node queuectl.js dlq list

# Step 9: Show logs
echo ""
echo "Step 9: Showing job logs..."
if [ -d "logs" ]; then
    echo "Logs directory contents:"
    ls -la logs/
    echo ""
    if [ -f "logs/job1.log" ]; then
        echo "--- job1.log (successful job) ---"
        cat logs/job1.log
        echo ""
    fi
    if [ -f "logs/job4.log" ]; then
        echo "--- job4.log (failed job) ---"
        cat logs/job4.log
        echo ""
    fi
else
    echo "Logs directory not found"
fi

# Step 10: Stop workers
echo ""
echo "Step 10: Stopping workers..."
kill $WORKER_PID 2>/dev/null || true
sleep 2

echo ""
echo "=========================================="
echo "Test completed!"
echo "=========================================="
echo ""
echo "Note: All data is stored in your local PostgreSQL database 'queuectl'"

