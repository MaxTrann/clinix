import type { EnvironmentVariables } from '../../config/env.validation.js';

// Ràng buộc liên quan nhiều biến hoặc cần NODE_ENV của khối `AI_…` (chatbot P1; PLAN 5.13). Gọi từ `crossFieldProblems` ở env.validation.ts.
// Thông báo chỉ nêu TÊN biến, không bao giờ in giá trị (khoá và địa chỉ có thể chứa thông tin nhạy cảm).

/**
 * `https` luôn được. `http` chỉ với `localhost` hay `127.0.0.1` khi NODE_ENV là development hoặc test (để dựng máy chủ giả).
 * Không nhận thông tin đăng nhập, `?` hay `#` trong địa chỉ: khoá chỉ đi bằng header, không bao giờ ở URL (HDA-12, HDA-13).
 */
export function isAllowedBaseUrl(value: string, nodeEnv: string): boolean {
  if (/[?#]/.test(value)) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username !== '' || url.password !== '') return false;
  if (url.protocol === 'https:') return true;
  return (
    url.protocol === 'http:' &&
    (nodeEnv === 'development' || nodeEnv === 'test') &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  );
}

export function chatbotProblems(env: EnvironmentVariables): string[] {
  const problems: string[] = [];
  const urls = [
    ['GROQ_BASE_URL', env.GROQ_BASE_URL],
    ['GEMINI_BASE_URL', env.GEMINI_BASE_URL],
  ] as const;
  for (const [name, value] of urls) {
    if (typeof value === 'string' && !isAllowedBaseUrl(value, env.NODE_ENV)) {
      problems.push(
        `${name}: phải là địa chỉ https (http chỉ cho localhost ở development hoặc test), không kèm tài khoản, ? hay #`,
      );
    }
  }
  if (
    typeof env.AI_IP_PER_MINUTE === 'number' &&
    typeof env.AI_IP_PER_DAY === 'number' &&
    env.AI_IP_PER_MINUTE > env.AI_IP_PER_DAY
  ) {
    problems.push(
      'AI_IP_PER_MINUTE: không được lớn hơn AI_IP_PER_DAY (trần mỗi phút phải nằm trong trần mỗi ngày)',
    );
  }
  return problems;
}
