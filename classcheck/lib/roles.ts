import type { Role } from './types';

export function homeFor(role: Role): string {
  switch (role) {
    case 'student':
      return '/attend';
    case 'instructor':
      return '/instructor';
    case 'admin':
      return '/admin';
  }
}
