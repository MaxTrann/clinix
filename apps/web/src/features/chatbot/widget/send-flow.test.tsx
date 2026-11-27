import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import {
  SELECTED_BRANCH_STORAGE_KEY,
  resetSelectedBranchForTest,
} from '../../../shared/branch-selection';
import type { ChatbotReply } from '../api/chatbot-types';
import { createFakeChatbotApi, deferred } from '../testing/fake-chatbot-api';
import { duPhong, traLoi } from '../testing/reply-fixtures';
import {
  askQuestion,
  composer,
  openAndAsk,
  openWidget,
  acceptConsent,
  pressKey,
  renderWidget,
  resetWidgetTest,
  sendButton,
  typeQuestion,
} from '../testing/render-widget';

// Chatbot F1: WTL-04 (`DuPhong` và lượt lỗi không vào `lichSu`; "Gửi lại"), WTL-06 (lỗi, giữ nội dung để gửi lại),
// WTL-08 (đúng một lời gọi mỗi lần gửi, `lichSu` tối đa 6 phần tử, `chiNhanhId`).
afterEach(resetWidgetTest);

const apiError = (status: number, maLoi: string) =>
  new ApiError(status, { maLoi, thongBao: 'x' });
const UNAVAILABLE = 'Trợ lý AI hiện không phản hồi, vui lòng thử lại sau';

