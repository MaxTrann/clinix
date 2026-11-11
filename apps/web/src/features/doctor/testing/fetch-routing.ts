type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export const EMPTY_LEAVE_HISTORY = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 5,
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Trang Lịch làm việc của Bác sĩ gọi HAI đường dẫn khi mở (lịch và lịch sử yêu cầu nghỉ): test cũ chỉ nói về lịch nên bọc `fetch` để lịch sử
// luôn trả danh sách rỗng, mọi đường dẫn khác chuyển cho `other` (doctor F4). Giữ ở `testing/` như `patient/testing/fake-profile-api.ts`.
export function withEmptyLeaveHistory(other: FetchLike): FetchLike {
  return (input, init) => {
    const url = String(input);
    const isHistory =
      url.includes('/doctor/leave-requests') &&
      (init?.method ?? 'GET') === 'GET';
    return isHistory
      ? Promise.resolve(jsonResponse(EMPTY_LEAVE_HISTORY))
      : other(input, init);
  };
}
