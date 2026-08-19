const EXTENSION_KINDS = {
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  mp4: 'video',
  webm: 'video',
  mov: 'video',
  m4v: 'video',
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  m4a: 'audio',
  pdf: 'pdf',
};

export function getFileKind(file = {}) {
  const contentType = String(file.contentType || '').toLowerCase();
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  if (contentType === 'application/pdf') return 'pdf';

  const extension = String(file.name || '')
    .split('.')
    .pop()
    .toLowerCase();
  return EXTENSION_KINDS[extension] || 'document';
}

export function formatFileSize(bytes) {
  const size = Number(bytes);
  if (!size) return '';
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(Math.round(size / 1024), 1)} KB`;
}

export async function createSignedUrlMap(bucket, paths, expiresIn = 3600) {
  const uniquePaths = [...new Set((paths || []).filter(Boolean))];
  if (!uniquePaths.length) return {};

  const urlMap = {};
  try {
    const bulkResult = await bucket.createSignedUrls(uniquePaths, expiresIn);
    (bulkResult.data || []).forEach(item => {
      if (item.path && item.signedUrl) urlMap[item.path] = item.signedUrl;
    });
  } catch {
    // Individual signing below keeps one storage failure from hiding all files.
  }

  const missingPaths = uniquePaths.filter(path => !urlMap[path]);
  await Promise.all(
    missingPaths.map(async path => {
      try {
        const { data } = await bucket.createSignedUrl(path, expiresIn);
        if (data?.signedUrl) urlMap[path] = data.signedUrl;
      } catch {
        // The message still renders its filename and unavailable state.
      }
    })
  );

  return urlMap;
}
