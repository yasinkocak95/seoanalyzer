import { it, expect } from 'vitest';
import { parseContact } from './contact';
it('validates and bounds real contact messages', () => { expect(parseContact({ email: ' a@example.com ', subject: ' Help ', message: 'Please help with my report.' })).toEqual({ email: 'a@example.com', subject: 'Help', message: 'Please help with my report.' }); for (const value of [null, {}, { email: 'bad', subject: 'Help', message: 'Please help' }, { email: 'a@example.com', subject: 'Help', message: 'x'.repeat(4001) }]) expect(() => parseContact(value)).toThrow(); });
