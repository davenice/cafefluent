#!/usr/bin/env node
/**
 * Download contributors' voice clips from the recordings bucket.
 *
 * Usage:
 *   node scripts/fetch-recordings.mjs [--bucket=<name>]
 *
 * --bucket=<name>  The recordings bucket (default: $RECORDINGS_BUCKET, then
 *                  cafefluent-recordings)
 *
 * Requires AWS credentials (env vars or ~/.aws/credentials) that can list and
 * read the bucket, and AWS_REGION set to the bucket's region.
 *
 * Output, the same layout as the bucket's clips/ folder:
 *   recordings/<contributor-id>/<module>/<item>_<variant>.wav
 *
 * Only new clips, and clips recorded again since the last fetch, are
 * downloaded, so re-running is quick. Each file's modified time is set to when
 * it was saved on the server. Nothing local is ever deleted.
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { mkdir, stat, utimes, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CLIP_FILE = /^[a-z0-9]+(-[a-z0-9]+)*_[a-z0-9]+(-[a-z0-9]+)*\.wav$/;

/**
 * Copy every clip in the bucket into `dir`, skipping ones already up to date.
 * Returns how many clips each contributor has, and how many were downloaded.
 */
export async function fetchRecordings({ s3, bucket, dir, log = () => {} }) {
  const summary = {};
  let ContinuationToken;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'clips/', ContinuationToken }));
    for (const { Key, Size, LastModified } of page.Contents ?? []) {
      const [, id, module, file, ...rest] = Key.split('/');
      // The Lambda only ever writes keys like this, but a key is a path on disk
      // here, so check rather than trust it.
      if (rest.length || !SLUG.test(id ?? '') || !SLUG.test(module ?? '') || !CLIP_FILE.test(file ?? '')) {
        log(`Skipping unexpected key ${Key}`);
        continue;
      }
      summary[id] ??= { clips: 0, downloaded: 0 };
      summary[id].clips++;

      const path = join(dir, id, module, file);
      const local = await stat(path).catch(() => null);
      if (local && local.size === Size && local.mtime >= LastModified) continue;

      const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key }));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, await Body.transformToByteArray());
      await utimes(path, LastModified, LastModified);
      summary[id].downloaded++;
    }
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return summary;
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith('--bucket='));
  const bucket = arg?.slice('--bucket='.length) || process.env.RECORDINGS_BUCKET || 'cafefluent-recordings';
  const dir = join(ROOT, 'recordings');

  const summary = await fetchRecordings({ s3: new S3Client(), bucket, dir, log: console.warn });
  const ids = Object.keys(summary).sort();
  if (ids.length === 0) {
    console.log(`No clips in ${bucket} yet.`);
    return;
  }
  for (const id of ids) {
    const { clips, downloaded } = summary[id];
    console.log(`${id}: ${clips} clip${clips === 1 ? '' : 's'}, ${downloaded} new or re-recorded`);
  }
  console.log(`Saved to ${dir}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.name === 'CredentialsProviderError' ? 'No AWS credentials found.' : err.message);
    process.exit(1);
  });
}
