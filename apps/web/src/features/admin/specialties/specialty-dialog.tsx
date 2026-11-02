import {
  useId,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { ApiError, NetworkError, TimeoutError } from '../../../shared/api/errors';
import { useAdminDialogFocus } from '../hooks/use-admin-dialog-focus';
import {
  createSpecialty,
  setSpecialtyStatus,
  updateSpecialty,
  uploadSpecialtyImage,
} from './specialty-service';
import type { Specialty, SpecialtyInput, SpecialtyStatus } from './specialty-types';
import styles from './specialty.module.css';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface SpecialtyDialogProps {
  open: boolean;
  specialty: Specialty | null;
  onClose: () => void;
  onSaved: () => void;
  onPartialSaved: () => void;
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.maLoi === 'TEN_CHUYEN_KHOA_KHONG_HOP_LE')
      return 'Tên chuyên khoa phải có từ 1 đến 100 ký tự.';
    if (error.maLoi === 'MO_TA_QUA_DAI')
      return 'Mô tả không được vượt quá 5.000 ký tự.';
  }
  if (error instanceof TimeoutError || error instanceof NetworkError)
    return 'Chưa nhận được xác nhận từ máy chủ. Ảnh đang gắn vẫn được giữ nguyên.';
  return 'Không lưu được chuyên khoa. Vui lòng thử lại.';
}

function safeUploadErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.maLoi === 'ANH_QUA_DUNG_LUONG')
      return 'Ảnh gốc không được vượt quá 10 MB.';
    if (error.maLoi === 'ANH_KHONG_HOP_LE')
      return 'Ảnh phải là JPEG, PNG hoặc WebP tĩnh, tối đa 10 MB và 25 megapixel.';
    if (error.maLoi === 'ANH_KHONG_THE_TOI_UU')
      return 'Không thể tối ưu ảnh xuống 2 MB trong giới hạn chất lượng. Hãy chọn ảnh khác.';
    if (error.maLoi === 'XU_LY_ANH_HET_THOI_GIAN')
      return 'Xử lý ảnh quá lâu. Hãy chọn ảnh nhỏ hơn.';
  }
  return safeErrorMessage(error);
}

