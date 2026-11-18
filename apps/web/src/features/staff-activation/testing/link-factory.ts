import type { ActivationLink } from '../activation-link';

// Chuỗi base64url ngẫu nhiên sinh lúc chạy test: không có chuỗi bí mật nào nằm trong mã nguồn (gitleaks), và mỗi ca một giá trị khác nên
// một chỗ rò rỉ token không thể "khớp ngẫu nhiên" với giá trị cố định của ca khác. 32 byte ⇒ đúng 43 ký tự như token thật (Q25).
export function randomBase64Url(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function makeLink(id = '4217'): ActivationLink {
  return { id, token: randomBase64Url() };
}

export function fragmentOf(link: ActivationLink): string {
  return `#id=${link.id}&token=${link.token}`;
}
