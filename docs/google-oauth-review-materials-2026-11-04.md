# Google OAuth 审核检查与补充材料 2026年11月4日

本文件用于准备回复 Google 的「[Action Needed] Your Google APIs Verification Request」邮件。检查日期采用 Asia/Shanghai。**这是证据整理和待办材料，不代表问题已经修复、审核已经通过或已获得安全认证。** 此次没有发送审核回复，没有提交新的审核声明，没有执行新用户的 Gmail 授权、确认日程或解绑测试。

适用项目：StudyBridge，Google Cloud 项目 `reference-bee-441922-b2`，项目编号 `879850044391`，公开站点 [studybridge.ink](https://studybridge.ink/)，联系邮箱 `qinmingyu4@gmail.com`。代码核查基线为 `43640a7`；10 月 29 日的提交历史依据为 `c77ef32`。旧主线文档中「Testing / 尚未提交」的描述已经落后，不能用于判断当前 Cloud 状态。

## 1. 这次审核在审核什么

审核对象是「邮箱助手 → 学习通知」使用 Gmail 只读权限读取邮件正文、通过 AI 提取学习通知并生成待确认日程的功能。用户必须先在 StudyBridge 明确同意，再在 Google 授权。Google 登录是独立的基础身份功能，登录本身不会授予 Gmail 访问权限。

Cloud 当前列出的权限与代码中的两条授权流程一致：

| 权限 | 用途 | 本次核查结果 |
| --- | --- | --- |
| `openid` | 使用 Google 身份标识识别和登录 StudyBridge 账号 | Cloud 列为非敏感权限；代码使用 Google `sub` |
| `https://www.googleapis.com/auth/userinfo.email` | 获取经 Google 验证的邮箱，查找或创建相应 StudyBridge 账号 | Cloud 列为非敏感权限；运行时登录请求使用等效短名称 `email` |
| `https://www.googleapis.com/auth/userinfo.profile` | 使用姓名和头像初始化账号资料 | Cloud 列为非敏感权限；运行时登录请求使用等效短名称 `profile` |
| `https://www.googleapis.com/auth/gmail.readonly` | 读取邮件主题、发件人、时间和正文，提取学习通知及建议事项 | Cloud 列为受限权限，尚未验证；本次审核核心 |

代码不申请 Gmail 发送、修改、删除权限，也不申请 Google Calendar 权限。确认后的事项写入 StudyBridge 自己的日程。代码证据见 [Google 登录及账号处理](../server.js)、[邮箱提供方授权与读取](../lib/mailbox-providers.js)、[邮箱识别与确认流程](../lib/mailbox-service.js)。

## 2. 邮件清单逐项核查

状态含义：**已观察**表示本次在 Cloud、公开页面或视频中直接看到；**代码支持**表示代码具备相应行为，不等于完成生产实测；**待核实**表示证据不足；**建议补充**表示可执行的准备工作。

| 检查项 | 已有证据 | 判断与下一步 |
| --- | --- | --- |
| 项目与应用一致 | Cloud 项目和邮件项目编号一致，品牌为 StudyBridge | 已观察 |
| 品牌验证 | Cloud 显示 Branding 已验证 | 已观察；不等于 Gmail 权限通过 |
| 数据访问审核状态 | Cloud 显示数据访问仍在审核中，`gmail.readonly` 尚未验证；Audience 为 External / In production，未验证用户计数为 1/100 | 已观察；不能回复「已获批准」，也不能据此判断测试隔离已满足 |
| 权限清单一致 | Cloud 为上述四项权限；登录与 Gmail 在代码中分开授权 | 已观察及代码支持；录屏应覆盖两条流程 |
| 最小必要权限与用途 | Cloud 选择 Email productivity；保存的 981 字符说明与历史用途说明一致 | 已观察；可用下文逐项说明补充清晰度，无需扩大权限 |
| 真实可用功能 | 代码实现绑定、同步、提取、来源链接、编辑、确认日程和解绑；生产设置显示 v1.2.10、Gmail 已连接、Outlook 未绑定，独立同意复选框可见 | 代码支持及实时界面；本次未进行新的连接、解绑或 AI 同步，未用新账号跑完整流程 |
| 演示链接可供审核员观看 | Cloud 已保存视频链接；视频为 Unlisted，95 秒，可播放 | 已观察；保留实际链接在 Cloud 和私下审核往来中，不放入公开仓库 |
| 展开全部权限详情 | 约 45 秒已展开「See access details」，可见读取邮件、搜索邮件及读取设置/过滤器/标签的详情；基础 Google 登录权限未有完整覆盖证据 | Gmail 展开详情已有证据，不应列为缺失；需补充或定位独立基础登录流程 |
| 完整功能结果 | 约 50 秒为通知空态，约 70 秒出现合成通知，约 75 秒显示「已添加到日程」状态；约 80/90 秒邮箱仍显示已连接，只看到解绑按钮 | 已有确认结果的状态证据；补充实际 Schedule 画面可增强完整性。仍缺实际解绑后状态和通知移除的证据 |
| 视频字幕准确性 | 授权页蓝色说明显示「why you're not seeing links…」，字幕却声称展示隐私链接 | 应修正字幕或重新录制实际可见的隐私链接；不把这一观察单独认定为隐私页缺失或审核失败原因 |
| 登录后测试路径 | 代码开放普通注册，Google 首次登录可创建账号；邮箱接口没有会员等级要求 | 本次未跑新账号；先验证测试访问及隔离，再给审核员最终路径或专用测试账号 |
| 测试阶段隔离 | 源码未发现明显的 Gmail 审核测试用户 allowlist | 待核实生产环境或其他层面的限制；在增加测试用户/开放访问前，核实邮件要求的测试环境、隐藏功能及权限隔离如何满足 |
| 首页与隐私政策 | 公开首页可见邮箱只读说明和政策链接；政策无需登录，中英文齐全，更新日期为 10 月 30 日 | 已观察；可直接提供公开 URL |
| 访问、使用、传输、保护、留存和删除披露 | 政策覆盖这些类别，并说明 AI 处理、服务商、备份和已确认日程保留 | 文本已观察；运行实践是否全部符合声明仍需运营核对 |
| Limited Use 与 AI 训练 | 政策有 Limited Use 声明，并禁止将 Google 数据及衍生内容用于通用模型训练、微调或改进 | 文本已观察；本次 OpenAI 数据控制页空白/超时，真实数据共享或训练 opt-in 未核实 |
| `store: false` | 代码/政策披露使用此请求参数 | 不能据此宣称 Zero Data Retention、服务商不留日志或数据共享 opt-in 已关闭 |
| 禁止用途 | 已申报用途是用户主动选择的邮件生产力功能；政策禁止出售、广告、信用评估及通用模型训练 | 代码用途和文字声明相符；第三方合同及运营实践仍需核实，不代替运营方作未经核验的保证 |
| Data Portability | 当前权限清单没有 Data Portability API 权限 | 本次申请不适用；这不免除已有隐私政策中的数据导出承诺 |
| CASA 与年度复核 | 使用服务器处理 Gmail 受限数据；未见已完成的 CASA 报告 | 待 Google 指定适用路径、评估等级和时点；不宣称认证、不自行填写通过结果 |

当前最优先补充的是：基础登录及实际解绑结果的演示、可复现的审核员测试路径、服务商数据控制的实际证据，以及对测试环境隔离要求的核实。旧视频已经展示展开的 Gmail 权限和已添加日程状态；新录制可保留这些证据并补强完整路径。邮件是通用检查清单，不能仅凭其内容推断 Google 已认定每一项都存在缺陷。

## 3. 源码中需要单独评估的数据范围问题

[邮箱提供方实现](../lib/mailbox-providers.js)首次回填通过 `INBOX` 过滤列出邮件，但后续 Gmail history 请求未按收件箱标签过滤。程序收到历史消息 ID 后，先调用 `messages.get?format=full`，再根据返回标签排除非 INBOX 或带 SENT、DRAFT、SPAM、TRASH 的邮件。

这意味着：**源码存在先获取正文、后判断是否属于处理范围的路径**。下游 AI 识别只处理通过筛选的消息，不能据此声称非收件箱正文绝不会先到达服务器。本次没有通过生产流量复现或量化该情况，也没有据此修改授权或代码。

建议另行实施并验证：在 history 阶段尽量缩小范围，并在取全文前用仅含必要标签的查询确认消息仍属于允许范围；同时覆盖消息移出/移入收件箱、带多标签、历史恢复及并发标签变化。完成代码和真实行为检查后，再判断政策中的「检查收件箱」表述是否需要调整。不要为了通过审核而隐瞒实际读取路径。

## 4. 可直接使用的英文权限用途说明

以下文字用于补充说明已实现的功能，不表示已提交修改。最终粘贴到 Cloud 前，应核对实时权限名称及字段长度限制。服务商训练设置未核实前，不在这里加入未经验证的运营保证。

### Application purpose

StudyBridge is a student productivity application. Users can optionally connect their own Gmail account to identify coursework deadlines, professor or teaching-assistant notices, exams and student events. StudyBridge displays source-linked summaries, short evidence excerpts and proposed schedule items. Users review and correct the proposed items before explicitly adding them to their StudyBridge schedule.

### Gmail read-only

`https://www.googleapis.com/auth/gmail.readonly`

This scope provides the message subjects, senders, receipt times and body text needed for StudyBridge's optional learning-notice feature. Body text is needed to identify dates, instructions and supporting evidence; metadata-only access cannot provide it. The implemented feature periodically checks the connected mailbox for relevant notices, starting with a seven-day inbox backfill. Gmail read-only is the narrowest Gmail scope that supports this background message-reading feature. StudyBridge does not request Gmail send, modify or delete permissions, or Google Calendar access. Proposed events are saved to StudyBridge's own schedule only after user confirmation. The separately available reply-writing tool produces drafts and does not send mail through Gmail.

### Basic Google sign-in

`openid`, `https://www.googleapis.com/auth/userinfo.email`, `https://www.googleapis.com/auth/userinfo.profile`

These scopes support Google sign-in separately from Gmail connection. The Google account identifier and verified email are used to identify, create or sign in to the corresponding StudyBridge account. The returned name and profile image initialize the user's profile. Signing in with Google does not authorize mailbox access. Gmail access is requested separately from Settings only after the user agrees to the mailbox and AI-processing disclosure.

### Data flow description

After separate user consent, StudyBridge processes message subjects, sender details, receipt times and body text to identify learning-related notices. Message text is sent to the OpenAI API for classification, including messages that may ultimately be classified as unrelated. Relevant results retain source information, a summary, short evidence excerpts and proposed schedule fields. Users control whether proposed schedule items are saved. Disconnecting the mailbox stops subsequent synchronization and removes the active connection credentials and corresponding extracted records; previously confirmed schedule items remain separately editable. Private backups require separate deletion handling as described in the privacy policy.

## 5. 审核员访问说明草案

**状态：以下路径已按代码和界面名称准备，但尚未使用全新审核账号实测。** 不将这段标记为已验证。先明确生产/测试隔离方式，再确定直接使用审核员自有测试账号还是提供独立 StudyBridge 测试账号。没有现成可交付的审核测试凭据；不得提供所有者个人 Google 密码、会话或令牌。

审核前需要完成：

- 核实新普通账号确实可以进入所需界面，不被邀请码、会员、地区、组织或访问限制阻挡。
- 核实 Gmail 功能按邮件要求仅对适当的测试用户/测试环境开放；不要仅因 Audience 为 In production 就认定隔离要求已满足。
- 为测试使用只含合成邮件的独立 Gmail；邮箱授权会触发近 7 天回填和 AI 传输。
- 如提供独立 StudyBridge 登录凭据，通过私下审核渠道交付，并确认无需借用所有者 Google 账号。凭据不能写入公开仓库、截图字幕或公开视频。
- 用全新测试账号走一遍下面路径，记录实测时间、环境、结果及阻碍；不要把代码检查当作实测。

准备给审核员的英文导航：

1. Open `https://studybridge.ink/` and select English if needed. Enter the app and sign in with the designated test account. The account-access method will be confirmed after our fresh-account access check.
2. Open **Settings → Mailbox authorization**. Read the mailbox and AI-processing disclosure and select the consent checkbox.
3. Under Gmail, select **Connect mailbox**. Use a Gmail account containing synthetic test messages only, review the Google permission details and complete consent.
4. Return to **Mailbox assistant → Study notices**. Select **Sync emails**, then **Refresh notifications** as needed. Synchronization runs in batches and may take several minutes.
5. Open a synthetic learning notice and review its summary, source link, evidence and proposed date/time. Edit the fields if needed and select **Confirm and add to Schedule**.
6. Open **Schedule** and verify the exact synthetic item you confirmed. The app does not add it before confirmation and does not write to Google Calendar.
7. Return to **Settings → Mailbox authorization** and select **Disconnect**. Verify that the mailbox is disconnected and its extracted notices are removed. Confirmed schedule items remain under your control and can be deleted separately.

测试限制应事先写清：

- **不要用自发自收邮件验证提取。** 当前实现排除带 SENT 标签的消息，自发自收邮件可能同时带 INBOX 和 SENT，应从另一个测试发件账号发送。
- 首次回填最近 7 天；每个工作批次最多处理 3 封，积压批次继续处理，默认常规轮询间隔 5 分钟。手动同步有 60 秒限流，生产配置可能调整间隔。小型合成收件箱更容易复现。
- 如果页面显示需重新授权或同步错误，应先处理具体状态，不能把「Sync emails」按钮可点击当作同步成功。
- 界面支持英文，但当前邮箱分类提示词要求简短中文摘要；不保证提取正文全英文。可用英文字幕准确解释可见结果。
- 对演示写入的日程，仅删除明确标记的那一条测试记录，并确认结果；不批量清理真实日程。

## 6. 合成入站邮件示例

下面是待人工发送到指定测试收件箱的素材，不是发送指令，不含真实收发地址。由另一个测试发件账号发送，主题及正文明确注明虚构。若录制日期改变，请把日期改为录制之后的明确日期，并在发送前核对星期和时区。

**Subject:** [FICTIONAL TEST] DEMO101 — Review session on 12 November 2026

> This is a fictional test message created only to demonstrate StudyBridge. It is not an actual course announcement.
>
> Hello DEMO101 students,
>
> Our fictional review session is scheduled for Thursday, 12 November 2026, from 14:00 to 15:00 in the America/Toronto time zone. The location is Demo Room A. Please review the sample notes before the session.
>
> Course: DEMO101 — Demonstration Course
> Event: Fictional review session
> Date: 12 November 2026
> Time: 14:00–15:00, America/Toronto
> Location: Demo Room A
>
> Please do not treat this message as a real academic commitment.
> Fictional Demo Instructor

期待的演示结果是：显示合成通知、明确日期/时间/时区、来源证据和虚构说明，等待用户核对。模型结果有不确定性，录制时按真实输出展示，不修改截图伪造提取成功。若识别失败，先查具体原因再重新录制。

## 7. 2–3 分钟补充录屏脚本

使用隔离测试账号和合成收件箱。录屏应展示实际交互和结果，能够让审核员看清文字；以下时间是目标区间，不应为了满足时长裁掉关键权限或结果。完整流程需要更久时，保留必要内容。

| 时间 | 实际画面与操作 | 建议英文旁白/字幕 |
| --- | --- | --- |
| 0:00–0:20 | 打开公开首页，显示 StudyBridge 名称、邮箱功能和隐私政策链接；打开政策并显示英文版本及 Limited Use、AI 处理说明 | “StudyBridge helps students review learning notices. Mailbox access is optional. Our public privacy policy explains data use, AI processing and deletion.” |
| 0:20–0:45 | 使用新的指定测试账号进入 Google 登录，展开实际可展开的身份权限信息，展示应用名及姓名/头像、邮箱的用途；完成登录 | “Google sign-in identifies the StudyBridge account using basic identity information. This step does not connect Gmail.” |
| 0:45–1:15 | Settings → Mailbox authorization，展示独立告知及勾选；点击 Connect mailbox；在 Google 页面展开 See access details 及其他相关展开项，完整显示 Gmail 只读权限、应用名和实际可见链接 | “Gmail access is requested separately. This permission is used to read messages for learning-notice extraction. StudyBridge does not request permission to send, modify or delete messages.” |
| 1:15–1:40 | 完成真实授权返回，显示连接状态；展示合成入站邮件的相关内容及提取通知、来源链接、证据、日期/时间/时区 | “This fictional message was sent to the test inbox. StudyBridge proposes a review-session item with supporting evidence. Nothing has been added to the schedule yet.” |
| 1:40–2:10 | 核对或编辑建议事项，点击 Confirm and add to Schedule，打开 Schedule 显示同一标题、日期和时间 | “The user reviews the proposal and explicitly confirms it. The event is now in StudyBridge's schedule. Google Calendar is not accessed.” |
| 2:10–2:40 | 返回 Settings，实际点击 Disconnect 并确认；显示未绑定状态，再进入 Study notices 显示该邮箱提取记录已移除 | “Disconnecting stops subsequent synchronization and removes the active connection and extracted records. Previously confirmed schedule items remain under the user's control.” |
| 2:40–3:00 | 显示政策中删除申请联系方式及 Google 撤销入口；如演示清理，明确只移除已识别的虚构日程 | “Users can also revoke Google access and request deletion of account data and applicable backup copies through the published contact.” |

录制质量要求：

- 两条授权流程都需要可理解的证据。若某个已授权账号不再显示基础权限，改用合适的隔离新测试账号或按账号所有者同意重新进行测试；不要撤销所有者真实账号授权来制造录屏。
- 展开所有权限详情，确保画面中的 scope 与 Cloud 清单对应。`email`/`profile` 是运行时短名称，不应误报为额外权限。
- 每一条字幕都描述实际可见内容。页面没有显示隐私链接时，不写“the privacy link is shown”；可另行展示已公开的政策 URL，并向 Google 说明该授权页的真实状态。
- 保留「点击确认 → 日程出现」及「解绑 → 未绑定/卡片移除」的完整结果。只展示按钮不足以证明完成。
- 不出现真实邮件列表、个人资料侧栏、密码、验证码、Cookie、令牌、开发者密钥或其他用户的数据。遮盖敏感内容时不遮盖应用名称、权限、关键结果或合成邮件证据。
- 上传后检查无需被邀请即可通过链接观看，清晰度足够，视频内容与保存到 Cloud 的版本一致。旧视频无需在完成替代品前删除。

## 8. 数据处理核对表

下表区分已见政策/代码与运营证据。它可以支持解释数据流，不能作为第三方安全认证。

| 数据/阶段 | 用途与处理方 | 已有依据 | 仍需核实 |
| --- | --- | --- | --- |
| Google 身份 ID、验证邮箱、姓名、头像 | Google 提供，StudyBridge 用于登录及账号资料 | 登录代码、公开政策 | 新审核账号登录路径、实际配置 |
| OAuth access/refresh token | StudyBridge 服务器连接用户自愿授权的邮箱；代码用 AES-256-GCM 保存 | 提供方/服务代码、公开政策 | 生产密钥管理、访问控制及备份管理的实际执行；不公开任何值 |
| 邮件 ID、主题、发件人、接收时间、正文 | Gmail → StudyBridge；识别所需文本传至 OpenAI API，包括最终判为无关的消息 | 代码、设置告知、公开政策 | 第 3 节历史读取范围问题；生产行为尚未复现 |
| 附件 | 当前实现不下载用于分析 | MIME 文本提取代码、政策 | 回归检查仍应覆盖带附件邮件，不能泛化为所有未来功能 |
| AI 请求和服务商记录 | OpenAI API 执行分类/提取；代码使用 `store: false` | 请求实现、政策 | 实际组织/项目数据控制、是否加入数据共享或训练、适用服务条款及保留设置未确认 |
| 摘要、原文短证据、来源、建议事项 | 存于 StudyBridge，为用户显示与确认 | 服务代码、政策 | 实际访问权限与运营留存是否符合声明 |
| 已确认日程 | 用户确认后写入 StudyBridge 日程；解绑后保留，可单独管理 | 确认代码、政策 | 新测试账号端到端确认和单项删除尚未重跑 |
| 连接和提取记录的删除 | 解绑清除活动连接凭据与对应提取记录，停止后续同步 | 解绑实现、政策 | 实测结果；已经发送给服务商的请求不能撤回 |
| 备份、副本及服务商留存 | AWS 承载服务/存储；私有备份可能含旧副本，政策允许用户申请删除处理 | 政策及已有运维文档 | 适用副本位置、轮转周期、删除能力、必要留存及服务商处理方法需运营确认 |

正式回复中关于 AI 的声明应准确覆盖 Google 数据及其衍生内容，也包括向第三方传输后的使用限制。**只有核实实际数据控制和适用服务条款后，才能确认相关运营实践符合已发布声明。** 如果数据控制页仍无法读取，应写明待核实，不用 `store: false` 替代这一核验。

## 9. CASA 后续确认问题

这些问题可在 Google 指定评估步骤或要求进一步材料时提出，不代替评估，也不意味着现在已授权采购服务：

1. 对当前 `gmail.readonly`、服务器处理及 OpenAI API 转交数据的架构，适用哪一条 CASA/安全评估路径与等级？
2. 是否已到应启动独立评估的阶段？请提供官方指引、项目关联方式和认可的评估机构选择流程。
3. 评估范围应覆盖哪些生产系统、数据存储、备份、第三方服务和处理流程？可否提供所需证据类别？
4. 是否需要专用测试环境或特定测试账号？在审核完成前，生产受限权限功能应如何隐藏或限制测试人群？
5. 报告、验证信或其他完成证明应提交到哪里，如何关联本项目和 OAuth 请求？
6. 后续年度复核从哪个日期起算，适用频率、提前通知和范围变更要求是什么？

尚无可引用的 CASA 报告或认证结果。不要将「已确认申请表声明」写成「已完成评估」，不要在未获得所有者授权前接受评估合同或付款。

## 10. 删除申请处理 SOP 草案

**状态：建议运营流程，尚未确认全部步骤都已建立或演练。** 不承诺未确定的处理时限、备份清除日期或第三方删除能力。对外承诺必须以实际能力及适用要求为依据。

1. **登记申请。** 从公开联系邮箱接收申请，记录申请编号、收到时间和请求范围；不要求用户发送 Google 密码、OAuth token 或完整邮箱内容。
2. **核对账号归属。** 使用必要且与风险相称的方法确认请求人有权处理该 StudyBridge 账号。只记录核对结果，尽量不复制额外身份资料。
3. **确认删除范围。** 区分邮箱连接与提取记录、已确认日程、其他学习资料、整个账号、导出副本以及私有备份。告知解绑和 Google 端撤销的不同影响。
4. **停止继续处理。** 对需要删除的邮箱连接执行正常解绑流程，阻止后续同步。说明已提交给第三方的在途请求无法撤回，不声称撤销授权等于删除所有历史副本。
5. **处理在线记录。** 依据已确认范围删除相应连接、提取记录及其他账号内容。对已确认日程单独处理，避免误删无关课程、聊天或其他用户记录。
6. **清点副本。** 由获授权运营人员确认私有备份、导出和受控副本位置、恢复流程及可执行的删除方法。若存在必要留存，记录具体理由和范围，向用户解释实际处理方式。
7. **核对服务商责任。** 根据实际合同、设置及服务商能力确定是否需要提交删除请求。记录请求与结果，不能把未知的服务商保留情况写成零留存。
8. **验证并记录。** 核对目标在线记录不再可访问、邮箱不会继续同步，记录备份和服务商副本的已完成步骤、剩余限制及依据。审计记录只保留证明处理所需的最少信息，不保留被删邮件内容作为证明。
9. **反馈用户。** 说明完成的范围、仍需处理的项目及适用限制；仅提供有依据的进度或预计时间。必要时说明 Google 账号第三方连接页面上的独立撤销步骤。
10. **恢复防护。** 如系统从旧备份恢复，运营流程应防止已确认删除的数据重新投入使用；具体机制、负责人及演练结果需另行落实。

建议用独立合成账号演练一次「解绑删除」「删除指定日程」「账号/备份请求」三种范围，确认实际支持能力后再定稿 SOP。

## 11. 提交前待完成事项

- [ ] 核实邮件要求的测试环境/隐藏功能/访问隔离，确认适用方式并保留证据。
- [ ] 完成新测试账号进入和 Gmail 功能实测，不分享所有者真实账号凭据。
- [ ] 核实 OpenAI 组织/项目的数据共享与训练控制和适用服务条款，解决当前未知项。
- [ ] 评估并处理 Gmail history 先取全文再按标签排除的源码问题，或准确向审核方说明现状。
- [ ] 制作并检查包含全部展开权限、确认日程结果和解绑结果的补充录屏，修正与画面不一致的字幕。
- [ ] 把最终视频链接、逐项 scope 说明和已验证导航整理到私下审核回复；这里不包含回复正文或秘密。
- [ ] 根据 Google 明确要求确认 CASA 路径、时点和后续年度复核安排。
- [ ] 最后逐句核对：只声称已实际完成的操作，保留待核实事项，不写「所有清单已通过」。

## 12. 相关材料

- [Google Gmail 权限分类](https://developers.google.com/workspace/gmail/api/auth/scopes)：`gmail.readonly` 是受限权限，metadata 不含正文；服务器存储或传输受限数据涉及安全评估。
- [Google 受限权限验证](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)：本项目的服务器数据处理架构应按适用要求完成独立评估，并安排年度复核；具体流程由 Google 和认可评估方确认。
- [Google 用户数据政策](https://developers.google.com/terms/api-services-user-data-policy)：实际用途、访问范围和披露必须一致。
- [OpenAI API 数据控制](https://developers.openai.com/api/docs/guides/your-data)：API 数据默认不用于训练，主动选择共享是例外；请求中的 `store: false` 不能证明组织共享设置或零留存。官方规则不能替代本项目真实配置核验。
- [Google OAuth 提交记录与数据流](google-oauth-verification.md)
- [邮箱助手功能、配置及同步限制](mailbox-assistant.md)
- [公开隐私政策源文件](../public/privacy.html) · [线上政策](https://studybridge.ink/privacy.html)
- [授权设置与告知界面](../public/settings.js)
- [学习通知与确认界面](../public/mailbox-assistant.js)
- [Gmail 授权和数据读取](../lib/mailbox-providers.js)
- [邮箱分类、同步、解绑及确认](../lib/mailbox-service.js)

本文件没有保存邮箱密码、客户端秘密、token、个人邮件、数据库或私有备份。Unlisted 视频的实际链接及私有捕获材料保留在审核所需的私下渠道，不写入公开仓库。
