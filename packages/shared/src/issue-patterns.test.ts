import { it, expect } from 'vitest';
import { groupIssuePatterns, issuePattern } from './issue-patterns.js';
it('groups repeating paths and deduplicates affected URLs', () => expect(groupIssuePatterns(['https://example.com/blog/a', 'https://example.com/blog/b', 'https://example.com/blog/a'])[0]).toEqual({ pattern: '/blog/*', urls: ['https://example.com/blog/a', 'https://example.com/blog/b'] }));
it('normalizes dynamic parent IDs and keeps root pages distinct', () => { expect(issuePattern('https://example.com/product/123/photos/a')).toBe('/product/*/photos/*'); expect(issuePattern('https://example.com/about')).toBe('/about'); });
it('never includes query secrets in patterns', () => expect(issuePattern('https://example.com/blog/a?token=secret')).toBe('/blog/*'));
