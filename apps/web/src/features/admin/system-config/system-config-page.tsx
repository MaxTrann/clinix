import { Info } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useBlocker } from 'react-router';
import { useRemote } from '../../../shared/hooks/use-remote';
import { LoadingState } from '../../../shared/ui/loading-state';
import { AdminConfirmationDialog } from '../components/admin-confirmation-dialog';
import { useFocusFirstInvalid } from '../hooks/use-focus-first-invalid';
import { ReminderField, ScalarField } from './config-fields';
import { HistoryTab } from './history-tab';
import { LoadError } from './load-error';
import { SaveDialog } from './save-dialog';
import { describeSaveFailure } from './system-config-errors';
import { PARAMS, PARAM_TABS, tabOf, type TabId } from './system-config-params';
import { getSystemConfig, updateSystemConfig } from './system-config-service';
import type {
  ConfigKey,
  ConfigPatch,
  SystemConfig,
} from './system-config-types';
import {
  NO_CHANGE_MESSAGE,
  buildUpdateBody,
  describeChanges,
  firstInvalidKey,
  reasonError as checkReason,
  validateDraft,
  type ChangeLine,
  type FieldErrors,
} from './system-config-validation';
import {
  changedKeys,
  draftFromConfig,
  type Draft,
} from './system-config-values';

// Màn "Cài đặt hệ thống" của Quản trị viên Toàn hệ thống (admin F5; PLAN CH b1 đến b5, A1 đến A4; Figma 556:2 đến 578:2 chỉ là bản phác thảo).
// Route bọc `AdminScopeGuard policy="ToanHeThong"`: Admin Chi nhánh mở thẳng đường dẫn thì thấy trang "không đủ quyền", và API (B5, B6) vẫn từ chối 403.
// Ba tab tham số dùng MỘT bản nháp (đổi tab không mất dữ liệu); tab thứ tư là lịch sử. Lưu = kiểm miền các ô ĐÃ ĐỔI, hộp "Xác nhận lưu thay đổi" kèm lý do,
// rồi MỘT lời gọi PUT chỉ chứa các ô đã đổi. Lỗi nào cũng giữ nguyên dữ liệu và lý do đã nhập.

type ActiveTab = TabId | 'history';

type Notice =
  { kind: 'saved' | 'info'; text: string } | { kind: 'error'; text: string };

interface PendingSave {
  patch: ConfigPatch;
  lines: ChangeLine[];
}

const TAB_BASE =
  'inline-flex h-[39px] flex-none items-center justify-center border-b-2 px-4 text-sm whitespace-nowrap';
const TAB_ACTIVE = `${TAB_BASE} border-brand font-medium text-brand-strong`;
const TAB_IDLE = `${TAB_BASE} border-transparent text-gray-600`;

const tabId = (id: ActiveTab) => `system-config-tab-${id}`;
const panelId = (id: ActiveTab) => `system-config-panel-${id}`;
const fieldId = (key: ConfigKey) => `system-config-${key}`;

export function SystemConfigPage() {
  const { state, retry } = useRemote((signal) => getSystemConfig(signal), []);

  return (
    <section
      className="flex min-w-0 flex-col"
      aria-labelledby="system-config-title"
    >
      <header>
        <h1
          id="system-config-title"
          className="text-[22.5px] leading-[30px] font-bold text-gray-900"
        >
          Cài đặt hệ thống
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Quản lý các tham số vận hành toàn hệ thống CLINIX.
        </p>
      </header>
      <div className="mt-5">
        {state.status === 'loading' && (
          <LoadingState message="Đang tải cấu hình hệ thống…" />
        )}
        {state.status === 'error' && (
          <LoadError error={state.error} onRetry={retry} />
        )}
        {state.status === 'ready' && <ConfigScreen initial={state.data} />}
      </div>
    </section>
  );
}

