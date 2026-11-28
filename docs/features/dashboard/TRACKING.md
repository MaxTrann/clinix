# Tracking — scope `dashboard` Dashboard và báo cáo vận hành

Nhật ký tiến độ riêng của scope (mã sẽ nằm trong `apps/api/src/dashboard/` và `apps/web/src/features/dashboard/`; scope commit `dashboard`). Kế hoạch, task, phụ thuộc và danh sách test case nằm ở [`PLAN.md`](PLAN.md); file này chỉ ghi việc **đã làm** để sau này giải thích lại được (luồng chạy, test nào pass, chỗ nào phát sinh vấn đề). Giữ vĩnh viễn trong repo, không xoá sau khi merge. **Người làm: phần Quản trị viên: Đại (`MaxTrann`), Trung (`junUTE`) review; phần Tổng quan Lễ tân, Bác sĩ, Bệnh nhân (bản nháp 2, 28/11/2026): Trung làm, Đại review.**

**Cách ghi**
- Thêm một dòng mới **sau mỗi task** (mã task `B*`, `X*`, `F*` theo PLAN.md mục 6; ngoài file này luôn viết "dashboard B1" để không nhầm với task cùng mã của module khác), mới nhất ở cuối.
- "Test case": liệt kê mã ở mục 7 của PLAN.md; "Kết quả": `Pass` / `Fail` / `Một phần` (ghi rõ ca nào ở cột cuối). Ca `Fail` phải có dòng sau ghi cách xử lý và lần chạy lại.
- Đổi kế hoạch khi đang làm thì sửa `PLAN.md`; ghi lý do ở cột cuối của dòng tương ứng.
- Quyết định của nhóm ghi ở mục 3. **Chỉ ghi "ĐÃ TRẢ LỜI" khi Đại trả lời trực tiếp** (tin của phiên kiểm độc lập chỉ duyệt kế hoạch và trả lời câu kỹ thuật).
- Số đo thật (PLAN.md mục 5.14) ghi ở mục 6 **sau khi đặt tiêu chí trước**; việc còn chờ ghi ở mục 7.
- **Không dán secret, dữ liệu bệnh nhân hay nội dung `.env` vào file này.**
- Khi cả scope xong: thêm **đúng một dòng** vào `docs/TRACKING.md` ở gốc, trỏ sang file này.

## 1. Nhật ký

