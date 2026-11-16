import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../../shared/api/auth-hooks';
import { jsonResponse } from '../../testing/fetch-routing';
import {
  EMPTY_VALUES,
  valuesOf,
  type ExamRecordNote,
} from '../exam-record-form';
import hookSource from '../use-save-record.ts?raw';
import {
  ExamRecordDialog,
  type ExamRecordDialogProps,
} from './exam-record-dialog';
import dialogSource from './exam-record-dialog.tsx?raw';

// doctor-exam F3: hộp `Ghi chú khám` / `Chỉnh sửa ghi chú khám` (Figma `460:2`, `463:2`; PLAN 5.5, 5.13, 5.14). WHS-02 (ba trường bắt buộc, lỗi theo ô, giữ nội dung), WHS-03 (hộp sửa điền sẵn), WHS-04 (thân PUT, token),
// WHS-05 (409 và so sánh), WHS-06 (bấm đúp), WHS-07 (bộ đếm, khoảng ngày), WHS-09 (lỗi mạng), WHS-12 (hiển thị an toàn), BDK-09 (không ghi nội dung vào kho trình duyệt, URL, tiêu đề, log). Mức W (happy-dom,
// `css:false`): khoá TÊN LỚP; kích thước thật đo ở Chromium (TRACKING doctor-exam mục 19.8). Dữ liệu giả, không phải của ai. Biến test không đặt tên gần với bí mật (hook gitleaks).
const CODE = 'CP20261018006';
const NAME = 'Vũ Thị Lan';
// 00:30 ngày 10/06/2026 giờ Việt Nam (17:30Z hôm trước): ngày khám theo giờ VN là 2026-06-10, KHÔNG phải ngày UTC 2026-06-09
const VISIT = '2026-06-09T17:30:00.000Z';
const NOTE: ExamRecordNote = {
  trieuChung: 'Đau ngực, khó thở khi gắng sức',
  chanDoanSoBo: 'Ghi nhận ban đầu; cần theo dõi',
  huongXuLy: 'Hạn chế hoạt động thể lực nặng',
  ngayTaiKhamDuKien: '2026-07-10',
  capNhatLanCuoi: '2026-06-10T10:30:00.000Z',
};
const NEWER: ExamRecordNote = {
  trieuChung: 'Triệu chứng do nơi khác ghi',
  chanDoanSoBo: 'Chẩn đoán do nơi khác ghi',
  huongXuLy: 'Lời khuyên do nơi khác ghi',
  ngayTaiKhamDuKien: null,
  capNhatLanCuoi: '2026-06-10T11:00:00.000Z',
};
const fetchMock = vi.fn<typeof fetch>();
const onClose = vi.fn();
const onSaved = vi.fn();
const onChanged = vi.fn();
let trigger: HTMLButtonElement;

beforeEach(() => {
  fetchMock.mockReset();
  onClose.mockReset();
  onSaved.mockReset();
  onChanged.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  setApiAuthHooks({
    getAccessToken: () => 'token-gia',
    recoverFromUnauthorized: async () => false,
  });
  trigger = document.createElement('button');
  document.body.appendChild(trigger);
});
afterEach(() => {
  trigger.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setApiAuthHooks(null);
});

function renderDialog(overrides: Partial<ExamRecordDialogProps> = {}) {
  const props: ExamRecordDialogProps = {
    maLichHen: CODE,
    nguoiKham: NAME,
    thoiGian: VISIT,
    note: null,
    initial: { values: EMPTY_VALUES, baseToken: null },
    returnFocusRef: { current: trigger },
    onClose,
    onSaved,
    onChanged,
    ...overrides,
  };
  const view = render(<ExamRecordDialog {...props} />);
  return {
    ...view,
    rerenderWith: (next: Partial<ExamRecordDialogProps>) =>
      view.rerender(<ExamRecordDialog {...props} {...next} />),
  };
}
// Hộp sửa: nội dung và token lấy từ hồ sơ hiện có
const editProps = (
  note: ExamRecordNote = NOTE,
): Partial<ExamRecordDialogProps> => ({
  note,
  initial: { values: valuesOf(note), baseToken: note.capNhatLanCuoi },
});

const dialog = () => screen.getByRole('dialog');
const box = (label: RegExp) =>
  within(dialog()).getByLabelText(label) as HTMLTextAreaElement;
const symptoms = () => box(/^Triệu chứng/);
const diagnosis = () => box(/^Chẩn đoán sơ bộ/);
const advice = () => box(/^Hướng xử lý/);
const dateBox = () =>
  within(dialog()).getByLabelText(/^Ngày tái khám dự kiến/) as HTMLInputElement;
const saveButton = () =>
  within(dialog()).getByRole('button', {
    name: /^(Lưu ghi chú|Đang lưu\.\.\.)$/,
  });
const cancelButton = () =>
  within(dialog()).getByRole('button', { name: 'Hủy' });
const closeIcon = () =>
  within(dialog()).getByRole('button', { name: 'Đóng hộp thoại' });
const reloadButton = () =>
  within(dialog()).queryByRole('button', { name: 'Tải lại bản mới' });
const banner = () => within(dialog()).queryByRole('alert');
const puts = () =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');
const putBody = (index = 0) =>
  JSON.parse(String(puts()[index][1]?.body)) as Record<string, unknown>;
