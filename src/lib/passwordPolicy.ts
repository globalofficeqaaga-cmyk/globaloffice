export const MIN_PASSWORD_LENGTH = 4;

const WEAK_PASSWORDS = new Set([
  '1234',
  '12345',
  '123456',
  'password',
  'admin',
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

  if (classes < 1) {
    return `${label} must include at least one character type (e.g. uppercase, lowercase, numbers, or symbols).`;
  }

  return null;
}
