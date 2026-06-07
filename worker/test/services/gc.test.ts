import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createDb } from '../../src/db/client';
import { sweepOrphanR2Blobs } from '../../src/services/gc';

function db() {
  return createDb(env.DB);
}

describe('sweepOrphanR2Blobs', () => {
  it('deletes one orphan past the grace period', async () => {
    await env.IMAGES.put('items/orphan', new Uint8Array([1]));

    const future = new Date(Date.now() + 60 * 60 * 1000);
    const result = await sweepOrphanR2Blobs(db(), env.IMAGES, future);

    expect(result.deleted).toBe(1);
    expect(await env.IMAGES.get('items/orphan')).toBeNull();
  });

  it('skips a recently-uploaded blob (grace period)', async () => {
    await env.IMAGES.put('items/just-uploaded', new Uint8Array([1]));

    const result = await sweepOrphanR2Blobs(db(), env.IMAGES, new Date());

    expect(result.deleted).toBe(0);
    expect(result.skippedTooNew).toBeGreaterThanOrEqual(1);
  });
});
