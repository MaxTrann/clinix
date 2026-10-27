# P5 — Giờ Việt Nam cho API

Status: Approved for implementation by user (2026-10-27)  
Mode: IMPLEMENT  
Owner: Trung  
Updated: 2026-10-27

## 1. Goal and scope

- Thêm `nowVN()`, `todayVN()` và `weekdayVN()` trong `apps/api/src/common/time/`.
- Cố định timezone tiến trình API là `Asia/Ho_Chi_Minh` qua cấu hình `TZ`.
- Kiểm tra biên 23:59 → 00:00 và thứ trong tuần của ứng dụng khớp `NOW()`/`WEEKDAY()` MySQL trên session `+07:00`.

Không thay schema, migration, API nghiệp vụ hoặc cấu hình timezone DB đã hoàn tất trong P3.

## 2. Evidence and context

- `docs/features/admin/PLAN.md` mục 6.2 P5, Q43, H13, BS-37 và SE-A14 là acceptance hiện có.
- `docs/features/auth/TRACKING.md` mục 5 ghi P3 đã cấu hình `DB_TIMEZONE`, `SET time_zone` mỗi kết nối và `TZ` container DB; `apps/api/src/database/time-zone.int-spec.ts` kiểm tra pool và `NOW()`.
- `docker-compose.yml` truyền `.env` vào API và DB; `.env.example` đã có `TZ=Asia/Ho_Chi_Minh`.
- Issue #49 chưa đọc được trong môi trường hiện tại (không có GitHub CLI/connector). Triển khai theo acceptance P5 đã chốt trong plan.

## 3. Decisions and assumptions

- `todayVN()` trả `YYYY-MM-DD` theo giờ `Asia/Ho_Chi_Minh`.
- `weekdayVN()` trả ISO weekday: thứ Hai = 1 đến Chủ nhật = 7, khớp `thu_trong_tuan` và `WEEKDAY(...) + 1` trong schema.
- `nowVN()` trả instant hiện tại dưới dạng `Date`; calendar day/weekday luôn diễn giải theo timezone Việt Nam.

## 4. Core-feature impact

Không đổi luồng nghiệp vụ hiện tại. Helper là nền để các service Admin tính ngày và thứ nhất quán theo Q43.

## 5. Approach

- Backend: helper thuần dùng `Intl.DateTimeFormat` với timezone rõ ràng.
- Config: validate `TZ` chỉ nhận `Asia/Ho_Chi_Minh`, sau đó áp dụng lên tiến trình API lúc bootstrap.
- Tests: unit cho helper và integration MySQL giả lập hai mốc sát nửa đêm bằng session `SET timestamp`; khôi phục `timestamp` trước khi trả connection về pool.
- Data/security: không đổi DB/schema, không thêm secret hoặc dữ liệu thật.

## 6. Work breakdown

| ID | Task | Output/evidence | Depends on |
|---|---|---|---|
| T1 | Implement helpers and API TZ config | Source under `common/time`, env validation and bootstrap update | P3 DB timezone |
| T2 | Add boundary checks | Unit and MySQL integration tests for day/weekday transition | T1 |
| T3 | Review, verify, and record | Lint/build/test results, Admin tracking and AI log | T1, T2 |

## 7. Expected file impact

- Add `apps/api/src/common/time/time.ts` and place both test files in `apps/api/src/common/time/test/`.
- Update `apps/api/src/config/env.validation.ts`, its tests, and `apps/api/src/main.ts`.
- Update `.env.example` and `docs/DEV_SETUP.md`, plus P5 task records (`working-doc/P5`, Admin `TRACKING.md`, `TRUNG_AI_USAGE_LOG.md`).
- No changes to P3 database driver, DB schema, migrations, or dependencies.

## 8. Verification

- API lint/build/unit tests.
- API `test:int` against the configured `*_test` MySQL database; test both sides of the VN midnight boundary and session timezone.
- `git diff --check` and review changed files for scope and secrets.

## 9. Completion criteria

- Helper results use Vietnam calendar dates and ISO weekdays.
- API process receives validated `TZ=Asia/Ho_Chi_Minh`.
- App helpers and MySQL `NOW()`/`WEEKDAY()` agree at both boundary instants.
- Checks and actual results are recorded; no DB/schema changes.