| Ngày | Việc đã làm | Test case | Kết quả | Vấn đề phát sinh / cách xử lý |
|---|---|---|---|---|
| 26/11/2026 | **Lập kế hoạch scope dashboard** (Đại `MaxTrann`; nhánh `docs/dashboard-plan`, worktree `clinix-app-doctor-exam`, `origin/main` `1cc0099`). Đọc nguyên văn use case "Xem thống kê & báo cáo vận hành" ở hai bản 2.4 bằng `python-docx` (chỉ đọc; so `diff`: trùng từng chữ, số 2.4.56 và 2.4.53) cùng bốn use case duyệt yêu cầu, cấu hình hệ thống, vắng mặt, khung giờ, hoàn tiền; 1.2.1, 1.3, 2.1_2.2, bảng Phân loại M24, văn bản Phạm vi 26/11; mã Make `AdminDashboard`; đối chiếu `docs/database/clinix_mysql.sql`, migration, mã `apps/api/src/{rbac,appointments,doctor,payment,wallet,admin,common,scheduling}` và `apps/web/src/{router,shared,features}`, `docs/TECH_DEBT.md`. **Hỏi Đại bằng bốn hộp câu hỏi** (14 câu, mục 3.1): 12 theo đề xuất, Q9 và Q12 chọn khác. Tạo `PLAN.md` (mục 0 đến 10, Phụ lục A và B nguyên văn; 70 mã test case, 8 task, 26,5 giờ gồm 22 giờ cam kết) và file này. **Không** chạy `npm`, test, build, Docker, MySQL; **không** đọc `.env`; **không** sửa file nào khác; git chỉ đọc và `git fetch`. | — (tài liệu; chưa có mã) | — | **Phát hiện khi đối chiếu (PLAN mục 2, 3.3, 5.10):** (1) `/admin` đã có chỗ giữ chỗ `AdminOverviewPage` trả `null` và mục "Tổng quan"; Lễ tân chưa có trang Tổng quan; (2) `lich_hen` không có chỉ mục theo ngày khám hay ngày đặt, `lich_su_hoan_tien` không có chỉ mục theo thời điểm; (3) rút tiền chỉ Toàn hệ thống xem được; yêu cầu thay đổi chi nhánh nằm ở tab Chi nhánh không mở được bằng URL; (4) đổi lịch tạo dòng lịch mới nên xu hướng phải bỏ dòng có `lich_hen_truoc_id`; (5) lịch cọc 0đ có giao dịch `so_tien = 0`; (6) văn bản Phạm vi đặt mốc nội bộ 14/12 cho F-5, lệch lịch đã chốt (21/12). Bộ dữ liệu tính tay D0 kiểm bằng script ngoài repo; một dòng sai nghiệp vụ trong bản nháp (hoàn tự động gắn vào lịch vắng mặt) được sửa trước khi giao (mục 4.3), số kỳ vọng không đổi. |
| 26/11/2026 | **Phiên kiểm độc lập duyệt kỹ thuật T1 đến T13** (theo ủy quyền của Đại; không phải Đại trả lời trực tiếp; không phải quyết định sản phẩm hay schema) và nêu ba chỗ sửa, đã sửa trong PLAN và file này: (1) T7 ghi tham chiếu mã `refund.rules.ts` dòng 33, `refund.queries.ts` dòng 125 đến 132, cảnh báo B2 về dòng 195; DCH-04 thêm chuỗi tự động thất bại rồi đặc biệt thành công; (2) T10 thêm phương án lùi (liên kết không kèm tab khi đụng PR admin đang mở); (3) đối chiếu lại với `origin/main` `c61d4f6` (đọc bằng `git show` và `git diff`; không lệnh git ghi). | — (tài liệu) | — | Số kỳ vọng của DCH-04 kiểm bằng script ngoài repo trên bộ D0 (đúng định nghĩa ra 0, cách chỉ xét `TuDong` ra 1), **chưa** chạy trên MySQL. Trên `c61d4f6`: ba tham chiếu mã đúng; chat B1 chỉ chạm `app.module.ts` trong các file kế hoạch dùng; không PR admin nào đang mở (chỉ hai PR dependabot); AI log hàng 209, nợ 336 đến 338, `AI-BUG-125` còn trống. Phiên kiểm nhận tự sửa mốc F-5 ở văn bản Phạm vi; phiên này chưa kiểm file đó. |
| 28/11/2026 | **Bản nháp 2: MỞ RỘNG scope thêm trang Tổng quan cho Lễ tân, Bác sĩ, Bệnh nhân** (Đại `MaxTrann`; nhánh `docs/dashboard-tong-quan-ba-vai-tro-plan`, worktree `clinix-app-doctor-exam`, `origin/main` `4c80486`; chỉ sửa `PLAN.md` và file này). Đọc PLAN, TRACKING, issue #753, #754, #750, #746 (`gh issue view`), văn bản Phạm vi 27/11/2026 (F-5 và mục 9), hai file Word 2.4 bằng `python-docx` (chỉ đọc; **không có use case "Tổng quan"**; các use case 2.4.12, 2.4.13, 2.4.24, 2.4.26, 2.4.29, 2.4.31, 2.4.34, 2.4.35, 2.4.59), mã Figma Make `ReceptionistDashboard`, `DoctorDashboard`, `PatientDashboard`; đọc mã `apps/web/src/{router,features,shared}` và `apps/api/src/{appointments/lists,appointments/reschedule,doctor,wallet,notification,chat,rbac}` để lập bảng chỉ số → API → quyền. **Hỏi Đại bằng hai hộp câu hỏi** (Q15 đến Q21): cả bảy theo đề xuất. Thêm vào PLAN: mục 5.15 đến 5.20, T14 đến T21, L11 đến L15, MH10 đến MH14, R9 đến R13, task B3 sửa, F3 sửa, F4, F5, X3 mới (11,5 giờ), 6.6b (hành động với #753, #754 và issue tạo mới), 7.10 đến 7.12 (DNV, DBS, DBN), DLT-06, DKT-06 đến DKT-10, mục 10, Phụ lục C (nháp ba use case). **Không** chạy `npm`, test, build, Docker, MySQL; **không** đọc `.env`; git chỉ đọc và `git fetch`; **không** tạo hay sửa issue. | — (tài liệu; chưa có mã) | — | **Phát hiện khi đối chiếu (PLAN mục 2, 3.3):** (1) `GET /reception/appointments` không trả số theo trạng thái (ca `DSV-13` khoá đúng bốn khoá) nên Lễ tân cần B3; danh sách của Bác sĩ và Bệnh nhân **đã có** `demTheoTrangThai` nên không cần API mới; (2) ba khung đang **chuyển hướng tạm** ở `router/role-routes.tsx` và ít nhất năm file test khoá chuyển hướng đó (R10); (3) PLAN cũ ghi Lễ tân "cắt được, ngoài cam kết" và Bác sĩ, Bệnh nhân "không làm", **lệch** văn bản Phạm vi 27/11 (Cam kết, đứng đầu danh sách cắt): L11; (4) chat F1 đến F6, B1 đến B6 đã merge nên Trung rảnh sớm hơn kế hoạch Iteration 10 của chat; (5) trạng thái cũ trong PLAN đã lỗi thời (ghi "chưa tạo issue" trong khi đã có #746 đến #754): đã sửa; (6) hai file Word 2.4 không có từ "Tổng quan" nào. T14 đến T21 **đã được phiên kiểm duyệt kỹ thuật cùng ngày** (dòng kế tiếp). |
| 28/11/2026 | **Phiên kiểm độc lập duyệt kỹ thuật T14 đến T21** (theo ủy quyền của Đại; không phải Đại trả lời trực tiếp; không phải quyết định sản phẩm hay schema) và nêu **một chỗ phải sửa chữ, hai lưu ý**; đã sửa trong PLAN và file này. Phiên kiểm đã đối chiếu mã ở `origin/main` `4c80486`: `ReceptionScopeService`, `resolveReceptionBranch`, `todayVn` và `formatWeekdayDate`, các hằng đường dẫn ở `shared/routes`, `ROLE_HOME_PATHS`, ba `<Navigate>` ở `role-routes.tsx`, ba mục "Tổng quan" vô hiệu ở `role-nav.ts`, bảy controller nguồn dữ liệu đều có. | — (tài liệu) | — | **(1) Sửa chữ T14:** bản nháp ghi "B1 đã merge"; sự thật: **B1 chưa merge** ở 28/11/2026 (`apps/api/src/dashboard/` chưa có file nào trên `origin/main`). Đã sửa ở T14, 6.1, 6.2, 6.3, 6.4, 6.6b và thêm **R14**: B3 chỉ làm sau khi B1 merge (trước đó `[SOẠN TRƯỚC]`), **phụ thuộc giữa hai người** (Trung làm B3, Đại làm B1), Đại báo Trung khi B1 merge, B1 trượt thì Trung làm F4, F5 trước B3, F3 (F4 dựng `common/` nếu F3 chưa merge được). **(2) Lưu ý T18, T19:** kiểm lại bằng `git grep` toàn bộ test khoá chuyển hướng cũ lúc làm (đã ghi ở PLAN 5.19). **(3) Lưu ý T15:** đọc lỏng khoá thừa chấp nhận được; thêm ca kiểm "thiếu hay sai kiểu khoá cần ⇒ lỗi của khối đó, khoá thừa không làm vỡ" vào DBS-05, DBN-06 (như DBS-05), DLW-03 và giữ dòng nợ 358. Không đổi số mã test case (101). |
| 28/11/2026 | **Phiên kiểm quyết hai việc còn lại** (theo ủy quyền của Đại; sau khi đọc lại 6.1, 6.2, 6.6b và thấy bản sửa ĐẠT): **(a) M5 đo ở X3, không ở X1** vì X1 (Đại) chạy trước B3 (Trung) nên chưa có gì để đo; **(b) MH10 được duyệt**, giữ nhãn `[đề xuất]`. Đã sửa: PLAN 5.14 (M5 thuộc X3, phân công đo), 5.20, 4.4, 6.2 (hàng X1 "M1 đến M4", hàng X3 đo M5), 6.6 (X1, B3, X3), 6.6b (thêm hàng #749 và sửa hàng X3, #753), MH10; TRACKING 3.3, mục 5, mục 6. **Cần báo Đại:** issue #749 (X1) ở GitHub vẫn ghi "M1 đến M5" ở `## Mô tả` và `## Đóng khi` (script ở PLAN 6.6b sửa thành M1 đến M4); nếu X3 phải dựng lại bộ nạp 100.000 lịch thì thêm khoảng 1 giờ (12,5 giờ, vượt 8 đến 12). | — (tài liệu) | — | Không đổi số mã test case (101). M5 là số đo, không có mã test case riêng. |

## 2. Kết quả test theo use case (mã ở PLAN.md mục 7)

| Nhóm | Mã | Số ca | Task | Trạng thái |
|---|---|---|---|---|
| Quyền và phạm vi | DQP-01…DQP-06 | 6 | B1 | chưa chạy |
| Bộ lọc | DBL-01…DBL-07 | 7 | B1 | chưa chạy |
| Vắng mặt | DVM-01…DVM-04 | 4 | B1 | chưa chạy |
| Khung giờ | DKG-01…DKG-04 | 4 | B1 | chưa chạy |
| Hôm nay và trong khoảng | DHN-01…DHN-03 | 3 | B1 | chưa chạy |
| Cọc và hoàn | DCH-01…DCH-05 | 5 | B2 | chưa chạy |
| Xu hướng | DXH-01…DXH-04 | 4 | B2 | chưa chạy |
| Chờ duyệt | DCD-01…DCD-04 | 4 | B2 | chưa chạy |
| Rỗng, nhất quán, riêng tư | DRG-01…DRG-04 | 4 | B1, B2 | chưa chạy |
| Web Quản trị viên | DWB-01…DWB-11 | 11 | F1 | chưa chạy |
| Biểu đồ | DBD-01…DBD-04 | 4 | F2 | chưa chạy |
| API Lễ tân `[CẮT ĐƯỢC]` | DLT-01…DLT-06 | 6 | B3 | chưa chạy |
| Web Lễ tân `[CẮT ĐƯỢC]` | DLW-01…DLW-04 | 4 | F3 | chưa chạy |
| Điều hướng, trang mở đầu ba vai trò `[CẮT ĐƯỢC]` | DNV-01…DNV-08 | 8 | F3, F4, F5 | chưa chạy |
| Web Bác sĩ `[CẮT ĐƯỢC]` | DBS-01…DBS-09 | 9 | F4 | chưa chạy |
| Web Bệnh nhân `[CẮT ĐƯỢC]` | DBN-01…DBN-08 | 8 | F5 | chưa chạy |
| Kiểm tay | DKT-01…DKT-10 | 10 | X2 (01 đến 04), X3 (05 đến 10) | chưa chạy |
| **Tổng** | | **101** | | **0 đã chạy** |

Đột biến mục tiêu (PLAN 5.14): 12, chưa chạy; bốn loại đột biến web: chưa chạy. **Phần mở rộng (PLAN 5.20):** đột biến web W1 đến W6: chưa chạy (đột biến 12 là của B3, đã nằm trong 12).

## 3. Quyết định đã chốt

### 3.1 Quyết định của nhóm cho scope này

**Đại trả lời trực tiếp ngày 26/11/2026** (Q1 đến Q14), qua bốn hộp câu hỏi trong phiên lập kế hoạch, **và ngày 28/11/2026** (Q15 đến Q21, bản nháp 2), qua hai hộp câu hỏi (mỗi câu có đề xuất kèm theo; câu hỏi và hệ quả ở PLAN mục 4.2).

| Q | Quyết định | Ghi chú |
|---|---|---|
| Q1 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): vắng mặt chia (vắng mặt + đã tiếp đón + hoàn thành), theo ngày khám** | |
| Q2 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): khung đã đặt chia mọi khung phát ra, trừ nghỉ phép đã duyệt** | |
| Q3 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): cọc ví và đã hoàn theo ngày giao dịch, thêm khoản hoàn đang lỗi** | `[ĐỒNG BỘ TL]` |
| Q4 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): thẻ hôm nay và tổng trong khoảng** | `[ĐỒNG BỘ TL]` |
| Q5 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): lịch đặt mới theo ngày đặt, bỏ dòng đổi lịch; ngày khi tối đa 62 ngày, tuần khi dài hơn** | |
| Q6 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): Chi nhánh thấy ba loại, ẩn rút tiền; không theo bộ lọc ngày** | |
| Q7 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): mặc định 30 ngày, tối đa 366, cho ngày tương lai** | |
| Q8 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): biểu đồ SVG hay CSS, không thư viện** | |
| Q9 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): Lễ tân có dashboard rút gọn** | **Khác đề xuất** (không làm) |
| Q10 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): đo trước, không đạt thì hỏi trước khi thêm chỉ mục** | |
| Q11 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): xong ở Iteration 10; sửa mốc nội bộ F-5 ở văn bản Phạm vi** | Việc của Đại |
| Q12 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): Lễ tân xem tách theo trạng thái và yêu cầu đổi lịch chờ** | **Khác đề xuất** (ba số) |
| Q13 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): `/le-tan` là "Tổng quan" và trang mở đầu** | |
| Q14 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): phần Lễ tân là phần cắt được, cam kết F-5 chỉ Quản trị viên** | B3, F3 có issue. **28/11/2026: phần "ngoài cam kết" được thay bởi Phạm vi 27/11 và Q21 (Lễ tân là Cam kết, đứng đầu danh sách cắt; PLAN L11)** |
| Q15 | **ĐÃ TRẢ LỜI (28/11/2026, Đại trả lời trực tiếp): Lễ tân: năm thẻ theo trạng thái và dòng yêu cầu đổi lịch đang chờ** | theo đề xuất (giữ Q12) |
| Q16 | **ĐÃ TRẢ LỜI (28/11/2026, Đại trả lời trực tiếp): Bác sĩ: bốn mục (lịch hôm nay tách trạng thái, ca kế tiếp, ca làm việc hôm nay, yêu cầu nghỉ phép chờ)** | theo đề xuất |
| Q17 | **ĐÃ TRẢ LỜI (28/11/2026, Đại trả lời trực tiếp): Bệnh nhân: ba mục (lịch sắp tới, số dư ví, đặt lịch khám)** | theo đề xuất |
| Q18 | **ĐÃ TRẢ LỜI (28/11/2026, Đại trả lời trực tiếp): Tổng quan là trang mở đầu của cả ba vai trò** | theo đề xuất; mở rộng Q13; sửa test chuyển hướng |
| Q19 | **ĐÃ TRẢ LỜI (28/11/2026, Đại trả lời trực tiếp): Lễ tân giữ B3 (API gộp); Bác sĩ, Bệnh nhân ghép API đã có** | theo đề xuất |
| Q20 | **ĐÃ TRẢ LỜI (28/11/2026, Đại trả lời trực tiếp): không thẻ tin nhắn, thông báo chưa đọc; giữ huy hiệu menu** | theo đề xuất |
| Q21 | **ĐÃ TRẢ LỜI (28/11/2026, Đại trả lời trực tiếp): làm Lễ tân, Bác sĩ, Bệnh nhân; cắt từ cuối (Bệnh nhân trước)** | theo đề xuất; thay phần "ngoài cam kết" của Q14 |

