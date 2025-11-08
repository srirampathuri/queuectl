#!/usr/bin/env node

const { Command } = require('commander');
const db = require('./db');
const enqueue = require('./enqueue');
const worker = require('./worker');
const fs = require('fs');
const path = require('path');

const program = new Command();

program
  .name('queuectl')
  .description('A simple CLI-based background job queue system')
  .version('1.0.0');

program
  .command('enqueue')
  .description('Enqueue a new job')
  .argument('<job>', 'Job JSON string or object')
  .action(async (jobData) => {
    await db.testConnection();
    await enqueue.enqueueJob(jobData);
    await db.close();
  });

const workerCmd = program
  .command('worker')
  .description('Worker management commands');

workerCmd
  .command('start')
  .description('Start worker(s)')
  .option('-c, --count <number>', 'Number of workers to start', '1')
  .action(async (options) => {
    await db.testConnection();
    const workerCount = parseInt(options.count, 10);
    console.log(`Starting ${workerCount} worker(s)...`);
    console.log('Press Ctrl+C to stop workers gracefully');
    await worker.startWorkers(workerCount);
  });

workerCmd
  .command('stop')
  .description('Stop all workers (use Ctrl+C when workers are running)')
  .action(() => {
    console.log('To stop workers, press Ctrl+C in the terminal where workers are running.');
    console.log('Workers will finish processing current jobs before exiting.');
  });

program
  .command('status')
  .description('Show queue status')
  .action(async () => {
    await db.testConnection();
    
    const counts = await db.getJobCounts();
    const workerCount = worker.getActiveWorkers();
    
    console.log('\n=== Queue Status ===');
    console.log(`Active Workers: ${workerCount}`);
    console.log('\nJob Counts by State:');
    
    const states = {
      'pending': 0,
      'processing': 0,
      'completed': 0,
      'failed': 0,
      'dead': 0
    };
    
    counts.forEach(row => {
      states[row.state] = parseInt(row.count, 10);
    });
    
    Object.entries(states).forEach(([state, count]) => {
      console.log(`  ${state}: ${count}`);
    });
    
    console.log('');
    await db.close();
  });

program
  .command('list')
  .description('List jobs')
  .option('-s, --state <state>', 'Filter by state')
  .action(async (options) => {
    await db.testConnection();
    
    const jobs = await db.listJobs(options.state);
    
    if (jobs.length === 0) {
      console.log('No jobs found');
    } else {
      console.log(`\nFound ${jobs.length} job(s):\n`);
      jobs.forEach(job => {
        console.log(JSON.stringify(job, null, 2));
        console.log('---');
      });
    }
    
    await db.close();
  });

const dlqCmd = program
  .command('dlq')
  .description('Dead Letter Queue management');

dlqCmd
  .command('list')
  .description('List dead jobs')
  .action(async () => {
    await db.testConnection();
    
    const jobs = await db.listJobs('dead');
    
    if (jobs.length === 0) {
      console.log('No dead jobs found');
    } else {
      console.log(`\nFound ${jobs.length} dead job(s):\n`);
      jobs.forEach(job => {
        console.log(JSON.stringify(job, null, 2));
        console.log('---');
      });
    }
    
    await db.close();
  });

dlqCmd
  .command('retry')
  .description('Retry a dead job')
  .argument('<job_id>', 'Job ID to retry')
  .action(async (jobId) => {
    await db.testConnection();
    
    const job = await db.retryDeadJob(jobId);
    
    if (job) {
      console.log(`Job ${jobId} moved back to pending queue`);
      console.log(JSON.stringify(job, null, 2));
    } else {
      console.error(`Job ${jobId} not found or not in dead state`);
      process.exit(1);
    }
    
    await db.close();
  });

const configCmd = program
  .command('config')
  .description('Configuration management');

configCmd
  .command('set')
  .description('Set a config value')
  .argument('<key>', 'Config key')
  .argument('<value>', 'Config value')
  .action((key, value) => {
    const configPath = path.join(__dirname, 'config.json');
    let config = {};
    
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      config = JSON.parse(configData);
    }
    
    // Try to convert to number if it looks like one
    let configValue = value;
    if (!isNaN(value)) {
      configValue = parseFloat(value);
    }
    config[key] = configValue;
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`Config ${key} set to ${value}`);
  });

configCmd
  .command('get')
  .description('Get a config value')
  .argument('<key>', 'Config key')
  .action((key) => {
    const configPath = path.join(__dirname, 'config.json');
    
    if (!fs.existsSync(configPath)) {
      console.error('Config file not found');
      process.exit(1);
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    if (config[key] !== undefined) {
      console.log(config[key]);
    } else {
      console.error(`Config key "${key}" not found`);
      process.exit(1);
    }
  });

program.parse();

