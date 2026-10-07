import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({ path: '/karsilastir/c', error: vi.fn(), reload: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => state.path }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useContext: () => 'en', useState: () => [false, state.error] }));
import { LanguageSwitcher } from '../components/language';
beforeEach(() => { vi.clearAllMocks(); state.path = '/karsilastir/c'; vi.stubGlobal('location', { search: '?onceki=baseline&page=2', hash: '#details', reload: state.reload }); });
afterEach(() => vi.unstubAllGlobals());
const clickEnglish = () => {
  const element = LanguageSwitcher(), anchor = element.props.children[0][1];
  const event = { currentTarget: { href: anchor.props.href }, preventDefault: vi.fn() };
  return { event, click: () => anchor.props.onClick(event) };
};
it('keeps query and fragment when changing a comparison language', async () => {
  const { event, click } = clickEnglish(); await click();
  expect(new URL(event.currentTarget.href, 'https://example.com').searchParams.get('returnTo')).toBe('/karsilastir/c?onceki=baseline&page=2#details');
});
it.each(['/shared', '/shared/'])('preserves the capability while switching %s', async path => {
  state.path = path; const fetch = vi.fn(async () => ({ ok: true })); vi.stubGlobal('fetch', fetch);
  const { event, click } = clickEnglish(); await click();
  expect(event.preventDefault).toHaveBeenCalled(); expect(fetch).toHaveBeenCalledWith('/api/language?lang=en', { method: 'POST' }); expect(state.reload).toHaveBeenCalled();
});
it('reports a shared report language network failure without an unhandled rejection', async () => {
  state.path = '/shared'; vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  await expect(clickEnglish().click()).resolves.toBeUndefined(); expect(state.error).toHaveBeenLastCalledWith(true); expect(state.reload).not.toHaveBeenCalled();
});
