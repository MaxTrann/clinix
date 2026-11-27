import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ChatbotReply } from '../api/chatbot-types';
import {
  createFakeChatbotApi,
  type FakeChatbot,
} from '../testing/fake-chatbot-api';
import {
  chu,
  duPhong,
  goiY,
  khanCap,
  khongKhopDuLieu,
  ngoaiPhamVi,
  reply,
  taiKhoan,
  traLoi,
} from '../testing/reply-fixtures';
import {
  askQuestion,
  openAndAsk,
  renderWidget,
  resetWidgetTest,
} from '../testing/render-widget';
import { chooseSpecialty, showCard } from '../testing/suggest-harness';

// Chatbot F2: chỗ gắn thẻ gợi ý vào phản hồi (`reply-view.tsx`). WTL-14 (A4), F2-15 (lớp giả tới được thẻ), F2-17 (thẻ chỉ ở `GoiY`),
// F2-18 (mỗi phản hồi `GoiY` có thẻ riêng).
afterEach(resetWidgetTest);

// Câu A4 nguyên văn của chatbot B1 (`canned-answers.ts`), kèm mã liên kết `TraCuuBacSi` như máy chủ trả
const A4_TEXT =
  'Chưa xác định được chuyên khoa phù hợp. Hãy mô tả rõ hơn hoặc tự chọn chuyên khoa ở Tra cứu bác sĩ và lịch khám.';

async function showReply(r: ChatbotReply): Promise<FakeChatbot> {
  const fake = createFakeChatbotApi({ answers: [r] });
  renderWidget({ fake });
  openAndAsk('Câu hỏi thử');
  await waitFor(() =>
    expect(document.querySelector('[data-ket-qua]')).not.toBeNull(),
  );
  return fake;
}

describe('A4: không xác định được chuyên khoa (WTL-14)', () => {
  it('WTL-14 `KhongCoChuyenKhoa`: chữ A4 nguyên văn và liên kết "Tra cứu bác sĩ và lịch khám" tới `/bac-si`; KHÔNG có thẻ gợi ý và KHÔNG gọi API gợi ý', async () => {
    const fake = await showReply(
      reply({
        ketQua: 'KhongCoChuyenKhoa',
        doan: [chu(A4_TEXT)],
        lienKet: ['TraCuuBacSi'],
      }),
    );

    expect(screen.getByText(A4_TEXT)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Tra cứu bác sĩ và lịch khám' }),
    ).toHaveAttribute('href', '/bac-si');
    expect(
      screen.queryByRole('region', { name: 'Gợi ý đặt lịch khám' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Chọn chuyên khoa/ }),
    ).toBeNull();
    expect(fake.suggestCalls).toHaveLength(0);
    expect(fake.specialtyCalls).toHaveLength(0);
  });
});

describe('thẻ chỉ ở `GoiY` và `KhongKhopDuLieu` có chuyên khoa (F2-17)', () => {
  const FROM_SERVER = [{ chuyenKhoaId: '3', ten: 'Nội tổng quát' }];
  // Máy chủ có gửi `chuyenKhoaGoiY` ở loại khác (không đúng hợp đồng) thì web vẫn không vẽ thẻ
  const OTHERS: Array<[string, ChatbotReply]> = [
    ['TraLoi', traLoi('Đáp', { chuyenKhoaGoiY: FROM_SERVER })],
    ['NgoaiPhamVi', { ...ngoaiPhamVi(), chuyenKhoaGoiY: FROM_SERVER }],
    ['KhanCap', khanCap({ chuyenKhoaGoiY: FROM_SERVER })],
    ['TaiKhoan', { ...taiKhoan(), chuyenKhoaGoiY: FROM_SERVER }],
    ['DuPhong', duPhong({ chuyenKhoaGoiY: FROM_SERVER })],
  ];

  it.each(OTHERS)('F2-17 %s: không có thẻ gợi ý', async (_name, r) => {
    const fake = await showReply(r);
    expect(
      screen.queryByRole('region', { name: 'Gợi ý đặt lịch khám' }),
    ).toBeNull();
    expect(fake.suggestCalls).toHaveLength(0);
  });

  it('F2-17 `GoiY` có thẻ gợi ý', async () => {
    await showReply(goiY());
    expect(
      screen.getByRole('region', { name: 'Gợi ý đặt lịch khám' }),
    ).toBeInTheDocument();
  });
});