const type = (element: HTMLElement, value: string) =>
  fireEvent.change(element, { target: { value } });
function fillValid() {
  type(symptoms(), 'Ho khan, sốt nhẹ');
  type(diagnosis(), 'Viêm họng cấp');
  type(advice(), 'Uống đủ nước');
}
const apiError = (status: number, maLoi: string, extra: object = {}) =>
  jsonResponse(
    { maLoi, thongBao: 'THÔNG BÁO KỸ THUẬT KHÔNG ĐƯỢC HIỆN', ...extra },
    status,
  );
const saved = (note: ExamRecordNote = NEWER) => jsonResponse(note);
const flush = () =>
  act(async () => {
    await Promise.resolve();
  });
// Với giờ giả: tua đồng hồ TRONG act để React kịp vẽ lại trạng thái sau lời gọi mạng
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe('doctor-exam F3 — hộp Ghi chú khám (Figma 460:2)', () => {
  it('WHS-03 hộp ghi mới: tên "Ghi chú khám", phụ đề `<mã> · <họ tên>`, ba ô trống đúng gợi ý Figma, ô ngày tuỳ chọn, `Hủy` và `Lưu ghi chú`; tiêu điểm vào ô đầu; chưa gọi API', () => {
    renderDialog();
    expect(
      screen.getByRole('dialog', { name: 'Ghi chú khám' }),
    ).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog()).getByText(`${CODE} · ${NAME}`)).toBeInTheDocument();
    expect(symptoms()).toHaveAttribute(
      'placeholder',
      'Mô tả triệu chứng bệnh nhân đã khai...',
    );
    expect(diagnosis()).toHaveAttribute(
      'placeholder',
      'Ghi nhận chẩn đoán ban đầu...',
    );
    expect(advice()).toHaveAttribute(
      'placeholder',
      'Hướng điều trị, lời khuyên cho bệnh nhân...',
    );
    for (const element of [symptoms(), diagnosis(), advice()]) {
      expect(element.tagName).toBe('TEXTAREA');
      expect(element).toHaveValue('');
      expect(element).toBeRequired();
    }
    expect(dateBox()).toHaveAttribute('type', 'date');
    expect(dateBox()).toHaveValue('');
    expect(dateBox()).not.toBeRequired();
    expect(within(dialog()).getByText('(tùy chọn)')).toBeInTheDocument();
    // Dấu `*` đỏ chỉ để nhìn, trình đọc màn hình đã có `required`
    for (const star of dialog().querySelectorAll('label span.text-danger')) {
      expect(star).toHaveAttribute('aria-hidden', 'true');
      expect(star).toHaveTextContent('*');
    }
    expect(saveButton()).toHaveTextContent('Lưu ghi chú');
    expect(cancelButton()).toBeEnabled();
    expect(symptoms()).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(banner()).toBeNull();
  });

  it('WHS-03 hộp sửa: tên "Chỉnh sửa ghi chú khám", điền sẵn bốn trường của hồ sơ hiện có', () => {
    renderDialog(editProps());
    expect(
      screen.getByRole('dialog', { name: 'Chỉnh sửa ghi chú khám' }),
    ).toBeInTheDocument();
    expect(symptoms()).toHaveValue(NOTE.trieuChung);
    expect(diagnosis()).toHaveValue(NOTE.chanDoanSoBo);
    expect(advice()).toHaveValue(NOTE.huongXuLy);
    expect(dateBox()).toHaveValue('2026-07-10');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('WHS-03 `Hủy`, nút × và Esc đóng (onClose không bản nháp khi chưa có lỗi), trả tiêu điểm về nút đã mở; 0 PUT', () => {
    renderDialog();
    fireEvent.click(cancelButton());
    expect(onClose).toHaveBeenLastCalledWith(null);
    fireEvent.click(closeIcon());
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onClose).toHaveBeenLastCalledWith(null);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('WHS-03 đóng hộp thì tiêu điểm về nút đã mở nó', () => {
    const view = renderDialog();
    view.unmount();
    expect(trigger).toHaveFocus();
  });
});

describe('doctor-exam F3 — ba trường bắt buộc, lỗi theo ô, giữ nội dung (WHS-02)', () => {
  it.each([
    ['trieuChung', symptoms, 'Vui lòng nhập triệu chứng.'],
    ['chanDoanSoBo', diagnosis, 'Vui lòng nhập chẩn đoán sơ bộ.'],
    ['huongXuLy', advice, 'Vui lòng nhập hướng xử lý / lời khuyên.'],
  ])(
    'WHS-02 thiếu riêng %s ⇒ lỗi DƯỚI đúng ô (aria-invalid, aria-describedby), 0 PUT, các ô khác giữ nguyên; gõ vào ô thì bỏ lỗi ô đó',
    (field, pick, message) => {
      renderDialog();
      fillValid();
      type(pick(), '   \n  ');
      fireEvent.click(saveButton());

      expect(fetchMock).not.toHaveBeenCalled();
      expect(pick()).toHaveAttribute('aria-invalid', 'true');
      const error = within(dialog()).getByText(message);
      expect(pick().getAttribute('aria-describedby')).toContain(error.id);
      expect(error).toHaveClass('text-danger-strong');
      expect(error).toHaveClass('text-xs');
      for (const other of [symptoms, diagnosis, advice].filter(
        (candidate) => candidate !== pick,
      )) {
        expect(other()).not.toHaveAttribute('aria-invalid');
        expect(other()).not.toHaveValue('');
      }
      expect(field).toBeTruthy();

      type(pick(), 'Đã gõ lại');
      expect(within(dialog()).queryByText(message)).toBeNull();
      expect(pick()).not.toHaveAttribute('aria-invalid');
    },
  );

  it('WHS-02 cả ba trống ⇒ ba lỗi, 0 PUT, hộp không đóng; chỉ xuống dòng hay khoảng trắng cũng là trống', () => {
    renderDialog();
    type(symptoms(), '\r\n\n');
    type(diagnosis(), '   ');
    fireEvent.click(saveButton());
    expect(fetchMock).not.toHaveBeenCalled();
    for (const message of [
      'Vui lòng nhập triệu chứng.',
      'Vui lòng nhập chẩn đoán sơ bộ.',
      'Vui lòng nhập hướng xử lý / lời khuyên.',
    ])
      expect(within(dialog()).getByText(message)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog()).toBeInTheDocument();
  });

  it('WHS-02 máy chủ trả 400 `loi[]` ⇒ lỗi hiện đúng ô (kể cả NOI_DUNG_KHONG_HOP_LE, QUA_DAI, NGAY_KHONG_HOP_LE), nội dung GIỮ nguyên, hộp không đóng, không dải chung', async () => {
    renderDialog();
    fillValid();
    type(dateBox(), '2026-12-01');
    fetchMock.mockResolvedValue(
      apiError(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [
          { truong: 'trieuChung', ma: 'NOI_DUNG_KHONG_HOP_LE' },
          { truong: 'huongXuLy', ma: 'QUA_DAI' },
          { truong: 'ngayTaiKhamDuKien', ma: 'NGAY_KHONG_HOP_LE' },
        ],
      }),
    );
    fireEvent.click(saveButton());
    await flush();
    expect(
      await within(dialog()).findByText(
        'Nội dung có đoạn giống mật khẩu hoặc mã bí mật; hãy viết lại.',
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog()).getByText('Tối đa 2.000 ký tự.'),
    ).toBeInTheDocument();
    expect(
      within(dialog()).getByText('Ngày tái khám không hợp lệ.'),
    ).toBeInTheDocument();
    expect(symptoms()).toHaveAttribute('aria-invalid', 'true');
    expect(advice()).toHaveAttribute('aria-invalid', 'true');
    expect(dateBox()).toHaveAttribute('aria-invalid', 'true');
    expect(diagnosis()).not.toHaveAttribute('aria-invalid');
    expect(symptoms()).toHaveValue('Ho khan, sốt nhẹ');
    expect(diagnosis()).toHaveValue('Viêm họng cấp');
    expect(advice()).toHaveValue('Uống đủ nước');
    expect(dateBox()).toHaveValue('2026-12-01');
    expect(saveButton()).toBeEnabled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    expect(puts()).toHaveLength(1);
  });

  it('WHS-02 sau lỗi 400 sửa nội dung rồi Lưu lại được (gửi lần hai với nội dung mới)', async () => {
    renderDialog();
    fillValid();
    fetchMock.mockResolvedValueOnce(
      apiError(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [{ truong: 'trieuChung', ma: 'NOI_DUNG_KHONG_HOP_LE' }],
      }),
    );
    fireEvent.click(saveButton());
    await within(dialog()).findByText(/giống mật khẩu/);
    type(symptoms(), 'Ho khan, viết lại');
    fetchMock.mockResolvedValueOnce(saved());
    fireEvent.click(saveButton());
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(puts()).toHaveLength(2);
    expect(putBody(1).trieuChung).toBe('Ho khan, viết lại');
  });
});

