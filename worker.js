const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const execAsync = promisify(exec);

function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');
  const configData = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(configData);
}

function ensureLogsDir() {
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  return logsDir;
}

function saveJobLog(jobId, stdout, stderr, exitCode) {
  const logsDir = ensureLogsDir();
  const logPath = path.join(logsDir, `${jobId}.log`);
  
  const logContent = `--- STDOUT ---
${stdout}
--- STDERR ---
${stderr}
--- EXIT CODE: ${exitCode} ---
`;
  
  fs.writeFileSync(logPath, logContent);
}

async function processJob() {
  const config = loadConfig();
  const job = await db.getAndLockJob();
  
  if (!job) {
    return false;
  }
  
  console.log(`[Worker] Processing job ${job.id}: ${job.command}`);
  
  try {
    const result = await execAsync(job.command);
    const stdout = result.stdout || '';
    const stderr = result.stderr || '';
    
    saveJobLog(job.id, stdout, stderr, 0);
    await db.updateJobState(job.id, 'completed');
    console.log(`[Worker] Job ${job.id} completed successfully`);
    return true;
  } catch (err) {
    const exitCode = err.code || 1;
    const errorMsg = err.message || 'Command execution failed';
    const stdout = err.stdout || '';
    const stderr = err.stderr || errorMsg;
    
    saveJobLog(job.id, stdout, stderr, exitCode);
    
    if (job.attempts < job.max_retries) {
      await db.scheduleRetry(job.id, job.attempts, config['backoff-base']);
      console.log(`[Worker] Job ${job.id} failed (attempt ${job.attempts}/${job.max_retries}), scheduled retry`);
    } else {
      await db.updateJobState(job.id, 'dead', errorMsg);
      console.log(`[Worker] Job ${job.id} failed after ${job.attempts} attempts, moved to DLQ`);
    }
    
    return true;
  }
}

let shouldStop = false;
let activeWorkers = 0;

function setStopFlag() {
  shouldStop = true;
}

function getActiveWorkers() {
  return activeWorkers;
}

async function runWorker(workerId) {
  activeWorkers++;
  console.log(`[Worker ${workerId}] Started`);
  
  while (!shouldStop) {
    try {
      const processed = await processJob();
      if (!processed) {
        // No jobs available, wait a bit
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (err) {
      console.error(`[Worker ${workerId}] Error:`, err.message);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  activeWorkers--;
  console.log(`[Worker ${workerId}] Stopped`);
}

async function startWorkers(count) {
  shouldStop = false;
  activeWorkers = 0;
  
  const workers = [];
  for (let i = 1; i <= count; i++) {
    workers.push(runWorker(i));
  }
  
  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    console.log('\n[Worker] Received SIGINT, stopping workers gracefully...');
    setStopFlag();
  });
  
  process.on('SIGTERM', () => {
    console.log('\n[Worker] Received SIGTERM, stopping workers gracefully...');
    setStopFlag();
  });
  
  await Promise.all(workers);
  console.log('[Worker] All workers stopped');
}

function stopWorkers() {
  setStopFlag();
}

module.exports = {
  startWorkers,
  stopWorkers,
  getActiveWorkers
};