// Chatbot B3 giữ `chuyenKhoaGoiY` (đã lọc) ở `KhongKhopDuLieu` khi câu trả lời bị đối chiếu loại (`answer-reconciler.ts`, PLAN 5.4 bước 13). Ca F2-17 đầu tiên
// khẳng định `KhongKhopDuLieu` KHÔNG có thẻ là SAI hợp đồng B3; sửa sau khi đọc mã B3 (TRACKING 3.9).
describe('`KhongKhopDuLieu` giữ chuyên khoa đã lọc (F2-19)', () => {
  it('F2-19 `KhongKhopDuLieu` kèm `chuyenKhoaGoiY`: chữ "Chưa đủ dữ liệu…" vẫn hiện VÀ có thẻ chuyên khoa; chưa bấm thì chưa gọi API gợi ý', async () => {
    const fake = await showReply({
      ...khongKhopDuLieu(),
      chuyenKhoaGoiY: [{ chuyenKhoaId: '3', ten: 'Nội tổng quát' }],
    });

    expect(
      screen.getByText('Chưa đủ dữ liệu để trả lời chính xác phần này.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Gợi ý đặt lịch khám' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Chọn chuyên khoa này' }),
    ).toBeInTheDocument();
    expect(fake.suggestCalls).toHaveLength(0);
  });

  it('F2-19 `KhongKhopDuLieu` mà danh sách rỗng: chỉ chữ và liên kết, KHÔNG có thẻ', async () => {
    const fake = await showReply({ ...khongKhopDuLieu(), chuyenKhoaGoiY: [] });

    expect(
      screen.getByText('Chưa đủ dữ liệu để trả lời chính xác phần này.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Gợi ý đặt lịch khám' }),
    ).toBeNull();
    expect(fake.suggestCalls).toHaveLength(0);
    expect(fake.specialtyCalls).toHaveLength(0);
  });

  it('F2-19 chọn chuyên khoa từ thẻ ở `KhongKhopDuLieu` gọi API gợi ý đúng một lần', async () => {
    const fake = await showReply({
      ...khongKhopDuLieu(),
      chuyenKhoaGoiY: [{ chuyenKhoaId: '3', ten: 'Nội tổng quát' }],
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Chọn chuyên khoa này' }),
    );
    await screen.findByText(/Ngày sớm nhất còn giờ trống/);

    expect(fake.suggestCalls).toHaveLength(1);
    expect(fake.suggestCalls[0]!.params).toEqual({ chuyenKhoaId: '3' });
  });
});

describe('lớp API của khung tới được thẻ (F2-15, F2-18)', () => {
  it('F2-15 lớp giả truyền cho `ChatbotWidget` là lớp thẻ gợi ý dùng: không có lời gọi `fetch` nào ra ngoài', async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(new Response('{}', { status: 500 })),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const { fake } = await showCard();

    chooseSpecialty();
    await screen.findByText(/Có 2 bác sĩ/);

    expect(fake.suggestCalls).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('F2-18 hai phản hồi `GoiY` trong cùng hội thoại có hai thẻ độc lập: chọn ở thẻ này không đổi thẻ kia', async () => {
    const fake = createFakeChatbotApi({
      answers: [
        goiY({ chuyenKhoaGoiY: [{ chuyenKhoaId: '3', ten: 'Nội tổng quát' }] }),
        goiY({ chuyenKhoaGoiY: [{ chuyenKhoaId: '5', ten: 'Da liễu' }] }),
      ],
    });
    renderWidget({ fake });
    openAndAsk('Câu một');
    await screen.findByRole('region', { name: 'Gợi ý đặt lịch khám' });
    askQuestion('Câu hai');
    await waitFor(() =>
      expect(
        screen.getAllByRole('region', { name: 'Gợi ý đặt lịch khám' }),
      ).toHaveLength(2),
    );

    const [first, second] = screen.getAllByRole('region', {
      name: 'Gợi ý đặt lịch khám',
    });
    fireEvent.click(
      within(second!).getByRole('button', { name: 'Chọn chuyên khoa này' }),
    );
    await waitFor(() => expect(fake.suggestCalls).toHaveLength(1));

    expect(fake.suggestCalls[0]!.params.chuyenKhoaId).toBe('5');
    expect(
      within(first!).getByRole('button', { name: 'Chọn chuyên khoa này' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });
});