export function SpecialtyDialog({
  open,
  specialty,
  onClose,
  onSaved,
  onPartialSaved,
}: SpecialtyDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const nameErrorId = useId();
  const imageHelpId = useId();
  const [baseRecord, setBaseRecord] = useState<Specialty | null>(specialty);
  const [name, setName] = useState(specialty?.ten ?? '');
  const [description, setDescription] = useState(specialty?.moTa ?? '');
  const [status, setStatus] = useState<SpecialtyStatus>(
    specialty?.trangThaiHoatDong ?? 'DangHoatDong',
  );
  const [imageUrl, setImageUrl] = useState<string | null>(
    specialty?.anhDaiDien ?? null,
  );
  const [imageUploadId, setImageUploadId] = useState<string | null | undefined>(
    undefined,
  );
  const [nameError, setNameError] = useState('');
  const [imageError, setImageError] = useState('');
  const [formError, setFormError] = useState('');
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);

  useAdminDialogFocus(open, dialogRef, () => {
    if (!pending && !uploading) onClose();
  });

  if (!open) return null;

  const isEdit = specialty !== null;
  const busy = pending || uploading;

  async function selectImage(file: File | undefined) {
    if (!file) return;
    setImageError('');
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      setImageError('Chỉ nhận ảnh JPG, PNG hoặc WebP.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError('Ảnh đầu vào không được vượt quá 10 MB.');
      return;
    }

    setUploading(true);
    const controller = new AbortController();
    try {
      const uploaded = await uploadSpecialtyImage(file, controller.signal);
      setImageUrl(uploaded.url);
      setImageUploadId(uploaded.uploadId);
    } catch (error) {
      setImageError(safeUploadErrorMessage(error));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function validateName(): boolean {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Vui lòng nhập tên chuyên khoa.');
      return false;
    }
    if (Array.from(trimmed).length > 100) {
      setNameError('Tên chuyên khoa không được vượt quá 100 ký tự.');
      return false;
    }
    setNameError('');
    return true;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    if (!validateName()) return;

    const input: SpecialtyInput = {
      ten: name,
      moTa: description.trim() || null,
      ...(imageUploadId === undefined ? {} : { imageUploadId }),
    };
    setPending(true);
    let savedDetails = false;

    try {
      if (!isEdit) {
        await createSpecialty(input);
        onSaved();
        return;
      }

      if (!baseRecord) {
        setFormError('Không tìm thấy dữ liệu chuyên khoa để cập nhật.');
        return;
      }
      let latest: Specialty = baseRecord;

      const hasDetailsChanges =
        name !== baseRecord.ten ||
        (description.trim() || '') !== (baseRecord.moTa ?? '') ||
        imageUploadId !== undefined;

      if (hasDetailsChanges) {
        latest = await updateSpecialty(baseRecord.chuyenKhoaId, input);
        savedDetails = true;
        setBaseRecord(latest);
        setImageUploadId(undefined);
      }

      if (status !== latest.trangThaiHoatDong) {
        latest = await setSpecialtyStatus(latest.chuyenKhoaId, status);
      }

      onSaved();
    } catch (error) {
      if (error instanceof ApiError && error.maLoi === 'TEN_CHUYEN_KHOA_TRUNG') {
        setNameError('Tên chuyên khoa đã tồn tại. Vui lòng chọn tên khác.');
        if (savedDetails) onPartialSaved();
        return;
      }
      if (savedDetails) onPartialSaved();
      setFormError(
        savedDetails
          ? 'Thông tin đã lưu nhưng trạng thái chưa đổi. Vui lòng thử lưu lại.'
          : safeErrorMessage(error),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.dialogOverlay}>
      <section
        ref={dialogRef}
        className={styles.specialtyDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className={styles.dialogHeader}>
          <h2 id={titleId}>
            {isEdit ? 'Chỉnh sửa chuyên khoa' : 'Thêm chuyên khoa'}
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Đóng biểu mẫu"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <form onSubmit={(event) => void handleSubmit(event)} noValidate>
          <label className={styles.formField} htmlFor="specialty-name">
            <span>
              Tên chuyên khoa <b aria-hidden="true">*</b>
            </span>
            <input
              id="specialty-name"
              value={name}
              maxLength={100}
              aria-invalid={Boolean(nameError)}
              aria-describedby={nameError ? nameErrorId : undefined}
              onChange={(event) => {
                setName(event.currentTarget.value);
                if (nameError) setNameError('');
              }}
              onBlur={validateName}
              placeholder="Ví dụ: Thần kinh học"
              disabled={busy}
              autoComplete="off"
            />
            {nameError && (
              <span className={styles.fieldError} id={nameErrorId} role="alert">
                {nameError}
              </span>
            )}
          </label>

          <label className={styles.formField} htmlFor="specialty-description">
            <span>Mô tả</span>
            <textarea
              id="specialty-description"
              value={description}
              maxLength={5000}
              onChange={(event) => setDescription(event.currentTarget.value)}
              placeholder="Mô tả ngắn về chuyên khoa này…"
              disabled={busy}
              rows={3}
            />
          </label>

          <div className={styles.formField}>
            <span>Ảnh đại diện <small>(tùy chọn)</small></span>
            {imageUrl ? (
              <div className={styles.imagePreview}>
                <img src={imageUrl} alt="Ảnh đại diện chuyên khoa" />
                <button
                  type="button"
                  onClick={() => {
                    setImageUrl(null);
                    setImageUploadId(isEdit ? null : undefined);
                    setImageError('');
                  }}
                  disabled={busy}
                >
                  Gỡ ảnh
                </button>
              </div>
            ) : (
              <label
                className={styles.imageDropzone}
                htmlFor="specialty-image"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void selectImage(event.dataTransfer.files.item(0) ?? undefined);
                }}
                aria-describedby={imageHelpId}
              >
                <img
                  className={styles.uploadIcon}
                  src="/assets/admin/specialties/upload.svg"
                  alt=""
                />
                <span>Kéo thả ảnh vào đây hoặc <strong>chọn tệp</strong></span>
                <small id={imageHelpId}>
                  JPG, PNG, WebP · đầu vào tối đa 10 MB / 25 MP · tối ưu còn ≤ 2 MB
                </small>
                <input
                  ref={fileInputRef}
                  id="specialty-image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    void selectImage(event.currentTarget.files?.[0])
                  }
                  disabled={busy}
                />
              </label>
            )}
            {uploading && <span role="status">Đang tải ảnh lên…</span>}
            {imageError && (
              <span className={styles.fieldError} role="alert">
                {imageError}
              </span>
            )}
          </div>

          <label className={styles.statusField}>
            <input
              type="checkbox"
              checked={status === 'DangHoatDong'}
              disabled={busy || !isEdit}
              onChange={(event) =>
                setStatus(
                  event.currentTarget.checked
                    ? 'DangHoatDong'
                    : 'NgungHoatDong',
                )
              }
            />
            <span>Đang hoạt động</span>
          </label>
          {!isEdit && (
            <p className={styles.statusHint}>
              Chuyên khoa mới luôn được tạo ở trạng thái hoạt động.
            </p>
          )}

          {formError && (
            <p className={styles.formError} role="alert">
              {formError}
            </p>
          )}

          <footer className={styles.dialogActions}>
            <button type="button" onClick={onClose} disabled={busy}>
              Hủy
            </button>
            <button type="submit" className={styles.primaryButton} disabled={busy}>
              {busy ? 'Đang lưu…' : 'Lưu'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
