import { act, screen, waitFor } from '@testing-library/react';
import { PATIENT_CHAT_PATH } from '../../../shared/routes/chat-paths';
import type { ChatbotReply } from '../api/chatbot-types';
import {
  createFakeChatbotApi,
  deferred,
  type FakeChatbot,
} from '../testing/fake-chatbot-api';
import {
  chu,
  duPhong,
  goiY,
  khanCap,
  khongCoChuyenKhoa,
  khongKhopDuLieu,
  ngoaiPhamVi,
  reply,
  taiKhoan,
  thucThe,
  traLoi,
} from '../testing/reply-fixtures';
import {
  openAndAsk,
  renderWidget,
  resetWidgetTest,
  type RenderWidgetOptions,
} from '../testing/render-widget';

// Chatbot F1, WTL-03 (hiện đang tải rồi chữ và liên kết đúng đích; không HTML) và WTL-05 (khẩn cấp, tài khoản, ngoài phạm vi, kênh lễ tân).
afterEach(resetWidgetTest);

async function showReply(
  r: ChatbotReply,
  options: RenderWidgetOptions = {},
): Promise<FakeChatbot> {
  const fake = options.fake ?? createFakeChatbotApi({ answers: [r] });
  renderWidget({ ...options, fake });
  openAndAsk('Câu hỏi thử');
  await waitFor(() =>
    expect(document.querySelector('[data-ket-qua]')).not.toBeNull(),
  );
  return fake;
}