### 3.2 Quyết định kế thừa từ module khác (không bàn lại; nguồn ở PLAN.md 4.1)

Admin, rbac: phạm vi đọc DB mỗi request, ngoài phạm vi 404, thiếu quyền 403. Auth: mã lỗi ổn định, không log bí mật. Booking, doctor-exam: giờ Việt Nam, không giờ của DB, khoảng nửa mở. Payment: giao dịch và hoàn trỏ lịch gốc, tiền là chuỗi decimal. Phạm vi 26/11: F-4 ngoài phạm vi, F-5 là màn hình chỉ đọc.

### 3.3 Điểm kỹ thuật (PLAN 4.3, T1 đến T13)

**Đã duyệt kỹ thuật (phiên kiểm độc lập, theo ủy quyền của Đại, 26/11/2026; Đại chưa trả lời trực tiếp; không phải quyết định sản phẩm hay schema).** Điều kiện kèm theo: T7 có tham chiếu mã, cảnh báo B2 và ca DCH-04; T10 có phương án lùi. Các điểm: T1 thư mục và scope `dashboard`; T2 một route mỗi vai, một giao dịch chỉ đọc; T3 chi nhánh ngoài phạm vi 404; T4 SQL riêng, không import service module khác; T5 máy chủ tính phần trăm, tiền chuỗi; T6 hai ngày đi cùng nhau; T7 khoản đang lỗi theo dòng mới nhất; T8 gom tuần; T9 `no-store`, không đệm; T10 liên kết và tham số mở tab Chi nhánh; T11 bộ lọc ở URL; T12 test kiến trúc; T13 tiêu chí đo.

