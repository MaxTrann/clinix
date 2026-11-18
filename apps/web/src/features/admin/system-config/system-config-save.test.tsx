import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { SystemConfig } from './system-config-types';
import {
  CONFIG_PATH,
  EMPTY_CONFIG,
  FULL_CONFIG,
  apiError,
  fieldOf,
  installFetch,
  json,
  openTab,
  reminderInputs,
  renderConfigPage,
  saveButton,
  typeInto,
  type RecordedRequest,
} from './testing/system-config-test-kit';

// admin F5, luồng lưu: hộp xác nhận, lý do, lỗi từng ô, giữ dữ liệu, chặn gửi hai lần, tạo lần đầu, nhắc lịch, trọng số, cảnh báo rời trang
// (PLAN CH-20, CH-04..08 phía giao diện, CH A1 đến A4; mã CHF5-26 đến CHF5-39 là [đề xuất], TRACKING admin 9A.8 mục 3).

const REASON = 'Tăng giờ giữ chỗ theo yêu cầu của phòng khám';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type PutHandler = (request: RecordedRequest) => Response | Promise<Response>;

// PUT mặc định: máy chủ áp phần được gửi lên cấu hình hiện có (trừ `lyDo`) rồi trả cấu hình mới
function setup(options: { config?: SystemConfig; put?: PutHandler } = {}) {
  const current = options.config ?? FULL_CONFIG;
  return installFetch((request) => {
    if (request.method === 'PUT')
      return (
        options.put ??
        ((req) => {
          const patch = { ...(req.body as Record<string, unknown>) };
          delete patch.lyDo;
          return json({ ...current, chuaCauHinh: false, ...patch });
        })
      )(request);
    return json(current);
  });
}

const confirmDialog = () =>
  screen.findByRole('dialog', {
    name: /^Xác nhận (lưu thay đổi|tạo cấu hình hệ thống)$/,
  });
const reasonBox = (dialog: HTMLElement) =>
  within(dialog).getByLabelText(/Lý do thay đổi/) as HTMLTextAreaElement;
const confirmButton = (dialog: HTMLElement) =>
  within(dialog).getByRole('button', { name: /^(Xác nhận lưu|Đang lưu…)$/ });

async function openDialog(): Promise<HTMLElement> {
  fireEvent.click(saveButton());
  return confirmDialog();
}

async function save(reason = REASON): Promise<HTMLElement> {
  const dialog = await openDialog();
  fireEvent.change(reasonBox(dialog), { target: { value: reason } });
  fireEvent.click(confirmButton(dialog));
  return dialog;
}

async function loaded() {
  await screen.findByLabelText(/Thời hạn giữ chỗ/);
}

describe('CHF5-26 lý do bắt buộc, 1 đến 500 ký tự, ngay trong hộp xác nhận (CH-04)', () => {
  it('CHF5-26 lý do trống hay chỉ khoảng trắng: lỗi ở ô lý do, focus ô lý do, KHÔNG gọi PUT', async () => {
    const api = setup();
    renderConfigPage();
    await loaded();
    typeInto('thoiGianGiuCho', '20');
    const dialog = await openDialog();

    for (const text of ['', '   ', '\n\t ']) {
      fireEvent.change(reasonBox(dialog), { target: { value: text } });
      fireEvent.click(confirmButton(dialog));
      const box = reasonBox(dialog);
      expect(box, JSON.stringify(text)).toHaveAttribute('aria-invalid', 'true');
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'Vui lòng nhập lý do thay đổi.',
      );
      expect(box).toHaveAccessibleDescription(/Vui lòng nhập lý do thay đổi\./);
      await waitFor(() => expect(document.activeElement).toBe(box));
    }
    expect(api.puts()).toHaveLength(0);
  });

  it('CHF5-26 gõ vào ô lý do thì lỗi biến mất; 501 ký tự bị chặn, 500 thì qua; bộ đếm tính sau trim', async () => {
    const api = setup();
    renderConfigPage();
    await loaded();
    typeInto('thoiGianGiuCho', '20');
    const dialog = await openDialog();

    fireEvent.click(confirmButton(dialog));
    expect(within(dialog).getByRole('alert')).toBeInTheDocument();
    fireEvent.change(reasonBox(dialog), { target: { value: 'a'.repeat(501) } });
    expect(within(dialog).queryByRole('alert')).toBeNull();
    expect(within(dialog).getByText('501/500')).toBeInTheDocument();
    fireEvent.click(confirmButton(dialog));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Lý do thay đổi không quá 500 ký tự.',
    );
    expect(api.puts()).toHaveLength(0);

    fireEvent.change(reasonBox(dialog), {
      target: { value: `  ${'a'.repeat(500)}  ` },
    });
    expect(within(dialog).getByText('500/500')).toBeInTheDocument();
    fireEvent.click(confirmButton(dialog));
    await waitFor(() => expect(api.puts()).toHaveLength(1));
  });
});

