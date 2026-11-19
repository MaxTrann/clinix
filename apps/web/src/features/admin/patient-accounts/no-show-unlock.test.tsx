import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  BRANCH,
  apiError,
  installFakeApi,
  type FakeApi,
  json,
  makeGate,
  makePatient,
  openDetail,
  renderPatientPage,
} from './testing/patient-accounts-test-kit';

// admin F9, "Mở khoá no-show" (mã TKF9-40 đến 47 là [đề xuất], TRACKING admin 9A.12 mục 3). Phủ TK-34 (nút chỉ khi cờ bật và chỉ Toàn hệ thống; báo rõ no-show
// kế tiếp có thể khoá lại ngay) và Q31. API giả có trạng thái ở mức hợp đồng B17, B19 và B5 (ngưỡng).

const DIALOG = 'Mở khoá no-show?';
const GENERAL =
  'No-show kế tiếp có thể khoá đặt lịch lại ngay nếu số lần còn ≥ ngưỡng.';
const noShowButton = () =>
  screen.queryByRole('button', { name: 'Mở khoá no-show' });
const locked = (n = 1, soLan = 3) =>
  makePatient(n, { khoaDatLichDoNoShow: true, soLanNoShow: soLan });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TKF9-40 TK-34: nút chỉ khi cờ bật và chỉ Toàn hệ thống', () => {
  it('TKF9-40 Toàn hệ thống × cờ bật: có nút; cờ tắt hoặc null: không có', async () => {
    installFakeApi({
      accounts: [
        locked(1),
        makePatient(2, { khoaDatLichDoNoShow: false }),
        makePatient(3, { khoaDatLichDoNoShow: null, soLanNoShow: null }),
      ],
    });
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    expect(noShowButton()).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng chi tiết' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await openDetail('Bệnh nhân 2');
    expect(noShowButton()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng chi tiết' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await openDetail('Bệnh nhân 3');
    expect(noShowButton()).toBeNull();
  });

  it('TKF9-40 Chi nhánh: KHÔNG có nút dù API (giả định lỗi) trả cờ bật; và không gọi /admin/system-config', async () => {
    const api = installFakeApi({
      scope: BRANCH,
      overfull: true,
      accounts: [locked(1)],
    });
    renderPatientPage({ scope: BRANCH });
    await openDetail('Bệnh nhân 1');
    expect(noShowButton()).toBeNull();
    expect(api.calls('GET', '/admin/system-config')).toHaveLength(0);
  });

  it('TKF9-40 chưa mở hộp thì chưa gọi cấu hình; mở hộp mới đọc ngưỡng, đúng một lần', async () => {
    const api = installFakeApi({ accounts: [locked(1)] });
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    expect(api.calls('GET', '/admin/system-config')).toHaveLength(0);
    fireEvent.click(noShowButton() as HTMLElement);
    await screen.findByRole('dialog', { name: DIALOG });
    await waitFor(() =>
      expect(api.calls('GET', '/admin/system-config')).toHaveLength(1),
    );
  });
});

describe('TKF9-41 hộp báo rõ no-show kế tiếp có thể khoá lại (Q31)', () => {
  it('TKF9-41 hộp có tên bệnh nhân, nói số lần được GIỮ NGUYÊN và câu chung về ngưỡng; không có ô nhập số lần', async () => {
    installFakeApi({ accounts: [locked(1, 3)] });
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    fireEvent.click(noShowButton() as HTMLElement);

    const dialog = await screen.findByRole('dialog', { name: DIALOG });
    expect(dialog).toHaveTextContent('Bệnh nhân 1');
    expect(dialog).toHaveTextContent(
      'Số lần no-show hiện tại (3) được giữ nguyên.',
    );
    expect(dialog).toHaveTextContent(GENERAL);
    // không có chỗ sửa số lần (UC 52 ngoài phạm vi)
    expect(within(dialog).queryByRole('textbox')).toBeNull();
    expect(within(dialog).queryByRole('spinbutton')).toBeNull();
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Huỷ', 'Mở khoá no-show']);
  });
});

describe('TKF9-42 câu cụ thể theo ngưỡng (S + 1 ≥ N theo mark-no-show.ts)', () => {
  it.each([
    // [số lần S, ngưỡng N, câu mong đợi]
    [
      3,
      3,
      'Ngưỡng hiện tại là 3 lần: chỉ cần thêm một lần no-show, đặt lịch sẽ bị khoá lại ngay.',
    ],
    [
      4,
      3,
      'Ngưỡng hiện tại là 3 lần: chỉ cần thêm một lần no-show, đặt lịch sẽ bị khoá lại ngay.',
    ],
    [
      2,
      3,
      'Ngưỡng hiện tại là 3 lần: chỉ cần thêm một lần no-show, đặt lịch sẽ bị khoá lại ngay.',
    ],
    [1, 3, 'Ngưỡng hiện tại là 3 lần, cao hơn số lần no-show hiện tại.'],
    [0, 5, 'Ngưỡng hiện tại là 5 lần, cao hơn số lần no-show hiện tại.'],
  ] as const)('TKF9-42 S=%s, N=%s', async (soLan, nguong, sentence) => {
    installFakeApi({
      accounts: [locked(1, soLan)],
      config: { chuaCauHinh: false, nguongNoShow: nguong },
    });
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    fireEvent.click(noShowButton() as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: DIALOG });
    await waitFor(() =>
      expect(within(dialog).getByRole('note')).toHaveTextContent(sentence),
    );
    expect(dialog).toHaveTextContent(GENERAL);
  });
});

