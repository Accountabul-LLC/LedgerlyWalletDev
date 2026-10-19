export interface PasswordAssessment {
  /** 0 (unusable) to 4 (strong), matching the familiar five-step meter. */
  readonly score: 0 | 1 | 2 | 3 | 4;
  readonly acceptable: boolean;
  readonly warnings: readonly string[];
}

export const MIN_PASSWORD_LENGTH = 10;

const COMMON_PASSWORDS = new Set([
  'password', 'password1', '12345678', '123456789', '1234567890', 'qwertyuiop',
  'letmein', 'iloveyou', 'admin123', 'welcome1', 'monkey123', 'football',
  'baseball', 'sunshine', 'princess', 'dragon123', 'passw0rd', 'trustno1',
  'qwerty123', 'abc12345', 'ledgerly', 'wallet123', 'cryptowallet',
]);

const SEQUENCES = ['abcdefghijklmnopqrstuvwxyz', '01234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

/**
 * A deliberately small heuristic rather than a dictionary bundle. It exists to
 * steer users away from the handful of passwords that make an offline attack
 * trivial; the real protection is the Argon2id cost applied to whatever they
 * choose.
 */
export function assessPassword(password: string): PasswordAssessment {
  const warnings: string[] = [];
  const normalized = password.normalize('NFKC');
  const lower = normalized.toLowerCase();

  if (normalized.length < MIN_PASSWORD_LENGTH) {
    warnings.push(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (COMMON_PASSWORDS.has(lower)) {
    warnings.push('This is one of the most guessed passwords in existence.');
  }
  if (/^(.)\1+$/.test(normalized)) {
    warnings.push('Repeating a single character adds no strength.');
  }
  if (containsSequence(lower)) {
    warnings.push('Keyboard and alphabet runs are the first thing crackers try.');
  }

  const classes = countCharacterClasses(normalized);
  if (classes < 3 && normalized.length < 16) {
    warnings.push('Mix upper case, lower case, digits, or symbols — or use a longer passphrase.');
  }

  const score = scoreFor(normalized, classes, warnings.length);
  return {
    score,
    acceptable: normalized.length >= MIN_PASSWORD_LENGTH && score >= 2 && !COMMON_PASSWORDS.has(lower),
    warnings,
  };
}

function countCharacterClasses(password: string): number {
  let classes = 0;
  if (/[a-z]/.test(password)) classes += 1;
  if (/[A-Z]/.test(password)) classes += 1;
  if (/[0-9]/.test(password)) classes += 1;
  if (/[^a-zA-Z0-9]/.test(password)) classes += 1;
  return classes;
}

function containsSequence(lower: string): boolean {
  return SEQUENCES.some((sequence) => {
    for (let i = 0; i + 4 <= sequence.length; i += 1) {
      if (lower.includes(sequence.slice(i, i + 4))) return true;
    }
    return false;
  });
}

function scoreFor(password: string, classes: number, warningCount: number): 0 | 1 | 2 | 3 | 4 {
  if (password.length === 0) return 0;
  const uniqueRatio = new Set(password).size / password.length;
  let points = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) points += 1;
  if (password.length >= 14) points += 1;
  if (password.length >= 20) points += 1;
  if (classes >= 3) points += 1;
  if (uniqueRatio > 0.6) points += 1;
  points -= warningCount;
  return Math.max(0, Math.min(4, points)) as 0 | 1 | 2 | 3 | 4;
}