describe('CHF5-27 xác nhận ⇒ PUT đúng thân, "Đã lưu", bản đã lưu là PHẢN HỒI của máy chủ', () => {
  it('CHF5-27 một ô đổi ⇒ PUT chỉ có `lyDo` đã cắt và ô đó; sau đó hộp đóng, "Đã lưu cấu hình hệ thống.", ô và nút về trạng thái sạch', async () => {
    const api = setup();
    renderConfigPage();
    await loaded();
    typeInto('thoiGianGiuCho', '20');
    await save(`  ${REASON}  `);

    expect(
      await screen.findByText('Đã lưu cấu hình hệ thống.'),
    ).toBeInTheDocument();
    const puts = api.puts();
    expect(puts).toHaveLength(1);
    expect(puts[0]).toMatchObject({ method: 'PUT', path: CONFIG_PATH });
    // Đúng thân, không thừa khoá nào: các tham số không đổi KHÔNG được gửi
    expect(puts[0].body).toEqual({ lyDo: REASON, thoiGianGiuCho: 20 });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fieldOf('thoiGianGiuCho')).toHaveValue('20');
    expect(screen.queryByText('Đã sửa')).toBeNull();
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Hủy thay đổi' })).toBeDisabled();
  });

  it('CHF5-27 nhiều ô: số JSON, nhắc lịch giảm dần, trọng số dạng số; giá trị hiển thị sau đó là của PHẢN HỒI (máy chủ có thể chuẩn hoá)', async () => {
    const api = setup({
      put: () =>
        json({
          ...FULL_CONFIG,
          nguongNoShow: 4,
          thoiDiemNhacLich: [72, 48, 2],
          trongSoW1: 0.7,
          trongSoW2: 0.3,
          // máy chủ tự chỉnh thêm một giá trị: bản đã lưu phải theo phản hồi
          checkInTruocPhut: 45,
        }),
    });
    renderConfigPage();
    await loaded();
    typeInto('nguongNoShow', '4');
    typeInto('trongSoW1', '0,7');
    typeInto('trongSoW2', '0,3');
    // 72, 24, 2 ⇒ 72, 48, 2 (gõ theo thứ tự nào cũng được; gửi lên giảm dần)
    fireEvent.change(reminderInputs()[1], { target: { value: '48' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi (4)' }));
    const dialog = await confirmDialog();
    fireEvent.change(reasonBox(dialog), { target: { value: REASON } });
    fireEvent.click(confirmButton(dialog));

    await screen.findByText('Đã lưu cấu hình hệ thống.');
    expect(api.puts()[0].body).toEqual({
      lyDo: REASON,
      thoiDiemNhacLich: [72, 48, 2],
      nguongNoShow: 4,
      trongSoW1: 0.7,
      trongSoW2: 0.3,
    });
    expect(JSON.stringify(api.puts()[0].body)).not.toMatch(/"\d+(\.\d+)?"/);
    expect(fieldOf('checkInTruocPhut')).toHaveValue('45');
    expect(fieldOf('trongSoW1')).toHaveValue('0,70');
    expect(reminderInputs().map((input) => input.value)).toEqual([
      '72',
      '48',
      '2',
    ]);
  });

  it('CHF5-27 sau khi lưu, "Hủy thay đổi" quay về giá trị VỪA LƯU (không phải giá trị tải ban đầu); lý do cũ không còn', async () => {
    setup();
    renderConfigPage();
    await loaded();
    typeInto('thoiGianGiuCho', '20');
    await save();
    await screen.findByText('Đã lưu cấu hình hệ thống.');

    typeInto('thoiGianGiuCho', '25');
    fireEvent.click(screen.getByRole('button', { name: 'Hủy thay đổi' }));
    expect(fieldOf('thoiGianGiuCho')).toHaveValue('20');

    typeInto('thoiGianGiuCho', '30');
    const dialog = await openDialog();
    expect(reasonBox(dialog)).toHaveValue('');
  });
});

describe('CHF5-28 lỗi từng ô phía web: chuyển sang tab của ô sai đầu tiên và focus ô đó', () => {
  it('CHF5-28 ba ô sai ở ba tab: không PUT, tab đầu được chọn, ô sai đầu tiên (theo màn hình) nhận focus, mỗi tab có lỗi của mình', async () => {
    const api = setup();
    renderConfigPage();
    await loaded();
    typeInto('thoiGianGiuCho', '0');
    typeInto('soMucChoToiDa', 'x');
    typeInto('trongSoW1', '2');
    fireEvent.click(saveButton());

    expect(api.puts()).toHaveLength(0);
    expect(screen.queryByRole('dialog')).toBeNull();
    const first = fieldOf('thoiGianGiuCho');
    expect(first).toHaveAttribute('aria-invalid', 'true');
    expect(first).toHaveAccessibleDescription(
      'Từ 1 đến 60 phút. Nhập số nguyên từ 1 đến 60.',
    );
    await waitFor(() => expect(document.activeElement).toBe(first));

    openTab('Danh sách chờ & nhắc lịch');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Nhập số nguyên từ 0 đến 10.',
    );
    openTab('Quy tắc nâng cao');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Nhập số từ 0 đến 1, tối đa 2 chữ số thập phân.',
    );
  });

  it('CHF5-28 chỉ sai ở tab khác (tổng trọng số): chuyển sang tab "Quy tắc nâng cao", focus ô w1, lỗi ở CẢ HAI ô; sửa một ô thì cả hai hết lỗi', async () => {
    const api = setup();
    renderConfigPage();
    await loaded();
    typeInto('trongSoW1', '0,7');
    fireEvent.click(saveButton());

    expect(api.puts()).toHaveLength(0);
    expect(
      screen.getByRole('tab', { name: 'Quy tắc nâng cao' }),
    ).toHaveAttribute('aria-selected', 'true');
    const w1 = fieldOf('trongSoW1');
    await waitFor(() => expect(document.activeElement).toBe(w1));
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(2);
    for (const alert of alerts)
      expect(alert).toHaveTextContent('Tổng hai trọng số phải bằng 1,00.');
    expect(fieldOf('trongSoW2')).toHaveAttribute('aria-invalid', 'true');

    typeInto('trongSoW2', '0,3');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(w1).toHaveAttribute('aria-invalid', 'false');
    // Sửa xong thì lưu được
    fireEvent.click(saveButton());
    expect(await confirmDialog()).toBeInTheDocument();
  });

  it('CHF5-28 mốc nhắc lịch để trống: chuyển sang tab "Danh sách chờ & nhắc lịch", focus ô mốc đầu tiên, câu báo nêu miền', async () => {
    setup();
    renderConfigPage();
    await loaded();
    openTab('Danh sách chờ & nhắc lịch');
    fireEvent.click(screen.getByRole('button', { name: 'Thêm mốc' }));
    expect(reminderInputs()).toHaveLength(4);
    openTab('Lịch khám & tiếp đón');
    fireEvent.click(saveButton());

    expect(
      screen.getByRole('tab', { name: 'Danh sách chờ & nhắc lịch' }),
    ).toHaveAttribute('aria-selected', 'true');
    await waitFor(() =>
      expect(document.activeElement).toBe(reminderInputs()[0]),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Nhập từ 1 đến 5 mốc, mỗi mốc là số giờ nguyên từ 1 đến 720, không trùng nhau.',
    );
  });
});

