import { describe, it, expect } from 'vitest';
import { validate } from '../guardrails/validate';

describe('validate', () => {
  const schema = {
    name: { type: 'string', required: true, minLength: 2, maxLength: 50 },
    email: { type: 'email', required: true },
    age: { type: 'number', min: 0, max: 150 },
    role: { oneOf: ['admin', 'user'] },
    url: { type: 'url' },
    active: { type: 'boolean' },
  };

  it('returns null for valid data', () => {
    expect(validate({
      name: 'Alice',
      email: 'alice@example.com',
      age: 30,
      role: 'admin',
      url: 'https://example.com',
      active: true,
    }, schema)).toBeNull();
  });

  it('returns errors for missing required fields', () => {
    const errors = validate({}, schema);
    expect(errors.name).toBe('name is required');
    expect(errors.email).toBe('email is required');
  });

  it('validates string minLength', () => {
    const errors = validate({ name: 'A', email: 'a@b.com' }, schema);
    expect(errors.name).toMatch(/at least 2/);
  });

  it('validates string maxLength', () => {
    const errors = validate({ name: 'A'.repeat(60), email: 'a@b.com' }, schema);
    expect(errors.name).toMatch(/at most 50/);
  });

  it('validates email format', () => {
    const errors = validate({ name: 'Bob', email: 'not-an-email' }, schema);
    expect(errors.email).toMatch(/not a valid email/);
  });

  it('validates number min/max', () => {
    const errors = validate({ name: 'Bob', email: 'b@b.com', age: -1 }, schema);
    expect(errors.age).toMatch(/at least 0/);
  });

  it('validates oneOf', () => {
    const errors = validate({ name: 'Bob', email: 'b@b.com', role: 'superadmin' }, schema);
    expect(errors.role).toMatch(/one of/);
  });

  it('validates url type', () => {
    const errors = validate({ name: 'Bob', email: 'b@b.com', url: 'not-a-url' }, schema);
    expect(errors.url).toMatch(/not a valid URL/);
  });

  it('validates boolean type', () => {
    const errors = validate({ name: 'Bob', email: 'b@b.com', active: 'yes' }, schema);
    expect(errors.active).toMatch(/must be a boolean/);
  });

  it('skips optional fields when absent', () => {
    expect(validate({ name: 'Alice', email: 'a@b.com' }, schema)).toBeNull();
  });

  it('uses custom label in error messages', () => {
    const s = { title: { type: 'string', required: true, label: 'Post title' } };
    const errors = validate({}, s);
    expect(errors.title).toBe('Post title is required');
  });

  it('validates custom pattern', () => {
    const s = { code: { type: 'string', pattern: /^[A-Z]{3}$/, message: 'Code must be 3 uppercase letters' } };
    const errors = validate({ code: 'abc' }, s);
    expect(errors.code).toBe('Code must be 3 uppercase letters');
  });

  it('accepts empty string for non-required fields', () => {
    const s = { name: { type: 'string', required: true }, nick: { type: 'string' } };
    expect(validate({ name: 'Alice', nick: '' }, s)).toBeNull();
  });
});
