const db = require('./db');

async function enqueueJob(jobData) {
  let job;
  try {
    if (typeof jobData === 'string') {
      job = JSON.parse(jobData);
    } else {
      job = jobData;
    }
    
    // Check required fields
    if (!job.id || !job.command) {
      throw new Error('Job must have id and command fields');
    }
    
    const insertedJob = await db.insertJob(job);
    console.log(`Job ${insertedJob.id} enqueued successfully`);
    console.log(JSON.stringify(insertedJob, null, 2));
    
    return insertedJob;
  } catch (err) {
    if (err.code === '23505') {
      // Duplicate key error
      const jobId = job ? job.id : 'unknown';
      console.error(`Error: Job with id "${jobId}" already exists`);
    } else {
      console.error('Error enqueueing job:', err.message);
    }
    process.exit(1);
  }
}

module.exports = { enqueueJob };

