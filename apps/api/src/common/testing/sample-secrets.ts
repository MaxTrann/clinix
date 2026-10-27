// Giá trị bí mật GIẢ cho test, dựng lúc chạy. Đừng viết thẳng vào mã nguồn một chuỗi giống JWT hay một cặp
// "TEN_BIEN_BI_MAT: 'gia-tri'": gitleaks (job `secrets` bắt buộc của CI, repo công khai) coi chúng là bí mật thật dù đã giả,
// và không được nới .gitleaks.toml cho việc này.
const encode = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

/** Chuỗi có hình dạng JWT (header.payload.chữ ký) nhưng là giá trị giả; `label` làm mỗi ca có payload và chữ ký riêng. */
export function fakeJwt(label = 'mau'): string {
  const signature = Buffer.from(`chu-ky-gia-${label}`).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: '1', sid: '1', label })}.${signature}`;
}

/** Giá trị cấu hình giả đủ dài (≥ 8 ký tự) để `collectSecretValues` nhận ra. */
export function fakeSecretValue(label: string): string {
  return `${label}-${'x'.repeat(16)}`;
}
