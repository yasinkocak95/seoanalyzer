import { it, expect } from 'vitest';
import { publicReport, publicUrl } from './public-report';
it('removes URL secrets and excludes private report fields', () => {
  expect(publicUrl('https://user:password@example.com/blog/a?token=secret#private')).toBe('https://example.com/blog/a');
  const report = publicReport({ normalizedHost: 'example.com', score: 80, completedAt: null, findings: [{ code: 'TITLE_MISSING', severity: 'WARNING', title: 'Title', description: 'Description', recommendation: 'Fix', affectedUrls: ['https://example.com/?token=secret'], evidence: [{ secret: 'private' }] }] }, 'en');
  expect(JSON.stringify(report)).not.toMatch(/secret|private|evidence|crawlId/);
});