describe('TKF9-43 ngưỡng chưa biết: CHỈ câu chung, không bịa số', () => {
  async function openWith(
    configure: (api: FakeApi) => void,
    config?: { chuaCauHinh: boolean; nguongNoShow: number | null },
  ) {
    const api = installFakeApi({ accounts: [locked(1, 3)], config });
    configure(api);
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    fireEvent.click(noShowButton() as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: DIALOG });
    // Chờ lời gọi đọc ngưỡng chạy xong (kể cả thất bại) rồi nhường thêm một nhịp cho giao diện vẽ lại
    await waitFor(() =>
      expect(api.calls('GET', '/admin/system-config')).toHaveLength(1),
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    return { api, dialog };
  }
  const expectGeneralOnly = (dialog: HTMLElement) => {
    expect(dialog).toHaveTextContent(GENERAL);
    expect(within(dialog).queryByRole('note')).toBeNull();
    expect(dialog.textContent).not.toMatch(/Ngưỡng hiện tại/);
  };

  it('TKF9-43 chưa cấu hình (nguongNoShow null, chuaCauHinh true)', async () => {
    const { dialog } = await openWith(() => undefined, {
      chuaCauHinh: true,
      nguongNoShow: null,
    });
    expectGeneralOnly(dialog);
  });

  it.each([
    ['403', () => apiError(403, 'KHONG_DU_QUYEN')],
    ['500', () => apiError(500, 'LOI_HE_THONG')],
    ['mất mạng', () => Promise.reject(new TypeError('Failed to fetch'))],
  ] as const)(
    'TKF9-43 đọc cấu hình lỗi (%s): chỉ câu chung, hộp vẫn dùng được',
    async (_label, respond) => {
      const { dialog } = await openWith((fake) =>
        fake.override((r) => r.path === '/admin/system-config', respond),
      );
      expectGeneralOnly(dialog);
      expect(
        within(dialog).getByRole('button', { name: 'Mở khoá no-show' }),
      ).toBeEnabled();
    },
  );

  it.each([[0], [-2], [2.5]])(
    'TKF9-43 ngưỡng không hợp lệ (%s): không đoán, chỉ câu chung',
    async (bad) => {
      const { dialog } = await openWith(() => undefined, {
        chuaCauHinh: false,
        nguongNoShow: bad,
      });
      expectGeneralOnly(dialog);
    },
  );

  it('TKF9-43 đang tải ngưỡng: chỉ có câu chung; khi ngưỡng về thì câu cụ thể xuất hiện', async () => {
    const gate = makeGate();
    const api = installFakeApi({ accounts: [locked(1, 3)] });
    api.override(
      (r) => r.path === '/admin/system-config',
      async () => {
        await gate.promise;
        return json({ chuaCauHinh: false, nguongNoShow: 3 });
      },
    );
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    fireEvent.click(noShowButton() as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: DIALOG });
    try {
      expectGeneralOnly(dialog);
    } finally {
      gate.open();
    }
    await waitFor(() =>
      expect(within(dialog).getByRole('note')).toHaveTextContent(
        'Ngưỡng hiện tại là 3 lần',
      ),
    );
  });
});