**Bản nháp 2 (28/11/2026): T14 đến T21 (PLAN 4.3) là `[đề xuất]` của phiên lập kế hoạch, ĐÃ được phiên kiểm độc lập duyệt kỹ thuật ngày 28/11/2026 (theo ủy quyền của Đại; không phải quyết định sản phẩm hay schema).** Điều kiện kèm theo: (1) **T14 sửa chữ: B1 chưa merge** ở 28/11/2026, B3 chỉ làm sau khi B1 merge (trước đó `[SOẠN TRƯỚC]`), là phụ thuộc giữa hai người, Đại báo Trung khi B1 merge, B1 trượt thì Trung làm F4, F5 trước; (2) T18, T19: kiểm lại bằng `git grep` toàn bộ test khoá chuyển hướng cũ lúc làm; (3) T15: mỗi khối có ca kiểm "thiếu hay sai kiểu khoá cần ⇒ lỗi của khối đó, khoá thừa không làm vỡ" và giữ dòng nợ 358. Các điểm: T14 B3 nằm trong `DashboardModule` của B1, phụ thuộc B1 (không còn X2); T15 Bác sĩ, Bệnh nhân không thêm route, mỗi nguồn một `useRemote`, đọc đúng khoá cần; T16 dùng `todayVn()` đã có ở `shared/schedule/week.ts` (không viết hàm ngày mới); T17 liên kết dùng `shared/routes`, hai đường dẫn Bác sĩ viết trong `dashboard` kèm ca khoá; T18 menu `to` và `end`; T19 mảng route `*_OVERVIEW_ROUTES` thay ba chuyển hướng; T20 cấu trúc trang, không tự làm mới, không kho trình duyệt; T21 mức kiểm GỌN, X3 là lane nặng. Hai việc phiên kiểm đã quyết sau đó (28/11/2026, theo ủy quyền của Đại): (a) **M5 đo ở X3, không ở X1** (X1 chạy trước B3 nên chưa có gì để đo); (b) **MH10 (quy tắc "ca kế tiếp") được duyệt**, giữ nhãn `[đề xuất]` vì là quy tắc hiển thị, Đại xem lúc review PR.

