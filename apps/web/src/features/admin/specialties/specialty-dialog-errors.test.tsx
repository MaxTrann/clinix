import { fireEvent, render, screen } from '@testing-library/react';
import { ApiError } from '../../../shared/api/errors';
import { SpecialtyDialog } from './specialty-dialog';

// AF2-11 (admin PR2 mục 6.2): lỗi của hộp Thêm/Sửa chuyên khoa hiện đúng MỘT chỗ, đúng ô. `TEN_CHUYEN_KHOA_KHONG_HOP_LE` và
// `MO_TA_QUA_DAI` trước đây rơi vào banner chung (sai chỗ); giờ ở dưới ô tên và ô mô tả. Focus vào ô lỗi mà không cướp focus
// (điều kiện B của phiên kiểm).

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  setStatus: vi.fn(),
  update: vi.fn(),
  upload: vi.fn(),
}));

vi.mock('./specialty-service', () => ({
  createSpecialty: mocks.create,
  setSpecialtyStatus: mocks.setStatus,
  updateSpecialty: mocks.update,
  uploadSpecialtyImage: mocks.upload,
}));

function renderDialog() {
  return render(
    <SpecialtyDialog
      open
      specialty={null}
      onClose={vi.fn()}
      onSaved={vi.fn()}
      onPartialSaved={vi.fn()}
    />,
  );
}

const nameInput = () => screen.getByLabelText(/Tên chuyên khoa/);
// Thông báo lỗi nằm TRONG thẻ label của ô (cùng kiểu với ô tên), nên chữ của label dài ra khi có lỗi: khớp theo phần đầu
const descriptionInput = () => screen.getByLabelText(/^Mô tả/);
const saveButton = () => screen.getByRole('button', { name: 'Lưu' });
const alertTexts = () =>
  screen.queryAllByRole('alert').map((element) => element.textContent);

function failWith(maLoi: string, status = 400) {
  mocks.create.mockRejectedValue(
    new ApiError(status, { maLoi, thongBao: 'x' }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SpecialtyDialog: lỗi gắn ô hiện một chỗ (AF2-11)', () => {
  it('AF2-11 TEN_CHUYEN_KHOA_KHONG_HOP_LE: dưới ô tên (không banner), ô tên được đánh dấu và nhận focus', async () => {
    failWith('TEN_CHUYEN_KHOA_KHONG_HOP_LE');
    renderDialog();
    fireEvent.change(nameInput(), { target: { value: 'Tim mạch' } });
    descriptionInput().focus();

    fireEvent.click(saveButton());

    expect(
      await screen.findByText('Tên chuyên khoa phải có từ 1 đến 100 ký tự.'),
    ).toBeInTheDocument();
    expect(alertTexts()).toEqual([
      'Tên chuyên khoa phải có từ 1 đến 100 ký tự.',
    ]);
    expect(nameInput()).toHaveAttribute('aria-invalid', 'true');
    expect(nameInput()).toHaveAccessibleDescription(
      'Tên chuyên khoa phải có từ 1 đến 100 ký tự.',
    );
    expect(nameInput()).toHaveFocus();
  });

  it('AF2-11 MO_TA_QUA_DAI: dưới ô mô tả (không banner), ô mô tả được đánh dấu và nhận focus', async () => {
    failWith('MO_TA_QUA_DAI');
    renderDialog();
    fireEvent.change(nameInput(), { target: { value: 'Tim mạch' } });

    fireEvent.click(saveButton());

    expect(
      await screen.findByText('Mô tả không được vượt quá 5.000 ký tự.'),
    ).toBeInTheDocument();
    expect(alertTexts()).toEqual(['Mô tả không được vượt quá 5.000 ký tự.']);
    expect(descriptionInput()).toHaveAttribute('aria-invalid', 'true');
    expect(descriptionInput()).toHaveAccessibleDescription(
      'Mô tả không được vượt quá 5.000 ký tự.',
    );
    expect(descriptionInput()).toHaveFocus();
    expect(nameInput()).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('AF2-11 TEN_CHUYEN_KHOA_TRUNG vẫn một chỗ ở ô tên và nay nhận focus', async () => {
    failWith('TEN_CHUYEN_KHOA_TRUNG', 409);
    renderDialog();
    fireEvent.change(nameInput(), { target: { value: 'Tim mạch' } });
    descriptionInput().focus();

    fireEvent.click(saveButton());

    expect(
      await screen.findByText(
        'Tên chuyên khoa đã tồn tại. Vui lòng chọn tên khác.',
      ),
    ).toBeInTheDocument();
    expect(alertTexts()).toHaveLength(1);
    expect(nameInput()).toHaveFocus();
  });

  it('AF2-11 lỗi không gắn ô (500): banner là chỗ duy nhất, không ô nào bị đánh dấu', async () => {
    failWith('LOI_HE_THONG', 500);
    renderDialog();
    fireEvent.change(nameInput(), { target: { value: 'Tim mạch' } });

    fireEvent.click(saveButton());

    expect(
      await screen.findByText('Không lưu được chuyên khoa. Vui lòng thử lại.'),
    ).toBeInTheDocument();
    expect(alertTexts()).toHaveLength(1);
    expect(nameInput()).not.toHaveAttribute('aria-invalid', 'true');
    expect(descriptionInput()).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('AF2-11 sửa ô mô tả thì lỗi mô tả biến mất', async () => {
    failWith('MO_TA_QUA_DAI');
    renderDialog();
    fireEvent.change(nameInput(), { target: { value: 'Tim mạch' } });
    fireEvent.click(saveButton());
    await screen.findByText('Mô tả không được vượt quá 5.000 ký tự.');

    fireEvent.change(descriptionInput(), { target: { value: 'Ngắn hơn' } });

    expect(alertTexts()).toEqual([]);
    expect(descriptionInput()).not.toHaveAttribute('aria-invalid', 'true');
  });
});

describe('SpecialtyDialog: focus vào ô lỗi (AF2-11)', () => {
  it('AF2-11 tên trống: bấm Lưu đưa focus vào ô tên và không gọi API', () => {
    renderDialog();
    descriptionInput().focus();

    fireEvent.click(saveButton());

    expect(alertTexts()).toEqual(['Vui lòng nhập tên chuyên khoa.']);
    expect(nameInput()).toHaveFocus();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('AF2-11 điều kiện B: lỗi hiện khi RỜI ô tên (blur) thì KHÔNG kéo focus về ô tên', () => {
    renderDialog();
    nameInput().focus();

    descriptionInput().focus();
    fireEvent.blur(nameInput());

    expect(alertTexts()).toEqual(['Vui lòng nhập tên chuyên khoa.']);
    expect(descriptionInput()).toHaveFocus();
  });

  it('AF2-11 điều kiện B: sau lỗi phía form, gõ vào ô mô tả không kéo focus về ô tên', () => {
    renderDialog();
    fireEvent.click(saveButton());
    expect(nameInput()).toHaveFocus();

    descriptionInput().focus();
    fireEvent.change(descriptionInput(), { target: { value: 'abc' } });

    expect(descriptionInput()).toHaveFocus();
  });
});