describe('TKF9-44 xác nhận: gọi đúng API, giữ số lần, tải lại', () => {
  it('TKF9-44 "Huỷ" không gọi POST; xác nhận gọi đúng MỘT POST …/unlock-no-show không thân', async () => {
    const api = installFakeApi({ accounts: [locked(1, 3)] });
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    fireEvent.click(noShowButton() as HTMLElement);
    let dialog = await screen.findByRole('dialog', { name: DIALOG });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Huỷ' }));
    expect(api.posts()).toHaveLength(0);

    fireEvent.click(noShowButton() as HTMLElement);
    dialog = await screen.findByRole('dialog', { name: DIALOG });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Mở khoá no-show' }),
    );

    expect(await screen.findByText('Đã mở khoá no-show.')).toBeInTheDocument();
    expect(api.posts()).toHaveLength(1);
    expect(api.posts()[0].path).toBe('/admin/accounts/1/unlock-no-show');
    expect(api.posts()[0].body).toBeUndefined();
    expect(screen.queryByRole('dialog', { name: DIALOG })).toBeNull();
  });

  it('TKF9-44 sau khi mở khoá: nút "Mở khoá no-show" BIẾN MẤT, cờ là "Không bị khoá", số lần no-show GIỮ NGUYÊN (3), trạng thái tài khoản không đổi', async () => {
    const api = installFakeApi({ accounts: [locked(1, 3)] });
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    fireEvent.click(noShowButton() as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: DIALOG });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Mở khoá no-show' }),
    );
    await screen.findByText('Đã mở khoá no-show.');

    const panel = await screen.findByRole('dialog', { name: 'Bệnh nhân 1' });
    await waitFor(() =>
      expect(within(panel).getByText('Không bị khoá')).toBeInTheDocument(),
    );
    expect(within(panel).getByText('3')).toBeInTheDocument();
    expect(within(panel).getByText('Đang hoạt động')).toBeInTheDocument();
    expect(noShowButton()).toBeNull();
    // chi tiết và danh sách được tải lại từ API
    expect(api.calls('GET', '/admin/accounts/1')).toHaveLength(2);
    await waitFor(() => expect(api.lists()).toHaveLength(2));
  });

  it('TKF9-44 xác nhận bấm hai lần trong cùng một lượt: đúng MỘT POST', async () => {
    const gate = makeGate();
    const api = installFakeApi({ accounts: [locked(1, 3)] });
    api.override(
      (r) => r.method === 'POST',
      async () => {
        await gate.promise;
        return json({ taiKhoanId: '1' });
      },
    );
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    fireEvent.click(noShowButton() as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: DIALOG });
    const confirm = within(dialog).getByRole('button', {
      name: 'Mở khoá no-show',
    }) as HTMLButtonElement;
    try {
      act(() => {
        confirm.click();
        confirm.click();
      });
      await waitFor(() => expect(api.posts()).toHaveLength(1));
    } finally {
      gate.open();
    }
    await screen.findByText('Đã mở khoá no-show.');
    expect(api.posts()).toHaveLength(1);
  });
});

describe('TKF9-45 lỗi khi mở khoá no-show', () => {
  it('TKF9-45 409 TRANG_THAI_KHONG_PHU_HOP (người khác đã mở trước): chữ đúng, hộp đóng, tải lại thì nút biến mất', async () => {
    const api = installFakeApi({ accounts: [locked(1, 3)] });
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    // Người khác vừa mở khoá no-show: trạng thái thật của API đã đổi, giao diện chưa biết
    api.accounts[0].khoaDatLichDoNoShow = false;
    fireEvent.click(noShowButton() as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: DIALOG });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Mở khoá no-show' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Trạng thái hiện tại của tài khoản không cho phép thao tác này.',
    );
    expect(screen.queryByRole('dialog', { name: DIALOG })).toBeNull();
    await waitFor(() => expect(noShowButton()).toBeNull());
    expect(api.calls('GET', '/admin/accounts/1')).toHaveLength(2);
  });

  it.each([
    [403, 'KHONG_DU_QUYEN', 'Bạn không có quyền thực hiện thao tác này.'],
    [
      400,
      'DU_LIEU_KHONG_HOP_LE',
      'Yêu cầu không hợp lệ. Vui lòng tải lại trang rồi thử lại.',
    ],
    [
      500,
      'LOI_HE_THONG',
      'Không thực hiện được. Tài khoản chưa bị thay đổi, vui lòng thử lại.',
    ],
  ] as const)('TKF9-45 %s %s', async (status, maLoi, text) => {
    const api = installFakeApi({ accounts: [locked(1, 3)] });
    api.override(
      (r) => r.method === 'POST',
      () => apiError(status, maLoi),
    );
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    fireEvent.click(noShowButton() as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: DIALOG });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Mở khoá no-show' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.queryByRole('dialog', { name: DIALOG })).toBeNull();
  });

  it('TKF9-45 400 "không phải Bệnh nhân" theo mã trường ra đúng chữ riêng', async () => {
    const api = installFakeApi({ accounts: [locked(1, 3)] });
    api.override(
      (r) => r.method === 'POST',
      () =>
        apiError(400, 'DU_LIEU_KHONG_HOP_LE', [
          { truong: 'id', ma: 'TAI_KHOAN_KHONG_PHAI_BENH_NHAN' },
        ]),
    );
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    fireEvent.click(noShowButton() as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: DIALOG });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Mở khoá no-show' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Chỉ mở khoá no-show được cho tài khoản Bệnh nhân.',
    );
  });
});

describe('TKF9-46 hộp no-show cũng không đụng bàn phím với panel', () => {
  it('TKF9-46 Esc đóng CHỈ hộp; panel trở lại; chỉ một hộp thoại tại một thời điểm', async () => {
    installFakeApi({ accounts: [locked(1, 3)] });
    renderPatientPage();
    await openDetail('Bệnh nhân 1');
    fireEvent.click(noShowButton() as HTMLElement);
    await screen.findByRole('dialog', { name: DIALOG });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: DIALOG })).toBeNull();
    expect(
      await screen.findByRole('dialog', { name: 'Bệnh nhân 1' }),
    ).toBeInTheDocument();
  });
});