describe('DuPhong và "Gửi lại" (WTL-04)', () => {
  it('WTL-04 `DuPhong`: hiện cả hai câu (A3 và câu dựng sẵn) và nút "Gửi lại"', async () => {
    renderWidget({ fake: createFakeChatbotApi({ answers: [duPhong()] }) });
    openAndAsk('Hỏi 1');

    const block = await screen.findByText(
      /Trợ lý AI không chẩn đoán, không kê đơn/,
    );
    expect(block).toHaveTextContent(UNAVAILABLE);
    expect(block.textContent).toBe(
      `${UNAVAILABLE}\n\nTrợ lý AI không chẩn đoán, không kê đơn. Trong lúc này bạn có thể tra cứu bác sĩ và lịch khám hoặc nhắn lễ tân.`,
    );
    expect(screen.getByRole('button', { name: 'Gửi lại' })).toBeInTheDocument();
  });

  it('WTL-04 gửi câu khác sau `DuPhong`: lượt `DuPhong` KHÔNG nằm trong `lichSu`', async () => {
    const fake = createFakeChatbotApi({
      answers: [duPhong(), traLoi('Đáp 2')],
    });
    renderWidget({ fake });
    openAndAsk('Hỏi 1');
    await screen.findByRole('button', { name: 'Gửi lại' });

    askQuestion('Hỏi 2');
    await screen.findByText('Đáp 2');

    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1]!.body.cauHoi).toBe('Hỏi 2');
    expect(fake.calls[1]!.body.lichSu).toBeUndefined();
  });

  it('WTL-04 kể cả khi máy chủ gửi cờ sai (`DuPhong` mà tinhVaoLichSu=true) lượt đó vẫn không vào `lichSu`', async () => {
    const fake = createFakeChatbotApi({
      answers: [duPhong({ tinhVaoLichSu: true }), traLoi('Đáp 2')],
    });
    renderWidget({ fake });
    openAndAsk('Hỏi 1');
    await screen.findByRole('button', { name: 'Gửi lại' });

    askQuestion('Hỏi 2');
    await screen.findByText('Đáp 2');

    expect(fake.calls[1]!.body.lichSu).toBeUndefined();
  });

  it('WTL-04 lượt bình thường vào `lichSu`, còn lượt `DuPhong` ở giữa thì bị bỏ', async () => {
    const fake = createFakeChatbotApi({
      answers: [traLoi('Đáp 1'), duPhong(), traLoi('Đáp 3'), traLoi('Đáp 4')],
    });
    renderWidget({ fake });
    openAndAsk('Hỏi 1');
    await screen.findByText('Đáp 1');
    askQuestion('Hỏi 2');
    await screen.findByRole('button', { name: 'Gửi lại' });
    askQuestion('Hỏi 3');
    await screen.findByText('Đáp 3');
    askQuestion('Hỏi 4');
    await screen.findByText('Đáp 4');

    expect(fake.calls[3]!.body.lichSu).toEqual([
      { vai: 'NguoiDung', noiDung: 'Hỏi 1' },
      { vai: 'TroLy', noiDung: 'Đáp 1' },
      { vai: 'NguoiDung', noiDung: 'Hỏi 3' },
      { vai: 'TroLy', noiDung: 'Đáp 3' },
    ]);
  });

  it('WTL-04 "Gửi lại": gửi lại đúng MỘT lần với cùng câu hỏi, thay chính lượt đó, nút biến mất khi thành công', async () => {
    const fake = createFakeChatbotApi({
      answers: [duPhong(), traLoi('Đã trả lời')],
    });
    renderWidget({ fake });
    openAndAsk('Hỏi 1');
    fireEvent.click(await screen.findByRole('button', { name: 'Gửi lại' }));

    await screen.findByText('Đã trả lời');

    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1]!.body.cauHoi).toBe('Hỏi 1');
    expect(fake.calls[1]!.body.lichSu).toBeUndefined();
    expect(screen.getAllByText('Hỏi 1')).toHaveLength(1);
    expect(screen.queryByText(/hiện không phản hồi/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Gửi lại' })).toBeNull();
  });

  it('WTL-04 "Gửi lại" chỉ có ở lượt CUỐI: gửi câu mới thì nút của lượt lỗi cũ biến mất', async () => {
    renderWidget({
      fake: createFakeChatbotApi({ answers: [duPhong(), traLoi('Đáp 2')] }),
    });
    openAndAsk('Hỏi 1');
    await screen.findByRole('button', { name: 'Gửi lại' });

    askQuestion('Hỏi 2');
    await screen.findByText('Đáp 2');

    expect(screen.queryByRole('button', { name: 'Gửi lại' })).toBeNull();
    // Lượt lỗi cũ vẫn còn chữ để người dùng thấy
    expect(screen.getByText(/hiện không phản hồi/)).toBeInTheDocument();
  });

  it('WTL-04 `DuPhong` mà máy chủ không cho gửi lại (coTheGuiLai=false) thì không có nút', async () => {
    renderWidget({
      fake: createFakeChatbotApi({
        answers: [duPhong({ coTheGuiLai: false })],
      }),
    });
    openAndAsk('Hỏi 1');
    await screen.findByText(/hiện không phản hồi/);
    expect(screen.queryByRole('button', { name: 'Gửi lại' })).toBeNull();
  });

  it('WTL-04 lượt có tinhVaoLichSu=false (không phải `DuPhong`) cũng không vào `lichSu`', async () => {
    const fake = createFakeChatbotApi({
      answers: [traLoi('Đáp 1', { tinhVaoLichSu: false }), traLoi('Đáp 2')],
    });
    renderWidget({ fake });
    openAndAsk('Hỏi 1');
    await screen.findByText('Đáp 1');
    askQuestion('Hỏi 2');
    await screen.findByText('Đáp 2');
    expect(fake.calls[1]!.body.lichSu).toBeUndefined();
  });
});

