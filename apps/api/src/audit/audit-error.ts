export type AuditErrorCode =
  | 'AUDIT_TRANSACTION_REQUIRED'
  | 'AUDIT_ENTRY_INVALID'
  | 'AUDIT_SENSITIVE_DATA'
  | 'AUDIT_ACTION_UNSUPPORTED'
  | 'AUDIT_WRITE_FAILED';

// Không nhận message/cause từ caller/driver: Error không được giữ SQL hoặc payload nhạy cảm.
export class AuditError extends Error {
  constructor(public readonly code: AuditErrorCode) {
    super(code);
    this.name = 'AuditError';
  }
}