## 4. Ghi chú AI

**Phiên lập kế hoạch KHÔNG sửa `AI_USAGE_LOG.md` và `docs/TECH_DEBT.md`.** Dưới đây là **bản nháp**; kiểm lại số lớn nhất trên `main` lúc ghi. Kiểm lại cuối phiên (`origin/main` `c61d4f6`): AI log có đến hàng 208, TECH_DEBT đến dòng 331 (lúc bắt đầu ở `1cc0099` là 327), `AI-BUG` được nhắc đến `AI-BUG-120`. Số đã cấp cho task này: **AI log hàng 209, nợ kỹ thuật từ 336, `AI-BUG` từ 125.** **Bản nháp 2 (28/11/2026): phiên này cũng KHÔNG sửa `AI_USAGE_LOG.md` và `docs/TECH_DEBT.md`.** Kiểm lại ở `origin/main` `4c80486`: AI log có đến hàng 221, TECH_DEBT đến dòng 356, `AI-BUG` đến 141; số đã cấp cho bản nháp 2: **AI log hàng 222, nợ kỹ thuật từ 358 (357 `[cần điền]`: không rõ ai giữ), `AI-BUG` từ 142**; kiểm lại số lớn nhất lúc ghi. **Kiểm lại ở `origin/main` `1133952` (PR 787, 28/11/2026; chỉ chatbot, không chạm file nào của kế hoạch này):** AI log đã có hàng 224 (222 và 223 chưa có trên main, có thể cửa sổ khác giữ), TECH_DEBT vẫn đến 356 và `AI-BUG` vẫn đến 141; Đại quyết số khi ghi.

### 4.1 Nháp dòng AI log (bảng 1, mười cột)