describe('CHF5-29 máy chủ trả 400 theo ô: giữ dữ liệu, đóng hộp, gắn lỗi đúng ô và focus', () => {
  it('CHF5-29 CAU_HINH_GIA_TRI_KHONG_HOP_LE: lỗi ở ô, ô giữ giá trị đã gõ, lý do vẫn còn khi mở lại hộp', async () => {
    const api = setup({
      put: () =>
        apiError(400, 'DU_LIEU_KHONG_HOP_LE', [
          { truong: 'nguongNoShow', ma: 'CAU_HINH_GIA_TRI_KHONG_HOP_LE' },
        ]),
    });
    renderConfigPage();
    await loaded();
    typeInto('thoiGianGiuCho', '20');
    typeInto('nguongNoShow', '5');
    await save();

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.puts()).toHaveLength(1);
    const field = fieldOf('nguongNoShow');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Nhập số nguyên từ 1 đến 10.',
    );
    await waitFor(() => expect(document.activeElement).toBe(field));
    expect(field).toHaveValue('5');
    expect(fieldOf('thoiGianGiuCho')).toHaveValue('20');

    const dialog = await openDialog();
    expect(reasonBox(dialog)).toHaveValue(REASON);
  });

  it('CHF5-29 TONG_TRONG_SO_KHAC_1 ở hai ô w trong lúc đang ở tab khác: chuyển sang tab "Quy tắc nâng cao"', async () => {
    setup({
      put: () =>
        apiError(400, 'DU_LIEU_KHONG_HOP_LE', [
          { truong: 'trongSoW1', ma: 'TONG_TRONG_SO_KHAC_1' },
          { truong: 'trongSoW2', ma: 'TONG_TRONG_SO_KHAC_1' },
        ]),
    });
    renderConfigPage();
    await loaded();
    typeInto('thoiGianGiuCho', '20');
    await save();

    await waitFor(() =>
      expect(
        screen.getByRole('tab', { name: 'Quy tắc nâng cao' }),
      ).toHaveAttribute('aria-selected', 'true'),
    );
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    await waitFor(() =>
      expect(document.activeElement).toBe(fieldOf('trongSoW1')),
    );
  });
});

