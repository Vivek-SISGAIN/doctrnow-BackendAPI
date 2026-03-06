/**
 * Password hashing utilities
 */

export async function hashPassword(password: string): Promise<string> {
  // Use bcrypt or similar
  // bcrypt.hash(password, 12)
  throw new Error('Not implemented - use bcrypt or similar');
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  // Use bcrypt or similar
  // bcrypt.compare(password, hash)
  throw new Error('Not implemented - use bcrypt or similar');
}

