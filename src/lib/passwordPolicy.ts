export const MIN_PASSWORD_LENGTH = 12;

const WEAK_PASSWORDS = new Set([
  '123456789012',
  '1234567890123',
  'password1234',
  'password123456',
  'admin1234567',
  'admin12345678',
  'qwertyuiop12',
  'globalpathways',
]);

export function validateStrongPassword(
  password: string,
  label = 'Password'
): string | null {
  const value = password.trim();
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `${label} must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (/^(.)\1+$/.test(value) || WEAK_PASSWORDS.has(value.toLowerCase())) {
    return `${label} is too predictable. Use a mix of letters, numbers, or symbols.`;
  }

  let classes = 0;
  if (/[a-z]/.test(value)) classes += 1;
  if (/[A-Z]/.test(value)) classes += 1;
  if (/[0-9]/.test(value)) classes += 1;
  if (/[^A-Za-z0-9]/.test(value)) classes += 1;

  if (classes < 2) {
    return `${label} must include at least two character types (e.g. uppercase, lowercase, numbers, or symbols).`;
  }

  return null;
}
