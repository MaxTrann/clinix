import { isSensitiveKey, redactText } from '../common/logging/sanitize.js';
import { AuditError } from './audit-error.js';

type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

// Chụp payload đồng bộ trước await, không gọi getter/toJSON và không giữ object mutable của caller.
export function copyAuditJson(
  input: unknown,
  ancestors = new WeakSet<object>(),
): JsonValue {
  if (input === null || typeof input === 'boolean') return input;
  if (typeof input === 'string') {
    if (redactText(input) !== input)
      throw new AuditError('AUDIT_SENSITIVE_DATA');
    return input;
  }
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input !== 'object' || ancestors.has(input))
    throw new AuditError('AUDIT_ENTRY_INVALID');
  const array = Array.isArray(input);
  if (
    Object.getPrototypeOf(input) !==
      (array ? Array.prototype : Object.prototype) &&
    Object.getPrototypeOf(input) !== null
  )
    throw new AuditError('AUDIT_ENTRY_INVALID');
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(descriptors);
  const values: Record<string, JsonValue> = {};
  ancestors.add(input);
  try {
    for (const key of keys) {
      if (typeof key !== 'string') throw new AuditError('AUDIT_ENTRY_INVALID');
      if (array && key === 'length') continue;
      if (isSensitiveKey(key)) throw new AuditError('AUDIT_SENSITIVE_DATA');
      const property = descriptors[key]!;
      if (
        !property.enumerable ||
        !Object.hasOwn(property, 'value') ||
        ['__proto__', 'constructor', 'prototype'].includes(key)
      )
        throw new AuditError('AUDIT_ENTRY_INVALID');
      values[key] = copyAuditJson(property.value, ancestors);
    }
    if (!array) return values;
    const length = (input as unknown[]).length;
    if (Object.keys(values).length !== length)
      throw new AuditError('AUDIT_ENTRY_INVALID');
    const result: JsonValue[] = [];
    for (let index = 0; index < length; index++) {
      if (!Object.hasOwn(values, String(index)))
        throw new AuditError('AUDIT_ENTRY_INVALID');
      result.push(values[index]!);
    }
    return result;
  } finally {
    ancestors.delete(input);
  }
}
