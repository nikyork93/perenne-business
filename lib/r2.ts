/**
 * Cloudflare R2 client — direct S3-compatible upload.
 *
 * Replaces the previous flow that proxied uploads through the
 * Cloudflare Worker (`api.perenne.app/assets/upload`). The Worker is
 * being dismissed; perenne-business now writes to R2 directly using
 * the S3 protocol (R2 is fully S3-compatible).
 *
 * Required env vars (configure in Vercel project settings):
 *   R2_ACCOUNT_ID         — your Cloudflare account ID
 *   R2_ACCESS_KEY_ID      — R2 API token, S3-compatible "access key"
 *   R2_SECRET_ACCESS_KEY  — R2 API token, S3-compatible "secret key"
 *   R2_BUCKET             — bucket name (e.g. "perenne-assets")
 *   R2_PUBLIC_BASE_URL    — public custom domain for the bucket
 *                          (e.g. "https://assets.perenne.app")
 *
 * Generate an R2 API token from Cloudflare Dashboard → R2 → Manage R2
 * API Tokens → Create API token → "Object Read & Write" scope on your
 * bucket. Copy access key + secret immediately (shown only once).
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

let _client: S3Client | null = null;

function client(): S3Client {
  if (_client) return _client;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'R2 not configured: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in env'
    );
  }

  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

export interface PutObjectParams {
  /** R2 object key (path inside the bucket) */
  key: string;
  /** File contents as Buffer / Uint8Array / string */
  body: Buffer | Uint8Array | string;
  /** MIME type, e.g. "image/png" */
  contentType: string;
  /** Cache header, default "public, max-age=31536000, immutable" */
  cacheControl?: string;
}

export interface PutObjectResult {
  /** Public URL where the object is accessible */
  url: string;
  /** R2 object key */
  key: string;
}

/**
 * Upload a single object to R2 and return its public URL.
 * Throws on failure (let the caller decide how to surface errors).
 */
export async function putObject(params: PutObjectParams): Promise<PutObjectResult> {
  const bucket = process.env.R2_BUCKET;
  const publicBase = process.env.R2_PUBLIC_BASE_URL;
  if (!bucket || !publicBase) {
    throw new Error('R2 not configured: set R2_BUCKET and R2_PUBLIC_BASE_URL in env');
  }

  await client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      CacheControl: params.cacheControl ?? 'public, max-age=31536000, immutable',
    })
  );

  // R2 doesn't auto-route to the public domain — the public URL is
  // the custom domain bound to the bucket in Cloudflare R2 settings.
  const base = publicBase.replace(/\/+$/, '');
  return {
    url: `${base}/${params.key}`,
    key: params.key,
  };
}