describe('doctor-exam F3 — bộ đếm và khoảng ngày (WHS-07)', () => {
  it('WHS-07 bộ đếm `n/2.000` đếm bằng length SAU chuẩn hoá (chữ có dấu 1, emoji 2, CRLF 1); không đỏ khi còn trong giới hạn', () => {
    renderDialog();
    const counter = (box: HTMLElement) =>
      within(dialog()).getByText(
        (_text, element) => element?.id === `${box.id}-count`,
      );
    expect(counter(symptoms())).toHaveTextContent('0/2.000');
    type(symptoms(), 'ế'.repeat(1999));
    expect(counter(symptoms())).toHaveTextContent('1.999/2.000');
    expect(counter(symptoms())).toHaveClass('text-gray-600');
    expect(counter(symptoms())).not.toHaveClass('text-danger');
    type(diagnosis(), '😀😀😀');
    expect(counter(diagnosis())).toHaveTextContent('6/2.000');
    type(advice(), '  a\r\nb  ');
    expect(counter(advice())).toHaveTextContent('3/2.000');
    expect(symptoms().getAttribute('aria-describedby')).toContain(
      `${symptoms().id}-count`,
    );
  });

  it('WHS-07 đúng 2.000 ký tự được gửi; 2.001 ⇒ bộ đếm đỏ, câu "Tối đa 2.000 ký tự.", 0 PUT, nội dung giữ', async () => {
    renderDialog();
    fillValid();
    type(symptoms(), 'a'.repeat(2001));
    const count = within(dialog()).getByText('2.001/2.000');
    expect(count).toHaveClass('text-danger');
    fireEvent.click(saveButton());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      within(dialog()).getByText('Tối đa 2.000 ký tự.'),
    ).toBeInTheDocument();
    expect(symptoms()).toHaveValue('a'.repeat(2001));

    type(symptoms(), 'a'.repeat(2000));
    fetchMock.mockResolvedValue(saved());
    fireEvent.click(saveButton());
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(putBody().trieuChung).toBe('a'.repeat(2000));
  });

  it('WHS-07 ô ngày có `min` là ngày khám THEO GIỜ VIỆT NAM (không phải ngày UTC) và `max` là +365 ngày', () => {
    renderDialog();
    expect(dateBox()).toHaveAttribute('min', '2026-06-10');
    expect(dateBox()).toHaveAttribute('max', '2027-06-10');
  });

  it('WHS-07 ngày trước ngày khám hoặc +366 ngày ⇒ "Ngày tái khám phải từ ngày khám đến 365 ngày sau.", 0 PUT; hai biên được gửi', async () => {
    renderDialog();
    fillValid();
    for (const bad of ['2026-06-09', '2027-06-11']) {
      type(dateBox(), bad);
      fireEvent.click(saveButton());
      expect(
        within(dialog()).getByText(
          'Ngày tái khám phải từ ngày khám đến 365 ngày sau.',
        ),
      ).toBeInTheDocument();
      expect(dateBox()).toHaveAttribute('aria-invalid', 'true');
    }
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(saved());
    type(dateBox(), '2027-06-10');
    fireEvent.click(saveButton());
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(putBody().ngayTaiKhamDuKien).toBe('2027-06-10');
  });

  // Ngày không có thật (30/02) và sai dạng KHÔNG thể có trong `input type="date"` (trình duyệt đổi thành chuỗi rỗng): hai ca đó khoá ở hàm thuần (`exam-record-form.test.ts`, WHS-07) và ở lỗi 400 của máy chủ (WHS-02).
  it('WHS-07 ngày không có thật bị trình duyệt đổi thành rỗng ⇒ không gửi ngày rác: thân PUT mang `null`', async () => {
    renderDialog();
    fillValid();
    type(dateBox(), '2026-02-30');
    fetchMock.mockResolvedValue(saved());
    fireEvent.click(saveButton());
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(putBody().ngayTaiKhamDuKien).toBeNull();
  });
});