describe('hiển thị phản hồi (WTL-03)', () => {
  it('WTL-03 gửi câu: hiện "Đang trả lời…" rồi thay bằng chữ trả lời', async () => {
    const pending = deferred<ChatbotReply>();
    renderWidget({
      fake: createFakeChatbotApi({ answers: [pending.promise] }),
    });
    openAndAsk('Phòng khám ở đâu?');

    expect(screen.getByText('Đang trả lời…')).toBeInTheDocument();
    expect(screen.getByText('Phòng khám ở đâu?')).toBeInTheDocument();

    await act(async () => pending.resolve(traLoi('Phòng khám ở Quận 1.')));

    expect(screen.queryByText('Đang trả lời…')).toBeNull();
    expect(screen.getByText('Phòng khám ở Quận 1.')).toBeInTheDocument();
  });

  it('WTL-03 tên bác sĩ, chuyên khoa, chi nhánh là liên kết tới đúng trang; chữ giữa các tên là chữ thường', async () => {
    await showReply(
      reply({
        doan: [
          chu('Gặp '),
          thucThe('BacSi', '12', 'BS. Nguyễn Mẫu'),
          chu(' ở '),
          thucThe('ChuyenKhoa', '3', 'Nội tổng quát'),
          chu(' tại '),
          thucThe('ChiNhanh', '2', 'CLINIX Quận 1'),
          chu(', giá 200.000 đồng.'),
        ],
      }),
    );

    expect(
      screen.getByRole('link', { name: 'BS. Nguyễn Mẫu' }),
    ).toHaveAttribute('href', '/bac-si/12');
    expect(screen.getByRole('link', { name: 'Nội tổng quát' })).toHaveAttribute(
      'href',
      '/chuyen-khoa/3',
    );
    expect(screen.getByRole('link', { name: 'CLINIX Quận 1' })).toHaveAttribute(
      'href',
      '/chi-nhanh/2',
    );
    // Giá là chữ thường, KHÔNG phải liên kết (hợp đồng `doan`)
    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(document.querySelector('[data-ket-qua]')).toHaveTextContent(
      'Gặp BS. Nguyễn Mẫu ở Nội tổng quát tại CLINIX Quận 1, giá 200.000 đồng.',
    );
  });

  it('WTL-03 dịch vụ, loại lạ và id hỏng KHÔNG thành liên kết (không bịa route); tên vẫn hiện', async () => {
    await showReply(
      reply({
        doan: [
          thucThe('DichVu', '5', 'Khám tổng quát'),
          chu(' | '),
          thucThe('LoaiMoi', '5', 'Loại mới'),
          chu(' | '),
          thucThe('BacSi', '0', 'Id không'),
          chu(' | '),
          thucThe('BacSi', '12a', 'Id chữ'),
          chu(' | '),
          thucThe('BacSi', '../admin', 'Id đường dẫn'),
        ],
      }),
    );

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    for (const name of [
      'Khám tổng quát',
      'Loại mới',
      'Id không',
      'Id chữ',
      'Id đường dẫn',
    ]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it('WTL-03 chữ chứa HTML hay markdown hiện nguyên văn: không sinh phần tử, không liên kết', async () => {
    const raw =
      '<img src=x onerror=alert(1)> <b>đậm</b> **in đậm** [bấm](http://x.test) <script>alert(2)</script>';
    await showReply(traLoi(raw));

    expect(document.querySelector('[data-ket-qua]')).toHaveTextContent(raw);
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('[data-ket-qua] b')).toBeNull();
    expect(document.querySelector('[data-ket-qua] strong')).toBeNull();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('WTL-03 xuống dòng của `chu` được giữ (pre-line); từ ba dòng trống liên tiếp gộp thành hai', async () => {
    await showReply(traLoi('Dòng 1\nDòng 2\n\n\n\nDòng 3'));

    const text = document.querySelector('[data-ket-qua] p');
    expect(text).toHaveClass('whitespace-pre-line');
    expect(text?.textContent).toBe('Dòng 1\nDòng 2\n\nDòng 3');
  });

  it('WTL-03 câu người dùng hiện nguyên chữ đã gõ (kể cả HTML), giữ xuống dòng', async () => {
    renderWidget({ fake: createFakeChatbotApi({ answers: [traLoi('ok')] }) });
    openAndAsk('<b>không đậm</b>\nDòng hai');
    await screen.findByText('ok');

    expect(document.querySelector('b')).toBeNull();
    const asked = screen.getByText(/không đậm/);
    expect(asked.textContent).toContain('<b>không đậm</b>\nDòng hai');
    expect(asked).toHaveClass('whitespace-pre-wrap');
  });

  it('WTL-03 `GoiY` ở F1 chỉ hiện phần chữ (thẻ gợi ý là của F2): không nút chọn chuyên khoa, không thẻ bác sĩ', async () => {
    await showReply(goiY());

    expect(screen.getByRole('link', { name: 'Nội tổng quát' })).toHaveAttribute(
      'href',
      '/chuyen-khoa/3',
    );
    expect(
      screen.queryByRole('button', { name: /Chọn chuyên khoa/ }),
    ).toBeNull();
    // Chỉ còn các nút của khung: đóng, gửi, xoá
    expect(
      screen
        .getAllByRole('button')
        .map(
          (button) => button.getAttribute('aria-label') ?? button.textContent,
        ),
    ).toEqual(
      expect.arrayContaining(['Đóng Trợ lý AI', 'Gửi', 'Xoá hội thoại']),
    );
    expect(screen.queryByText(/Đăng nhập để đặt lịch/)).toBeNull();
  });
});

describe('khẩn cấp, tài khoản, ngoài phạm vi, kênh lễ tân (WTL-05)', () => {
  it('WTL-05 `KhanCap`: khối nổi bật, nút gọi `tel:115`, địa chỉ chi nhánh từ máy chủ kèm liên kết chi nhánh', async () => {
    await showReply(khanCap());

    const block = document.querySelector('[data-ket-qua="KhanCap"]')!;
    expect(block).toHaveClass('bg-danger-soft');
    expect(block).toHaveTextContent(
      'Có thể là tình huống khẩn cấp. Hãy gọi 115',
    );
    expect(block).toHaveTextContent('12 Đường Mẫu, Quận 1.');
    expect(screen.getByRole('link', { name: 'Gọi 115' })).toHaveAttribute(
      'href',
      'tel:115',
    );
    expect(screen.getByRole('link', { name: 'CLINIX Quận 1' })).toHaveAttribute(
      'href',
      '/chi-nhanh/2',
    );
  });

  it('WTL-05 `KhanCap` luôn có nút gọi 115 dù máy chủ quên mã `GoiCapCuu`', async () => {
    await showReply(khanCap({ lienKet: [] }));
    expect(screen.getByRole('link', { name: 'Gọi 115' })).toHaveAttribute(
      'href',
      'tel:115',
    );
  });

  it('WTL-05 các kết quả khác không có nút gọi 115', async () => {
    await showReply(traLoi('Bình thường'));
    expect(screen.queryByRole('link', { name: 'Gọi 115' })).toBeNull();
  });

  it('WTL-05 `NhanTinLeTan` là liên kết "Nhắn lễ tân" tới đường dẫn gốc của trang Tin nhắn, không mang tham số bắt đầu trò chuyện', async () => {
    expect(PATIENT_CHAT_PATH).toBe('/benh-nhan/tin-nhan');
    for (const r of [khanCap(), duPhong(), khongKhopDuLieu()]) {
      await showReply(r);
      const link = screen.getByRole('link', { name: 'Nhắn lễ tân' });
      expect(link).toHaveAttribute('href', PATIENT_CHAT_PATH);
      expect(link.getAttribute('href')).not.toContain('?');
      resetWidgetTest();
    }
  });

  it('WTL-05 hiện `NhanTinLeTan` không gọi mạng nào ngoài lớp API hỏi đáp (không còn đọc đường dây nóng)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await showReply(khanCap());

    expect(
      screen.getByRole('link', { name: 'Nhắn lễ tân' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Gọi phòng khám/)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('WTL-05 `TaiKhoan` (Q4): chỉ liên kết tới "Lịch hẹn của tôi" và "Ví của tôi"', async () => {
    await showReply(taiKhoan());
    expect(
      screen.getByRole('link', { name: 'Lịch hẹn của tôi' }),
    ).toHaveAttribute('href', '/benh-nhan/lich-hen-cua-toi');
    expect(screen.getByRole('link', { name: 'Ví của tôi' })).toHaveAttribute(
      'href',
      '/benh-nhan/vi-cua-toi',
    );
  });

  it('WTL-05 `NgoaiPhamVi`, `KhongKhopDuLieu`, `KhongCoChuyenKhoa`: liên kết "Tra cứu bác sĩ và lịch khám" tới /bac-si', async () => {
    for (const r of [ngoaiPhamVi(), khongKhopDuLieu(), khongCoChuyenKhoa()]) {
      await showReply(r);
      expect(
        screen.getByRole('link', { name: 'Tra cứu bác sĩ và lịch khám' }),
      ).toHaveAttribute('href', '/bac-si');
      resetWidgetTest();
    }
  });

  it('WTL-05 mã liên kết trùng chỉ hiện một lần', async () => {
    await showReply(reply({ lienKet: ['ViCuaToi', 'ViCuaToi'] }));
    expect(screen.getAllByRole('link', { name: 'Ví của tôi' })).toHaveLength(1);
  });
});