| # | Ngày | Người dùng | Công cụ / model | Phạm vi (module/file) | Prompt chính | Phần AI sinh | Phần tự sửa/viết | Cách kiểm chứng | Commit/PR |
|---|------|-----------|-----------------|-----------------------|--------------|--------------|------------------|-----------------|-----------|
| 209 | 26/11/2026 | MaxTrann | Claude Code (Claude Sonnet 5.5) | `docs/features/dashboard/PLAN.md`, `docs/features/dashboard/TRACKING.md` (MỚI; chỉ hai file này; kế hoạch scope dashboard và báo cáo vận hành) | Lập kế hoạch (chỉ tài liệu, không viết mã) cho scope "Dashboard và báo cáo vận hành": use case Xem thống kê & báo cáo vận hành; định nghĩa từng chỉ số, quyền và phạm vi chi nhánh, hiệu năng, giao diện, phương án tối thiểu 15 đến 25 giờ, tối đa 8 task, danh sách issue đề xuất; hỏi Đại các quyết định sản phẩm và schema | Toàn bộ PLAN (mục 0 đến 10, bộ dữ liệu tính tay D0, 70 mã test case, 8 task) và TRACKING; Phụ lục A và B sao chép bằng script; bản nháp commit, PR, AI log, nợ kỹ thuật | Đại trả lời trực tiếp bốn hộp câu hỏi (Q1 đến Q14; 12 theo đề xuất, Q9 thêm dashboard Lễ tân, Q12 tách theo trạng thái); phiên kiểm độc lập duyệt kỹ thuật T1 đến T13 và nêu ba chỗ sửa (26/11/2026); PLAN chờ Trung review | Đọc nguyên văn 2.4 bằng `python-docx` (chỉ đọc), `diff` hai bản; đối chiếu bảng, chỉ mục, route, tên lớp với mã trên `origin/main` `1cc0099`, đối chiếu lại tới `c61d4f6`; script ngoài repo kiểm số kỳ vọng của bộ D0, trích dẫn 2.4 đúng từng chữ, số cột bảng, mã test không trùng và mỗi mã đúng một task, độ dài tiêu đề issue và PR; không chạy `npm`, test, build, Docker, MySQL; không đọc `.env`; không lệnh git ghi | `[cần điền]` (PR tài liệu của Đại) |
| 222 | 28/11/2026 | MaxTrann | Claude Code (Claude Sonnet 5.5) | `docs/features/dashboard/PLAN.md`, `docs/features/dashboard/TRACKING.md` (SỬA; chỉ hai file này; mở rộng kế hoạch thêm trang Tổng quan cho Lễ tân, Bác sĩ, Bệnh nhân) | Lập kế hoạch (chỉ tài liệu, không viết mã) mở rộng scope dashboard thêm trang "Tổng quan" chỉ đọc cho ba vai trò: bảng chỉ số và nguồn dữ liệu từ API đã có, quyền và phạm vi, ba trường hợp biên, hiệu năng, điểm chạm router và chat, phương án tối thiểu 8 đến 12 giờ, tối đa 5 đến 6 task, hành động với issue #753, #754; hỏi Đại các quyết định sản phẩm | PLAN: mục 5.15 đến 5.20, T14 đến T21, L11 đến L15, MH10 đến MH14, R9 đến R13, 5 task (B3, F3 sửa; F4, F5, X3 mới), 6.6b, 31 mã test case mới (tổng 101), mục 10, Phụ lục C (nháp ba use case); TRACKING; hai bản nháp commit, PR | Đại trả lời trực tiếp hai hộp câu hỏi (Q15 đến Q21, cả bảy theo đề xuất); phiên kiểm độc lập duyệt kỹ thuật T14 đến T21 (28/11/2026) kèm một chỗ sửa chữ về B1 và hai lưu ý; PLAN chờ Đại review | Đọc nguyên văn 2.4 bằng `python-docx` (chỉ đọc; không có use case "Tổng quan"); đối chiếu route, DTO, hằng đường dẫn, chỉ mục, test chuyển hướng với mã trên `origin/main` `4c80486`; `gh issue view 746, 750, 753, 754`; script ngoài repo kiểm số mã test case, độ dài tiêu đề issue và PR, kiểu xuống dòng; không chạy `npm`, test, build, Docker, MySQL; không đọc `.env`; không lệnh git ghi | `[cần điền]` (PR tài liệu của Đại) |

### 4.2 Nháp dòng nợ kỹ thuật (từ 336; chỉ ghi khi lối tắt có thật trong mã; cột đúng bảng của `docs/TECH_DEBT.md`)