describe('lỗi và gửi lại (WTL-06)', () => {
  const CASES: Array<{
    name: string;
    error: Error;
    text: string;
    canRetry: boolean;
  }> = [
    {
      name: 'DU_LIEU_KHONG_HOP_LE (400)',
      error: apiError(400, 'DU_LIEU_KHONG_HOP_LE'),
      text: 'Câu hỏi cần từ 1 đến 500 ký tự.',
      canRetry: false,
    },
    {
      name: 'TRO_LY_HOI_QUA_NHANH (429)',
      error: apiError(429, 'TRO_LY_HOI_QUA_NHANH'),
      text: 'Bạn hỏi hơi nhanh. Đợi một chút rồi gửi lại.',
      canRetry: true,
    },
    {
      name: 'TRO_LY_DANG_BAN (503)',
      error: apiError(503, 'TRO_LY_DANG_BAN'),
      text: 'Trợ lý đang bận. Thử lại sau ít giây.',
      canRetry: true,
    },
    {
      name: 'LOI_HE_THONG (500)',
      error: apiError(500, 'LOI_HE_THONG'),
      text: UNAVAILABLE,
      canRetry: true,
    },
    {
      name: 'mất mạng',
      error: new NetworkError(),
      text: UNAVAILABLE,
      canRetry: true,
    },
    {
      name: 'quá giờ',
      error: new TimeoutError(),
      text: UNAVAILABLE,
      canRetry: true,
    },
    {
      name: 'phản hồi không dùng được',
      error: new UnexpectedResponseError(502),
      text: UNAVAILABLE,
      canRetry: true,
    },
  ];

  for (const { name, error, text, canRetry } of CASES) {
    it(`WTL-06 ${name}: đúng chữ, câu hỏi còn trong khung${canRetry ? ', gửi lại được' : ', không có nút gửi lại'}`, async () => {
      const fake = createFakeChatbotApi({
        answers: [error, traLoi('Lần sau được')],
      });
      renderWidget({ fake });
      openAndAsk('Câu hỏi giữ lại');

      expect(await screen.findByText(text)).toBeInTheDocument();
      expect(screen.getByText('Câu hỏi giữ lại')).toBeInTheDocument();
      // Ô nhập đã sẵn sàng cho câu tiếp theo
      expect(composer()).toBeEnabled();
      expect(fake.calls).toHaveLength(1);

      const retry = screen.queryByRole('button', { name: 'Gửi lại' });
      if (!canRetry) {
        expect(retry).toBeNull();
        return;
      }
      fireEvent.click(retry!);
      await screen.findByText('Lần sau được');
      expect(fake.calls).toHaveLength(2);
      expect(fake.calls[1]!.body.cauHoi).toBe('Câu hỏi giữ lại');
      expect(screen.queryByText(text)).toBeNull();
    });
  }

  it('WTL-06 lượt lỗi không vào `lichSu` của câu kế tiếp', async () => {
    const fake = createFakeChatbotApi({
      answers: [new NetworkError(), traLoi('Đáp 2')],
    });
    renderWidget({ fake });
    openAndAsk('Hỏi 1');
    await screen.findByText(UNAVAILABLE);
    askQuestion('Hỏi 2');
    await screen.findByText('Đáp 2');
    expect(fake.calls[1]!.body.lichSu).toBeUndefined();
  });

  it('WTL-06 bị huỷ (không phải lỗi thật) thì KHÔNG hiện chữ lỗi và bỏ lượt đang chờ', async () => {
    renderWidget({
      fake: createFakeChatbotApi({ answers: [new RequestAbortedError()] }),
    });
    openAndAsk('Hỏi 1');

    await waitFor(() => expect(screen.queryByText('Đang trả lời…')).toBeNull());
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
    expect(screen.queryByText('Hỏi 1')).toBeNull();
    expect(composer()).toBeEnabled();
  });
});

