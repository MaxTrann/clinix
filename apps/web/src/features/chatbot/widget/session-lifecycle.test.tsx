import { act, fireEvent, screen } from '@testing-library/react';
import { setAuthState } from '../../auth/auth-store';
import type { ChatbotReply } from '../api/chatbot-types';
import { createFakeChatbotApi, deferred } from '../testing/fake-chatbot-api';
import { traLoi } from '../testing/reply-fixtures';
import {
  acceptConsent,
  askQuestion,
  composer,
  launcher,
  navigate,
  openAndAsk,
  openWidget,
  pressKey,
  queryLauncher,
  renderWidget,
  resetWidgetTest,
  setTestAuth,
  typeQuestion,
} from '../testing/render-widget';

// Chatbot F1, WTL-07: giữ lịch sử khi đổi trang, đóng mở; xoá khi "Xoá hội thoại" hay đăng xuất (và lời gọi đang chờ bị huỷ, kết quả muộn bị bỏ).
afterEach(resetWidgetTest);

function logout() {
  act(() => setAuthState({ status: 'unauthenticated', user: null }));
}

describe('giữ lịch sử (WTL-07)', () => {
  it('WTL-07 đổi trang: khung vẫn mở (màn rộng) và giữ nguyên hội thoại', async () => {
    const { router } = renderWidget({
      fake: createFakeChatbotApi({ answers: [traLoi('Đáp A')] }),
    });
    openAndAsk('Câu A');
    await screen.findByText('Đáp A');

    await navigate(router, '/chuyen-khoa/3');
    await navigate(router, '/bac-si');

    expect(router.state.location.pathname).toBe('/bac-si');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Câu A')).toBeInTheDocument();
    expect(screen.getByText('Đáp A')).toBeInTheDocument();
  });

  it('WTL-07 sang trang đăng nhập (nút ẩn) rồi quay lại: khung đã đóng nhưng hội thoại và "Tôi hiểu" còn nguyên', async () => {
    const { router } = renderWidget({
      fake: createFakeChatbotApi({ answers: [traLoi('Đáp A')] }),
    });
    openAndAsk('Câu A');
    await screen.findByText('Đáp A');

    await navigate(router, '/dang-nhap');
    expect(queryLauncher()).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();

    await navigate(router, '/');
    // Ẩn thì đóng: không tự mở lại phủ trang vừa quay về
    expect(screen.queryByRole('dialog')).toBeNull();
    openWidget();
    expect(screen.getByText('Câu A')).toBeInTheDocument();
    expect(screen.getByText('Đáp A')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tôi hiểu' })).toBeNull();
  });

  it('WTL-07 đóng rồi mở lại giữ cả hội thoại lẫn bản nháp đang gõ dở', async () => {
    renderWidget({
      fake: createFakeChatbotApi({ answers: [traLoi('Đáp A')] }),
    });
    openAndAsk('Câu A');
    await screen.findByText('Đáp A');
    typeQuestion('Bản nháp dở');

    fireEvent.click(screen.getByRole('button', { name: 'Đóng Trợ lý AI' }));
    openWidget();

    expect(screen.getByText('Câu A')).toBeInTheDocument();
    expect(composer()).toHaveValue('Bản nháp dở');
  });

  it('WTL-07 khách đăng nhập thành Bệnh nhân KHÔNG xoá hội thoại (Đ3)', async () => {
    renderWidget({
      role: 'guest',
      fake: createFakeChatbotApi({ answers: [traLoi('Đáp A')] }),
    });
    openAndAsk('Câu A');
    await screen.findByText('Đáp A');

    act(() => setTestAuth('BenhNhan'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Câu A')).toBeInTheDocument();
    expect(screen.getByText('Đáp A')).toBeInTheDocument();
  });

  it('WTL-07 phiên chuyển sang lỗi rồi đăng nhập lại: nút ẩn và khung đóng trong lúc chưa rõ vai, nhưng hội thoại KHÔNG bị xoá', async () => {
    renderWidget({
      role: 'BenhNhan',
      fake: createFakeChatbotApi({ answers: [traLoi('Đáp A')] }),
    });
    openAndAsk('Câu A');
    await screen.findByText('Đáp A');

    act(() => setTestAuth('error'));
    expect(queryLauncher()).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => setTestAuth('BenhNhan'));
    openWidget();

    expect(screen.getByText('Câu A')).toBeInTheDocument();
    expect(screen.getByText('Đáp A')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tôi hiểu' })).toBeNull();
  });
});

describe('xoá hội thoại (WTL-07)', () => {
  it('WTL-07 "Xoá hội thoại" xoá lượt và bản nháp; lần gửi kế tiếp có `lichSu` rỗng', async () => {
    const fake = createFakeChatbotApi({
      answers: [traLoi('Đáp A'), traLoi('Đáp B')],
    });
    renderWidget({ fake });
    openAndAsk('Câu A');
    await screen.findByText('Đáp A');
    typeQuestion('Nháp');

    fireEvent.click(screen.getByRole('button', { name: 'Xoá hội thoại' }));

    expect(screen.queryByText('Câu A')).toBeNull();
    expect(screen.queryByText('Đáp A')).toBeNull();
    expect(composer()).toHaveValue('');
    expect(
      screen.getByRole('button', { name: 'Xoá hội thoại' }),
    ).toBeDisabled();
    askQuestion('Câu B');
    await screen.findByText('Đáp B');
    expect(fake.calls[1]!.body.lichSu).toBeUndefined();
  });

  it('WTL-07 xoá khi đang chờ: lời gọi bị huỷ, kết quả về muộn KHÔNG hiện lại, gửi tiếp được ngay', async () => {
    const pending = deferred<ChatbotReply>();
    const fake = createFakeChatbotApi({
      answers: [pending.promise, traLoi('Đáp B')],
    });
    renderWidget({ fake });
    openAndAsk('Câu A');
    expect(screen.getByText('Đang trả lời…')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Xoá hội thoại' }));

    expect(fake.calls[0]!.signal.aborted).toBe(true);
    expect(screen.queryByText('Đang trả lời…')).toBeNull();
    await act(async () => pending.resolve(traLoi('Đáp muộn')));
    expect(screen.queryByText('Đáp muộn')).toBeNull();
    expect(screen.queryByText('Câu A')).toBeNull();

    askQuestion('Câu B');
    await screen.findByText('Đáp B');
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1]!.body.lichSu).toBeUndefined();
  });

  it('WTL-07 phản hồi của lượt đã xoá về muộn (đua với việc huỷ) KHÔNG hiện, KHÔNG mở khoá và KHÔNG làm mất khả năng huỷ lượt mới đang chờ', async () => {
    const lateA = deferred<ChatbotReply>();
    const pendingB = deferred<ChatbotReply>();
    const fake = createFakeChatbotApi({
      ignoreAbort: true,
      answers: [lateA.promise, pendingB.promise],
    });
    renderWidget({ fake });
    openAndAsk('Câu A');
    fireEvent.click(screen.getByRole('button', { name: 'Xoá hội thoại' }));
    askQuestion('Câu B');
    expect(fake.calls).toHaveLength(2);

    await act(async () => lateA.resolve(traLoi('Đáp muộn của A')));

    expect(screen.queryByText('Đáp muộn của A')).toBeNull();
    expect(screen.getByText('Đang trả lời…')).toBeInTheDocument();
    // Lượt B vẫn đang chờ: gửi thêm bằng Enter phải bị chặn
    typeQuestion('Câu C');
    pressKey(composer(), 'Enter');
    expect(fake.calls).toHaveLength(2);

    expect(fake.calls[1]!.body.lichSu).toBeUndefined();

    // Phản hồi muộn của A không được làm mất dấu lượt B: "Xoá hội thoại" lần nữa vẫn phải huỷ được lời gọi của B
    fireEvent.click(screen.getByRole('button', { name: 'Xoá hội thoại' }));
    expect(fake.calls[1]!.signal.aborted).toBe(true);
    await act(async () => pendingB.resolve(traLoi('Đáp B muộn')));
    expect(screen.queryByText('Đáp B muộn')).toBeNull();
    expect(screen.queryByText('Câu B')).toBeNull();
  });
});

describe('đăng xuất và hết phiên (WTL-07)', () => {
  it('WTL-07 đăng xuất: xoá hội thoại, bản nháp, đóng khung và hỏi lại "Tôi hiểu"', async () => {
    renderWidget({
      role: 'BenhNhan',
      fake: createFakeChatbotApi({ answers: [traLoi('Đáp A')] }),
    });
    openAndAsk('Câu A');
    await screen.findByText('Đáp A');
    typeQuestion('Nháp riêng');

    logout();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Câu A')).toBeNull();
    openWidget();
    expect(screen.queryByText('Câu A')).toBeNull();
    expect(screen.queryByText('Đáp A')).toBeNull();
    expect(composer()).toHaveValue('');
    expect(composer()).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Tôi hiểu' }),
    ).toBeInTheDocument();
  });

  it('WTL-07 đăng xuất khi đang chờ: lời gọi bị huỷ, kết quả muộn bị bỏ, người kế tiếp hỏi được và `lichSu` rỗng', async () => {
    const pending = deferred<ChatbotReply>();
    const fake = createFakeChatbotApi({
      answers: [pending.promise, traLoi('Đáp mới')],
    });
    renderWidget({ role: 'BenhNhan', fake });
    openAndAsk('Câu của người trước');

    logout();

    expect(fake.calls[0]!.signal.aborted).toBe(true);
    await act(async () => pending.resolve(traLoi('Đáp muộn của người trước')));
    expect(screen.queryByText('Đáp muộn của người trước')).toBeNull();

    openWidget();
    acceptConsent();
    askQuestion('Câu người sau');
    await screen.findByText('Đáp mới');
    expect(screen.queryByText('Câu của người trước')).toBeNull();
    expect(fake.calls[1]!.body.cauHoi).toBe('Câu người sau');
    expect(fake.calls[1]!.body.lichSu).toBeUndefined();
  });

  it('WTL-07 khách chưa từng đăng nhập: không có gì để xoá, hội thoại giữ nguyên khi trạng thái phiên lặp lại', async () => {
    renderWidget({
      role: 'guest',
      fake: createFakeChatbotApi({ answers: [traLoi('Đáp A')] }),
    });
    openAndAsk('Câu A');
    await screen.findByText('Đáp A');

    act(() => setTestAuth('guest'));

    expect(screen.getByText('Đáp A')).toBeInTheDocument();
    expect(launcher()).toBeInTheDocument();
  });
});
