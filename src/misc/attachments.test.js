import { describe, expect, it, vi } from 'vitest';
import { createSignedUrlMap, formatFileSize, getFileKind } from './attachments';

describe('attachment helpers', () => {
  it('detects media using MIME types and filename fallbacks', () => {
    expect(getFileKind({ contentType: 'image/jpeg' })).toBe('image');
    expect(getFileKind({ name: 'recording.webm' })).toBe('video');
    expect(getFileKind({ name: 'invoice.PDF' })).toBe('pdf');
    expect(getFileKind({ name: 'notes.docx' })).toBe('document');
  });

  it('formats file sizes for readable attachment cards', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1572864)).toBe('1.5 MB');
  });

  it('falls back to individual signing when a bulk result misses a file', async () => {
    const bucket = {
      createSignedUrls: vi.fn().mockResolvedValue({
        data: [{ path: 'one.jpg', signedUrl: 'signed-one' }],
      }),
      createSignedUrl: vi
        .fn()
        .mockResolvedValue({ data: { signedUrl: 'signed-two' } }),
    };

    await expect(
      createSignedUrlMap(bucket, ['one.jpg', 'two.pdf'])
    ).resolves.toEqual({
      'one.jpg': 'signed-one',
      'two.pdf': 'signed-two',
    });
    expect(bucket.createSignedUrl).toHaveBeenCalledWith('two.pdf', 3600);
  });
});