describe('một lời gọi mỗi lần gửi (WTL-08)', () => {
  it('WTL-08 hai lần bấm nút gửi trong CÙNG một nhịp (state chưa kịp vẽ lại) chỉ gửi MỘT lần', () => {
    const pending = deferred<ChatbotReply>();
    const fake = createFakeChatbotApi({ answers: [pending.promise] });
    renderWidget({ fake });
    openWidget();
    acceptConsent();
    typeQuestion('Hỏi một lần');

    act(() => {
      fireEvent.click(sendButton());
      fireEvent.click(sendButton());
    });

    expect(fake.calls).toHaveLength(1);
  });

  it('WTL-08 hai lần nhấn Enter liền nhau chỉ gửi MỘT lần', () => {
    const fake = createFakeChatbotApi({
      answers: [deferred<ChatbotReply>().promise],
    });
    renderWidget({ fake });
    openWidget();
    acceptConsent();
    typeQuestion('Hỏi một lần');

    act(() => {
      pressKey(composer(), 'Enter');
      pressKey(composer(), 'Enter');
    });

    expect(fake.calls).toHaveLength(1);
  });

  it('WTL-08 bấm câu gợi ý nhanh rồi Enter ngay: vẫn một lời gọi (câu đang gõ được giữ nguyên)', () => {
    const fake = createFakeChatbotApi({
      answers: [deferred<ChatbotReply>().promise],
    });
    renderWidget({ fake });
    openWidget();
    acceptConsent();
    typeQuestion('Đang gõ dở');

    act(() => {
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Phòng khám có những chuyên khoa nào?',
        }),
      );
      pressKey(composer(), 'Enter');
    });

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.body.cauHoi).toBe(
      'Phòng khám có những chuyên khoa nào?',
    );
    expect(composer()).toHaveValue('Đang gõ dở');
  });

  it('WTL-08 trong lúc chờ: nút gửi khoá, gõ tiếp được nhưng Enter không gửi; xong thì gửi được lại', async () => {
    const pending = deferred<ChatbotReply>();
    const fake = createFakeChatbotApi({
      answers: [pending.promise, traLoi('Đáp 2')],
    });
    renderWidget({ fake });
    openAndAsk('Hỏi 1');

    expect(screen.getByText('Đang trả lời…')).toBeInTheDocument();
    typeQuestion('Hỏi 2');
    expect(sendButton()).toBeDisabled();
    pressKey(composer(), 'Enter');
    expect(fake.calls).toHaveLength(1);
    expect(composer()).toHaveValue('Hỏi 2');

    await act(async () => pending.resolve(traLoi('Đáp 1')));
    expect(sendButton()).toBeEnabled();
    fireEvent.click(sendButton());
    await screen.findByText('Đáp 2');
    expect(fake.calls).toHaveLength(2);
  });

  it('WTL-08 mỗi lần gửi đúng một lời gọi và ô nhập được dọn sau khi gửi', async () => {
    const fake = createFakeChatbotApi({
      answers: [traLoi('Đáp 1'), traLoi('Đáp 2')],
    });
    renderWidget({ fake });
    openAndAsk('Hỏi 1');
    expect(composer()).toHaveValue('');
    await screen.findByText('Đáp 1');
    askQuestion('Hỏi 2');
    await screen.findByText('Đáp 2');
    expect(fake.calls).toHaveLength(2);
  });

  it('WTL-08 mỗi lời gọi mang một tín hiệu huỷ riêng chưa bị huỷ', async () => {
    const fake = createFakeChatbotApi();
    renderWidget({ fake });
    openAndAsk('Hỏi 1');
    await screen.findByText('Câu trả lời mẫu.');
    expect(fake.calls[0]!.signal.aborted).toBe(false);
  });

  it('WTL-08 `lichSu` gửi kèm tối đa 6 phần tử (ba cặp cuối), mỗi `noiDung` tối đa 800 điểm mã', async () => {
    const long = (n: number) => `Đáp ${n} ${'x'.repeat(900)}`;
    const fake = createFakeChatbotApi({
      answers: [1, 2, 3, 4, 5, 6].map((n) => traLoi(long(n))),
    });
    renderWidget({ fake });
    openWidget();
    acceptConsent();
    for (const n of [1, 2, 3, 4, 5, 6]) {
      askQuestion(`Hỏi ${n}`);
      await waitFor(() => expect(fake.calls).toHaveLength(n));
      await screen.findByText(new RegExp(`^Đáp ${n} x`));
    }

    const history = fake.calls[5]!.body.lichSu!;
    expect(history).toHaveLength(6);
    expect(history[0]).toEqual({ vai: 'NguoiDung', noiDung: 'Hỏi 3' });
    expect(history.map((turn) => turn.vai)).toEqual([
      'NguoiDung',
      'TroLy',
      'NguoiDung',
      'TroLy',
      'NguoiDung',
      'TroLy',
    ]);
    for (const turn of history) {
      expect(Array.from(turn.noiDung).length).toBeLessThanOrEqual(800);
    }
    expect(Array.from(history[1]!.noiDung)).toHaveLength(800);
    expect(history[5]!.noiDung.startsWith('Đáp 5 x')).toBe(true);
  });

  it('WTL-08 `chiNhanhId` lấy từ chi nhánh đang chọn; "Toàn quốc" hay chưa chọn thì không gửi trường này', async () => {
    const fake = createFakeChatbotApi({
      answers: [traLoi('a'), traLoi('b'), traLoi('c')],
    });
    renderWidget({ fake });
    openWidget();
    acceptConsent();

    askQuestion('Chưa chọn');
    await screen.findByText('a');

    window.localStorage.setItem(
      SELECTED_BRANCH_STORAGE_KEY,
      JSON.stringify({ chiNhanhId: '3', nguon: 'NguoiDung' }),
    );
    resetSelectedBranchForTest();
    askQuestion('Chi nhánh 3');
    await screen.findByText('b');

    window.localStorage.setItem(
      SELECTED_BRANCH_STORAGE_KEY,
      JSON.stringify({ chiNhanhId: null, nguon: 'NguoiDung' }),
    );
    resetSelectedBranchForTest();
    askQuestion('Toàn quốc');
    await screen.findByText('c');

    expect('chiNhanhId' in fake.calls[0]!.body).toBe(false);
    expect(fake.calls[1]!.body.chiNhanhId).toBe('3');
    expect('chiNhanhId' in fake.calls[2]!.body).toBe(false);
  });

  it('WTL-08 câu hỏi được cắt trắng đầu cuối trước khi gửi và khi hiển thị', async () => {
    const fake = createFakeChatbotApi();
    renderWidget({ fake });
    openAndAsk('   Có khám tối không?  \n');
    await screen.findByText('Câu trả lời mẫu.');
    expect(fake.calls[0]!.body.cauHoi).toBe('Có khám tối không?');
  });
});