| # | Ngày | Mô tả nợ | Vì sao chấp nhận | Rủi ro | Kế hoạch xử lý (khi nào) | Trạng thái |
|---|---|---|---|---|---|---|
| 336 | `[ngày merge dashboard B2]` | **Dashboard tính trực tiếp mỗi lần gọi**, không bảng tổng hợp, không bộ nhớ đệm; trần khoảng 366 ngày; kết quả đo và chỉ mục theo X1 `[cần điền]` | Dữ liệu cỡ đồ án; số luôn đúng thời điểm; không thêm bảng | Dữ liệu lớn hơn 100.000 lịch thì màn hình chậm và giữ ảnh chụp lâu | Khi vượt ngưỡng đo: chỉ mục, rồi bảng tổng hợp theo ngày | Mở |
| 337 | `[ngày merge dashboard B1]` | **Định nghĩa tỉ lệ khung giờ bỏ qua hai trường hợp:** khung cũ rơi vào ngày chi nhánh nghỉ hay ngoài giờ mới vẫn tính là đã phát ra; nghỉ phép chờ duyệt đang chặn đặt vẫn nằm trong mẫu số | Q2 chỉ trừ nghỉ đã duyệt; xét lịch hoạt động từng ngày làm câu truy vấn phức tạp | Tỉ lệ thấp hơn thực khi chi nhánh vừa đổi giờ | Khi có phản hồi số lệch: lọc theo lịch hoạt động của chi nhánh | Mở |
| 338 | `[ngày merge dashboard F1]` | **Việc cần xử lý chỉ liên kết tới trang, không lọc sẵn:** trang nghỉ phép mở ở "Tất cả trạng thái"; số rút tiền không theo chi nhánh; đường dẫn trang nghỉ phép viết lặp trong `features/dashboard` (khoá bằng test) | Không sửa trang của module khác ngoài tham số tab Chi nhánh (dùng phương án lùi của T10 thì liên kết thay đổi chi nhánh cũng không mở sẵn tab: ghi thêm vào dòng này) | Người dùng phải bấm thêm một bước; đổi đường dẫn phải sửa hai nơi | Thêm tham số lọc ở các trang duyệt; đưa đường dẫn vào `shared/routes` | Mở |
| 358 | `[ngày merge dashboard F4, F5]` | **Tổng quan Bác sĩ và Bệnh nhân ghép API đã có ở web** (3 và 2 lời gọi, không cùng ảnh chụp, không tự làm mới, không đếm ngược hạn thanh toán, đọc lỏng khoá lạ của API module gốc) | Q19: không thêm API mới cho hai vai này; Q20: không tự làm mới | Số giữa các thẻ lệch một nhịp; API gốc đổi tên khoá thì khối báo lỗi (ca đọc đúng khoá cần bắt) | Thêm API gộp riêng nếu cần (khoảng +3 giờ) | Mở |

### 4.3 Nháp lỗi AI (`AI-BUG-125`, `[đề xuất]`; chỉ ghi nếu Đại muốn, vì lỗi do AI tự phát hiện và sửa trước khi giao, chưa vào commit nào)

| Mã | Ngày | Mô tả lỗi | Nguyên nhân (phân tích) | Cách phát hiện | Commit sửa |
|---|---|---|---|---|---|
| `AI-BUG-125` | 26/11/2026 | Ở dashboard (lập kế hoạch, MaxTrann, Claude Code Claude Sonnet 5.5): các sai sót trong bản nháp, sửa trước khi giao: (1) bộ dữ liệu tính tay D0 bản đầu gắn dòng hoàn **tự động** thất bại vào một lịch **vắng mặt**, trong khi hệ thống chỉ hoàn tự động khi huỷ lịch (thêm lịch đã huỷ M3, số kỳ vọng không đổi); (2) đầu PLAN ghi 13 câu theo đề xuất, đúng là 12; (3) sơ đồ phụ thuộc vẽ F2 sau X1, trái bảng task | Dựng dữ liệu theo công thức chỉ số mà không đối chiếu luật phát sinh của từng dòng; viết tóm tắt và sơ đồ mà không đối chiếu lại bảng | Đọc lại bản nháp đối chiếu use case Hoàn tiền tự động, bảng câu trả lời và bảng task; thêm kiểm "hoàn tự động chỉ cho lịch đã huỷ" vào script | `[cần điền]` (chưa vào commit) |

**Bản nháp 2 (28/11/2026):** không có lỗi AI nào cần ghi `AI-BUG-142` (chưa phát hiện lỗi phải sửa sau khi đã giao); nếu review phát hiện thì ghi từ **142**.

## 5. Phối hợp với module khác