describe('doctor-exam F3 — thân PUT và token (WHS-04)', () => {
  it('WHS-04 ghi lần đầu: MỘT PUT /doctor/appointments/<mã>/exam-record, token `null`, ngày `null`, chữ đã chuẩn hoá; thành công ⇒ onSaved và onChanged đúng MỘT lần', async () => {
    renderDialog();
    type(symptoms(), '  Ho khan\r\nsốt nhẹ ');
    type(diagnosis(), 'Viêm họng cấp\u0001');
    type(advice(), 'Uống đủ nước');
    fetchMock.mockResolvedValue(saved());
    fireEvent.click(saveButton());
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    expect(puts()).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(`/doctor/appointments/${CODE}/exam-record`);
    expect(init?.method).toBe('PUT');
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer token-gia',
    );
    expect(putBody()).toEqual({
      trieuChung: 'Ho khan\nsốt nhẹ',
      chanDoanSoBo: 'Viêm họng cấp',
      huongXuLy: 'Uống đủ nước',
      ngayTaiKhamDuKien: null,
      capNhatLanCuoi: null,
    });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('WHS-04 sửa: gửi `capNhatLanCuoi` đã thấy NGUYÊN VĂN và ngày đang chọn', async () => {
    renderDialog(editProps());
    type(advice(), 'Lời khuyên đã sửa');
    fetchMock.mockResolvedValue(saved());
    fireEvent.click(saveButton());
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(putBody()).toEqual({
      trieuChung: NOTE.trieuChung,
      chanDoanSoBo: NOTE.chanDoanSoBo,
      huongXuLy: 'Lời khuyên đã sửa',
      ngayTaiKhamDuKien: '2026-07-10',
      capNhatLanCuoi: '2026-06-10T10:30:00.000Z',
    });
  });

  it('WHS-04 xoá ngày tái khám ⇒ gửi `null` (xoá ngày cũ)', async () => {
    renderDialog(editProps());
    type(dateBox(), '');
    fetchMock.mockResolvedValue(saved());
    fireEvent.click(saveButton());
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(putBody().ngayTaiKhamDuKien).toBeNull();
  });

  it('WHS-04 200 sai hình dạng ⇒ KHÔNG coi là thành công (onSaved không gọi), báo "chưa rõ"', async () => {
    renderDialog();
    fillValid();
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    fireEvent.click(saveButton());
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      /^Chưa rõ hồ sơ đã được lưu chưa/,
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe('doctor-exam F3 — bấm đúp và đóng khi đang lưu (WHS-06)', () => {
  it('WHS-06 hai lần bấm `Lưu ghi chú` CÙNG LƯỢT ⇒ MỘT PUT; đang lưu thì nút khoá và đổi chữ, `Hủy` và × khoá, Esc và bấm nền không đóng, aria-busy', async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    renderDialog();
    fillValid();
    const button = saveButton();
    // Hai lần bấm trong MỘT lượt xử lý: nút `disabled` chưa kịp có hiệu lực, chỉ cờ trong hook chặn được
    act(() => {
      button.click();
      button.click();
    });
    expect(puts()).toHaveLength(1);

    expect(saveButton()).toBeDisabled();
    expect(saveButton()).toHaveTextContent('Đang lưu...');
    expect(cancelButton()).toBeDisabled();
    expect(closeIcon()).toBeDisabled();
    expect(dialog()).toHaveAttribute('aria-busy', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(dialog().parentElement as HTMLElement);
    fireEvent.click(cancelButton());
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog()).toBeInTheDocument();

    await act(async () => {
      finish(saved());
    });
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(puts()).toHaveLength(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('WHS-06 gỡ hộp khi đang lưu ⇒ yêu cầu bị huỷ, không onSaved, không tải lại, không cảnh báo', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const view = renderDialog();
    fillValid();
    fireEvent.click(saveButton());
    const signal = fetchMock.mock.calls[0][1]?.signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    view.unmount();
    expect(signal.aborted).toBe(true);
    await flush();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('doctor-exam F3 — 409 sửa chồng: tải lại và so sánh (WHS-05)', () => {
  async function conflict() {
    const view = renderDialog(editProps());
    type(advice(), 'Lời khuyên của tôi');
    fetchMock.mockResolvedValue(apiError(409, 'HO_SO_KHAM_DA_THAY_DOI'));
    fireEvent.click(saveButton());
    await within(dialog()).findByText(/vừa được cập nhật ở nơi khác/);
    return view;
  }

  it('WHS-05 409 ⇒ dải `alert`, nội dung GIỮ, Lưu khoá, nút `Tải lại bản mới`; chưa tự tải lại', async () => {
    await conflict();
    expect(banner()).toHaveTextContent(
      'Hồ sơ khám vừa được cập nhật ở nơi khác. Hãy tải lại để xem bản mới nhất.',
    );
    expect(banner()).toHaveClass('text-danger-strong');
    expect(advice()).toHaveValue('Lời khuyên của tôi');
    expect(saveButton()).toBeDisabled();
    expect(reloadButton()).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(puts()).toHaveLength(1);
  });

  it('WHS-05 `Tải lại bản mới` gọi onChanged đúng MỘT lần, không gửi PUT, nội dung vẫn giữ', async () => {
    await conflict();
    fireEvent.click(reloadButton() as HTMLElement);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(puts()).toHaveLength(1);
    expect(advice()).toHaveValue('Lời khuyên của tôi');
  });

  it('WHS-05 bản mới KHÁC nội dung ⇒ khối chỉ đọc "Bản mới nhất" (bốn trường, "Cập nhật lúc …") cùng `Giữ bản của tôi` và `Dùng bản mới nhất`; Lưu vẫn khoá', async () => {
    const view = await conflict();
    fireEvent.click(reloadButton() as HTMLElement);
    view.rerenderWith({ ...editProps(), note: NEWER });

    const latest = within(dialog()).getByRole('region', {
      name: 'Bản mới nhất',
    });
    expect(latest).toHaveTextContent(NEWER.trieuChung);
    expect(latest).toHaveTextContent(NEWER.chanDoanSoBo);
    expect(latest).toHaveTextContent(NEWER.huongXuLy);
    expect(latest).toHaveTextContent('Cập nhật lúc 18:00 ngày 10/06/2026');
    expect(
      within(dialog()).getByRole('button', { name: 'Giữ bản của tôi' }),
    ).toBeEnabled();
    expect(
      within(dialog()).getByRole('button', { name: 'Dùng bản mới nhất' }),
    ).toBeEnabled();
    expect(saveButton()).toBeDisabled();
    expect(advice()).toHaveValue('Lời khuyên của tôi');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('WHS-05 `Giữ bản của tôi` ⇒ mở khoá Lưu, lần Lưu kế gửi token MỚI cùng nội dung của tôi (ghi đè có chủ ý)', async () => {
    const view = await conflict();
    fireEvent.click(reloadButton() as HTMLElement);
    view.rerenderWith({ ...editProps(), note: NEWER });
    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Giữ bản của tôi' }),
    );
    expect(banner()).toBeNull();
    expect(
      within(dialog()).queryByRole('region', { name: 'Bản mới nhất' }),
    ).toBeNull();
    expect(saveButton()).toBeEnabled();

    fetchMock.mockResolvedValue(saved());
    fireEvent.click(saveButton());
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(putBody(1)).toMatchObject({
      huongXuLy: 'Lời khuyên của tôi',
      trieuChung: NOTE.trieuChung,
      capNhatLanCuoi: NEWER.capNhatLanCuoi,
    });
  });

  it('WHS-05 `Dùng bản mới nhất` ⇒ điền form bằng bản mới, mở khoá Lưu, token mới', async () => {
    const view = await conflict();
    fireEvent.click(reloadButton() as HTMLElement);
    view.rerenderWith({ ...editProps(), note: NEWER });
    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Dùng bản mới nhất' }),
    );
    expect(symptoms()).toHaveValue(NEWER.trieuChung);
    expect(diagnosis()).toHaveValue(NEWER.chanDoanSoBo);
    expect(advice()).toHaveValue(NEWER.huongXuLy);
    expect(dateBox()).toHaveValue('');
    expect(banner()).toBeNull();
    expect(saveButton()).toBeEnabled();

    fetchMock.mockResolvedValue(saved());
    fireEvent.click(saveButton());
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(putBody(1).capNhatLanCuoi).toBe(NEWER.capNhatLanCuoi);
    expect(putBody(1).huongXuLy).toBe(NEWER.huongXuLy);
  });

  it('WHS-05 bản mới TRÙNG nội dung đang gõ ⇒ coi là đã lưu: onSaved đúng một lần, không PUT thêm, không onChanged thêm', async () => {
    const view = await conflict();
    fireEvent.click(reloadButton() as HTMLElement);
    view.rerenderWith({
      ...editProps(),
      note: {
        ...NOTE,
        huongXuLy: 'Lời khuyên của tôi',
        capNhatLanCuoi: '2026-06-10T11:05:00.000Z',
      },
    });
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(puts()).toHaveLength(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('WHS-05 chưa bấm `Tải lại bản mới` mà hồ sơ đổi (trang tự tải lại vì lý do khác) ⇒ KHÔNG tự đóng, KHÔNG hiện khối so sánh', async () => {
    const view = await conflict();
    view.rerenderWith({ ...editProps(), note: NEWER });
    expect(
      within(dialog()).queryByRole('region', { name: 'Bản mới nhất' }),
    ).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
    expect(saveButton()).toBeDisabled();
  });

  it('WHS-05 đóng hộp khi đang ở 409 ⇒ onClose nhận bản nháp (nội dung và token đã thấy)', async () => {
    await conflict();
    fireEvent.click(cancelButton());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith({
      values: { ...valuesOf(NOTE), huongXuLy: 'Lời khuyên của tôi' },
      baseToken: NOTE.capNhatLanCuoi,
    });
  });
});

describe('doctor-exam F3 — lỗi mạng khi lưu: chưa rõ, không tự gửi lại (WHS-09)', () => {
  async function offline() {
    const view = renderDialog(editProps());
    type(advice(), 'Lời khuyên của tôi');
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    fireEvent.click(saveButton());
    await within(dialog()).findByText(/^Chưa rõ hồ sơ đã được lưu chưa/);
    return view;
  }

  it('WHS-09 mạng đứt ⇒ dải "Chưa rõ hồ sơ đã được lưu chưa …", nội dung GIỮ, Lưu vẫn bấm lại được, có `Tải lại bản mới`; đúng MỘT PUT, không onChanged tự động', async () => {
    vi.useFakeTimers();
    try {
      renderDialog(editProps());
      type(advice(), 'Lời khuyên của tôi');
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      fireEvent.click(saveButton());
      await advance(30_000);
      expect(banner()).toHaveTextContent(
        'Chưa rõ hồ sơ đã được lưu chưa (mất kết nối hoặc quá thời gian chờ). Nội dung của bạn vẫn còn ở đây.',
      );
      // Chờ lâu cũng KHÔNG tự gửi lại
      expect(puts()).toHaveLength(1);
      expect(onChanged).not.toHaveBeenCalled();
      expect(advice()).toHaveValue('Lời khuyên của tôi');
      expect(saveButton()).toBeEnabled();
      expect(reloadButton()).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('WHS-09 bấm Lưu lại gửi lại CÙNG token (an toàn: lần trước đã lưu thì nhận 409)', async () => {
    await offline();
    fetchMock.mockResolvedValue(saved());
    fireEvent.click(saveButton());
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(puts()).toHaveLength(2);
    expect(putBody(1).capNhatLanCuoi).toBe(NOTE.capNhatLanCuoi);
    expect(putBody(1).huongXuLy).toBe('Lời khuyên của tôi');
  });

  it('WHS-09 gửi lại mà nhận 409 (lần trước đã lưu) ⇒ vào luồng tải lại và so sánh; bản mới trùng nội dung ⇒ báo đã lưu', async () => {
    const view = await offline();
    fetchMock.mockResolvedValue(apiError(409, 'HO_SO_KHAM_DA_THAY_DOI'));
    fireEvent.click(saveButton());
    await within(dialog()).findByText(/vừa được cập nhật ở nơi khác/);
    expect(saveButton()).toBeDisabled();
    fireEvent.click(reloadButton() as HTMLElement);
    view.rerenderWith({
      ...editProps(),
      note: {
        ...NOTE,
        huongXuLy: 'Lời khuyên của tôi',
        capNhatLanCuoi: '2026-06-10T11:10:00.000Z',
      },
    });
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(puts()).toHaveLength(2);
  });

  it('WHS-09 `Tải lại bản mới` ở lỗi mạng: tải về thấy TRÙNG nội dung ⇒ đã lưu (onSaved), không PUT thêm', async () => {
    const view = await offline();
    fireEvent.click(reloadButton() as HTMLElement);
    expect(onChanged).toHaveBeenCalledTimes(1);
    view.rerenderWith({
      ...editProps(),
      note: {
        ...NOTE,
        huongXuLy: 'Lời khuyên của tôi',
        capNhatLanCuoi: '2026-06-10T11:10:00.000Z',
      },
    });
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(puts()).toHaveLength(1);
  });

  it('WHS-09 tải về thấy token giữ nguyên, nội dung khác ⇒ "Hồ sơ chưa được lưu. Bấm Lưu ghi chú để thử lại.", Lưu bấm lại được, nội dung giữ', async () => {
    const view = await offline();
    fireEvent.click(reloadButton() as HTMLElement);
    view.rerenderWith({ ...editProps(), note: { ...NOTE } });
    expect(banner()).toHaveTextContent(
      'Hồ sơ chưa được lưu. Bấm Lưu ghi chú để thử lại.',
    );
    expect(saveButton()).toBeEnabled();
    expect(advice()).toHaveValue('Lời khuyên của tôi');
    expect(reloadButton()).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('WHS-09 tải về thấy token ĐÃ ĐỔI và nội dung khác ⇒ khối "Bản mới nhất" để so sánh', async () => {
    const view = await offline();
    fireEvent.click(reloadButton() as HTMLElement);
    view.rerenderWith({ ...editProps(), note: NEWER });
    expect(
      within(dialog()).getByRole('region', { name: 'Bản mới nhất' }),
    ).toBeInTheDocument();
    expect(
      within(dialog()).getByRole('button', { name: 'Giữ bản của tôi' }),
    ).toBeInTheDocument();
  });

  it('WHS-09 quá giờ chờ (hết giờ) cũng là "chưa rõ", không tự gửi lại', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementation(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      );
      renderDialog();
      fillValid();
      fireEvent.click(saveButton());
      await advance(16_000);
      expect(banner()).toHaveTextContent(/^Chưa rõ hồ sơ đã được lưu chưa/);
      expect(puts()).toHaveLength(1);
      expect(symptoms()).toHaveValue('Ho khan, sốt nhẹ');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('doctor-exam F3 — các lỗi còn lại theo maLoi (WHS-15 mức hộp)', () => {
  it.each([
    [
      '503 HE_THONG_DANG_BAN',
      () => apiError(503, 'HE_THONG_DANG_BAN'),
      'Hệ thống đang bận, thử lại sau ít phút.',
      true,
      false,
    ],
    [
      'lỗi lạ 500',
      () => apiError(500, 'LOI_HE_THONG'),
      'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
      true,
      false,
    ],
    [
      '404 KHONG_TIM_THAY',
      () => apiError(404, 'KHONG_TIM_THAY'),
      'Không tìm thấy ca khám này.',
      false,
      true,
    ],
    [
      '409 KHONG_THE_GHI_HO_SO_KHAM',
      () =>
        apiError(409, 'KHONG_THE_GHI_HO_SO_KHAM', {
          chiTiet: { trangThai: 'DaHuy' },
        }),
      'Chỉ ghi được hồ sơ khám khi bệnh nhân đã được tiếp đón hoặc ca khám đã hoàn thành.',
      false,
      true,
    ],
    [
      '403 KHONG_DU_QUYEN',
      () => apiError(403, 'KHONG_DU_QUYEN'),
      'Bạn không có quyền thực hiện thao tác này.',
      false,
      false,
    ],
    [
      '401 CHUA_DANG_NHAP',
      () => apiError(401, 'CHUA_DANG_NHAP'),
      'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      false,
      false,
    ],
  ])(
    'WHS-15 %s ⇒ dải đúng chữ, nội dung GIỮ, không đóng hộp; bấm Lưu lại được: %s; tải lại chi tiết ngay: %s',
    async (_name, respond, message, canRetry, refresh) => {
      renderDialog();
      fillValid();
      fetchMock.mockResolvedValue(respond());
      fireEvent.click(saveButton());
      expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
        message,
      );
      expect(banner()).not.toHaveTextContent('KỸ THUẬT');
      expect(symptoms()).toHaveValue('Ho khan, sốt nhẹ');
      expect(dialog()).toBeInTheDocument();
      expect(onSaved).not.toHaveBeenCalled();
      if (canRetry) expect(saveButton()).toBeEnabled();
      else expect(saveButton()).toBeDisabled();
      expect(onChanged).toHaveBeenCalledTimes(refresh ? 1 : 0);
      expect(puts()).toHaveLength(1);
    },
  );

  it('WHS-15 sau 503 bấm Lưu lại gửi lần hai (không tự gửi), thành công thì đóng', async () => {
    renderDialog();
    fillValid();
    fetchMock.mockResolvedValueOnce(apiError(503, 'HE_THONG_DANG_BAN'));
    fireEvent.click(saveButton());
    await within(dialog()).findByText(/đang bận/);
    expect(puts()).toHaveLength(1);
    fetchMock.mockResolvedValueOnce(saved());
    fireEvent.click(saveButton());
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(puts()).toHaveLength(2);
  });

  it('WHS-16 đóng hộp sau lỗi (503, mạng, 400, 409…) ⇒ onClose nhận bản nháp đủ nội dung và token đã thấy', async () => {
    renderDialog();
    fillValid();
    type(dateBox(), '2026-12-01');
    fetchMock.mockResolvedValue(apiError(503, 'HE_THONG_DANG_BAN'));
    fireEvent.click(saveButton());
    await within(dialog()).findByText(/đang bận/);
    fireEvent.click(cancelButton());
    expect(onClose).toHaveBeenCalledWith({
      values: {
        trieuChung: 'Ho khan, sốt nhẹ',
        chanDoanSoBo: 'Viêm họng cấp',
        huongXuLy: 'Uống đủ nước',
        ngayTaiKhamDuKien: '2026-12-01',
      },
      baseToken: null,
    });
  });

  it('WHS-16 mở với bản nháp: các ô điền sẵn đúng nội dung nháp (và tiêu đề theo token đã thấy)', () => {
    renderDialog({
      initial: {
        values: { ...valuesOf(NOTE), huongXuLy: 'Nháp chưa lưu' },
        baseToken: NOTE.capNhatLanCuoi,
      },
      note: NOTE,
    });
    expect(advice()).toHaveValue('Nháp chưa lưu');
    expect(symptoms()).toHaveValue(NOTE.trieuChung);
    expect(
      screen.getByRole('dialog', { name: 'Chỉnh sửa ghi chú khám' }),
    ).toBeInTheDocument();
  });
});

describe('doctor-exam F3 — hiển thị an toàn và dữ liệu sức khoẻ (WHS-12, BDK-09)', () => {
  const SCRIPT = '<script>alert(1)</script>';
  const IMG = '<img src=x onerror=alert(1)>';

  it('WHS-12 chữ giống HTML gõ vào ô được gửi và hiện NGUYÊN VĂN là chữ (không thành thẻ); khối "Bản mới nhất" cũng vậy', async () => {
    const view = renderDialog(editProps());
    type(symptoms(), SCRIPT);
    type(advice(), `${IMG}\n&lt;b&gt;`);
    fetchMock.mockResolvedValue(apiError(409, 'HO_SO_KHAM_DA_THAY_DOI'));
    fireEvent.click(saveButton());
    await within(dialog()).findByText(/vừa được cập nhật ở nơi khác/);
    expect(putBody().trieuChung).toBe(SCRIPT);
    expect(symptoms()).toHaveValue(SCRIPT);

    fireEvent.click(reloadButton() as HTMLElement);
    view.rerenderWith({
      ...editProps(),
      note: { ...NEWER, trieuChung: SCRIPT, huongXuLy: `${IMG}\nxuống dòng` },
    });
    const latest = within(dialog()).getByRole('region', {
      name: 'Bản mới nhất',
    });
    expect(latest).toHaveTextContent(SCRIPT);
    expect(latest).toHaveTextContent(IMG);
    expect(dialog().querySelector('script')).toBeNull();
    expect(dialog().querySelector('img')).toBeNull();
    expect(latest.querySelectorAll('dd')[2]).toHaveClass('whitespace-pre-wrap');
    expect(latest.querySelectorAll('dd')[2]).toHaveClass('wrap-anywhere');
  });

  it('WHS-12 nguồn của ba file mới không dùng `dangerouslySetInnerHTML`', () => {
    for (const source of [dialogSource, hookSource])
      expect(source).not.toMatch(/dangerouslySetInnerHTML\s*=/);
  });

  it('BDK-09 gõ, lưu, 400, 409, mạng, đóng: không ghi localStorage, sessionStorage, URL, tiêu đề; không console.*', async () => {
    const setLocal = vi.spyOn(Storage.prototype, 'setItem');
    const pushState = vi.spyOn(window.history, 'pushState');
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const consoleSpies = (
      ['log', 'info', 'warn', 'error', 'debug'] as const
    ).map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
    const title = document.title;
    const search = window.location.search;
    const hash = window.location.hash;

    const view = renderDialog(editProps());
    type(advice(), 'Nội dung nhạy cảm của bệnh nhân');
    fetchMock.mockResolvedValueOnce(
      apiError(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [{ truong: 'huongXuLy', ma: 'QUA_DAI' }],
      }),
    );
    fireEvent.click(saveButton());
    await within(dialog()).findByText('Tối đa 2.000 ký tự.');
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fireEvent.click(saveButton());
    await within(dialog()).findByText(/^Chưa rõ hồ sơ/);
    fetchMock.mockResolvedValueOnce(apiError(409, 'HO_SO_KHAM_DA_THAY_DOI'));
    fireEvent.click(saveButton());
    await within(dialog()).findByText(/vừa được cập nhật ở nơi khác/);
    fireEvent.click(reloadButton() as HTMLElement);
    view.rerenderWith({ ...editProps(), note: NEWER });
    fireEvent.click(cancelButton());

    expect(setLocal).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(window.location.search).toBe(search);
    expect(window.location.hash).toBe(hash);
    expect(window.history.state).toBeNull();
    expect(document.title).toBe(title);
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
    // Nội dung hồ sơ chỉ đi trong thân PUT, không vào URL
    for (const [url] of fetchMock.mock.calls)
      expect(String(url)).not.toContain('nhạy');
  });
});
