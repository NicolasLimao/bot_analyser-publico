import type { Catalog, Department, User, Question } from './types.ts';

export function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function text(value: unknown, max = 4000): value is string {
  return (
    typeof value === 'string' && value.trim().length > 0 && value.length <= max
  );
}
export function keys(
  value: Record<string, unknown>,
  allowed: string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
function unique(values: string[]): boolean {
  return new Set(values).size === values.length;
}

export function isDepartment(value: unknown): value is Department {
  return (
    object(value) &&
    keys(value, ['id', 'name', 'active']) &&
    text(value.id, 128) &&
    text(value.name, 300) &&
    typeof value.active === 'boolean'
  );
}
export function isUser(value: unknown): value is User {
  return (
    object(value) &&
    keys(value, ['id', 'name', 'active', 'departmentIds']) &&
    text(value.id, 128) &&
    text(value.name, 300) &&
    typeof value.active === 'boolean' &&
    Array.isArray(value.departmentIds) &&
    value.departmentIds.length <= 1000 &&
    value.departmentIds.every((id) => text(id, 128)) &&
    unique(value.departmentIds)
  );
}
export function isQuestion(value: unknown): value is Question {
  return (
    object(value) &&
    keys(value, [
      'id',
      'name',
      'active',
      'accountId',
      'type',
      'questionMessage',
      'duration',
      'tries',
      'successMessage',
      'invalidMessage',
      'reasonMessage',
    ]) &&
    text(value.id, 128) &&
    text(value.name, 300) &&
    typeof value.active === 'boolean' &&
    text(value.accountId, 128) &&
    ['csat', 'nps'].includes(String(value.type)) &&
    text(value.questionMessage) &&
    Number.isSafeInteger(value.duration) &&
    (value.duration as number) > 0 &&
    Number.isSafeInteger(value.tries) &&
    (value.tries as number) >= 0 &&
    ['successMessage', 'invalidMessage', 'reasonMessage'].every(
      (key) =>
        typeof value[key] === 'string' && (value[key] as string).length <= 4000,
    )
  );
}
export function isCatalog(value: unknown): value is Catalog {
  if (
    !object(value) ||
    !keys(value, [
      'accountId',
      'source',
      'fetchedAt',
      'complete',
      'departments',
      'users',
      'questions',
    ])
  )
    return false;
  return (
    text(value.accountId, 128) &&
    ['simulated', 'digisac', 'snapshot'].includes(String(value.source)) &&
    typeof value.fetchedAt === 'string' &&
    Number.isFinite(Date.parse(value.fetchedAt)) &&
    typeof value.complete === 'boolean' &&
    Array.isArray(value.departments) &&
    value.departments.length <= 10_000 &&
    value.departments.every(isDepartment) &&
    Array.isArray(value.users) &&
    value.users.length <= 10_000 &&
    value.users.every(isUser) &&
    unique(value.departments.map((d) => d.id)) &&
    unique(value.users.map((u) => u.id)) &&
    (value.questions === undefined ||
      (object(value.questions) &&
        keys(value.questions, ['state', 'items']) &&
        ['ready', 'unavailable'].includes(String(value.questions.state)) &&
        Array.isArray(value.questions.items) &&
        value.questions.items.length <= 4000 &&
        value.questions.items.every(isQuestion) &&
        value.questions.items.every((q) => q.accountId === value.accountId) &&
        unique(value.questions.items.map((q) => q.id)) &&
        (value.questions.state === 'ready' ||
          value.questions.items.length === 0)))
  );
}
