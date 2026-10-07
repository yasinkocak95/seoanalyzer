export function parseContact(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid contact request');
  const body = value as Record<string, unknown>;
  if (typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) throw new Error('Invalid email');
  const text = (key: string, min: number, max: number) => { const v = body[key]; if (typeof v !== 'string' || v.trim().length < min || v.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(v)) throw new Error('Invalid contact request'); return v.trim(); };
  return { email: body.email.trim(), subject: text('subject', 3, 150), message: text('message', 10, 4000) };
}
