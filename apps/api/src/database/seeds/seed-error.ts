// Chỉ mã cố định được phép ra CLI; lỗi driver có thể chứa SQL, băm hoặc thông tin kết nối.
export class SeedError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
