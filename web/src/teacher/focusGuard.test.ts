import { describe, expect, it } from 'vitest';
import { siteList } from './focusGuard';

describe('focus helper wording', () => {
  it('names the sites naturally', () => {
    expect(siteList(['YouTube'])).toBe('YouTube');
    expect(siteList(['YouTube', 'Roblox'])).toBe('YouTube and Roblox');
    expect(siteList(['YouTube', 'Roblox', 'YouTube', 'TikTok'])).toBe('YouTube, Roblox and TikTok');
  });
});