| Với | Điểm | Cần gì | Trạng thái |
|---|---|---|---|
| Trung (review) | mọi PR của phần Quản trị viên (B1, B2, X1, F1, F2, X2) | review và approve | chờ |
| **Trung (làm)** | **B3, F3, F4, F5, X3 (bản nháp 2)** | làm B3 sau khi B1 merge (**B1 chưa merge ở 28/11/2026**; Đại báo Trung) và theo thứ tự Q21; B1 trượt thì làm F4, F5 trước B3, F3; báo Đại khi chạm `features/dashboard/index.ts`, `common/`, `router/role-routes.tsx` | chờ giờ rảnh của Trung `[cần điền]` (chat X1 đến X3, thông báo X3) |
| **Đại (review phần ba vai trò)** | năm PR của Trung, khoảng 2,5 giờ | review và approve; báo Trung trước khi F1 thay đổi thẻ số dùng chung | chờ |
| Trung (admin) | F1: bỏ trang rỗng ở `features/admin`, sửa `AF1-01`, tham số mở tab Chi nhánh | báo trước khi mở PR; đụng PR admin đang mở thì dùng phương án lùi của T10 (không sửa trang, liên kết không kèm tab) | chờ |
| Trung (chat) | B1: `app.module.ts` (`ChatModule` đã vào `main` ở `c61d4f6`); F1, F3: `router/role-routes.tsx`, `role-nav.ts` | ai merge sau thì rebase | chờ |
| Chatbot (Đại) | B1: `commitlint.config.cjs`, `AGENTS.md`, `app.module.ts` | gộp sau chatbot P1 | chờ |
| Booking, doctor, payment, wallet | chỉ đọc dữ liệu | đổi trạng thái hay định nghĩa thì test đối chiếu của dashboard đỏ | không chờ |
| Auth, patient | F3, F4, F5: test chuyển hướng và helper đăng nhập của ba vai trò (`[ĐỤNG auth]` `[ĐỤNG patient]`: chỉ sửa test và harness; Đại sửa Q21e ở PLAN patient) | chỉ khi làm trang của vai đó | `[CẮT ĐƯỢC]` |
| Phiên kiểm | T1 đến T13 | duyệt kỹ thuật và kế hoạch | T1 đến T13 đã duyệt 26/11/2026; ba chỗ sửa đã làm, chờ xem lại |
| Đại (Phạm vi) | mốc F-5 chậm nhất 21/12 | **trước 16:46 ngày 27/11/2026** | **đã kiểm 28/11/2026:** Phạm vi 27/11 mục 8 ghi F-5 kế hoạch nội bộ 21/12 |
| Đại (GitHub) | nhãn `module:dashboard`, milestone `dashboard`, Epic, script sinh issue | sau khi PR tài liệu merge | **xong** (Epic #746, issue #747 đến #754 đã tạo; nhãn và milestone đã có; kiểm 28/11/2026) |
| Đại (Word 2.4) | ba use case "Tổng quan" (PLAN Phụ lục C) | **trước 01/12/2026** | chờ |
| Đại (GitHub) | sửa #753, #754; tạo F4, F5, X3; cập nhật Epic #746 (PLAN 6.6b) | sau khi PR kế hoạch merge | chờ |
| Phiên kiểm | T14 đến T21 (bản nháp 2) | duyệt kỹ thuật; quyết chỗ đo M5; duyệt MH10 | **đã duyệt 28/11/2026** (kèm sửa chữ T14 về B1); **M5 đo ở X3** (đã quyết); MH10 được duyệt |
| Đại → Trung | B1 merge (B3 phụ thuộc B1, phụ thuộc giữa hai người) | Đại báo Trung khi B1 merge; B1 trượt thì Trung làm F4, F5 trước B3, F3 | chờ B1 (chưa merge ở 28/11/2026) |

## 6. Số đo thật (PLAN.md mục 5.14; **tiêu chí đặt TRƯỚC khi chạy, không đổi sau khi thấy số**)

| Mã | Đo | Tiêu chí đạt (`[đề xuất]`) | Kết quả |
|---|---|---|---|
| M1 | từng câu, 30 ngày | p95 ≤ 150 ms | chưa đo |
| M2 | từng câu, 366 ngày | p95 ≤ 700 ms | chưa đo |
| M3 | cả service, 30 và 366 ngày | p95 ≤ 600 ms và ≤ 2.000 ms | chưa đo |
| M4 | 5 lời gọi song song 366 ngày | 0 lỗi, p95 ≤ 5.000 ms | chưa đo |
| M5 | Lễ tân (B3; **đo ở X3**, không ở X1: quyết định phiên kiểm 28/11/2026; cần bộ nạp 100.000 lịch của X1) | p95 ≤ 200 ms | chưa đo |

## 7. Cảnh báo và việc chờ (cập nhật khi có thay đổi)

- **Văn bản Phạm vi hạn 16:46 ngày 27/11/2026:** mốc nội bộ của F-5 phải là chậm nhất 21/12 (lúc lập kế hoạch đang chung mốc 14/12 của nhóm F). Dòng F-5 không cần thêm Lễ tân. Phiên kiểm nhận tự sửa; phiên này chưa kiểm file đó.
- **Lịch chặt:** Iteration 10 dư khoảng 1 giờ sau phần cam kết và trùng tuần dự phòng của chatbot (PLAN 6.4).
- **Bốn câu có thể quét toàn bảng** (PLAN 5.10): X1 không đạt thì cần Đại quyết chỉ mục, thêm khoảng 2 giờ.
- **Dữ liệu demo trải nhiều ngày:** `[cần điền]`.
- **`[ĐỒNG BỘ TL]` ngoài repo (Đại):** use case ở hai bản 2.4, 1.2.1, 1.3, bảng Phân loại M24 (PLAN 4.6); chưa sửa.
- ~~Nhãn `module:dashboard` và milestone `dashboard` chưa có~~: **đã có** (kiểm ở bản nháp 2, 28/11/2026: Epic #746, issue #747 đến #754, milestone `dashboard`).
- **Bản nháp 2 (28/11/2026), việc chờ:** (1) ~~phiên kiểm duyệt kỹ thuật T14 đến T21~~ đã duyệt 28/11/2026; **Đại báo Trung khi B1 merge** (B3 phụ thuộc B1, B1 chưa merge); (2) Đại: Word 2.4 ba use case **trước 01/12/2026** (PLAN Phụ lục C); (3) Đại: sau khi PR merge, sửa #753, #754, tạo F4, F5, X3, cập nhật Epic (PLAN 6.6b); (4) Trung: xác nhận giờ rảnh ở Iteration 9, 10 `[cần điền]`; (5) Đại: dữ liệu demo cho ba vai trò `[CHỜ Đại]`; (6) Đại: sửa Q21e của PLAN patient và Q35 của PLAN doctor khi F3, F4, F5 merge; (7) giờ review của Đại (2,5) cùng tuần với 19 giờ việc Quản trị viên (PLAN R9).
