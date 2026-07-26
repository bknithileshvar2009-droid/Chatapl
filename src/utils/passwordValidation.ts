export interface PasswordValidationResult {
  isValid: boolean;
  score: number; // 0 to 5
  errors: string[];
  hasMinLength: boolean;
  hasLetter: boolean;
  hasUppercase: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
}

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];
  const hasMinLength = password.length >= 8;
  const hasLetter = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[^a-zA-Z0-9]/.test(password);

  if (!hasMinLength) {
    errors.push("At least 8 characters long");
  }
  if (!hasLetter) {
    errors.push("At least one lowercase letter");
  }
  if (!hasUppercase) {
    errors.push("At least one uppercase letter (A-Z)");
  }
  if (!hasNumber) {
    errors.push("At least one number");
  }
  if (!hasSpecialChar) {
    errors.push("At least one special character (!@#$%^&*)");
  }

  let score = 0;
  if (hasMinLength) score++;
  if (hasLetter) score++;
  if (hasUppercase) score++;
  if (hasNumber) score++;
  if (hasSpecialChar) score++;

  return {
    isValid: errors.length === 0,
    score,
    errors,
    hasMinLength,
    hasLetter,
    hasUppercase,
    hasNumber,
    hasSpecialChar,
  };
}
