import { describe, expect, it } from 'vitest';
import { ALL_EMOJIS, EMOJI_CATEGORIES } from './emoji-data';

describe('emoji picker data', () => {
  it('provides a broad categorized emoji collection', () => {
    expect(EMOJI_CATEGORIES.length).toBeGreaterThanOrEqual(8);
    expect(ALL_EMOJIS.length).toBeGreaterThanOrEqual(150);
  });

  it('keeps category ids unique', () => {
    const ids = EMOJI_CATEGORIES.map(category => category.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