describe('CHF5-30 LY_DO_BAT_BUOC từ máy chủ: lỗi ở ô lý do, hộp VẪN MỞ', () => {
  it('CHF5-30 hộp không đóng, ô lý do báo lỗi và nhận focus, nội dung lý do còn nguyên; gõ vào thì hết lỗi', async () => {
    setup({
      put: () =>
        apiError(400, 'DU_LIEU_KHONG_HOP_LE', [
          { truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' },
        ]),
    });
    renderConfigPage();
    await loaded();
    typeInto('thoiGianGiuCho', '20');
    const dialog = await save();

    await waitFor(() =>
      expect(reasonBox(dialog)).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(
      screen.getByRole('dialog', { name: 'Xác nhận lưu thay đổi' }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Vui lòng nhập lý do thay đổi.',
    );
    expect(reasonBox(dialog)).toHaveValue(REASON);
    await waitFor(() => expect(document.activeElement).toBe(reasonBox(dialog)));
    fireEvent.change(reasonBox(dialog), { target: { value: `${REASON}!` } });
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });
});

describe('CHF5-31 KHONG_CO_THAY_DOI từ máy chủ', () => {
  it('CHF5-31 hộp đóng, dòng "Không có thay đổi nào để lưu." (không phải lỗi đỏ), bản nháp giữ nguyên', async () => {
    setup({ put: () => apiError(400, 'KHONG_CO_THAY_DOI') });
    renderConfigPage();
    await loaded();
    typeInto('thoiGianGiuCho', '20');
    await save();

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent(
      'Không có thay đổi nào để lưu.',
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fieldOf('thoiGianGiuCho')).toHaveValue('20');
  });
});

describe('CHF5-32 lỗi máy chủ, mạng, quyền: dữ liệu và lý do đã nhập được GIỮ NGUYÊN', () => {
  it('CHF5-32 500 LOI_HE_THONG: hộp mở, nói cấu hình CHƯA đổi; ô, lý do và nút còn dùng được', async () => {
    setup({ put: () => apiError(500, 'LOI_HE_THONG') });
    renderConfigPage();
    await loaded();
    typeInto('thoiGianGiuCho', '20');
    const dialog = await save();

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(
      'Không lưu được. Cấu hình chưa bị thay đổi, vui lòng thử lại.',
    );
    expect(reasonBox(dialog)).toHaveValue(REASON);
    expect(reasonBox(dialog)).toBeEnabled();
    expect(confirmButton(dialog)).toBeEnabled();
    expect(fieldOf('thoiGianGiuCho')).toHaveValue('20');
  });

  it('CHF5-32 mất mạng: nêu rõ "Chưa rõ cấu hình đã được lưu hay chưa."; hộp mở, dữ liệu giữ nguyên', async () => {
    setup({
      put: () => {
        throw new TypeError('Failed to fetch');
      },
    });
    renderConfigPage();
    await loaded();
    typeInto('thoiGianGiuCho', '20');
    const dialog = await save();

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Không có kết nối mạng');
    expect(alert).toHaveTextContent('Chưa rõ cấu hình đã được lưu hay chưa.');
    expect(reasonBox(dialog)).toHaveValue(REASON);
    expect(fieldOf('thoiGianGiuCho')).toHaveValue('20');
  });

  it('CHF5-32 403 KHONG_DU_QUYEN: hộp đóng, thông báo trên trang, bản nháp giữ nguyên', async () => {
    setup({ put: () => apiError(403, 'KHONG_DU_QUYEN') });
    renderConfigPage();
    await loaded();
    typeInto('thoiGianGiuCho', '20');
    await save();

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Bạn không có quyền thực hiện thao tác này.',
    );
    expect(fieldOf('thoiGianGiuCho')).toHaveValue('20');
  });
});

describe('CHF5-33 sau lỗi tạm thời bấm lại là gửi lại được', () => {
  it('CHF5-33 PUT lần đầu 500, lần hai thành công: hai PUT cùng một thân, cuối cùng "Đã lưu"', async () => {
    let attempts = 0;
    const api = setup({
      put: () => {
        attempts += 1;
        return attempts === 1
          ? apiError(500, 'LOI_HE_THONG')
          : json({ ...FULL_CONFIG, thoiGianGiuCho: 20 });
      },
    });
    renderConfigPage();
    await loaded();
    typeInto('thoiGianGiuCho', '20');
    const dialog = await save();
    await within(dialog).findByRole('alert');

    fireEvent.click(confirmButton(dialog));
    expect(
      await screen.findByText('Đã lưu cấu hình hệ thống.'),
    ).toBeInTheDocument();
    const puts = api.puts();
    expect(puts).toHaveLength(2);
    expect(puts[1].body).toEqual(puts[0].body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('CHF5-34 chặn gửi hai lần', () => {
  it('CHF5-34 hai lần bấm "Xác nhận lưu" trong cùng một lượt (React chưa kịp vẽ lại nút mờ) ⇒ đúng MỘT PUT', async () => {
    let release: ((response: Response) => void) | undefined;
    const api = setup({
      put: () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    });
    renderConfigPage();
    await loaded();
    typeInto('thoiGianGiuCho', '20');
    const dialog = await openDialog();
    fireEvent.change(reasonBox(dialog), { target: { value: REASON } });
    const button = confirmButton(dialog);

    act(() => {
      button.click();
      button.click();
    });
    expect(api.puts()).toHaveLength(1);

    // Đang lưu: nút "Đang lưu…", mọi điều khiển bị khoá, Esc không đóng hộp
    expect(confirmButton(dialog)).toHaveTextContent('Đang lưu…');
    expect(confirmButton(dialog)).toBeDisabled();
    expect(confirmButton(dialog)).toHaveAttribute('aria-busy', 'true');
    expect(reasonBox(dialog)).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Hủy' })).toBeDisabled();
    expect(fieldOf('thoiGianGiuCho')).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await act(async () => {
      release?.(json({ ...FULL_CONFIG, thoiGianGiuCho: 20 }));
    });
    expect(
      await screen.findByText('Đã lưu cấu hình hệ thống.'),
    ).toBeInTheDocument();
    expect(api.puts()).toHaveLength(1);
    expect(fieldOf('thoiGianGiuCho')).toBeEnabled();
  });

  it('CHF5-34 Hủy hay Esc khi chưa gửi: hộp đóng, không PUT, bản nháp và lý do giữ nguyên', async () => {
    const api = setup();
    renderConfigPage();
    await loaded();
    typeInto('thoiGianGiuCho', '20');
    const dialog = await openDialog();
    fireEvent.change(reasonBox(dialog), { target: { value: REASON } });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fieldOf('thoiGianGiuCho')).toHaveValue('20');

    const again = await openDialog();
    expect(reasonBox(again)).toHaveValue(REASON);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.puts()).toHaveLength(0);
  });
});

const REQUIRED_INPUTS = {
  soLichHenToiDaMoiHoSo: '3',
  soLanTuDoiLichToiDa: '2',
  checkInTruocPhut: '30',
  checkInSauPhut: '15',
  soNgayBaoTruocDoiGioLam: '3',
  trongSoW1: '0,6',
  trongSoW2: '0,4',
} as const;

describe('CHF5-35 chưa có cấu hình: tạo lần đầu (Q35, CH A3)', () => {
  it('CHF5-35 banner, 11 ô trống (không giá trị ngầm), 7 ô bắt buộc có dấu *, 5 ô còn lại có gợi ý "Mặc định", nút "Tạo cấu hình"', async () => {
    setup({ config: EMPTY_CONFIG });
    renderConfigPage();
    await loaded();

    expect(screen.getByRole('note')).toHaveTextContent(
      'Hệ thống chưa được cấu hình.',
    );
    expect(screen.getByRole('button', { name: 'Tạo cấu hình' })).toBeEnabled();
    expect(reminderInputs()).toHaveLength(0);
    for (const key of [
      'thoiGianGiuCho',
      'soLichHenToiDaMoiHoSo',
      'soLanTuDoiLichToiDa',
      'checkInTruocPhut',
      'checkInSauPhut',
      'thoiHanPhanHoiLoiMoi',
      'soMucChoToiDa',
      'nguongNoShow',
      'soNgayBaoTruocDoiGioLam',
      'trongSoW1',
      'trongSoW2',
    ] as const) {
      expect(fieldOf(key), key).toHaveValue('');
    }
    for (const key of Object.keys(
      REQUIRED_INPUTS,
    ) as (keyof typeof REQUIRED_INPUTS)[]) {
      expect(fieldOf(key), key).toHaveAttribute('aria-required', 'true');
      expect(fieldOf(key), key).not.toHaveAttribute('placeholder');
    }
    for (const key of [
      'thoiGianGiuCho',
      'thoiHanPhanHoiLoiMoi',
      'soMucChoToiDa',
      'nguongNoShow',
    ] as const) {
      expect(fieldOf(key), key).toHaveAttribute('placeholder', 'Mặc định');
      expect(fieldOf(key), key).not.toHaveAttribute('aria-required');
    }
  });

  it('CHF5-35 bấm Tạo cấu hình mà để trống: bảy ô bắt buộc báo "Vui lòng nhập giá trị.", ô bắt buộc đầu tiên nhận focus, KHÔNG gọi PUT', async () => {
    const api = setup({ config: EMPTY_CONFIG });
    renderConfigPage();
    await loaded();
    fireEvent.click(saveButton());

    expect(api.puts()).toHaveLength(0);
    expect(screen.queryByRole('dialog')).toBeNull();
    // Ô bắt buộc ĐẦU TIÊN theo thứ tự màn hình (ô giữ chỗ là tuỳ chọn nên bị bỏ qua) nhận focus
    await waitFor(() =>
      expect(document.activeElement).toBe(fieldOf('checkInTruocPhut')),
    );
    // Mỗi tab hiện đúng lỗi của các ô bắt buộc nằm trong tab đó: tab 1 có 4 ô (check-in sớm và muộn, số lịch/hồ sơ, số lần tự đổi), tab 2 không có ô bắt buộc,
    // tab 3 có 3 ô (số ngày báo trước, hai trọng số)
    const expectedPerTab: [string, number][] = [
      ['Lịch khám & tiếp đón', 4],
      ['Danh sách chờ & nhắc lịch', 0],
      ['Quy tắc nâng cao', 3],
    ];
    for (const [tab, count] of expectedPerTab) {
      openTab(tab);
      expect(screen.queryAllByRole('alert'), tab).toHaveLength(count);
      for (const alert of screen.queryAllByRole('alert'))
        expect(alert).toHaveTextContent('Vui lòng nhập giá trị.');
    }
    openTab('Lịch khám & tiếp đón');
    expect(fieldOf('thoiGianGiuCho')).toHaveAttribute('aria-invalid', 'false');
    expect(fieldOf('checkInTruocPhut')).toHaveAttribute('aria-invalid', 'true');
  });

  it('CHF5-35 nhập đủ bảy ô ⇒ hộp "Xác nhận tạo cấu hình hệ thống" liệt kê "Chưa có → giá trị"; PUT chỉ có bảy khoá + lyDo; sau lưu hiện đủ 12 giá trị của phản hồi, banner mất', async () => {
    const api = setup({
      config: EMPTY_CONFIG,
      // máy chủ điền 5 giá trị DEFAULT của DB
      put: () => json(FULL_CONFIG),
    });
    renderConfigPage();
    await loaded();
    for (const [key, value] of Object.entries(REQUIRED_INPUTS))
      typeInto(key as keyof typeof REQUIRED_INPUTS, value);
    fireEvent.click(screen.getByRole('button', { name: 'Tạo cấu hình' }));

    const dialog = await screen.findByRole('dialog', {
      name: 'Xác nhận tạo cấu hình hệ thống',
    });
    const items = within(dialog).getAllByRole('listitem');
    expect(items).toHaveLength(7);
    for (const item of items) expect(item).toHaveTextContent('Chưa có');
    fireEvent.change(reasonBox(dialog), {
      target: { value: 'Khởi tạo cấu hình' },
    });
    fireEvent.click(confirmButton(dialog));

    await screen.findByText('Đã lưu cấu hình hệ thống.');
    expect(api.puts()[0].body).toEqual({
      lyDo: 'Khởi tạo cấu hình',
      soLichHenToiDaMoiHoSo: 3,
      soLanTuDoiLichToiDa: 2,
      checkInTruocPhut: 30,
      checkInSauPhut: 15,
      soNgayBaoTruocDoiGioLam: 3,
      trongSoW1: 0.6,
      trongSoW2: 0.4,
    });
    expect(screen.queryByRole('note')).toBeNull();
    expect(fieldOf('thoiGianGiuCho')).toHaveValue('15');
    expect(fieldOf('nguongNoShow')).toHaveValue('3');
    expect(reminderInputs().map((input) => input.value)).toEqual([
      '72',
      '24',
      '2',
    ]);
    expect(
      screen.getByRole('button', { name: 'Lưu thay đổi' }),
    ).toBeInTheDocument();
  });

  it('CHF5-35 nhắc lịch là tuỳ chọn: thêm một mốc thì được gửi (kèm bảy ô bắt buộc), để trống thì vắng khoá; mốc trùng bị chặn', async () => {
    const api = setup({ config: EMPTY_CONFIG, put: () => json(FULL_CONFIG) });
    renderConfigPage();
    await loaded();
    for (const [key, value] of Object.entries(REQUIRED_INPUTS))
      typeInto(key as keyof typeof REQUIRED_INPUTS, value);
    openTab('Danh sách chờ & nhắc lịch');
    fireEvent.click(screen.getByRole('button', { name: 'Thêm mốc' }));
    fireEvent.click(screen.getByRole('button', { name: 'Thêm mốc' }));
    fireEvent.change(reminderInputs()[0], { target: { value: '48' } });
    fireEvent.change(reminderInputs()[1], { target: { value: '48' } });
    fireEvent.click(saveButton());
    expect(screen.getByRole('alert')).toHaveTextContent('không trùng nhau');
    expect(api.puts()).toHaveLength(0);

    fireEvent.change(reminderInputs()[1], { target: { value: '2' } });
    const dialog = await openDialog();
    fireEvent.change(reasonBox(dialog), { target: { value: 'Khởi tạo' } });
    fireEvent.click(confirmButton(dialog));
    await waitFor(() => expect(api.puts()).toHaveLength(1));
    expect(api.puts()[0].body).toMatchObject({ thoiDiemNhacLich: [48, 2] });
  });
});

describe('CHF5-36 danh sách mốc nhắc lịch: thêm, xoá, giới hạn 1 đến 5', () => {
  it('CHF5-36 cập nhật: tối đa 5 mốc (nút Thêm mờ), tối thiểu 1 (nút Xoá cuối mờ); đổi thứ tự không phải là thay đổi', async () => {
    setup();
    renderConfigPage();
    await loaded();
    openTab('Danh sách chờ & nhắc lịch');

    const add = screen.getByRole('button', { name: 'Thêm mốc' });
    fireEvent.click(add);
    fireEvent.click(add);
    expect(reminderInputs()).toHaveLength(5);
    expect(add).toBeDisabled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Xoá mốc nhắc lịch 5' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Xoá mốc nhắc lịch 4' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Xoá mốc nhắc lịch 3' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Xoá mốc nhắc lịch 2' }),
    );
    expect(reminderInputs().map((input) => input.value)).toEqual(['72']);
    expect(
      screen.getByRole('button', { name: 'Xoá mốc nhắc lịch 1' }),
    ).toBeDisabled();

    // Trả về đúng bộ ba cũ nhưng sai thứ tự: không đổi gì
    fireEvent.click(add);
    fireEvent.click(add);
    fireEvent.change(reminderInputs()[0], { target: { value: '2' } });
    fireEvent.change(reminderInputs()[1], { target: { value: '24' } });
    fireEvent.change(reminderInputs()[2], { target: { value: '72' } });
    expect(screen.queryByText('Đã sửa')).toBeNull();
    expect(screen.getByText('Chưa có thay đổi nào.')).toBeInTheDocument();
  });
});

describe('CHF5-37 trọng số: nhập `0,7`, gửi số 0.7', () => {
  it('CHF5-37 dấu phẩy hay chấm đều được, hộp hiện `0,60 → 0,70`, thân PUT là số (không chuỗi), hiển thị lại `0,70`', async () => {
    const api = setup();
    renderConfigPage();
    await loaded();
    openTab('Quy tắc nâng cao');
    typeInto('trongSoW1', '0,7');
    typeInto('trongSoW2', '0.3');
    fireEvent.click(saveButton());
    const dialog = await confirmDialog();
    const lines = within(dialog).getAllByRole('listitem');
    expect(lines[0]).toHaveTextContent('Trọng số đánh giá bác sĩ (w1)');
    expect(lines[0]).toHaveTextContent('0,60');
    expect(lines[0]).toHaveTextContent('0,70');
    fireEvent.change(reasonBox(dialog), { target: { value: REASON } });
    fireEvent.click(confirmButton(dialog));

    await screen.findByText('Đã lưu cấu hình hệ thống.');
    expect(api.puts()[0].body).toEqual({
      lyDo: REASON,
      trongSoW1: 0.7,
      trongSoW2: 0.3,
    });
    expect(
      typeof (api.puts()[0].body as Record<string, unknown>).trongSoW1,
    ).toBe('number');
    expect(fieldOf('trongSoW1')).toHaveValue('0,70');
    expect(fieldOf('trongSoW2')).toHaveValue('0,30');
  });
});

describe('CHF5-38 cảnh báo rời trang khi còn thay đổi chưa lưu', () => {
  const beforeUnload = () => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it('CHF5-38 có nháp: điều hướng trong app bị chặn bằng hộp "Rời khỏi trang?"; "Ở lại" giữ trang và nháp, "Rời khỏi trang" thì đi', async () => {
    setup();
    const { router } = renderConfigPage();
    await loaded();
    typeInto('thoiGianGiuCho', '20');

    act(() => {
      void router.navigate('/admin');
    });
    const dialog = await screen.findByRole('dialog', {
      name: 'Rời khỏi trang?',
    });
    expect(router.state.location.pathname).toBe('/admin/cai-dat-he-thong');
    expect(dialog).toHaveTextContent('Các thay đổi chưa lưu sẽ bị mất.');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Ở lại' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.state.location.pathname).toBe('/admin/cai-dat-he-thong');
    expect(fieldOf('thoiGianGiuCho')).toHaveValue('20');

    act(() => {
      void router.navigate('/admin');
    });
    fireEvent.click(
      within(
        await screen.findByRole('dialog', { name: 'Rời khỏi trang?' }),
      ).getByRole('button', { name: 'Rời khỏi trang' }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'));
    expect(await screen.findByText('Trang tổng quan')).toBeInTheDocument();
  });

  it('CHF5-38 không có nháp (mới tải, đã Hủy, hay vừa lưu): điều hướng đi ngay, không hộp', async () => {
    setup();
    const { router } = renderConfigPage();
    await loaded();
    typeInto('thoiGianGiuCho', '20');
    fireEvent.click(screen.getByRole('button', { name: 'Hủy thay đổi' }));

    act(() => {
      void router.navigate('/admin');
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('CHF5-38 beforeunload (đóng hay tải lại tab): bị chặn khi có nháp; hết chặn sau Hủy hay sau khi lưu xong', async () => {
    setup();
    renderConfigPage();
    await loaded();
    expect(beforeUnload()).toBe(false);

    typeInto('thoiGianGiuCho', '20');
    expect(beforeUnload()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Hủy thay đổi' }));
    expect(beforeUnload()).toBe(false);

    typeInto('thoiGianGiuCho', '21');
    expect(beforeUnload()).toBe(true);
    await save();
    await screen.findByText('Đã lưu cấu hình hệ thống.');
    expect(beforeUnload()).toBe(false);
  });
});

describe('CHF5-39 không ghi lý do hay giá trị cấu hình ra log', () => {
  it('CHF5-39 cả luồng sửa, xác nhận, lưu thành công và lưu lỗi không gọi console.* nào', async () => {
    const calls: unknown[][] = [];
    for (const method of ['log', 'info', 'debug', 'warn', 'error'] as const)
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        calls.push(args);
      });
    let attempts = 0;
    setup({
      put: () => {
        attempts += 1;
        return attempts === 1
          ? apiError(500, 'LOI_HE_THONG')
          : json({ ...FULL_CONFIG, thoiGianGiuCho: 20 });
      },
    });
    renderConfigPage();
    await loaded();
    typeInto('thoiGianGiuCho', '20');
    const dialog = await save('Lý do riêng tư không được ghi log 12345');
    await within(dialog).findByRole('alert');
    fireEvent.click(confirmButton(dialog));
    await screen.findByText('Đã lưu cấu hình hệ thống.');

    expect(calls).toEqual([]);
  });
});
