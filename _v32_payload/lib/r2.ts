/**
 * Cloudflare R2 client — direct S3-compatible upload via aws4fetch.
 *
 * v32: replaces @aws-sdk/client-s3 (10MB) with aws4fetch (6KB).
 * Same functionality — sign + PUT to R2 — but ~1500x smaller bundle,
 * which dramatically improves Vercel serverless cold start times.
 */

import { AwsClient } from 'aws4fetch';

let _client: AwsClient | null = null;
let _endpoint: string | null = null;

function client(): { aws: AwsClient; endpoint: string; bucket: string; publicBase: string } {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicBase = process.env.R2_PUBLIC_BASE_URL;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) {
    throw new Error(
      'R2 not configured: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL'
    );
  }

  if (!_client) {
    _client = new AwsClient({
      accessKeyId,
      secretAccessKey,
      service: 's3',
      region: 'auto',
    });
    _endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  }

  return { aws: _client, endpoint: _endpoint!, bucket, publicBase: publicBase.replace(/\/$/, '') };
}

export interface PutObjectParams {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
  cacheControl?: string;
}

export interface PutObjectResult {
  url: string;
  key: string;
}

export async function putObject(params: PutObjectParams): Promise<PutObjectResult> {
  const { aws, endpoint, bucket, publicBase } = client();
  const url = `${endpoint}/${bucket}/${params.key}`;

  const body =
    typeof params.body === 'string' ? new TextEncoder().encode(params.body) : params.body;

  const res = await aws.fetch(url, {
    method: 'PUT',
    body,
    headers: {
      'Content-Type': params.contentType,
      'Cache-Control': params.cacheControl ?? 'public, max-age=31536000, immutable',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`R2 PUT failed: ${res.status} ${text.slice(0, 200)}`);
  }

  return {
    url: `${publicBase}/${params.key}`,
    key: params.key,
  };
}
