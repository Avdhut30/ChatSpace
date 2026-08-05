export function normalizeUsername(value = '') {
  return value.trim().toLowerCase().replace(/^@+/, '');
}

export function isValidUsername(value) {
  return /^[a-z0-9_]{3,24}$/.test(normalizeUsername(value));
}

export function normalizePhoneNumber(value = '') {
  const compact = value.trim().replace(/[\s().-]/g, '');
  return compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
}

export function isValidPhoneNumber(value) {
  return /^\+[1-9]\d{7,14}$/.test(normalizePhoneNumber(value));
}

export function getIdentityLabel(person) {
  return person.username
    ? `${person.name || 'Chat member'} (@${person.username})`
    : person.name || 'Chat member';
}
