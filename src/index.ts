import { CronJob } from "cron";

import { backup } from "./backup";
import { env } from "./env";

const tryBackup = async () => {
  try {
    await backup();
  } catch (error) {
    console.error("Error while running backup: ", error)
  }
}

if(env.RUN_ON_STARTUP) {
  console.log("Running backup now...")
    tryBackup();
}

if (env.BACKUP_CRON_SCHEDULE) {
  const job = new CronJob(env.BACKUP_CRON_SCHEDULE, async () => {
    await tryBackup();
  });
  job.start();
  console.log("Backup cron scheduled...")
} else {
  console.log("Not scheduling cron.")
}

console.log("Done!")
