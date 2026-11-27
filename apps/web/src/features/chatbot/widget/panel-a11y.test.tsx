import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { createFakeChatbotApi } from '../testing/fake-chatbot-api';
import { reply, chu, thucThe, traLoi } from '../testing/reply-fixtures';
import {
  acceptConsent,
  composer,
  launcher,
  openAndAsk,
  openWidget,
  pressKey,
  queryLauncher,
  renderWidget,
  resetWidgetTest,
  sendButton,
  typeQuestion,
} from '../testing/render-widget';

// Chatbot F1, WTL-09: bàn phím, trình đọc màn hình, màn hẹp. Dự án không có `user-event`: chuỗi phím dựng bằng `fireEvent.keyDown`.
// KHÔNG kiểm được ở đây (happy-dom không có bố cục, Vitest chạy `css: false`): "không tràn ngang", "không che nút chính ở 375 px",
// vị trí thật của nút nổi. Việc đó là KTL-07 của X2; ở đây chỉ khoá cấu trúc lớp.
afterEach(resetWidgetTest);

const dialog = () => screen.getByRole('dialog', { name: 'Trợ lý AI' });

describe('hộp thoại màn rộng (từ 640 px)', () => {
  it('WTL-09 `role="dialog"` có tên, KHÔNG `aria-modal`, trang phía sau không bị `inert` (hộp không chặn trang)', () => {
    const { container } = renderWidget({ width: 1024 });
    openWidget();

    expect(dialog()).not.toHaveAttribute('aria-modal');
    expect(container).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('');
    expect(dialog().className).toContain('w-[520px]');
    expect(dialog().className).toContain('max-w-[calc(100vw-2rem)]');
  });

  it('WTL-09 không bẫy Tab: Tab ở phần tử cuối không bị chặn (trang phía sau vẫn dùng được)', () => {
    renderWidget({ width: 1024 });
    openWidget();
    const notPrevented = fireEvent.keyDown(
      screen.getByRole('button', { name: 'Tôi hiểu' }),
      {
        key: 'Tab',
      },
    );
    expect(notPrevented).toBe(true);
  });

  it('WTL-09 `Esc` đóng khung và trả tiêu điểm về nút mở', () => {
    renderWidget({ width: 1024 });
    openWidget();
    acceptConsent();
    expect(document.activeElement).toBe(composer());

    pressKey(composer(), 'Escape');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(launcher());
    expect(launcher()).toHaveAttribute('aria-expanded', 'false');
  });

  it('WTL-09 nút "Đóng Trợ lý AI" và bấm lại nút nổi cũng đóng, tiêu điểm về nút nổi', () => {
    renderWidget({ width: 1024 });
    openWidget();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng Trợ lý AI' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(launcher());

    openWidget();
    fireEvent.click(launcher());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('WTL-09 mở lại khi đã đồng ý thì tiêu điểm vào thẳng ô nhập', () => {
    renderWidget({ width: 1024 });
    openWidget();
    acceptConsent();
    pressKey(composer(), 'Escape');

    openWidget();

    expect(document.activeElement).toBe(composer());
  });

  it('WTL-09 `Esc` ở phần tử ngoài hộp (khung rộng không chặn trang) không đóng khung', () => {
    renderWidget({ width: 1024 });
    openWidget();
    pressKey(document.body, 'Escape');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('ô nhập (WTL-09)', () => {
  it('WTL-09 `Enter` gửi, `Shift+Enter` KHÔNG gửi và không bị chặn (xuống dòng)', () => {
    const fake = createFakeChatbotApi();
    renderWidget({ fake });
    openWidget();
    acceptConsent();
    typeQuestion('Dòng một');

    const newLine = fireEvent.keyDown(composer(), {
      key: 'Enter',
      shiftKey: true,
    });
    expect(newLine).toBe(true);
    expect(fake.calls).toHaveLength(0);

    const sent = fireEvent.keyDown(composer(), { key: 'Enter' });
    expect(sent).toBe(false);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.body.cauHoi).toBe('Dòng một');
  });

  it('WTL-09 `Enter` khi đang gõ dấu tiếng Việt (IME, mã 229) KHÔNG gửi', () => {
    const fake = createFakeChatbotApi();
    renderWidget({ fake });
    openWidget();
    acceptConsent();
    typeQuestion('Xin chao');

    fireEvent.keyDown(composer(), { key: 'Enter', isComposing: true });
    fireEvent.keyDown(composer(), { key: 'Enter', keyCode: 229 });

    expect(fake.calls).toHaveLength(0);
    expect(composer()).toHaveValue('Xin chao');
  });

  it('WTL-09 phím khác Enter không gửi', () => {
    const fake = createFakeChatbotApi();
    renderWidget({ fake });
    openWidget();
    acceptConsent();
    typeQuestion('abc');
    for (const key of ['a', 'Tab', ' ', 'ArrowUp']) pressKey(composer(), key);
    expect(fake.calls).toHaveLength(0);
  });

  it('WTL-09 bộ đếm theo điểm mã; quá 500 thì ô nhập báo không hợp lệ và trỏ tới chữ báo (`aria-describedby`)', () => {
    renderWidget();
    openWidget();
    acceptConsent();
    expect(screen.getByText('0/500')).toBeInTheDocument();
    expect(composer()).toHaveAttribute('aria-invalid', 'false');

    typeQuestion('abc');
    expect(screen.getByText('3/500')).toBeInTheDocument();

    typeQuestion('a'.repeat(501));
    expect(composer()).toHaveAttribute('aria-invalid', 'true');
    const describedBy = composer().getAttribute('aria-describedby')!;
    expect(document.getElementById(describedBy)).toHaveTextContent(
      'Câu hỏi cần từ 1 đến 500 ký tự.',
    );
  });

  it('WTL-09 vùng tin có `role="log"`, đọc tin mới (`aria-live="polite"`) và có tên', async () => {
    renderWidget({
      fake: createFakeChatbotApi({ answers: [traLoi('Đáp mới')] }),
    });
    openAndAsk('Hỏi');
    await screen.findByText('Đáp mới');

    const log = screen.getByRole('log', { name: 'Hội thoại với Trợ lý AI' });
    expect(log).toHaveAttribute('aria-live', 'polite');
    expect(log).toHaveTextContent('Đáp mới');
    expect(log).toHaveTextContent('Hỏi');
  });

  it('WTL-09 chữ đọc cho trình đọc màn hình: ai nói câu nào (`sr-only`), không chỉ dựa vào vị trí và màu', async () => {
    renderWidget({
      fake: createFakeChatbotApi({ answers: [traLoi('Đáp mới')] }),
    });
    openAndAsk('Hỏi');
    await screen.findByText('Đáp mới');
    const log = screen.getByRole('log');
    expect(log).toHaveTextContent('Bạn: Hỏi');
    expect(log).toHaveTextContent('Trợ lý AI: Đáp mới');
  });
});

describe('hộp thoại màn hẹp (dưới 640 px)', () => {
  it('WTL-09 toàn màn hình, `aria-modal`, trang phía sau `inert`, khoá cuộn', () => {
    const { container } = renderWidget({ width: 375 });
    openWidget();

    expect(dialog()).toHaveAttribute('aria-modal', 'true');
    expect(dialog().className).toContain('inset-0');
    expect(dialog().className).not.toContain('w-[520px]');
    expect(container).toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('hidden');
    expect(dialog().parentElement).toBe(document.body);
  });

  it('WTL-09 giữ tiêu điểm trong hộp: Tab ở phần tử cuối quay về đầu, Shift+Tab ở đầu quay về cuối', () => {
    renderWidget({ width: 375 });
    openWidget();
    const close = screen.getByRole('button', { name: 'Đóng Trợ lý AI' });
    const accept = screen.getByRole('button', { name: 'Tôi hiểu' });
    expect(document.activeElement).toBe(accept);

    // `Tôi hiểu` là phần tử nhận Tab cuối (các nút còn lại bị khoá), "Đóng" là đầu
    expect(fireEvent.keyDown(accept, { key: 'Tab' })).toBe(false);
    expect(document.activeElement).toBe(close);
    expect(fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })).toBe(
      false,
    );
    expect(document.activeElement).toBe(accept);
  });

  it('WTL-09 `Esc` đóng, trả tiêu điểm về nút nổi, gỡ `inert` và khoá cuộn', () => {
    const { container } = renderWidget({ width: 375 });
    openWidget();
    pressKey(document.activeElement!, 'Escape');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(container).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(launcher());
  });

  it('WTL-09 đang mở mà đổi từ 375 sang 1024 px: không mất lịch sử, trở thành hộp không chặn trang', async () => {
    const { media, container } = renderWidget({
      width: 375,
      fake: createFakeChatbotApi({ answers: [traLoi('Đáp 1')] }),
    });
    openAndAsk('Hỏi 1');
    await screen.findByText('Đáp 1');

    act(() => media.resize(1024));

    expect(dialog()).not.toHaveAttribute('aria-modal');
    expect(container).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('');
    expect(screen.getByText('Hỏi 1')).toBeInTheDocument();
    expect(screen.getByText('Đáp 1')).toBeInTheDocument();
  });

  it('WTL-09 màn hẹp: bấm liên kết trong tin đóng khung nhưng GIỮ lịch sử (Đ7)', async () => {
    renderWidget({
      width: 375,
      fake: createFakeChatbotApi({
        answers: [
          reply({ doan: [chu('Gặp '), thucThe('BacSi', '12', 'BS. Mẫu')] }),
        ],
      }),
    });
    openAndAsk('Hỏi 1');
    fireEvent.click(await screen.findByRole('link', { name: 'BS. Mẫu' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.body.style.overflow).toBe('');
    openWidget();
    expect(screen.getByText('Hỏi 1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'BS. Mẫu' })).toBeInTheDocument();
  });

  it('WTL-09 màn rộng: bấm liên kết trong tin KHÔNG đóng khung (hộp không chặn trang)', async () => {
    const { router } = renderWidget({
      width: 1024,
      fake: createFakeChatbotApi({
        answers: [
          reply({ doan: [chu('Gặp '), thucThe('BacSi', '12', 'BS. Mẫu')] }),
        ],
      }),
    });
    openAndAsk('Hỏi 1');
    fireEvent.click(await screen.findByRole('link', { name: 'BS. Mẫu' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/bac-si/12'),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Hỏi 1')).toBeInTheDocument();
  });

  it('WTL-09 nút nổi nằm dưới mọi lớp phủ và có tên đọc được cả khi chỉ còn biểu tượng (dưới 640 px)', () => {
    renderWidget({ width: 375 });
    expect(launcher().className).toContain('z-30');
    expect(launcher()).toHaveAccessibleName('Trợ lý AI');
    expect(queryLauncher()).not.toBeNull();
  });
});

describe('thao tác xung quanh ô nhập', () => {
  it('F1-12 bấm nút gửi bằng chuột giữ tiêu điểm ở ô nhập (mousedown không cướp tiêu điểm)', () => {
    renderWidget();
    openWidget();
    acceptConsent();
    typeQuestion('abc');
    const accepted = fireEvent.mouseDown(sendButton());
    expect(accepted).toBe(false);
    expect(document.activeElement).toBe(composer());
  });
});