function ConfigScreen({ initial }: { initial: SystemConfig }) {
  // Cấu hình đã lưu gần nhất (ban đầu là bản tải về; sau mỗi lần lưu là PHẢN HỒI của máy chủ): "Hủy thay đổi" và phép so "đã đổi" dựa vào đây
  const [config, setConfig] = useState(initial);
  const [draft, setDraft] = useState<Draft>(() => draftFromConfig(initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [activeTab, setActiveTab] = useState<ActiveTab>('booking');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState<PendingSave | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [dialogBanner, setDialogBanner] = useState('');
  const [saving, setSaving] = useState(false);
  // Chặn bấm "Xác nhận lưu" hai lần TRƯỚC khi React kịp vẽ lại nút tắt (hai sự kiện trong cùng một khung hình)
  const inFlight = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  // Tăng khi có ô lỗi: đưa focus vào ô lỗi đầu tiên, không cướp focus lúc đang gõ (admin PR2 mục 6.2)
  const [focusTick, setFocusTick] = useState(0);
  const [reasonTick, setReasonTick] = useState(0);
  useFocusFirstInvalid(formRef, focusTick);

  const creating = config.chuaCauHinh;
  const changed = changedKeys(config, draft);
  const dirty = changed.length > 0;

  // Cảnh báo rời trang khi còn thay đổi chưa lưu (Đại chọn 19/11/2026): điều hướng trong app (đổi đường dẫn) và đóng hoặc tải lại tab
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function showFirstInvalid(found: FieldErrors) {
    const first = firstInvalidKey(found);
    if (first === null) return;
    // Ô ở tab khác đang bị ẩn (`hidden`) nên không focus được: chuyển sang tab của ô đó trước, focus chạy sau khi vẽ xong
    setActiveTab(tabOf(first));
    setFocusTick((count) => count + 1);
  }

  function changeScalar(key: ConfigKey, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    clearErrors(key);
  }

  function changeReminders(values: string[]) {
    setDraft((current) => ({ ...current, thoiDiemNhacLich: values }));
    clearErrors('thoiDiemNhacLich');
  }

  function clearErrors(key: ConfigKey) {
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      // Lỗi "tổng hai trọng số" gắn vào cả hai ô: sửa một ô thì bỏ cả hai
      if (key === 'trongSoW1' || key === 'trongSoW2') {
        delete next.trongSoW1;
        delete next.trongSoW2;
      }
      return next;
    });
    setNotice(null);
  }

  function discard() {
    setDraft(draftFromConfig(config));
    setErrors({});
    setNotice(null);
  }

  function requestSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    const result = validateDraft(config, draft);
    setErrors(result.errors);
    if (Object.keys(result.errors).length > 0) {
      showFirstInvalid(result.errors);
      return;
    }
    if (result.changed.length === 0) {
      setNotice({ kind: 'info', text: NO_CHANGE_MESSAGE });
      return;
    }
    setReasonError('');
    setDialogBanner('');
    setPending({
      patch: result.patch,
      lines: describeChanges(config, result.patch),
    });
  }

  async function confirmSave() {
    if (pending === null || inFlight.current) return;
    const problem = checkReason(reason);
    if (problem !== null) {
      setReasonError(problem);
      setReasonTick((count) => count + 1);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setReasonError('');
    setDialogBanner('');
    try {
      const saved = await updateSystemConfig(
        buildUpdateBody(pending.patch, reason),
      );
      setConfig(saved);
      setDraft(draftFromConfig(saved));
      setErrors({});
      setReason('');
      setPending(null);
      setNotice({ kind: 'saved', text: 'Đã lưu cấu hình hệ thống.' });
    } catch (error) {
      // Giữ nguyên bản nháp và lý do; chỉ gắn lỗi
      const failure = describeSaveFailure(error);
      if (failure.reason !== undefined) {
        setReasonError(failure.reason);
        setReasonTick((count) => count + 1);
      }
      if (failure.keepDialogOpen) {
        setDialogBanner(failure.banner ?? '');
      } else {
        setPending(null);
        setErrors(failure.fields);
        if (failure.banner !== undefined)
          setNotice({
            kind: failure.banner === NO_CHANGE_MESSAGE ? 'info' : 'error',
            text: failure.banner,
          });
        showFirstInvalid(failure.fields);
      }
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  const submitLabel = creating
    ? 'Tạo cấu hình'
    : dirty
      ? `Lưu thay đổi (${changed.length})`
      : 'Lưu thay đổi';

  return (
    <>
      {creating && (
        <p
          role="note"
          className="mb-4 flex items-start gap-2 rounded-xl border border-warning-line bg-warning-soft px-3 py-2.5 text-sm text-warning"
        >
          <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          Hệ thống chưa được cấu hình. Nhập các giá trị bắt buộc (đánh dấu *) để
          tạo cấu hình lần đầu.
        </p>
      )}

      <div
        role="tablist"
        aria-label="Cài đặt hệ thống"
        className="flex max-w-full overflow-x-auto border-b border-gray-200"
      >
        {[
          ...PARAM_TABS,
          { id: 'history' as const, label: 'Lịch sử thay đổi' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={tabId(tab.id)}
            aria-selected={activeTab === tab.id}
            aria-controls={panelId(tab.id)}
            className={activeTab === tab.id ? TAB_ACTIVE : TAB_IDLE}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form
        ref={formRef}
        noValidate
        hidden={activeTab === 'history'}
        aria-label="Tham số cấu hình"
        onSubmit={requestSave}
      >
        {PARAM_TABS.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            id={panelId(tab.id)}
            aria-labelledby={tabId(tab.id)}
            hidden={activeTab !== tab.id}
            className="mt-4 flex flex-col gap-4"
          >
            {tab.groups.map((group) => (
              <section
                key={group.title}
                aria-label={group.title}
                className="rounded-2xl border border-gray-100 bg-white px-5 py-3"
              >
                <h2 className="pt-1 text-sm font-semibold text-gray-900">
                  {group.title}
                </h2>
                {group.keys.map((key) => {
                  const def = PARAMS[key];
                  const common = {
                    def,
                    id: fieldId(key),
                    error: errors[key],
                    changed: changed.includes(key),
                    creating,
                    disabled: saving,
                  };
                  return def.rule.kind === 'reminders' ? (
                    <ReminderField
                      key={key}
                      {...common}
                      values={draft.thoiDiemNhacLich}
                      onChange={changeReminders}
                    />
                  ) : (
                    <ScalarField
                      key={key}
                      {...common}
                      value={
                        draft[key as Exclude<ConfigKey, 'thoiDiemNhacLich'>]
                      }
                      onChange={(value) => changeScalar(key, value)}
                    />
                  );
                })}
              </section>
            ))}
          </div>
        ))}

        {/* Thanh lưu dính đáy khung nhìn: kết quả lưu ("Đã lưu", "Không có thay đổi", lỗi) hiện NGAY cạnh nút vừa bấm, không nằm ở đầu trang
            (người dùng đã cuộn xuống nút Lưu sẽ không thấy). Thấy khi đo bằng trình duyệt (admin F5 mục 10.5). */}
        <div className="sticky bottom-0 z-10 mt-4 flex flex-col gap-2 border-t border-gray-200 bg-white/95 py-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="min-w-0 text-sm sm:flex-1">
            <div role="status">
              {notice === null ? (
                <p className="text-gray-600">
                  {dirty
                    ? `${changed.length} tham số đã sửa, chưa lưu.`
                    : creating
                      ? 'Nhập các giá trị bắt buộc rồi bấm Tạo cấu hình.'
                      : 'Chưa có thay đổi nào.'}
                </p>
              ) : (
                notice.kind !== 'error' && (
                  <p
                    className={
                      notice.kind === 'saved'
                        ? 'font-medium text-success'
                        : 'text-gray-700'
                    }
                  >
                    {notice.text}
                  </p>
                )
              )}
            </div>
            {notice !== null && notice.kind === 'error' && (
              <p role="alert" className="font-medium text-danger-strong">
                {notice.text}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="h-[37.5px] rounded-[13.375px] border border-gray-200 bg-white px-4 text-sm font-medium text-gray-600 disabled:opacity-60"
              disabled={!dirty || saving}
              onClick={discard}
            >
              Hủy thay đổi
            </button>
            <button
              type="submit"
              className="h-[37.5px] rounded-[13.375px] bg-brand-strong px-4 text-sm font-medium text-white disabled:opacity-70"
              disabled={saving}
            >
              {submitLabel}
            </button>
          </div>
        </div>
      </form>

      <div
        role="tabpanel"
        id={panelId('history')}
        aria-labelledby={tabId('history')}
        hidden={activeTab !== 'history'}
        className="mt-4"
      >
        {activeTab === 'history' && <HistoryTab />}
      </div>

      <SaveDialog
        open={pending !== null}
        creating={creating}
        lines={pending?.lines ?? []}
        reason={reason}
        reasonError={reasonError}
        reasonTick={reasonTick}
        banner={dialogBanner}
        saving={saving}
        onReasonChange={(value) => {
          setReason(value);
          setReasonError('');
        }}
        onConfirm={() => void confirmSave()}
        onCancel={() => setPending(null)}
      />

      <AdminConfirmationDialog
        open={blocker.state === 'blocked'}
        title="Rời khỏi trang?"
        message="Các thay đổi chưa lưu sẽ bị mất."
        confirmLabel="Rời khỏi trang"
        cancelLabel="Ở lại"
        tone="warning"
        onConfirm={() => {
          if (blocker.state === 'blocked') blocker.proceed();
        }}
        onCancel={() => {
          if (blocker.state === 'blocked') blocker.reset();
        }}
      />
    </>
  );
}
