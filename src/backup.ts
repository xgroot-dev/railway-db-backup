import { exec } from "child_process";
import { ListObjectsCommand, DeleteObjectCommand, PutObjectCommand, S3Client, S3ClientConfig } from "@aws-sdk/client-s3";
import { createReadStream, unlink } from "fs";

import { env } from "./env";

const s3Client = () => {
  const clientOptions: S3ClientConfig = {
    region: env.AWS_S3_REGION,
  }

  if (env.AWS_S3_ENDPOINT) {
    console.log(`Using custom endpoint: ${env.AWS_S3_ENDPOINT}`)
    clientOptions['endpoint'] = env.AWS_S3_ENDPOINT;
  }

  return new S3Client(clientOptions);
}

const uploadToS3 = async ({ name, path }: {name: string, path: string}) => {
  console.log("Uploading backup to S3...");
  const bucket = env.AWS_S3_BUCKET;
  const client = s3Client()
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: name,
      Body: createReadStream(path),
    })
  )
  console.log("Backup uploaded to S3...");
}

const dumpToFile = async (path: string) => {
  console.log("Dumping DB to file...");

  await new Promise((resolve, reject) => {
    exec(
      `pg_dump ${env.BACKUP_DATABASE_URL} -F t | gzip > ${path}`,
      (error, stdout, stderr) => {
        if (error) {
          reject({ error: JSON.stringify(error), stderr });
          return;
        }

        resolve(undefined);
      }
    );
  });

  console.log("DB dumped to file...");
}

const deleteFile = async (path: string) => {
  console.log("Deleting file...");
  await new Promise((resolve, reject) => {
    unlink(path, (err) => {
      reject({ error: JSON.stringify(err) });
      return;
    });
    resolve(undefined);
  })
}

const cleanupOldBackups = async () => {
  console.log("Cleaning up old backups...");
  const bucket = env.AWS_S3_BUCKET;
  const filesToKeep = env.KEEP_BACKUPS || 5
  const client = s3Client()
  const listResponse = await client.send(
    new ListObjectsCommand({Bucket: bucket, MaxKeys: 100})
  )
  if (listResponse.Contents && listResponse.Contents.length > filesToKeep) {
    const sortedContents = listResponse.Contents.sort((a, b) => {
      if (a.LastModified && b.LastModified) {
        return a.LastModified.getTime() - b.LastModified.getTime()
      }
      return 0
    })
    const filesToDelete = sortedContents.slice(0, listResponse.Contents.length - filesToKeep)
    filesToDelete.forEach(async (file) => {
      await client.send(
        new DeleteObjectCommand({Bucket: bucket, Key: file.Key})
      )
      console.log(`Deleted old backup: ${file.Key}`)
    })
  } else if (listResponse.Contents) {
    console.log(`No old backups to delete (found ${listResponse.Contents.length}).`)
  }
  console.log("Cleanup complete.");
}

export const backup = async () => {
  console.log("Initiating DB backup...")

  let date = new Date().toISOString()
  const timestamp = date.replace(/[:.]+/g, '-')
  const filename = `backup-${timestamp}.tar.gz`
  const filepath = `/tmp/${filename}`

  await dumpToFile(filepath)
  await uploadToS3({name: filename, path: filepath})
  await deleteFile(filepath)
  await cleanupOldBackups()

  console.log("DB backup complete...")
}