describe('đầu vào hợp lệ (WTL-08, WTL-09)', () => {
  it('WTL-08 câu hỏi rỗng hay chỉ có khoảng trắng: không gửi được', () => {
    const fake = createFakeChatbotApi();
    renderWidget({ fake });
    openWidget();
    acceptConsent();

    expect(sendButton()).toBeDisabled();
    typeQuestion('   \n ');
    expect(sendButton()).toBeDisabled();
    pressKey(composer(), 'Enter');
    fireEvent.click(sendButton());

    expect(fake.calls).toHaveLength(0);
  });

  it('WTL-08 đúng 500 ký tự gửi được, 501 thì khoá nút, hiện chữ báo và Enter không gửi', async () => {
    const fake = createFakeChatbotApi();
    renderWidget({ fake });
    openWidget();
    acceptConsent();

    typeQuestion('a'.repeat(501));
    expect(sendButton()).toBeDisabled();
    expect(
      screen.getByText('Câu hỏi cần từ 1 đến 500 ký tự.'),
    ).toBeInTheDocument();
    expect(screen.getByText('501/500')).toBeInTheDocument();
    pressKey(composer(), 'Enter');
    expect(fake.calls).toHaveLength(0);
    // Không mất chữ đã gõ
    expect(composer()).toHaveValue('a'.repeat(501));

    typeQuestion('a'.repeat(500));
    expect(sendButton()).toBeEnabled();
    expect(screen.queryByText('Câu hỏi cần từ 1 đến 500 ký tự.')).toBeNull();
    fireEvent.click(sendButton());
    await screen.findByText('Câu trả lời mẫu.');
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.body.cauHoi).toBe('a'.repeat(500));
  });
});
