import React, { useState, useEffect, useRef, useCallback, useMemo, useContext } from 'react';
import {
  Plus, Edit2, Trash2, X, Upload, Download, ChevronRight, ChevronDown,
  Save, Map as MapIcon, List as ListIcon, Calendar, FileSpreadsheet,
  Clock, AlertTriangle, CheckCircle2, Circle, PlayCircle,
  MessageSquare, Search, MoreHorizontal, FolderPlus, FileDown,
  FileUp, Activity, Home, ArrowRightLeft, Info, RefreshCw, UserCircle,
  Move, FileText, History, Grip, BarChart3, HelpCircle, BookOpen, Users, Maximize2, Link as LinkIcon
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { SearchModal, useSearchHotkey } from './components/SearchModal';
import { GanttView } from './components/GanttView';
import { MembersModal } from './components/MembersModal';
import { GlossaryList } from './components/Glossary';
import { DirectoryModal } from './components/DirectoryModal';
import Walkthrough from './components/Walkthrough/Walkthrough';
import { useAuth } from './auth';
import { useUserDirectory, useWorkspaceDirectory } from './data';
import { buildDirectoryIndex, canonicalPerson, pickerPeople, groupByPerson, personKey, personLabel, findMember, meKey, isMeFor } from './directory';
import { validateWebhookUrl, buildTestText, postToChat, WEBHOOK_PREFIX, buildActionCard, getNotifyPref, setNotifyPref, buildNewActionCard, buildCloseSubmittedCard, buildCloseRejectedCard } from './chatNotify';
import { isWorkspaceOwnerEmail, transferCandidates, OWNER_WRITE_FLAG, transferLocked, TRANSFER_LOCKED_MESSAGE } from './ownership';
import { nextSaveState, hasUnsavedWork, failedRestores, FORCE_WRITE_FLAG, bannerGroups, createKeyedQueue, loadFailures, saveChip, retryablePids } from './persistence';
import { planActivityAppend } from './activityLog';
import { clampPanelWidth, autoRows, isBriefingDismissed, dismissBriefing } from './uiPrefs';
import { taskWithStatus } from './taskOps';
import { isOverdueTask } from './taskStatus';
// P3 Task 7: close flow choke point, task-panel close control, View as read-only.
import { closeEventsFor, managerLevel, canEditCreditSplit, canEditCreditFields, reassignClose } from './closeFlow';
import { closeIntentFor, runCloseFlow, chokeMessage, replanMessage, isCloseOutcome, replaceTask, closeRollbackTask, directoryByUid, READ_ONLY_MESSAGE, MANUAL_SPLIT_MESSAGE } from './closeWiring';
import { v2RolesNow, v2SavedTree, v2MemberUidsNow, changeRoleV2, rememberCurrentProject } from './storage-shim';
import { MeContext } from './components/meContext';
import { CloseControl } from './components/CloseControl';
import { taskUrl, parseDeepLink } from './deepLink';
import { RolePicker } from './components/RolePicker';
import { loadMetaStrict } from './bootLoad.js';
import { approvalBuckets } from './approvalsInbox.js';
// Wave 1 PR-E: role-aware UI (dates, hidden controls, role chip).
import { datesWithinWs, canEditTaskDates, uiCaps, myRoleSummary, canEditRaid, canEditDecision, canDeleteRaidOrDecision } from './roleUi.js';
import { taskCountUnder, splitRestoreByV2, DELETE_HAS_TASKS_MESSAGE, V2_RESTORE_MESSAGE, activityToRestore } from './treeGuards.js';
import {
  canEditRole, pickerPeople as rolePickerPeople, validateRoleChange, rolesAfter, reroutePlan, roleChangeEvent,
  scopeNameOf, roleChangeConfirmLines, roleSavedMessage, rerouteFailedMessage, rowsForRoles,
  focusRoleRows, mindNodeRoleText,
} from './roleAssign';

// P1: directory index (or null) for read-time person canonicalization in dashboards.
const DirectoryIndexContext = React.createContext(null);

/* ═════════ SEED DATA ═════════ */
const SEED_CRP = {"id": "proj_crp", "name": "CRP", "createdAt": "2026-04-24T00:00:00.000Z", "programs": [{"id": "p_1", "name": "LLCs", "workstreams": [{"id": "w_1", "name": "HIO", "tasks": [{"id": "t_1", "name": "Resolution for dissolutions & Submit to BRA", "status": "Planned", "pic": "Legal", "start": "2026-04-15", "end": "2026-04-30", "duration": 15, "deliverables": "Quyết định chấp thuận Hồ sơ xin giải thể", "dependencies": null, "checkIns": []}, {"id": "t_2", "name": "Debt payment plan, asset liquidation", "status": "Planned", "pic": "AF", "start": "2026-04-15", "end": "2026-04-30", "duration": 15, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_3", "name": "Close Tax code - Tổng hợp rủi ro & estimate inspection cost", "status": "Planned", "pic": "AF", "start": "2026-03-20", "end": "2026-03-30", "duration": 10, "deliverables": "1. Bảng tổng hợp rủi ro & review report for tax status during previous years", "dependencies": null, "checkIns": []}, {"id": "t_4", "name": "Submit request for tax code closure", "status": "Planned", "pic": "AF", "start": "2026-03-30", "end": "2026-04-14", "duration": 15, "deliverables": "2. Tax audit request for closure", "dependencies": null, "checkIns": []}, {"id": "t_5", "name": "Tax inspection process for tax code closre", "status": "Planned", "pic": "AF", "start": "2026-04-14", "end": "2026-06-13", "duration": 60, "deliverables": "2. Biên bản quyết toán Thuế\n3. Chấp thuận đóng Mã Số Thuế", "dependencies": null, "checkIns": []}, {"id": "t_6", "name": "Settles debts, distribute remainders to owners", "status": "Planned", "pic": "AF", "start": "2026-06-13", "end": "2026-07-13", "duration": 30, "deliverables": "Shares returns to individuals", "dependencies": "Meeting + BoD", "checkIns": []}, {"id": "t_7", "name": "Submit application for dissolustions to BRAs", "status": "Planned", "pic": "Legal", "start": "2026-07-13", "end": "2026-08-12", "duration": 30, "deliverables": "Quyết định chấp thuận Hồ sơ xin giải thể", "dependencies": null, "checkIns": []}]}, {"id": "w_2", "name": "SKT", "tasks": [{"id": "t_8", "name": "Resolution for dissolutions & Submit to BRA", "status": "Planned", "pic": "Legal", "start": "2026-04-15", "end": "2026-04-30", "duration": 15, "deliverables": "Quyết định chấp thuận Hồ sơ xin giải thể", "dependencies": null, "checkIns": []}, {"id": "t_9", "name": "Debt payment plan, asset liquidation", "status": "Planned", "pic": "AF", "start": "2026-04-15", "end": "2026-04-30", "duration": 15, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_10", "name": "Close Tax code - Tổng hợp rủi ro & estimate inspection cost", "status": "Planned", "pic": "AF", "start": "2026-04-15", "end": "2026-04-30", "duration": 15, "deliverables": "1. Bảng tổng hợp rủi ro & review report for tax status during previous years", "dependencies": null, "checkIns": []}, {"id": "t_11", "name": "Submit request for tax code closure", "status": "Planned", "pic": "AF", "start": "2026-04-30", "end": "2026-05-15", "duration": 15, "deliverables": "2. Tax audit request for closure", "dependencies": null, "checkIns": []}, {"id": "t_12", "name": "Tax inspection process for tax code closre", "status": "Planned", "pic": "AF", "start": "2026-05-15", "end": "2026-08-13", "duration": 90, "deliverables": "2. Biên bản quyết toán Thuế\n3. Chấp thuận đóng Mã Số Thuế", "dependencies": null, "checkIns": []}, {"id": "t_13", "name": "Settles debts, distribute remainders to owners", "status": "Planned", "pic": "AF", "start": "2026-08-13", "end": "2026-09-12", "duration": 30, "deliverables": "Shares returns to individuals", "dependencies": null, "checkIns": []}, {"id": "t_14", "name": "Submit application for dissolustions to BRAs", "status": "Planned", "pic": "Legal", "start": "2026-09-12", "end": "2026-10-12", "duration": 30, "deliverables": "Quyết định chấp thuận Hồ sơ xin giải thể", "dependencies": null, "checkIns": []}]}]}, {"id": "p_2", "name": "NSC", "workstreams": [{"id": "w_3", "name": "New SingCo", "tasks": [{"id": "t_15", "name": "Chốt Business Plan ( Owner structure,  Nhân sự, business operation model, estimate PnL)", "status": "Planned", "pic": "AF", "start": "2026-04-15", "end": "2026-04-25", "duration": 10, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_16", "name": "High-level communication", "status": "Planned", "pic": "Sponsor", "start": "2026-04-15", "end": "2026-04-30", "duration": 15, "deliverables": "BOM, Appointed Legal Rep/ Ownership, Moved HODs", "dependencies": null, "checkIns": []}, {"id": "t_17", "name": "Overseas investment registration", "status": "Planned", "pic": "Legal", "start": "2026-04-25", "end": "2026-06-09", "duration": 45, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_18", "name": "Advisory Report for NewSingco Structure", "status": "Planned", "pic": "AF", "start": "2026-04-25", "end": "2026-05-20", "duration": 25, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_19", "name": "Incorporate Registration", "status": "Planned", "pic": "Legal", "start": "2026-06-09", "end": "2026-07-09", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_20", "name": "Góp vốn thành lập", "status": "Planned", "pic": "AF", "start": "2026-07-09", "end": "2026-07-19", "duration": 10, "deliverables": "Mở tài khoản NH + Góp vốn theo đăng ký tại ERCs", "dependencies": null, "checkIns": []}, {"id": "t_21", "name": "Compliance work - Legal", "status": "Planned", "pic": "Legal", "start": "2026-07-09", "end": "2026-07-24", "duration": 15, "deliverables": "Công bố thông tin + khắc dấu", "dependencies": null, "checkIns": []}, {"id": "t_22", "name": "Compliance work - Taxes & Accounting", "status": "Planned", "pic": "AF", "start": "2026-07-09", "end": "2026-07-24", "duration": 15, "deliverables": "Đăng ký thuế, set up kế toán", "dependencies": null, "checkIns": []}, {"id": "t_23", "name": "Compliance work - Insurance, ....", "status": "Planned", "pic": "HR", "start": "2026-07-09", "end": "2026-07-24", "duration": 15, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_24", "name": "Bank mandate set up", "status": "Planned", "pic": "AF", "start": "2026-07-09", "end": "2026-07-24", "duration": 15, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_25", "name": "Prepare cash flow", "status": "Planned", "pic": "AF", "start": "2026-07-09", "end": "2026-07-24", "duration": 15, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_26", "name": "Hire key staffs", "status": "Planned", "pic": "HR", "start": "2026-05-25", "end": "2026-07-24", "duration": 60, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_27", "name": "Vendor for opeartion- Accounting", "status": "Planned", "pic": "AF", "start": "2026-06-09", "end": "2026-07-24", "duration": 45, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_28", "name": "Vendor for opeartion- HR", "status": "Planned", "pic": "HR", "start": "2026-07-09", "end": "2026-08-08", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_29", "name": "Vendor for opeartion- Legal", "status": "Planned", "pic": "HR", "start": "2026-07-09", "end": "2026-08-08", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_30", "name": "DOA, SOPs ver 2 ( HR)", "status": "Planned", "pic": "HR", "start": "2026-07-24", "end": "2026-09-07", "duration": 45, "deliverables": "Nội quy lao động, Quy chế, Org chart, UQ etc", "dependencies": null, "checkIns": []}, {"id": "t_31", "name": "DOA, SOPs ver 2 ( AF)", "status": "Planned", "pic": "AF", "start": "2026-07-24", "end": "2026-09-07", "duration": 45, "deliverables": "Quy chế TC, DOAs", "dependencies": null, "checkIns": []}, {"id": "t_32", "name": "Data migration & System update - Legal", "status": "Planned", "pic": "Legal", "start": "2026-07-24", "end": "2026-10-22", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_33", "name": "Data migration & System update - IT", "status": "Planned", "pic": "IT", "start": "2026-07-24", "end": "2026-10-22", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_34", "name": "Data migration & System update - HR", "status": "Planned", "pic": "HR", "start": "2026-07-24", "end": "2026-10-22", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_35", "name": "Data migration & System update - AF", "status": "Planned", "pic": "AF", "start": "2026-07-24", "end": "2026-10-22", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_36", "name": "Business Performance reporting New Structure - FIN", "status": "Planned", "pic": "FIN", "start": "2026-07-24", "end": "2026-10-22", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_37", "name": "First year PnL & Divident distribution - AF Work", "status": "Planned", "pic": "AF", "start": "2026-10-22", "end": "2026-12-21", "duration": 60, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_38", "name": "First year PnL & Divident distribution - Legal Work", "status": "Planned", "pic": "Legal", "start": "2026-12-21", "end": "2027-02-19", "duration": 60, "deliverables": null, "dependencies": null, "checkIns": []}]}]}, {"id": "p_3", "name": "NVNC", "workstreams": [{"id": "w_4", "name": "New VNCo", "tasks": [{"id": "t_39", "name": "Chốt Business Plan ( Owner structure,  Nhân sự, business operation model, estimate PnL)", "status": "Planned", "pic": "AF", "start": "2026-04-15", "end": "2026-05-15", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_40", "name": "High-level communication", "status": "Planned", "pic": "Sponsor", "start": "2026-04-15", "end": "2026-05-15", "duration": 30, "deliverables": "BOM, Appointed Legal Rep/ Ownership, Moved HODs", "dependencies": null, "checkIns": []}, {"id": "t_41", "name": "Investment registration", "status": "Planned", "pic": "Legal", "start": "2026-07-19", "end": "2026-08-18", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_42", "name": "Enterprise Registration", "status": "Planned", "pic": "Legal", "start": "2026-08-18", "end": "2026-09-17", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_43", "name": "Góp vốn thành lập", "status": "Planned", "pic": "AF", "start": "2026-09-17", "end": "2026-09-27", "duration": 10, "deliverables": "Mở tài khoản NH + Góp vốn theo đăng ký tại ERCs", "dependencies": null, "checkIns": []}, {"id": "t_44", "name": "Compliance work - Legal", "status": "Planned", "pic": "Legal", "start": "2026-09-17", "end": "2026-10-07", "duration": 20, "deliverables": "Công bố thông tin + khắc dấu", "dependencies": null, "checkIns": []}, {"id": "t_45", "name": "Compliance work - Taxes & Accounting", "status": "Planned", "pic": "AF", "start": "2026-09-17", "end": "2026-10-07", "duration": 20, "deliverables": "Đăng ký thuế, set up kế toán", "dependencies": null, "checkIns": []}, {"id": "t_46", "name": "Compliance work - HR", "status": "Planned", "pic": "HR", "start": "2026-09-17", "end": "2026-10-07", "duration": 20, "deliverables": "Insurances, etc", "dependencies": null, "checkIns": []}, {"id": "t_47", "name": "Bank mandate set up", "status": "Planned", "pic": "AF", "start": "2026-09-17", "end": "2026-10-07", "duration": 20, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_48", "name": "Prepare cash flow", "status": "Planned", "pic": "AF", "start": "2026-09-17", "end": "2026-10-07", "duration": 20, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_49", "name": "Coms & Move Staffs", "status": "Planned", "pic": "HR", "start": "2026-08-18", "end": "2026-10-17", "duration": 60, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_50", "name": "Vendor, asset  movement - Accouting systems", "status": "Planned", "pic": "AF", "start": "2026-09-17", "end": "2026-10-17", "duration": 30, "deliverables": "Chuyển tài sản, HĐ vendor gắn với nhân sự sang sở hữu bởi SPVs\nChuyển HĐ thuê VP sang SPVs", "dependencies": null, "checkIns": []}, {"id": "t_51", "name": "Vendor, asset  movement - Vendor works", "status": "Planned", "pic": "GA", "start": "2026-09-17", "end": "2026-10-17", "duration": 30, "deliverables": "Chuyển tài sản, HĐ vendor gắn với nhân sự sang sở hữu bởi SPVs\nChuyển HĐ thuê VP sang SPVs", "dependencies": null, "checkIns": []}, {"id": "t_52", "name": "Management  Contracts (InterCo)", "status": "Planned", "pic": "AF", "start": "2026-07-19", "end": "2026-09-17", "duration": 60, "deliverables": "Ký Hợp đồng với SM Sing/ ANZ", "dependencies": null, "checkIns": []}, {"id": "t_53", "name": "Management  Contracts (New Clients)", "status": "Planned", "pic": "AF", "start": "2026-05-15", "end": "2026-08-13", "duration": 90, "deliverables": "Communicate với key levels (MLs, HODs) v/v chuyển các HĐ đang kí với VN qua kí với new entities & v/v các khách hàng mới sẽ kí với new VNCO", "dependencies": null, "checkIns": []}, {"id": "t_54", "name": "Management billings", "status": "Planned", "pic": "AF", "start": "2026-10-07", "end": "2026-11-21", "duration": 45, "deliverables": "Luồng billing giữa các entities", "dependencies": null, "checkIns": []}, {"id": "t_55", "name": "TPs & documents", "status": "Planned", "pic": "AF", "start": "2026-10-17", "end": "2026-12-01", "duration": 45, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_56", "name": "DOA, SOPs ver 2 ( Legal)", "status": "Planned", "pic": "Legal", "start": "2026-10-07", "end": "2026-11-21", "duration": 45, "deliverables": "Quy chế, DOAs", "dependencies": null, "checkIns": []}, {"id": "t_57", "name": "DOA, SOPs ver 2 ( HR)", "status": "Planned", "pic": "HR", "start": "2026-10-07", "end": "2026-11-21", "duration": 45, "deliverables": "Nội quy lao động, Quy chế, Org chart, UQ etc", "dependencies": null, "checkIns": []}, {"id": "t_58", "name": "DOA, SOPs ver 2 ( AF)", "status": "Planned", "pic": "AF", "start": "2026-10-07", "end": "2026-11-21", "duration": 45, "deliverables": "Quy chế TC, DOAs", "dependencies": null, "checkIns": []}, {"id": "t_59", "name": "Data migration & System update - Legal", "status": "Planned", "pic": "Legal", "start": "2026-10-07", "end": "2027-01-05", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_60", "name": "Data migration & System update - IT", "status": "Planned", "pic": "IT", "start": "2026-10-07", "end": "2027-01-05", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_61", "name": "Data migration & System update - HR", "status": "Planned", "pic": "HR", "start": "2026-10-07", "end": "2027-01-05", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_62", "name": "Data migration & System update - AF", "status": "Planned", "pic": "AF", "start": "2026-10-07", "end": "2027-01-05", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_63", "name": "Business Performance reporting New Structure - FIN", "status": "Planned", "pic": "FIN", "start": "2026-10-07", "end": "2027-01-05", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_64", "name": "First year PnL & Divident distribution - AF Work", "status": "Planned", "pic": "AF", "start": "2027-03-26", "end": "2027-06-24", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_65", "name": "First year PnL & Divident distribution - Legal Work", "status": "Planned", "pic": "Legal", "start": "2027-03-26", "end": "2027-06-24", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}]}]}, {"id": "p_4", "name": "SSWAP", "workstreams": [{"id": "w_5", "name": "New Sing Co.", "tasks": [{"id": "t_66", "name": "Obtain M&A Approval", "status": "Planned", "pic": "Legal", "start": "2026-07-24", "end": "2026-08-23", "duration": 30, "deliverables": "Thông báo chấp thuận việc mua cổ phần", "dependencies": null, "checkIns": []}, {"id": "t_67", "name": "SPA a among SingCo & LLCs", "status": "Planned", "pic": "Legal", "start": "2026-07-24", "end": "2026-08-23", "duration": 30, "deliverables": "SPAs", "dependencies": null, "checkIns": []}, {"id": "t_68", "name": "Ký kết HĐ chuyển nhượng vốn và Kê khai, nộp thuế", "status": "Planned", "pic": "AF", "start": "2026-08-24", "end": "2026-09-08", "duration": 15, "deliverables": "1. Hợp đồng chuyển nhượng vốn\n2. Seller Kê khai, nộp thuế liên quan chuyển nhượng vốn", "dependencies": null, "checkIns": []}, {"id": "t_69", "name": "Thực hiện chuyển nhượng vốn và trả tiền cho Sellers", "status": "Planned", "pic": "AF", "start": "2026-09-09", "end": "2026-09-24", "duration": 15, "deliverables": "1.Chuyển vốn vào TK DICA của SM Corp\n2. SM Corp trả tiền bán Cổ phần cho Sellers từ DICA", "dependencies": null, "checkIns": []}, {"id": "t_70", "name": "Cập nhật Sổ đăng ký cổ đông", "status": "Planned", "pic": "Legal", "start": "2026-09-25", "end": "2026-09-30", "duration": 5, "deliverables": "Sổ đăng ký cổ đông", "dependencies": null, "checkIns": []}, {"id": "t_71", "name": "Notify of change innumber of shares hold by foreignshare holder", "status": "Planned", "pic": "Legal", "start": "2026-09-30", "end": "2026-10-05", "duration": 5, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_72", "name": "Dividend pays to NewSingCo", "status": "Planned", "pic": "Legal", "start": "2026-10-05", "end": "2026-10-10", "duration": 5, "deliverables": null, "dependencies": null, "checkIns": []}]}]}, {"id": "p_5", "name": "SPVs", "workstreams": [{"id": "w_6", "name": "ManagementCo", "tasks": [{"id": "t_73", "name": "Chốt Business Plan ( Owner structure,  Nhân sự, business operation model, estimte PnL)", "status": "Planned", "pic": "AF", "start": "2026-03-23", "end": "2026-04-07", "duration": 15, "deliverables": null, "dependencies": "Meeting + BoD", "checkIns": []}, {"id": "t_74", "name": "High-level communication", "status": "Planned", "pic": "Sponsor", "start": "2026-03-23", "end": "2026-04-12", "duration": 20, "deliverables": "BOM, Appointed Legal Rep/ Ownership, Moved HODs", "dependencies": null, "checkIns": []}, {"id": "t_75", "name": "Nộp hồ sơ đăng ký thành lập SPVs (get ERC)", "status": "Planned", "pic": "Legal", "start": "2026-04-12", "end": "2026-04-27", "duration": 15, "deliverables": "Đăng ký kinh doanh (ERC)", "dependencies": null, "checkIns": []}, {"id": "t_76", "name": "Góp vốn thành lập", "status": "Planned", "pic": "AF", "start": "2026-04-27", "end": "2026-05-07", "duration": 10, "deliverables": "Mở tài khoản NH + Góp vốn theo đăng ký tại ERCs", "dependencies": null, "checkIns": []}, {"id": "t_77", "name": "Compliance work - Legal", "status": "Planned", "pic": "Legal", "start": "2026-04-27", "end": "2026-05-07", "duration": 10, "deliverables": "Công bố thông tin + khắc dấu", "dependencies": null, "checkIns": []}, {"id": "t_78", "name": "Compliance work - Taxes & Accounting", "status": "Planned", "pic": "AF", "start": "2026-04-27", "end": "2026-05-07", "duration": 10, "deliverables": "Đăng ký thuế, set up kế toán", "dependencies": null, "checkIns": []}, {"id": "t_79", "name": "Compliance work - HR", "status": "Planned", "pic": "HR", "start": "2026-04-27", "end": "2026-05-07", "duration": 10, "deliverables": "Insurances, ...", "dependencies": null, "checkIns": []}, {"id": "t_80", "name": "Bank mandate set up", "status": "Planned", "pic": "AF", "start": "2026-04-27", "end": "2026-05-17", "duration": 20, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_81", "name": "Prepare cash flow", "status": "Planned", "pic": "AF", "start": "2026-04-27", "end": "2026-05-17", "duration": 20, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_82", "name": "Coms & Move Staffs", "status": "Planned", "pic": "HR", "start": "2026-04-12", "end": "2026-05-27", "duration": 45, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_83", "name": "Vendor, asset  movement - Accouting systems", "status": "Planned", "pic": "AF", "start": "2026-04-27", "end": "2026-05-27", "duration": 30, "deliverables": "Chuyển tài sản, HĐ vendor gắn với nhân sự sang sở hữu bởi SPVs\nChuyển HĐ thuê VP sang SPVs", "dependencies": null, "checkIns": []}, {"id": "t_84", "name": "Vendor, asset  movement - Vendor works", "status": "Planned", "pic": "GA", "start": "2026-04-27", "end": "2026-05-27", "duration": 30, "deliverables": "Chuyển tài sản, HĐ vendor gắn với nhân sự sang sở hữu bởi SPVs\nChuyển HĐ thuê VP sang SPVs", "dependencies": null, "checkIns": []}, {"id": "t_85", "name": "Management  Contracts", "status": "Planned", "pic": "AF", "start": "2026-04-27", "end": "2026-06-11", "duration": 45, "deliverables": "Ký Hợp đồng với SM Sing/ ANZ", "dependencies": null, "checkIns": []}, {"id": "t_86", "name": "Management billings", "status": "Planned", "pic": "AF", "start": "2026-04-27", "end": "2026-06-11", "duration": 45, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_87", "name": "TPs & documents", "status": "Planned", "pic": "AF", "start": "2026-04-27", "end": "2026-06-11", "duration": 45, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_88", "name": "DOA, SOPs ver 2 ( HR)", "status": "Planned", "pic": "HR", "start": "2026-05-07", "end": "2026-06-21", "duration": 45, "deliverables": "Nội quy lao động, Quy chế, Org chart, UQ etc", "dependencies": null, "checkIns": []}, {"id": "t_89", "name": "DOA, SOPs ver 2 ( AF)", "status": "Planned", "pic": "AF", "start": "2026-05-27", "end": "2026-07-11", "duration": 45, "deliverables": "Quy chế TC, DOAs", "dependencies": null, "checkIns": []}, {"id": "t_90", "name": "Data migration & System update - Legal", "status": "Planned", "pic": "Legal", "start": "2026-05-27", "end": "2026-08-25", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_91", "name": "Data migration & System update - IT", "status": "Planned", "pic": "IT", "start": "2026-05-27", "end": "2026-08-25", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_92", "name": "Data migration & System update - HR", "status": "Planned", "pic": "HR", "start": "2026-05-27", "end": "2026-08-25", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_93", "name": "Data migration & System update - AF", "status": "Planned", "pic": "AF", "start": "2026-05-27", "end": "2026-08-25", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_94", "name": "First year PnL & Divident distribution - AF Work", "status": "Planned", "pic": "AF", "start": "2026-08-25", "end": "2026-10-24", "duration": 60, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_95", "name": "First year PnL & Divident distribution - Legal Work", "status": "Planned", "pic": "Legal", "start": "2026-10-24", "end": "2026-12-23", "duration": 60, "deliverables": null, "dependencies": null, "checkIns": []}]}, {"id": "w_7", "name": "SPVs", "tasks": [{"id": "t_96", "name": "Business Performance reporting New Structure - FIN", "status": "Planned", "pic": "FIN", "start": "2026-05-27", "end": "2026-08-25", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}]}, {"id": "w_8", "name": "FIB Co", "tasks": [{"id": "t_97", "name": "Chốt Business Plan ( Owner structure,  Nhân sự, business operation model, estimte PnL)", "status": "Planned", "pic": "AF", "start": "2026-03-23", "end": "2026-04-07", "duration": 15, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_98", "name": "High-level communication", "status": "Planned", "pic": "Sponsor", "start": "2026-03-23", "end": "2026-04-22", "duration": 30, "deliverables": "BOM, Appointed Legal Rep/ Ownership, Moved HODs", "dependencies": null, "checkIns": []}, {"id": "t_99", "name": "Nộp hồ sơ đăng ký thành lập SPVs (get ERC)", "status": "Planned", "pic": "Legal", "start": "2026-04-22", "end": "2026-05-22", "duration": 30, "deliverables": "Đăng ký kinh doanh (ERC)", "dependencies": null, "checkIns": []}, {"id": "t_100", "name": "Góp vốn thành lập", "status": "Planned", "pic": "AF", "start": "2026-05-22", "end": "2026-06-01", "duration": 10, "deliverables": "Mở tài khoản NH + Góp vốn theo đăng ký tại ERCs", "dependencies": null, "checkIns": []}, {"id": "t_101", "name": "Compliance work - Legal", "status": "Planned", "pic": "Legal", "start": "2026-05-22", "end": "2026-06-01", "duration": 10, "deliverables": "Công bố thông tin + khắc dấu", "dependencies": null, "checkIns": []}, {"id": "t_102", "name": "Compliance work - Taxes & Accounting", "status": "Planned", "pic": "AF", "start": "2026-05-22", "end": "2026-06-01", "duration": 10, "deliverables": "Đăng ký thuế, set up kế toán", "dependencies": null, "checkIns": []}, {"id": "t_103", "name": "Compliance work - Insurance, ....", "status": "Planned", "pic": "HR", "start": "2026-05-22", "end": "2026-06-01", "duration": 10, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_104", "name": "Bank mandate set up", "status": "Planned", "pic": "AF", "start": "2026-05-22", "end": "2026-06-06", "duration": 15, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_105", "name": "Prepare cash flow", "status": "Planned", "pic": "AF", "start": "2026-05-22", "end": "2026-06-06", "duration": 15, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_106", "name": "Coms & Move Staffs", "status": "Planned", "pic": "HR", "start": "2026-04-22", "end": "2026-06-21", "duration": 60, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_107", "name": "Vendor, asset  movement - Accouting systems", "status": "Planned", "pic": "AF", "start": "2026-05-22", "end": "2026-06-21", "duration": 30, "deliverables": "Chuyển tài sản, HĐ vendor gắn với nhân sự sang sở hữu bởi SPVs\nChuyển HĐ thuê VP sang SPVs", "dependencies": null, "checkIns": []}, {"id": "t_108", "name": "Vendor, asset  movement - Vendor works", "status": "Planned", "pic": "GA", "start": "2026-05-22", "end": "2026-06-21", "duration": 30, "deliverables": "Chuyển tài sản, HĐ vendor gắn với nhân sự sang sở hữu bởi SPVs\nChuyển HĐ thuê VP sang SPVs", "dependencies": null, "checkIns": []}, {"id": "t_109", "name": "Management  Contracts", "status": "Planned", "pic": "AF", "start": "2026-05-22", "end": "2026-07-06", "duration": 45, "deliverables": "Ký Hợp đồng với SM OSC", "dependencies": null, "checkIns": []}, {"id": "t_110", "name": "Management billings", "status": "Planned", "pic": "AF", "start": "2026-05-22", "end": "2026-07-06", "duration": 45, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_111", "name": "TPs & documents", "status": "Planned", "pic": "AF", "start": "2026-05-22", "end": "2026-07-06", "duration": 45, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_112", "name": "DOA, SOPs ver 2 ( HR)", "status": "Planned", "pic": "HR", "start": "2026-06-01", "end": "2026-07-16", "duration": 45, "deliverables": "Nội quy lao động, Quy chế, Org chart, UQ etc", "dependencies": null, "checkIns": []}, {"id": "t_113", "name": "DOA, SOPs ver 2 ( AF)", "status": "Planned", "pic": "AF", "start": "2026-06-21", "end": "2026-08-05", "duration": 45, "deliverables": "Quy chế TC, DOAs", "dependencies": null, "checkIns": []}, {"id": "t_114", "name": "Data migration & System update - Legal", "status": "Planned", "pic": "Legal", "start": "2026-06-21", "end": "2026-09-19", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_115", "name": "Data migration & System update - IT", "status": "Planned", "pic": "IT", "start": "2026-06-21", "end": "2026-09-19", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_116", "name": "Data migration & System update - HR", "status": "Planned", "pic": "HR", "start": "2026-06-21", "end": "2026-09-19", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_117", "name": "Data migration & System update - AF", "status": "Planned", "pic": "AF", "start": "2026-06-21", "end": "2026-09-19", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_118", "name": "First year PnL & Divident distribution - AF Work", "status": "Planned", "pic": "AF", "start": "2026-09-19", "end": "2026-11-18", "duration": 60, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_119", "name": "First year PnL & Divident distribution - Legal Work", "status": "Planned", "pic": "Legal", "start": "2026-11-18", "end": "2027-01-17", "duration": 60, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_120", "name": "Quyết toán + Đóng cửa VP HCM - AF Part", "status": "Planned", "pic": "AF", "start": "2026-11-18", "end": "2027-02-16", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}]}]}, {"id": "p_6", "name": "FINTECH", "workstreams": [{"id": "w_9", "name": "Fintech Co", "tasks": [{"id": "t_121", "name": "Chốt Business Plan ( Owner structure,  Nhân sự, business operation model, estimte PnL)", "status": "Planned", "pic": "AF", "start": "2025-09-15", "end": "2025-09-30", "duration": 15, "deliverables": null, "dependencies": "Meeting + BoD", "checkIns": []}, {"id": "t_122", "name": "High-level communication", "status": "Planned", "pic": "Sponsor", "start": "2025-10-01", "end": "2025-10-13", "duration": 12, "deliverables": "BOM, Appointed Legal Rep/ Ownership, Moved HODs", "dependencies": null, "checkIns": []}, {"id": "t_123", "name": "Cập nhật cơ cấu sở hữu (nếu có) - Cash", "status": "Planned", "pic": "AF", "start": "2026-04-15", "end": "2026-04-27", "duration": 12, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_124", "name": "Cập nhật cơ cấu sở hữu (nếu có) - Documents", "status": "Planned", "pic": "Legal", "start": "2026-04-15", "end": "2026-04-27", "duration": 12, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_125", "name": "Bank mandate set up", "status": "Planned", "pic": "AF", "start": "2026-04-15", "end": "2026-04-30", "duration": 15, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_126", "name": "Prepare cash flow", "status": "Planned", "pic": "AF", "start": "2026-04-15", "end": "2026-04-30", "duration": 15, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_127", "name": "Compliance work - Taxes", "status": "Planned", "pic": "AF", "start": "2025-10-06", "end": "2025-11-20", "duration": 45, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_128", "name": "Compliance work - Insurance, ....", "status": "Planned", "pic": "HR", "start": "2025-10-06", "end": "2025-11-20", "duration": 45, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_129", "name": "Coms & Move Staffs", "status": "Planned", "pic": "HR", "start": "2025-10-06", "end": "2025-11-05", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_130", "name": "Vendor, asset  movement - Accouting systems", "status": "Planned", "pic": "AF", "start": "2025-10-06", "end": "2025-11-05", "duration": 30, "deliverables": "Chuyển tài sản, HĐ vendor gắn với nhân sự sang sở hữu bởi SPVs\nChuyển HĐ thuê VP sang SPVs", "dependencies": null, "checkIns": []}, {"id": "t_131", "name": "Vendor, asset  movement - Vendor works", "status": "Planned", "pic": "GA", "start": "2025-10-06", "end": "2025-11-05", "duration": 30, "deliverables": "Chuyển tài sản, HĐ vendor gắn với nhân sự sang sở hữu bởi SPVs\nChuyển HĐ thuê VP sang SPVs", "dependencies": null, "checkIns": []}, {"id": "t_132", "name": "Inteco contract", "status": "Planned", "pic": "AF", "start": "2025-10-06", "end": "2025-11-20", "duration": 45, "deliverables": "Ký Hợp đồng với SM Sing/ ANZ", "dependencies": null, "checkIns": []}, {"id": "t_133", "name": "DOA, SOPs ver 2 ( HR)", "status": "Planned", "pic": "HR", "start": "2026-03-23", "end": "2026-05-07", "duration": 45, "deliverables": "Nội quy lao động, Quy chế, Org chart, UQ etc", "dependencies": null, "checkIns": []}, {"id": "t_134", "name": "DOA, SOPs ver 2 ( AF)", "status": "Planned", "pic": "AF", "start": "2026-03-23", "end": "2026-05-07", "duration": 45, "deliverables": "Quy chế TC, DOAs", "dependencies": null, "checkIns": []}, {"id": "t_135", "name": "Data migration & System update - Legal", "status": "Planned", "pic": "Legal", "start": "2026-03-23", "end": "2026-06-21", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_136", "name": "Data migration & System update - IT", "status": "Planned", "pic": "IT", "start": "2026-03-23", "end": "2026-06-21", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_137", "name": "Data migration & System update - HR", "status": "Planned", "pic": "HR", "start": "2026-03-23", "end": "2026-06-21", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_138", "name": "Data migration & System update - AF", "status": "Planned", "pic": "AF", "start": "2026-03-23", "end": "2026-06-21", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_139", "name": "Business Performance reporting New Structure - FIN", "status": "Planned", "pic": "FIN", "start": "2026-03-23", "end": "2026-06-21", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_140", "name": "Quyết toán với Cơ quan Thuế (incl rà soát & lên plan)", "status": "Planned", "pic": "AF", "start": "2026-08-01", "end": "2026-12-29", "duration": 150, "deliverables": null, "dependencies": null, "checkIns": []}]}]}, {"id": "p_7", "name": "SDigital", "workstreams": [{"id": "w_10", "name": "SDigital", "tasks": [{"id": "t_141", "name": "Nghiên cứu các khả năng sử dụng Smart Digital", "status": "Planned", "pic": "AF", "start": "2026-03-23", "end": "2026-05-07", "duration": 45, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_142", "name": "Chốt Business Plan ( Owner structure,  Nhân sự, business operation model, estimte PnL)", "status": "Planned", "pic": "AF", "start": "2026-05-07", "end": "2026-06-06", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_143", "name": "High-level communication", "status": "Planned", "pic": "Sponsor", "start": "2026-05-07", "end": "2026-06-06", "duration": 30, "deliverables": "BOM, Appointed Legal Rep/ Ownership, Moved HODs", "dependencies": null, "checkIns": []}, {"id": "t_144", "name": "Cập nhật cơ cấu sở hữu (nếu có) - Cash", "status": "Planned", "pic": "AF", "start": "2026-06-06", "end": "2026-07-06", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_145", "name": "Cập nhật cơ cấu sở hữu (nếu có) - Documents", "status": "Planned", "pic": "Legal", "start": "2026-06-06", "end": "2026-07-06", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_146", "name": "Bank mandate set up", "status": "Planned", "pic": "AF", "start": "2026-06-06", "end": "2026-07-06", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_147", "name": "Prepare cash flow", "status": "Planned", "pic": "AF", "start": "2026-06-06", "end": "2026-07-06", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_148", "name": "Compliance work - Taxes", "status": "Planned", "pic": "AF", "start": "2026-07-06", "end": "2026-08-20", "duration": 45, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_149", "name": "Compliance work - Insurance, ....", "status": "Planned", "pic": "HR", "start": "2026-07-06", "end": "2026-08-20", "duration": 45, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_150", "name": "Coms & Move Staffs", "status": "Planned", "pic": "HR", "start": "2025-10-06", "end": "2025-11-05", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_151", "name": "Vendor, asset  movement - Accouting systems", "status": "Planned", "pic": "AF", "start": "2026-07-06", "end": "2026-08-05", "duration": 30, "deliverables": "Chuyển tài sản, HĐ vendor gắn với nhân sự sang sở hữu bởi SPVs\nChuyển HĐ thuê VP sang SPVs", "dependencies": null, "checkIns": []}, {"id": "t_152", "name": "Vendor, asset  movement - Vendor works", "status": "Planned", "pic": "GA", "start": "2026-07-06", "end": "2026-08-05", "duration": 30, "deliverables": "Chuyển tài sản, HĐ vendor gắn với nhân sự sang sở hữu bởi SPVs\nChuyển HĐ thuê VP sang SPVs", "dependencies": null, "checkIns": []}, {"id": "t_153", "name": "Inteco contract", "status": "Planned", "pic": "AF", "start": "2026-07-06", "end": "2026-08-20", "duration": 45, "deliverables": "Ký Hợp đồng với SM Sing/ ANZ", "dependencies": null, "checkIns": []}, {"id": "t_154", "name": "DOA, SOPs ver 2 ( HR)", "status": "Planned", "pic": "HR", "start": "2026-08-20", "end": "2026-10-04", "duration": 45, "deliverables": "Nội quy lao động, Quy chế, Org chart, UQ etc", "dependencies": null, "checkIns": []}, {"id": "t_155", "name": "DOA, SOPs ver 2 ( AF)", "status": "Planned", "pic": "AF", "start": "2026-08-05", "end": "2026-09-19", "duration": 45, "deliverables": "Quy chế TC, DOAs", "dependencies": null, "checkIns": []}, {"id": "t_156", "name": "Data migration & System update - Legal", "status": "Planned", "pic": "Legal", "start": "2026-08-05", "end": "2026-11-03", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_157", "name": "Data migration & System update - IT", "status": "Planned", "pic": "IT", "start": "2026-08-05", "end": "2026-11-03", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_158", "name": "Data migration & System update - HR", "status": "Planned", "pic": "HR", "start": "2026-08-05", "end": "2026-11-03", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_159", "name": "Data migration & System update - AF", "status": "Planned", "pic": "AF", "start": "2026-08-05", "end": "2026-11-03", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_160", "name": "Business Performance reporting New Structure - FIN", "status": "Planned", "pic": "FIN", "start": "2026-08-05", "end": "2026-11-03", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_161", "name": "Quyết toán + Đóng cửa VP ĐN", "status": "Planned", "pic": "AF", "start": "2026-08-05", "end": "2026-11-03", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}]}]}, {"id": "p_8", "name": "Cash Event", "workstreams": [{"id": "w_11", "name": "Founder funding", "tasks": [{"id": "t_162", "name": "Chi relocation package để funding cho 02 UBOs thành lập New SingCo", "status": "Planned", "pic": "AF", "start": "2026-03-08", "end": "2026-04-07", "duration": 30, "deliverables": "5300000000", "dependencies": null, "checkIns": []}]}, {"id": "w_12", "name": "Smart AX", "tasks": [{"id": "t_163", "name": "Mua 5% cổ phần Smart AX từ UBO-S trước tăng vốn", "status": "Planned", "pic": "AF", "start": "2026-03-08", "end": "2026-04-07", "duration": 30, "deliverables": "1500000000", "dependencies": null, "checkIns": []}, {"id": "t_164", "name": "Tăng vốn Smart AX (thông qua founder representative)", "status": "Planned", "pic": "AF", "start": "2026-03-30", "end": "2026-04-29", "duration": 30, "deliverables": "1800000000", "dependencies": null, "checkIns": []}, {"id": "t_165", "name": "Deferred / payable tranche for share acquisition from individuals", "status": "Planned", "pic": "AF", "start": "2026-08-19", "end": "2026-09-18", "duration": 30, "deliverables": "19200000000", "dependencies": null, "checkIns": []}]}, {"id": "w_13", "name": "New SingCo", "tasks": [{"id": "t_166", "name": "New SingCo incorporation / legal / corporate services fees", "status": "Planned", "pic": "AF", "start": "2026-03-16", "end": "2026-04-15", "duration": 30, "deliverables": "397500000", "dependencies": null, "checkIns": []}, {"id": "t_167", "name": "Góp vốn lần 1: đủ để thành lập New SingCo & New VNCo + chi phí vận hành", "status": "Planned", "pic": "AF", "start": "2026-03-30", "end": "2026-04-29", "duration": 30, "deliverables": "5300000000", "dependencies": null, "checkIns": []}, {"id": "t_168", "name": "Initial bank, operating and compliance cash for New SingCo", "status": "Planned", "pic": "AF", "start": "2026-03-30", "end": "2026-04-29", "duration": 30, "deliverables": "1325000000", "dependencies": null, "checkIns": []}, {"id": "t_169", "name": "Mua 20% cổ phần Smart AX từ 02 UBO / founder seller (sau tăng vốn)", "status": "Planned", "pic": "AF", "start": "2026-08-30", "end": "2026-09-29", "duration": 30, "deliverables": "13250000000", "dependencies": null, "checkIns": []}]}, {"id": "w_14", "name": "Management Co", "tasks": [{"id": "t_170", "name": "Management Co legal and incorporation cost", "status": "Planned", "pic": "AF", "start": "2026-03-31", "end": "2026-04-30", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_171", "name": "Capital contribution to Management Co", "status": "Planned", "pic": "AF", "start": "2026-03-31", "end": "2026-04-30", "duration": 30, "deliverables": "1000000000", "dependencies": null, "checkIns": []}, {"id": "t_172", "name": "Initial working capital for Management Co", "status": "Planned", "pic": "AF", "start": "2026-04-30", "end": "2026-05-30", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}]}, {"id": "w_15", "name": "Back-up route", "tasks": [{"id": "t_173", "name": "Merge-route legal / tax / advisory cost if PA2 is activated", "status": "Planned", "pic": "AF", "start": "2026-04-01", "end": "2026-05-01", "duration": 30, "deliverables": "1000000000", "dependencies": null, "checkIns": []}]}, {"id": "w_16", "name": "LLC dissolution", "tasks": [{"id": "t_174", "name": "Legal / audit / filing cost for dissolution work", "status": "Planned", "pic": "AF", "start": "2026-04-14", "end": "2026-05-14", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_175", "name": "LLC A pays Mr Bao (Vendor)", "status": "Planned", "pic": "AF", "start": "2026-05-30", "end": "2026-06-29", "duration": 30, "deliverables": "300000000", "dependencies": null, "checkIns": []}, {"id": "t_176", "name": "LLC A tax closure / inspection / settlement cost", "status": "Planned", "pic": "AF", "start": "2026-05-30", "end": "2026-06-29", "duration": 30, "deliverables": "300000000", "dependencies": null, "checkIns": []}, {"id": "t_177", "name": "Deferred / payable tranche settled after second dividend", "status": "Planned", "pic": "AF", "start": "2027-04-01", "end": "2027-05-01", "duration": 30, "deliverables": "2129832593", "dependencies": null, "checkIns": []}]}, {"id": "w_17", "name": "New VNCo", "tasks": [{"id": "t_178", "name": "New VNCo legal, licence and incorporation cost", "status": "Planned", "pic": "AF", "start": "2026-04-30", "end": "2026-05-30", "duration": 30, "deliverables": "132500000", "dependencies": null, "checkIns": []}, {"id": "t_179", "name": "Capital contribution to New VNCo", "status": "Planned", "pic": "AF", "start": "2026-04-30", "end": "2026-05-30", "duration": 30, "deliverables": "2650000000", "dependencies": null, "checkIns": []}, {"id": "t_180", "name": "LLC B tax closure / inspection / settlement cost", "status": "Planned", "pic": "AF", "start": "2026-05-30", "end": "2026-06-29", "duration": 30, "deliverables": "1000000000", "dependencies": null, "checkIns": []}]}, {"id": "w_18", "name": "FIB Co", "tasks": [{"id": "t_181", "name": "Initial operating runway for New VNCo", "status": "Planned", "pic": "AF", "start": "2026-05-30", "end": "2026-06-29", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_182", "name": "FIB Co legal and incorporation cost", "status": "Planned", "pic": "AF", "start": "2026-05-31", "end": "2026-06-30", "duration": 30, "deliverables": "1000000000", "dependencies": null, "checkIns": []}, {"id": "t_183", "name": "Capital contribution to FIB Co", "status": "Planned", "pic": "AF", "start": "2026-05-31", "end": "2026-06-30", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}]}, {"id": "w_19", "name": "Share acquisition", "tasks": [{"id": "t_184", "name": "Initial working capital for FIB Co", "status": "Planned", "pic": "AF", "start": "2026-07-30", "end": "2026-08-29", "duration": 30, "deliverables": "10600000000", "dependencies": null, "checkIns": []}, {"id": "t_185", "name": "Cash portion of New SingCo acquisition of shares from individuals", "status": "Planned", "pic": "AF", "start": "2026-08-04", "end": "2026-09-03", "duration": 30, "deliverables": "47700000000", "dependencies": null, "checkIns": []}, {"id": "t_186", "name": "Tăng vốn New SingCo để có đủ tiền mua lại cổ phần JSC", "status": "Planned", "pic": "AF", "start": "2026-08-30", "end": "2026-09-29", "duration": 30, "deliverables": "47700000000", "dependencies": null, "checkIns": []}, {"id": "t_187", "name": "Chia cổ tức 2025 cho New SingCo để funding cho việc mua lại cổ phần", "status": "Planned", "pic": "AF", "start": "2026-09-01", "end": "2026-10-01", "duration": 30, "deliverables": "47700000000", "dependencies": null, "checkIns": []}, {"id": "t_188", "name": "Chia cổ tức lần 2 cho New SingCo để funding phần thanh toán tiếp theo cho UBOs", "status": "Planned", "pic": "AF", "start": "2027-04-01", "end": "2027-05-01", "duration": 30, "deliverables": "47700000000", "dependencies": null, "checkIns": []}]}]}]};

/* ═════════ CONSTANTS ═════════ */
const STATUSES = ['Planned', 'InProgress', 'Completed', 'Dropped'];
const STATUS_LABEL = { Planned: 'Planned', InProgress: 'In Progress', Completed: 'Completed', Dropped: 'Dropped', Submitted: 'Pending approval' };
// Weight for % rollup. Dropped is excluded from the denominator entirely (see rollup()).
const STATUS_WEIGHT = { Planned: 0, InProgress: 0.5, Completed: 1, Dropped: null, Submitted: 0.5 };
const HEALTH_VALUES = ['green', 'amber', 'red'];
const HEALTH_LABEL = { green: 'On track', amber: 'At risk', red: 'Off track' };

// ─── Deadline classification (Activity Dashboard) ───
const DEADLINE_TYPES = ['hard', 'soft'];
const DEADLINE_TYPE_LABEL = { hard: 'Hard deadline', soft: 'Soft target' };
const DEFAULT_DEADLINE_TYPE = 'hard';

// ─── Activity Dashboard thresholds ───
const ACTIVITY_THRESHOLDS = {
  delivery: { green: 85, amber: 70 },
  cadence:  { green: 7, amber: 14 },
  blocker:  { green: 3, amber: 7 },
  risk:     { green: 85, amber: 70 },
  engagement: { green: 5, amber: 2 },
  composite: { green: 80, amber: 65 },
  minSamples: 3,
};
const COMPOSITE_WEIGHTS = {
  delivery: 0.40,
  cadence: 0.30,
  risk: 0.20,
  engagement: 0.10,
};
const DEFAULT_DASHBOARD_WINDOW = {
  actionWeeks: 4,
  taskWeeks: 12,
};
const DIFFICULTY_PRESETS = {
  standard: 1.0,
  complex: 1.3,
  exploration: 1.5,
  execution: 1.0,
};
const DIFFICULTY_LABELS = {
  standard: 'Standard',
  complex: 'Complex (Legal/Finance)',
  exploration: 'Exploration (R&D/Strategy)',
  execution: 'Execution (Sales/Ops)',
};

// ─── Briefing & decision decay constants ───
const DECISION_REVIEW_DAYS = 30;
const BRIEFING_DEFAULT_WINDOW_DAYS = 7;

// ─── Credit allocation (v22+) ───
const DEFAULT_CREDIT_POINTS = 100;

// Default company departments — seeded into contributorRegistry for new projects.
// Owner can add/remove via Project Settings → Contributor registry.
const DEFAULT_DEPARTMENTS = ['HR', 'QA', 'GA', 'Legal', 'IT', 'FIN', 'AF', 'BOD'];

// v30 Phase 4 — Views eligible to be the workspace/personal default landing
// view. Owner-only views (portfolio, credit-report, team-overview) excluded
// because non-owners can't land on them. Per-project views with potentially
// empty data (decisions, actions) also excluded to avoid landing on empty
// screens.
const DEFAULT_VIEW_OPTIONS = [
  { id: 'my-work', label: 'My Work' },
  { id: 'mindmap', label: 'Mind map' },
  { id: 'outline', label: 'Outline' },
  { id: 'gantt', label: 'Gantt' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'aggregation', label: 'Aggregation' },
  { id: 'activity', label: 'Activity Dashboard' },
];

// v30 RAID Register — type config. Icons stay text-emoji (consistent with the
// rest of the file which uses unicode glyphs for risk/issue/dependency markers
// — see e.g. the overdue badge "⚠" usage already in TOK styling).
const RAID_TYPES = {
  Risk:       { icon: '⚠',  label: 'Risk',       fg: '#A32D2D', bg: '#FCEBEB' },
  Assumption: { icon: '💡', label: 'Assumption', fg: '#0C447C', bg: '#E6F1FB' },
  Issue:      { icon: '🔥', label: 'Issue',      fg: '#B7791F', bg: '#FAEEDA' },
  Dependency: { icon: '🔗', label: 'Dependency', fg: '#4B2D8C', bg: '#EEEDFE' },
};

// All valid RAIDItem.status values. Status flow:
//   Draft → PendingApproval → Active → (Mitigating | Resolved | Accepted) → Closed
// Visibility: Draft = creator only; PendingApproval = creator + owner; Active+ = everyone.
const RAID_STATUSES = ['Draft', 'PendingApproval', 'Active', 'Mitigating', 'Resolved', 'Accepted', 'Closed'];

// Trend config — used by RAID review history. `stable` is the default for newly created items.
const RAID_TREND_CONFIG = {
  improving:  { icon: '🟢', label: 'Improving',  fg: '#356512', bg: '#E6EFD6' },
  stable:     { icon: '🟡', label: 'Stable',     fg: '#B7791F', bg: '#FAEEDA' },
  escalating: { icon: '🔴', label: 'Escalating', fg: '#A32D2D', bg: '#FCEBEB' },
};

// Risk level matrix — riskLevel is COMPUTED from likelihood × impact, never stored.
// Spec §1d / §9.1.
const RAID_RISK_MATRIX = {
  'High:High':     'Critical',
  'High:Medium':   'High',
  'High:Low':      'High',
  'Medium:High':   'High',
  'Medium:Medium': 'Medium',
  'Medium:Low':    'Low',
  'Low:High':      'Medium',
  'Low:Medium':    'Low',
  'Low:Low':       'Low',
};

// Threshold (in days) for "Needs review" badge on Active/Mitigating items. Spec §9.7.
const RAID_REVIEW_STALE_DAYS = 7;

// Reference (wiki link) types — auto-detected from URL pattern.
// Each type gets a distinctive label + color pill in the UI.
const REF_TYPE_STYLE = {
  sheet:  { label: 'Sheet',  bg: '#E2F0DE', fg: '#2D7A2D' }, // Google Sheets — green
  doc:    { label: 'Doc',    bg: '#DCE7F7', fg: '#1F4E8C' }, // Google Docs — blue
  slides: { label: 'Slides', bg: '#FBF1DC', fg: '#B7791F' }, // Google Slides — yellow
  drive:  { label: 'Drive',  bg: '#D6ECEC', fg: '#1F6F6F' }, // Google Drive folder/file — teal
  figma:  { label: 'Figma',  bg: '#EBE3F4', fg: '#5B3D8C' }, // Figma — purple
  notion: { label: 'Notion', bg: '#EDEBE4', fg: '#1A1A19' }, // Notion — neutral
  link:   { label: 'Link',   bg: '#EDEBE4', fg: '#6E6C66' }, // Generic — gray
};

// Detect reference type from a URL. Falls back to 'link' for unrecognized hosts.
function detectRefType(url) {
  if (!url) return 'link';
  const u = String(url).toLowerCase();
  if (u.includes('docs.google.com/spreadsheets')) return 'sheet';
  if (u.includes('docs.google.com/document')) return 'doc';
  if (u.includes('docs.google.com/presentation')) return 'slides';
  if (u.includes('drive.google.com')) return 'drive';
  if (u.includes('figma.com')) return 'figma';
  if (u.includes('notion.so') || u.includes('notion.site')) return 'notion';
  return 'link';
}

// Compact, human-readable URL preview.
function shortUrl(url, max = 56) {
  if (!url) return '';
  let s = String(url).replace(/^https?:\/\//i, '').replace(/\/$/, '');
  if (s.length > max) s = s.slice(0, max - 1) + '…';
  return s;
}

// Validate URL syntactically (must be http/https).
function isValidUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const TOK = {
  bg: '#F7F5EF', surface: '#FFFFFF', ink: '#1A1A19', muted: '#6E6C66', subtle: '#706E68',
  line: 'rgba(26,26,25,0.10)', lineStrong: 'rgba(26,26,25,0.22)',
  accent: '#3B6D11',
  plannedFg: '#6E6C66', plannedBg: '#EDEBE4',
  inprogFg: '#A8660C', inprogBg: '#FAEEDA',
  doneFg: '#356512', doneBg: '#E6EFD6',
  droppedFg: '#7A7873', droppedBg: '#F0EEE8',
  overdueFg: '#A32D2D', overdueBg: '#FCEBEB',
  programFg: '#0C447C', programBg: '#E6F1FB',
  workstreamFg: '#0F6E56', workstreamBg: '#E1F5EE',
  projectFg: '#26215C', projectBg: '#EEEDFE',
  // Health (RAG)
  healthGreen: '#2D7A2D', healthGreenBg: '#E2F0DE',
  healthAmber: '#8A5A12', healthAmberBg: '#FBF1DC',
  healthRed: '#A32D2D', healthRedBg: '#FCEBEB',
  // Mention highlight
  mention: '#1F5EA8', mentionBg: '#E5EFFB',
  blocker: '#A32D2D', blockerBg: '#FCEBEB',
};

const FONT_STACK = '"Geist","Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';

/* ═════════ UTILITIES ═════════ */
const uid = (p = 'id') => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const cloneDeep = (x) => JSON.parse(JSON.stringify(x));
const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const parseDate = (s) => { if (!s) return null; if (s instanceof Date) return isNaN(s) ? null : s; const d = new Date(s); return isNaN(d) ? null : d; };
const fmtDate = (s) => { const d = parseDate(s); return d ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'; };
const fmtDateShort = (s) => { const d = parseDate(s); return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'; };
const fmtDateTime = (s) => { const d = parseDate(s); return d ? d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'; };
const toISODate = (s) => { const d = parseDate(s); return d ? d.toISOString().slice(0, 10) : ''; };
const isOverdue = (t) => isOverdueTask(t, today());

// ─── v30 RAID helpers ───
// riskLevel is COMPUTED every render — never persisted. Spec §9.1.
const raidRiskLevel = (likelihood, impact) =>
  RAID_RISK_MATRIX[`${likelihood}:${impact}`] ?? 'Medium';

// Days since the most recent review note. Falls back to createdAt when an
// item has no history yet. Returns 0 if neither field is set or the timestamp
// is unparseable (defensive — should not happen in normal data).
const raidDaysSinceReview = (item) => {
  const ts = item?.lastReviewedAt || item?.createdAt;
  const d = parseDate(ts);
  if (!d) return 0;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
};

// On-load migration — ensures every program has a `raid` array. Idempotent.
// Mutates and returns the project for convenience in the load loop.
function ensureProjectRaid(project) {
  if (!project || !Array.isArray(project.programs)) return project;
  for (const pg of project.programs) {
    if (!Array.isArray(pg.raid)) pg.raid = [];
  }
  return project;
}

// ─── Activity Dashboard / Briefing date helpers ───
function weeksAgo(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n * 7);
  return d;
}

function daysBetween(a, b) {
  const da = new Date(a); da.setHours(0, 0, 0, 0);
  const db = new Date(b); db.setHours(0, 0, 0, 0);
  return Math.round((db - da) / 86400000);
}

function inDateRange(ts, from, to) {
  if (!ts) return false;
  const d = new Date(ts);
  if (isNaN(d)) return false;
  if (from && d < from) return false;
  if (to) { const t = new Date(to); t.setHours(23, 59, 59, 999); if (d > t) return false; }
  return true;
}

function bucketColor(value, thresholds, { inverted = false } = {}) {
  if (value == null || isNaN(value)) return 'subtle';
  if (inverted) {
    if (value <= thresholds.green) return 'green';
    if (value <= thresholds.amber) return 'amber';
    return 'red';
  }
  if (value >= thresholds.green) return 'green';
  if (value >= thresholds.amber) return 'amber';
  return 'red';
}

function sampleStatus(count) {
  return count >= ACTIVITY_THRESHOLDS.minSamples ? 'ok' : 'low';
}

function addDays(isoDate, days) {
  if (!isoDate) return null;
  const d = new Date(isoDate);
  if (isNaN(d)) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isMonday(date = new Date()) {
  return date.getDay() === 1;
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function logDeadlineChange(oldTask, newEnd, author, reason) {
  const oldEnd = oldTask.end || null;
  const next = newEnd || null;
  if (oldEnd === next) return oldTask;
  const entry = {
    id: `dh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    from: oldEnd, to: next,
    changedAt: new Date().toISOString(),
    changedBy: author || 'Unknown',
    reason: reason || '',
  };
  return { ...oldTask, end: next, deadlineHistory: [...(oldTask.deadlineHistory || []), entry] };
}

// Trend direction: 'up' | 'flat' | 'down' | null. inverted=true means lower is better.
function trendOf(curr, prev, { inverted = false } = {}) {
  if (curr == null || prev == null) return null;
  const delta = curr - prev;
  const threshold = Math.max(2, Math.abs(prev) * 0.05);
  if (Math.abs(delta) < threshold) return 'flat';
  const isUp = delta > 0;
  if (inverted) return isUp ? 'down' : 'up';
  return isUp ? 'up' : 'down';
}

// Per-PIC activity snapshot for the Activity Dashboard. Pure function.
function computeActivityIndex(projectsMap, options = {}, dirIndex = null) {
  const now = options.now || new Date();
  const actionFrom = options.actionFrom || weeksAgo(DEFAULT_DASHBOARD_WINDOW.actionWeeks);
  const taskFrom = options.taskFrom || weeksAgo(DEFAULT_DASHBOARD_WINDOW.taskWeeks);

  const out = new Map();
  // P1: keyed by canonical person id, `pic` = display name. With no dirIndex,
  // id === pic === the raw string (legacy grouping).
  const ensure = (raw) => {
    const id = personKey(dirIndex, raw);
    if (!out.has(id)) out.set(id, {
      pic: personLabel(dirIndex, raw), id,
      delivery: { onTime: 0, late: 0, total: 0, rate: null, weightedRate: null, hardOnTime: 0, hardTotal: 0, softOnTime: 0, softTotal: 0 },
      cadence:  { activeTasks: 0, staleTasks: 0, avgDaysSinceUpdate: null },
      blocker:  { resolved: 0, unresolved: 0, avgResolveDays: null },
      risk:     { greenButOverdue: 0, totalReports: 0, honestyRate: null, lateBlockers: 0, earlyBlockers: 0 },
      engagement: { decisions: 0, blockersResolvedForOthers: 0, crossTaskUpdates: 0, total: 0 },
      composite: { score: null, dimensions: { delivery: null, cadence: null, risk: null, engagement: null } },
      sampleSize: { actions: 0, tasks: 0, blockers: 0, riskReports: 0 },
      activeTasks: [],
      recentFlags: [],
    });
    return out.get(id);
  };

  const cadenceDaysByPic = new Map();
  const resolveDaysByPic = new Map();
  const weightedDeliveryByPic = new Map();

  for (const project of Object.values(projectsMap)) {
    for (const action of project.actionItems || []) {
      if (!action.pic) continue;
      const dueInRange = action.dueDate && inDateRange(action.dueDate, actionFrom, now);
      const closedInRange = action.status === 'Done' && inDateRange(action.timestamp, actionFrom, now);
      if (!dueInRange && !closedInRange) continue;

      const m = ensure(action.pic);
      m.sampleSize.actions++;
      if (action.status === 'Cancelled') continue;

      m.delivery.total++;
      if (action.status === 'Done') {
        const closedAt = action.completedAt || action.timestamp;
        const onTime = !action.dueDate || daysBetween(closedAt, action.dueDate) >= 0;
        if (onTime) m.delivery.onTime++;
        else m.delivery.late++;
      } else if (action.dueDate && new Date(action.dueDate) < now) {
        m.delivery.late++;
        const lateDays = daysBetween(action.dueDate, now);
        m.recentFlags.push({
          kind: 'overdue_action',
          message: `Action overdue ${lateDays}d: ${action.title}`,
          ts: action.dueDate,
        });
      }
    }

    for (const program of project.programs || []) {
      for (const ws of program.workstreams || []) {
        const wsMultiplier = ws.difficultyMultiplier || 1.0;
        for (const task of ws.tasks || []) {
          if (!task.pic) continue;
          const m = ensure(task.pic);
          const deadlineType = task.deadlineType || DEFAULT_DEADLINE_TYPE;
          const inTaskWindow = task.end && inDateRange(task.end, taskFrom, now);

          if (inTaskWindow && task.status !== 'Dropped') {
            m.sampleSize.tasks++;
            const isComplete = task.status === 'Completed';
            if (deadlineType === 'hard') {
              m.delivery.hardTotal++;
              if (isComplete) m.delivery.hardOnTime++;
            } else {
              m.delivery.softTotal++;
              if (isComplete) m.delivery.softOnTime++;
            }
            if (!weightedDeliveryByPic.has(m.id)) {
              weightedDeliveryByPic.set(m.id, { weightedOnTime: 0, weightedTotal: 0 });
            }
            const wd = weightedDeliveryByPic.get(m.id);
            wd.weightedTotal += wsMultiplier;
            if (isComplete) wd.weightedOnTime += wsMultiplier;

            const isLate = isOverdueTask(task, now);
            if (isLate || isComplete) {
              m.sampleSize.riskReports++;
              m.risk.totalReports++;
              if (isLate && (task.health === 'green' || !task.health)) {
                m.risk.greenButOverdue++;
                m.recentFlags.push({
                  kind: 'risk_dishonesty',
                  message: `Self-reported green but overdue: ${task.name}`,
                  ts: task.end, taskId: task.id,
                });
              }
            }

            if (isLate) {
              const lateDays = daysBetween(task.end, now);
              m.recentFlags.push({
                kind: deadlineType === 'hard' ? 'overdue_task_hard' : 'overdue_task_soft',
                message: `${deadlineType === 'hard' ? 'Task' : 'Soft target'} overdue ${lateDays}d: ${task.name}`,
                ts: task.end, taskId: task.id,
              });
            }
          }

          if (task.status === 'InProgress') {
            m.cadence.activeTasks++;
            m.activeTasks.push({ project, program, workstream: ws, task });
            const latestUpdate = (task.updates || [])
              .map((u) => new Date(u.timestamp))
              .filter((d) => !isNaN(d))
              .sort((a, b) => b - a)[0];
            // Use latest update; fall back to task.start only if it's in the past
            // (a future-dated start has no "days since activity" meaning).
            let latestActivity = latestUpdate;
            if (!latestActivity && task.start) {
              const startD = new Date(task.start);
              if (!isNaN(startD) && startD <= now) latestActivity = startD;
            }
            if (latestActivity) {
              const days = Math.max(0, daysBetween(latestActivity, now));
              if (!cadenceDaysByPic.has(m.id)) cadenceDaysByPic.set(m.id, []);
              cadenceDaysByPic.get(m.id).push(days);
              if (days >= ACTIVITY_THRESHOLDS.cadence.amber) {
                m.cadence.staleTasks++;
                if (days >= ACTIVITY_THRESHOLDS.cadence.green * 2) {
                  m.recentFlags.push({
                    kind: 'stale_update',
                    message: `No update for ${days}d: ${task.name}`,
                    ts: latestActivity.toISOString(), taskId: task.id,
                  });
                }
              }
            }
          }

          for (const u of task.updates || []) {
            if (u.author && personKey(dirIndex, u.author) !== m.id && inDateRange(u.timestamp, taskFrom, now)) {
              const updater = ensure(u.author);
              updater.engagement.crossTaskUpdates++;
              updater.engagement.total++;
            }
            if (u.isBlocker && u.resolvedAt && u.resolvedBy && personKey(dirIndex, u.resolvedBy) !== m.id
                && inDateRange(u.resolvedAt, taskFrom, now)) {
              const helper = ensure(u.resolvedBy);
              helper.engagement.blockersResolvedForOthers++;
              helper.engagement.total++;
            }
            if (!u.isBlocker) continue;
            if (!inDateRange(u.timestamp, taskFrom, now)) continue;
            m.sampleSize.blockers++;
            if (u.resolvedAt) {
              m.blocker.resolved++;
              const days = daysBetween(u.timestamp, u.resolvedAt);
              if (!resolveDaysByPic.has(m.id)) resolveDaysByPic.set(m.id, []);
              resolveDaysByPic.get(m.id).push(days);
            } else {
              m.blocker.unresolved++;
              const ageDays = daysBetween(u.timestamp, now);
              if (ageDays >= ACTIVITY_THRESHOLDS.blocker.amber) {
                m.recentFlags.push({
                  kind: 'unresolved_blocker',
                  message: `Blocker open ${ageDays}d: ${task.name}`,
                  ts: u.timestamp, taskId: task.id,
                });
              }
            }
          }
        }
      }
    }

    for (const decision of project.decisions || []) {
      if (!inDateRange(decision.date, taskFrom, now)) continue;
      for (const decider of decision.decidedBy || []) {
        const m = ensure(decider);
        m.engagement.decisions++;
        m.engagement.total++;
      }
    }
  }

  for (const m of out.values()) {
    if (m.delivery.total > 0) {
      m.delivery.rate = Math.round(100 * m.delivery.onTime / m.delivery.total);
    }
    const wd = weightedDeliveryByPic.get(m.id);
    if (wd && wd.weightedTotal > 0) {
      const taskComponent = wd.weightedOnTime / wd.weightedTotal;
      const actionComponent = m.delivery.total > 0 ? m.delivery.onTime / m.delivery.total : taskComponent;
      if (m.delivery.total > 0 && wd.weightedTotal > 0) {
        m.delivery.weightedRate = Math.round(100 * (0.6 * actionComponent + 0.4 * taskComponent));
      } else if (wd.weightedTotal > 0) {
        m.delivery.weightedRate = Math.round(100 * taskComponent);
      } else {
        m.delivery.weightedRate = m.delivery.rate;
      }
    } else {
      m.delivery.weightedRate = m.delivery.rate;
    }
    const cd = cadenceDaysByPic.get(m.id);
    if (cd && cd.length > 0) {
      m.cadence.avgDaysSinceUpdate = Math.round(cd.reduce((a, b) => a + b, 0) / cd.length);
    }
    const rd = resolveDaysByPic.get(m.id);
    if (rd && rd.length > 0) {
      m.blocker.avgResolveDays = Math.round(10 * rd.reduce((a, b) => a + b, 0) / rd.length) / 10;
    }
    if (m.risk.totalReports > 0) {
      m.risk.honestyRate = Math.round(100 * (1 - m.risk.greenButOverdue / m.risk.totalReports));
    }
    const dim = { delivery: null, cadence: null, risk: null, engagement: null };
    let totalWeight = 0;
    let weightedSum = 0;

    if (sampleStatus(m.sampleSize.actions) === 'ok' && m.delivery.weightedRate != null) {
      dim.delivery = m.delivery.weightedRate;
      weightedSum += dim.delivery * COMPOSITE_WEIGHTS.delivery;
      totalWeight += COMPOSITE_WEIGHTS.delivery;
    }
    if (m.cadence.activeTasks > 0 && m.cadence.avgDaysSinceUpdate != null) {
      const days = m.cadence.avgDaysSinceUpdate;
      dim.cadence = Math.max(0, Math.min(100, Math.round(100 - days * 3.5)));
      weightedSum += dim.cadence * COMPOSITE_WEIGHTS.cadence;
      totalWeight += COMPOSITE_WEIGHTS.cadence;
    }
    if (sampleStatus(m.sampleSize.riskReports) === 'ok' && m.risk.honestyRate != null) {
      dim.risk = m.risk.honestyRate;
      weightedSum += dim.risk * COMPOSITE_WEIGHTS.risk;
      totalWeight += COMPOSITE_WEIGHTS.risk;
    }
    if (m.engagement.total > 0) {
      const e = m.engagement.total;
      if (e <= 2) dim.engagement = Math.round(60 * e / 2);
      else if (e <= 5) dim.engagement = Math.round(60 + (85 - 60) * (e - 2) / 3);
      else dim.engagement = Math.min(100, Math.round(85 + (100 - 85) * (e - 5) / 5));
      weightedSum += dim.engagement * COMPOSITE_WEIGHTS.engagement;
      totalWeight += COMPOSITE_WEIGHTS.engagement;
    }
    m.composite.dimensions = dim;
    // Low-confidence guard: composite needs ≥2 qualifying dimensions, otherwise
    // a single dimension would dominate (re-normalized to 100% weight) and the
    // score becomes misleading — show "—" instead.
    const qualifyingDims = Object.values(dim).filter((v) => v != null).length;
    if (totalWeight > 0 && qualifyingDims >= 2) {
      m.composite.score = Math.round(weightedSum / totalWeight);
    }
    m.composite.qualifyingDims = qualifyingDims;

    m.recentFlags.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    m.recentFlags = m.recentFlags.slice(0, 5);
  }
  return out;
}

// Wraps computeActivityIndex with previous-period comparison; attaches `trend` per PIC.
function computeActivityIndexWithTrend(projectsMap, options = {}, dirIndex = null) {
  const now = options.now || new Date();
  const actionWeeks = options.actionWeeks || DEFAULT_DASHBOARD_WINDOW.actionWeeks;
  const taskWeeks = options.taskWeeks || DEFAULT_DASHBOARD_WINDOW.taskWeeks;

  const current = computeActivityIndex(projectsMap, {
    actionFrom: weeksAgo(actionWeeks),
    taskFrom: weeksAgo(taskWeeks),
    now,
  }, dirIndex);

  const prevNow = weeksAgo(actionWeeks);
  const previous = computeActivityIndex(projectsMap, {
    actionFrom: weeksAgo(actionWeeks * 2),
    taskFrom: weeksAgo(taskWeeks * 2),
    now: prevNow,
  }, dirIndex);

  for (const m of current.values()) {
    const prev = previous.get(m.id);
    m.trend = {
      composite: trendOf(m.composite.score, prev?.composite?.score),
      delivery: trendOf(m.delivery.weightedRate, prev?.delivery?.weightedRate),
      cadence: trendOf(m.cadence.avgDaysSinceUpdate, prev?.cadence?.avgDaysSinceUpdate, { inverted: true }),
      risk: trendOf(m.risk.honestyRate, prev?.risk?.honestyRate),
    };
  }
  return current;
}

// Top-K PICs needing support, ordered by signal weight. Used by the dashboard
// banner. Score adds: red delivery (3), amber delivery (1), red cadence (2),
// amber cadence (1), and one point per unresolved blocker.
function rankCoachingPriorities(metricsMap, limit = 3) {
  const scored = [];
  for (const m of metricsMap.values()) {
    let score = 0;
    if (sampleStatus(m.sampleSize.actions) === 'ok') {
      const c = bucketColor(m.delivery.rate, ACTIVITY_THRESHOLDS.delivery);
      if (c === 'red') score += 3;
      else if (c === 'amber') score += 1;
    }
    if (m.cadence.activeTasks > 0) {
      const c = bucketColor(m.cadence.avgDaysSinceUpdate, ACTIVITY_THRESHOLDS.cadence, { inverted: true });
      if (c === 'red') score += 2;
      else if (c === 'amber') score += 1;
    }
    if (m.blocker.unresolved > 0) score += m.blocker.unresolved;
    if (score > 0) scored.push({ pic: m.pic, score, metrics: m });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

// Decision decay check: returns { decayed, daysOverdue?, reviewDate? }
function getDecisionDecay(decision, now = new Date()) {
  if (!decision.expectedReviewDate) {
    if (!decision.date) return { decayed: false };
    const d = new Date(decision.date);
    if (isNaN(d)) return { decayed: false };
    d.setDate(d.getDate() + DECISION_REVIEW_DAYS);
    decision = { ...decision, expectedReviewDate: d.toISOString().slice(0, 10) };
  }
  const reviewDate = new Date(decision.expectedReviewDate);
  if (isNaN(reviewDate)) return { decayed: false };
  const isOpen = decision.followUpStatus === 'Open' || decision.followUpStatus === 'InProgress';
  const isPast = reviewDate < now;
  if (!isPast || !isOpen) return { decayed: false, reviewDate };
  return {
    decayed: true,
    daysOverdue: daysBetween(reviewDate, now),
    reviewDate,
  };
}

// v30 — Visual sort for task lists. Tasks with a start date come first in
// ascending order; tasks without a start date fall to the end. Stable on
// modern engines, so equal keys keep their original array order. Returns a
// new array — does NOT mutate the input. Used by MindMap, Outline, and
// Gantt render paths so a newly-created task with an earlier start date
// naturally moves up instead of always landing at the bottom.
function sortTasksByStart(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  return [...list].sort((a, b) => {
    const ad = a?.start ? +new Date(a.start) : Infinity;
    const bd = b?.start ? +new Date(b.start) : Infinity;
    if (isNaN(ad) && isNaN(bd)) return 0;
    if (isNaN(ad)) return 1;
    if (isNaN(bd)) return -1;
    return ad - bd;
  });
}

// ─── Credit allocation helpers (v22) ───

// Equal split: returns array of N items each = 100/N (rounded to 2 decimals).
// Used as fallback when sibling weights are not explicitly set.
function equalSplit(count) {
  if (count <= 0) return [];
  const each = Math.round((100 / count) * 100) / 100;
  return new Array(count).fill(each);
}

// Resolve effective % for each sibling. If all have explicit numeric weight,
// normalize to 100. Otherwise fall back to equalSplit(N).
function getEffectiveWeights(siblings) {
  if (!siblings || siblings.length === 0) return [];
  const allHave = siblings.every((s) => typeof s.weight === 'number' && !isNaN(s.weight) && s.weight >= 0);
  if (!allHave) return equalSplit(siblings.length);
  const sum = siblings.reduce((acc, s) => acc + s.weight, 0);
  if (sum <= 0) return equalSplit(siblings.length);
  return siblings.map((s) => (s.weight / sum) * 100);
}

// Resolve a task's per-PIC share map. Always normalizes to sum=100 (or {} if no PIC).
// If task.creditShares set explicitly, use it; otherwise default = 100% to primary PIC.
function getEffectiveCreditShares(task) {
  if (!task) return {};
  const explicit = task.creditShares;
  if (explicit && typeof explicit === 'object' && Object.keys(explicit).length > 0) {
    const sum = Object.values(explicit).reduce((a, b) => a + (Number(b) || 0), 0);
    if (sum > 0) {
      const out = {};
      for (const [k, v] of Object.entries(explicit)) {
        if (Number(v) > 0) out[k] = (Number(v) / sum) * 100;
      }
      return out;
    }
  }
  if (task.pic) return { [task.pic]: 100 };
  return {};
}

// Effort-based credit: only Completed tasks earn credit.
function isTaskCredited(task) {
  return !!task && task.status === 'Completed';
}

// ─── Credit allocation: rules + project-level computation (v23) ───

// Default-share rules. Returns {[name]: %} or null if no rule applies.
//   1 PIC + 0 contributors → primary 100%
//   1 PIC + 1 contributor  → 70/30
//   1 PIC + 2 contributors → 70/15/15
//   1 PIC + 3+ contribs    → null (PM enters manually)
function computeDefaultCreditShares(primaryPic, contributors) {
  if (!primaryPic) return null;
  const contribs = Array.isArray(contributors) ? contributors.filter(Boolean) : [];
  if (contribs.length === 0) return { [primaryPic]: 100 };
  if (contribs.length === 1) return { [primaryPic]: 70, [contribs[0]]: 30 };
  if (contribs.length === 2) return { [primaryPic]: 70, [contribs[0]]: 15, [contribs[1]]: 15 };
  return null;
}

// Per-project credit computation. Returns rich object:
//   { totalCp, leadCp, leadName, leadSharePct, programPoolCp, perPic, breakdown }
// Project lead (if set) gets `projectLeadShare`% extracted FIRST, awarded
// proportional to overall completion. Remaining (100 - leadShare)% is split
// among programs/workstreams/tasks via getEffectiveWeights.
// `breakdown` includes every (task × pic) row plus a Project Lead pseudo-entry
// (`isProjectLead: true`) — filter that out when summing per-program totals.
function computeProjectCredits(project, dirIndex = null) {
  const totalCp = (typeof project.creditPoints === 'number' && project.creditPoints >= 0)
    ? project.creditPoints
    : DEFAULT_CREDIT_POINTS;
  const perPic = new Map();
  const breakdown = [];

  // Step 1: Project Lead (if set)
  const leadName = (project.projectLead || '').trim();
  const leadSharePct = (typeof project.projectLeadShare === 'number' && project.projectLeadShare >= 0 && project.projectLeadShare <= 100)
    ? project.projectLeadShare
    : (leadName ? 10 : 0);
  const leadCp = leadName ? (totalCp * leadSharePct / 100) : 0;
  if (leadName && leadCp > 0) {
    const r = rollup(project);
    const projectCompletionPct = (r.weighted / Math.max(r.total, 1)) * 100;
    const leadActual = leadCp * (projectCompletionPct / 100);
    // P1: perPic is keyed by canonical person id; `name` is the display name.
    // With no dirIndex both are the raw lead name (legacy).
    const leadId = personKey(dirIndex, leadName);
    const leadLabel = personLabel(dirIndex, leadName);
    if (!perPic.has(leadId)) perPic.set(leadId, { earned: 0, projected: 0, name: leadLabel });
    const cur = perPic.get(leadId);
    cur.earned += leadActual;
    cur.projected += leadCp;
    breakdown.push({
      programId: null, programName: '— Project Lead —',
      workstreamId: null, workstreamName: '',
      taskId: null, taskName: `${leadName} (project lead, ${leadSharePct}%)`,
      picName: leadLabel, picId: leadId, sharePct: 100, taskCp: leadCp,
      projected: leadCp, actual: leadActual, credited: r.weighted >= r.total,
      taskStatus: null, isProjectLead: true,
    });
  }

  // Step 2: Programs/workstreams/tasks share remaining
  const programPoolCp = totalCp - leadCp;
  const programs = project.programs || [];
  const programWeights = getEffectiveWeights(programs);

  programs.forEach((pg, pgIdx) => {
    const pgCp = programPoolCp * (programWeights[pgIdx] / 100);
    const wss = pg.workstreams || [];
    const wsWeights = getEffectiveWeights(wss);

    wss.forEach((ws, wsIdx) => {
      const wsCp = pgCp * (wsWeights[wsIdx] / 100);
      const eligibleTasks = (ws.tasks || []).filter((t) => t.status !== 'Dropped');
      const taskWeights = getEffectiveWeights(eligibleTasks);

      eligibleTasks.forEach((t, tIdx) => {
        const taskCp = wsCp * (taskWeights[tIdx] / 100);
        const credited = isTaskCredited(t);
        const shares = getEffectiveCreditShares(t);
        // P1: with dirIndex, shares of one person's aliases are summed under one canonical id.
        const people = dirIndex
          ? groupByPerson(Object.keys(shares), dirIndex).map((g) => [g.id, g.name, g.values.reduce((s, v) => s + shares[v], 0)])
          : Object.entries(shares).map(([picName, sharePct]) => [picName, picName, sharePct]);

        for (const [picId, picName, sharePct] of people) {
          const earned = taskCp * (sharePct / 100);
          const projected = earned;
          const actual = credited ? earned : 0;

          breakdown.push({
            programId: pg.id, programName: pg.name,
            workstreamId: ws.id, workstreamName: ws.name,
            taskId: t.id, taskName: t.name,
            picName, picId, sharePct, taskCp, projected, actual, credited,
            taskStatus: t.status, isProjectLead: false,
          });

          if (!perPic.has(picId)) perPic.set(picId, { earned: 0, projected: 0, name: picName });
          const cur = perPic.get(picId);
          cur.earned += actual;
          cur.projected += projected;
        }
      });
    });
  });

  return { totalCp, leadCp, leadName, leadSharePct, programPoolCp, perPic, breakdown };
}

// v30 — Cross-project aggregation of everything relevant to `author`.
// Pure read; no mutation. Called from MyWorkView via useMemo, and from
// TeamOverviewView per-member (Phase 3). lastSeenAt drives unread-mentions
// partitioning; pass null to treat all mentions as unread.
function computeMyWork(author, projects, isOwner, lastSeenAt, dirIndex = null, authorEmail = null) {
  const startOfToday = today();
  const todayEnd = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1);
  const weekEnd = new Date(todayEnd.getTime() + 7 * 24 * 60 * 60 * 1000);
  const lastSeen = lastSeenAt ? new Date(lastSeenAt) : new Date(0);

  const out = {
    needsAttention: [],
    unreadMentions: [],
    allMentions: [],
    tasksOwned: { today: [], week: [], later: [] },
    tasksContributing: [],
    actionItems: { today: [], week: [], later: [] },
    decisions: [],
    credit: { earned: 0, projected: 0, pct: 0, perProject: [] },
    pendingApprovals: [],
  };
  if (!author) return out;

  const authorLc = author.toLowerCase();
  // P1: with dirIndex, any alias of the same person matches; without it, exact string (legacy).
  // authorEmail (signed-in user only, never for View as) wins when the directory knows it.
  // The signed-in name also counts: a Google name added after the directory was built is not an alias yet.
  const meId = meKey(dirIndex, author, authorEmail);
  const isMe = isMeFor(dirIndex, author, authorEmail);
  const myCreditKeys = dirIndex ? [...new Set([meId, personKey(dirIndex, author)])] : [meId];

  for (const proj of Object.values(projects || {})) {
    for (const pg of (proj.programs || [])) {
      for (const ws of (pg.workstreams || [])) {
        for (const t of (ws.tasks || [])) {
          if (t.status === 'Dropped' || t.status === 'Completed' || t.status === 'Submitted') continue; // Submitted waits on the approver (P3)
          const enriched = { task: t, project: proj, program: pg, workstream: ws };

          if (isMe(t.pic)) {
            const overdue = isOverdue(t);
            const endDate = parseDate(t.end);
            const dueToday = !overdue && endDate && endDate <= todayEnd;
            const dueWeek = !overdue && !dueToday && endDate && endDate <= weekEnd;
            if (overdue) {
              out.needsAttention.push({ kind: 'overdue_task', ...enriched });
              out.tasksOwned.today.push(enriched);
            } else if (dueToday) {
              out.tasksOwned.today.push(enriched);
            } else if (dueWeek) {
              out.tasksOwned.week.push(enriched);
            } else {
              out.tasksOwned.later.push(enriched);
            }
          }

          if (Array.isArray(t.contributors) && t.contributors.some(isMe) && !isMe(t.pic)) {
            out.tasksContributing.push({ ...enriched, primaryPic: t.pic });
          }

          // Scan task updates + legacy check-ins for @<author> mentions.
          // findMentions() needs a teamMembers list which we don't have here;
          // a name-token regex is sufficient and matches v22+ mention writing.
          const mentionTexts = [];
          for (const upd of (t.updates || [])) {
            mentionTexts.push({ ts: upd.timestamp, postAuthor: upd.author, text: upd.text || '' });
          }
          for (const ci of (t.checkIns || [])) {
            const ciText = [ci.done, ci.plan, ci.blockers].filter(Boolean).join(' ');
            if (ciText) mentionTexts.push({ ts: ci.timestamp, postAuthor: ci.author, text: ciText });
          }
          for (const e of mentionTexts) {
            const tokens = (e.text.match(/@([A-Za-zÀ-ỹ0-9._-]+)/g) || []).map((m) => m.slice(1).toLowerCase());
            if (!tokens.includes(authorLc)) continue;
            const item = {
              ts: e.ts, postAuthor: e.postAuthor, text: e.text,
              task: t, project: proj, program: pg, workstream: ws,
            };
            out.allMentions.push(item);
            if (e.ts && new Date(e.ts) > lastSeen) out.unreadMentions.push(item);
          }

          if (isOwner && t.deadlineRequest) {
            out.pendingApprovals.push({ task: t, request: t.deadlineRequest, project: proj });
            out.needsAttention.push({ kind: 'deadline_approval', task: t, request: t.deadlineRequest, project: proj, program: pg, workstream: ws });
          }
        }
      }
    }

    // v30.A — Scan action comments for @<author> across ALL action items
    // (not just ones assigned to author). Mirrors task.updates scan above.
    for (const a of (proj.actionItems || [])) {
      for (const upd of (a.updates || [])) {
        const tokens = ((upd.text || '').match(/@([A-Za-zÀ-ỹ0-9._-]+)/g) || []).map((m) => m.slice(1).toLowerCase());
        if (!tokens.includes(authorLc)) continue;
        const item = {
          ts: upd.timestamp, postAuthor: upd.author, text: upd.text || '',
          action: a, project: proj,
        };
        out.allMentions.push(item);
        if (upd.timestamp && new Date(upd.timestamp) > lastSeen) out.unreadMentions.push(item);
      }
    }

    for (const a of (proj.actionItems || [])) {
      // v30.B — Sub-tasks assigned to author (regardless of action.pic).
      // Bucketed by parent action's dueDate; Done subtasks filtered out.
      for (const sub of (a.subtasks || [])) {
        if (!isMe(sub.pic)) continue;
        if (sub.status === 'Done') continue;
        const pDueDate = a.dueDate ? parseDate(a.dueDate) : null;
        const subEntry = { kind: 'subtask', subtask: sub, parentAction: a, project: proj };
        if (!pDueDate) {
          out.actionItems.later.push(subEntry);
        } else if (pDueDate <= todayEnd) {
          out.actionItems.today.push(subEntry);
          if (pDueDate < startOfToday) {
            out.needsAttention.push({ kind: 'overdue_subtask', subtask: sub, parentAction: a, project: proj });
          }
        } else if (pDueDate <= weekEnd) {
          out.actionItems.week.push(subEntry);
        } else {
          out.actionItems.later.push(subEntry);
        }
      }

      if (!isMe(a.pic)) continue;
      if (a.status === 'Done' || a.status === 'Cancelled' || a.status === 'Dropped') continue;
      const dueDate = a.dueDate ? parseDate(a.dueDate) : null;
      const enriched = { kind: 'action', action: a, project: proj };
      if (!dueDate) {
        out.actionItems.later.push(enriched);
      } else if (dueDate <= todayEnd) {
        out.actionItems.today.push(enriched);
        if (dueDate < startOfToday) out.needsAttention.push({ kind: 'overdue_action', ...enriched });
      } else if (dueDate <= weekEnd) {
        out.actionItems.week.push(enriched);
      } else {
        out.actionItems.later.push(enriched);
      }
    }

    // v30 — Mitigation actions assigned to the viewer, bucketed by
    // mitigation.due into the same today/week/later structure as
    // regular action items so MyWorkView and ByProjectCard pick them
    // up alongside meeting-born actions.
    for (const pg of (proj.programs || [])) {
      for (const item of (pg.raid || [])) {
        for (const mitigation of (item.mitigationActions || [])) {
          if (!isMe(mitigation.pic)) continue;
          if (mitigation.status === 'Done') continue;
          const due = mitigation.due ? parseDate(mitigation.due) : null;
          const enriched = {
            kind: 'mitigation',
            mitigation,
            parentItem: item,
            parentProgram: pg,
            project: proj,
          };
          if (!due) {
            out.actionItems.later.push(enriched);
          } else if (due <= todayEnd) {
            out.actionItems.today.push(enriched);
            if (due < startOfToday) {
              out.needsAttention.push({ kind: 'overdue_mitigation', mitigation, parentItem: item, parentProgram: pg, project: proj });
            }
          } else if (due <= weekEnd) {
            out.actionItems.week.push(enriched);
          } else {
            out.actionItems.later.push(enriched);
          }
        }
      }
    }

    for (const d of (proj.decisions || [])) {
      if (!Array.isArray(d.decidedBy) || !d.decidedBy.some(isMe)) continue;
      if (d.followUpStatus === 'Done') continue;
      out.decisions.push({ decision: d, project: proj });
    }

    const credits = computeProjectCredits(proj, dirIndex);
    const myCredit = myCreditKeys.map((k) => credits.perPic.get(k)).filter(Boolean)
      .reduce((s, c) => ({ earned: s.earned + c.earned, projected: s.projected + c.projected }), { earned: 0, projected: 0 });
    if (myCredit.earned > 0 || myCredit.projected > 0) {
      out.credit.earned += myCredit.earned;
      out.credit.projected += myCredit.projected;
      out.credit.perProject.push({ project: proj, earned: myCredit.earned, projected: myCredit.projected });
    }
  }

  out.credit.pct = out.credit.projected > 0 ? (out.credit.earned / out.credit.projected) * 100 : 0;

  const byEnd = (a, b) => {
    const da = parseDate(a.task.end);
    const db = parseDate(b.task.end);
    return (da ? da.getTime() : Infinity) - (db ? db.getTime() : Infinity);
  };
  out.tasksOwned.today.sort(byEnd);
  out.tasksOwned.week.sort(byEnd);
  out.tasksOwned.later.sort(byEnd);
  out.allMentions.sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
  out.unreadMentions.sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));

  return out;
}

// v30 RAID Phase 4 — Aggregate RAID items that need the user's attention across
// all projects/programs. Pure read; no mutation. Mirrors the shape of
// computeMyWork: returns named buckets that MyRaidSection renders directly.
function computeMyRaid(author, projects, isOwner) {
  const out = {
    pendingApproval: [],   // owner-only — items awaiting their approval
    escalating: [],        // items where owner===author AND trend==='escalating' AND status active
    overdueActions: [],    // mitigation actions where pic===author AND status!==Done AND due<today
    needsReview: [],       // items where owner===author AND daysSinceReview>7 AND status active
    dueThisWeek: [],       // mitigation actions where pic===author AND status!==Done AND due<=today+7
    owned: [],             // all active items where owner===author
  };
  if (!author) return out;
  const startOfToday = today();
  const weekFromToday = new Date(startOfToday);
  weekFromToday.setDate(weekFromToday.getDate() + 7);

  for (const proj of Object.values(projects || {})) {
    for (const pg of (proj.programs || [])) {
      for (const item of (pg.raid || [])) {
        const isActive = item.status === 'Active' || item.status === 'Mitigating';
        const isClosed = item.status === 'Closed' || item.status === 'Resolved' || item.status === 'Accepted';
        const enriched = { item, project: proj, program: pg };

        // Pending approval — owner only, items not created by the owner themselves.
        if (item.status === 'PendingApproval' && isOwner) {
          out.pendingApproval.push(enriched);
        }

        // Escalating — items I own that are trending bad.
        if (isActive && item.owner === author && item.trend === 'escalating') {
          out.escalating.push(enriched);
        }

        // Needs review — items I own that haven't been reviewed in over 7 days.
        if (isActive && item.owner === author && raidDaysSinceReview(item) > RAID_REVIEW_STALE_DAYS) {
          out.needsReview.push(enriched);
        }

        // All owned active items.
        if (item.owner === author && !isClosed && item.status !== 'Draft') {
          out.owned.push(enriched);
        }

        // Mitigation actions assigned to me — overdue + due this week.
        for (const act of (item.mitigationActions || [])) {
          if (act.pic !== author || act.status === 'Done') continue;
          const dueDate = parseDate(act.due);
          const actionEnriched = { action: act, item, project: proj, program: pg };
          if (dueDate && dueDate < startOfToday) {
            out.overdueActions.push(actionEnriched);
          } else if (dueDate && dueDate <= weekFromToday) {
            out.dueThisWeek.push(actionEnriched);
          }
        }
      }
    }
  }
  return out;
}

// v30 — Flat list of mitigation actions across all RAID items in a project.
// Pure read; no mutation. Used by Actions view to surface mitigations next
// to regular action items, and by computeMyWork to bucket mitigations into
// the My Work actionItems buckets.
//
// opts:
//   picOnly  — only mitigations assigned to this PIC (default: no filter)
//   openOnly — only mitigations whose status !== 'Done' (default: true)
function getProjectMitigations(project, { picOnly = null, openOnly = true } = {}) {
  if (!project?.programs) return [];
  const out = [];
  for (const pg of project.programs) {
    for (const item of (pg.raid || [])) {
      for (const mitigation of (item.mitigationActions || [])) {
        if (openOnly && mitigation.status === 'Done') continue;
        if (picOnly && mitigation.pic !== picOnly) continue;
        out.push({
          kind: 'mitigation',
          mitigation,
          parentItem: item,
          parentProgram: pg,
          project,
        });
      }
    }
  }
  return out;
}

// v30 — Produce a new project object with a single mitigation patched.
// Pure; caller passes the result into updateProject. The (parentProgram,
// parentItem, mitigation) triple uniquely identifies the mitigation; we
// match by id when re-assembling so reorderings inside the parent are safe.
function applyMitigationUpdate(project, parentProgram, parentItem, mitigationId, patch) {
  return {
    ...project,
    programs: (project.programs || []).map((pg) => {
      if (pg.id !== parentProgram.id) return pg;
      return {
        ...pg,
        raid: (pg.raid || []).map((it) => {
          if (it.id !== parentItem.id) return it;
          return {
            ...it,
            mitigationActions: (it.mitigationActions || []).map((m) =>
              m.id === mitigationId ? { ...m, ...patch } : m
            ),
          };
        }),
      };
    }),
  };
}

// Aggregate credits across all projects, optionally filtered by year.
// Projects without a `creditYear` are always included (no filter applied to them).
// Returns { totalCp, perPic: Map, perProject: Map<projId, {project, ...result}> }
function computeWorkspaceCredits(projects, year = null, dirIndex = null) {
  const perPic = new Map();
  const perProject = new Map();
  let totalCp = 0;

  for (const proj of Object.values(projects || {})) {
    if (year != null && proj.creditYear != null && proj.creditYear !== year) continue;
    const result = computeProjectCredits(proj, dirIndex);
    totalCp += result.totalCp;
    perProject.set(proj.id, { project: proj, ...result });
    for (const [pic, val] of result.perPic.entries()) {
      if (!perPic.has(pic)) perPic.set(pic, { earned: 0, projected: 0, name: val.name });
      const cur = perPic.get(pic);
      cur.earned += val.earned;
      cur.projected += val.projected;
    }
  }
  return { totalCp, perPic, perProject };
}

function collectTasks(n) {
  if (!n) return [];
  if (n.programs) return n.programs.flatMap(collectTasks);
  if (n.workstreams) return n.workstreams.flatMap(collectTasks);
  if (n.tasks) return n.tasks;
  return [];
}

function rollup(n) {
  const all = collectTasks(n);
  const active = all.filter((t) => t.status !== 'Dropped');
  const total = active.length;
  const dropped = all.length - active.length;
  if (!total) return { total: 0, planned: 0, inprog: 0, done: 0, dropped, overdue: 0, weighted: 0, pct: 0, totalIncludingDropped: all.length };
  let planned = 0, inprog = 0, done = 0, overdue = 0, weighted = 0;
  for (const t of active) {
    const s = t.status || 'Planned';
    if (s === 'Completed') done++; else if (s === 'InProgress' || s === 'Submitted') inprog++; else planned++;
    weighted += STATUS_WEIGHT[s] ?? 0;
    if (isOverdue(t)) overdue++;
  }
  return { total, planned, inprog, done, dropped, overdue, weighted, pct: Math.round((weighted / total) * 100), totalIncludingDropped: all.length };
}

function findTaskInProject(project, taskId) {
  for (const pr of project.programs || [])
    for (const ws of pr.workstreams || [])
      for (const t of ws.tasks || [])
        if (t.id === taskId) return { program: pr, workstream: ws, task: t };
  return null;
}

function projectDateRange(project) {
  let min = null, max = null;
  for (const t of collectTasks(project)) {
    const s = parseDate(t.start), e = parseDate(t.end);
    if (s && (!min || s < min)) min = s;
    if (e && (!max || e > max)) max = e;
  }
  return { min, max };
}

/* ═════════ MENTIONS PARSING ═════════ */
// Find @mentions in text. Names with spaces are matched if they exactly match a known team member.
// Returns array of { name, start, end } sorted by start.
function findMentions(text, teamMembers) {
  if (!text) return [];
  const out = [];
  const re = /@([A-Za-zÀ-ỹ][A-Za-zÀ-ỹ0-9._-]*(?:\s[A-Za-zÀ-ỹ][A-Za-zÀ-ỹ0-9._-]*)?)/g;
  const knownNames = (teamMembers || []).map((m) => m.name.toLowerCase());
  let m;
  while ((m = re.exec(text)) !== null) {
    const candidate = m[1].trim();
    const twoWord = candidate;
    const oneWord = candidate.split(/\s+/)[0];
    let matched = null;
    if (knownNames.includes(twoWord.toLowerCase())) matched = twoWord;
    else if (knownNames.includes(oneWord.toLowerCase())) matched = oneWord;
    if (matched) out.push({ name: matched, start: m.index, end: m.index + 1 + matched.length });
  }
  return out;
}

function MentionedText({ text, teamMembers }) {
  if (!text) return null;
  const mentions = findMentions(text, teamMembers);
  if (mentions.length === 0) return <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</span>;
  const parts = [];
  let cursor = 0;
  for (const m of mentions) {
    if (cursor < m.start) parts.push(<span key={'t' + cursor}>{text.slice(cursor, m.start)}</span>);
    parts.push(
      <span key={'m' + m.start} title={`@${m.name}`} style={{
        color: TOK.mention, background: TOK.mentionBg, padding: '0 4px', borderRadius: 4, fontWeight: 500,
      }}>@{m.name}</span>
    );
    cursor = m.end;
  }
  if (cursor < text.length) parts.push(<span key={'t' + cursor}>{text.slice(cursor)}</span>);
  return <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{parts}</span>;
}

/* ═════════ TEAM MEMBERS DERIVATION ═════════ */
// Builds the @mention / PIC roster. Sources, in order of trust:
//   1) currentAuthor (signed-in user)
//   2) project.memberIds[] resolved via user directory (RBAC members added
//      through MembersModal — they have verified emails from sign-in)
//   3) p.teamMembers[] (legacy manual list in Project Settings)
//   4) PICs / check-in authors / update authors observed in tasks
//
// Dedup is email-first when an email is known: anchoring on email collapses
// "hattt4" + "Hà Trương Thị Thu" with same email into a single roster entry,
// using the directory name as canonical (Firebase displayName wins over
// free-text typed into the welcome dialog). Names without email keep using
// name-based dedup so legacy free-text PICs still appear.
// v30.1.2 — Canonicalize a typed PIC value before it's saved into a domain
// field. If the input looks like an email AND a teamMember has that email,
// return the member's name (e.g. 'hattt4@smartosc.com' → 'Hà Trương Thị Thu').
// Otherwise return the input verbatim (trimmed). Returns '' for empty input.
// Pure, idempotent, no throw.
// P1: with a directory index, a known person resolves to the directory name;
// unknown values (groups, free text) keep the legacy behaviour below.
function resolvePicValue(input, teamMembersList, dirIndex = null) {
  if (input == null) return input;
  const trimmed = String(input).trim();
  if (!trimmed) return trimmed;
  if (dirIndex) {
    const cp = canonicalPerson(dirIndex, trimmed);
    if (cp.known) return cp.name;
  }
  if (trimmed.includes('@')) {
    const lc = trimmed.toLowerCase();
    const match = (teamMembersList || []).find((m) => (m?.email || '').toLowerCase() === lc);
    if (match?.name) return match.name;
  }
  return trimmed;
}

// v30.1.3 — Walk every PIC reference in the project, dedup by lowercase
// name, return Map<lcName, { name, count, sources }>. Sources are
// human-readable labels for the tooltip (e.g. 'task.pic', 'raid.owner').
// Pure — must mirror the field set the 1.1 merge tool rewrites; if either
// is updated, update the other in lockstep.
function collectProjectPicNames(project) {
  const map = new Map();
  const add = (rawName, source) => {
    if (!rawName) return;
    const trimmed = String(rawName).trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { name: trimmed, count: 0, sources: new Set() });
    }
    const entry = map.get(key);
    entry.count++;
    entry.sources.add(source);
  };
  for (const pg of (project?.programs || [])) {
    for (const ws of (pg.workstreams || [])) {
      for (const t of (ws.tasks || [])) {
        if (t.pic) add(t.pic, 'task.pic');
        for (const c of (t.contributors || [])) add(c, 'task.contributors');
        for (const ci of (t.checkIns || [])) {
          if (ci?.author) add(ci.author, 'task.checkIns.author');
        }
        for (const u of (t.updates || [])) {
          if (u?.author) add(u.author, 'task.updates.author');
          if (u?.resolvedBy) add(u.resolvedBy, 'task.updates.resolvedBy');
        }
      }
    }
    for (const item of (pg.raid || [])) {
      if (item.owner) add(item.owner, 'raid.owner');
      if (item.createdBy) add(item.createdBy, 'raid.createdBy');
      if (item.approvedBy) add(item.approvedBy, 'raid.approvedBy');
      if (item.validationOwner) add(item.validationOwner, 'raid.validationOwner');
      for (const h of (item.history || [])) {
        if (h?.author) add(h.author, 'raid.history.author');
      }
      for (const m of (item.mitigationActions || [])) {
        if (m?.pic) add(m.pic, 'mitigation.pic');
      }
    }
  }
  for (const a of (project?.actionItems || [])) {
    if (a.pic) add(a.pic, 'action.pic');
    for (const db of (a.decidedBy || [])) add(db, 'action.decidedBy');
    for (const s of (a.subtasks || [])) {
      if (s?.pic) add(s.pic, 'subtask.pic');
    }
    for (const u of (a.updates || [])) {
      if (u?.author) add(u.author, 'action.updates.author');
    }
  }
  for (const d of (project?.decisions || [])) {
    if (d.author) add(d.author, 'decision.author');
    for (const db of (d.decidedBy || [])) add(db, 'decision.decidedBy');
  }
  if (project?.projectLead) add(project.projectLead, 'project.projectLead');
  for (const l of (project?.weightChangeLog || [])) {
    if (l?.by) add(l.by, 'project.weightChangeLog.by');
  }
  // Freeze Set → sorted Array for stable render
  const out = new Map();
  for (const [k, v] of map.entries()) {
    out.set(k, { name: v.name, count: v.count, sources: Array.from(v.sources).sort() });
  }
  return out;
}

// v30.1.3 — Classify a PIC name as 'known' (in teamMembers OR a directory
// entry of a memberIds uid), 'group' (matches contributorRegistry), or
// 'orphan'. Case-insensitive comparison throughout.
function categorizePicName(name, teamMembers, directory, memberIds, contributorRegistry) {
  if (!name) return 'orphan';
  const lc = String(name).trim().toLowerCase();
  if (!lc) return 'orphan';
  if ((teamMembers || []).some((m) => (m?.name || '').toLowerCase() === lc)) return 'known';
  const dirByUid = new Map((directory || []).map((u) => [u.uid, u]));
  for (const uid of (memberIds || [])) {
    const entry = dirByUid.get(uid);
    if (entry?.name && entry.name.toLowerCase() === lc) return 'known';
  }
  if ((contributorRegistry || []).some((r) => (r?.name || '').toLowerCase() === lc)) return 'group';
  return 'orphan';
}

// v30.1.3 — Suggest a single merge target for an orphan name. Three
// tiers in order: exact email match, unique email-prefix match, unique
// name-substring match. Returns { name, email } or null when no
// unambiguous suggestion exists.
function suggestMergeTarget(orphanName, teamMembers) {
  if (!orphanName) return null;
  const trimmed = String(orphanName).trim();
  if (!trimmed) return null;
  const lc = trimmed.toLowerCase();
  // 1. Email match
  if (trimmed.includes('@')) {
    const match = (teamMembers || []).find((m) => (m?.email || '').toLowerCase() === lc);
    if (match?.name) return { name: match.name, email: match.email || '' };
  }
  // 2. Email-prefix match (unique)
  const prefixMatches = (teamMembers || []).filter((m) => {
    if (!m?.email) return false;
    const prefix = m.email.split('@')[0].toLowerCase();
    return prefix === lc;
  });
  if (prefixMatches.length === 1) return { name: prefixMatches[0].name, email: prefixMatches[0].email || '' };
  // 3. Substring match in member names (unique)
  const subMatches = (teamMembers || []).filter((m) =>
    m?.name && m.name.toLowerCase().includes(lc)
  );
  if (subMatches.length === 1) return { name: subMatches[0].name, email: subMatches[0].email || '' };
  return null;
}

function deriveTeamMembers(projects, currentAuthor, currentUserEmail, directory, dirIndex = null) {
  // P1: with the directory index, the roster is the active directory people plus
  // observed names that resolve to no one and are not a project group
  // (contributorRegistry). Observed emails/aliases of known people are dropped.
  if (dirIndex) {
    const groups = new Set();
    for (const p of Object.values(projects || {})) {
      for (const r of p.contributorRegistry || []) if (r?.name) groups.add(canonicalPerson(null, r.name).id);
    }
    const roster = pickerPeople(dirIndex).map((p) => ({ name: p.name || p.email, email: p.email }));
    const seen = new Set();
    const observe = (name, email) => {
      const n = String(name ?? '').trim();
      const e = String(email ?? '').trim();
      if (!n && !e) return;
      if ((e && canonicalPerson(dirIndex, e).known) || (n && canonicalPerson(dirIndex, n).known)) return;
      const c = canonicalPerson(dirIndex, n || e);
      if (groups.has(c.id) || seen.has(c.id)) return;
      seen.add(c.id);
      roster.push({ name: c.name, email: e || null });
    };
    if (currentAuthor) observe(currentAuthor, currentUserEmail);
    const byUid = new Map((Array.isArray(directory) ? directory : []).map((u) => [u.uid, u]));
    for (const p of Object.values(projects || {})) {
      for (const uid of (p.memberIds || [])) {
        const entry = byUid.get(uid);
        if (entry) observe(entry.name, entry.email);
      }
      for (const pg of p.programs || []) {
        for (const ws of pg.workstreams || []) {
          for (const t of ws.tasks || []) {
            if (t.pic) observe(t.pic);
            for (const ci of t.checkIns || []) if (ci.author) observe(ci.author);
            for (const u of t.updates || []) if (u.author) observe(u.author);
          }
        }
      }
      for (const m of p.teamMembers || []) observe(m.name, m.email);
    }
    return roster.sort((a, b) => a.name.localeCompare(b.name));
  }
  // Build email → canonical name map from authoritative sources first
  // (directory > project.teamMembers with email > observed). Any later add()
  // call that supplies the same email will reuse the canonical name.
  const emailToCanonical = new Map();
  const seedCanonical = (name, email) => {
    if (!email) return;
    const k = String(email).trim().toLowerCase();
    if (!k) return;
    if (!emailToCanonical.has(k) && name) emailToCanonical.set(k, String(name).trim());
  };
  for (const u of (Array.isArray(directory) ? directory : [])) {
    if (u?.email) seedCanonical(u.name || (u.email || '').split('@')[0], u.email);
  }
  if (currentAuthor && currentUserEmail) seedCanonical(currentAuthor, currentUserEmail);
  for (const p of Object.values(projects || {})) {
    for (const m of p.teamMembers || []) seedCanonical(m.name, m.email);
  }

  const map = new Map();
  const add = (name, email) => {
    const trimmedName = (name == null ? '' : String(name)).trim();
    const trimmedEmail = (email == null ? '' : String(email)).trim();
    if (!trimmedName && !trimmedEmail) return;
    // If we have an email, resolve to canonical name (directory wins)
    const canonical = trimmedEmail
      ? (emailToCanonical.get(trimmedEmail.toLowerCase()) || trimmedName)
      : trimmedName;
    if (!canonical) return;
    const key = trimmedEmail
      ? 'e:' + trimmedEmail.toLowerCase()
      : 'n:' + canonical.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      if (trimmedEmail && !existing.email) existing.email = trimmedEmail;
    } else {
      map.set(key, { name: canonical, email: trimmedEmail || null });
    }
  };

  if (currentAuthor) add(currentAuthor, currentUserEmail);
  const dirByUid = new Map((Array.isArray(directory) ? directory : []).map((u) => [u.uid, u]));
  for (const p of Object.values(projects || {})) {
    for (const uid of (p.memberIds || [])) {
      const entry = dirByUid.get(uid);
      if (!entry) continue;
      const nm = entry.name || (entry.email || '').split('@')[0];
      if (nm) add(nm, entry.email || null);
    }
    for (const pg of p.programs || []) {
      for (const ws of pg.workstreams || []) {
        for (const t of ws.tasks || []) {
          if (t.pic) add(String(t.pic).trim());
          for (const ci of t.checkIns || []) if (ci.author) add(ci.author);
          for (const u of t.updates || []) if (u.author) add(u.author);
        }
      }
    }
    for (const m of p.teamMembers || []) add(m.name, m.email);
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/* ═════════ STORAGE ═════════ */
const K = {
  meta: 'workspace:meta',
  project: (id) => `project:${id}`,
  activity: (id) => `activity:${id}`,
  userLocal: 'user:local',
};
async function sgetShared(k) { try { const r = await window.storage.get(k, true); return r ? r.value : null; } catch { return null; } }
// The storage shim reports a failed shared write by returning null (it does not throw).
async function ssetShared(k, v) { try { const r = await window.storage.set(k, v, true); return r != null; } catch { return false; } }
async function sgetLocal(k) { try { const r = await window.storage.get(k, false); return r ? r.value : null; } catch { return null; } }
async function ssetLocal(k, v) { try { await window.storage.set(k, v, false); return true; } catch { return false; } }
async function sdeleteShared(k) { try { await window.storage.delete(k, true); return true; } catch { return false; } }
async function sdeleteLocal(k) { try { await window.storage.delete(k, false); return true; } catch { return false; } }

async function saveMeta(m) { return ssetShared(K.meta, JSON.stringify(m)); }
// Only for owner-field changes (transfer, workspace default view); see metaForWrite().
async function saveMetaOwnerFields(m) { return ssetShared(K.meta, JSON.stringify({ ...m, [OWNER_WRITE_FLAG]: true })); }
async function loadProject(id) { const r = await sgetShared(K.project(id)); if (!r) return null; try { return JSON.parse(r); } catch { return null; } }
// Returns 'ok' | 'conflict' | 'readonly' | 'denied' | 'refused' | 'history' | 'error' (B2/B3, P2.2, P2.3, P3.1). Callers that ignore it keep working.
async function saveProject(p) {
  try {
    const r = await window.storage.set(K.project(p.id), JSON.stringify(p), true);
    if (!r) return 'error';
    if (!r.error) return 'ok';
    return ['conflict', 'readonly', 'denied', 'refused', 'history'].includes(r.error) ? r.error : 'error';
  } catch { return 'error'; }
}
async function deleteProjectStore(id) { await sdeleteShared(K.project(id)); await sdeleteShared(K.activity(id)); }
async function loadActivity(id) { const r = await sgetShared(K.activity(id)); if (!r) return []; try { return JSON.parse(r); } catch { return []; } }
// null = the shim read failed (a missing log reads as '[]').
async function loadActivityStrict(id) { const r = await sgetShared(K.activity(id)); if (r == null) return null; try { const a = JSON.parse(r); return Array.isArray(a) ? a : null; } catch { return null; } }
const activityQueue = createKeyedQueue();
const activityPending = new Map(); // v1 entries whose read failed; merged into the next successful append
// Returns the full list to display (v1, read ok) or null (caller prepends the entry itself / leaves the list).
function appendActivity(id, e, { v2 = false } = {}) {
  return activityQueue.run(id, async () => {
    const pending = activityPending.get(id) || [];
    const read = v2 ? null : await loadActivityStrict(id);
    const plan = planActivityAppend({ v2, read, pending, entry: e });
    if (plan.write) {
      const ok = await ssetShared(K.activity(id), JSON.stringify(plan.write));
      if (!ok && !v2) { activityPending.set(id, [e, ...pending]); return null; }
    }
    if (plan.pending.length) activityPending.set(id, plan.pending); else activityPending.delete(id);
    return plan.display;
  });
}

/* ═════════ EXCEL I/O ═════════ */
const COL = {
  project: ['Mail Project', 'Project', 'mail project'],
  program: ['Program Stream (PS)', 'Program', 'Program Stream', 'program'],
  workstream: ['Work Stream', 'Workstream', 'work stream'],
  task: ['Main Task', 'Task', 'main task'],
  status: ['Status', 'status'],
  pic: ['PIC', 'Owner', 'Assignee', 'pic'],
  start: ['Start date', 'Start', 'start'],
  end: ['End date', 'End', 'end'],
  duration: ['Durations', 'Duration', 'duration'],
  deliverables: ['Key Deliverables', 'Deliverables', 'deliverables'],
  dependencies: ['Dependencies', 'Depends on', 'dependencies'],
  references: ['References', 'Refs', 'Wiki', 'references'],
};
const pickCol = (row, opts) => { for (const o of opts) if (row[o] != null && row[o] !== '') return row[o]; return null; };

// Parse References cell from Excel: `URL1 | Title1; URL2 | Title2` → array.
// Tolerant of missing titles. Invalid URLs skipped silently.
function parseReferencesCell(raw, author) {
  if (!raw) return [];
  const out = [];
  for (const part of String(raw).split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [urlPart, ...titleParts] = trimmed.split('|');
    const url = (urlPart || '').trim();
    const title = titleParts.join('|').trim();
    if (!isValidUrl(url)) continue;
    out.push({
      id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${out.length}`,
      url,
      title: title || REF_TYPE_STYLE[detectRefType(url)].label,
      type: detectRefType(url),
      addedAt: new Date().toISOString(),
      addedBy: author || 'Import',
    });
  }
  return out;
}
function normStatus(s) {
  if (!s) return 'Planned';
  const v = String(s).toLowerCase().replace(/[\s_-]/g, '');
  if (v.startsWith('drop') || v === 'cancelled' || v === 'canceled') return 'Dropped';
  if (v.startsWith('comp') || v === 'done') return 'Completed';
  if (v.startsWith('inprog') || v === 'wip' || v === 'progress' || v === 'doing') return 'InProgress';
  return 'Planned';
}
function normDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return toISODate(v);
  if (typeof v === 'number') return toISODate(new Date(Math.round((v - 25569) * 86400 * 1000)));
  const d = new Date(v); return isNaN(d) ? null : toISODate(d);
}

async function parseExcelFile(file, dirIndex = null) {
  // P1: a PIC cell naming a known person is stored as the directory name;
  // anything else (and everything when there is no index) is kept raw.
  const importPic = (v) => {
    if (!dirIndex || v == null || String(v).trim() === '') return v;
    const cp = canonicalPerson(dirIndex, v);
    return cp.known ? cp.name : v;
  };
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  if (!rows.length) throw new Error('No rows found in the spreadsheet.');
  const projectName = String(pickCol(rows[0], COL.project) || file.name.replace(/\.[^.]+$/, '') || 'Imported Project').trim();
  const project = {
    id: uid('proj'),
    name: projectName,
    createdAt: new Date().toISOString(),
    programs: [], decisions: [], actionItems: [],
    creditPoints: DEFAULT_CREDIT_POINTS,
    creditYear: new Date().getFullYear(),
    projectLeadShare: 10,
    contributorRegistry: DEFAULT_DEPARTMENTS.map((name) => ({ name })),
  };
  const progMap = new Map(), wsMap = new Map();
  for (const r of rows) {
    const tName = pickCol(r, COL.task);
    if (!tName) continue;
    const pn = String(pickCol(r, COL.program) || 'Unassigned').trim();
    const wn = String(pickCol(r, COL.workstream) || 'General').trim();
    let pg = progMap.get(pn);
    if (!pg) { pg = { id: uid('p'), name: pn, workstreams: [], raid: [] }; project.programs.push(pg); progMap.set(pn, pg); }
    const wk = pn + '||' + wn;
    let wsN = wsMap.get(wk);
    if (!wsN) { wsN = { id: uid('w'), name: wn, tasks: [] }; pg.workstreams.push(wsN); wsMap.set(wk, wsN); }
    wsN.tasks.push({
      id: uid('t'),
      name: String(tName).trim(),
      status: normStatus(pickCol(r, COL.status)),
      pic: importPic(pickCol(r, COL.pic)),
      contributors: [],
      creditSharesMode: 'auto',
      start: normDate(pickCol(r, COL.start)),
      end: normDate(pickCol(r, COL.end)),
      duration: (() => { const v = pickCol(r, COL.duration); if (v == null || v === '') return null; const n = Number(v); return isNaN(n) ? null : n; })(),
      deliverables: pickCol(r, COL.deliverables),
      dependencies: pickCol(r, COL.dependencies),
      references: parseReferencesCell(pickCol(r, COL.references), 'Import'),
      checkIns: [],
      updates: [],
      health: 'green',
    });
  }
  if (!project.programs.length) throw new Error('No valid task rows found.');
  return project;
}

function projectToExcelBlob(project) {
  const rows = [];
  for (const pg of project.programs || [])
    for (const ws of pg.workstreams || [])
      for (const t of ws.tasks || [])
        rows.push({
          'Project': sanitizeCell(project.name),
          'Program Stream (PS)': sanitizeCell(pg.name),
          'Work Stream': sanitizeCell(ws.name),
          'Main Task': sanitizeCell(t.name),
          'Status': STATUS_LABEL[t.status || 'Planned'],
          'PIC': sanitizeCell(t.pic || ''),
          'Start date': t.start || '',
          'End date': t.end || '',
          'Durations': t.duration ?? '',
          'Key Deliverables': sanitizeCell(t.deliverables || ''),
          'Dependencies': sanitizeCell(t.dependencies || ''),
          'References': sanitizeCell((t.references || []).map((r) => `${r.url} | ${r.title || ''}`).join('; ')),
          'Latest check-in': sanitizeCell((t.checkIns && t.checkIns[0]) ? `${fmtDateTime(t.checkIns[0].timestamp)} — ${t.checkIns[0].author}: ${t.checkIns[0].done || ''}` : ''),
        });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'MasterPlan');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Open a URL in a new tab via a real anchor click. More reliable than window.open()
// in sandboxed iframes (such as Claude.ai artifacts), where window.open with non-http
// schemes (mailto:) or async callers (setTimeout) can be blocked by popup blockers.
function openLinkInNewTab(href) {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 100);
}

// Build a Gmail compose URL — works in all browsers without needing a mailto handler
// and renders inside iframe sandboxes where mailto: may be blocked.
function buildGmailUrl({ to, subject, body, cc }) {
  const params = new URLSearchParams();
  params.set('view', 'cm');
  params.set('fs', '1');
  if (to) params.set('to', to);
  if (cc) params.set('cc', cc);
  if (subject) params.set('su', subject);
  if (body) params.set('body', body);
  return `https://mail.google.com/mail/?${params.toString()}`;
}

// Copy plain text to clipboard. Used for Markdown copy in Meeting Minutes dialog.
async function copyPlainText(text, showToast) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      showToast?.('Copied to clipboard');
      return true;
    }
  } catch (e) {
    console.warn('writeText failed:', e);
  }
  showToast?.('Copy failed — please select & copy manually');
  return false;
}

// Escape user content for safe HTML rendering inside <table> cells, headings, etc.
// CSV/Excel formula-injection guard. Cells starting with =+-@\t\r are interpreted
// as formulas by Excel/Sheets/LibreOffice. Prefix with apostrophe to neutralize
// (apostrophe is hidden in Excel and stripped on paste).
function sanitizeCell(v) {
  if (typeof v !== 'string') return v;
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ═════════ PRIMITIVES ═════════ */
function Btn({ children, onClick, variant = 'default', size = 'md', disabled, title, style = {} }) {
  const [hover, setHover] = useState(false);
  const base = {
    fontFamily: FONT_STACK, fontSize: size === 'sm' ? 12 : 13, fontWeight: 500,
    padding: size === 'sm' ? '5px 10px' : '7px 12px', borderRadius: 7,
    border: '1px solid ' + TOK.lineStrong,
    background: variant === 'primary' ? TOK.ink : (hover && !disabled ? TOK.bg : TOK.surface),
    color: variant === 'primary' ? TOK.surface : TOK.ink,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    display: 'inline-flex', alignItems: 'center', gap: 6,
    transition: 'background 0.12s', whiteSpace: 'nowrap', ...style,
  };
  if (variant === 'danger') { base.color = '#A32D2D'; base.borderColor = '#E5A3A3'; }
  if (variant === 'ghost') { base.border = '1px solid transparent'; base.background = hover && !disabled ? TOK.bg : 'transparent'; }
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={base}>
      {children}
    </button>
  );
}

function Pill({ status, overdue, size = 'md' }) {
  const fs = size === 'sm' ? 10 : 10.5;
  if (overdue) return (
    <span style={{ fontSize: fs, fontWeight: 500, padding: '2px 7px', borderRadius: 999, color: TOK.overdueFg, background: TOK.overdueBg, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <AlertTriangle size={10} /> Overdue
    </span>
  );
  const map = {
    Planned: { fg: TOK.plannedFg, bg: TOK.plannedBg, icon: <Circle size={10} /> },
    InProgress: { fg: TOK.inprogFg, bg: TOK.inprogBg, icon: <PlayCircle size={10} /> },
    Completed: { fg: TOK.doneFg, bg: TOK.doneBg, icon: <CheckCircle2 size={10} /> },
    Dropped: { fg: TOK.droppedFg, bg: TOK.droppedBg, icon: <X size={10} /> },
    Submitted: { fg: '#B7791F', bg: '#FAEEDA', icon: <Clock size={10} /> },
  };
  const s = map[status] || map.Planned;
  return (
    <span style={{ fontSize: fs, fontWeight: 500, padding: '2px 7px', borderRadius: 999, color: s.fg, background: s.bg, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {s.icon} {STATUS_LABEL[status] || status}
    </span>
  );
}

function HealthDot({ health, size = 10 }) {
  if (!health) return null;
  const map = { green: TOK.healthGreen, amber: TOK.healthAmber, red: TOK.healthRed };
  return <span title={`Health: ${HEALTH_LABEL[health]}`} style={{ display: 'inline-block', width: size, height: size, borderRadius: 999, background: map[health] }} />;
}

function HealthPill({ health, withLabel = true, size = 'md' }) {
  if (!health) return null;
  const fs = size === 'sm' ? 10 : 10.5;
  const map = {
    green: { fg: TOK.healthGreen, bg: TOK.healthGreenBg, label: HEALTH_LABEL.green },
    amber: { fg: TOK.healthAmber, bg: TOK.healthAmberBg, label: HEALTH_LABEL.amber },
    red: { fg: TOK.healthRed, bg: TOK.healthRedBg, label: HEALTH_LABEL.red },
  };
  const m = map[health];
  return (
    <span style={{ fontSize: fs, fontWeight: 500, padding: '2px 7px', borderRadius: 999, color: m.fg, background: m.bg, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 999, background: m.fg }} />
      {withLabel && m.label}
    </span>
  );
}

// B4: only the top-most open Modal reacts to Escape (stacked dialogs close one at a time).
const openModalStack = [];
function Modal({ title, children, onClose, width = 480, zHigh = false, hideClose = false }) {
  // hideClose=true: no X button, no backdrop-click-to-close (for unskippable flows like sign-in).
  const handleBackdropClick = hideClose ? undefined : onClose;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const token = {};
    openModalStack.push(token);
    const onKey = (e) => {
      if (e.key !== 'Escape' || hideClose || e.defaultPrevented) return;
      if (openModalStack[openModalStack.length - 1] !== token) return;
      onCloseRef.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = openModalStack.indexOf(token);
      if (i >= 0) openModalStack.splice(i, 1);
    };
  }, [hideClose]);
  return (
    <div onClick={handleBackdropClick} style={{ position: 'absolute', inset: 0, background: 'rgba(15,15,14,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: zHigh ? 80 : 50, fontFamily: FONT_STACK }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} style={{ width, maxWidth: 'calc(100% - 40px)', maxHeight: 'calc(100% - 60px)', background: TOK.surface, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid ' + TOK.line, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{title}</h3>
          {!hideClose && (
            <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 4 }}><X size={18} /></button>
          )}
        </div>
        <div style={{ padding: 18, overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  );
}

// In-app modal that shows rendered HTML with auto-selected content. The user's own
// Ctrl+C reliably copies BOTH text/html and text/plain to the clipboard (browser native
// behavior), bypassing the iframe's clipboard API restrictions. The "Open Gmail" button
// uses anchor click (proven to work) to open Gmail compose with subject + Cc.
function CopyHelperModal({ html, title, gmailUrl, onClose, attachmentName }) {
  const contentRef = useRef(null);
  const [copyState, setCopyState] = useState('idle'); // 'idle' | 'success' | 'failed'

  const selectAllContent = () => {
    if (!contentRef.current) return;
    const range = document.createRange();
    range.selectNodeContents(contentRef.current);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };

  // On mount, auto-select content so user can immediately Ctrl+C
  useEffect(() => {
    const t = setTimeout(selectAllContent, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Best-effort auto-copy via execCommand (may fail silently in iframe sandbox).
  // Returns true if execCommand reports success; user's manual Ctrl+C is always available regardless.
  const tryCopy = () => {
    selectAllContent();
    try {
      const ok = document.execCommand && document.execCommand('copy');
      setCopyState(ok ? 'success' : 'failed');
      return !!ok;
    } catch (e) {
      setCopyState('failed');
      return false;
    }
  };

  const copyAndOpenGmail = () => {
    tryCopy();
    if (gmailUrl) {
      // Slight delay so the user sees the toast/state change before tabs switch focus
      setTimeout(() => openLinkInNewTab(gmailUrl), 350);
    }
  };

  const kbd = { padding: '1px 6px', background: 'white', border: '1px solid #ccc', borderRadius: 3, fontFamily: 'ui-monospace, monospace', fontSize: 11 };

  return (
    <Modal title={title} onClose={onClose} width={820} zHigh>
      <div style={{
        background: '#fff8e1',
        padding: '10px 14px',
        borderRadius: 6,
        marginBottom: 12,
        fontSize: 13,
        color: '#7a5d00',
        lineHeight: 1.6,
        border: '1px solid #f0e3a0',
      }}>
        <strong>📌 How to copy:</strong> The content below is already selected.{' '}
        Press <kbd style={kbd}>Ctrl+C</kbd> (or <kbd style={kbd}>⌘+C</kbd> on Mac){' '}
        {gmailUrl
          ? <>to copy, then click <strong>Open Gmail</strong> below and paste in Gmail body with <kbd style={kbd}>Ctrl+V</kbd>.</>
          : <>to copy. Then paste anywhere (Gmail, Notion, Google Docs) with <kbd style={kbd}>Ctrl+V</kbd>.</>
        }
      </div>

      {attachmentName && (
        <div style={{
          background: '#E2F0DE',
          padding: '10px 14px',
          borderRadius: 6,
          marginBottom: 12,
          fontSize: 13,
          color: '#1F5E1F',
          lineHeight: 1.6,
          border: '1px solid #A8D08B',
        }}>
          <strong>📎 Excel file auto-downloaded:</strong>{' '}
          <code style={{ background: 'white', padding: '1px 6px', borderRadius: 3, fontSize: 12 }}>{attachmentName}</code>
          <div style={{ fontSize: 11, color: '#3a6b3a', marginTop: 4 }}>
            After opening Gmail, attach this file from your Downloads folder before sending.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Btn size="sm" onClick={selectAllContent}>Re-select all</Btn>
        <Btn size="sm" onClick={tryCopy}>📋 Try auto-copy</Btn>
        {gmailUrl && (
          <Btn size="sm" variant="primary" onClick={copyAndOpenGmail}>📧 Open Gmail</Btn>
        )}
        {copyState === 'success' && (
          <span style={{ fontSize: 12, color: '#2d7a2d', fontWeight: 500 }}>✓ Copied — paste in Gmail with Ctrl+V</span>
        )}
        {copyState === 'failed' && (
          <span style={{ fontSize: 12, color: '#a32d2d', fontWeight: 500 }}>Auto-copy blocked — please use Ctrl+C manually</span>
        )}
      </div>

      <div
        ref={contentRef}
        style={{
          border: '1px solid ' + TOK.lineStrong,
          borderRadius: 6,
          padding: '16px 20px',
          background: 'white',
          maxHeight: 400,
          overflowY: 'auto',
          userSelect: 'text',
          cursor: 'text',
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
        <Btn onClick={onClose}>Done</Btn>
      </div>
    </Modal>
  );
}

function Input({ value, onChange, placeholder, type = 'text', autoFocus, style = {}, onKeyDown }) {
  return (
    <input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} onKeyDown={onKeyDown}
      style={{ fontFamily: FONT_STACK, fontSize: 13, width: '100%', padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, background: TOK.surface, color: TOK.ink, outline: 'none', ...style }}
      onFocus={(e) => e.target.style.borderColor = TOK.accent}
      onBlur={(e) => e.target.style.borderColor = TOK.lineStrong} />
  );
}
function Textarea({ value, onChange, placeholder, rows = 3, style = {} }) {
  return (
    <textarea value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      style={{ fontFamily: FONT_STACK, fontSize: 13, width: '100%', padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, background: TOK.surface, color: TOK.ink, outline: 'none', resize: 'vertical', lineHeight: 1.5, ...style }}
      onFocus={(e) => e.target.style.borderColor = TOK.accent}
      onBlur={(e) => e.target.style.borderColor = TOK.lineStrong} />
  );
}
function FieldLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 500, color: TOK.muted, marginBottom: 4 }}>{children}</div>;
}
// B2/B3: persistent banner for failed or refused project saves.
// Set right before a deliberate reload so the unload guard does not prompt.
let bypassUnloadGuard = false;
const nowHHMM = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

function SaveBanner({ saveState, onRetry }) {
  const { conflict: conflictNames, error: errorNames, readonly: readonlyNames, denied: deniedNames, refused: refusedNames, history: historyNames } = bannerGroups(saveState);
  if (conflictNames.length + errorNames.length + readonlyNames.length + deniedNames.length + refusedNames.length + historyNames.length === 0) return null;
  const q = (list) => list.map((n) => `“${n}”`).join(', ');
  return (
    <div role="alert" style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 120, maxWidth: 'calc(100% - 40px)', background: TOK.blockerBg, color: TOK.blocker, border: '1px solid currentColor', borderRadius: 8, padding: '10px 14px', fontSize: 13, fontFamily: FONT_STACK, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
      <span>
        {conflictNames.length > 0 && <>Your latest changes to {q(conflictNames)} were <b>not saved</b> — someone else changed it since you opened it. Reload to get the latest version, then redo your edit. </>}
        {errorNames.length > 0 && <>Couldn’t save changes to {q(errorNames)}. Your recent edits exist only on this screen — check your connection or permissions, then reload.</>}
        {readonlyNames.length > 0 && <>{q(readonlyNames)} is a v2 pilot project and is read-only for now. Your change was not saved. </>}
        {deniedNames.length > 0 && <>Some changes to {q(deniedNames)} were <b>not saved</b>: you don’t have permission for them (use Submit as done to close a task). Reload to continue — edits made after this are not saved either. </>}
        {refusedNames.length > 0 && <>Changes to {q(refusedNames)} were <b>not saved</b>: deleting tasks or clearing all comments isn’t allowed. Mark the task Dropped instead, then reload to continue — edits made after this are not saved either. </>}
        {historyNames.length > 0 && <>Changes to {q(historyNames)} were <b>not saved</b>: approval history can’t be removed. Reload to continue. </>}
      </span>
      {errorNames.length > 0 && onRetry && <button onClick={onRetry} style={{ fontFamily: FONT_STACK, fontSize: 12, padding: '5px 10px', borderRadius: 6, border: '1px solid currentColor', background: TOK.surface, color: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>Retry</button>}
      <button onClick={() => { bypassUnloadGuard = true; window.location.reload(); }} style={{ fontFamily: FONT_STACK, fontSize: 12, padding: '5px 10px', borderRadius: 6, border: '1px solid currentColor', background: TOK.surface, color: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>Reload</button>
    </div>
  );
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div role="status" style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: TOK.ink, color: TOK.surface, padding: '10px 16px', borderRadius: 8, fontSize: 13, zIndex: 100, fontFamily: FONT_STACK, display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
      <span>{toast.message}</span>
      {toast.action && (
        <button onClick={() => { toast.action.onClick(); onClose(); }} style={{ background: 'none', border: '1px solid ' + TOK.surface, borderRadius: 6, color: TOK.surface, cursor: 'pointer', padding: '2px 8px', fontFamily: FONT_STACK, fontSize: 12 }}>{toast.action.label}</button>
      )}
      <button onClick={onClose} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: TOK.surface, cursor: 'pointer', opacity: 0.7 }}><X size={14} /></button>
    </div>
  );
}

/* ═════════ CUSTOM DIALOGS (replace browser prompt/confirm/alert) ═════════ */
function useDialogs() {
  const [dialog, setDialog] = useState(null);
  const api = useMemo(() => ({
    prompt: (opts) => new Promise((resolve) => setDialog({ type: 'prompt', ...opts, resolve })),
    confirm: (opts) => new Promise((resolve) => setDialog({ type: 'confirm', ...opts, resolve })),
    alert: (opts) => new Promise((resolve) => setDialog({ type: 'alert', ...opts, resolve })),
  }), []);
  const close = (result) => { if (dialog) dialog.resolve(result); setDialog(null); };
  return { dialog, api, close };
}
function DialogHost({ dialog, close }) {
  const [value, setValue] = useState('');
  useEffect(() => { if (dialog?.type === 'prompt') setValue(dialog.initial || ''); }, [dialog]);
  if (!dialog) return null;
  if (dialog.type === 'confirm') {
    return (
      <Modal title={dialog.title || 'Confirm'} onClose={() => close(false)} width={420} zHigh>
        <p style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.5, color: TOK.ink }}>{dialog.message}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn onClick={() => close(false)}>Cancel</Btn>
          <Btn variant={dialog.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{dialog.okLabel || 'Confirm'}</Btn>
        </div>
      </Modal>
    );
  }
  if (dialog.type === 'alert') {
    return (
      <Modal title={dialog.title || 'Notice'} onClose={() => close()} width={420} zHigh>
        <p style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.5, color: TOK.ink }}>{dialog.message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Btn variant="primary" onClick={() => close()}>OK</Btn>
        </div>
      </Modal>
    );
  }
  // prompt
  const canSubmit = dialog.allowEmpty || value.trim().length > 0;
  const submit = () => { if (canSubmit) close(value.trim()); };
  return (
    <Modal title={dialog.title || 'Enter value'} onClose={() => close(null)} width={420} zHigh>
      {dialog.message && <p style={{ margin: '0 0 12px', fontSize: 13, color: TOK.muted }}>{dialog.message}</p>}
      <Input
        value={value}
        onChange={setValue}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          else if (e.key === 'Escape') { e.preventDefault(); close(null); }
        }}
        placeholder={dialog.placeholder}
        autoFocus
      />
      <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn onClick={() => close(null)}>Cancel</Btn>
        <Btn variant="primary"
          disabled={!canSubmit}
          onClick={submit}>{dialog.okLabel || 'OK'}</Btn>
      </div>
    </Modal>
  );
}

/* ═════════ ERROR BOUNDARY ═════════ */
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(err, info) { console.error('View error:', err, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: FONT_STACK, color: TOK.ink, background: TOK.bg, height: '100%', overflow: 'auto' }}>
          <div style={{ background: TOK.surface, border: '1px solid ' + TOK.overdueFg, borderRadius: 10, padding: 18, maxWidth: 600 }}>
            <div style={{ color: TOK.overdueFg, fontWeight: 500, marginBottom: 8, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={14} /> Something broke in this view
            </div>
            <div style={{ fontSize: 12, color: TOK.muted, marginBottom: 12 }}>
              {String(this.state.error?.message || this.state.error)}
            </div>
            <Btn size="sm" onClick={() => this.setState({ error: null })}>Try again</Btn>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ═════════ POPOVER MENU (for node actions) ═════════ */
function PopoverMenu({ x, y, items, onClose }) {
  // Esc closes the menu
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      {/* Transparent backdrop catches outside clicks */}
      <div
        onMouseDown={onClose}
        style={{
          position: 'absolute', inset: 0, zIndex: 199, background: 'transparent',
        }}
      />
      {/* The menu itself, above the backdrop */}
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: 'absolute', left: x, top: y, zIndex: 200,
          background: TOK.surface, border: '1px solid ' + TOK.lineStrong, borderRadius: 8,
          boxShadow: '0 8px 20px rgba(0,0,0,0.15)', fontFamily: FONT_STACK, minWidth: 200,
          overflow: 'hidden',
        }}>
        {items.map((it, i) => it.separator ? (
          <div key={i} style={{ height: 1, background: TOK.line }} />
        ) : (
          <button
            key={i}
            type="button"
            onClick={() => {
              const cb = it.onClick;
              onClose();
              if (cb) cb();
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '9px 14px', fontSize: 13,
              border: 'none', background: 'transparent', cursor: 'pointer',
              fontFamily: FONT_STACK, color: it.danger ? TOK.overdueFg : TOK.ink,
              textAlign: 'left',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = TOK.bg}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
            {it.icon} {it.label}
          </button>
        ))}
      </div>
    </>
  );
}

/* ═════════ NAME DIALOG ═════════ */
/* ═════════ CHECK-IN FORM ═════════ */
/* ═════════ MENTION-AWARE TEXTAREA ═════════ */
// Renders a textarea + small autocomplete dropdown when user types `@`
function MentionTextarea({ value, onChange, placeholder, rows = 3, teamMembers = [], style = {} }) {
  const taRef = useRef(null);
  const [suggest, setSuggest] = useState(null); // { query, start, top, left } | null

  const handleChange = (e) => {
    const v = e.target.value;
    onChange(v);
    const cursor = e.target.selectionStart;
    // Look back from cursor for an @ that's not preceded by alphanumeric
    let i = cursor - 1;
    while (i >= 0 && /[A-Za-zÀ-ỹ0-9._-]/.test(v[i])) i--;
    if (i >= 0 && v[i] === '@' && (i === 0 || /\s/.test(v[i - 1]) || v[i - 1] === '\n')) {
      const query = v.slice(i + 1, cursor);
      // Position the popup roughly at cursor (we'll use a simple approach: below textarea)
      setSuggest({ query: query.toLowerCase(), start: i });
    } else {
      setSuggest(null);
    }
  };

  const filteredSuggest = suggest
    ? teamMembers.filter((m) => m.name.toLowerCase().includes(suggest.query)).slice(0, 6)
    : [];

  const insertMention = (member) => {
    const ta = taRef.current;
    if (!ta || !suggest) return;
    const before = value.slice(0, suggest.start);
    const after = value.slice(ta.selectionStart);
    const inserted = '@' + member.name + ' ';
    const next = before + inserted + after;
    onChange(next);
    setSuggest(null);
    // Restore focus + cursor position
    requestAnimationFrame(() => {
      ta.focus();
      const newPos = before.length + inserted.length;
      ta.setSelectionRange(newPos, newPos);
    });
  };

  const handleKeyDown = (e) => {
    if (!suggest || filteredSuggest.length === 0) return;
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      insertMention(filteredSuggest[0]);
    } else if (e.key === 'Escape') {
      e.preventDefault(); // handled here — don't also close the surrounding Modal
      setSuggest(null);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={taRef}
        value={value ?? ''}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        style={{
          fontFamily: FONT_STACK, fontSize: 13, width: '100%',
          padding: '8px 10px', border: '1px solid ' + TOK.lineStrong,
          borderRadius: 7, background: TOK.surface, color: TOK.ink,
          outline: 'none', resize: 'vertical', lineHeight: 1.5, ...style,
        }}
        onFocus={(e) => e.target.style.borderColor = TOK.accent}
        onBlur={(e) => { e.target.style.borderColor = TOK.lineStrong; setTimeout(() => setSuggest(null), 150); }}
      />
      {suggest && filteredSuggest.length > 0 && (
        <div style={{
          position: 'absolute', left: 8, top: '100%', marginTop: 2, zIndex: 20,
          background: TOK.surface, border: '1px solid ' + TOK.lineStrong, borderRadius: 8,
          boxShadow: '0 6px 16px rgba(0,0,0,0.12)', minWidth: 200, overflow: 'hidden',
        }}>
          <div style={{ fontSize: 10, color: TOK.muted, padding: '6px 10px', borderBottom: '1px solid ' + TOK.line, fontWeight: 500 }}>
            Mention a teammate · Tab to insert
          </div>
          {filteredSuggest.map((m, i) => (
            <button key={m.name} type="button" onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                width: '100%', padding: '7px 10px', border: 'none', background: i === 0 ? TOK.bg : 'transparent',
                cursor: 'pointer', fontFamily: FONT_STACK, textAlign: 'left',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = TOK.bg}
              onMouseLeave={(e) => e.currentTarget.style.background = i === 0 ? TOK.bg : 'transparent'}>
              <span style={{ fontSize: 12.5, fontWeight: 500 }}>{m.name}</span>
              {m.email && <span style={{ fontSize: 11, color: TOK.muted }}>{m.email}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═════════ UPDATES FEED ═════════ */
// Single feed merging old check-ins (Done/Plan/Blockers) and new free-text updates with @mentions and 🚩 blocker flag
function UpdateForm({ onSubmit, author, teamMembers }) {
  const [text, setText] = useState('');
  const [isBlocker, setIsBlocker] = useState(false);
  const canSubmit = text.trim().length > 0;
  return (
    <div style={{ background: TOK.bg, border: '1px solid ' + TOK.line, borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: TOK.ink }}>New update</div>
      <MentionTextarea
        value={text}
        onChange={setText}
        placeholder="Share an update, discussion note, or @mention a teammate…"
        rows={autoRows(text)}
        teamMembers={teamMembers}
      />
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: TOK.muted, cursor: 'pointer' }}>
          <input type="checkbox" checked={isBlocker} onChange={(e) => setIsBlocker(e.target.checked)} style={{ accentColor: TOK.blocker }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>🚩 Mark as Blocker / Risk</span>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: TOK.subtle }}>Posting as {author}</span>
          <Btn variant="primary" size="sm" disabled={!canSubmit} onClick={() => { onSubmit({ text, isBlocker }); setText(''); setIsBlocker(false); }}>
            <MessageSquare size={12} /> Post
          </Btn>
        </div>
      </div>
    </div>
  );
}

// Render a single update entry. Handles both legacy check-in shape (done/plan/blockers) and new shape (text/isBlocker).
function UpdateEntry({ entry, teamMembers, onResolveBlocker }) {
  const isLegacy = entry.done != null || entry.plan != null || (entry.blockers != null && entry.text == null);
  const blocker = entry.isBlocker || (isLegacy && (entry.blockers || '').trim().length > 0);
  const resolved = blocker && entry.resolvedAt;
  // Resolved blockers display muted; active blockers display red
  const cardBg = resolved ? TOK.bg : (blocker ? TOK.blockerBg : TOK.surface);
  const cardBorder = resolved ? TOK.line : (blocker ? '#F1BFBF' : TOK.line);
  return (
    <div style={{
      border: '1px solid ' + cardBorder,
      borderRadius: 8, padding: 10, background: cardBg,
      opacity: resolved ? 0.85 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
          {entry.author}
          {blocker && !resolved && <span style={{ fontSize: 10, color: TOK.blocker, fontWeight: 500 }}>🚩 Blocker</span>}
          {resolved && <span style={{ fontSize: 10, color: TOK.doneFg, fontWeight: 500 }}>✓ Resolved</span>}
        </span>
        <span style={{ fontSize: 11, color: TOK.subtle, whiteSpace: 'nowrap' }}>{fmtDateTime(entry.timestamp)}</span>
      </div>
      {isLegacy ? (
        <div style={{ fontSize: 12, lineHeight: 1.55, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {entry.done && <div><span style={{ color: TOK.muted }}>Done: </span><MentionedText text={entry.done} teamMembers={teamMembers} /></div>}
          {entry.plan && <div><span style={{ color: TOK.muted }}>Plan: </span><MentionedText text={entry.plan} teamMembers={teamMembers} /></div>}
          {entry.blockers && <div><span style={{ color: TOK.muted }}>Blockers: </span><MentionedText text={entry.blockers} teamMembers={teamMembers} /></div>}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, lineHeight: 1.55, color: TOK.ink }}>
          <MentionedText text={entry.text || ''} teamMembers={teamMembers} />
        </div>
      )}
      {/* Resolved info strip + resolution note */}
      {resolved && (
        <div style={{
          marginTop: 8, paddingTop: 8, borderTop: '1px dashed ' + TOK.line,
          fontSize: 11, color: TOK.muted, display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <div>
            <span style={{ color: TOK.doneFg, fontWeight: 500 }}>✓ Resolved</span> by <strong>{entry.resolvedBy}</strong> on {fmtDateTime(entry.resolvedAt)}
          </div>
          {entry.resolution && (
            <div style={{ background: TOK.surface, padding: '6px 8px', borderRadius: 5, color: TOK.ink, fontSize: 12 }}>
              <MentionedText text={entry.resolution} teamMembers={teamMembers} />
            </div>
          )}
        </div>
      )}
      {/* Resolve action — only for active blockers (not legacy, not already resolved) */}
      {blocker && !resolved && !isLegacy && (
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
          <Btn size="sm" onClick={() => onResolveBlocker?.(entry)} title="Mark this blocker as resolved">
            <CheckCircle2 size={11} /> Mark resolved
          </Btn>
        </div>
      )}
    </div>
  );
}

// Combined updates feed: merges legacy checkIns and new updates into one timeline (newest first).
function UpdatesFeed({ task, teamMembers, onResolveBlocker }) {
  const merged = useMemo(() => {
    const legacy = (task.checkIns || []).map((c) => ({ ...c, _kind: 'legacy' }));
    const fresh = (task.updates || []).map((u) => ({ ...u, _kind: 'fresh' }));
    return [...fresh, ...legacy].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [task.checkIns, task.updates]);

  if (!merged.length) {
    return <div style={{ fontSize: 12, color: TOK.subtle, padding: '12px 0', textAlign: 'center' }}>No updates yet. Be the first to post.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {merged.map((e) => <UpdateEntry key={e.id} entry={e} teamMembers={teamMembers} onResolveBlocker={onResolveBlocker} />)}
    </div>
  );
}

/* ═════════ REFERENCES SECTION (wiki links per task) ═════════ */

// Type pill — small colored badge ("Sheet", "Doc", etc.)
function RefTypePill({ type }) {
  const s = REF_TYPE_STYLE[type] || REF_TYPE_STYLE.link;
  return (
    <span style={{
      display: 'inline-block', padding: '1px 7px', borderRadius: 999,
      fontSize: 10.5, fontWeight: 500, background: s.bg, color: s.fg,
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>{s.label}</span>
  );
}

// Single reference row: type pill, title (clickable, opens in new tab), URL preview.
function ReferenceRow({ reference, onEdit, onDelete }) {
  const [hover, setHover] = useState(false);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <ReferenceForm
        initial={reference}
        onSave={(updated) => { onEdit({ ...reference, ...updated }); setEditing(false); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '8px 4px',
        borderTop: '1px solid ' + TOK.line,
      }}
    >
      <div style={{ paddingTop: 2 }}><RefTypePill type={reference.type} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <a
          href={reference.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 13, fontWeight: 500, color: TOK.ink, textDecoration: 'none',
            display: 'block',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
          title={reference.url}
        >
          {reference.title || '(untitled)'}
        </a>
        <div style={{ fontSize: 11, color: TOK.subtle, marginTop: 1, wordBreak: 'break-all' }}>
          {shortUrl(reference.url)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, opacity: hover ? 1 : 0, transition: 'opacity .12s' }}>
        <button onClick={() => setEditing(true)} title="Edit"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 4 }}>
          <Edit2 size={13} />
        </button>
        <button onClick={() => onDelete(reference.id)} title="Delete"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 4 }}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// Inline form for adding/editing a reference. Type pill updates live as user types URL.
function ReferenceForm({ initial, onSave, onCancel }) {
  const [url, setUrl] = useState(initial?.url || '');
  const [title, setTitle] = useState(initial?.title || '');
  const [error, setError] = useState('');
  const detectedType = detectRefType(url);

  const handleSave = () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) { setError('URL is required'); return; }
    if (!isValidUrl(trimmedUrl)) { setError('URL must start with http:// or https://'); return; }
    const finalTitle = title.trim() || REF_TYPE_STYLE[detectedType].label;
    onSave({ url: trimmedUrl, title: finalTitle, type: detectedType });
  };

  return (
    <div style={{
      borderTop: '1px solid ' + TOK.line,
      padding: '10px 4px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: TOK.muted, width: 40, flexShrink: 0 }}>URL</span>
        <Input value={url} onChange={(v) => { setUrl(v); setError(''); }}
          placeholder="https://docs.google.com/..." autoFocus />
        {url && <RefTypePill type={detectedType} />}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: TOK.muted, width: 40, flexShrink: 0 }}>Title</span>
        <Input value={title} onChange={setTitle} placeholder={`(default: ${REF_TYPE_STYLE[detectedType].label})`} />
      </div>
      {error && <div style={{ fontSize: 11, color: '#a32d2d', paddingLeft: 48 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Btn size="sm" onClick={onCancel}>Cancel</Btn>
        <Btn size="sm" variant="primary" onClick={handleSave}>{initial ? 'Save' : 'Add'}</Btn>
      </div>
    </div>
  );
}

// Collapsible section showing all references for a task. Lives between meta info and tabs in TaskDetail.
function ReferencesSection({ task, onUpdate, author }) {
  const refs = task.references || [];
  const [expanded, setExpanded] = useState(refs.length > 0);
  const [adding, setAdding] = useState(false);

  const addRef = (data) => {
    const newRef = {
      id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ...data,
      addedAt: new Date().toISOString(),
      addedBy: author,
    };
    onUpdate({ ...task, references: [...refs, newRef] });
    setAdding(false);
  };

  const editRef = (updated) => {
    onUpdate({
      ...task,
      references: refs.map((r) => r.id === updated.id ? { ...updated, type: detectRefType(updated.url) } : r),
    });
  };

  const deleteRef = (id) => {
    onUpdate({ ...task, references: refs.filter((r) => r.id !== id) });
  };

  return (
    <div style={{ marginTop: 16, marginBottom: 12 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '6px 0', color: TOK.ink, textAlign: 'left',
          fontFamily: FONT_STACK,
        }}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span style={{ fontSize: 12, fontWeight: 500, color: TOK.muted, letterSpacing: 0.3, textTransform: 'uppercase' }}>
          📚 References
        </span>
        <span style={{ fontSize: 11, color: TOK.subtle, fontWeight: 500 }}>
          {refs.length === 0 ? '(none)' : `(${refs.length})`}
        </span>
      </button>

      {expanded && (
        <div style={{ marginTop: 4 }}>
          {refs.length === 0 && !adding && (
            <div style={{ fontSize: 12, color: TOK.subtle, padding: '8px 4px', fontStyle: 'italic' }}>
              No references yet. Add Google Docs, Sheets, or any link related to this milestone.
            </div>
          )}
          {refs.map((r) => (
            <ReferenceRow key={r.id} reference={r} onEdit={editRef} onDelete={deleteRef} />
          ))}
          {adding ? (
            <ReferenceForm onSave={addRef} onCancel={() => setAdding(false)} />
          ) : (
            <button
              onClick={() => setAdding(true)}
              style={{
                marginTop: 6, display: 'flex', alignItems: 'center', gap: 6,
                background: 'none', border: '1px dashed ' + TOK.lineStrong, borderRadius: 6,
                padding: '6px 12px', cursor: 'pointer', color: TOK.muted,
                fontFamily: FONT_STACK, fontSize: 12, width: '100%', justifyContent: 'center',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = TOK.bg; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            >
              <Plus size={12} /> Add reference
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ═════════ CONTRIBUTOR EDITOR (v21 + v26 registry-aware) ═════════ */
// Chip-style editor for task.contributors[]. Combined suggestion source:
//   1) teamMembers (with email + Person row)
//   2) project.contributorRegistry (Group/Registered badge)
//   3) legacy `suggestions` (Used in tasks badge)
// Chip styling reflects "known" vs "unknown" (not in members or registry).
function ContributorEditor({ contributors, onChange, suggestions, primaryPic, project, teamMembersList }) {
  const dirIndex = useContext(DirectoryIndexContext);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const list = Array.isArray(contributors) ? contributors : [];

  const registry = useMemo(
    () => Array.isArray(project?.contributorRegistry) ? project.contributorRegistry : [],
    [project]
  );
  const registryNames = useMemo(() => new Set(registry.map((r) => r.name)), [registry]);

  const combinedSuggestions = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const m of (teamMembersList || [])) {
      if (!seen.has(m.name)) { seen.add(m.name); result.push({ name: m.name, email: m.email, isPerson: true }); }
    }
    for (const r of registry) {
      if (!seen.has(r.name)) { seen.add(r.name); result.push({ name: r.name, isRegistered: true }); }
    }
    for (const s of (suggestions || [])) {
      if (!seen.has(s)) { seen.add(s); result.push({ name: s, isLegacy: true }); }
    }
    return result;
  }, [teamMembersList, registry, suggestions]);

  const filteredSuggestions = useMemo(() => {
    const q = (draft || '').trim().toLowerCase();
    return combinedSuggestions
      .filter((s) => s.name !== primaryPic && !list.includes(s.name))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [combinedSuggestions, draft, list, primaryPic]);

  const addContributor = (name) => {
    // P1: with the directory, a known person is stored under the directory name.
    const raw = (name || '').trim();
    const trimmed = dirIndex ? resolvePicValue(raw, teamMembersList, dirIndex) : raw;
    if (!trimmed) return;
    if (trimmed === primaryPic) return;
    if (list.includes(trimmed)) return;
    onChange([...list, trimmed]);
    setDraft('');
    setAdding(false);
  };

  const removeContributor = (name) => {
    onChange(list.filter((c) => c !== name));
  };

  const isKnown = (name) => {
    if (registryNames.has(name)) return true;
    if (findMember(teamMembersList, name, dirIndex)) return true;
    return false;
  };

  return (
    <div>
      <FieldLabel>Contributors <span style={{ color: TOK.subtle, fontWeight: 400 }}>(optional, supporters)</span></FieldLabel>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', minHeight: 28 }}>
        {list.map((c) => {
          const known = isKnown(c);
          const member = findMember(teamMembersList, c, dirIndex);
          return (
            <span key={c} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: known ? TOK.bg : '#FAEEDA',
              border: '1px solid ' + (known ? TOK.line : '#E0BC75'),
              borderRadius: 999,
              padding: '3px 4px 3px 10px', fontSize: 12,
            }} title={!known ? 'Not in team members or contributor registry. Owner can add to registry in Project Settings.' : (member?.email || '')}>
              {!known && <span style={{ fontSize: 10, color: '#A8660C' }}>⚠</span>}
              {c}
              <button onClick={() => removeContributor(c)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 2, display: 'flex', alignItems: 'center' }}
                title="Remove">
                <X size={11} />
              </button>
            </span>
          );
        })}
        {!adding && (
          <button onClick={() => setAdding(true)} style={{
            fontFamily: FONT_STACK, fontSize: 12, padding: '4px 10px',
            border: '1px dashed ' + TOK.lineStrong, borderRadius: 999,
            background: 'transparent', cursor: 'pointer', color: TOK.muted,
            display: 'inline-flex', alignItems: 'center', gap: 3,
          }}>
            <Plus size={11} /> Add contributor
          </button>
        )}
        {!adding && list.length >= 1 && (
          <button onClick={() => onChange([])} style={{
            fontFamily: FONT_STACK, fontSize: 11, padding: '3px 8px',
            border: '1px solid ' + TOK.lineStrong, borderRadius: 999,
            background: 'transparent', cursor: 'pointer', color: TOK.muted,
            display: 'inline-flex', alignItems: 'center', gap: 3,
          }} title="Clear all contributors">
            <X size={10} /> Clear all ({list.length})
          </button>
        )}
      </div>
      {adding && (
        <div style={{ marginTop: 6, position: 'relative' }}>
          <Input
            value={draft}
            onChange={setDraft}
            placeholder="Type name (e.g., Legal, HR, AF Team)"
            autoFocus
          />
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0,
            background: TOK.surface, border: '1px solid ' + TOK.lineStrong, borderRadius: 6,
            marginTop: 2, maxHeight: 340, overflowY: 'auto', zIndex: 50,
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}>
            {filteredSuggestions.map((s) => (
              <button key={s.name} onClick={() => addContributor(s.name)}
                style={{
                  width: '100%', textAlign: 'left', padding: '7px 10px',
                  fontFamily: FONT_STACK, fontSize: 12, border: 'none',
                  background: 'transparent', cursor: 'pointer', color: TOK.ink,
                  borderBottom: '1px solid ' + TOK.line,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = TOK.bg}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                <span>{s.name}</span>
                {s.email && <span style={{ color: TOK.muted, fontSize: 11 }}>{s.email}</span>}
                {s.isRegistered && <span style={{ marginLeft: 'auto', fontSize: 9, color: TOK.accent, background: 'rgba(59,109,17,0.10)', padding: '1px 6px', borderRadius: 4 }}>Registered</span>}
                {s.isLegacy && !s.isPerson && !s.isRegistered && <span style={{ marginLeft: 'auto', fontSize: 9, color: '#A8660C', background: '#FAEEDA', padding: '1px 6px', borderRadius: 4 }}>Used in tasks</span>}
              </button>
            ))}
            {draft.trim() && !filteredSuggestions.some((s) => s.name.toLowerCase() === draft.trim().toLowerCase()) && (
              <button onClick={() => addContributor(draft)}
                style={{
                  width: '100%', textAlign: 'left', padding: '7px 10px',
                  fontFamily: FONT_STACK, fontSize: 12, border: 'none',
                  background: 'transparent', cursor: 'pointer', color: '#A8660C',
                  borderTop: filteredSuggestions.length > 0 ? '1px solid ' + TOK.line : 'none',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = TOK.bg}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                <Plus size={10} style={{ verticalAlign: '-1px' }} /> Add "{draft.trim()}" as new ⚠ (not registered — owner should add to registry)
              </button>
            )}
            <button onClick={() => { setDraft(''); setAdding(false); }}
              style={{
                width: '100%', textAlign: 'left', padding: '6px 10px',
                fontFamily: FONT_STACK, fontSize: 11, border: 'none',
                background: TOK.bg, cursor: 'pointer', color: TOK.muted,
                borderTop: '1px solid ' + TOK.line,
              }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═════════ PIC EDITOR (v26 — single-select autocomplete) ═════════ */
// Single-select autocomplete from teamMembers ONLY (not registry — PIC needs
// email for notifications). Free-text allowed but warned.
function PicEditor({ value, onChange, teamMembersList, project, label, placeholder }) {
  const dirIndex = useContext(DirectoryIndexContext);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const combined = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const m of (Array.isArray(teamMembersList) ? teamMembersList : [])) {
      if (!seen.has(m.name)) { seen.add(m.name); out.push({ name: m.name, email: m.email, kind: 'member' }); }
    }
    return out;
  }, [teamMembersList]);

  const filtered = useMemo(() => {
    // Strip leading @ to support @-mention syntax (e.g., "@tr" → "tr")
    const q = (draft || '').trim().replace(/^@+/, '').toLowerCase();
    return combined
      .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [combined, draft]);

  const isKnown = !!(value && findMember(combined, value, dirIndex));
  const member = findMember(combined, value, dirIndex);

  const pick = (name) => {
    // Strip leading @ if user typed @-mention syntax, then resolve
    // email → canonical name if the typed value matches a member's email.
    const cleaned = (name || '').trim().replace(/^@+/, '');
    const resolved = resolvePicValue(cleaned, combined, dirIndex);
    onChange(resolved || null);
    setDraft('');
    setEditing(false);
  };

  const cancel = () => { setEditing(false); setDraft(''); };

  if (editing) {
    return (
      <div style={{ position: 'relative' }}>
        <Input
          value={draft}
          onChange={setDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filtered[0]) { e.preventDefault(); pick(filtered[0].name); }
            else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          }}
          placeholder={placeholder || 'Type @ or name (e.g., @tr → trangvk@…)'}
          autoFocus
        />
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: TOK.surface, border: '1px solid ' + TOK.lineStrong, borderRadius: 6,
          marginTop: 2, maxHeight: 220, overflowY: 'auto', zIndex: 50,
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        }}>
          {filtered.map((s) => (
            <button key={s.name} onClick={() => pick(s.name)}
              style={{
                width: '100%', textAlign: 'left', padding: '7px 10px',
                fontFamily: FONT_STACK, fontSize: 12, border: 'none',
                background: 'transparent', cursor: 'pointer', color: TOK.ink,
                borderBottom: '1px solid ' + TOK.line,
                display: 'flex', alignItems: 'center', gap: 8,
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = TOK.bg}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
              <span>{s.name}</span>
              {s.email && <span style={{ color: TOK.muted, fontSize: 11 }}>{s.email}</span>}
            </button>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '8px 10px', fontSize: 11, color: TOK.subtle }}>
              No matching team members. Type to filter, or add members in Project Settings.
            </div>
          )}
          {draft.trim() && !filtered.some((s) => s.name.toLowerCase() === draft.trim().toLowerCase()) && (
            <button onClick={() => pick(draft)}
              style={{
                width: '100%', textAlign: 'left', padding: '7px 10px',
                fontFamily: FONT_STACK, fontSize: 12, border: 'none',
                background: 'transparent', cursor: 'pointer', color: '#A8660C',
                borderTop: filtered.length > 0 ? '1px solid ' + TOK.line : 'none',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = TOK.bg}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
              ⚠ Use "{draft.trim()}" as free text (not in team members)
            </button>
          )}
          <button onClick={cancel}
            style={{
              width: '100%', textAlign: 'left', padding: '6px 10px',
              fontFamily: FONT_STACK, fontSize: 11, border: 'none',
              background: TOK.bg, cursor: 'pointer', color: TOK.muted,
              borderTop: '1px solid ' + TOK.line,
            }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, minHeight: 36,
      padding: '4px 6px', borderRadius: 7, border: '1px solid ' + TOK.lineStrong,
      background: TOK.surface,
    }}>
      {value ? (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, flex: 1,
          padding: '3px 8px', fontSize: 13,
        }}>
          <span style={{ fontWeight: 500 }}>{value}</span>
          {member?.email && <span style={{ fontSize: 11, color: TOK.muted }}>({member.email})</span>}
          {!isKnown && (
            <span title="Not a team member with email — please re-select from members"
              style={{ fontSize: 10, fontWeight: 500, padding: '1px 7px', borderRadius: 999, color: '#A8660C', background: '#FAEEDA' }}>
              ⚠ Not a team member
            </span>
          )}
          <button onClick={() => setEditing(true)} title="Change PIC"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 2, display: 'flex', marginLeft: 'auto' }}>
            <Edit2 size={11} />
          </button>
        </span>
      ) : (
        <button onClick={() => setEditing(true)}
          style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, fontFamily: FONT_STACK, fontSize: 12, textAlign: 'left', padding: '6px 8px' }}>
          {placeholder || 'Click to select PIC — type @ or name to filter…'}
        </button>
      )}
      {value && (
        <button onClick={() => onChange(null)} title="Clear"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 4, display: 'flex' }}>
          <X size={12} />
        </button>
      )}
    </div>
  );
}

/* ═════════ WEIGHT BADGE (v22) ═════════ */
// Inline pill displaying effective % weight for a program/workstream/task.
// Click (when isOwner && !locked) opens an inline number input. Empty saves null
// (revert to equal split). cpValue prop is wired in v24 to show "X% · Ycp".
function WeightBadge({ weight, effectiveWeight, onChange, locked, isOwner, label, cpValue }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const isExplicit = typeof weight === 'number' && !isNaN(weight) && weight >= 0;
  const editable = isOwner && !locked;

  const commit = () => {
    const t = (draft || '').trim();
    if (t === '') {
      onChange(null);
    } else {
      const n = Number(t);
      if (!isNaN(n) && n >= 0 && n <= 100) onChange(n);
    }
    setEditing(false);
  };
  const cancel = () => { setEditing(false); setDraft(''); };

  if (editing) {
    return (
      <input
        type="number"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
        placeholder={isExplicit ? String(weight) : ''}
        min={0}
        max={100}
        style={{
          fontFamily: FONT_STACK, fontSize: 11, width: 56,
          padding: '2px 6px', borderRadius: 999,
          border: '1px solid ' + TOK.accent, color: TOK.ink,
          background: TOK.surface,
        }}
      />
    );
  }

  const tip = label ? `Weight for ${label}` : 'Weight';
  const pct = Math.round((effectiveWeight || 0) * 10) / 10;
  const cpStr = (typeof cpValue === 'number' && cpValue > 0)
    ? ` · ${Math.round(cpValue * 10) / 10}cp`
    : '';
  return (
    <span
      onClick={() => editable && setEditing(true)}
      title={editable ? `${tip} — click to edit` : (locked ? `${tip} — locked` : tip)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        fontFamily: FONT_STACK, fontSize: 11,
        padding: '2px 8px', borderRadius: 999,
        background: isExplicit ? 'rgba(59,109,17,0.10)' : TOK.bg,
        color: isExplicit ? TOK.accent : TOK.muted,
        border: locked ? '1px dashed ' + TOK.lineStrong : '1px solid transparent',
        cursor: editable ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
      }}
    >
      ⚖ {isExplicit ? `${pct}%` : `~${pct}%`}{cpStr}
    </span>
  );
}

/* ═════════ CREDIT SHARES EDITOR (v22 + v23 mode tracking) ═════════ */
// Per-task editor for task.creditShares. Lives in TaskDetail edit form.
// onChange receives `{ shares, mode }` where mode = 'auto' | 'manual'.
// User editing a value flips mode → 'manual'. "Reset to default rule" reverts.
function CreditSharesEditor({ task, onChange, locked, isOwner }) {
  const primary = task.pic;
  const contribs = Array.isArray(task.contributors) ? task.contributors : [];
  const mode = task.creditSharesMode || 'auto';
  const people = useMemo(() => {
    const seen = new Set();
    const out = [];
    if (primary) { seen.add(primary); out.push(primary); }
    for (const c of contribs) { if (!seen.has(c)) { seen.add(c); out.push(c); } }
    return out;
  }, [primary, contribs]);

  const editable = isOwner && !locked;
  const shares = task.creditShares || {};
  const defaultRule = computeDefaultCreditShares(primary, contribs);

  const setOne = (name, value) => {
    const next = { ...shares };
    if (value === '' || value == null) {
      delete next[name];
    } else {
      const n = Number(value);
      if (!isNaN(n) && n >= 0) next[name] = n;
    }
    onChange({ shares: next, mode: 'manual' });
  };

  const total = people.reduce((acc, n) => acc + (Number(shares[n]) || 0), 0);
  const balanced = Math.abs(total - 100) < 0.5;

  const autoBalance = () => {
    if (people.length === 0) return;
    const next = {};
    const set = people.filter((n) => typeof shares[n] === 'number' && shares[n] > 0);
    const unset = people.filter((n) => !(typeof shares[n] === 'number' && shares[n] > 0));
    const setSum = set.reduce((acc, n) => acc + Number(shares[n] || 0), 0);
    if (unset.length > 0 && setSum < 100) {
      const remain = Math.max(0, 100 - setSum);
      const each = Math.round((remain / unset.length) * 100) / 100;
      for (const n of set) next[n] = shares[n];
      for (const n of unset) next[n] = each;
    } else if (setSum > 0) {
      for (const n of set) next[n] = Math.round((shares[n] / setSum) * 10000) / 100;
    } else {
      const each = Math.round((100 / people.length) * 100) / 100;
      for (const n of people) next[n] = each;
    }
    onChange({ shares: next, mode: 'manual' });
  };

  const resetToDefault = () => {
    const next = defaultRule || (primary ? { [primary]: 100 } : {});
    onChange({ shares: next, mode: 'auto' });
  };

  // Helper text dynamics
  let helperText;
  if (mode === 'manual') {
    helperText = "Manually edited. Click 'Reset to default' to revert to the rule-based split.";
  } else if (defaultRule) {
    helperText = "Auto-applied per default rule (70/30, 70/15/15). Editing any value switches to manual override.";
  } else if (contribs.length >= 3) {
    helperText = "3+ contributors — no default rule. Enter shares manually.";
  } else {
    helperText = "Allocate credit % across primary PIC and contributors. Sum should equal 100%.";
  }

  return (
    <div style={{ background: TOK.bg, padding: 10, borderRadius: 7, marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
        <FieldLabel>Credit shares</FieldLabel>
        {mode === 'auto' ? (
          <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 7px', borderRadius: 999, color: '#0F6E56', background: '#E1F5EE' }}>⚙ Auto</span>
        ) : (
          <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 7px', borderRadius: 999, color: '#A8660C', background: '#FAEEDA' }}>✎ Manual override</span>
        )}
        {locked && <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 999, color: TOK.muted, background: TOK.bg, border: '1px dashed ' + TOK.lineStrong }}>🔒 Locked</span>}
        {!isOwner && !locked && <span style={{ fontSize: 10, color: TOK.subtle }}>(workspace owner only)</span>}
      </div>
      <div style={{ fontSize: 11, color: TOK.muted, marginBottom: 8, lineHeight: 1.5 }}>
        {helperText}
      </div>

      {people.length === 0 ? (
        <div style={{ fontSize: 12, color: TOK.subtle, fontStyle: 'italic' }}>
          No PIC or contributors set. Add them above to allocate credit shares.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {people.map((name) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 12 }}>
                  {name}
                  {name === primary && <span style={{ fontSize: 10, color: TOK.muted, marginLeft: 6 }}>(primary)</span>}
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={shares[name] != null ? shares[name] : ''}
                  onChange={(e) => setOne(name, e.target.value)}
                  disabled={!editable}
                  placeholder="—"
                  style={{
                    fontFamily: FONT_STACK, fontSize: 12, width: 70,
                    padding: '4px 8px', borderRadius: 6,
                    border: '1px solid ' + TOK.lineStrong,
                    background: editable ? TOK.surface : TOK.bg,
                    color: TOK.ink,
                    opacity: editable ? 1 : 0.7,
                  }}
                />
                <span style={{ fontSize: 11, color: TOK.muted, width: 12 }}>%</span>
              </div>
            ))}
          </div>
          <div style={{
            marginTop: 8, padding: '6px 10px', borderRadius: 6, fontSize: 12,
            background: balanced ? TOK.healthGreenBg : TOK.healthAmberBg,
            color: balanced ? TOK.healthGreen : TOK.healthAmber,
          }}>
            {balanced ? '✓ ' : '⚠ '}Total: {Math.round(total * 10) / 10}%{!balanced && ' (should = 100%)'}
          </div>
          {editable && (
            <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
              <Btn size="sm" onClick={autoBalance}>Auto-balance</Btn>
              {(mode === 'manual' || defaultRule) && (
                <Btn size="sm" variant="ghost" onClick={resetToDefault} title="Revert to default rule">Reset to default rule</Btn>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ═════════ DEADLINE REQUEST (v27) ═════════ */
// Modal for non-owners to submit a deadline change request.
// P3-10: `uid` (v2 projects only) is stored as requestedByUid, so the request can
// be routed by uid (deadlineApprover / canApproveDeadline, Task 12).
function DeadlineRequestDialog({ task, currentEnd, author, uid: myUid = null, onClose, onSubmit }) {
  const [newDate, setNewDate] = useState(currentEnd || '');
  const [reason, setReason] = useState('');
  const days = (newDate && currentEnd) ? daysBetween(currentEnd, newDate) : 0;
  const action = days > 0 ? 'extend' : (days < 0 ? 'shorten' : null);
  const canSubmit = !!newDate && newDate !== currentEnd && reason.trim().length >= 5;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      newDate,
      reason: reason.trim(),
      requestedBy: author,
      ...(myUid ? { requestedByUid: myUid } : {}),
      requestedAt: new Date().toISOString(),
      days,
      action: action || 'extend',
    });
    onClose();
  };

  return (
    <Modal title="Request deadline change" onClose={onClose} width={520} zHigh>
      <div style={{ fontSize: 13, color: TOK.muted, marginBottom: 14, lineHeight: 1.5 }}>
        Submit a deadline change for <strong style={{ color: TOK.ink }}>{task.name}</strong>. The workspace owner will review and approve or reject.
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <FieldLabel>Current end</FieldLabel>
          <div style={{
            padding: '8px 10px', borderRadius: 7, background: TOK.bg,
            border: '1px solid ' + TOK.line, fontSize: 13, color: TOK.muted,
          }}>{currentEnd ? fmtDateShort(currentEnd) : '—'}</div>
        </div>
        <div style={{ flex: 1 }}>
          <FieldLabel>Proposed new end</FieldLabel>
          <Input type="date" value={newDate} onChange={setNewDate} />
        </div>
      </div>
      {action && (
        <div style={{ marginBottom: 12 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500,
            background: action === 'extend' ? '#FAEEDA' : '#E1F5EE',
            color: action === 'extend' ? '#A8660C' : '#0F6E56',
          }}>
            {action === 'extend' ? `➡ ${days} days later` : `⬅ ${Math.abs(days)} days earlier`}
          </span>
        </div>
      )}
      <FieldLabel>Reason <span style={{ color: TOK.subtle, fontWeight: 400 }}>(required, ≥5 chars)</span></FieldLabel>
      <Textarea value={reason} onChange={setReason} rows={3} placeholder="e.g., Vendor delay on contract review; need 2 more weeks" />
      <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" disabled={!canSubmit} onClick={submit}>Submit request</Btn>
      </div>
    </Modal>
  );
}

// Banner displayed in TaskDetail when task.deadlineRequest is set.
function DeadlineRequestBanner({ task, request, author, isOwner, onApprove, onReject, onCancel }) {
  if (!request) return null;
  const isRequester = request.requestedBy === author;
  return (
    <div style={{
      marginTop: 12, padding: 12, borderRadius: 7,
      background: '#FAEEDA', border: '1px solid #E0BC75',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 16 }}>⏳</span>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#A8660C' }}>
          Deadline change request — pending owner review
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: TOK.ink, lineHeight: 1.5, marginBottom: 4 }}>
        <strong>{request.requestedBy}</strong> requested to {request.action || 'change'} the deadline by {Math.abs(request.days || 0)} day{Math.abs(request.days || 0) === 1 ? '' : 's'}:
      </div>
      <div style={{ fontSize: 12, color: TOK.muted, marginBottom: 4 }}>
        {fmtDateShort(task.end)} → <strong style={{ color: TOK.ink }}>{fmtDateShort(request.newDate)}</strong>
      </div>
      {request.reason && (
        <div style={{ fontSize: 12, color: TOK.muted, fontStyle: 'italic', marginBottom: 4 }}>
          "{request.reason}"
        </div>
      )}
      <div style={{ fontSize: 11, color: TOK.subtle, marginBottom: 8 }}>
        Requested {fmtDateTime(request.requestedAt)}
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        {isOwner ? (
          <>
            <Btn size="sm" variant="primary" onClick={onApprove}>✓ Approve</Btn>
            <Btn size="sm" onClick={onReject}>✕ Reject</Btn>
          </>
        ) : isRequester ? (
          <Btn size="sm" onClick={onCancel}>Cancel my request</Btn>
        ) : (
          <span style={{ fontSize: 11, color: TOK.subtle, fontStyle: 'italic' }}>
            Only the requester can cancel; only workspace owner can approve/reject.
          </span>
        )}
      </div>
    </div>
  );
}

/* ═════════ TASK DETAIL PANEL ═════════ */
function TaskDetail({ project, taskId, onClose, onUpdate, onDelete, onProjectUpdate, author, teamMembers, dialogs, isOwner = false, onNavigateRaid, showToast }) {
  const dirIndex = useContext(DirectoryIndexContext);
  const me = useContext(MeContext);
  // P3 (v2): message when a manager's PIC / contributor edit would need a manual split.
  const [creditNote, setCreditNote] = useState(null);
  const loc = useMemo(() => findTaskInProject(project, taskId), [project, taskId]);
  // ── All hooks declared before any early return (Rules of Hooks)
  // Panel tab state
  const [panelTab, setPanelTab] = useState('updates'); // updates | decisions | actions
  const [showDecisionForm, setShowDecisionForm] = useState(false);
  const [editingDecision, setEditingDecision] = useState(null);
  const [showActionForm, setShowActionForm] = useState(false);
  const [editingAction, setEditingAction] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(loc?.task || null);
  const [showDeadlineRequest, setShowDeadlineRequest] = useState(false);
  // Wave 1 U4: { key: 'start' | 'end', text } when a date was refused (outside the WS).
  const [dateNote, setDateNote] = useState(null);
  // B4: resizable width (persisted per browser) and expanded overlay mode.
  const [panelWidth, setPanelWidth] = useState(() => {
    try { return clampPanelWidth(localStorage.getItem('afmpt.taskPanelWidth')); } catch { return clampPanelWidth(null); }
  });
  const [expanded, setExpanded] = useState(false);
  const startResize = (e) => {
    e.preventDefault();
    const startX = e.clientX; const startW = panelWidth;
    const onMove = (ev) => setPanelWidth(clampPanelWidth(startW + (startX - ev.clientX)));
    const onUp = (ev) => {
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
      const w = clampPanelWidth(startW + (startX - ev.clientX));
      try { localStorage.setItem('afmpt.taskPanelWidth', String(w)); } catch { /* ignore */ }
    };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  };

  // Reset all panel state when switching to a different task
  useEffect(() => {
    setPanelTab('updates');
    setShowDecisionForm(false); setEditingDecision(null);
    setShowActionForm(false); setEditingAction(null);
    setEditing(false);
    setDraft(loc?.task || null);
    setShowDeadlineRequest(false);
    setCreditNote(null);
    setDateNote(null);
  }, [taskId]); // eslint-disable-line

  // P3 (v2): once the task is Submitted, a PM / Sub-PM may not change PIC /
  // contributors / credit (C5): drop such pending draft edits and say why.
  const liveStatus = loc?.task?.status;
  useEffect(() => {
    if (!project.__v2 || liveStatus !== 'Submitted' || !loc) return;
    const t = loc.task;
    if (canEditCreditFields(managerLevel(project.__v2.roles, t.id, me.uid), t)) return;
    const keys = ['pic', 'contributors', 'creditShares', 'creditSharesMode'];
    if (!draft || keys.every((k) => JSON.stringify(draft[k]) === JSON.stringify(t[k]))) return;
    setDraft((d) => {
      if (!d) return d;
      const n = { ...d };
      for (const k of keys) { if (k in t) n[k] = t[k]; else delete n[k]; }
      return n;
    });
    setCreditNote('Credit fields locked while pending approval');
  }, [liveStatus]); // eslint-disable-line

  // Decisions linked to this milestone (task is in relatedTaskIds)
  const linkedDecisions = useMemo(
    () => (project.decisions || []).filter((d) => (d.relatedTaskIds || []).includes(taskId)).sort((a, b) => new Date(b.date) - new Date(a.date)),
    [project.decisions, taskId]
  );
  // Suggestions for ContributorEditor: every PIC + contributor name already
  // used anywhere in this project. Deduped, sorted.
  const contributorSuggestions = useMemo(() => {
    const set = new Set();
    for (const pg of (project.programs || [])) {
      for (const ws of (pg.workstreams || [])) {
        for (const t of (ws.tasks || [])) {
          if (t.pic) set.add(t.pic);
          for (const c of (t.contributors || [])) set.add(c);
        }
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [project]);
  // Action items linked to this milestone
  const linkedActions = useMemo(
    () => (project.actionItems || []).filter((a) => a.relatedTaskId === taskId).sort((a, b) => {
      const sOrder = { Pending: 0, InProgress: 1, 'Pushed to OP': 2, Done: 3, Cancelled: 4 };
      if (sOrder[a.status] !== sOrder[b.status]) return sOrder[a.status] - sOrder[b.status];
      return 0;
    }),
    [project.actionItems, taskId]
  );

  if (!loc) return null;
  const { task, workstream, program } = loc;
  // P3 (v2 only), carry 4: credit split = Owner only (C6'); PIC / contributors =
  // Owner at any status, PM / Sub-PM while open (C5). v1 keeps today's gating.
  const v2Roles = project.__v2 ? project.__v2.roles || null : null;
  const v2Role = v2Roles ? managerLevel(v2Roles, task.id, me.uid) : null;
  const canSplitCredit = project.__v2 ? canEditCreditSplit(v2Role, task) : isOwner;
  const canEditPeople = project.__v2 ? canEditCreditFields(v2Role, task) : true;
  // Wave 1 U4 / U6 (v2): PM / Deputy / Sub-PM edit Start / End within the WS
  // dates; Edit / Drop hidden when the rules would refuse. v1 unchanged.
  const isV2 = !!project.__v2;
  const caps = uiCaps({ isOwner, isV2, roles: v2Roles, uid: me.uid, programId: program.id, wsId: workstream.id });
  const canDates = isV2 ? canEditTaskDates({ isOwner, isV2, roles: v2Roles, taskId: task.id, uid: me.uid }) : isOwner;
  const wsWindow = (v2Roles && v2Roles.workstreams && v2Roles.workstreams[workstream.id]) || workstream;
  const setDraftDate = (key, v) => {
    setDateNote(null);
    setDraft({ ...draft, [key]: v || null });
  };
  const datesOutsideWs = () => isV2 && !isOwner && !datesWithinWs(draft.start, draft.end, wsWindow);
  const dateNoteFor = () => (dateNote
    ? <div role="alert" style={{ fontSize: 11, color: TOK.overdueFg, marginTop: 3 }}>{dateNote}</div>
    : null);
  // A manager may not produce manual mode (PIC removed / 3+ contributors): block it.
  const autoCreditOrBlock = (next, pic, contributors) => {
    if ((next.creditSharesMode || 'auto') !== 'auto') return next;
    const def = computeDefaultCreditShares(pic, contributors);
    if (def) return { ...next, creditShares: def };
    if (project.__v2 && !canSplitCredit) {
      setCreditNote(pic ? `${MANUAL_SPLIT_MESSAGE} (3+ contributors).` : `${MANUAL_SPLIT_MESSAGE}: keep a PIC on the task.`);
      return null;
    }
    return { ...next, creditSharesMode: 'manual' };
  };

  // Fields the edit form does NOT control but other UI elements mutate inline
  // via direct onUpdate calls (references, posted updates, status pill, weight
  // badge, deadline request flow). Pulling them from `draft` at save time
  // would silently wipe inline edits made between entering edit mode and
  // clicking Save — so we always preserve whatever's in the current task.
  const LIVE_FIELDS = [
    'references',
    'updates',
    'checkIns',
    'deadlineRequest',
    'deadlineRequestHistory',
    'status',
    'weight',
    // P3: the close flow (CloseControl) may change these while the form is open.
    'closeRequest',
    'closeRequestHistory',
    'approvedByUid',
    'approvedAt',
    'closedByUid',
  ];

  const save = () => {
    if (datesOutsideWs()) {
      setDateNote(`Outside the work stream dates (${wsWindow.start ? fmtDateShort(wsWindow.start) : '—'} – ${wsWindow.end ? fmtDateShort(wsWindow.end) : '—'}). Use Request change.`);
      return;
    }
    setDateNote(null);
    const editedDraft = { ...draft };
    for (const f of LIVE_FIELDS) delete editedDraft[f];
    let toSave = { ...task, ...editedDraft };
    if (draft.end !== task.end) {
      toSave = logDeadlineChange(toSave, draft.end, author);
    }
    onUpdate(toSave);
    setEditing(false);
  };
  const setStatus = (s) => onUpdate({ ...task, status: s });

  // ─── Deadline request handlers (v27) ───
  const submitDeadlineRequest = (req) => {
    onUpdate({ ...task, deadlineRequest: req });
  };
  const approveDeadlineRequest = async () => {
    if (!isOwner) return; // defense-in-depth: UI also gates the button
    if (!task.deadlineRequest) return;
    const req = task.deadlineRequest;
    const ok = await dialogs.confirm({
      title: `Approve deadline ${req.action || 'change'}?`,
      message: `Apply new end date ${fmtDateShort(req.newDate)} to "${task.name}"? This will be recorded in the audit log.`,
      okLabel: 'Approve',
    });
    if (!ok) return;
    const histEntry = {
      id: uid('dh'),
      from: task.end || null,
      to: req.newDate,
      changedBy: req.requestedBy,
      changedAt: new Date().toISOString(),
      reason: req.reason,
      approvedBy: author,
      approvedAt: new Date().toISOString(),
    };
    const reqHistEntry = { ...req, status: 'approved', resolvedBy: author, resolvedAt: new Date().toISOString() };
    onUpdate({
      ...task,
      end: req.newDate,
      deadlineRequest: null,
      deadlineHistory: [...(task.deadlineHistory || []), histEntry],
      deadlineRequestHistory: [...(task.deadlineRequestHistory || []), reqHistEntry],
    });
  };
  const rejectDeadlineRequest = async () => {
    if (!isOwner) return; // defense-in-depth: UI also gates the button
    if (!task.deadlineRequest) return;
    const req = task.deadlineRequest;
    const note = await dialogs.prompt({
      title: 'Reject deadline change?',
      message: `Optionally explain why "${req.requestedBy}" should keep the original deadline.`,
      placeholder: 'e.g., Dependencies on this task; please re-prioritize',
      okLabel: 'Reject',
      allowEmpty: true,
    });
    if (note === null) return;
    const reqHistEntry = {
      ...req, status: 'rejected',
      resolvedBy: author, resolvedAt: new Date().toISOString(),
      resolverNote: (note || '').trim() || null,
    };
    onUpdate({
      ...task,
      deadlineRequest: null,
      deadlineRequestHistory: [...(task.deadlineRequestHistory || []), reqHistEntry],
    });
  };
  const cancelDeadlineRequest = async () => {
    if (!task.deadlineRequest) return;
    // Only the original requester or the workspace owner can cancel
    if (task.deadlineRequest.requestedBy !== author && !isOwner) return;
    const ok = await dialogs.confirm({
      title: 'Cancel your request?',
      message: 'Withdraw this deadline change request? You can submit a new one later.',
      okLabel: 'Cancel request',
    });
    if (!ok) return;
    const reqHistEntry = {
      ...task.deadlineRequest, status: 'cancelled',
      resolvedBy: author, resolvedAt: new Date().toISOString(),
    };
    onUpdate({
      ...task,
      deadlineRequest: null,
      deadlineRequestHistory: [...(task.deadlineRequestHistory || []), reqHistEntry],
    });
  };

  const addUpdate = ({ text, isBlocker }) => {
    const newU = {
      id: uid('upd'),
      timestamp: new Date().toISOString(),
      author,
      text: text.trim(),
      isBlocker: !!isBlocker,
    };
    onUpdate({ ...task, updates: [newU, ...(task.updates || [])] });
  };

  const resolveBlocker = async (entry) => {
    const note = await dialogs.prompt({
      title: 'Mark blocker as resolved',
      message: `Optionally describe how it was resolved (visible to the team).`,
      placeholder: 'e.g., Got bank approval, all clear',
      okLabel: 'Mark resolved',
      allowEmpty: true,
    });
    if (note === null) return;
    const updated = (task.updates || []).map((u) => u.id === entry.id
      ? { ...u, resolvedAt: new Date().toISOString(), resolvedBy: author, resolution: note.trim() || null }
      : u
    );
    onUpdate({ ...task, updates: updated });
  };

  // Decision save (insert or update)
  const saveDecision = (d) => {
    const list = project.decisions || [];
    const next = editingDecision ? list.map((x) => x.id === d.id ? d : x) : [d, ...list];
    onProjectUpdate({ ...project, decisions: next });
    setShowDecisionForm(false); setEditingDecision(null);
  };
  const editDecision = (d) => { setEditingDecision(d); setShowDecisionForm(true); };
  const removeDecision = async (d) => {
    const ok = await dialogs.confirm({ title: 'Delete decision?', message: 'Delete this decision permanently?', danger: true, okLabel: 'Delete' });
    if (!ok) return;
    onProjectUpdate({ ...project, decisions: (project.decisions || []).filter((x) => x.id !== d.id) });
  };

  // Action save (insert or update)
  const saveAction = (a, opts = {}) => {
    if (me.readOnly) { me.onReadOnly(); return; } // P3-16: no action, no Chat post in View as
    const wasEditing = !!editingAction;
    const list = project.actionItems || [];
    const next = editingAction ? list.map((x) => x.id === a.id ? a : x) : [a, ...list];
    onProjectUpdate({ ...project, actionItems: next });
    setShowActionForm(false); setEditingAction(null);
    // v30 — notify chat on create (opt-in). Fire-and-forget; never blocks.
    // TaskDetail has no showToast prop, so we log failures to console rather
    // than threading a toast through this secondary path.
    if (!wasEditing && opts.notifyChat && project.googleChatWebhook) {
      const related = a.relatedTaskId ? findTaskInProject(project, a.relatedTaskId) : null;
      postToChat(project.googleChatWebhook, buildNewActionCard({
        project, action: a, related, author,
      })).then((res) => {
        if (!res.ok) console.error('New-action chat notify failed:', res.status, res.statusText);
      });
    }
  };
  const editAction = (a) => { setEditingAction(a); setShowActionForm(true); };
  const removeAction = async (a) => {
    const ok = await dialogs.confirm({ title: 'Delete action?', message: `Delete "${a.title}"?`, danger: true, okLabel: 'Delete' });
    if (!ok) return;
    onProjectUpdate({ ...project, actionItems: (project.actionItems || []).filter((x) => x.id !== a.id) });
  };

  return (
    <div style={expanded
      ? { position: 'absolute', inset: 24, zIndex: 45 /* below Modal (50) so dialogs opened from the panel stay on top */, background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 12, boxShadow: '0 20px 50px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', fontFamily: FONT_STACK }
      : { width: panelWidth, flexShrink: 0, position: 'relative', background: TOK.surface, borderLeft: '1px solid ' + TOK.line, display: 'flex', flexDirection: 'column', height: '100%', fontFamily: FONT_STACK }}>
      {!expanded && (
        // Wide hit area on the panel's left edge with a visible grip, so the handle can be found.
        <div onMouseDown={startResize} title="Drag to resize" aria-label="Resize task panel"
          style={{ position: 'absolute', left: -5, top: 0, bottom: 0, width: 12, cursor: 'col-resize', zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 4, height: 40, borderRadius: 2, background: TOK.lineStrong }} />
        </div>
      )}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid ' + TOK.line, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: TOK.muted, fontWeight: 500 }}>
          {program.name} › {workstream.name}
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(taskUrl(window.location.origin, project.id, task.id));
                showToast?.('Link copied');
              } catch {
                showToast?.("Couldn't copy the link");
              }
            }}
            title="Copy link" aria-label="Copy link to this task"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 2, display: 'inline-flex', alignItems: 'center' }}>
            <LinkIcon size={14} />
          </button>
          <button onClick={() => setExpanded((v) => !v)} title={expanded ? 'Back to side panel' : 'Expand'} aria-label={expanded ? 'Back to side panel' : 'Expand task panel'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 2, fontSize: 14, lineHeight: 1 }}>
            {expanded ? '⤡' : '⤢'}
          </button>
          <button onClick={onClose} aria-label="Close task panel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 2 }}>
            <X size={16} />
          </button>
        </div>
      </div>

      <div style={{ overflowY: 'auto', flex: 1, padding: 16 }}>
        {editing ? (
          <>
            <FieldLabel>Task name</FieldLabel>
            <Input value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
          </>
        ) : (
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500, lineHeight: 1.35 }}>{task.name}</h2>
        )}

        <div style={{ marginTop: 10, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Pill status={task.status || 'Planned'} />
          <HealthPill health={task.health || 'green'} size="sm" />
          {isOverdue(task) && <Pill overdue />}
          <div style={{ flex: 1 }} />
          {!editing ? (caps.taskEdit && (
            <>
              <Btn variant="ghost" size="sm" onClick={() => setEditing(true)} title="Edit task"><Edit2 size={12} /></Btn>
              <Btn variant="ghost" size="sm" onClick={() => onDelete(task)} title="Drop task" aria-label="Drop task"><Trash2 size={12} /></Btn>
            </>
          )) : (
            <>
              <Btn size="sm" onClick={() => { setDraft(task); setEditing(false); setDateNote(null); }}>Cancel</Btn>
              <Btn size="sm" variant="primary" onClick={save}>Save</Btn>
            </>
          )}
        </div>

        <div style={{ margin: '16px 0' }}>
          <FieldLabel>Status</FieldLabel>
          {project.__v2 ? <CloseControl task={task} roles={project.__v2.roles} onUpdate={onUpdate} dialogs={dialogs} /> : (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATUSES.map((s) => {
              const active = (task.status || 'Planned') === s;
              const map = {
                Planned: { fg: TOK.plannedFg, bg: TOK.plannedBg },
                InProgress: { fg: TOK.inprogFg, bg: TOK.inprogBg },
                Completed: { fg: TOK.doneFg, bg: TOK.doneBg },
                Dropped: { fg: TOK.droppedFg, bg: TOK.droppedBg },
              };
              const m = map[s];
              return (
                <button key={s} onClick={() => setStatus(s)} style={{
                  flex: '1 1 100px', fontFamily: FONT_STACK, fontSize: 12, fontWeight: 500, padding: '6px 8px', borderRadius: 7,
                  border: '1px solid ' + (active ? m.fg : TOK.lineStrong),
                  background: active ? m.bg : TOK.surface, color: active ? m.fg : TOK.ink,
                  cursor: 'pointer',
                }}>{STATUS_LABEL[s]}</button>
              );
            })}
          </div>
          )}
        </div>

        {/* RAG health (manual) — independent from status */}
        <div style={{ margin: '16px 0' }}>
          <FieldLabel>Health (manual)</FieldLabel>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {HEALTH_VALUES.map((h) => {
              const active = (task.health || 'green') === h;
              const map = {
                green: { fg: TOK.healthGreen, bg: TOK.healthGreenBg },
                amber: { fg: TOK.healthAmber, bg: TOK.healthAmberBg },
                red: { fg: TOK.healthRed, bg: TOK.healthRedBg },
              };
              const m = map[h];
              return (
                <button key={h} onClick={() => onUpdate({ ...task, health: h })} style={{
                  flex: 1, fontFamily: FONT_STACK, fontSize: 12, fontWeight: 500, padding: '6px 8px', borderRadius: 7,
                  border: '1px solid ' + (active ? m.fg : TOK.lineStrong),
                  background: active ? m.bg : TOK.surface, color: active ? m.fg : TOK.ink,
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: m.fg }} />
                  {HEALTH_LABEL[h]}
                </button>
              );
            })}
          </div>
          {(task.health === 'amber' || task.health === 'red') && (
            <Textarea
              value={task.healthNote || ''}
              onChange={(v) => onUpdate({ ...task, healthNote: v })}
              placeholder={`Why ${HEALTH_LABEL[task.health].toLowerCase()}? (visible in meeting view & exports)`}
              rows={2}
            />
          )}
        </div>

        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {canEditPeople ? (<>
            <div>
              <FieldLabel>PIC <span style={{ color: TOK.subtle, fontWeight: 400 }}>(team member with email)</span></FieldLabel>
              <PicEditor
                value={draft.pic}
                onChange={(v) => {
                  const next = autoCreditOrBlock({ ...draft, pic: v }, v, draft.contributors || []);
                  if (!next) return;
                  setCreditNote(null);
                  setDraft(next);
                }}
                teamMembersList={teamMembers || []}
                project={project}
              />
            </div>
            <ContributorEditor
              contributors={draft.contributors || []}
              onChange={(arr) => {
                const next = autoCreditOrBlock({ ...draft, contributors: arr }, draft.pic, arr);
                if (!next) return;
                setCreditNote(null);
                setDraft(next);
              }}
              suggestions={contributorSuggestions}
              primaryPic={draft.pic}
              project={project}
              teamMembersList={teamMembers || []}
            />
            {creditNote && <div role="alert" style={{ fontSize: 11, color: TOK.overdueFg }}>{creditNote}</div>}
            </>) : (
              <div style={{ fontSize: 12 }}>
                {creditNote && <div role="alert" style={{ fontSize: 11, color: TOK.overdueFg, marginBottom: 4 }}>{creditNote}</div>}
                <Row k="PIC" v={draft.pic || '—'} />
                <Row k="Contributors" v={(draft.contributors || []).join(', ') || '—'} />
                <div style={{ fontSize: 10, color: TOK.subtle, marginTop: 3 }}>
                  PIC and contributors: Owner, or PM / Sub-PM while the task is open.
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <FieldLabel>Start</FieldLabel>
                {(!isV2 || canDates) ? (
                  <Input type="date" value={draft.start || ''} onChange={(v) => setDraftDate('start', v)} />
                ) : (
                  <div style={{
                    padding: '8px 10px', background: TOK.bg, border: '1px dashed ' + TOK.lineStrong, borderRadius: 7,
                    fontSize: 13, color: TOK.muted, cursor: 'not-allowed',
                  }}>
                    🔒 {draft.start ? fmtDateShort(draft.start) : '—'}
                  </div>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <FieldLabel>
                  End {!canDates && <span style={{ color: TOK.subtle, fontWeight: 400 }}>(request change)</span>}
                </FieldLabel>
                {canDates ? (
                  <>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <div style={{ flex: 1 }}><Input type="date" value={draft.end || ''} onChange={(v) => setDraftDate('end', v)} /></div>
                      {!isOwner && (
                        <Btn size="sm" onClick={() => setShowDeadlineRequest(true)} disabled={!!task.deadlineRequest}>
                          {task.deadlineRequest ? '⏳ Request pending' : 'Request change'}
                        </Btn>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{
                      flex: 1, padding: '8px 10px', background: TOK.bg,
                      border: '1px dashed ' + TOK.lineStrong, borderRadius: 7,
                      fontSize: 13, color: TOK.muted, cursor: 'not-allowed',
                    }}>
                      🔒 {draft.end ? fmtDateShort(draft.end) : '—'}
                    </div>
                    <Btn size="sm" onClick={() => setShowDeadlineRequest(true)} disabled={!!task.deadlineRequest}>
                      {task.deadlineRequest ? '⏳ Request pending' : 'Request change'}
                    </Btn>
                  </div>
                )}
              </div>
            </div>
            {dateNoteFor()}
            <div>
              <FieldLabel>Deadline type</FieldLabel>
              <div style={{ display: 'flex', gap: 6 }}>
                {DEADLINE_TYPES.map((t) => {
                  const isActive = (draft.deadlineType || DEFAULT_DEADLINE_TYPE) === t;
                  return (
                    <button key={t}
                      onClick={() => isOwner && setDraft({ ...draft, deadlineType: t })}
                      disabled={!isOwner}
                      style={{ flex: 1, padding: '6px 10px', borderRadius: 6, fontSize: 12,
                        border: '1px solid ' + (isActive ? TOK.ink : TOK.lineStrong),
                        background: isActive ? TOK.bg : TOK.surface,
                        fontWeight: isActive ? 500 : 400,
                        color: TOK.ink,
                        cursor: isOwner ? 'pointer' : 'not-allowed',
                        opacity: !isOwner && !isActive ? 0.55 : 1,
                        fontFamily: FONT_STACK }}>
                      {t === 'hard' ? '🔒 Hard deadline' : '🎯 Soft target'}
                    </button>
                  );
                })}
              </div>
              {!isOwner && (
                <div style={{ fontSize: 10, color: TOK.subtle, marginTop: 3 }}>
                  Only workspace owner can change deadline type.
                </div>
              )}
            </div>
            <div><FieldLabel>Duration (days)</FieldLabel><Input type="number" value={draft.duration ?? ''} onChange={(v) => setDraft({ ...draft, duration: v === '' ? null : Number(v) })} /></div>
            <div><FieldLabel>Key deliverables</FieldLabel><Textarea value={draft.deliverables} onChange={(v) => setDraft({ ...draft, deliverables: v })} rows={3} /></div>
            <div><FieldLabel>Dependencies</FieldLabel><Textarea value={draft.dependencies} onChange={(v) => setDraft({ ...draft, dependencies: v })} rows={2} /></div>
            <CreditSharesEditor
              task={draft}
              onChange={({ shares, mode }) => setDraft({ ...draft, creditShares: shares, creditSharesMode: mode || draft.creditSharesMode || 'auto' })}
              locked={!!project.weightsLocked}
              isOwner={canSplitCredit}
            />
          </div>
        ) : (
          <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Row k="PIC" v={task.pic || '—'} />
            {(task.contributors || []).length > 0 && (
              <Row k="Contributors" v={(task.contributors || []).join(', ')} />
            )}
            <Row k="Start" v={fmtDate(task.start)} />
            <Row k="End" v={fmtDate(task.end)} />
            {isV2 && !caps.taskEdit && me.uid && ((v2Roles?.tasks?.[task.id]?.picUid ?? task.picUid) === me.uid) && (
              // Wave 1 U6: Edit is hidden for the Assignee; keep the request path.
              <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '2px 0 4px' }}>
                <Btn size="sm" onClick={() => setShowDeadlineRequest(true)} disabled={!!task.deadlineRequest}>
                  {task.deadlineRequest ? '⏳ Request pending' : 'Request change'}
                </Btn>
              </div>
            )}
            <Row k="Deadline" v={(task.deadlineType || DEFAULT_DEADLINE_TYPE) === 'hard' ? '🔒 Hard deadline' : '🎯 Soft target'} />
            <Row k="Duration" v={task.duration != null ? `${task.duration} days` : '—'} />
            <Row k="Deliverables" v={task.deliverables || '—'} multiline />
            <Row k="Dependencies" v={task.dependencies || '—'} multiline />
            {(task.creditShares && Object.keys(task.creditShares).length > 0) ? (
              <Row k="Credit shares" v={
                Object.entries(task.creditShares).map(([n, v]) => `${n} ${Math.round(Number(v) * 10) / 10}%`).join(', ')
                + ((task.creditSharesMode || 'auto') === 'manual' ? ' ✎ Manual' : ' ⚙ Auto')
              } />
            ) : (task.pic ? (
              <Row k="Credit shares" v={`${task.pic} 100% (default)`} />
            ) : null)}
          </div>
        )}

        {/* Credit Projection panel (v24) */}
        {(typeof project.creditPoints === 'number' || project.projectLead) && task.status !== 'Dropped' && (() => {
          const projectCredits = computeProjectCredits(project, dirIndex);
          const taskRows = projectCredits.breakdown.filter((b) => b.taskId === task.id);
          if (taskRows.length === 0) return null;
          const taskCp = taskRows[0].taskCp || 0;
          const credited = taskRows[0].credited;
          if (taskCp <= 0) return null;
          const totalCp = projectCredits.totalCp || DEFAULT_CREDIT_POINTS;
          const pctOfPool = (taskCp / totalCp) * 100;
          return (
            <div style={{
              marginTop: 12, padding: 10, borderRadius: 7,
              background: credited ? TOK.doneBg : TOK.bg,
              border: '1px solid ' + (credited ? TOK.doneFg : TOK.line),
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  Credit projection
                </span>
                {credited ? (
                  <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 7px', borderRadius: 999, color: TOK.doneFg, background: TOK.surface, border: '1px solid ' + TOK.doneFg }}>
                    ✓ Earned (task complete)
                  </span>
                ) : (
                  <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 7px', borderRadius: 999, color: TOK.muted, background: TOK.surface, border: '1px solid ' + TOK.lineStrong }}>
                    ○ Projected (not yet complete)
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: TOK.muted, marginBottom: 6 }}>
                Task pool: <strong style={{ color: TOK.ink }}>{Math.round(taskCp * 10) / 10} cp</strong>
                <span style={{ marginLeft: 6, opacity: 0.7 }}>({Math.round(pctOfPool * 10) / 10}% of {totalCp} cp project pool)</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {taskRows.map((b, i) => (
                  <div key={i} style={{ display: 'flex', fontSize: 12, gap: 8 }}>
                    <span style={{ flex: 1 }}>{b.picName} <span style={{ color: TOK.muted, fontSize: 11 }}>({Math.round(b.sharePct * 10) / 10}%)</span></span>
                    <span style={{ color: credited ? TOK.doneFg : TOK.muted, fontWeight: credited ? 500 : 400 }}>
                      {Math.round((b.actual || b.projected) * 100) / 100} cp
                    </span>
                  </div>
                ))}
              </div>
              {!credited && (
                <div style={{ marginTop: 6, fontSize: 11, color: TOK.muted, fontStyle: 'italic' }}>
                  Mark task as Completed to award these credits.
                </div>
              )}
            </div>
          );
        })()}

        <DeadlineRequestBanner
          task={task}
          request={task.deadlineRequest}
          author={author}
          isOwner={isOwner}
          onApprove={approveDeadlineRequest}
          onReject={rejectDeadlineRequest}
          onCancel={cancelDeadlineRequest}
        />

        {(task.deadlineHistory || []).length > 0 && (
          <div style={{ marginTop: 12, padding: 10, background: TOK.bg, borderRadius: 7 }}>
            <div style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
              Deadline history ({(task.deadlineHistory || []).length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(task.deadlineHistory || []).slice().reverse().map((dh) => (
                <div key={dh.id} style={{ fontSize: 11, color: TOK.muted }}>
                  <span style={{ color: TOK.ink }}>{fmtDate(dh.from)} → {fmtDate(dh.to)}</span>
                  <span style={{ marginLeft: 6 }}>by {dh.changedBy} · {fmtDateTime(dh.changedAt)}</span>
                  {dh.reason && <span style={{ marginLeft: 6, fontStyle: 'italic' }}>“{dh.reason}”</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── References (wiki links): collapsible section between meta info and tabs ─── */}
        <ReferencesSection task={task} onUpdate={onUpdate} author={author} />

        {/* ─── Meeting Hub: Updates / Decisions / Actions tabs ─── */}
        <div style={{ marginTop: 20, borderTop: '1px solid ' + TOK.line, paddingTop: 14 }}>
          <div style={{ display: 'flex', gap: 2, padding: 2, background: TOK.bg, borderRadius: 8, marginBottom: 12 }}>
            {[
              { id: 'updates', label: 'Updates', icon: <MessageSquare size={11} />, count: ((task.updates || []).length) + ((task.checkIns || []).length) },
              { id: 'decisions', label: 'Decisions', icon: <CheckCircle2 size={11} />, count: linkedDecisions.length },
              { id: 'actions', label: 'Actions', icon: <Activity size={11} />, count: linkedActions.length },
            ].map((t) => (
              <button key={t.id} onClick={() => setPanelTab(t.id)} style={{
                flex: 1, fontFamily: FONT_STACK, fontSize: 11.5, fontWeight: 500, padding: '6px 8px', borderRadius: 6,
                border: 'none', background: panelTab === t.id ? TOK.surface : 'transparent', color: TOK.ink, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                boxShadow: panelTab === t.id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}>
                {t.icon}{t.label}
                {t.count > 0 && <span style={{
                  fontSize: 10, color: panelTab === t.id ? TOK.accent : TOK.muted, fontWeight: 500,
                  background: panelTab === t.id ? TOK.healthGreenBg : 'transparent',
                  padding: '0 5px', borderRadius: 999, minWidth: 16, textAlign: 'center',
                }}>{t.count}</span>}
              </button>
            ))}
          </div>

          {/* Updates tab */}
          {panelTab === 'updates' && (
            <>
              <UpdateForm onSubmit={addUpdate} author={author} teamMembers={teamMembers} />
              <div style={{ marginTop: 12 }}>
                <UpdatesFeed task={task} teamMembers={teamMembers} onResolveBlocker={resolveBlocker} />
              </div>
            </>
          )}

          {/* Decisions tab — linked to this milestone */}
          {panelTab === 'decisions' && (
            <>
              {/* Wave 2 R5: v2 create needs a PM / Deputy / Sub-PM role somewhere (empty decision = "new"). */}
              {!showDecisionForm && canEditDecision({ isOwner, isV2, roles: v2Roles, uid: me.uid, decision: {} }) && (
                <Btn size="sm" variant="primary" onClick={() => { setEditingDecision(null); setShowDecisionForm(true); }}>
                  <Plus size={11} /> Add decision
                </Btn>
              )}
              {showDecisionForm && (
                <div style={{ marginBottom: 12 }}>
                  <DecisionForm
                    initial={editingDecision}
                    project={project}
                    teamMembers={teamMembers}
                    author={author}
                    defaultRelatedTaskId={taskId}
                    onSave={saveDecision}
                    onCancel={() => { setShowDecisionForm(false); setEditingDecision(null); }}
                  />
                </div>
              )}
              <div style={{ marginTop: showDecisionForm ? 0 : 12 }}>
                {linkedDecisions.length === 0 && !showDecisionForm && (
                  <div style={{ fontSize: 12, color: TOK.subtle, padding: '20px 0', textAlign: 'center' }}>
                    No decisions linked to this milestone yet.
                  </div>
                )}
                {linkedDecisions.map((d) => (
                  <DecisionRowCompact key={d.id} decision={d} teamMembers={teamMembers}
                    onEdit={canEditDecision({ isOwner, isV2, roles: v2Roles, uid: me.uid, decision: d }) ? editDecision : null}
                    onDelete={canDeleteRaidOrDecision({ isOwner, isV2 }) ? removeDecision : null} />
                ))}
              </div>
            </>
          )}

          {/* Actions tab — linked to this milestone */}
          {panelTab === 'actions' && (
            <>
              {!showActionForm && (
                <Btn size="sm" variant="primary" onClick={() => { setEditingAction(null); setShowActionForm(true); }}>
                  <Plus size={11} /> Add action
                </Btn>
              )}
              {showActionForm && (
                <div style={{ marginBottom: 12 }}>
                  <ActionItemForm
                    initial={editingAction}
                    project={project}
                    teamMembers={teamMembers}
                    author={author}
                    defaultRelatedTaskId={taskId}
                    onSave={saveAction}
                    onCancel={() => { setShowActionForm(false); setEditingAction(null); }}
                  />
                </div>
              )}
              <div style={{ marginTop: showActionForm ? 0 : 12 }}>
                {linkedActions.length === 0 && !showActionForm && (
                  <div style={{ fontSize: 12, color: TOK.subtle, padding: '20px 0', textAlign: 'center' }}>
                    No actions linked to this milestone yet.
                  </div>
                )}
                {linkedActions.map((a) => (
                  <ActionRowCompact key={a.id} action={a} teamMembers={teamMembers}
                    onEdit={editAction} onDelete={removeAction} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* v30 RAID Phase 3 — Program RAID signal */}
        {program && onNavigateRaid && (
          <TaskProgramRaidSignal program={program} onNavigateRaid={onNavigateRaid} />
        )}
      </div>
      {showDeadlineRequest && (
        <DeadlineRequestDialog
          task={task}
          currentEnd={task.end}
          author={author}
          uid={project.__v2 ? me.uid : null}
          onClose={() => setShowDeadlineRequest(false)}
          onSubmit={submitDeadlineRequest}
        />
      )}
    </div>
  );
}
function Row({ k, v, multiline }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 8, padding: '5px 0', borderTop: '1px solid ' + TOK.line, fontSize: 12 }}>
      <span style={{ color: TOK.muted }}>{k}</span>
      <span style={{ color: TOK.ink, wordBreak: 'break-word', whiteSpace: multiline ? 'pre-wrap' : 'normal' }}>{v}</span>
    </div>
  );
}

/* ═════════ DECISIONS ═════════ */
const FOLLOWUP_STATUSES = ['Open', 'InProgress', 'Done'];
const FOLLOWUP_LABEL = { Open: 'Open', InProgress: 'In progress', Done: 'Done' };

function followupColor(s) {
  if (s === 'Done') return { fg: TOK.doneFg, bg: TOK.doneBg };
  if (s === 'InProgress') return { fg: TOK.inprogFg, bg: TOK.inprogBg };
  return { fg: TOK.plannedFg, bg: TOK.plannedBg };
}

// Find which task(s) a decision is linked to. Returns [{ task, program, workstream }, ...]
function findRelatedTasks(project, ids) {
  if (!ids || !ids.length) return [];
  const out = [];
  for (const id of ids) {
    const loc = findTaskInProject(project, id);
    if (loc) out.push(loc);
  }
  return out;
}

// Build a list of all tasks across the project as { id, label } for select dropdowns
function projectTaskOptions(project) {
  const out = [];
  for (const pg of project.programs || []) {
    for (const ws of pg.workstreams || []) {
      for (const t of ws.tasks || []) {
        out.push({ id: t.id, label: `${pg.name} › ${ws.name} › ${t.name}` });
      }
    }
  }
  return out;
}

/* ═════════ DECIDED-BY PICKER (multi-select members + @-mention) ═════════ */
// Chip + autocomplete dropdown. Source: teamMembers ONLY.
// Existing values not in teamMembers are shown as legacy ⚠ chips for cleanup.
function DecidedByPicker({ value, onChange, teamMembers }) {
  const dirIndex = useContext(DirectoryIndexContext);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const list = Array.isArray(value) ? value : [];
  const memberNames = useMemo(() => new Set((teamMembers || []).map((m) => m.name)), [teamMembers]);

  const filtered = useMemo(() => {
    const q = (draft || '').trim().replace(/^@+/, '').toLowerCase();
    return (teamMembers || [])
      .filter((m) => !list.includes(m.name))
      .filter((m) => !q || m.name.toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [teamMembers, draft, list]);

  const add = (name) => {
    const trimmed = (name || '').trim().replace(/^@+/, '');
    if (!trimmed) return;
    const resolved = resolvePicValue(trimmed, teamMembers, dirIndex);
    if (list.includes(resolved)) return;
    onChange([...list, resolved]);
    setDraft('');
    setAdding(false);
  };
  const remove = (name) => onChange(list.filter((n) => n !== name));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <FieldLabel>Decided by * <span style={{ color: TOK.subtle, fontWeight: 400 }}>(individuals — team members)</span></FieldLabel>
        {list.length >= 1 && (
          <button onClick={() => onChange([])} style={{
            fontFamily: FONT_STACK, fontSize: 11, padding: '2px 8px',
            border: '1px solid ' + TOK.lineStrong, borderRadius: 999,
            background: 'transparent', cursor: 'pointer', color: TOK.muted,
            display: 'inline-flex', alignItems: 'center', gap: 3,
          }} title="Clear all">
            <X size={10} /> Clear all ({list.length})
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', minHeight: 28 }}>
        {list.map((n) => {
          const known = memberNames.has(n) || !!findMember(teamMembers, n, dirIndex);
          const member = findMember(teamMembers, n, dirIndex);
          return (
            <span key={n} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: known ? TOK.healthGreenBg : '#FAEEDA',
              border: '1px solid ' + (known ? TOK.accent : '#E0BC75'),
              borderRadius: 999,
              padding: '3px 4px 3px 10px', fontSize: 12,
              color: known ? TOK.accent : TOK.ink,
            }} title={!known ? 'Legacy value — not a current team member. Click ✕ to remove.' : (member?.email || '')}>
              {!known && <span style={{ fontSize: 10, color: '#A8660C' }}>⚠</span>}
              {n}
              <button onClick={() => remove(n)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 2, display: 'flex' }}
                title="Remove">
                <X size={11} />
              </button>
            </span>
          );
        })}
        {!adding && (
          <button onClick={() => setAdding(true)} style={{
            fontFamily: FONT_STACK, fontSize: 12, padding: '4px 10px',
            border: '1px dashed ' + TOK.lineStrong, borderRadius: 999,
            background: 'transparent', cursor: 'pointer', color: TOK.muted,
            display: 'inline-flex', alignItems: 'center', gap: 3,
          }}>
            <Plus size={11} /> Add decider
          </button>
        )}
      </div>
      {adding && (
        <div style={{ marginTop: 6, position: 'relative' }}>
          <Input
            value={draft}
            onChange={setDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filtered[0]) { e.preventDefault(); add(filtered[0].name); }
              else if (e.key === 'Enter' && draft.trim()) { e.preventDefault(); add(draft); }
              else if (e.key === 'Escape') { e.preventDefault(); setDraft(''); setAdding(false); }
            }}
            placeholder="Type @ or name (e.g., @tr → trangvk@…)"
            autoFocus
          />
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0,
            background: TOK.surface, border: '1px solid ' + TOK.lineStrong, borderRadius: 6,
            marginTop: 2, maxHeight: 340, overflowY: 'auto', zIndex: 50,
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}>
            {filtered.map((m) => (
              <button key={m.name} onClick={() => add(m.name)}
                style={{
                  width: '100%', textAlign: 'left', padding: '7px 10px',
                  fontFamily: FONT_STACK, fontSize: 12, border: 'none',
                  background: 'transparent', cursor: 'pointer', color: TOK.ink,
                  borderBottom: '1px solid ' + TOK.line,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = TOK.bg}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                <span>{m.name}</span>
                {m.email && <span style={{ color: TOK.muted, fontSize: 11 }}>{m.email}</span>}
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '8px 10px', fontSize: 11, color: TOK.subtle }}>
                No matching team members. Add members in Project Settings.
              </div>
            )}
            {draft.trim() && !(teamMembers || []).some((m) => m.name.toLowerCase() === draft.trim().replace(/^@+/, '').toLowerCase()) && (
              <button onClick={() => add(draft)}
                style={{
                  width: '100%', textAlign: 'left', padding: '7px 10px',
                  fontFamily: FONT_STACK, fontSize: 12, border: 'none',
                  background: 'transparent', cursor: 'pointer', color: '#A8660C',
                  borderTop: filtered.length > 0 ? '1px solid ' + TOK.line : 'none',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = TOK.bg}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                ⚠ Use "{draft.trim().replace(/^@+/, '')}" as free text (not in team members)
              </button>
            )}
            <button onClick={() => { setDraft(''); setAdding(false); }}
              style={{
                width: '100%', textAlign: 'left', padding: '6px 10px',
                fontFamily: FONT_STACK, fontSize: 11, border: 'none',
                background: TOK.bg, cursor: 'pointer', color: TOK.muted,
                borderTop: '1px solid ' + TOK.line,
              }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DecisionForm({ initial, project, teamMembers, author, defaultRelatedTaskId, onSave, onCancel }) {
  const [text, setText] = useState(initial?.text || '');
  const [date, setDate] = useState(initial?.date || toISODate(new Date()));
  const [decidedBy, setDecidedBy] = useState(initial?.decidedBy || []);
  const [context, setContext] = useState(initial?.context || '');
  const [relatedTaskIds, setRelatedTaskIds] = useState(initial?.relatedTaskIds || (defaultRelatedTaskId ? [defaultRelatedTaskId] : []));
  const [followUpStatus, setFollowUpStatus] = useState(initial?.followUpStatus || 'Open');
  const [meetingRef, setMeetingRef] = useState(initial?.meetingRef || '');
  const [expectedReviewDate, setExpectedReviewDate] = useState(
    initial?.expectedReviewDate || addDays(initial?.date || toISODate(new Date()), DECISION_REVIEW_DAYS)
  );
  const [reviewDateManual, setReviewDateManual] = useState(!!initial?.expectedReviewDate);
  useEffect(() => {
    if (!reviewDateManual) {
      setExpectedReviewDate(addDays(date, DECISION_REVIEW_DAYS));
    }
  }, [date, reviewDateManual]);

  const taskOptions = useMemo(() => projectTaskOptions(project), [project]);


  const toggleRelatedTask = (id) => {
    setRelatedTaskIds(relatedTaskIds.includes(id) ? relatedTaskIds.filter((x) => x !== id) : [...relatedTaskIds, id]);
  };

  const canSave = text.trim() && decidedBy.length > 0;

  const submit = () => {
    onSave({
      id: initial?.id || uid('dec'),
      timestamp: initial?.timestamp || new Date().toISOString(),
      text: text.trim(),
      date,
      decidedBy,
      context: context.trim(),
      relatedTaskIds,
      followUpStatus,
      meetingRef: meetingRef.trim(),
      expectedReviewDate,
      author: initial?.author || author,
    });
  };

  return (
    <div style={{ background: TOK.bg, border: '1px solid ' + TOK.line, borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>{initial ? 'Edit decision' : 'New decision'}</div>

      <FieldLabel>Decision *</FieldLabel>
      <Textarea value={text} onChange={setText} placeholder="What was decided? (1-3 sentences)" rows={2} />

      <div style={{ height: 12 }} />
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <FieldLabel>Date</FieldLabel>
          <Input type="date" value={date} onChange={setDate} />
        </div>
        <div style={{ flex: 1 }}>
          <FieldLabel>Follow-up status</FieldLabel>
          <select value={followUpStatus} onChange={(e) => setFollowUpStatus(e.target.value)}
            style={{ width: '100%', fontFamily: FONT_STACK, fontSize: 13, padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, background: TOK.surface, color: TOK.ink }}>
            {FOLLOWUP_STATUSES.map((s) => <option key={s} value={s}>{FOLLOWUP_LABEL[s]}</option>)}
          </select>
        </div>
      </div>

      <div style={{ height: 12 }} />
      <FieldLabel>Review by date</FieldLabel>
      <Input type="date" value={expectedReviewDate || ''} onChange={(v) => { setExpectedReviewDate(v); setReviewDateManual(true); }} />
      <div style={{ marginTop: 4, fontSize: 11, color: TOK.subtle }}>
        Auto-set to {DECISION_REVIEW_DAYS} days after decision date. Edit to override.
      </div>

      <div style={{ height: 12 }} />
      <DecidedByPicker
        value={decidedBy}
        onChange={setDecidedBy}
        teamMembers={teamMembers || []}
      />
      <div style={{ fontSize: 11, color: TOK.subtle, marginTop: 4, lineHeight: 1.5 }}>
        Decision-makers are individual team members (with email). Type <kbd style={{ background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 3, padding: '0 4px', fontSize: 10 }}>@</kbd> or name to search. Groups (departments) belong to <strong>Contributors</strong> on tasks, not here.
      </div>

      <div style={{ height: 12 }} />
      <FieldLabel>Context / rationale (optional)</FieldLabel>
      <Textarea value={context} onChange={setContext} placeholder="Why this decision? Background, alternatives considered…" rows={2} />

      <div style={{ height: 12 }} />
      <FieldLabel>Related milestones (optional)</FieldLabel>
      <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid ' + TOK.line, borderRadius: 6, background: TOK.surface }}>
        {taskOptions.length === 0 && <div style={{ padding: 10, fontSize: 11, color: TOK.subtle }}>No milestones in this project yet.</div>}
        {taskOptions.map((t) => {
          const active = relatedTaskIds.includes(t.id);
          return (
            <label key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>
              <input type="checkbox" checked={active} onChange={() => toggleRelatedTask(t.id)} style={{ accentColor: TOK.accent }} />
              <span>{t.label}</span>
            </label>
          );
        })}
      </div>

      <div style={{ height: 12 }} />
      <FieldLabel>Meeting reference (optional)</FieldLabel>
      <Input value={meetingRef} onChange={setMeetingRef} placeholder="e.g., BOD weekly 2026-04-29" />

      <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn variant="primary" disabled={!canSave} onClick={submit}>{initial ? 'Save' : 'Create decision'}</Btn>
      </div>
    </div>
  );
}

// Compact decision row used inside the milestone panel (tighter layout)
function DecisionRowCompact({ decision, onEdit, onDelete, teamMembers }) {
  const fc = followupColor(decision.followUpStatus);
  return (
    <div style={{
      background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 8,
      padding: '8px 10px', marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.4, flex: 1 }}>
          <MentionedText text={decision.text} teamMembers={teamMembers} />
        </span>
        <span style={{
          fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 999,
          color: fc.fg, background: fc.bg, whiteSpace: 'nowrap', height: 'fit-content',
        }}>{FOLLOWUP_LABEL[decision.followUpStatus]}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, fontSize: 10.5, color: TOK.muted, flexWrap: 'wrap', alignItems: 'center' }}>
        <span>📅 {fmtDateShort(decision.date)}</span>
        <span>👥 {(decision.decidedBy || []).join(', ') || '—'}</span>
        {decision.meetingRef && <span style={{ background: TOK.bg, padding: '0 5px', borderRadius: 3, fontSize: 10 }}>{decision.meetingRef}</span>}
        <div style={{ flex: 1 }} />
        {onEdit && (
          <button onClick={() => onEdit(decision)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 2, display: 'flex' }}>
            <Edit2 size={11} />
          </button>
        )}
        {onDelete && (
          <button onClick={() => onDelete(decision)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 2, display: 'flex' }}>
            <Trash2 size={11} />
          </button>
        )}
      </div>
      {decision.context && (
        <div style={{ fontSize: 11.5, color: TOK.muted, lineHeight: 1.5, paddingTop: 2 }}>
          <MentionedText text={decision.context} teamMembers={teamMembers} />
        </div>
      )}
    </div>
  );
}

// Compact action row used inside the milestone panel
function ActionRowCompact({ action, onEdit, onDelete, teamMembers }) {
  const sc = actionStatusColor(action.status);
  const pc = priorityColor(action.priority);
  const overdue = action.dueDate && action.status !== 'Done' && action.status !== 'Cancelled' && parseDate(action.dueDate) < today();
  return (
    <div style={{
      background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 8,
      padding: '8px 10px', marginBottom: 6,
    }}>
      <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 4 }}>
        <MentionedText text={action.title} teamMembers={teamMembers} />
      </div>
      {action.description && (
        <div style={{ fontSize: 11.5, color: TOK.muted, lineHeight: 1.45, marginBottom: 6 }}>
          {action.description}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 10.5, color: TOK.muted }}>
        <span>👤 <strong>{action.pic || '—'}</strong></span>
        {action.dueDate && <span style={{ color: overdue ? TOK.overdueFg : TOK.muted }}>📅 {fmtDateShort(action.dueDate)}</span>}
        <span style={{
          fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 999,
          color: pc.fg, background: pc.bg,
        }}>{action.priority}</span>
        <span style={{
          fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 999,
          color: sc.fg, background: sc.bg,
        }}>{action.status}</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => onEdit(action)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 2, display: 'flex' }}>
          <Edit2 size={11} />
        </button>
        <button onClick={() => onDelete(action)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 2, display: 'flex' }}>
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}

function DecisionEntry({ decision, project, onEdit, onDelete, teamMembers }) {
  const [expanded, setExpanded] = useState(false);
  const related = findRelatedTasks(project, decision.relatedTaskIds);
  const fc = followupColor(decision.followUpStatus);
  const decay = getDecisionDecay(decision);
  return (
    <div style={{
      background: TOK.surface,
      border: '1px solid ' + (decay.decayed ? '#E0A03C' : TOK.line),
      borderRadius: 10, marginBottom: 8,
      boxShadow: decay.decayed ? '0 0 0 1px #FAEEDA' : 'none',
    }}>
      <div style={{ padding: '12px 14px', cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4 }}>
            <MentionedText text={decision.text} teamMembers={teamMembers} />
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            {decay.decayed && (
              <span title={`Review overdue by ${decay.daysOverdue} day${decay.daysOverdue === 1 ? '' : 's'}`}
                style={{
                  fontSize: 10.5, fontWeight: 500, padding: '2px 8px', borderRadius: 999,
                  color: '#A8660C', background: '#FAEEDA', whiteSpace: 'nowrap',
                }}>🕐 Review overdue {decay.daysOverdue}d</span>
            )}
            <span style={{
              fontSize: 10.5, fontWeight: 500, padding: '2px 8px', borderRadius: 999,
              color: fc.fg, background: fc.bg, whiteSpace: 'nowrap', height: 'fit-content',
            }}>{FOLLOWUP_LABEL[decision.followUpStatus]}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: TOK.muted, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>📅 {fmtDate(decision.date)}</span>
          <span>👥 {(decision.decidedBy || []).join(', ') || '—'}</span>
          {related.length > 0 && <span>🎯 {related.length} milestone{related.length === 1 ? '' : 's'}</span>}
          {decision.meetingRef && <span style={{ background: TOK.bg, padding: '1px 6px', borderRadius: 4 }}>{decision.meetingRef}</span>}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: TOK.subtle }}>by {decision.author}</span>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '0 14px 12px', borderTop: '1px solid ' + TOK.line, paddingTop: 12 }}>
          {decision.context && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: TOK.muted, marginBottom: 4, fontWeight: 500 }}>CONTEXT</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.55 }}><MentionedText text={decision.context} teamMembers={teamMembers} /></div>
            </div>
          )}
          {related.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: TOK.muted, marginBottom: 4, fontWeight: 500 }}>RELATED MILESTONES</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                {related.map(({ task, program, workstream }) => (
                  <li key={task.id}>{program.name} › {workstream.name} › <strong>{task.name}</strong></li>
                ))}
              </ul>
            </div>
          )}
          {(onEdit || onDelete) && (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 8 }}>
              {onEdit && <Btn size="sm" variant="ghost" onClick={() => onEdit(decision)}><Edit2 size={11} /> Edit</Btn>}
              {onDelete && <Btn size="sm" variant="ghost" onClick={() => onDelete(decision)}><Trash2 size={11} /> Delete</Btn>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DecisionsView({ project, onProjectUpdate, teamMembers, author, dialogs, onActivity, initialEditId, isOwner = false, uid = null }) {
  const [showForm, setShowForm] = useState(false);
  // Wave 2 R5: v2 edit only within one's program (stored claim); delete Owner-only. v1 unchanged.
  const isV2 = !!project.__v2;
  const roles = project.__v2?.roles || null;
  const canEdit = (d) => canEditDecision({ isOwner, isV2, roles, uid, decision: d });
  const canDelete = canDeleteRaidOrDecision({ isOwner, isV2 });
  // An empty decision is "not saved yet": any PM / Deputy / Sub-PM role (rules create).
  const canCreate = canEdit({});
  const [editing, setEditing] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all'); // all | Open | InProgress | Done
  const [filterTaskId, setFilterTaskId] = useState('all'); // all | <taskId>
  const [query, setQuery] = useState('');

  // v30.A.2 — Auto-open Edit form when navigated with initialEditId
  // (e.g., from My Work "→ Open"). Scroll the form into view.
  useEffect(() => {
    if (!initialEditId) return;
    const target = (project.decisions || []).find((d) => d.id === initialEditId);
    if (!target) return;
    setEditing(target);
    setShowForm(true);
    setTimeout(() => {
      const el = document.querySelector('[data-decision-form]');
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, [initialEditId, project.decisions]);

  const decisions = project.decisions || [];

  const taskOptions = useMemo(() => projectTaskOptions(project), [project]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return decisions
      .filter((d) => filterStatus === 'all' || d.followUpStatus === filterStatus)
      .filter((d) => filterTaskId === 'all' || (d.relatedTaskIds || []).includes(filterTaskId))
      .filter((d) => !q || (d.text || '').toLowerCase().includes(q) || (d.context || '').toLowerCase().includes(q) || (d.decidedBy || []).some((p) => p.toLowerCase().includes(q)))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [decisions, filterStatus, filterTaskId, query]);

  const saveDecision = (d) => {
    const next = editing
      ? decisions.map((x) => x.id === d.id ? d : x)
      : [d, ...decisions];
    onProjectUpdate({ ...project, decisions: next });
    onActivity({ type: editing ? 'decision_edit' : 'decision_create', description: `${editing ? 'Updated' : 'Logged'} decision: "${d.text.slice(0, 60)}${d.text.length > 60 ? '…' : ''}"` });
    setShowForm(false);
    setEditing(null);
  };

  const startEdit = (d) => {
    setEditing(d);
    setShowForm(true);
  };

  const removeDecision = async (d) => {
    const ok = await dialogs.confirm({ title: 'Delete decision?', message: `Delete this decision permanently? This cannot be undone.`, danger: true, okLabel: 'Delete' });
    if (!ok) return;
    onProjectUpdate({ ...project, decisions: decisions.filter((x) => x.id !== d.id) });
    onActivity({ type: 'decision_delete', description: `Deleted decision: "${d.text.slice(0, 60)}${d.text.length > 60 ? '…' : ''}"` });
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 20, fontFamily: FONT_STACK, background: TOK.bg }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Decisions</h2>
            <div style={{ fontSize: 12, color: TOK.muted, marginTop: 2 }}>
              {decisions.length} total · {filtered.length} matching filters
            </div>
          </div>
          {canCreate && <Btn variant="primary" onClick={() => { setEditing(null); setShowForm(true); }}><Plus size={12} /> New decision</Btn>}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input value={query} onChange={setQuery} placeholder="Search decisions…" style={{ flex: 1, maxWidth: 280 }} />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            style={{ fontFamily: FONT_STACK, fontSize: 12, padding: '6px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface }}>
            <option value="all">All statuses</option>
            {FOLLOWUP_STATUSES.map((s) => <option key={s} value={s}>{FOLLOWUP_LABEL[s]}</option>)}
          </select>
          <select value={filterTaskId} onChange={(e) => setFilterTaskId(e.target.value)}
            style={{ fontFamily: FONT_STACK, fontSize: 12, padding: '6px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface, maxWidth: 280 }}>
            <option value="all">All milestones</option>
            {taskOptions.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>

        {showForm && (!editing || canEdit(editing)) && (
          <div data-decision-form style={{ marginBottom: 14 }}>
            <DecisionForm
              key={editing?.id || 'new'}
              initial={editing}
              project={project}
              teamMembers={teamMembers}
              author={author}
              onSave={saveDecision}
              onCancel={() => { setShowForm(false); setEditing(null); }}
            />
          </div>
        )}

        {filtered.length === 0 && !showForm && (
          <div style={{ padding: 40, textAlign: 'center', color: TOK.subtle, fontSize: 13, background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 10 }}>
            {decisions.length === 0 ? (
              canCreate
                ? <>No decisions logged yet. <button onClick={() => setShowForm(true)} style={{ background: 'none', border: 'none', color: TOK.accent, cursor: 'pointer', fontSize: 13 }}>Log your first decision</button></>
                : 'No decisions logged yet.'
            ) : (
              'No decisions match the current filters.'
            )}
          </div>
        )}

        {filtered.map((d) => (
          <DecisionEntry key={d.id} decision={d} project={project} teamMembers={teamMembers}
            onEdit={canEdit(d) ? startEdit : null}
            onDelete={canDelete ? removeDecision : null} />
        ))}
      </div>
    </div>
  );
}

/* ═════════ ACTION ITEMS ═════════ */
const ACTION_STATUSES = ['Pending', 'Pushed to OP', 'InProgress', 'Done', 'Cancelled'];
const MITIGATION_STATUSES = ['Open', 'Blocked', 'Done'];
const PRIORITIES = ['High', 'Medium', 'Low'];

function priorityColor(p) {
  if (p === 'High') return { fg: TOK.overdueFg, bg: TOK.overdueBg };
  if (p === 'Low') return { fg: TOK.muted, bg: TOK.bg };
  return { fg: TOK.inprogFg, bg: TOK.inprogBg };
}
function actionStatusColor(s) {
  if (s === 'Done') return { fg: TOK.doneFg, bg: TOK.doneBg };
  if (s === 'Cancelled') return { fg: TOK.muted, bg: TOK.bg };
  if (s === 'Pushed to OP') return { fg: TOK.programFg, bg: TOK.programBg };
  if (s === 'InProgress') return { fg: TOK.inprogFg, bg: TOK.inprogBg };
  return { fg: TOK.plannedFg, bg: TOK.plannedBg };
}

function ActionItemForm({ initial, project, teamMembers, author, defaultRelatedTaskId, onSave, onCancel, onAddComment, onSubtasksChange }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [pic, setPic] = useState(initial?.pic || '');
  const [dueDate, setDueDate] = useState(initial?.dueDate || '');
  const [priority, setPriority] = useState(initial?.priority || 'Medium');
  const [relatedTaskId, setRelatedTaskId] = useState(initial?.relatedTaskId || defaultRelatedTaskId || '');
  const [status, setStatus] = useState(initial?.status || 'Pending');
  // v30 — Notify-chat-on-create. Only meaningful when creating (not editing)
  // and the project has a Chat webhook configured. Default state remembers
  // the user's last choice per project via the 'NewAction' pref suffix.
  const isCreate = !initial;
  const chatWebhook = project?.googleChatWebhook || null;
  const showNotify = isCreate && !!chatWebhook;
  const [notifyChat, setNotifyChat] = useState(() => showNotify ? getNotifyPref(project.id, 'NewAction') : false);
  // v30.A.1 — comment thread state (Edit mode only)
  const [commentDraft, setCommentDraft] = useState('');
  const [commentIsBlocker, setCommentIsBlocker] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  // v30.B — picSuggestions for SubtaskEditor PIC dropdown
  const derivedPicSuggestions = useMemo(() => {
    const set = new Set();
    for (const m of (teamMembers || [])) if (m?.name) set.add(m.name);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [teamMembers]);

  const taskOptions = useMemo(() => projectTaskOptions(project), [project]);

  const canSave = title.trim() && pic.trim();

  const submit = () => {
    // Merge onto the current stored action (fresh from project, else the snapshot) so
    // fields the form does not edit (updates, subtasks, completedAt…) are kept.
    const base = (initial && (project?.actionItems || []).find((x) => x.id === initial.id)) || initial || {};
    onSave({
      ...base,
      id: initial?.id || uid('act'),
      timestamp: initial?.timestamp || new Date().toISOString(),
      title: title.trim(),
      description: description.trim(),
      pic: pic.trim(),
      dueDate: dueDate || null,
      priority,
      relatedTaskId: relatedTaskId || null,
      status,
      openProjectWpId: initial?.openProjectWpId || null,
      author: initial?.author || author,
    }, { notifyChat: showNotify && notifyChat });
  };

  return (
    <div style={{ background: TOK.bg, border: '1px solid ' + TOK.line, borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>{initial ? 'Edit action item' : 'New action item'}</div>

      <FieldLabel>Action *</FieldLabel>
      <Input value={title} onChange={setTitle} placeholder="e.g., Setup HIO bank account" />

      <div style={{ height: 12 }} />
      <FieldLabel>Description (optional)</FieldLabel>
      <Textarea value={description} onChange={setDescription} placeholder="More detail about what needs to happen…" rows={2} />

      <div style={{ height: 12 }} />
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <FieldLabel>PIC / Assignee * <span style={{ color: TOK.subtle, fontWeight: 400 }}>(team member with email)</span></FieldLabel>
          <PicEditor
            value={pic}
            onChange={(v) => setPic(v || '')}
            teamMembersList={teamMembers || []}
            project={project}
          />
        </div>
        <div style={{ flex: 1 }}>
          <FieldLabel>Priority</FieldLabel>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}
            style={{ width: '100%', fontFamily: FONT_STACK, fontSize: 13, padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, background: TOK.surface, color: TOK.ink }}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div style={{ height: 12 }} />
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <FieldLabel>Due date</FieldLabel>
          <Input type="date" value={dueDate} onChange={setDueDate} />
        </div>
        <div style={{ flex: 1 }}>
          <FieldLabel>Status</FieldLabel>
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            style={{ width: '100%', fontFamily: FONT_STACK, fontSize: 13, padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, background: TOK.surface, color: TOK.ink }}>
            {ACTION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div style={{ height: 12 }} />
      <FieldLabel>Related milestone (optional)</FieldLabel>
      <select value={relatedTaskId || ''} onChange={(e) => setRelatedTaskId(e.target.value)}
        style={{ width: '100%', fontFamily: FONT_STACK, fontSize: 13, padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, background: TOK.surface, color: TOK.ink }}>
        <option value="">— None —</option>
        {taskOptions.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>

      {/* v30.A.1 — Comment thread (Edit mode only; new actions have no comments yet) */}
      {initial && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid ' + TOK.line }}>
          <div style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, marginBottom: 8 }}>
            💬 Comments ({(initial.updates || []).length})
          </div>
          {(initial.updates || []).slice(0, showAllComments ? Infinity : 3).map((u) => (
            <div key={u.id} style={{ fontSize: 12.5, color: TOK.ink, padding: '6px 0', borderBottom: '1px dashed ' + TOK.line }}>
              <div style={{ fontSize: 10.5, color: TOK.muted, marginBottom: 2 }}>
                <span style={{ color: TOK.ink, fontWeight: 500 }}>{u.author}</span> · {myWorkTimeAgo(u.timestamp)}
                {u.isBlocker && <span style={{ marginLeft: 6, color: TOK.blocker, fontWeight: 500 }}>🚨 Blocker</span>}
              </div>
              <MentionedText text={u.text} teamMembers={teamMembers} />
            </div>
          ))}
          {(initial.updates || []).length > 3 && !showAllComments && (
            <button onClick={() => setShowAllComments(true)} style={{ background: 'none', border: 'none', color: TOK.accent, fontSize: 11.5, cursor: 'pointer', padding: '4px 0', fontFamily: FONT_STACK }}>
              Show all ({(initial.updates || []).length})
            </button>
          )}
          {onAddComment && (
            <div style={{ marginTop: 10 }}>
              <MentionTextarea
                value={commentDraft}
                onChange={setCommentDraft}
                rows={2}
                placeholder={`Type @ to mention. Posted as ${author || '…'}.`}
                teamMembers={teamMembers}
              />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: TOK.muted, marginTop: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={commentIsBlocker} onChange={(e) => setCommentIsBlocker(e.target.checked)} /> Mark as blocker
              </label>
              <div style={{ marginTop: 8 }}>
                <Btn size="sm" variant="primary" disabled={!commentDraft.trim()} onClick={() => {
                  onAddComment(commentDraft.trim(), commentIsBlocker);
                  setCommentDraft(''); setCommentIsBlocker(false);
                }}>Post comment</Btn>
              </div>
            </div>
          )}
        </div>
      )}

      {/* v30.B — Sub-tasks (Edit mode only; new actions get them once saved) */}
      {initial && onSubtasksChange && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid ' + TOK.line }}>
          <SubtaskEditor
            subtasks={initial.subtasks || []}
            picSuggestions={derivedPicSuggestions}
            author={author}
            onChange={onSubtasksChange}
          />
        </div>
      )}

      {showNotify && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: TOK.muted, marginTop: 14, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={notifyChat}
            onChange={(e) => {
              setNotifyChat(e.target.checked);
              setNotifyPref(project.id, e.target.checked, 'NewAction');
            }}
          /> 📢 Notify {project.name} chat
        </label>
      )}
      <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn variant="primary" disabled={!canSave} onClick={submit}>{initial ? 'Save' : 'Create action'}</Btn>
      </div>
    </div>
  );
}

// v30.B — Editor for an action's subtasks list. Reused in ActionItemForm
// (Actions tab Edit) and ActionRowInline (My Work expanded). Mutations
// fire onChange immediately, bypassing any form Save lifecycle.
function SubtaskEditor({ subtasks, picSuggestions, author, onChange }) {
  const list = subtasks || [];
  const doneCount = list.filter((s) => s.status === 'Done').length;
  const newRowRef = useRef(null);
  const focusNextRef = useRef(false);

  useEffect(() => {
    if (focusNextRef.current && newRowRef.current) {
      newRowRef.current.focus();
      focusNextRef.current = false;
    }
  }, [list.length]);

  const update = (idx, patch) => {
    onChange(list.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };
  const remove = (idx) => {
    const target = list[idx];
    if (!window.confirm(`Remove sub-task "${target.title || '(empty)'}"?`)) return;
    onChange(list.filter((_, i) => i !== idx));
  };
  const add = () => {
    focusNextRef.current = true;
    onChange([...list, { id: uid('sub'), title: '', pic: author || '', status: 'Pending' }]);
  };
  const toggleStatus = (idx) => {
    const target = list[idx];
    update(idx, { status: target.status === 'Done' ? 'Pending' : 'Done' });
  };

  return (
    <div>
      <div style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, marginBottom: 8 }}>
        ✓ Sub-tasks ({doneCount}/{list.length} done)
      </div>
      {list.map((s, idx) => (
        <SubtaskEditorRow
          key={s.id}
          subtask={s}
          picSuggestions={picSuggestions}
          inputRefAttach={idx === list.length - 1 ? newRowRef : null}
          onUpdate={(patch) => update(idx, patch)}
          onToggleStatus={() => toggleStatus(idx)}
          onRemove={() => remove(idx)}
        />
      ))}
      <Btn size="sm" onClick={add}><Plus size={11} /> Add sub-task</Btn>
    </div>
  );
}

// Inner row — title input commits on blur/Enter to avoid spamming
// subtask_rename activity entries during typing.
function SubtaskEditorRow({ subtask, picSuggestions, inputRefAttach, onUpdate, onToggleStatus, onRemove }) {
  const dirIndex = useContext(DirectoryIndexContext);
  const [titleDraft, setTitleDraft] = useState(subtask.title || '');
  useEffect(() => { setTitleDraft(subtask.title || ''); }, [subtask.title]);
  const commitTitle = () => {
    if (titleDraft !== subtask.title) onUpdate({ title: titleDraft });
  };
  const done = subtask.status === 'Done';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px dashed ' + TOK.line }}>
      <button
        type="button"
        onClick={onToggleStatus}
        title={done ? 'Mark pending' : 'Mark done'}
        style={{
          border: 'none', background: 'transparent', cursor: 'pointer',
          color: done ? TOK.doneFg : TOK.subtle, fontSize: 13, padding: '4px 6px',
        }}>
        {done ? '✓' : '▢'}
      </button>
      <input
        ref={inputRefAttach}
        value={titleDraft}
        onChange={(e) => setTitleDraft(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
        placeholder="Sub-task title"
        style={{
          flex: 1, minWidth: 0, fontFamily: FONT_STACK, fontSize: 12,
          padding: '4px 6px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6,
          background: TOK.surface, color: TOK.ink, outline: 'none',
          textDecoration: done ? 'line-through' : 'none',
          opacity: done ? 0.65 : 1,
        }}
      />
      <select
        value={subtask.pic || ''}
        onChange={(e) => onUpdate({ pic: dirIndex ? resolvePicValue(e.target.value, null, dirIndex) : e.target.value })}
        style={{ fontFamily: FONT_STACK, fontSize: 11.5, padding: '3px 6px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface, color: TOK.ink, minWidth: 110 }}>
        <option value="">(unassigned)</option>
        {(picSuggestions || []).map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <button
        type="button"
        onClick={onRemove}
        title="Remove sub-task"
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: TOK.muted, padding: '4px 6px', fontSize: 13 }}>
        🗑
      </button>
    </div>
  );
}

// v30.A.1 — Modal wrapper for creating an action from My Work. Adds a
// project picker step (hidden when only one project exists) and forwards
// optional defaults (relatedTaskId, PIC = author) into ActionItemForm.
function ActionCreateModal({ projects, defaultProjectId, defaultRelatedTaskId, author, defaultPic, teamMembers, onClose, onCreate }) {
  const projectIds = useMemo(() => Object.keys(projects || {}).filter((id) => id !== '__all__'), [projects]);
  const [projectId, setProjectId] = useState(defaultProjectId && projects?.[defaultProjectId] ? defaultProjectId : (projectIds[0] || ''));
  const project = projects?.[projectId];
  // v30 Phase 3 — defaultPic overrides author for the form's PIC pre-fill,
  // so an action created during impersonation lands on the impersonated user.
  const effectivePic = defaultPic || author;

  return (
    <Modal title="New action item" onClose={onClose} width={520} zHigh>
      {projectIds.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <FieldLabel>Project</FieldLabel>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
            style={{ width: '100%', fontFamily: FONT_STACK, fontSize: 13, padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, background: TOK.surface, color: TOK.ink }}>
            {projectIds.map((id) => <option key={id} value={id}>{projects[id]?.name || id}</option>)}
          </select>
        </div>
      )}
      {project ? (
        <ActionItemForm
          initial={null}
          project={project}
          teamMembers={teamMembers}
          author={effectivePic}
          defaultRelatedTaskId={defaultRelatedTaskId || null}
          onSave={(newAction, opts) => {
            const finalAction = { ...newAction, pic: newAction.pic || effectivePic || '' };
            onCreate(finalAction, projectId, opts);
            onClose();
          }}
          onCancel={onClose}
        />
      ) : (
        <div style={{ color: TOK.muted, fontSize: 13 }}>No project available.</div>
      )}
    </Modal>
  );
}

function ActionItemRow({ action, project, onEdit, onDelete, onSelect, selected, showCheckbox = false, teamMembers }) {
  const sc = actionStatusColor(action.status);
  const pc = priorityColor(action.priority);
  const related = action.relatedTaskId ? findTaskInProject(project, action.relatedTaskId) : null;
  const overdue = action.dueDate && action.status !== 'Done' && action.status !== 'Cancelled' && parseDate(action.dueDate) < today();

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px',
      borderTop: '1px solid ' + TOK.line,
      background: TOK.surface,
    }}>
      {showCheckbox && (
        <input type="checkbox" checked={selected} onChange={() => onSelect(action.id)}
          style={{ accentColor: TOK.accent }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>
          <MentionedText text={action.title} teamMembers={teamMembers} />
        </div>
        <div style={{ display: 'flex', gap: 8, fontSize: 11, color: TOK.muted, flexWrap: 'wrap' }}>
          {related && <span>{related.program.name} › {related.workstream.name} › {related.task.name}</span>}
          {action.dueDate && <span style={{ color: overdue ? TOK.overdueFg : TOK.muted }}>📅 {fmtDateShort(action.dueDate)}</span>}
        </div>
      </div>
      <span style={{
        fontSize: 10.5, fontWeight: 500, padding: '2px 7px', borderRadius: 999,
        color: pc.fg, background: pc.bg,
      }}>{action.priority}</span>
      <span style={{
        fontSize: 10.5, fontWeight: 500, padding: '2px 7px', borderRadius: 999,
        color: sc.fg, background: sc.bg, whiteSpace: 'nowrap',
      }}>{action.status}</span>
      <Btn size="sm" variant="ghost" onClick={() => onEdit(action)} title="Edit"><Edit2 size={11} /></Btn>
      <Btn size="sm" variant="ghost" onClick={() => onDelete(action)} title="Delete"><Trash2 size={11} /></Btn>
    </div>
  );
}

// Build HTML email body for a single PIC's actions. Used by emailPic() —
// copied to clipboard as rich text so the user can paste a formatted email into Gmail.
function buildPicEmailHtml(picName, list, project, author) {
  const FONT = `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;`;
  const cell = `border: 1px solid #e5e3dc; padding: 8px 10px; vertical-align: top;`;
  const cellHead = `${cell} background: #f7f5ef; font-weight: 600; text-align: left;`;
  const prioStyle = (p) => {
    const map = {
      High: 'background: #fceaea; color: #a32d2d;',
      Medium: 'background: #fbf1dc; color: #b7791f;',
      Low: 'background: #e2f0de; color: #2d7a2d;',
    };
    return `display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing: 0.3px; ${map[p] || map.Medium}`;
  };

  const rows = list.map((a, i) => {
    const related = a.relatedTaskId ? findTaskInProject(project, a.relatedTaskId) : null;
    const projectPath = related
      ? `${escapeHtml(project.name)} &gt; ${escapeHtml(related.program.name)} &gt; ${escapeHtml(related.workstream.name)}`
      : '';
    return `<tr>
      <td style="${cell}">${i + 1}</td>
      <td style="${cell}">
        <strong>${escapeHtml(a.title)}</strong>
        ${a.description ? `<div style="font-size: 12px; color: #6e6c66; margin-top: 4px;">${escapeHtml(a.description)}</div>` : ''}
      </td>
      <td style="${cell} font-size: 12px; color: #6e6c66;">${projectPath || '—'}</td>
      <td style="${cell} font-size: 12px;">${a.dueDate ? escapeHtml(fmtDate(a.dueDate)) : '—'}</td>
      <td style="${cell}"><span style="${prioStyle(a.priority)}">${escapeHtml((a.priority || 'Medium').toUpperCase())}</span></td>
    </tr>`;
  }).join('');

  return `<div style="${FONT} font-size: 14px; line-height: 1.55; color: #1a1a19; max-width: 800px;">
  <p style="margin: 0 0 12px;">Hi ${escapeHtml(picName)},</p>
  <p style="margin: 0 0 12px;">Below are action items assigned to you:</p>
  <table style="border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 13px; ${FONT}">
    <thead><tr>
      <th style="${cellHead}">#</th>
      <th style="${cellHead}">Action</th>
      <th style="${cellHead}">Project</th>
      <th style="${cellHead}">Due</th>
      <th style="${cellHead}">Priority</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="margin: 16px 0 8px; font-size: 13px; color: #6e6c66;">
    <em>📎 An Excel file with these actions (OpenProject template) has been auto-downloaded. Please attach it from your Downloads folder before sending.</em>
  </p>
  <p style="margin: 16px 0 0;">
    Thanks,<br/>
    ${escapeHtml(author)}
  </p>
</div>`;
}

function ActionItemsView({ project, onProjectUpdate, teamMembers, author, dialogs, onActivity, showToast, initialEditId, onApplyAction, onNavigateRaid }) {
  const me = useContext(MeContext);
  const dirIndex = useContext(DirectoryIndexContext);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [mode, setMode] = useState('grouped'); // grouped | flat
  const [filterPic, setFilterPic] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [emailPicsDialog, setEmailPicsDialog] = useState(null); // { groups: Map<pic, items[]> } | null
  const [copyHelper, setCopyHelper] = useState(null); // { html, title, gmailUrl } | null

  // v30.C — Surface open RAID mitigations above the actions list so PMs can see
  // and act on them without leaving the Actions tab.
  const mitigations = useMemo(
    () => getProjectMitigations(project, { openOnly: true }),
    [project]
  );

  // v30.A.1 — Auto-open Edit form when navigated with initialEditId
  // (e.g., from My Work "→ Open"). Scroll the form into view.
  useEffect(() => {
    if (!initialEditId) return;
    const target = (project.actionItems || []).find((a) => a.id === initialEditId);
    if (!target) return;
    setEditing(target);
    setShowForm(true);
    setTimeout(() => {
      const el = document.querySelector('[data-action-form]');
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, [initialEditId, project.actionItems]);

  const actions = project.actionItems || [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return actions
      .filter((a) => filterPic === 'all' || a.pic === filterPic)
      .filter((a) => filterStatus === 'all' || a.status === filterStatus)
      .filter((a) => filterPriority === 'all' || a.priority === filterPriority)
      .filter((a) => !q || (a.title || '').toLowerCase().includes(q) || (a.description || '').toLowerCase().includes(q))
      .sort((a, b) => {
        // Pending first, then by priority (High > Med > Low), then by due date
        const sOrder = { Pending: 0, InProgress: 1, 'Pushed to OP': 2, Done: 3, Cancelled: 4 };
        if (sOrder[a.status] !== sOrder[b.status]) return sOrder[a.status] - sOrder[b.status];
        const pOrder = { High: 0, Medium: 1, Low: 2 };
        if (pOrder[a.priority] !== pOrder[b.priority]) return pOrder[a.priority] - pOrder[b.priority];
        if (a.dueDate && b.dueDate) return parseDate(a.dueDate) - parseDate(b.dueDate);
        return 0;
      });
  }, [actions, filterPic, filterStatus, filterPriority, query]);

  const groupedByPic = useMemo(() => {
    const g = new Map();
    for (const a of filtered) {
      const k = a.pic || '— Unassigned —';
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(a);
    }
    return Array.from(g.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const allPics = useMemo(() => {
    const s = new Set();
    for (const a of actions) if (a.pic) s.add(a.pic);
    return Array.from(s).sort();
  }, [actions]);

  const saveAction = (a, opts = {}) => {
    if (me.readOnly) { me.onReadOnly(); return; } // P3-16: no action, no Chat post in View as
    const wasEditing = !!editing;
    const next = editing ? actions.map((x) => x.id === a.id ? a : x) : [a, ...actions];
    onProjectUpdate({ ...project, actionItems: next });
    onActivity({ type: editing ? 'action_edit' : 'action_create', description: `${editing ? 'Updated' : 'Created'} action: "${a.title}" → ${a.pic}` });
    setShowForm(false);
    setEditing(null);
    // v30 — notify chat on create (opt-in). Never blocks the create.
    if (!wasEditing && opts.notifyChat && project.googleChatWebhook) {
      const related = a.relatedTaskId ? findTaskInProject(project, a.relatedTaskId) : null;
      postToChat(project.googleChatWebhook, buildNewActionCard({
        project, action: a, related, author,
      })).then((res) => {
        if (showToast) showToast(res.ok
          ? 'Action created · 📢 Sent to chat'
          : `Action created. Chat notify failed: ${res.status} ${res.statusText}`);
      });
    }
  };

  const startEdit = (a) => { setEditing(a); setShowForm(true); };

  // v30.A.1 — Post a comment immediately (bypasses form Save). Routes
  // through the shared applyActionUpdate so the diff-logger emits the
  // standard action_comment entry. Falls back to direct project update
  // if onApplyAction prop is absent (back-compat).
  const handleAddComment = (text, isBlocker) => {
    if (!editing) return;
    const newEntry = { id: uid('aupd'), timestamp: new Date().toISOString(), author, text, isBlocker: !!isBlocker };
    const updated = { ...editing, updates: [newEntry, ...(editing.updates || [])] };
    setEditing(updated);
    if (onApplyAction) {
      onApplyAction(updated, project.id, 'Actions tab');
    } else {
      onProjectUpdate({ ...project, actionItems: (project.actionItems || []).map((a) => a.id === updated.id ? updated : a) });
      onActivity({ type: 'action_comment', description: `Posted comment on action "${updated.title}"${isBlocker ? ' 🚨 Blocker' : ''} (from Actions tab)` });
    }
  };

  // v30.B — Apply sub-task list changes immediately (bypasses form Save).
  // Same lifecycle pattern as handleAddComment. Diff-logger inside
  // applyActionUpdate emits typed subtask_* activity entries.
  const handleSubtasksChange = (newSubtasks) => {
    if (!editing) return;
    const updated = { ...editing, subtasks: newSubtasks };
    setEditing(updated);
    if (onApplyAction) {
      onApplyAction(updated, project.id, 'Actions tab');
    } else {
      onProjectUpdate({ ...project, actionItems: (project.actionItems || []).map((a) => a.id === updated.id ? updated : a) });
    }
  };

  const removeAction = async (a) => {
    const ok = await dialogs.confirm({ title: 'Delete action item?', message: `Delete "${a.title}"?`, danger: true, okLabel: 'Delete' });
    if (!ok) return;
    onProjectUpdate({ ...project, actionItems: actions.filter((x) => x.id !== a.id) });
    onActivity({ type: 'action_delete', description: `Deleted action: "${a.title}"` });
    setSelected(new Set([...selected].filter((id) => id !== a.id)));
  };

  const toggleSelect = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const selectAll = () => setSelected(new Set(filtered.map((a) => a.id)));
  const clearSelection = () => setSelected(new Set());

  // Get actions to operate on: selected if any, otherwise filtered
  const targetActions = selected.size > 0 ? actions.filter((a) => selected.has(a.id)) : filtered;

  // Excel template export — uses the OpenProject template format
  const exportExcel = (subset = null) => {
    const list = subset || targetActions;
    if (list.length === 0) {
      showToast('No actions to export.');
      return;
    }
    const blob = actionsToOpenProjectExcel(project, list);
    const fname = `actions_${project.openProjectCode || project.name.replace(/[^a-z0-9]+/gi, '_')}_${toISODate(new Date())}.xlsx`;
    downloadBlob(blob, fname);
    showToast(`Exported ${list.length} action${list.length === 1 ? '' : 's'} to Excel`);
  };

  // Build the email body for a single PIC's batch of actions (shared by single + multi-PIC flows)
  const buildPicEmailBody = (picName, list) => {
    const lines = [`Hi ${picName},`, '', `Below are action items assigned to you:`, ''];
    list.forEach((a, i) => {
      // Highlight priority on the title line so the urgency is visible at a glance
      const prio = a.priority === 'High' ? '🔴 [HIGH]'
                 : a.priority === 'Low' ? '🟢 [Low]'
                 : '🟡 [Medium]';
      lines.push(`${i + 1}. ${prio} ${a.title}`);
      if (a.description) lines.push(`   ${a.description}`);
      const related = a.relatedTaskId ? findTaskInProject(project, a.relatedTaskId) : null;
      if (related) lines.push(`   Project: ${project.name} > ${related.program.name} > ${related.workstream.name}`);
      if (a.dueDate) lines.push(`   Due: ${fmtDate(a.dueDate)}`);
      lines.push('');
    });
    lines.push(`📎 An Excel file with these actions has been auto-downloaded — please attach it from your Downloads folder before sending.`);
    lines.push(``);
    lines.push(`Thanks,`);
    lines.push(author);
    return lines.join('\n');
  };

  // Email PIC: opens an in-app modal with the formatted HTML email preview, content
  // auto-selected. User presses Ctrl+C (their own keyboard event — always works in iframes,
  // browser writes both text/html and text/plain to clipboard), then clicks Open Gmail.
  // Also auto-downloads the per-PIC Excel template so the file is ready to attach in Gmail
  // (browser security prevents pre-attaching to Gmail via URL — manual attach still required).
  const emailPic = (picName, list) => {
    const member = findMember(teamMembers, picName, dirIndex);
    if (!member?.email) {
      dialogs.alert({ title: 'No email', message: `No email on file for ${picName}. Add it via Project settings → Team members.` });
      return;
    }
    const subject = `[${project.name}] Action items — ${fmtDate(new Date())}`;
    const html = buildPicEmailHtml(picName, list, project, author);
    const meEmail = findMember(teamMembers, author, dirIndex)?.email;
    const gmailUrl = buildGmailUrl({ to: member.email, subject, cc: meEmail });
    // Auto-download per-PIC Excel — user attaches manually in Gmail
    const blob = actionsToOpenProjectExcel(project, list);
    const safePic = picName.replace(/[^a-z0-9]+/gi, '_');
    const fname = `actions_${project.openProjectCode || project.name.replace(/[^a-z0-9]+/gi, '_')}_${safePic}_${toISODate(new Date())}.xlsx`;
    downloadBlob(blob, fname);
    setCopyHelper({
      html,
      title: `Email to ${picName} — ${list.length} action${list.length === 1 ? '' : 's'}`,
      gmailUrl,
      attachmentName: fname,
    });
    onActivity({ type: 'action_email', description: `Emailed ${list.length} action${list.length === 1 ? '' : 's'} to ${picName}` });
  };

  // "Send to all PICs" — opens a modal listing each PIC with click-to-open-Gmail buttons.
  // Each click is a user gesture, avoiding popup blockers triggered by automated multi-tab opens.
  const emailAllPics = () => {
    const list = targetActions;
    if (list.length === 0) { showToast('No actions to send.'); return; }
    const groups = new Map();
    for (const a of list) {
      const k = a.pic || '';
      if (!k) continue;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(a);
    }
    if (groups.size === 0) { showToast('No PIC assigned in selection.'); return; }
    setEmailPicsDialog({ groups });
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 20, fontFamily: FONT_STACK, background: TOK.bg }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Action items</h2>
            <div style={{ fontSize: 12, color: TOK.muted, marginTop: 2 }}>
              {actions.length} total · {filtered.length} matching{selected.size > 0 ? ` · ${selected.size} selected` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 2, padding: 2, background: TOK.surface, borderRadius: 8, border: '1px solid ' + TOK.line }}>
              <button onClick={() => setMode('grouped')} style={{
                fontFamily: FONT_STACK, fontSize: 12, fontWeight: 500, padding: '5px 10px', borderRadius: 6,
                border: 'none', background: mode === 'grouped' ? TOK.bg : 'transparent', color: TOK.ink, cursor: 'pointer',
              }}>Group by PIC</button>
              <button onClick={() => setMode('flat')} style={{
                fontFamily: FONT_STACK, fontSize: 12, fontWeight: 500, padding: '5px 10px', borderRadius: 6,
                border: 'none', background: mode === 'flat' ? TOK.bg : 'transparent', color: TOK.ink, cursor: 'pointer',
              }}>Flat table</button>
            </div>
            <Btn variant="primary" onClick={() => { setEditing(null); setShowForm(true); }}><Plus size={12} /> New action</Btn>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input value={query} onChange={setQuery} placeholder="Search actions…" style={{ flex: 1, maxWidth: 240 }} />
          <select value={filterPic} onChange={(e) => setFilterPic(e.target.value)}
            style={{ fontFamily: FONT_STACK, fontSize: 12, padding: '6px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface }}>
            <option value="all">All PICs</option>
            {allPics.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            style={{ fontFamily: FONT_STACK, fontSize: 12, padding: '6px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface }}>
            <option value="all">All statuses</option>
            {ACTION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}
            style={{ fontFamily: FONT_STACK, fontSize: 12, padding: '6px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface }}>
            <option value="all">All priorities</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Bulk action bar */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center', background: TOK.surface, padding: '8px 12px', borderRadius: 8, border: '1px solid ' + TOK.line }}>
          <span style={{ fontSize: 12, color: TOK.muted, marginRight: 6 }}>
            {selected.size > 0 ? `${selected.size} selected` : `${filtered.length} action${filtered.length === 1 ? '' : 's'}`}:
          </span>
          {mode === 'flat' && filtered.length > 0 && (
            <>
              <Btn size="sm" variant="ghost" onClick={selectAll}>Select all</Btn>
              {selected.size > 0 && <Btn size="sm" variant="ghost" onClick={clearSelection}>Clear</Btn>}
            </>
          )}
          <div style={{ flex: 1 }} />
          <Btn size="sm" onClick={() => exportExcel()} disabled={targetActions.length === 0}><FileSpreadsheet size={11} /> Excel template</Btn>
          <Btn size="sm" onClick={emailAllPics} disabled={targetActions.length === 0}>📧 Email PICs</Btn>
        </div>

        {/* v30.C — RAID mitigations surfaced from the register, shown above the actions list */}
        {mitigations.length > 0 && (
          <div style={{
            background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 8,
            padding: 12, marginBottom: 14,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
              fontSize: 12, fontWeight: 600, color: TOK.ink,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                background: TOK.overdueBg, color: TOK.overdueFg,
              }}>🛡 RAID</span>
              Mitigations ({mitigations.length})
              <span style={{ fontSize: 11, fontWeight: 400, color: TOK.muted, marginLeft: 4 }}>
                — surfaced from RAID register so they're visible alongside actions
              </span>
            </div>
            {mitigations.map((entry, i) => (
              <MitigationRowInline
                key={`actions-mit-${entry.mitigation.id || i}`}
                entry={entry}
                author={author}
                teamMembers={teamMembers}
                picSuggestions={(teamMembers || []).map((m) => m.name).sort()}
                onApplyMitigation={(nextProject) => onProjectUpdate(nextProject)}
                onNavigateRaid={onNavigateRaid}
                showToast={showToast}
              />
            ))}
          </div>
        )}

        {showForm && (
          <div data-action-form style={{ marginBottom: 14 }}>
            <ActionItemForm
              key={editing?.id || 'new'}
              initial={editing}
              project={project}
              teamMembers={teamMembers}
              author={author}
              onSave={saveAction}
              onCancel={() => { setShowForm(false); setEditing(null); }}
              onAddComment={editing ? handleAddComment : null}
              onSubtasksChange={editing ? handleSubtasksChange : null}
            />
          </div>
        )}

        {filtered.length === 0 && !showForm && (
          <div style={{ padding: 40, textAlign: 'center', color: TOK.subtle, fontSize: 13, background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 10 }}>
            {actions.length === 0 ? (
              <>No action items yet. <button onClick={() => setShowForm(true)} style={{ background: 'none', border: 'none', color: TOK.accent, cursor: 'pointer', fontSize: 13 }}>Create one</button></>
            ) : (
              'No actions match the current filters.'
            )}
          </div>
        )}

        {filtered.length > 0 && mode === 'grouped' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {groupedByPic.map(([pic, items]) => {
              const member = findMember(teamMembers, pic, dirIndex);
              const hasEmail = member?.email;
              return (
                <div key={pic} style={{ background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid ' + TOK.line, background: TOK.bg, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{pic}</span>
                    <span style={{ fontSize: 11, color: TOK.muted }}>({items.length})</span>
                    {hasEmail && <span style={{ fontSize: 11, color: TOK.subtle }}>{member.email}</span>}
                    <div style={{ flex: 1 }} />
                    <Btn size="sm" variant="ghost" onClick={() => exportExcel(items)}><FileSpreadsheet size={11} /> Excel</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => emailPic(pic, items)} disabled={!hasEmail} title={hasEmail ? `Email ${pic}` : 'No email on file'}>📧 Email</Btn>
                  </div>
                  {items.map((a) => (
                    <ActionItemRow key={a.id} action={a} project={project} teamMembers={teamMembers}
                      onEdit={startEdit} onDelete={removeAction} />
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {filtered.length > 0 && mode === 'flat' && (
          <div style={{ background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 10, overflow: 'hidden' }}>
            {filtered.map((a) => (
              <ActionItemRow key={a.id} action={a} project={project} teamMembers={teamMembers}
                onEdit={startEdit} onDelete={removeAction}
                onSelect={toggleSelect} selected={selected.has(a.id)} showCheckbox />
            ))}
          </div>
        )}
      </div>

      {/* Email PICs modal — list each PIC with click-to-open Gmail button (user gesture per click) */}
      {emailPicsDialog && (
        <Modal title="Send action items to PICs" onClose={() => setEmailPicsDialog(null)} width={580} zHigh>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: TOK.muted, lineHeight: 1.55 }}>
            For each PIC, click <strong>Open Gmail</strong>. A preview window opens with the formatted email — press <kbd style={{ padding: '0 4px', background: TOK.bg, border: '1px solid ' + TOK.lineStrong, borderRadius: 3, fontSize: 10 }}>Ctrl+C</kbd> to copy (content is auto-selected), then click "Open Gmail" inside the preview and paste in Gmail body with <kbd style={{ padding: '0 4px', background: TOK.bg, border: '1px solid ' + TOK.lineStrong, borderRadius: 3, fontSize: 10 }}>Ctrl+V</kbd>.
            Don't forget to attach the Excel template before sending.
          </p>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <Btn size="sm" onClick={() => exportExcel(targetActions)}><FileSpreadsheet size={11} /> Download Excel template (all)</Btn>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
            {Array.from(emailPicsDialog.groups.entries()).map(([picName, items]) => {
              const member = findMember(teamMembers, picName, dirIndex);
              const hasEmail = !!member?.email;
              return (
                <div key={picName} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', background: TOK.bg, borderRadius: 8,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{picName}</div>
                    <div style={{ fontSize: 11, color: TOK.muted }}>
                      {items.length} item{items.length === 1 ? '' : 's'}
                      {hasEmail ? ` · ${member.email}` : ' · ⚠ no email'}
                    </div>
                  </div>
                  <Btn size="sm" variant="primary" onClick={() => emailPic(picName, items)} disabled={!hasEmail}>
                    Open Gmail
                  </Btn>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn onClick={() => setEmailPicsDialog(null)}>Done</Btn>
          </div>
        </Modal>
      )}

      {/* CopyHelper modal — renders the formatted email HTML in-app with auto-selected content,
          so the user can copy with Ctrl+C (their own keyboard input bypasses iframe clipboard restrictions). */}
      {copyHelper && (
        <CopyHelperModal
          html={copyHelper.html}
          title={copyHelper.title}
          gmailUrl={copyHelper.gmailUrl}
          attachmentName={copyHelper.attachmentName}
          onClose={() => setCopyHelper(null)}
        />
      )}
    </div>
  );
}

/* ═════════ EXCEL EXPORT FOR OPENPROJECT ═════════ */
// Maps action items to the OpenProject upload template format.
// Template columns: Project Code, Project Name, Subject, Type, Description, Assignee, Reviewer, Priority, Start date, Due date, Entity/Company, Parent Task, Level
// Sheet name: 'Template Task'. Rows 1-4 of the template have Type values (Epic/User Story/Task/Milestone) pre-filled — we keep that pattern: row 1 contains the 4 type-only rows, then our action items follow.
function actionsToOpenProjectExcel(project, actions) {
  // OpenProject priority map (their default priorities are typically Low/Normal/High/Immediate)
  const priorityMap = { High: 'High', Medium: 'Normal', Low: 'Low' };
  // Build name → email map from project team members for Assignee column
  const nameToEmail = new Map();
  for (const m of (project.teamMembers || [])) {
    if (m.name && m.email) nameToEmail.set(m.name, m.email);
  }
  const headers = [
    'Project Code', 'Project Name',
    'Subject (recommended to keep WP Code prefix)',
    'Type', 'Description',
    'Assignee (email)', 'Reviewer (if any)',
    'Priority', 'Start date', 'Due date',
    'Entity/Company', 'Parent Task', 'Level',
  ];
  const rows = [headers];
  for (const a of actions) {
    const assigneeEmail = nameToEmail.get(a.pic || '') || a.pic || '';
    rows.push([
      sanitizeCell(project.openProjectCode || ''),
      sanitizeCell(project.name || ''),
      sanitizeCell(a.title || ''),
      'User Story',
      sanitizeCell(a.description || ''),
      sanitizeCell(assigneeEmail),
      '',
      priorityMap[a.priority] || 'Normal',
      '',
      a.dueDate || '',
      '',
      '',
      '',
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template Task');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/* ═════════ AGGREGATION VIEW (cross-project decisions & actions) ═════════ */
function AggregationView({ projects, currentProjectId, teamMembers, dialogs, showToast, author, initialTab = 'decisions' }) {
  const [scope, setScope] = useState('all'); // all | current
  const [tab, setTab] = useState(initialTab); // decisions | actions
  const [filterProject, setFilterProject] = useState('all');
  const [filterPic, setFilterPic] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [query, setQuery] = useState('');

  // Determine project pool (current vs all)
  const projectPool = useMemo(() => {
    if (scope === 'current' && currentProjectId) {
      return projects[currentProjectId] ? [projects[currentProjectId]] : [];
    }
    return Object.values(projects);
  }, [projects, scope, currentProjectId]);

  // Flatten all decisions/actions across the pool, attach project info
  const allDecisions = useMemo(() => {
    const out = [];
    for (const p of projectPool) {
      for (const d of (p.decisions || [])) out.push({ ...d, _project: p });
    }
    return out;
  }, [projectPool]);

  const allActions = useMemo(() => {
    const out = [];
    for (const p of projectPool) {
      for (const a of (p.actionItems || [])) out.push({ ...a, _project: p });
    }
    return out;
  }, [projectPool]);

  // Unique PICs across all projects (for filter)
  const allPics = useMemo(() => {
    const s = new Set();
    for (const a of allActions) if (a.pic) s.add(a.pic);
    for (const d of allDecisions) (d.decidedBy || []).forEach((p) => s.add(p));
    return Array.from(s).sort();
  }, [allActions, allDecisions]);

  // Apply filters
  const inDateRange = (dateStr) => {
    if (!dateStr) return true; // no date — keep
    const d = parseDate(dateStr);
    if (!d) return true;
    if (dateFrom && d < parseDate(dateFrom)) return false;
    if (dateTo && d > parseDate(dateTo)) return false;
    return true;
  };

  const filteredDecisions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allDecisions
      .filter((d) => filterProject === 'all' || d._project.id === filterProject)
      .filter((d) => filterPic === 'all' || (d.decidedBy || []).includes(filterPic))
      .filter((d) => filterStatus === 'all' || d.followUpStatus === filterStatus)
      .filter((d) => inDateRange(d.date))
      .filter((d) => !q || (d.text || '').toLowerCase().includes(q) || (d.context || '').toLowerCase().includes(q))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [allDecisions, filterProject, filterPic, filterStatus, dateFrom, dateTo, query]);

  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allActions
      .filter((a) => filterProject === 'all' || a._project.id === filterProject)
      .filter((a) => filterPic === 'all' || a.pic === filterPic)
      .filter((a) => filterStatus === 'all' || a.status === filterStatus)
      .filter((a) => inDateRange(a.dueDate))
      .filter((a) => !q || (a.title || '').toLowerCase().includes(q) || (a.description || '').toLowerCase().includes(q))
      .sort((a, b) => {
        const sOrder = { Pending: 0, InProgress: 1, 'Pushed to OP': 2, Done: 3, Cancelled: 4 };
        if (sOrder[a.status] !== sOrder[b.status]) return sOrder[a.status] - sOrder[b.status];
        const pOrder = { High: 0, Medium: 1, Low: 2 };
        if (pOrder[a.priority] !== pOrder[b.priority]) return pOrder[a.priority] - pOrder[b.priority];
        if (a.dueDate && b.dueDate) return parseDate(a.dueDate) - parseDate(b.dueDate);
        return 0;
      });
  }, [allActions, filterProject, filterPic, filterStatus, dateFrom, dateTo, query]);

  // Bulk export Excel for action items (group by project as separate sheets won't work easily;
  // simpler: one combined sheet with Project Code from each row's project)
  const exportActionsExcel = () => {
    if (filteredActions.length === 0) { showToast('No actions to export.'); return; }
    // Build one Excel per project (since template has Project Code at row level, easier to mix)
    // For simplicity: one combined sheet
    const priorityMap = { High: 'High', Medium: 'Normal', Low: 'Low' };
    const headers = [
      'Project Code', 'Project Name',
      'Subject (recommended to keep WP Code prefix)',
      'Type', 'Description',
      'Assignee (Role placeholder)', 'Reviewer (if any)',
      'Priority', 'Start date', 'Due date',
      'Entity/Company', 'Parent Task', 'Level',
    ];
    const rows = [headers];
    ['Epic', 'User Story', 'Task', 'Milestone'].forEach((tp) => {
      rows.push(['', '', '', tp, '', '', '', '', '', '', '', '', '']);
    });
    for (const a of filteredActions) {
      rows.push([
        a._project.openProjectCode || '',
        a._project.name || '',
        a.title || '',
        'Task',
        a.description || '',
        a.pic || '',
        '',
        priorityMap[a.priority] || 'Normal',
        '',
        a.dueDate || '',
        '',
        '',
        '',
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template Task');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const fname = `aggregated_actions_${toISODate(new Date())}.xlsx`;
    downloadBlob(blob, fname);
    showToast(`Exported ${filteredActions.length} action${filteredActions.length === 1 ? '' : 's'} to Excel`);
  };

  // Reset all filters
  const resetFilters = () => {
    setFilterProject('all'); setFilterPic('all'); setFilterStatus('all');
    setDateFrom(''); setDateTo(''); setQuery('');
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 20, fontFamily: FONT_STACK, background: TOK.bg }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Aggregation</h2>
            <div style={{ fontSize: 12, color: TOK.muted, marginTop: 2 }}>
              {scope === 'all' ? `Across ${projectPool.length} project${projectPool.length === 1 ? '' : 's'}` : `Current project only`}
            </div>
          </div>
          {/* Scope toggle */}
          <div style={{ display: 'flex', gap: 2, padding: 2, background: TOK.surface, borderRadius: 8, border: '1px solid ' + TOK.line }}>
            <button onClick={() => setScope('all')} style={{
              fontFamily: FONT_STACK, fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 6,
              border: 'none', background: scope === 'all' ? TOK.bg : 'transparent', color: TOK.ink, cursor: 'pointer',
            }}>All projects</button>
            <button onClick={() => setScope('current')} disabled={!currentProjectId} style={{
              fontFamily: FONT_STACK, fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 6,
              border: 'none', background: scope === 'current' ? TOK.bg : 'transparent', color: currentProjectId ? TOK.ink : TOK.subtle,
              cursor: currentProjectId ? 'pointer' : 'not-allowed',
            }}>Current project</button>
          </div>
        </div>

        {/* Top tabs: Decisions / Actions */}
        <div style={{ display: 'flex', gap: 2, padding: 2, background: TOK.surface, borderRadius: 8, marginBottom: 14, border: '1px solid ' + TOK.line, width: 'fit-content' }}>
          {[
            { id: 'decisions', label: 'Decisions', count: filteredDecisions.length },
            { id: 'actions', label: 'Action items', count: filteredActions.length },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              fontFamily: FONT_STACK, fontSize: 12, fontWeight: 500, padding: '6px 14px', borderRadius: 6,
              border: 'none', background: tab === t.id ? TOK.bg : 'transparent', color: TOK.ink, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {t.label}
              <span style={{ fontSize: 10.5, color: TOK.muted, fontWeight: 500, padding: '0 6px', borderRadius: 999, background: tab === t.id ? TOK.surface : 'transparent' }}>{t.count}</span>
            </button>
          ))}
        </div>

        {/* Filters row */}
        <div style={{ background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 10, padding: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Input value={query} onChange={setQuery} placeholder="Search…" style={{ flex: 1, maxWidth: 240, minWidth: 160 }} />
            {scope === 'all' && (
              <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)}
                style={{ fontFamily: FONT_STACK, fontSize: 12, padding: '6px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface }}>
                <option value="all">All projects</option>
                {Object.values(projects).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <select value={filterPic} onChange={(e) => setFilterPic(e.target.value)}
              style={{ fontFamily: FONT_STACK, fontSize: 12, padding: '6px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface }}>
              <option value="all">All {tab === 'decisions' ? 'deciders' : 'PICs'}</option>
              {allPics.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              style={{ fontFamily: FONT_STACK, fontSize: 12, padding: '6px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface }}>
              <option value="all">All statuses</option>
              {(tab === 'decisions' ? FOLLOWUP_STATUSES : ACTION_STATUSES).map((s) => <option key={s} value={s}>{tab === 'decisions' ? FOLLOWUP_LABEL[s] : s}</option>)}
            </select>
            <span style={{ fontSize: 11, color: TOK.muted, marginLeft: 4 }}>Date:</span>
            <Input type="date" value={dateFrom} onChange={setDateFrom} style={{ width: 140 }} />
            <span style={{ fontSize: 11, color: TOK.muted }}>→</span>
            <Input type="date" value={dateTo} onChange={setDateTo} style={{ width: 140 }} />
            <Btn size="sm" variant="ghost" onClick={resetFilters}>Reset</Btn>
          </div>
        </div>

        {/* Content */}
        {tab === 'decisions' && (
          <>
            {filteredDecisions.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: TOK.subtle, fontSize: 13, background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 10 }}>
                No decisions match the current filters.
              </div>
            )}
            {filteredDecisions.map((d) => {
              const fc = followupColor(d.followUpStatus);
              return (
                <div key={d.id} style={{ background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4 }}>
                      <MentionedText text={d.text} teamMembers={teamMembers} />
                    </span>
                    <span style={{
                      fontSize: 10.5, fontWeight: 500, padding: '2px 8px', borderRadius: 999,
                      color: fc.fg, background: fc.bg, whiteSpace: 'nowrap', height: 'fit-content',
                    }}>{FOLLOWUP_LABEL[d.followUpStatus]}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: TOK.muted, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ background: TOK.projectBg, color: TOK.projectFg, padding: '1px 6px', borderRadius: 4, fontSize: 10.5, fontWeight: 500 }}>{d._project.name}</span>
                    <span>📅 {fmtDate(d.date)}</span>
                    <span>👥 {(d.decidedBy || []).join(', ') || '—'}</span>
                    {d.meetingRef && <span style={{ background: TOK.bg, padding: '1px 6px', borderRadius: 4 }}>{d.meetingRef}</span>}
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: TOK.subtle }}>by {d.author}</span>
                  </div>
                  {d.context && (
                    <div style={{ marginTop: 8, fontSize: 12, color: TOK.muted, lineHeight: 1.55 }}>
                      <MentionedText text={d.context} teamMembers={teamMembers} />
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {tab === 'actions' && (
          <>
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
              <Btn size="sm" onClick={exportActionsExcel} disabled={filteredActions.length === 0}><FileSpreadsheet size={11} /> Export filtered to Excel</Btn>
            </div>
            {filteredActions.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: TOK.subtle, fontSize: 13, background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 10 }}>
                No action items match the current filters.
              </div>
            )}
            {filteredActions.map((a) => {
              const sc = actionStatusColor(a.status);
              const pc = priorityColor(a.priority);
              const overdue = a.dueDate && a.status !== 'Done' && a.status !== 'Cancelled' && parseDate(a.dueDate) < today();
              const related = a.relatedTaskId ? findTaskInProject(a._project, a.relatedTaskId) : null;
              return (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 10,
                  padding: '10px 14px', marginBottom: 6,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>
                      <MentionedText text={a.title} teamMembers={teamMembers} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, fontSize: 11, color: TOK.muted, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ background: TOK.projectBg, color: TOK.projectFg, padding: '1px 6px', borderRadius: 4, fontSize: 10.5, fontWeight: 500 }}>{a._project.name}</span>
                      {related && <span>{related.program.name} › {related.task.name}</span>}
                      <span>👤 <strong>{a.pic || '—'}</strong></span>
                      {a.dueDate && <span style={{ color: overdue ? TOK.overdueFg : TOK.muted }}>📅 {fmtDateShort(a.dueDate)}</span>}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10.5, fontWeight: 500, padding: '2px 7px', borderRadius: 999,
                    color: pc.fg, background: pc.bg,
                  }}>{a.priority}</span>
                  <span style={{
                    fontSize: 10.5, fontWeight: 500, padding: '2px 7px', borderRadius: 999,
                    color: sc.fg, background: sc.bg, whiteSpace: 'nowrap',
                  }}>{a.status}</span>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

/* ═════════ MEETING MODE (in-app fullscreen presentation) ═════════ */
function MeetingMode({ projects, onExit, dateFrom, dateTo }) {
  // Listen for Esc key to exit
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onExit(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  const projList = useMemo(() => Object.values(projects), [projects]);

  // Range filter on entries
  const inRange = (dateStr) => {
    if (!dateStr) return true;
    const d = parseDate(dateStr);
    if (!d) return true;
    if (dateFrom && d < parseDate(dateFrom)) return false;
    if (dateTo && d > parseDate(dateTo)) return false;
    return true;
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: TOK.bg, zIndex: 100,
      display: 'flex', flexDirection: 'column', fontFamily: FONT_STACK,
      overflow: 'hidden',
    }}>
      {/* Top bar with Exit hint */}
      <div style={{
        padding: '14px 28px', borderBottom: '1px solid ' + TOK.line, background: TOK.surface,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: TOK.accent, padding: '3px 10px', background: TOK.healthGreenBg, borderRadius: 999 }}>● MEETING MODE</span>
          <span style={{ fontSize: 13, color: TOK.muted }}>Press <kbd style={{ padding: '2px 6px', background: TOK.bg, border: '1px solid ' + TOK.lineStrong, borderRadius: 4, fontFamily: FONT_STACK, fontSize: 11 }}>Esc</kbd> to exit</span>
        </div>
        <Btn size="sm" onClick={onExit}><X size={12} /> Exit</Btn>
      </div>

      {/* Content area — present-friendly layout */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 48px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          {projList.map((p) => {
            const r = rollup(p);
            // Active blockers across all milestones in this project
            const blockers = [];
            for (const pg of p.programs || []) {
              for (const ws of pg.workstreams || []) {
                for (const t of ws.tasks || []) {
                  for (const u of (t.updates || [])) {
                    if (u.isBlocker && !u.resolvedAt) blockers.push({ task: t, update: u });
                  }
                }
              }
            }
            // Health rollup: count tasks by health
            let hg = 0, ha = 0, hr = 0;
            for (const t of collectTasks(p)) {
              if (t.status === 'Dropped') continue;
              if (t.health === 'red') hr++;
              else if (t.health === 'amber') ha++;
              else hg++;
            }
            const recentDecisions = (p.decisions || []).filter((d) => inRange(d.date)).slice(0, 5);
            const openActions = (p.actionItems || []).filter((a) => a.status !== 'Done' && a.status !== 'Cancelled').slice(0, 8);

            return (
              <div key={p.id} style={{ marginBottom: 40 }}>
                {/* Project header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16,
                  paddingBottom: 12, borderBottom: '2px solid ' + TOK.lineStrong,
                }}>
                  <h1 style={{ margin: 0, fontSize: 28, fontWeight: 500, color: TOK.ink }}>{p.name}</h1>
                  <span style={{ fontSize: 16, color: TOK.muted, fontWeight: 400 }}>{r.pct}% complete</span>
                  <div style={{ flex: 1 }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    {hg > 0 && <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, background: TOK.healthGreenBg, color: TOK.healthGreen, fontWeight: 500 }}>● {hg} on track</span>}
                    {ha > 0 && <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, background: TOK.healthAmberBg, color: TOK.healthAmber, fontWeight: 500 }}>● {ha} at risk</span>}
                    {hr > 0 && <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, background: TOK.healthRedBg, color: TOK.healthRed, fontWeight: 500 }}>● {hr} off track</span>}
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ height: 8, background: TOK.bg, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${r.pct}%`, background: r.pct >= 75 ? TOK.doneFg : r.pct >= 25 ? TOK.inprogFg : TOK.plannedFg }} />
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 13, color: TOK.muted, marginTop: 8 }}>
                    <span>{r.done}/{r.total} milestones complete</span>
                    {r.inprog > 0 && <span>{r.inprog} in progress</span>}
                    {r.overdue > 0 && <span style={{ color: TOK.overdueFg, fontWeight: 500 }}>⚠ {r.overdue} overdue</span>}
                    {r.dropped > 0 && <span>{r.dropped} dropped</span>}
                  </div>
                </div>

                {/* Two-column layout: Blockers + Recent decisions / Open actions */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  {/* Active blockers */}
                  <div style={{ background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 10, padding: 16 }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 500, marginBottom: 12, color: TOK.blocker }}>
                      🚩 Active blockers ({blockers.length})
                    </h3>
                    {blockers.length === 0 && <div style={{ fontSize: 13, color: TOK.subtle, padding: '8px 0' }}>No active blockers.</div>}
                    {blockers.slice(0, 5).map(({ task, update }) => (
                      <div key={update.id} style={{ padding: '8px 0', borderTop: '1px solid ' + TOK.line, fontSize: 13 }}>
                        <div style={{ fontWeight: 500, marginBottom: 2 }}>{task.name}</div>
                        <div style={{ color: TOK.blocker, fontSize: 12.5, lineHeight: 1.5 }}>{(update.text || '').slice(0, 200)}</div>
                        <div style={{ fontSize: 11, color: TOK.subtle, marginTop: 2 }}>{update.author} · {fmtDateTime(update.timestamp)}</div>
                      </div>
                    ))}
                  </div>

                  {/* Recent decisions */}
                  <div style={{ background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 10, padding: 16 }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 500, marginBottom: 12 }}>
                      📋 Recent decisions ({(p.decisions || []).length})
                    </h3>
                    {recentDecisions.length === 0 && <div style={{ fontSize: 13, color: TOK.subtle, padding: '8px 0' }}>No decisions logged.</div>}
                    {recentDecisions.map((d) => (
                      <div key={d.id} style={{ padding: '8px 0', borderTop: '1px solid ' + TOK.line, fontSize: 13 }}>
                        <div style={{ fontWeight: 500, marginBottom: 2 }}>{d.text}</div>
                        <div style={{ fontSize: 11, color: TOK.muted, marginTop: 2 }}>{fmtDate(d.date)} · {(d.decidedBy || []).join(', ')}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Open actions */}
                <div style={{ background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 10, padding: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 500, marginBottom: 12 }}>
                    ✅ Open actions ({(p.actionItems || []).filter((a) => a.status !== 'Done' && a.status !== 'Cancelled').length})
                  </h3>
                  {openActions.length === 0 && <div style={{ fontSize: 13, color: TOK.subtle, padding: '8px 0' }}>No open actions.</div>}
                  {openActions.map((a) => {
                    const overdue = a.dueDate && parseDate(a.dueDate) < today();
                    return (
                      <div key={a.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid ' + TOK.line, fontSize: 13,
                      }}>
                        <span style={{ flex: 1, fontWeight: 500 }}>{a.title}</span>
                        <span style={{ fontSize: 12, color: TOK.muted }}>{a.pic}</span>
                        {a.dueDate && <span style={{ fontSize: 12, color: overdue ? TOK.overdueFg : TOK.muted }}>📅 {fmtDateShort(a.dueDate)}</span>}
                        <span style={{
                          fontSize: 11, fontWeight: 500, padding: '2px 7px', borderRadius: 999,
                          color: priorityColor(a.priority).fg, background: priorityColor(a.priority).bg,
                        }}>{a.priority}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ═════════ MEETING EXPORT (Markdown minutes) ═════════ */
function generateMeetingMinutes({ projects, dateFrom, dateTo, selectedProjectIds, attendees }) {
  const lines = [];
  const headerDate = dateFrom === dateTo ? fmtDate(dateFrom) : `${fmtDate(dateFrom)} → ${fmtDate(dateTo)}`;

  // ─── Header ───
  lines.push(`# Meeting Minutes — ${headerDate}`);
  lines.push('');
  if (attendees && attendees.length) {
    lines.push(`**Attendees:** ${attendees.join(', ')}`);
    lines.push('');
  }

  // ─── Date range checks ───
  const inRange = (dateStr) => {
    if (!dateStr) return false;
    const d = parseDate(dateStr);
    if (!d) return false;
    if (dateFrom && d < parseDate(dateFrom)) return false;
    if (dateTo && d > parseDate(dateTo)) return false;
    return true;
  };
  const inRangeTimestamp = (ts) => {
    if (!ts) return false;
    const d = new Date(ts);
    if (isNaN(d)) return false;
    if (dateFrom) { const from = parseDate(dateFrom); if (d < from) return false; }
    if (dateTo) { const to = parseDate(dateTo); to.setHours(23, 59, 59, 999); if (d > to) return false; }
    return true;
  };

  // Helper: escape pipes & newlines so markdown table cells don't break
  const cell = (s) => (s == null ? '' : String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim());
  // Helper: priority with visual emphasis
  const prioBadge = (p) => p === 'High' ? '🔴 **HIGH**' : p === 'Low' ? '🟢 Low' : '🟡 Medium';

  // ─── Collect data per project (skip projects with no activity in range) ───
  const projectsToInclude = (selectedProjectIds && selectedProjectIds.length)
    ? Object.values(projects).filter((p) => selectedProjectIds.includes(p.id))
    : Object.values(projects);

  const projectData = [];
  for (const p of projectsToInclude) {
    const newUpdates = [];
    const resolvedInRange = []; // blockers RESOLVED in this range (regardless of when they were created)
    for (const pg of p.programs || []) {
      for (const ws of pg.workstreams || []) {
        for (const t of ws.tasks || []) {
          for (const u of (t.updates || [])) {
            if (inRangeTimestamp(u.timestamp)) {
              newUpdates.push({ task: t, program: pg, workstream: ws, update: u });
            }
            if (u.resolvedAt && inRangeTimestamp(u.resolvedAt) && u.isBlocker) {
              resolvedInRange.push({ task: t, update: u });
            }
          }
        }
      }
    }
    const newDecisions = (p.decisions || []).filter((d) => inRange(d.date));
    const newActions = (p.actionItems || []).filter((a) => inRangeTimestamp(a.timestamp));
    if (newUpdates.length === 0 && newDecisions.length === 0 && newActions.length === 0 && resolvedInRange.length === 0) continue;
    projectData.push({ project: p, newUpdates, newDecisions, newActions, resolvedInRange });
  }

  if (projectData.length === 0) {
    lines.push(`---`);
    lines.push('');
    lines.push(`_No activity logged in the selected date range._`);
    return lines.join('\n');
  }

  // ─── Summary block ───
  const total = (key) => projectData.reduce((s, pd) => s + pd[key].length, 0);
  const totalUpdates = total('newUpdates');
  const totalDecisions = total('newDecisions');
  const totalActions = total('newActions');
  const totalResolved = total('resolvedInRange');
  const totalActiveBlockers = projectData.reduce((s, pd) =>
    s + pd.newUpdates.filter((u) => u.update.isBlocker && !u.update.resolvedAt).length, 0);
  const uniquePics = new Set();
  projectData.forEach((pd) => pd.newActions.forEach((a) => a.pic && uniquePics.add(a.pic)));

  lines.push(`## 📊 Summary`);
  lines.push('');
  lines.push(`- **${projectData.length} project${projectData.length === 1 ? '' : 's'}** discussed`);
  if (totalDecisions > 0) lines.push(`- **${totalDecisions} decision${totalDecisions === 1 ? '' : 's'}** logged`);
  if (totalActions > 0) lines.push(`- **${totalActions} action item${totalActions === 1 ? '' : 's'}** assigned to **${uniquePics.size} ${uniquePics.size === 1 ? 'PIC' : 'PICs'}**`);
  if (totalActiveBlockers > 0) lines.push(`- 🚩 **${totalActiveBlockers} new blocker${totalActiveBlockers === 1 ? '' : 's'}** flagged`);
  if (totalResolved > 0) lines.push(`- ✓ **${totalResolved} blocker${totalResolved === 1 ? '' : 's'} resolved**`);
  if (totalUpdates > 0) lines.push(`- **${totalUpdates} update${totalUpdates === 1 ? '' : 's'}** posted`);
  lines.push('');

  // ─── Per project sections ───
  for (const { project: p, newUpdates, newDecisions, newActions, resolvedInRange } of projectData) {
    lines.push(`---`);
    lines.push('');

    // Project header with quick status snapshot (uses live project rollup, not date-bounded)
    const r = rollup(p);
    const statusEmoji = r.overdue > 0 ? '🔴' : r.pct >= 75 ? '🟢' : r.pct >= 25 ? '🟡' : '⚪';
    lines.push(`## ${statusEmoji} ${p.name}`);
    lines.push('');
    const statusBits = [`${r.pct}% complete`, `${r.done}/${r.total} milestones`];
    if (r.overdue > 0) statusBits.push(`⚠ ${r.overdue} overdue`);
    if (r.dropped > 0) statusBits.push(`${r.dropped} dropped`);
    lines.push(`**Status:** ${statusBits.join(' · ')}`);
    lines.push('');

    // ── Decisions table ──
    if (newDecisions.length > 0) {
      lines.push(`### 📋 Decisions (${newDecisions.length})`);
      lines.push('');
      lines.push(`| # | Decision | Decided by | Date | Status |`);
      lines.push(`|---|----------|------------|------|--------|`);
      newDecisions.forEach((d, i) => {
        lines.push(`| ${i + 1} | ${cell(d.text)} | ${cell((d.decidedBy || []).join(', '))} | ${fmtDateShort(d.date)} | ${FOLLOWUP_LABEL[d.followUpStatus]} |`);
      });
      lines.push('');
      // Inline context for decisions that have rationale
      const withContext = newDecisions.filter((d) => d.context && d.context.trim());
      if (withContext.length > 0) {
        lines.push(`**Context:**`);
        for (const d of withContext) {
          const idx = newDecisions.indexOf(d) + 1;
          lines.push(`- _#${idx}_ — ${d.context.replace(/\n/g, ' ')}`);
        }
        lines.push('');
      }
      // Meeting refs
      const withMeeting = newDecisions.filter((d) => d.meetingRef && d.meetingRef.trim());
      if (withMeeting.length > 0) {
        const refs = [...new Set(withMeeting.map((d) => d.meetingRef.trim()))];
        lines.push(`_Meeting references: ${refs.join(' · ')}_`);
        lines.push('');
      }
    }

    // ── Actions: per-PIC tables ──
    if (newActions.length > 0) {
      lines.push(`### ✅ Action items (${newActions.length})`);
      lines.push('');
      const byPic = new Map();
      for (const a of newActions) {
        const k = a.pic || '— Unassigned —';
        if (!byPic.has(k)) byPic.set(k, []);
        byPic.get(k).push(a);
      }
      for (const [pic, items] of byPic.entries()) {
        lines.push(`#### 👤 ${pic} (${items.length})`);
        lines.push('');
        lines.push(`| # | Action | Due | Priority |`);
        lines.push(`|---|--------|-----|----------|`);
        items.forEach((a, i) => {
          const due = a.dueDate ? fmtDateShort(a.dueDate) : '—';
          lines.push(`| ${i + 1} | ${cell(a.title)} | ${due} | ${prioBadge(a.priority)} |`);
        });
        lines.push('');
        // Show descriptions if any (separately so the table stays clean)
        const withDesc = items.filter((a) => a.description && a.description.trim());
        if (withDesc.length > 0) {
          for (const a of withDesc) {
            const idx = items.indexOf(a) + 1;
            lines.push(`> _#${idx}_ — ${a.description.replace(/\n/g, ' ')}`);
          }
          lines.push('');
        }
      }
    }

    // ── Resolved blockers ──
    if (resolvedInRange.length > 0) {
      lines.push(`### ✓ Blockers resolved (${resolvedInRange.length})`);
      lines.push('');
      for (const { task, update } of resolvedInRange) {
        lines.push(`- **${task.name}** — _resolved by ${update.resolvedBy} on ${fmtDateTime(update.resolvedAt)}_`);
        if (update.resolution) lines.push(`  > ${update.resolution.replace(/\n/g, ' ')}`);
      }
      lines.push('');
    }

    // ── Discussion notes (grouped by milestone) ──
    if (newUpdates.length > 0) {
      lines.push(`### 💬 Discussion notes (${newUpdates.length})`);
      lines.push('');
      // Traverse hierarchy in order so milestones appear in plan order
      for (const pg of p.programs || []) {
        for (const ws of pg.workstreams || []) {
          for (const t of ws.tasks || []) {
            const updatesForTask = newUpdates.filter((u) => u.task.id === t.id);
            if (!updatesForTask.length) continue;
            lines.push(`**${pg.name} › ${ws.name} › ${t.name}**`);
            for (const { update } of updatesForTask) {
              const flag = update.isBlocker
                ? (update.resolvedAt ? '✓ ' : '🚩 ')
                : '• ';
              lines.push(`- ${flag}**${update.author}** _(${fmtDateTime(update.timestamp)})_: ${(update.text || '').replace(/\n/g, ' ')}`);
            }
            lines.push('');
          }
        }
      }
    }
  }

  // ─── Footer ───
  lines.push(`---`);
  lines.push('');
  lines.push(`_Generated ${fmtDateTime(new Date())} from AF Master Project Tracker._`);

  return lines.join('\n');
}

// HTML version of the meeting minutes — used as clipboard rich text for paste-into-Gmail.
// Same data shape & sections as generateMeetingMinutes(), but produces inline-styled HTML
// that renders nicely in Gmail / Outlook / Notion.
function generateMeetingMinutesHtml({ projects, dateFrom, dateTo, selectedProjectIds, attendees }) {
  const FONT = `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;`;
  const cell = `border: 1px solid #e5e3dc; padding: 8px 10px; vertical-align: top;`;
  const cellHead = `${cell} background: #f7f5ef; font-weight: 600; text-align: left;`;

  const prioPill = (p) => {
    const map = {
      High: 'background: #fceaea; color: #a32d2d;',
      Medium: 'background: #fbf1dc; color: #b7791f;',
      Low: 'background: #e2f0de; color: #2d7a2d;',
    };
    const style = `display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing: 0.3px; ${map[p] || map.Medium}`;
    return `<span style="${style}">${escapeHtml((p || 'Medium').toUpperCase())}</span>`;
  };
  const statusPill = (s) => {
    let bg = '#edebe4', fg = '#6e6c66';
    if (s === 'Done') { bg = '#e6efd6'; fg = '#356512'; }
    else if (s === 'InProgress') { bg = '#faeeda'; fg = '#a8660c'; }
    return `<span style="display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; background: ${bg}; color: ${fg};">${escapeHtml(FOLLOWUP_LABEL[s] || s)}</span>`;
  };

  const inRange = (dateStr) => {
    if (!dateStr) return false;
    const d = parseDate(dateStr);
    if (!d) return false;
    if (dateFrom && d < parseDate(dateFrom)) return false;
    if (dateTo && d > parseDate(dateTo)) return false;
    return true;
  };
  const inRangeTimestamp = (ts) => {
    if (!ts) return false;
    const d = new Date(ts);
    if (isNaN(d)) return false;
    if (dateFrom) { const from = parseDate(dateFrom); if (d < from) return false; }
    if (dateTo) { const to = parseDate(dateTo); to.setHours(23, 59, 59, 999); if (d > to) return false; }
    return true;
  };

  const headerDate = dateFrom === dateTo ? fmtDate(dateFrom) : `${fmtDate(dateFrom)} → ${fmtDate(dateTo)}`;
  const projectsToInclude = (selectedProjectIds && selectedProjectIds.length)
    ? Object.values(projects).filter((p) => selectedProjectIds.includes(p.id))
    : Object.values(projects);

  // Collect data per project
  const projectData = [];
  for (const p of projectsToInclude) {
    const newUpdates = [];
    const resolvedInRange = [];
    for (const pg of p.programs || []) {
      for (const ws of pg.workstreams || []) {
        for (const t of ws.tasks || []) {
          for (const u of (t.updates || [])) {
            if (inRangeTimestamp(u.timestamp)) newUpdates.push({ task: t, program: pg, workstream: ws, update: u });
            if (u.resolvedAt && inRangeTimestamp(u.resolvedAt) && u.isBlocker) resolvedInRange.push({ task: t, update: u });
          }
        }
      }
    }
    const newDecisions = (p.decisions || []).filter((d) => inRange(d.date));
    const newActions = (p.actionItems || []).filter((a) => inRangeTimestamp(a.timestamp));
    if (newUpdates.length === 0 && newDecisions.length === 0 && newActions.length === 0 && resolvedInRange.length === 0) continue;
    projectData.push({ project: p, newUpdates, newDecisions, newActions, resolvedInRange });
  }

  const parts = [];
  parts.push(`<div style="${FONT} font-size: 14px; line-height: 1.55; color: #1a1a19; max-width: 900px;">`);
  parts.push(`<h1 style="font-size: 22px; font-weight: 600; margin: 0 0 8px;">Meeting Minutes — ${escapeHtml(headerDate)}</h1>`);
  if (attendees && attendees.length) {
    parts.push(`<p style="margin: 0 0 16px; color: #6e6c66;"><strong>Attendees:</strong> ${escapeHtml(attendees.join(', '))}</p>`);
  }

  if (projectData.length === 0) {
    parts.push(`<hr style="border: none; border-top: 1px solid #e5e3dc; margin: 16px 0;" />`);
    parts.push(`<p style="color: #95938c; font-style: italic;">No activity logged in the selected date range.</p>`);
    parts.push(`</div>`);
    return parts.join('');
  }

  // Summary
  const total = (key) => projectData.reduce((s, pd) => s + pd[key].length, 0);
  const totalUpdates = total('newUpdates');
  const totalDecisions = total('newDecisions');
  const totalActions = total('newActions');
  const totalResolved = total('resolvedInRange');
  const totalActiveBlockers = projectData.reduce((s, pd) =>
    s + pd.newUpdates.filter((u) => u.update.isBlocker && !u.update.resolvedAt).length, 0);
  const uniquePics = new Set();
  projectData.forEach((pd) => pd.newActions.forEach((a) => a.pic && uniquePics.add(a.pic)));

  parts.push(`<h2 style="font-size: 16px; font-weight: 600; margin: 24px 0 8px;">📊 Summary</h2>`);
  parts.push(`<ul style="margin: 0 0 16px; padding-left: 22px;">`);
  parts.push(`<li><strong>${projectData.length}</strong> project${projectData.length === 1 ? '' : 's'} discussed</li>`);
  if (totalDecisions > 0) parts.push(`<li><strong>${totalDecisions}</strong> decision${totalDecisions === 1 ? '' : 's'} logged</li>`);
  if (totalActions > 0) parts.push(`<li><strong>${totalActions}</strong> action item${totalActions === 1 ? '' : 's'} assigned to <strong>${uniquePics.size}</strong> ${uniquePics.size === 1 ? 'PIC' : 'PICs'}</li>`);
  if (totalActiveBlockers > 0) parts.push(`<li>🚩 <strong>${totalActiveBlockers}</strong> new blocker${totalActiveBlockers === 1 ? '' : 's'} flagged</li>`);
  if (totalResolved > 0) parts.push(`<li>✓ <strong>${totalResolved}</strong> blocker${totalResolved === 1 ? '' : 's'} resolved</li>`);
  if (totalUpdates > 0) parts.push(`<li><strong>${totalUpdates}</strong> update${totalUpdates === 1 ? '' : 's'} posted</li>`);
  parts.push(`</ul>`);

  // Per project
  for (const { project: p, newUpdates, newDecisions, newActions, resolvedInRange } of projectData) {
    parts.push(`<hr style="border: none; border-top: 1px solid #e5e3dc; margin: 24px 0;" />`);
    const r = rollup(p);
    const statusEmoji = r.overdue > 0 ? '🔴' : r.pct >= 75 ? '🟢' : r.pct >= 25 ? '🟡' : '⚪';
    parts.push(`<h2 style="font-size: 18px; font-weight: 600; margin: 0 0 8px;">${statusEmoji} ${escapeHtml(p.name)}</h2>`);
    const statusBits = [`${r.pct}% complete`, `${r.done}/${r.total} milestones`];
    if (r.overdue > 0) statusBits.push(`⚠ ${r.overdue} overdue`);
    if (r.dropped > 0) statusBits.push(`${r.dropped} dropped`);
    parts.push(`<p style="margin: 0 0 16px;"><strong>Status:</strong> ${escapeHtml(statusBits.join(' · '))}</p>`);

    if (newDecisions.length > 0) {
      parts.push(`<h3 style="font-size: 14px; font-weight: 600; margin: 20px 0 8px;">📋 Decisions (${newDecisions.length})</h3>`);
      parts.push(`<table style="border-collapse: collapse; width: 100%; margin: 0 0 12px; font-size: 13px; ${FONT}">`);
      parts.push(`<thead><tr><th style="${cellHead}">#</th><th style="${cellHead}">Decision</th><th style="${cellHead}">Decided by</th><th style="${cellHead}">Date</th><th style="${cellHead}">Status</th></tr></thead><tbody>`);
      newDecisions.forEach((d, i) => {
        parts.push(`<tr>
          <td style="${cell}">${i + 1}</td>
          <td style="${cell}">${escapeHtml(d.text)}</td>
          <td style="${cell}">${escapeHtml((d.decidedBy || []).join(', '))}</td>
          <td style="${cell}">${escapeHtml(fmtDateShort(d.date))}</td>
          <td style="${cell}">${statusPill(d.followUpStatus)}</td>
        </tr>`);
      });
      parts.push(`</tbody></table>`);
      const withContext = newDecisions.filter((d) => d.context && d.context.trim());
      if (withContext.length > 0) {
        parts.push(`<p style="margin: 8px 0 4px; font-weight: 600; font-size: 13px;">Context:</p><ul style="margin: 0 0 12px; padding-left: 22px; color: #6e6c66; font-size: 13px;">`);
        for (const d of withContext) {
          const idx = newDecisions.indexOf(d) + 1;
          parts.push(`<li><em>#${idx}</em> — ${escapeHtml((d.context || '').replace(/\n/g, ' '))}</li>`);
        }
        parts.push(`</ul>`);
      }
      const withMeeting = newDecisions.filter((d) => d.meetingRef && d.meetingRef.trim());
      if (withMeeting.length > 0) {
        const refs = [...new Set(withMeeting.map((d) => d.meetingRef.trim()))];
        parts.push(`<p style="margin: 8px 0; font-size: 12px; color: #6e6c66; font-style: italic;">Meeting references: ${escapeHtml(refs.join(' · '))}</p>`);
      }
    }

    if (newActions.length > 0) {
      parts.push(`<h3 style="font-size: 14px; font-weight: 600; margin: 20px 0 8px;">✅ Action items (${newActions.length})</h3>`);
      const byPic = new Map();
      for (const a of newActions) {
        const k = a.pic || '— Unassigned —';
        if (!byPic.has(k)) byPic.set(k, []);
        byPic.get(k).push(a);
      }
      for (const [pic, items] of byPic.entries()) {
        parts.push(`<h4 style="font-size: 13px; font-weight: 500; margin: 14px 0 6px;">👤 ${escapeHtml(pic)} (${items.length})</h4>`);
        parts.push(`<table style="border-collapse: collapse; width: 100%; margin: 0 0 8px; font-size: 13px; ${FONT}">`);
        parts.push(`<thead><tr><th style="${cellHead}">#</th><th style="${cellHead}">Action</th><th style="${cellHead}">Due</th><th style="${cellHead}">Priority</th></tr></thead><tbody>`);
        items.forEach((a, i) => {
          parts.push(`<tr>
            <td style="${cell}">${i + 1}</td>
            <td style="${cell}">${escapeHtml(a.title)}</td>
            <td style="${cell}">${a.dueDate ? escapeHtml(fmtDateShort(a.dueDate)) : '—'}</td>
            <td style="${cell}">${prioPill(a.priority)}</td>
          </tr>`);
        });
        parts.push(`</tbody></table>`);
        const withDesc = items.filter((a) => a.description && a.description.trim());
        if (withDesc.length > 0) {
          parts.push(`<ul style="margin: 0 0 12px; padding-left: 22px; color: #6e6c66; font-size: 13px;">`);
          for (const a of withDesc) {
            const idx = items.indexOf(a) + 1;
            parts.push(`<li><em>#${idx}</em> — ${escapeHtml((a.description || '').replace(/\n/g, ' '))}</li>`);
          }
          parts.push(`</ul>`);
        }
      }
    }

    if (resolvedInRange.length > 0) {
      parts.push(`<h3 style="font-size: 14px; font-weight: 600; margin: 20px 0 8px;">✓ Blockers resolved (${resolvedInRange.length})</h3>`);
      parts.push(`<ul style="margin: 0 0 12px; padding-left: 22px;">`);
      for (const { task, update } of resolvedInRange) {
        parts.push(`<li><strong>${escapeHtml(task.name)}</strong> — <em>resolved by ${escapeHtml(update.resolvedBy)} on ${escapeHtml(fmtDateTime(update.resolvedAt))}</em>`);
        if (update.resolution) {
          parts.push(`<blockquote style="margin: 4px 0 4px 12px; padding: 4px 12px; border-left: 3px solid #e5e3dc; color: #6e6c66; font-size: 13px;">${escapeHtml((update.resolution || '').replace(/\n/g, ' '))}</blockquote>`);
        }
        parts.push(`</li>`);
      }
      parts.push(`</ul>`);
    }

    if (newUpdates.length > 0) {
      parts.push(`<h3 style="font-size: 14px; font-weight: 600; margin: 20px 0 8px;">💬 Discussion notes (${newUpdates.length})</h3>`);
      for (const pg of p.programs || []) {
        for (const ws of pg.workstreams || []) {
          for (const t of ws.tasks || []) {
            const updatesForTask = newUpdates.filter((u) => u.task.id === t.id);
            if (!updatesForTask.length) continue;
            parts.push(`<p style="margin: 12px 0 4px; font-weight: 600; font-size: 13px;">${escapeHtml(`${pg.name} › ${ws.name} › ${t.name}`)}</p>`);
            parts.push(`<ul style="margin: 0 0 8px; padding-left: 22px; font-size: 13px;">`);
            for (const { update } of updatesForTask) {
              const flagIcon = update.isBlocker ? (update.resolvedAt ? '✓' : '🚩') : '•';
              const text = (update.text || '').replace(/\n/g, ' ');
              parts.push(`<li>${flagIcon} <strong>${escapeHtml(update.author)}</strong> <em style="color: #95938c; font-size: 12px;">(${escapeHtml(fmtDateTime(update.timestamp))})</em>: ${escapeHtml(text)}</li>`);
            }
            parts.push(`</ul>`);
          }
        }
      }
    }
  }

  parts.push(`<hr style="border: none; border-top: 1px solid #e5e3dc; margin: 24px 0;" />`);
  parts.push(`<p style="font-size: 11px; color: #95938c; font-style: italic; margin: 0;">Generated ${escapeHtml(fmtDateTime(new Date()))} from AF Master Project Tracker.</p>`);
  parts.push(`</div>`);
  return parts.join('');
}

function MeetingExportDialog({ projects, onClose, dialogs, showToast, author, teamMembers }) {
  const today_ = toISODate(new Date());
  const [dateFrom, setDateFrom] = useState(today_);
  const [dateTo, setDateTo] = useState(today_);
  const [selectedProjectIds, setSelectedProjectIds] = useState(Object.keys(projects));
  const [attendeesInput, setAttendeesInput] = useState(author || '');
  const [preview, setPreview] = useState(null);
  const [copyHelper, setCopyHelper] = useState(null); // { html, title, gmailUrl } | null

  const allProjects = Object.values(projects);

  const toggleProject = (id) => {
    setSelectedProjectIds(selectedProjectIds.includes(id)
      ? selectedProjectIds.filter((x) => x !== id)
      : [...selectedProjectIds, id]
    );
  };

  const generate = () => {
    const attendees = attendeesInput.split(',').map((s) => s.trim()).filter(Boolean);
    const md = generateMeetingMinutes({ projects, dateFrom, dateTo, selectedProjectIds, attendees });
    setPreview(md);
  };

  const copyToClipboard = () => {
    if (!preview) return;
    copyPlainText(preview, showToast).then((ok) => {
      if (ok) showToast('Copied as Markdown');
    });
  };

  // "Copy rich text" button — opens CopyHelperModal with rendered HTML (no Gmail link).
  // User can paste the formatted content anywhere (Notion, Google Docs, email).
  const copyAsRich = () => {
    if (!preview) return;
    const attendees = attendeesInput.split(',').map((s) => s.trim()).filter(Boolean);
    const html = generateMeetingMinutesHtml({ projects, dateFrom, dateTo, selectedProjectIds, attendees });
    const titleDate = dateFrom === dateTo ? fmtDate(dateFrom) : `${fmtDate(dateFrom)} → ${fmtDate(dateTo)}`;
    setCopyHelper({
      html,
      title: `Meeting Minutes — ${titleDate}`,
      gmailUrl: null,
    });
  };

  const downloadMarkdown = () => {
    if (!preview) return;
    const blob = new Blob([preview], { type: 'text/markdown' });
    const fname = `meeting_minutes_${dateFrom}${dateFrom !== dateTo ? '_to_' + dateTo : ''}.md`;
    downloadBlob(blob, fname);
    showToast('Downloaded');
  };

  // Open in Gmail: opens CopyHelperModal with rendered HTML + Open Gmail button.
  // User Ctrl+C in modal → copies rich text → click Open Gmail → switch tab → Ctrl+V.
  const openInEmail = () => {
    if (!preview) return;
    const subject = `Meeting Minutes — ${dateFrom === dateTo ? fmtDate(dateFrom) : fmtDate(dateFrom) + ' to ' + fmtDate(dateTo)}`;
    const attendees = attendeesInput.split(',').map((s) => s.trim()).filter(Boolean);
    const html = generateMeetingMinutesHtml({ projects, dateFrom, dateTo, selectedProjectIds, attendees });
    const gmailUrl = buildGmailUrl({ subject });
    const titleDate = dateFrom === dateTo ? fmtDate(dateFrom) : `${fmtDate(dateFrom)} → ${fmtDate(dateTo)}`;
    setCopyHelper({
      html,
      title: `Meeting Minutes — ${titleDate}`,
      gmailUrl,
    });
  };

  return (
    <Modal title="Generate Meeting Minutes" onClose={onClose} width={720}>
      {!preview && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <FieldLabel>From date</FieldLabel>
              <Input type="date" value={dateFrom} onChange={setDateFrom} />
            </div>
            <div style={{ flex: 1 }}>
              <FieldLabel>To date</FieldLabel>
              <Input type="date" value={dateTo} onChange={setDateTo} />
            </div>
          </div>

          <FieldLabel>Attendees (comma-separated)</FieldLabel>
          <Input value={attendeesInput} onChange={setAttendeesInput} placeholder="e.g., An, Bình, BOD" />

          <div style={{ height: 14 }} />
          <FieldLabel>Include projects</FieldLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto', padding: 8, background: TOK.bg, borderRadius: 6 }}>
            {allProjects.map((p) => (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={selectedProjectIds.includes(p.id)} onChange={() => toggleProject(p.id)} style={{ accentColor: TOK.accent }} />
                {p.name}
              </label>
            ))}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: TOK.subtle, lineHeight: 1.5 }}>
            Updates, decisions, and action items created within the date range will be included, grouped by project and milestone.
          </div>

          <div style={{ marginTop: 18, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn variant="primary" disabled={selectedProjectIds.length === 0} onClick={generate}>Generate preview</Btn>
          </div>
        </>
      )}

      {preview && (
        <>
          <div style={{ marginBottom: 10, fontSize: 11, color: TOK.muted }}>
            Preview (Markdown). You can copy, download, or open directly in your email client.
          </div>
          <textarea
            readOnly
            value={preview}
            style={{
              width: '100%', height: 320, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11.5,
              padding: 10, border: '1px solid ' + TOK.lineStrong, borderRadius: 6,
              background: TOK.bg, color: TOK.ink, resize: 'vertical', lineHeight: 1.55,
            }}
          />
          <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Btn onClick={() => setPreview(null)}>Back</Btn>
            <Btn onClick={copyToClipboard}>📋 Copy Markdown</Btn>
            <Btn onClick={copyAsRich}>✨ Copy rich text</Btn>
            <Btn onClick={downloadMarkdown}><Download size={11} /> Download .md</Btn>
            <Btn variant="primary" onClick={openInEmail}>📧 Open in Gmail</Btn>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: TOK.subtle, lineHeight: 1.5 }}>
            <strong>Open in Gmail:</strong> shows the formatted email — press <kbd style={{ padding: '0 4px', background: TOK.bg, border: '1px solid ' + TOK.lineStrong, borderRadius: 3, fontSize: 10 }}>Ctrl+C</kbd> to copy (content is auto-selected), then click "Open Gmail" and paste in the body with <kbd style={{ padding: '0 4px', background: TOK.bg, border: '1px solid ' + TOK.lineStrong, borderRadius: 3, fontSize: 10 }}>Ctrl+V</kbd>.
          </div>
        </>
      )}
      {copyHelper && (
        <CopyHelperModal
          html={copyHelper.html}
          title={copyHelper.title}
          gmailUrl={copyHelper.gmailUrl}
          onClose={() => setCopyHelper(null)}
        />
      )}
    </Modal>
  );
}

/* ═════════ MIND MAP VIEW ═════════ */
const NODE_W = 240, NODE_H = 56, H_GAP = 54, V_GAP = 10;

function layoutTree(root) {
  // returns flat list of { id, depth, x, y, name, kind, data, children: [...ids], parentId }
  let cursor = 0;
  const nodes = [];
  function visit(n, depth, parentId) {
    const childIds = [];
    const myIdx = nodes.length;
    nodes.push({ id: n._id, depth, x: depth * (NODE_W + H_GAP), y: 0, name: n.name, kind: n.kind, data: n._ref, parentId, childrenIds: childIds, isCollapsed: n._collapsed });
    if (!n._collapsed && n.children && n.children.length) {
      const startY = cursor;
      for (const c of n.children) { childIds.push(c._id); visit(c, depth + 1, n._id); }
      const endY = cursor - (NODE_H + V_GAP);
      nodes[myIdx].y = (startY + endY) / 2;
    } else {
      nodes[myIdx].y = cursor;
      cursor += NODE_H + V_GAP;
    }
  }
  visit(root, 0, null);
  return nodes;
}

function buildMindTree(project, collapsed) {
  const mk = (o, kind, children, ref) => ({ _id: o.id, _ref: ref ?? o, name: o.name, kind, children, _collapsed: collapsed.has(o.id) });
  const programs = (project.programs || []).map((p) => {
    const ws = (p.workstreams || []).map((w) => {
      const tasks = sortTasksByStart(w.tasks).map((t) => mk(t, 'task', null));
      return mk(w, 'workstream', tasks);
    });
    return mk(p, 'program', ws);
  });
  return mk(project, 'project', programs);
}

function MindMapView({ project, onTaskClick, selectedTaskId, scopeProgramId, onProjectUpdate, onActivity, dialogs, roles = null, nameOf = null, onOpenRoles, isOwner = false, uid = null }) {
  // Wave 1 U6 (v2): menu items the rules would refuse are hidden. v1 / Owner: all.
  const capsFor = (programId, wsId) => uiCaps({ isOwner, isV2: !!project.__v2, roles, uid, programId, wsId });
  // Drop a separator left at the end (or doubled) once items are hidden.
  const tidyMenu = (items) => items.filter(Boolean).filter((it, i, arr) => !it.separator || (i < arr.length - 1 && !arr[i + 1].separator && i > 0));
  // Role assignment: v2 projects show PM / Sub-PM on nodes; changes go through the Roles modal.
  const roleText = (n) => (nameOf ? mindNodeRoleText(roles, n.kind, n.id, nameOf) : null);
  // Filter project if scoping to a program
  const scopedProject = useMemo(() => {
    if (!scopeProgramId) return project;
    const pg = (project.programs || []).find((p) => p.id === scopeProgramId);
    if (!pg) return project;
    return { ...project, programs: [pg] };
  }, [project, scopeProgramId]);

  const [collapsed, setCollapsed] = useState(() => {
    const s = new Set();
    for (const pg of scopedProject.programs || [])
      for (const ws of pg.workstreams || []) s.add(ws.id);
    return s;
  });
  const [zoom, setZoom] = useState(0.8);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [panning, setPanning] = useState(null);
  const [menu, setMenu] = useState(null); // { x, y, node }
  const containerRef = useRef(null);

  // When scope changes, reset collapse defaults
  useEffect(() => {
    const s = new Set();
    for (const pg of scopedProject.programs || []) {
      // With scope, expand the program and show workstreams (but not their tasks)
      if (!scopeProgramId) s.add(pg.id); // collapse programs when showing all
      for (const ws of pg.workstreams || []) s.add(ws.id);
    }
    setCollapsed(s);
    // eslint-disable-next-line
  }, [scopeProgramId]);

  const tree = useMemo(() => buildMindTree(scopedProject, collapsed), [scopedProject, collapsed]);
  const nodes = useMemo(() => layoutTree(tree), [tree]);

  const nodeMap = useMemo(() => { const m = new Map(); nodes.forEach((n) => m.set(n.id, n)); return m; }, [nodes]);
  const edges = useMemo(() => {
    const e = [];
    for (const n of nodes) for (const cid of n.childrenIds) {
      const c = nodeMap.get(cid); if (c) e.push({ from: n, to: c });
    }
    return e;
  }, [nodes, nodeMap]);

  const toggle = (id) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const expandAll = () => setCollapsed(new Set());
  const collapseToPrograms = () => {
    const s = new Set();
    for (const pg of scopedProject.programs || []) {
      s.add(pg.id);
      for (const ws of pg.workstreams || []) s.add(ws.id);
    }
    setCollapsed(s);
  };
  const showWorkstreams = () => {
    const s = new Set();
    for (const pg of scopedProject.programs || [])
      for (const ws of pg.workstreams || []) s.add(ws.id);
    setCollapsed(s);
  };

  const fit = useCallback(() => {
    if (!nodes.length || !containerRef.current) return;
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs) + NODE_W;
    const minY = Math.min(...ys) - NODE_H / 2, maxY = Math.max(...ys) + NODE_H / 2;
    const bw = maxX - minX, bh = maxY - minY;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const s = Math.min((cw - 80) / bw, (ch - 80) / bh, 1);
    setZoom(s);
    setPan({ x: (cw - bw * s) / 2 - minX * s, y: (ch - bh * s) / 2 - minY * s });
  }, [nodes]);

  useEffect(() => { fit(); /* eslint-disable-next-line */ }, [scopeProgramId]);

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.tagName === 'rect' || e.target.tagName === 'text' || e.target.tagName === 'g') {
      // Don't start pan if clicking a node element
      const inGroup = e.target.closest('g[data-mindnode]');
      if (inGroup) return;
    }
    setPanning({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    setMenu(null);
  };
  useEffect(() => {
    if (!panning) return;
    const move = (e) => setPan({ x: e.clientX - panning.x, y: e.clientY - panning.y });
    const up = () => setPanning(null);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [panning]);

  const onWheel = (e) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    const nz = Math.max(0.25, Math.min(2, zoom * (1 + delta)));
    const rect = containerRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const nx = mx - ((mx - pan.x) * nz) / zoom;
    const ny = my - ((my - pan.y) * nz) / zoom;
    setZoom(nz); setPan({ x: nx, y: ny });
  };

  const openMenu = (n, clientX, clientY) => {
    const rect = containerRef.current.getBoundingClientRect();
    setMenu({ x: clientX - rect.left, y: clientY - rect.top, node: n });
  };

  // Actions
  const actAddProgram = async () => {
    const name = await dialogs.prompt({ title: 'New program', placeholder: 'Program name', okLabel: 'Create' });
    if (!name) return;
    const p = { id: uid('p'), name, workstreams: [], raid: [] };
    onProjectUpdate({ ...project, programs: [...(project.programs || []), p] });
    // Expand the new program so its (empty) workstream slot is visible
    setCollapsed((s) => { const n = new Set(s); n.delete(p.id); return n; });
    onActivity({ type: 'program_add', description: `Added program "${p.name}"` });
  };
  const actAddWorkstream = async (pg) => {
    const name = await dialogs.prompt({ title: 'New work stream', message: `Under "${pg.name}"`, placeholder: 'Work stream name', okLabel: 'Create' });
    if (!name) return;
    const w = { id: uid('w'), name, tasks: [] };
    onProjectUpdate({ ...project, programs: project.programs.map((p) => p.id === pg.id ? { ...p, workstreams: [...(p.workstreams || []), w] } : p) });
    onActivity({ type: 'ws_add', description: `Added work stream "${w.name}" under "${pg.name}"` });
  };
  const actAddTask = async (pg, ws) => {
    const name = await dialogs.prompt({ title: 'New task', message: `Under "${ws.name}"`, placeholder: 'Task name', okLabel: 'Create' });
    if (!name) return;
    const t = { id: uid('t'), name, status: 'Planned', pic: null, contributors: [], creditSharesMode: 'auto', start: null, end: null, duration: null, deliverables: null, dependencies: null, checkIns: [], updates: [], health: 'green' };
    onProjectUpdate({
      ...project, programs: project.programs.map((p) =>
        p.id === pg.id ? { ...p, workstreams: p.workstreams.map((w) => w.id === ws.id ? { ...w, tasks: [...(w.tasks || []), t] } : w) } : p
      ),
    });
    // Expand the workstream so new task is visible
    setCollapsed((s) => { const n = new Set(s); n.delete(ws.id); return n; });
    onActivity({ type: 'task_add', description: `Added task "${t.name}" in "${ws.name}"` });
  };
  const actRename = async (kind, pg, ws) => {
    if (kind === 'program') {
      const name = await dialogs.prompt({ title: 'Rename program', initial: pg.name, okLabel: 'Rename' });
      if (!name || name === pg.name) return;
      const old = pg.name;
      onProjectUpdate({ ...project, programs: project.programs.map((p) => p.id === pg.id ? { ...p, name } : p) });
      onActivity({ type: 'program_rename', description: `Renamed program "${old}" → "${name}"` });
    } else {
      const name = await dialogs.prompt({ title: 'Rename work stream', initial: ws.name, okLabel: 'Rename' });
      if (!name || name === ws.name) return;
      const old = ws.name;
      onProjectUpdate({
        ...project, programs: project.programs.map((p) =>
          p.id === pg.id ? { ...p, workstreams: p.workstreams.map((w) => w.id === ws.id ? { ...w, name } : w) } : p
        ),
      });
      onActivity({ type: 'ws_rename', description: `Renamed work stream "${old}" → "${name}"` });
    }
  };
  const actDelete = async (kind, pg, ws) => {
    if (kind === 'program') {
      if (taskCountUnder(pg) > 0) { await dialogs.alert({ title: "Can't delete", message: DELETE_HAS_TASKS_MESSAGE }); return; }
      const r = rollup(pg);
      const ok = await dialogs.confirm({ title: 'Delete program?', message: `Delete program "${pg.name}"? This cannot be undone.`, danger: true, okLabel: 'Delete' });
      if (!ok) return;
      onProjectUpdate({ ...project, programs: project.programs.filter((p) => p.id !== pg.id) });
      onActivity({ type: 'program_delete', description: `Deleted program "${pg.name}" (${r.total} tasks)` });
    } else {
      if (taskCountUnder(ws) > 0) { await dialogs.alert({ title: "Can't delete", message: DELETE_HAS_TASKS_MESSAGE }); return; }
      const ok = await dialogs.confirm({ title: 'Delete work stream?', message: `Delete work stream "${ws.name}"? This cannot be undone.`, danger: true, okLabel: 'Delete' });
      if (!ok) return;
      onProjectUpdate({
        ...project, programs: project.programs.map((p) =>
          p.id === pg.id ? { ...p, workstreams: p.workstreams.filter((w) => w.id !== ws.id) } : p
        ),
      });
      onActivity({ type: 'ws_delete', description: `Deleted work stream "${ws.name}" (${(ws.tasks || []).length} tasks)` });
    }
  };

  const menuItems = (node) => {
    if (!node) return [];
    if (node.kind === 'project') {
      return tidyMenu([
        capsFor(null, null).programEdit && { label: 'Add program', icon: <Plus size={13} />, onClick: actAddProgram },
        { separator: true },
        { label: 'Expand all', icon: <ChevronDown size={13} />, onClick: expandAll },
        { label: 'Collapse to programs', icon: <ChevronRight size={13} />, onClick: collapseToPrograms },
        { label: 'Fit view', icon: <Maximize2 size={13} />, onClick: fit },
      ]);
    }
    if (node.kind === 'program') {
      const pg = node.data;
      const c = capsFor(pg.id, null);
      return tidyMenu([
        c.wsAdd && { label: 'Add work stream', icon: <Plus size={13} />, onClick: () => actAddWorkstream(pg) },
        { label: (node.isCollapsed ? 'Expand' : 'Collapse'), icon: node.isCollapsed ? <ChevronDown size={13} /> : <ChevronRight size={13} />, onClick: () => toggle(node.id) },
        ...(roles && onOpenRoles ? [{ label: 'Roles (PM, Deputy)…', icon: <Users size={13} />, onClick: () => onOpenRoles({ programId: pg.id }) }] : []),
        { separator: true },
        c.programEdit && { label: 'Rename program', icon: <Edit2 size={13} />, onClick: () => actRename('program', pg) },
        c.programEdit && { label: 'Delete program', icon: <Trash2 size={13} />, danger: true, onClick: () => actDelete('program', pg) },
      ]);
    }
    if (node.kind === 'workstream') {
      const ws = node.data;
      // Find parent program
      const pg = (project.programs || []).find((p) => (p.workstreams || []).some((w) => w.id === ws.id));
      const c = capsFor(pg ? pg.id : null, ws.id);
      return tidyMenu([
        c.taskAdd && { label: 'Add task', icon: <Plus size={13} />, onClick: () => actAddTask(pg, ws) },
        { label: (node.isCollapsed ? 'Expand' : 'Collapse'), icon: node.isCollapsed ? <ChevronDown size={13} /> : <ChevronRight size={13} />, onClick: () => toggle(node.id) },
        ...(roles && onOpenRoles && pg ? [{ label: 'Roles (Sub-PM)…', icon: <Users size={13} />, onClick: () => onOpenRoles({ programId: pg.id, wsId: ws.id }) }] : []),
        { separator: true },
        c.wsEdit && { label: 'Rename work stream', icon: <Edit2 size={13} />, onClick: () => actRename('workstream', pg, ws) },
        c.wsDelete && { label: 'Delete work stream', icon: <Trash2 size={13} />, danger: true, onClick: () => actDelete('workstream', pg, ws) },
      ]);
    }
    return [];
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: FONT_STACK, background: TOK.bg }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid ' + TOK.line, background: TOK.surface, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {capsFor(null, null).programEdit && <Btn size="sm" variant="primary" onClick={actAddProgram} title="Add a new program to this project"><FolderPlus size={12} /> Program</Btn>}
        {capsFor(null, null).programEdit && <div style={{ width: 1, height: 20, background: TOK.line, margin: '0 2px' }} />}
        <Btn size="sm" onClick={collapseToPrograms}>Programs only</Btn>
        <Btn size="sm" onClick={showWorkstreams}>Work streams</Btn>
        <Btn size="sm" onClick={expandAll}>Expand all</Btn>
        <Btn size="sm" onClick={fit}><MapIcon size={12} /> Fit</Btn>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: TOK.muted, alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: TOK.plannedFg }} /> Planned</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: TOK.inprogFg }} /> In Progress</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: TOK.doneFg }} /> Completed</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: TOK.overdueFg }} /> Overdue</span>
        </div>
      </div>

      <div ref={containerRef} onMouseDown={onMouseDown} onWheel={onWheel}
        style={{ flex: 1, overflow: 'hidden', position: 'relative', cursor: panning ? 'grabbing' : 'grab' }}>
        <svg width="100%" height="100%" style={{ display: 'block' }}>
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {edges.map((e, i) => {
              const x1 = e.from.x + NODE_W, y1 = e.from.y + NODE_H / 2;
              const x2 = e.to.x, y2 = e.to.y + NODE_H / 2;
              const mx = (x1 + x2) / 2;
              const d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
              return <path key={i} d={d} stroke={TOK.lineStrong} strokeWidth="1.2" fill="none" />;
            })}
            {(() => {
              const firstTaskIdx = nodes.findIndex((x) => x.kind === 'task');
              return nodes.map((n, idx) => (
                <MindNode
                  key={n.id}
                  n={n}
                  isFirstTask={idx === firstTaskIdx}
                  onToggle={toggle}
                  onTaskClick={onTaskClick}
                  selectedTaskId={selectedTaskId}
                  onOpenMenu={openMenu}
                  roleText={roleText(n)}
                />
              ));
            })()}
          </g>
        </svg>
        {menu && (
          <PopoverMenu x={menu.x} y={menu.y} items={menuItems(menu.node)} onClose={() => setMenu(null)} />
        )}
        <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', fontSize: 11, color: TOK.muted, background: TOK.surface, border: '1px solid ' + TOK.line, padding: '4px 10px', borderRadius: 999 }}>
          Click node to expand · Click ⋯ to add/rename/delete · Scroll to zoom · Drag to pan
        </div>
      </div>
    </div>
  );
}

function MindNode({ n, isFirstTask, onToggle, onTaskClick, selectedTaskId, onOpenMenu, roleText = null }) {
  const isTask = n.kind === 'task';
  const isSelected = isTask && n.data.id === selectedTaskId;
  const isDropped = isTask && n.data.status === 'Dropped';
  let bg = TOK.surface, fg = TOK.ink, border = TOK.lineStrong;
  if (n.kind === 'project') { bg = TOK.projectBg; fg = TOK.projectFg; border = TOK.projectFg; }
  else if (n.kind === 'program') { bg = TOK.programBg; fg = TOK.programFg; border = TOK.programFg; }
  else if (n.kind === 'workstream') { bg = TOK.workstreamBg; fg = TOK.workstreamFg; border = TOK.workstreamFg; }
  else if (isTask) {
    const t = n.data;
    if (isDropped) { bg = TOK.droppedBg; border = TOK.droppedFg; fg = TOK.droppedFg; }
    else if (isOverdue(t)) { bg = TOK.overdueBg; border = TOK.overdueFg; fg = TOK.overdueFg; }
    else if (t.status === 'Completed') { bg = TOK.doneBg; border = TOK.doneFg; fg = TOK.doneFg; }
    else if (t.status === 'InProgress') { bg = TOK.inprogBg; border = TOK.inprogFg; fg = TOK.inprogFg; }
    else { bg = TOK.plannedBg; border = TOK.plannedFg; fg = TOK.plannedFg; }
  }

  const r = rollup(n.data);
  const progressPct = isTask ? (STATUS_WEIGHT[n.data.status || 'Planned'] * 100 || 0) : r.pct;
  const label = n.name || '';
  const truncate = (s, m) => !s ? '' : (s.length > m ? s.slice(0, m - 1) + '…' : s);
  const sub = isTask
    ? `${STATUS_LABEL[n.data.status || 'Planned']}${n.data.pic ? ' · ' + n.data.pic : ''}`
    : `${roleText ? roleText + ' · ' : ''}${r.pct}% · ${r.done}/${r.total} task${r.total === 1 ? '' : 's'}${r.dropped ? ' · ' + r.dropped + ' dropped' : ''}`;

  const hasMenu = (n.kind === 'project' || n.kind === 'program' || n.kind === 'workstream');
  const opacity = isDropped ? 0.55 : 1;
  const taskHealth = isTask ? (n.data.health || 'green') : null;
  const healthColor = taskHealth === 'red' ? TOK.healthRed : taskHealth === 'amber' ? TOK.healthAmber : TOK.healthGreen;

  return (
    <g data-mindnode="true" data-tour={isFirstTask ? 'first-task' : undefined} transform={`translate(${n.x},${n.y})`} opacity={opacity}>
      <g style={{ cursor: 'pointer' }}
        onClick={(e) => {
          e.stopPropagation();
          if (isTask) onTaskClick(n.data.id);
          else onToggle(n.id);
        }}>
        <rect width={hasMenu ? NODE_W - 28 : NODE_W} height={NODE_H} rx="8" ry="8" fill={bg}
          stroke={isSelected ? TOK.ink : border} strokeWidth={isSelected ? 2 : 1}
          strokeDasharray={n.isCollapsed ? '3,3' : undefined} />
        {/* Health dot for tasks: small circle on the left edge */}
        {isTask && !isDropped && (
          <circle cx="6" cy={NODE_H / 2} r="3" fill={healthColor} />
        )}
        <text x={isTask && !isDropped ? 14 : 12} y="20" fontSize="13" fontWeight="500" fill={fg}
          textDecoration={isDropped ? 'line-through' : undefined}
          style={{ pointerEvents: 'none', userSelect: 'none' }}>{truncate(label, 28)}</text>
        <text x={isTask && !isDropped ? 14 : 12} y="36" fontSize="10.5" fill={TOK.muted} style={{ pointerEvents: 'none', userSelect: 'none' }}>{truncate(sub, roleText ? 36 : 32)}</text>
        {!isTask && (
          <>
            <rect x="12" y="43" width={NODE_W - 40} height="4" rx="2" fill="rgba(0,0,0,0.06)" />
            <rect x="12" y="43" width={Math.max(0, (NODE_W - 40) * (progressPct / 100))} height="4" rx="2"
              fill={progressPct >= 75 ? TOK.doneFg : progressPct >= 25 ? TOK.inprogFg : TOK.plannedFg} />
          </>
        )}
      </g>
      {hasMenu && (
        <g style={{ cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation();
            onOpenMenu(n, e.clientX, e.clientY);
          }}>
          <rect x={NODE_W - 28} y="0" width="28" height={NODE_H} rx="8" fill={bg}
            stroke={border} strokeWidth="1" strokeDasharray={n.isCollapsed ? '3,3' : undefined} />
          <line x1={NODE_W - 28} y1="6" x2={NODE_W - 28} y2={NODE_H - 6} stroke={border} strokeWidth="0.8" opacity="0.35" />
          <text x={NODE_W - 14} y={NODE_H / 2 + 5} fontSize="15" fontWeight="600" fill={fg} textAnchor="middle" style={{ pointerEvents: 'none', userSelect: 'none' }}>⋯</text>
          {n.childrenIds.length > 0 && (
            <text x={NODE_W - 14} y={NODE_H - 8} fontSize="9" fill={TOK.muted} textAnchor="middle" style={{ pointerEvents: 'none', userSelect: 'none' }}>
              {n.isCollapsed ? '▸' : '▾'}
            </text>
          )}
        </g>
      )}
    </g>
  );
}

/* ═════════ OUTLINE VIEW (editable, drag-drop) ═════════ */
function OutlineView({ project, onProjectUpdate, onTaskClick, selectedTaskId, onActivity, dialogs, scopeProgramId, isOwner = false, roles = null, me = null, people = [], onChangeRole }) {
  const dirIndex = useContext(DirectoryIndexContext);
  // Role assignment: pickers only on v2 projects.
  const showRoles = !!(project.__v2 && roles && me);
  // Wave 1 U6 (v2): hide what the rules would refuse. v1 / Owner: all true.
  const capsFor = (programId, wsId) => uiCaps({ isOwner, isV2: !!project.__v2, roles, uid: me?.uid || null, programId, wsId });
  const projectCaps = capsFor(null, null);
  // Filter programs by scope
  const visiblePrograms = useMemo(() => {
    if (!scopeProgramId) return project.programs || [];
    const pg = (project.programs || []).find((p) => p.id === scopeProgramId);
    return pg ? [pg] : (project.programs || []);
  }, [project, scopeProgramId]);

  const [expanded, setExpanded] = useState(() => {
    const s = new Set(); for (const pg of project.programs || []) s.add(pg.id); return s;
  });

  // When scope changes, ensure the scoped program + its workstreams are expanded
  useEffect(() => {
    if (scopeProgramId) {
      setExpanded((prev) => {
        const s = new Set(prev);
        s.add(scopeProgramId);
        const pg = (project.programs || []).find((p) => p.id === scopeProgramId);
        if (pg) for (const ws of pg.workstreams || []) s.add(ws.id);
        return s;
      });
    }
    // eslint-disable-next-line
  }, [scopeProgramId]);
  const [query, setQuery] = useState('');
  const [dragInfo, setDragInfo] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const toggleExpand = (id) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const addProgram = async () => {
    const name = await dialogs.prompt({ title: 'New program', placeholder: 'Program name', okLabel: 'Create' });
    if (!name) return;
    const p = { id: uid('p'), name, workstreams: [], raid: [] };
    onProjectUpdate({ ...project, programs: [...(project.programs || []), p] });
    setExpanded((s) => new Set([...s, p.id]));
    onActivity({ type: 'program_add', description: `Added program "${p.name}"` });
  };
  const renameProgram = async (pg) => {
    const name = await dialogs.prompt({ title: 'Rename program', initial: pg.name, okLabel: 'Rename' });
    if (!name || name === pg.name) return;
    const old = pg.name;
    onProjectUpdate({ ...project, programs: project.programs.map((p) => p.id === pg.id ? { ...p, name } : p) });
    onActivity({ type: 'program_rename', description: `Renamed program "${old}" → "${name}"` });
  };
  const deleteProgram = async (pg) => {
    if (taskCountUnder(pg) > 0) { await dialogs.alert({ title: "Can't delete", message: DELETE_HAS_TASKS_MESSAGE }); return; }
    const r = rollup(pg);
    const ok = await dialogs.confirm({ title: 'Delete program?', message: `Delete program "${pg.name}"? This cannot be undone.`, danger: true, okLabel: 'Delete' });
    if (!ok) return;
    onProjectUpdate({ ...project, programs: project.programs.filter((p) => p.id !== pg.id) });
    onActivity({ type: 'program_delete', description: `Deleted program "${pg.name}" (${r.total} tasks)` });
  };
  const addWorkstream = async (pg) => {
    const name = await dialogs.prompt({ title: `New work stream`, message: `Under program "${pg.name}"`, placeholder: 'Work stream name', okLabel: 'Create' });
    if (!name) return;
    const w = { id: uid('w'), name, tasks: [] };
    onProjectUpdate({ ...project, programs: project.programs.map((p) => p.id === pg.id ? { ...p, workstreams: [...p.workstreams, w] } : p) });
    setExpanded((s) => new Set([...s, w.id]));
    onActivity({ type: 'ws_add', description: `Added work stream "${w.name}" under "${pg.name}"` });
  };
  const renameWorkstream = async (pg, ws) => {
    const name = await dialogs.prompt({ title: 'Rename work stream', initial: ws.name, okLabel: 'Rename' });
    if (!name || name === ws.name) return;
    const old = ws.name;
    onProjectUpdate({
      ...project, programs: project.programs.map((p) =>
        p.id === pg.id ? { ...p, workstreams: p.workstreams.map((w) => w.id === ws.id ? { ...w, name } : w) } : p
      ),
    });
    onActivity({ type: 'ws_rename', description: `Renamed work stream "${old}" → "${name}"` });
  };
  const deleteWorkstream = async (pg, ws) => {
    if (taskCountUnder(ws) > 0) { await dialogs.alert({ title: "Can't delete", message: DELETE_HAS_TASKS_MESSAGE }); return; }
    const n = (ws.tasks || []).length;
    const ok = await dialogs.confirm({ title: 'Delete work stream?', message: `Delete work stream "${ws.name}"? This cannot be undone.`, danger: true, okLabel: 'Delete' });
    if (!ok) return;
    onProjectUpdate({
      ...project, programs: project.programs.map((p) =>
        p.id === pg.id ? { ...p, workstreams: p.workstreams.filter((w) => w.id !== ws.id) } : p
      ),
    });
    onActivity({ type: 'ws_delete', description: `Deleted work stream "${ws.name}" (${n} tasks)` });
  };
  const addTask = async (pg, ws) => {
    const name = await dialogs.prompt({ title: 'New task', message: `Under "${ws.name}"`, placeholder: 'Task name', okLabel: 'Create' });
    if (!name) return;
    const t = { id: uid('t'), name, status: 'Planned', pic: null, contributors: [], creditSharesMode: 'auto', start: null, end: null, duration: null, deliverables: null, dependencies: null, checkIns: [], updates: [], health: 'green' };
    onProjectUpdate({
      ...project, programs: project.programs.map((p) =>
        p.id === pg.id ? { ...p, workstreams: p.workstreams.map((w) => w.id === ws.id ? { ...w, tasks: [...w.tasks, t] } : w) } : p
      ),
    });
    onActivity({ type: 'task_add', description: `Added task "${t.name}" in "${ws.name}"` });
  };

  // ─── Credit weight handlers (v22) ───
  const weightsLocked = !!project.weightsLocked;
  const appendWeightLog = (proj, level, id, to) => {
    const log = Array.isArray(proj.weightChangeLog) ? proj.weightChangeLog : [];
    const next = [...log, { ts: new Date().toISOString(), level, id, to }];
    if (next.length > 200) next.splice(0, next.length - 200);
    return { ...proj, weightChangeLog: next };
  };
  const updateProgramWeight = (pgId, newWeight) => {
    if (!isOwner || weightsLocked) return;
    const updated = {
      ...project,
      programs: project.programs.map((p) => p.id === pgId ? { ...p, weight: newWeight } : p),
    };
    const finalProj = appendWeightLog(updated, 'program', pgId, newWeight);
    onProjectUpdate(finalProj);
    onActivity({ type: 'weight_change', description: `Set program weight to ${newWeight == null ? 'auto' : newWeight + '%'}` });
  };
  const updateWorkstreamWeight = (pgId, wsId, newWeight) => {
    if (!isOwner || weightsLocked) return;
    const updated = {
      ...project,
      programs: project.programs.map((p) => p.id === pgId
        ? { ...p, workstreams: p.workstreams.map((w) => w.id === wsId ? { ...w, weight: newWeight } : w) }
        : p
      ),
    };
    const finalProj = appendWeightLog(updated, 'workstream', wsId, newWeight);
    onProjectUpdate(finalProj);
    onActivity({ type: 'weight_change', description: `Set workstream weight to ${newWeight == null ? 'auto' : newWeight + '%'}` });
  };
  const updateTaskWeight = (pgId, wsId, taskId, newWeight) => {
    if (!isOwner || weightsLocked) return;
    const updated = {
      ...project,
      programs: project.programs.map((p) => p.id === pgId
        ? { ...p, workstreams: p.workstreams.map((w) => w.id === wsId
            ? { ...w, tasks: w.tasks.map((t) => t.id === taskId ? { ...t, weight: newWeight } : t) }
            : w)
          }
        : p
      ),
    };
    const finalProj = appendWeightLog(updated, 'task', taskId, newWeight);
    onProjectUpdate(finalProj);
    onActivity({ type: 'weight_change', description: `Set task weight to ${newWeight == null ? 'auto' : newWeight + '%'}` });
  };

  // Pre-compute effective weights at each level
  const programWeights = useMemo(() => getEffectiveWeights(project.programs || []), [project.programs]);
  const wsWeightsMap = useMemo(() => {
    const m = new Map();
    for (const pg of (project.programs || [])) m.set(pg.id, getEffectiveWeights(pg.workstreams || []));
    return m;
  }, [project.programs]);
  const taskWeightsMap = useMemo(() => {
    const m = new Map();
    for (const pg of (project.programs || [])) {
      for (const ws of (pg.workstreams || [])) {
        const eligible = (ws.tasks || []).filter((t) => t.status !== 'Dropped');
        m.set(ws.id, { eligible, weights: getEffectiveWeights(eligible) });
      }
    }
    return m;
  }, [project.programs]);

  // Pre-compute credit allocation for inline cp display in WeightBadges + banner
  const creditInfo = useMemo(() => {
    const result = computeProjectCredits(project, dirIndex);
    const programCp = new Map();
    const workstreamCp = new Map();
    const taskCp = new Map();
    const programEarned = new Map();
    let workspaceEarned = 0;
    for (const b of result.breakdown) {
      workspaceEarned += b.actual || 0;
      if (b.isProjectLead) continue;
      if (b.programId) {
        programCp.set(b.programId, (programCp.get(b.programId) || 0) + (b.taskCp || 0));
        programEarned.set(b.programId, (programEarned.get(b.programId) || 0) + (b.actual || 0));
      }
      if (b.workstreamId) workstreamCp.set(b.workstreamId, (workstreamCp.get(b.workstreamId) || 0) + (b.taskCp || 0));
      if (b.taskId) taskCp.set(b.taskId, b.taskCp || 0);
    }
    // De-dupe taskCp to per-task total (sum across all PICs for same task)
    const taskCpAgg = new Map();
    for (const b of result.breakdown) {
      if (b.isProjectLead || !b.taskId) continue;
      const cur = taskCpAgg.get(b.taskId) || 0;
      taskCpAgg.set(b.taskId, cur + 0); // taskCp is constant per task — set once
      taskCpAgg.set(b.taskId, b.taskCp || 0);
    }
    // Top 3 PICs by projected
    const topPics = Array.from(result.perPic.entries())
      .map(([name, val]) => ({ name, ...val }))
      .sort((a, b) => b.projected - a.projected)
      .slice(0, 3);
    return { result, programCp, workstreamCp, taskCp: taskCpAgg, programEarned, workspaceEarned, topPics };
  }, [project, dirIndex]);

  const onDragStartTask = (e, task, pg, ws) => {
    setDragInfo({ kind: 'task', id: task.id, sourceWsId: ws.id, sourcePgId: pg.id });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
  };
  const onDragStartWs = (e, ws, pg) => {
    setDragInfo({ kind: 'ws', id: ws.id, sourcePgId: pg.id });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ws.id);
  };
  const onDragOverZone = (e, key) => {
    if (!dragInfo) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    setDragOver(key);
  };
  const dropTaskIntoWs = (targetPg, targetWs) => {
    if (!dragInfo || dragInfo.kind !== 'task') return;
    if (dragInfo.sourceWsId === targetWs.id) { setDragInfo(null); setDragOver(null); return; }
    let task = null, sourceWsName = '';
    const programs = project.programs.map((p) => ({
      ...p,
      workstreams: p.workstreams.map((w) => {
        if (w.id === dragInfo.sourceWsId) {
          sourceWsName = w.name;
          const remaining = [];
          for (const t of w.tasks) { if (t.id === dragInfo.id) task = t; else remaining.push(t); }
          return { ...w, tasks: remaining };
        }
        return w;
      }),
    }));
    if (!task) return;
    const finalPrograms = programs.map((p) =>
      p.id === targetPg.id ? { ...p, workstreams: p.workstreams.map((w) => w.id === targetWs.id ? { ...w, tasks: [...w.tasks, task] } : w) } : p
    );
    onProjectUpdate({ ...project, programs: finalPrograms });
    onActivity({ type: 'task_move', description: `Moved task "${task.name}" from "${sourceWsName}" to "${targetWs.name}"` });
    setDragInfo(null); setDragOver(null);
  };
  const dropWsIntoPg = (targetPg) => {
    if (!dragInfo || dragInfo.kind !== 'ws') return;
    if (dragInfo.sourcePgId === targetPg.id) { setDragInfo(null); setDragOver(null); return; }
    let ws = null, sourcePgName = '';
    const programs = project.programs.map((p) => {
      if (p.id === dragInfo.sourcePgId) {
        sourcePgName = p.name;
        const remaining = [];
        for (const w of p.workstreams) { if (w.id === dragInfo.id) ws = w; else remaining.push(w); }
        return { ...p, workstreams: remaining };
      }
      return p;
    });
    if (!ws) return;
    const finalPrograms = programs.map((p) =>
      p.id === targetPg.id ? { ...p, workstreams: [...p.workstreams, ws] } : p
    );
    onProjectUpdate({ ...project, programs: finalPrograms });
    onActivity({ type: 'ws_move', description: `Moved work stream "${ws.name}" from "${sourcePgName}" to "${targetPg.name}"` });
    setDragInfo(null); setDragOver(null);
  };

  const q = query.trim().toLowerCase();
  const matches = (s) => !q || (s || '').toLowerCase().includes(q);

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: FONT_STACK, background: TOK.bg }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid ' + TOK.line, background: TOK.surface, display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: TOK.muted }} />
          <Input value={query} onChange={setQuery} placeholder="Search programs, work streams, tasks…" style={{ paddingLeft: 30 }} />
        </div>
        <div style={{ flex: 1 }} />
        {projectCaps.programEdit && <Btn size="sm" onClick={addProgram}><FolderPlus size={12} /> Program</Btn>}
        <div style={{ fontSize: 11, color: TOK.muted }}>
          <Move size={11} style={{ verticalAlign: '-2px', marginRight: 4 }} />
          Drag tasks between work streams · Drag work streams between programs
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        {(typeof project.creditPoints === 'number' || isOwner) && (
          <div style={{
            padding: '10px 12px', marginBottom: 10, borderRadius: 8,
            background: weightsLocked ? '#FCEBEB' : '#E6F1FB',
            border: '1px solid ' + (weightsLocked ? '#EDB8B8' : '#C0D9F0'),
            fontSize: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 500, color: weightsLocked ? TOK.healthRed : TOK.programFg }}>
                {weightsLocked ? '🔒' : '🔓'} Credit pool: {project.creditPoints ?? DEFAULT_CREDIT_POINTS} cp · Year {project.creditYear ?? new Date().getFullYear()}
              </span>
              <span style={{ flex: 1, color: TOK.muted }}>
                {weightsLocked
                  ? 'Weights are locked for this year. Owner can unlock in Project Settings.'
                  : (isOwner ? 'Click ⚖ on any program/workstream/task to set explicit weights. Empty = equal split.' : 'Weights set by workspace owner.')}
              </span>
            </div>
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed ' + (weightsLocked ? '#EDB8B8' : '#C0D9F0'), color: TOK.muted, display: 'flex', flexWrap: 'wrap', gap: 14 }}>
              {creditInfo.result.leadName ? (
                <span>Lead: <strong style={{ color: TOK.ink }}>{creditInfo.result.leadName}</strong> · {Math.round(creditInfo.result.leadCp * 10) / 10} cp pool</span>
              ) : (
                <span style={{ opacity: 0.7 }}>No project lead</span>
              )}
              <span>Allocated: <strong style={{ color: TOK.ink }}>{Math.round(creditInfo.result.programPoolCp * 10) / 10} cp</strong></span>
              <span>Earned so far: <strong style={{ color: TOK.healthGreen }}>{Math.round(creditInfo.workspaceEarned * 10) / 10} cp</strong> <span style={{ opacity: 0.7 }}>(only Completed tasks)</span></span>
              {isOwner && creditInfo.topPics.length > 0 && (
                <span style={{ flex: 1, textAlign: 'right' }}>
                  Top: {creditInfo.topPics.map((p) => `${p.name} ${Math.round(p.projected * 10) / 10}`).join(' · ')}
                </span>
              )}
            </div>
          </div>
        )}
        {visiblePrograms.map((pg) => {
          const r = rollup(pg);
          const pgOpen = expanded.has(pg.id);
          const pgMatches = matches(pg.name);
          const pgHasMatches = !q || pgMatches || (pg.workstreams || []).some((w) => matches(w.name) || (w.tasks || []).some((t) => matches(t.name)));
          if (!pgHasMatches) return null;
          const dropOn = dragOver === 'pg_' + pg.id;
          const pgIdx = (project.programs || []).findIndex((p) => p.id === pg.id);
          const pgEffWeight = pgIdx >= 0 ? (programWeights[pgIdx] || 0) : 0;
          const pgCaps = capsFor(pg.id, null);
          return (
            <div key={pg.id}
              onDragOver={(e) => { if (dragInfo?.kind === 'ws' && dragInfo.sourcePgId !== pg.id) onDragOverZone(e, 'pg_' + pg.id); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => dropWsIntoPg(pg)}
              style={{ background: TOK.surface, border: '1px solid ' + (dropOn ? TOK.accent : TOK.line), borderRadius: 10, marginBottom: 10, overflow: 'hidden', boxShadow: dropOn ? '0 0 0 3px rgba(59,109,17,0.15)' : 'none' }}>
              <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, background: TOK.programBg, flexWrap: showRoles ? 'wrap' : undefined }}>
                <button onClick={() => toggleExpand(pg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.programFg, padding: 2, display: 'flex' }}>
                  {pgOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <span style={{ fontSize: 14, fontWeight: 500, color: TOK.programFg, flex: 1 }}>{pg.name}</span>
                {showRoles && ['pm', 'deputy'].map((kind) => {
                  const cur = roles.programs?.[pg.id]?.[kind === 'pm' ? 'pmUid' : 'deputyUid'] ?? null;
                  return (
                    <RolePicker key={kind} label={kind === 'pm' ? 'PM' : 'Deputy'} valueUid={cur} scopeName={pg.name}
                      editable={canEditRole(roles, me, kind, pg.id)} people={people} nameOf={me.nameOf} isActive={me.isActive}
                      blankText="— (Owner decides)"
                      onPick={(toUid) => onChangeRole && onChangeRole({ kind, programId: pg.id, fromUid: cur, toUid })} />
                  );
                })}
                <WeightBadge
                  weight={pg.weight}
                  effectiveWeight={pgEffWeight}
                  onChange={(v) => updateProgramWeight(pg.id, v)}
                  locked={weightsLocked}
                  isOwner={isOwner}
                  label={`program "${pg.name}"`}
                  cpValue={creditInfo.programCp.get(pg.id)}
                />
                <span style={{ fontSize: 11, color: TOK.programFg, opacity: 0.8 }}>{r.done}/{r.total} · {r.pct}%</span>
                <div style={{ width: 100, height: 5, background: 'rgba(12,68,124,0.15)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${r.pct}%`, height: '100%', background: TOK.programFg }} />
                </div>
                {pgCaps.wsAdd && <Btn size="sm" variant="ghost" onClick={() => addWorkstream(pg)} title="Add work stream"><Plus size={12} /></Btn>}
                {pgCaps.programEdit && <Btn size="sm" variant="ghost" onClick={() => renameProgram(pg)} title="Rename"><Edit2 size={12} /></Btn>}
                {pgCaps.programEdit && <Btn size="sm" variant="ghost" onClick={() => deleteProgram(pg)} title="Delete"><Trash2 size={12} /></Btn>}
              </div>
              {pgOpen && (pg.workstreams || []).map((ws) => {
                const wsR = rollup(ws);
                const wsOpen = expanded.has(ws.id);
                const wsMatches = matches(ws.name);
                const wsHasMatches = !q || pgMatches || wsMatches || (ws.tasks || []).some((t) => matches(t.name));
                if (!wsHasMatches) return null;
                const wsDragOver = dragOver === 'ws_' + ws.id;
                const wsList = pg.workstreams || [];
                const wsIdx = wsList.findIndex((w) => w.id === ws.id);
                const wsEffWeights = wsWeightsMap.get(pg.id) || [];
                const wsEffWeight = wsIdx >= 0 ? (wsEffWeights[wsIdx] || 0) : 0;
                const taskWeightInfo = taskWeightsMap.get(ws.id) || { eligible: [], weights: [] };
                const wsCaps = capsFor(pg.id, ws.id);
                return (
                  <div key={ws.id}
                    draggable onDragStart={(e) => onDragStartWs(e, ws, pg)}
                    onDragOver={(e) => { if (dragInfo?.kind === 'task' && dragInfo.sourceWsId !== ws.id) onDragOverZone(e, 'ws_' + ws.id); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={() => dropTaskIntoWs(pg, ws)}
                    style={{ borderTop: '1px solid ' + TOK.line, background: wsDragOver ? 'rgba(59,109,17,0.06)' : TOK.surface }}>
                    <div style={{ padding: '8px 12px 8px 28px', display: 'flex', alignItems: 'center', gap: 8, background: TOK.workstreamBg, flexWrap: showRoles ? 'wrap' : undefined }}>
                      <span style={{ cursor: 'grab', color: TOK.workstreamFg, opacity: 0.6, display: 'flex' }}><Grip size={12} /></span>
                      <button onClick={() => toggleExpand(ws.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.workstreamFg, padding: 2, display: 'flex' }}>
                        {wsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </button>
                      <span style={{ fontSize: 13, fontWeight: 500, color: TOK.workstreamFg, flex: 1 }}>{ws.name}</span>
                      {showRoles && (() => {
                        const cur = roles.workstreams?.[ws.id]?.leadUid ?? null;
                        return (
                          <RolePicker label="Sub-PM" valueUid={cur} scopeName={ws.name}
                            editable={canEditRole(roles, me, 'lead', pg.id)} people={people} nameOf={me.nameOf} isActive={me.isActive}
                            blankText="— (PM decides)"
                            onPick={(toUid) => onChangeRole && onChangeRole({ kind: 'lead', programId: pg.id, wsId: ws.id, fromUid: cur, toUid })} />
                        );
                      })()}
                      <WeightBadge
                        weight={ws.weight}
                        effectiveWeight={wsEffWeight}
                        onChange={(v) => updateWorkstreamWeight(pg.id, ws.id, v)}
                        locked={weightsLocked}
                        isOwner={isOwner}
                        label={`workstream "${ws.name}"`}
                        cpValue={creditInfo.workstreamCp.get(ws.id)}
                      />
                      <span style={{ fontSize: 11, color: TOK.workstreamFg, opacity: 0.8 }}>{wsR.done}/{wsR.total} · {wsR.pct}%</span>
                      <div style={{ width: 80, height: 4, background: 'rgba(15,110,86,0.2)', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ width: `${wsR.pct}%`, height: '100%', background: TOK.workstreamFg }} />
                      </div>
                      {wsCaps.taskAdd && <Btn size="sm" variant="ghost" onClick={() => addTask(pg, ws)} title="Add task"><Plus size={12} /></Btn>}
                      {wsCaps.wsEdit && <Btn size="sm" variant="ghost" onClick={() => renameWorkstream(pg, ws)} title="Rename"><Edit2 size={12} /></Btn>}
                      {wsCaps.wsDelete && <Btn size="sm" variant="ghost" onClick={() => deleteWorkstream(pg, ws)} title="Delete"><Trash2 size={12} /></Btn>}
                    </div>
                    {wsOpen && sortTasksByStart(ws.tasks).map((t) => {
                      if (q && !pgMatches && !wsMatches && !matches(t.name)) return null;
                      const sel = t.id === selectedTaskId;
                      const dropped = t.status === 'Dropped';
                      const over = isOverdue(t);
                      const totalUpdates = (t.updates?.length || 0) + (t.checkIns?.length || 0);
                      const tIdx = taskWeightInfo.eligible.findIndex((x) => x.id === t.id);
                      const tEffWeight = tIdx >= 0 ? (taskWeightInfo.weights[tIdx] || 0) : 0;
                      return (
                        <div key={t.id}
                          draggable onDragStart={(e) => onDragStartTask(e, t, pg, ws)}
                          onClick={() => onTaskClick(t.id)}
                          style={{
                            padding: '7px 12px 7px 52px', display: 'flex', alignItems: 'center', gap: 8,
                            borderTop: '1px solid ' + TOK.line, cursor: 'pointer',
                            background: sel ? TOK.bg : TOK.surface,
                            opacity: dropped ? 0.55 : 1,
                          }}
                          onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = TOK.bg; }}
                          onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = TOK.surface; }}>
                          <span style={{ cursor: 'grab', color: TOK.subtle, display: 'flex' }}><Grip size={11} /></span>
                          {!dropped && <HealthDot health={t.health || 'green'} size={8} />}
                          <span style={{
                            fontSize: 12.5, color: TOK.ink, flex: 1,
                            textDecoration: dropped ? 'line-through' : undefined,
                          }}>{t.name}</span>
                          {t.pic && <span style={{ fontSize: 11, color: TOK.muted, background: TOK.bg, padding: '1px 6px', borderRadius: 4 }}>{t.pic}</span>}
                          {t.end && <span style={{ fontSize: 11, color: over ? TOK.overdueFg : TOK.muted }}>{fmtDateShort(t.end)}</span>}
                          {totalUpdates > 0 && <span style={{ fontSize: 11, color: TOK.muted, display: 'flex', alignItems: 'center', gap: 2 }}><MessageSquare size={10} />{totalUpdates}</span>}
                          {!dropped && (
                            <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
                              <WeightBadge
                                weight={t.weight}
                                effectiveWeight={tEffWeight}
                                onChange={(v) => updateTaskWeight(pg.id, ws.id, t.id, v)}
                                locked={weightsLocked}
                                isOwner={isOwner}
                                label={`task "${t.name}"`}
                                cpValue={creditInfo.taskCp.get(t.id)}
                              />
                            </span>
                          )}
                          <Pill status={t.status || 'Planned'} overdue={over} size="sm" />
                        </div>
                      );
                    })}
                    {wsOpen && (!ws.tasks || !ws.tasks.length) && (
                      <div style={{ padding: '10px 52px', fontSize: 11, color: TOK.subtle, borderTop: '1px solid ' + TOK.line }}>
                        No tasks yet. {wsCaps.taskAdd && <button onClick={() => addTask(pg, ws)} style={{ background: 'none', border: 'none', color: TOK.accent, cursor: 'pointer', fontSize: 11, padding: 0 }}>Add one</button>}
                      </div>
                    )}
                  </div>
                );
              })}
              {pgOpen && (!pg.workstreams || !pg.workstreams.length) && (
                <div style={{ padding: '10px 12px 10px 28px', fontSize: 11, color: TOK.subtle, borderTop: '1px solid ' + TOK.line }}>
                  No work streams yet. {pgCaps.wsAdd && <button onClick={() => addWorkstream(pg)} style={{ background: 'none', border: 'none', color: TOK.accent, cursor: 'pointer', fontSize: 11, padding: 0 }}>Add one</button>}
                </div>
              )}
            </div>
          );
        })}
        {(!visiblePrograms || !visiblePrograms.length) && (
          <div style={{ textAlign: 'center', padding: 40, color: TOK.muted, fontSize: 13 }}>
            No programs yet. {projectCaps.programEdit && <button onClick={addProgram} style={{ background: 'none', border: 'none', color: TOK.accent, cursor: 'pointer', fontSize: 13 }}>Add one</button>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═════════ DASHBOARD VIEW ═════════ */
function DashboardView({ project, activity, onTaskClick, scopeProgramId }) {
  const scopedNode = useMemo(() => {
    if (!scopeProgramId) return project;
    const pg = (project.programs || []).find((p) => p.id === scopeProgramId);
    return pg || project;
  }, [project, scopeProgramId]);
  const r = rollup(scopedNode);
  const tasks = collectTasks(scopedNode);
  const now = today();
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);

  const dueThisWeek = tasks.filter((t) => {
    if (t.status === 'Completed') return false;
    const e = parseDate(t.end);
    return e && e >= now && e <= weekEnd;
  }).sort((a, b) => parseDate(a.end) - parseDate(b.end));

  const overdue = tasks.filter(isOverdue).sort((a, b) => parseDate(a.end) - parseDate(b.end));

  // Merged feed of all recent updates and legacy check-ins (newest first)
  const recentEntries = [];
  for (const t of tasks) {
    for (const u of (t.updates || [])) {
      recentEntries.push({ task: t, entry: u, kind: 'update' });
    }
    for (const c of (t.checkIns || [])) {
      recentEntries.push({ task: t, entry: c, kind: 'legacy' });
    }
  }
  recentEntries.sort((a, b) => new Date(b.entry.timestamp) - new Date(a.entry.timestamp));
  const latestEntries = recentEntries.slice(0, 8);

  // Top blockers: only ACTIVE (not resolved) blockers from updates and legacy check-ins
  const blockerEntries = recentEntries.filter(({ entry, kind }) => {
    if (kind === 'update') return entry.isBlocker && !entry.resolvedAt;
    return (entry.blockers || '').trim().length > 0;
  }).slice(0, 6);

  const noUpdates = tasks.filter((t) => t.status !== 'Completed' && t.status !== 'Dropped' && (!t.checkIns || !t.checkIns.length) && (!t.updates || !t.updates.length));

  const { min, max } = projectDateRange(scopedNode);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 20, fontFamily: FONT_STACK, background: TOK.bg }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <StatCard label="Overall progress" value={`${r.pct}%`} accent={TOK.accent} sub={`${r.done}/${r.total} tasks complete`} />
          <StatCard label="In progress" value={r.inprog} accent={TOK.inprogFg} sub={`${r.planned} planned`} />
          <StatCard label="Overdue" value={r.overdue} accent={TOK.overdueFg} sub={r.overdue === 0 ? 'nothing overdue' : 'needs attention'} />
          <StatCard label="Timeline" value={min && max ? fmtDateShort(min) + ' → ' + fmtDateShort(max) : '—'} accent={TOK.ink} sub="project span" textValue />
        </div>

        {blockerEntries.length > 0 && (
          <Panel title="🚩 Top blockers" count={blockerEntries.length} icon={<AlertTriangle size={13} color={TOK.blocker} />}>
            {blockerEntries.map(({ task, entry, kind }) => (
              <div key={entry.id} onClick={() => onTaskClick(task.id)} style={{ padding: '10px 12px', borderTop: '1px solid ' + TOK.line, cursor: 'pointer', background: TOK.blockerBg }}>
                <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', marginBottom: 3, gap: 8 }}>
                  <span style={{ fontWeight: 500 }}>{task.name}</span>
                  <span style={{ color: TOK.subtle, fontSize: 11, whiteSpace: 'nowrap' }}>{entry.author} · {fmtDateTime(entry.timestamp)}</span>
                </div>
                <div style={{ fontSize: 11.5, color: TOK.blocker, lineHeight: 1.5 }}>
                  {kind === 'update' ? (entry.text || '').slice(0, 200) : (entry.blockers || '').slice(0, 200)}
                </div>
              </div>
            ))}
          </Panel>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Panel title="Due this week" count={dueThisWeek.length} icon={<Calendar size={13} />}>
            {dueThisWeek.length === 0 && <div style={{ fontSize: 12, color: TOK.subtle }}>Nothing due in the next 7 days.</div>}
            {dueThisWeek.map((t) => <TaskRow key={t.id} task={t} project={project} onClick={() => onTaskClick(t.id)} />)}
          </Panel>
          <Panel title="Overdue" count={overdue.length} icon={<AlertTriangle size={13} color={overdue.length ? TOK.overdueFg : TOK.muted} />}>
            {overdue.length === 0 && <div style={{ fontSize: 12, color: TOK.subtle }}>Nothing overdue. 🎉</div>}
            {overdue.map((t) => <TaskRow key={t.id} task={t} project={project} onClick={() => onTaskClick(t.id)} />)}
          </Panel>
        </div>

        <Panel title="Recent updates" count={recentEntries.length} icon={<MessageSquare size={13} />}>
          {latestEntries.length === 0 && <div style={{ fontSize: 12, color: TOK.subtle }}>No updates yet.</div>}
          {latestEntries.map(({ task, entry, kind }) => (
            <div key={entry.id} onClick={() => onTaskClick(task.id)} style={{ padding: '10px 12px', borderTop: '1px solid ' + TOK.line, cursor: 'pointer' }}
              onMouseEnter={(e) => e.currentTarget.style.background = TOK.bg}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
              <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', marginBottom: 3, gap: 8 }}>
                <span style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {task.name}
                  {((kind === 'update' && entry.isBlocker) || (kind === 'legacy' && entry.blockers)) && <span style={{ fontSize: 10, color: TOK.blocker }}>🚩</span>}
                </span>
                <span style={{ color: TOK.subtle, fontSize: 11, whiteSpace: 'nowrap' }}>{entry.author} · {fmtDateTime(entry.timestamp)}</span>
              </div>
              {kind === 'update' ? (
                <div style={{ fontSize: 11.5, color: TOK.muted, lineHeight: 1.5 }}>{(entry.text || '').slice(0, 200)}</div>
              ) : (
                <>
                  {entry.done && <div style={{ fontSize: 11.5, color: TOK.muted, lineHeight: 1.5 }}>Done: {entry.done}</div>}
                  {entry.blockers && <div style={{ fontSize: 11.5, color: TOK.overdueFg, lineHeight: 1.5 }}>Blocker: {entry.blockers}</div>}
                </>
              )}
            </div>
          ))}
        </Panel>

        <Panel title="Recent activity" count={activity.length} icon={<Activity size={13} />}>
          {activity.length === 0 && <div style={{ fontSize: 12, color: TOK.subtle }}>No activity yet.</div>}
          {activity.slice(0, 15).map((a) => (
            <div key={a.id} style={{ padding: '7px 12px', borderTop: '1px solid ' + TOK.line, fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ color: TOK.ink }}>{a.description}</span>
              <span style={{ color: TOK.subtle, whiteSpace: 'nowrap', fontSize: 11 }}>{a.author} · {fmtDateTime(a.timestamp)}</span>
            </div>
          ))}
        </Panel>

        {noUpdates.length > 0 && (
          <Panel title="Open tasks with no updates" count={noUpdates.length} icon={<Info size={13} />}>
            {noUpdates.slice(0, 10).map((t) => <TaskRow key={t.id} task={t} project={project} onClick={() => onTaskClick(t.id)} />)}
            {noUpdates.length > 10 && <div style={{ fontSize: 11, color: TOK.subtle, padding: '8px 12px', borderTop: '1px solid ' + TOK.line }}>+ {noUpdates.length - 10} more</div>}
          </Panel>
        )}
      </div>
    </div>
  );
}
function StatCard({ label, value, accent, sub, textValue }) {
  return (
    <div style={{ background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: textValue ? 14 : 24, fontWeight: 500, color: accent, marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: TOK.subtle }}>{sub}</div>
    </div>
  );
}
function Panel({ title, count, icon, children }) {
  return (
    <div style={{ background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid ' + TOK.line, fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon} {title} <span style={{ color: TOK.subtle, fontWeight: 400 }}>({count})</span>
      </div>
      <div>{children}</div>
    </div>
  );
}
function TaskRow({ task, project, onClick }) {
  const loc = findTaskInProject(project, task.id);
  const over = isOverdue(task);
  return (
    <div onClick={onClick} style={{ padding: '9px 12px', borderTop: '1px solid ' + TOK.line, cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center' }}
      onMouseEnter={(e) => e.currentTarget.style.background = TOK.bg}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500 }}>{task.name}</div>
        <div style={{ fontSize: 11, color: TOK.subtle, marginTop: 2 }}>
          {loc ? `${loc.program.name} › ${loc.workstream.name}` : ''} {task.pic ? ' · ' + task.pic : ''}
        </div>
      </div>
      {task.end && <span style={{ fontSize: 11, color: over ? TOK.overdueFg : TOK.muted }}>{fmtDateShort(task.end)}</span>}
      <Pill status={task.status || 'Planned'} overdue={over} size="sm" />
    </div>
  );
}

/* ═════════ ACTIVITY DASHBOARD ═════════ */

const COLOR_MAP = {
  green:  { fg: TOK.healthGreen, bg: TOK.healthGreenBg },
  amber:  { fg: TOK.healthAmber, bg: TOK.healthAmberBg },
  red:    { fg: TOK.healthRed,   bg: TOK.healthRedBg },
  subtle: { fg: TOK.subtle,      bg: TOK.bg },
};

function TrendArrow({ trend, size = 11 }) {
  if (!trend) return null;
  const map = {
    up:   { ch: '↑', col: TOK.healthGreen },
    flat: { ch: '→', col: TOK.muted },
    down: { ch: '↓', col: TOK.healthRed },
  };
  const s = map[trend];
  if (!s) return null;
  return <span style={{ color: s.col, fontSize: size, marginLeft: 4 }}>{s.ch}</span>;
}

function MetricCell({ value, sub, color = 'subtle', trend }) {
  const c = COLOR_MAP[color] || COLOR_MAP.subtle;
  return (
    <div style={{
      padding: '6px 8px', borderRadius: 6, background: c.bg, color: c.fg,
      minWidth: 70, textAlign: 'center', fontFamily: FONT_STACK,
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {value == null ? '—' : value}
        <TrendArrow trend={trend} />
      </div>
      {sub && <div style={{ fontSize: 10, color: TOK.muted, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function DetailMetric({ label, value, sub, color = 'subtle', trend }) {
  const c = COLOR_MAP[color] || COLOR_MAP.subtle;
  return (
    <div style={{
      padding: 12, borderRadius: 8, background: c.bg, fontFamily: FONT_STACK,
    }}>
      <div style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: c.fg, marginTop: 4, display: 'flex', alignItems: 'center' }}>
        {value == null ? '—' : value}
        <TrendArrow trend={trend} size={14} />
      </div>
      {sub && <div style={{ fontSize: 11, color: TOK.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function CompositeCell({ score, trend, color = 'subtle' }) {
  const c = COLOR_MAP[color] || COLOR_MAP.subtle;
  return (
    <div style={{
      padding: '8px 10px', borderRadius: 8, background: c.bg, color: c.fg,
      minWidth: 90, textAlign: 'center', fontFamily: FONT_STACK,
      fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {score == null ? '—' : score}
      <TrendArrow trend={trend} size={13} />
    </div>
  );
}

function RadarChart({ dimensions, size = 180 }) {
  const labels = ['Delivery', 'Cadence', 'Risk', 'Engagement'];
  const keys = ['delivery', 'cadence', 'risk', 'engagement'];
  const cx = size / 2, cy = size / 2, R = size / 2 - 24;
  const angleFor = (i) => (-Math.PI / 2) + (i * 2 * Math.PI / keys.length);
  const point = (i, v) => {
    const a = angleFor(i);
    const r = R * Math.max(0, Math.min(100, v || 0)) / 100;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const labelPoint = (i) => {
    const a = angleFor(i);
    return [cx + (R + 14) * Math.cos(a), cy + (R + 14) * Math.sin(a)];
  };
  const polyPoints = keys.map((k, i) => point(i, dimensions?.[k]).join(',')).join(' ');
  const grid = [25, 50, 75, 100].map((pct) => {
    const r = R * pct / 100;
    const pts = keys.map((_, i) => {
      const a = angleFor(i);
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)].join(',');
    }).join(' ');
    return <polygon key={pct} points={pts} fill="none" stroke={TOK.line} strokeWidth={1} />;
  });
  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      {grid}
      {keys.map((_, i) => {
        const [x, y] = point(i, 100);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={TOK.line} strokeWidth={1} />;
      })}
      <polygon points={polyPoints} fill={TOK.accent} fillOpacity={0.18} stroke={TOK.accent} strokeWidth={1.5} />
      {labels.map((lab, i) => {
        const [x, y] = labelPoint(i);
        return (
          <text key={lab} x={x} y={y} fontSize={10} textAnchor="middle" dominantBaseline="middle" fill={TOK.muted} fontFamily={FONT_STACK}>
            {lab}
          </text>
        );
      })}
    </svg>
  );
}

function CreditsCell({ credits }) {
  if (!credits || (credits.earned <= 0 && credits.projected <= 0)) {
    return <div style={{ textAlign: 'right' }}><div style={{ fontSize: 13, color: TOK.subtle }}>—</div></div>;
  }
  const earned = Math.round(credits.earned * 10) / 10;
  const projected = Math.round(credits.projected * 10) / 10;
  const pct = projected > 0 ? Math.round((earned / projected) * 100) : 0;
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 13, fontWeight: 500 }}>
        <span style={{ color: '#356512' }}>{earned}</span>
        <span style={{ color: TOK.subtle, fontSize: 11 }}> / {projected}</span>
      </div>
      <div style={{ fontSize: 10, color: TOK.subtle }}>{pct}% earned (projected)</div>
    </div>
  );
}

function PICRow({ metrics, credits, onClick }) {
  const m = metrics;
  const dCount = m.sampleSize.actions + m.sampleSize.tasks;
  const deliveryColor = sampleStatus(dCount) === 'ok' ? bucketColor(m.delivery.weightedRate, ACTIVITY_THRESHOLDS.delivery) : 'subtle';
  const cadenceColor = m.cadence.activeTasks > 0 ? bucketColor(m.cadence.avgDaysSinceUpdate, ACTIVITY_THRESHOLDS.cadence, { inverted: true }) : 'subtle';
  const riskColor = sampleStatus(m.sampleSize.riskReports) === 'ok' ? bucketColor(m.risk.honestyRate, ACTIVITY_THRESHOLDS.risk) : 'subtle';
  const engagementColor = m.engagement.total > 0 ? bucketColor(m.engagement.total, ACTIVITY_THRESHOLDS.engagement) : 'subtle';
  const compositeColor = m.composite.score != null ? bucketColor(m.composite.score, ACTIVITY_THRESHOLDS.composite) : 'subtle';
  return (
    <tr onClick={onClick} style={{ cursor: 'pointer', borderTop: '1px solid ' + TOK.line }}
      onMouseEnter={(e) => (e.currentTarget.style.background = TOK.bg)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
      <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 500 }}>{m.pic}</td>
      <td style={{ padding: '8px 6px' }}>
        <MetricCell
          value={sampleStatus(dCount) === 'ok' && m.delivery.weightedRate != null ? `${m.delivery.weightedRate}%` : '—'}
          sub={`${m.delivery.onTime}/${m.delivery.total} actions`}
          color={deliveryColor}
          trend={m.trend?.delivery}
        />
      </td>
      <td style={{ padding: '8px 6px' }}>
        <MetricCell
          value={m.cadence.avgDaysSinceUpdate != null ? `${m.cadence.avgDaysSinceUpdate}d` : '—'}
          sub={`${m.cadence.activeTasks} active${m.cadence.staleTasks ? ` · ${m.cadence.staleTasks} stale` : ''}`}
          color={cadenceColor}
          trend={m.trend?.cadence}
        />
      </td>
      <td style={{ padding: '8px 6px' }}>
        <MetricCell
          value={sampleStatus(m.sampleSize.riskReports) === 'ok' && m.risk.honestyRate != null ? `${m.risk.honestyRate}%` : '—'}
          sub={m.risk.greenButOverdue > 0 ? `${m.risk.greenButOverdue} green→overdue` : `${m.risk.totalReports} reports`}
          color={riskColor}
          trend={m.trend?.risk}
        />
      </td>
      <td style={{ padding: '8px 6px' }}>
        <MetricCell
          value={m.engagement.total > 0 ? m.engagement.total : '—'}
          sub={`${m.engagement.decisions}d · ${m.engagement.blockersResolvedForOthers}b · ${m.engagement.crossTaskUpdates}u`}
          color={engagementColor}
        />
      </td>
      <td style={{ padding: '8px 10px' }}>
        <CompositeCell score={m.composite.score} trend={m.trend?.composite} color={compositeColor} />
      </td>
      <td style={{ padding: '8px 12px' }}>
        <CreditsCell credits={credits} />
      </td>
    </tr>
  );
}

function ActivityChart({ picList }) {
  if (!picList.length) return null;
  const top = picList.filter((m) => m.delivery.weightedRate != null).sort((a, b) => (b.delivery.weightedRate || 0) - (a.delivery.weightedRate || 0)).slice(0, 8);
  if (!top.length) return null;
  const W = 460, rowH = 22, padL = 80, barMax = W - padL - 50;
  const H = top.length * rowH + 16;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      {top.map((m, i) => {
        const y = 8 + i * rowH;
        const v = m.delivery.weightedRate || 0;
        const w = barMax * v / 100;
        const col = bucketColor(v, ACTIVITY_THRESHOLDS.delivery);
        const fill = COLOR_MAP[col].fg;
        return (
          <g key={m.id}>
            <text x={padL - 6} y={y + 14} textAnchor="end" fontSize={11} fontFamily={FONT_STACK} fill={TOK.ink}>{m.pic}</text>
            <rect x={padL} y={y + 4} width={barMax} height={rowH - 8} fill={TOK.bg} rx={3} />
            <rect x={padL} y={y + 4} width={w} height={rowH - 8} fill={fill} rx={3} />
            <text x={padL + w + 5} y={y + 14} fontSize={11} fontFamily={FONT_STACK} fill={TOK.muted}>{v}%</text>
          </g>
        );
      })}
    </svg>
  );
}

function WorkstreamDifficultyConfig({ projects, onProjectUpdate, onClose }) {
  return (
    <div style={{ background: TOK.bg, padding: 14, borderRadius: 8, marginBottom: 14, fontFamily: FONT_STACK }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>⚖️ Workstream difficulty multipliers</div>
        <div style={{ flex: 1 }} />
        <Btn size="sm" variant="ghost" onClick={onClose}><X size={11} /></Btn>
      </div>
      <div style={{ fontSize: 11, color: TOK.muted, marginBottom: 10, lineHeight: 1.5 }}>
        Higher multipliers give more credit for on-time delivery in difficult workstreams (Legal, R&D). Default 1.0.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {Object.values(projects).flatMap((p) => (p.programs || []).flatMap((pg) => (pg.workstreams || []).map((ws) => (
          <div key={`${p.id}_${ws.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: TOK.surface, borderRadius: 6 }}>
            <div style={{ fontSize: 11.5, flex: 1 }}>
              <span style={{ color: TOK.muted }}>{p.name} › {pg.name} ›</span> <span style={{ fontWeight: 500 }}>{ws.name}</span>
            </div>
            <select
              value={ws.difficultyPreset || 'standard'}
              onChange={(e) => {
                const preset = e.target.value;
                const mult = DIFFICULTY_PRESETS[preset];
                const updated = cloneDeep(p);
                for (const upg of updated.programs || []) {
                  for (const uws of upg.workstreams || []) {
                    if (uws.id === ws.id) {
                      uws.difficultyPreset = preset;
                      uws.difficultyMultiplier = mult;
                    }
                  }
                }
                onProjectUpdate(updated);
              }}
              style={{ fontFamily: FONT_STACK, fontSize: 11, padding: '4px 22px 4px 8px', border: '1px solid ' + TOK.lineStrong, borderRadius: 5, background: TOK.surface }}>
              {Object.entries(DIFFICULTY_LABELS).map(([k, lab]) => (
                <option key={k} value={k}>{lab} ({DIFFICULTY_PRESETS[k]}x)</option>
              ))}
            </select>
          </div>
        ))))}
      </div>
    </div>
  );
}

function PICDetailModal({ metrics, onClose }) {
  const m = metrics;
  const dCount = m.sampleSize.actions + m.sampleSize.tasks;
  const deliveryColor = sampleStatus(dCount) === 'ok' ? bucketColor(m.delivery.weightedRate, ACTIVITY_THRESHOLDS.delivery) : 'subtle';
  const cadenceColor = m.cadence.activeTasks > 0 ? bucketColor(m.cadence.avgDaysSinceUpdate, ACTIVITY_THRESHOLDS.cadence, { inverted: true }) : 'subtle';
  const riskColor = sampleStatus(m.sampleSize.riskReports) === 'ok' ? bucketColor(m.risk.honestyRate, ACTIVITY_THRESHOLDS.risk) : 'subtle';
  const engagementColor = m.engagement.total > 0 ? bucketColor(m.engagement.total, ACTIVITY_THRESHOLDS.engagement) : 'subtle';
  const compositeColor = m.composite.score != null ? bucketColor(m.composite.score, ACTIVITY_THRESHOLDS.composite) : 'subtle';
  const compC = COLOR_MAP[compositeColor];
  return (
    <Modal title={`${m.pic} — Activity detail`} onClose={onClose} width={680}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 18 }}>
        <RadarChart dimensions={m.composite.dimensions} size={170} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Composite</div>
          <div style={{ fontSize: 56, fontWeight: 700, color: compC.fg, lineHeight: 1, display: 'inline-flex', alignItems: 'baseline' }}>
            {m.composite.score == null ? '—' : m.composite.score}
            <TrendArrow trend={m.trend?.composite} size={20} />
          </div>
          <div style={{ fontSize: 11, color: TOK.muted, marginTop: 6 }}>0–100 weighted score</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        <DetailMetric label="Delivery" value={m.delivery.weightedRate != null ? `${m.delivery.weightedRate}%` : '—'} sub={`${m.delivery.onTime}/${m.delivery.total} actions`} color={deliveryColor} trend={m.trend?.delivery} />
        <DetailMetric label="Cadence" value={m.cadence.avgDaysSinceUpdate != null ? `${m.cadence.avgDaysSinceUpdate}d` : '—'} sub={`${m.cadence.activeTasks} active`} color={cadenceColor} trend={m.trend?.cadence} />
        <DetailMetric label="Risk honesty" value={m.risk.honestyRate != null ? `${m.risk.honestyRate}%` : '—'} sub={m.risk.greenButOverdue > 0 ? `${m.risk.greenButOverdue} flagged` : `${m.risk.totalReports} reports`} color={riskColor} trend={m.trend?.risk} />
        <DetailMetric label="Engagement" value={m.engagement.total} sub={`${m.engagement.decisions}d ${m.engagement.blockersResolvedForOthers}b ${m.engagement.crossTaskUpdates}u`} color={engagementColor} />
      </div>

      {(m.delivery.hardTotal + m.delivery.softTotal) > 0 && (
        <div style={{ background: TOK.bg, padding: 10, borderRadius: 7, marginBottom: 12, fontSize: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>Hard/Soft delivery</div>
          <div style={{ color: TOK.muted }}>
            🔒 Hard: {m.delivery.hardOnTime}/{m.delivery.hardTotal} ·  🎯 Soft: {m.delivery.softOnTime}/{m.delivery.softTotal}
          </div>
        </div>
      )}

      {m.recentFlags.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Recent flags</div>
          <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 12, color: TOK.muted, lineHeight: 1.6 }}>
            {m.recentFlags.map((f, i) => <li key={i}>{f.message}</li>)}
          </ul>
        </div>
      )}

      {m.activeTasks.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Active tasks ({m.activeTasks.length})</div>
          <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid ' + TOK.line, borderRadius: 6 }}>
            {m.activeTasks.map((at, i) => (
              <div key={i} style={{ padding: '7px 10px', fontSize: 12, borderTop: i ? '1px solid ' + TOK.line : 'none' }}>
                <div style={{ fontWeight: 500 }}>{at.task.name}</div>
                <div style={{ fontSize: 11, color: TOK.subtle }}>{at.project.name} › {at.program.name} › {at.workstream.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

function ActivityDashboardView({ projects, onProjectUpdate, isOwner = false }) {
  const dirIndex = useContext(DirectoryIndexContext);
  const [selectedPic, setSelectedPic] = useState(null);
  useEffect(() => { setSelectedPic(null); }, [dirIndex]); // P1: ids change when the directory loads
  const [showDifficulty, setShowDifficulty] = useState(false);
  // Window + sort controls. Owner-editable; non-owners see them disabled and
  // viewable for transparency. Local state — does not persist across reloads;
  // future improvement: hoist to meta so the workspace owner can pin a default
  // for the team.
  const [actionWeeks, setActionWeeks] = useState(DEFAULT_DASHBOARD_WINDOW.actionWeeks);
  const [taskWeeks, setTaskWeeks] = useState(DEFAULT_DASHBOARD_WINDOW.taskWeeks);
  const [sortBy, setSortBy] = useState('priority');

  const indexMap = useMemo(
    () => computeActivityIndexWithTrend(projects, { actionWeeks, taskWeeks }, dirIndex),
    [projects, actionWeeks, taskWeeks, dirIndex]
  );
  const picCredits = useMemo(() => computeWorkspaceCredits(projects, null, dirIndex).perPic, [projects, dirIndex]);
  const priorities = useMemo(() => rankCoachingPriorities(indexMap, 3), [indexMap]);

  const picList = useMemo(() => {
    const arr = Array.from(indexMap.values());
    if (sortBy === 'name') arr.sort((a, b) => a.pic.localeCompare(b.pic));
    else if (sortBy === 'composite') arr.sort((a, b) => (b.composite.score ?? -1) - (a.composite.score ?? -1));
    else if (sortBy === 'delivery') arr.sort((a, b) => (b.delivery.weightedRate ?? b.delivery.rate ?? -1) - (a.delivery.weightedRate ?? a.delivery.rate ?? -1));
    else if (sortBy === 'cadence') arr.sort((a, b) => (a.cadence.avgDaysSinceUpdate ?? 999) - (b.cadence.avgDaysSinceUpdate ?? 999));
    else if (sortBy === 'risk') arr.sort((a, b) => (b.risk.honestyRate ?? -1) - (a.risk.honestyRate ?? -1));
    else if (sortBy === 'recent') arr.sort((a, b) => (a.cadence.avgDaysSinceUpdate ?? 999) - (b.cadence.avgDaysSinceUpdate ?? 999));
    else {
      // 'priority' (default): low composite + recent flags + open blockers
      const score = (m) => {
        let s = 0;
        if (m.composite.score != null && m.composite.score < ACTIVITY_THRESHOLDS.composite.amber) s += 3;
        if (m.cadence.staleTasks > 0) s += 2;
        if (m.blocker.unresolved > 0) s += m.blocker.unresolved;
        if (m.risk.greenButOverdue > 0) s += m.risk.greenButOverdue * 2;
        if (m.trend?.composite === 'down') s += 2;
        return s;
      };
      arr.sort((a, b) => score(b) - score(a));
    }
    return arr;
  }, [indexMap, sortBy]);

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 18, background: TOK.bg, fontFamily: FONT_STACK }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Team Activity Dashboard</div>
        <div style={{ fontSize: 12, color: TOK.muted, marginTop: 4, lineHeight: 1.5, maxWidth: 720 }}>
          Read-only coaching view — surfaces who's delivering, who's communicating, and who may need support. Not a performance score. Calibrate thresholds after 4-8 weeks of data.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 14, padding: 10, background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: TOK.muted }}>Window:</span>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, opacity: isOwner ? 1 : 0.55 }}>
          Actions
          <select value={actionWeeks} onChange={(e) => setActionWeeks(+e.target.value)} disabled={!isOwner}
            style={{ fontFamily: FONT_STACK, fontSize: 12, padding: '4px 8px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface, cursor: isOwner ? 'pointer' : 'not-allowed' }}>
            <option value={2}>last 2 weeks</option>
            <option value={4}>last 4 weeks</option>
            <option value={8}>last 8 weeks</option>
          </select>
        </label>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, opacity: isOwner ? 1 : 0.55 }}>
          Tasks
          <select value={taskWeeks} onChange={(e) => setTaskWeeks(+e.target.value)} disabled={!isOwner}
            style={{ fontFamily: FONT_STACK, fontSize: 12, padding: '4px 8px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface, cursor: isOwner ? 'pointer' : 'not-allowed' }}>
            <option value={4}>last 4 weeks</option>
            <option value={12}>last 12 weeks</option>
            <option value={26}>last 26 weeks</option>
          </select>
        </label>
        <span style={{ flex: 1 }} />
        {!isOwner && (
          <span style={{ fontSize: 11, color: TOK.subtle, fontStyle: 'italic', marginRight: 6 }}>
            🔒 Sort &amp; window settings managed by workspace owner
          </span>
        )}
        <span style={{ fontSize: 12, color: TOK.muted, opacity: isOwner ? 1 : 0.55 }}>Sort:</span>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} disabled={!isOwner}
          style={{ fontFamily: FONT_STACK, fontSize: 12, padding: '4px 8px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface, cursor: isOwner ? 'pointer' : 'not-allowed', opacity: isOwner ? 1 : 0.55 }}>
          <option value="priority">Coaching priority</option>
          <option value="composite">Composite score</option>
          <option value="delivery">Delivery</option>
          <option value="cadence">Communication</option>
          <option value="risk">Risk Honesty</option>
          <option value="recent">Recent activity</option>
          <option value="name">Name (A-Z)</option>
        </select>
        {onProjectUpdate && isOwner && (
          <Btn size="sm" onClick={() => setShowDifficulty(!showDifficulty)} title="Configure workstream difficulty multipliers">⚖️ Difficulty</Btn>
        )}
      </div>

      {showDifficulty && onProjectUpdate && isOwner && (
        <WorkstreamDifficultyConfig projects={projects} onProjectUpdate={onProjectUpdate} onClose={() => setShowDifficulty(false)} />
      )}

      {priorities.length > 0 && (
        <div style={{ marginBottom: 14, padding: 12, background: '#fff8e1', border: '1px solid #f0e3a0', borderRadius: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#7a5d00', marginBottom: 6 }}>
            💡 Coaching priorities — top {priorities.length} who may need support
          </div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#7a5d00', lineHeight: 1.7 }}>
            {priorities.map((p) => {
              const reasons = [];
              const dRate = p.metrics.delivery.weightedRate ?? p.metrics.delivery.rate;
              if (sampleStatus(p.metrics.sampleSize.actions) === 'ok' && bucketColor(dRate, ACTIVITY_THRESHOLDS.delivery) === 'red') {
                reasons.push(`delivery ${dRate}%`);
              }
              if (p.metrics.cadence.staleTasks > 0) {
                reasons.push(`${p.metrics.cadence.staleTasks} stale task${p.metrics.cadence.staleTasks === 1 ? '' : 's'}`);
              }
              if (p.metrics.blocker.unresolved > 0) {
                reasons.push(`${p.metrics.blocker.unresolved} open blocker${p.metrics.blocker.unresolved === 1 ? '' : 's'}`);
              }
              if (p.metrics.risk.greenButOverdue > 0) {
                reasons.push(`${p.metrics.risk.greenButOverdue} green→overdue`);
              }
              if (p.metrics.trend?.composite === 'down') {
                reasons.push('trending down ↓');
              }
              return (
                <li key={p.metrics.id}>
                  <strong>{p.pic}</strong>
                  {p.metrics.composite.score != null && <span style={{ fontWeight: 400, opacity: 0.8 }}> (composite {p.metrics.composite.score})</span>}
                  {reasons.length > 0 && <> — {reasons.join(', ')}</>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {picList.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: TOK.muted, fontSize: 13, background: TOK.surface, borderRadius: 8 }}>
          No PIC activity yet. Once tasks have owners and updates, metrics will appear here.
        </div>
      ) : (
        <>
          <div style={{ background: TOK.surface, borderRadius: 8, marginBottom: 14, overflow: 'hidden', border: '1px solid ' + TOK.line }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT_STACK }}>
              <thead>
                <tr style={{ background: TOK.bg }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, color: TOK.muted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.4 }}>PIC</th>
                  <th style={{ padding: '10px 6px', fontSize: 11, color: TOK.muted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.4 }}>Delivery</th>
                  <th style={{ padding: '10px 6px', fontSize: 11, color: TOK.muted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.4 }}>Communication</th>
                  <th style={{ padding: '10px 6px', fontSize: 11, color: TOK.muted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.4 }}>Risk Honesty</th>
                  <th style={{ padding: '10px 6px', fontSize: 11, color: TOK.muted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.4 }}>Engagement</th>
                  <th style={{ padding: '10px 10px', fontSize: 11, color: TOK.muted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.4 }}>Composite</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, color: TOK.muted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.4 }}>Credits (cp)</th>
                </tr>
              </thead>
              <tbody>
                {picList.map((m) => (
                  <PICRow key={m.id} metrics={m} credits={picCredits.get(m.id)} onClick={() => setSelectedPic(m.id)} />
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ background: TOK.surface, borderRadius: 8, padding: 14, border: '1px solid ' + TOK.line }}>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Top delivery rates</div>
            <ActivityChart picList={picList} />
          </div>
        </>
      )}

      {selectedPic && indexMap.get(selectedPic) && (
        <PICDetailModal metrics={indexMap.get(selectedPic)} onClose={() => setSelectedPic(null)} />
      )}
    </div>
  );
}

/* ═════════ PORTFOLIO METRICS + COMPONENTS ═════════ */

function computePortfolioMetrics(projects, options = {}) {
  const now = options.now || new Date();
  const projectList = Object.values(projects);

  const projectHealth = projectList.map((p) => {
    const r = rollup(p);
    let hg = 0, ha = 0, hr = 0;
    let nextMilestone = null;
    let earliestUpcomingDate = null;
    for (const t of collectTasks(p)) {
      if (t.status === 'Dropped' || t.status === 'Completed') continue;
      if (t.health === 'red') hr++;
      else if (t.health === 'amber') ha++;
      else hg++;
      if (t.end && t.status !== 'Completed' && t.status !== 'Dropped') {
        const endDate = new Date(t.end);
        if (!isNaN(endDate) && endDate >= now) {
          if (!earliestUpcomingDate || endDate < earliestUpcomingDate) {
            earliestUpcomingDate = endDate;
            nextMilestone = t;
          }
        }
      }
    }
    let healthLevel = 'green';
    if (r.overdue > 0 || hr > 0) healthLevel = 'red';
    else if (ha > 0 || r.pct < 25) healthLevel = 'amber';
    const sparkline = [];
    for (let w = 7; w >= 0; w--) {
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() - w * 7);
      let done = 0, total = 0;
      for (const t of collectTasks(p)) {
        if (t.status === 'Dropped') continue;
        if (!t.end) continue;
        const tEnd = new Date(t.end);
        if (isNaN(tEnd)) continue;
        if (tEnd > weekEnd) continue;
        total++;
        if (t.status === 'Completed') done++;
      }
      sparkline.push(total > 0 ? Math.round(100 * done / total) : 0);
    }
    return {
      project: p,
      pct: r.pct,
      done: r.done,
      total: r.total,
      overdue: r.overdue,
      hg, ha, hr,
      healthLevel,
      nextMilestone: nextMilestone ? {
        name: nextMilestone.name,
        end: nextMilestone.end,
        daysUntil: daysBetween(now, new Date(nextMilestone.end)),
      } : null,
      sparkline,
    };
  });

  const workloadByPic = new Map();
  for (const project of projectList) {
    for (const pg of project.programs || []) {
      for (const ws of pg.workstreams || []) {
        for (const t of ws.tasks || []) {
          if (!t.pic) continue;
          if (t.status === 'Dropped' || t.status === 'Completed') continue;
          if (!workloadByPic.has(t.pic)) {
            workloadByPic.set(t.pic, { pic: t.pic, perProject: new Map(), totalActive: 0, overdueCount: 0, statusLevel: 'balanced' });
          }
          const wl = workloadByPic.get(t.pic);
          if (!wl.perProject.has(project.id)) {
            wl.perProject.set(project.id, { project, count: 0, tasks: [] });
          }
          wl.perProject.get(project.id).count++;
          wl.perProject.get(project.id).tasks.push(t);
          wl.totalActive++;
          if (isOverdueTask(t, now)) wl.overdueCount++;
        }
      }
    }
  }
  for (const wl of workloadByPic.values()) {
    if (wl.totalActive >= 6 || wl.overdueCount >= 2) wl.statusLevel = 'overloaded';
    else if (wl.totalActive >= 3) wl.statusLevel = 'stretched';
    else wl.statusLevel = 'balanced';
  }
  const workload = Array.from(workloadByPic.values()).sort((a, b) => b.totalActive - a.totalActive);

  const calendar = [];
  for (let w = 0; w < 12; w++) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1 + w * 7);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    let hardCount = 0, softCount = 0, actionCount = 0;
    const items = [];

    for (const project of projectList) {
      for (const pg of project.programs || []) {
        for (const ws of pg.workstreams || []) {
          for (const t of ws.tasks || []) {
            if (!t.end || t.status === 'Completed' || t.status === 'Dropped') continue;
            const end = new Date(t.end);
            if (end >= weekStart && end <= weekEnd) {
              const deadlineType = t.deadlineType || DEFAULT_DEADLINE_TYPE;
              if (deadlineType === 'hard') hardCount++; else softCount++;
              items.push({ kind: deadlineType === 'hard' ? 'task-hard' : 'task-soft', name: t.name, project: project.name, pic: t.pic });
            }
          }
        }
      }
      for (const a of project.actionItems || []) {
        if (!a.dueDate || a.status === 'Done' || a.status === 'Cancelled') continue;
        const due = new Date(a.dueDate);
        if (due >= weekStart && due <= weekEnd) {
          actionCount++;
          items.push({ kind: 'action', name: a.title, project: project.name, pic: a.pic });
        }
      }
    }
    const total = hardCount + softCount + actionCount;
    let intensity = 'low';
    if (total >= 15) intensity = 'peak';
    else if (total >= 8) intensity = 'high';
    else if (total >= 3) intensity = 'medium';

    calendar.push({
      weekStart, weekEnd, hardCount, softCount, actionCount, total, intensity, items,
      label: `Week of ${fmtDateShort(weekStart.toISOString().slice(0, 10))}`,
    });
  }

  const signals = [];
  for (const wl of workload) {
    if (wl.totalActive >= 6) {
      signals.push({
        severity: 'high',
        kind: 'overload',
        message: `${wl.pic} has ${wl.totalActive} active tasks across ${wl.perProject.size} project${wl.perProject.size === 1 ? '' : 's'}`,
        suggestion: 'Consider redistributing or descoping',
      });
    }
    if (wl.overdueCount >= 2) {
      signals.push({
        severity: 'high',
        kind: 'overdue',
        message: `${wl.pic} has ${wl.overdueCount} overdue tasks`,
        suggestion: 'Direct check-in to identify blockers',
      });
    }
  }
  for (const ph of projectHealth) {
    if (ph.total > 0 && (ph.overdue / ph.total) > 0.30) {
      signals.push({
        severity: 'high',
        kind: 'project_overdue',
        message: `${ph.project.name}: ${ph.overdue} of ${ph.total} milestones overdue (${Math.round(100 * ph.overdue / ph.total)}%)`,
        suggestion: 'Project may need re-planning',
      });
    }
    for (const pg of ph.project.programs || []) {
      for (const ws of pg.workstreams || []) {
        let amber = 0, red = 0;
        for (const t of ws.tasks || []) {
          if (t.status === 'Dropped') continue;
          if (t.health === 'red') red++;
          else if (t.health === 'amber') amber++;
        }
        if (red >= 2 || (amber + red) >= 3) {
          signals.push({
            severity: red >= 2 ? 'high' : 'medium',
            kind: 'workstream_health',
            message: `${ph.project.name} › ${pg.name} › ${ws.name}: ${red} off-track, ${amber} at-risk`,
            suggestion: 'Workstream needs review',
          });
        }
      }
    }
  }
  for (const wk of calendar) {
    if (wk.intensity === 'peak') {
      signals.push({
        severity: 'medium',
        kind: 'peak_week',
        message: `${wk.label}: ${wk.total} deadlines (${wk.hardCount} hard, ${wk.softCount} soft, ${wk.actionCount} actions)`,
        suggestion: 'Negotiate moving non-critical deadlines earlier',
      });
    }
  }
  for (const project of projectList) {
    for (const pg of project.programs || []) {
      for (const ws of pg.workstreams || []) {
        for (const t of ws.tasks || []) {
          for (const u of (t.updates || [])) {
            if (!u.isBlocker || !u.resolvedAt) continue;
            if (u.resolvedBy !== u.author) continue;
            const hours = (new Date(u.resolvedAt) - new Date(u.timestamp)) / 3600000;
            if (hours > 0 && hours < 24) {
              signals.push({
                severity: 'low',
                kind: 'silent_struggle',
                message: `${u.author} self-resolved blocker on "${t.name}" within ${Math.round(hours)}h`,
                suggestion: 'May indicate struggling alone — check in',
              });
            }
          }
        }
      }
    }
  }
  const sevOrder = { high: 0, medium: 1, low: 2 };
  signals.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  return { projectHealth, workload, calendar, signals };
}

function Sparkline({ data, width = 80, height = 24, color = TOK.accent }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(100, ...data);
  const min = 0;
  const dx = width / Math.max(1, data.length - 1);
  const pts = data.map((v, i) => {
    const x = i * dx;
    const y = height - ((v - min) / (max - min || 1)) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

function HealthHeatmap({ projectHealth, onProjectClick }) {
  return (
    <div style={{ background: TOK.surface, borderRadius: 8, padding: 14, border: '1px solid ' + TOK.line }}>
      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4, color: TOK.muted }}>Project Health</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {projectHealth.map((ph) => {
          const c = COLOR_MAP[ph.healthLevel] || COLOR_MAP.subtle;
          return (
            <div key={ph.project.id} onClick={() => onProjectClick && onProjectClick(ph.project.id)} style={{
              padding: 12, background: TOK.surface, border: `2px solid ${c.fg}`, borderRadius: 8, cursor: 'pointer',
            }}
              onMouseEnter={(e) => (e.currentTarget.style.background = TOK.bg)}
              onMouseLeave={(e) => (e.currentTarget.style.background = TOK.surface)}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{ph.project.name}</div>
                <Sparkline data={ph.sparkline} width={56} height={18} color={c.fg} />
              </div>
              <div style={{ fontSize: 11, color: TOK.muted, marginTop: 6 }}>
                {ph.pct}% · {ph.done}/{ph.total}{ph.overdue ? ` · ${ph.overdue} overdue` : ''}
              </div>
              <div style={{ fontSize: 11, color: TOK.muted, marginTop: 2 }}>
                🟢{ph.hg} 🟡{ph.ha} 🔴{ph.hr}
              </div>
              {ph.nextMilestone && (
                <div style={{ fontSize: 11, color: TOK.muted, marginTop: 6 }}>
                  Next: <span style={{ color: TOK.ink }}>{ph.nextMilestone.name}</span> in {ph.nextMilestone.daysUntil}d
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkloadDistribution({ workload }) {
  if (!workload.length) return null;
  const maxActive = Math.max(...workload.map((w) => w.totalActive), 1);
  const STATUS_COLOR = {
    overloaded: { fg: TOK.healthRed, bg: TOK.healthRedBg },
    stretched: { fg: TOK.healthAmber, bg: TOK.healthAmberBg },
    balanced: { fg: TOK.healthGreen, bg: TOK.healthGreenBg },
  };
  return (
    <div style={{ background: TOK.surface, borderRadius: 8, padding: 14, border: '1px solid ' + TOK.line }}>
      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4, color: TOK.muted }}>Workload Distribution</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {workload.map((wl) => {
          const sc = STATUS_COLOR[wl.statusLevel];
          return (
            <div key={wl.pic} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 90, fontSize: 12, fontWeight: 500 }}>{wl.pic}</div>
              <div style={{ flex: 1, height: 18, background: TOK.bg, borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                {Array.from(wl.perProject.values()).map((pp, i) => (
                  <div key={i} title={`${pp.project.name}: ${pp.count} tasks`}
                    style={{ width: `${100 * pp.count / maxActive}%`, background: sc.fg, opacity: 0.4 + 0.6 * (i % 3 === 0 ? 1 : i % 3 === 1 ? 0.7 : 0.5), borderRight: '1px solid ' + TOK.surface }} />
                ))}
              </div>
              <div style={{ fontSize: 11, color: TOK.muted, minWidth: 56 }}>{wl.totalActive} act</div>
              <div style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 999, color: sc.fg, background: sc.bg }}>
                {wl.statusLevel}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PeakSeasonCalendar({ calendar }) {
  const [hover, setHover] = useState(null);
  const INTENSITY_BG = {
    peak: '#A32D2D',
    high: '#E0A03C',
    medium: '#7AAA7A',
    low: '#E5E3DC',
  };
  return (
    <div style={{ background: TOK.surface, borderRadius: 8, padding: 14, border: '1px solid ' + TOK.line }}>
      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4, color: TOK.muted }}>Peak Season (Next 12 Weeks)</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4 }}>
        {calendar.map((wk, i) => (
          <div key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{
              padding: 6, borderRadius: 4, background: INTENSITY_BG[wk.intensity],
              color: wk.intensity === 'peak' || wk.intensity === 'high' ? '#fff' : TOK.ink,
              fontSize: 10, textAlign: 'center', cursor: 'default', minHeight: 38, position: 'relative',
            }}>
            <div style={{ fontWeight: 500 }}>W{i + 1}</div>
            <div style={{ marginTop: 2, opacity: 0.85 }}>{wk.total}</div>
          </div>
        ))}
      </div>
      {hover != null && (
        <div style={{ marginTop: 10, padding: 10, background: TOK.bg, borderRadius: 6, fontSize: 12 }}>
          <div style={{ fontWeight: 500 }}>{calendar[hover].label}</div>
          <div style={{ color: TOK.muted, marginTop: 2 }}>
            {calendar[hover].hardCount} hard · {calendar[hover].softCount} soft · {calendar[hover].actionCount} actions
          </div>
        </div>
      )}
    </div>
  );
}

function StressSignals({ signals }) {
  const SEV_BG = {
    high: TOK.healthRedBg,
    medium: TOK.healthAmberBg,
    low: TOK.bg,
  };
  const SEV_FG = {
    high: TOK.healthRed,
    medium: TOK.healthAmber,
    low: TOK.muted,
  };
  return (
    <div style={{ background: TOK.surface, borderRadius: 8, padding: 14, border: '1px solid ' + TOK.line }}>
      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4, color: TOK.muted }}>Stress Signals ({signals.length})</div>
      {signals.length === 0 && (
        <div style={{ fontSize: 12, color: TOK.muted }}>No stress signals detected. 👍</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {signals.map((s, i) => (
          <div key={i} style={{ padding: '8px 10px', background: SEV_BG[s.severity], borderRadius: 6, borderLeft: `3px solid ${SEV_FG[s.severity]}` }}>
            <div style={{ fontSize: 12, color: TOK.ink, fontWeight: 500 }}>{s.message}</div>
            <div style={{ fontSize: 11, color: TOK.muted, marginTop: 2 }}>{s.suggestion}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PortfolioView({ projects, onProjectClick }) {
  const data = useMemo(() => computePortfolioMetrics(projects), [projects]);
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 18, background: TOK.bg, fontFamily: FONT_STACK }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Portfolio Overview</div>
        <div style={{ fontSize: 11, color: TOK.muted, marginTop: 2 }}>Workspace-owner view across all projects.</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <HealthHeatmap projectHealth={data.projectHealth} onProjectClick={onProjectClick} />
        <WorkloadDistribution workload={data.workload} />
        <PeakSeasonCalendar calendar={data.calendar} />
        <StressSignals signals={data.signals} />
      </div>
    </div>
  );
}

/* ═════════ CREDIT REPORT (v25 — owner-only) ═════════ */

// v30 Phase 3 — Sticky banner shown when owner is impersonating a member.
// Signals the impersonated identity, reminds of the audit format, and
// offers a single Exit button.
function ImpersonationBanner({ actingAs, realAuthor, onExit }) {
  return (
    <div style={{
      padding: '8px 16px',
      background: TOK.mentionBg,
      borderBottom: '2px solid ' + TOK.mention,
      display: 'flex', alignItems: 'center', gap: 12,
      fontFamily: FONT_STACK,
    }}>
      <span style={{ fontSize: 18 }}>🎭</span>
      <div style={{ flex: 1, fontSize: 13, color: TOK.mention }}>
        <strong>Viewing as {actingAs}</strong>
        <span style={{ marginLeft: 8, opacity: 0.85 }}>
          Read-only: changes are not saved (exit to edit). Signed in: {realAuthor}.
        </span>
      </div>
      <Btn size="sm" variant="primary" onClick={onExit}>Exit impersonation</Btn>
    </div>
  );
}

// Small summary card for the report header
function SummaryCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 8, padding: 12,
    }}>
      <div style={{ fontSize: 11, color: TOK.muted, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 500, color: accent || TOK.ink, marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: TOK.subtle }}>{sub}</div>
    </div>
  );
}

// Sortable column header for PIC table
function SortableHeader({ label, field, sortBy, onSort, align = 'left' }) {
  const isActive = sortBy === field;
  return (
    <div onClick={() => onSort(field)}
      style={{
        textAlign: align, cursor: 'pointer', userSelect: 'none',
        color: isActive ? TOK.accent : TOK.muted,
        display: 'flex', alignItems: 'center',
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start', gap: 3,
      }}>
      <span>{label}</span>
      {isActive && <span style={{ fontSize: 9 }}>▼</span>}
    </div>
  );
}

/* ═════════ MY WORK (v30) ═════════ */

function myWorkTimeAgo(ts) {
  if (!ts) return '';
  const d = parseDate(ts);
  if (!d) return '';
  const diff = Math.max(0, Date.now() - d.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDateShort(ts);
}

function MyWorkSection({ icon, title, count, subtitle, defaultOpen = false, headerRight, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 10, marginBottom: 12, overflow: 'hidden' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
          cursor: 'pointer', userSelect: 'none',
          borderBottom: open ? '1px solid ' + TOK.line : 'none',
          background: open ? TOK.bg : TOK.surface,
        }}>
        <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: TOK.ink }}>{title}</span>
        {typeof count === 'number' && count > 0 && (
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: TOK.bg, color: TOK.muted, fontWeight: 500 }}>
            {count}
          </span>
        )}
        {subtitle && <span style={{ fontSize: 11.5, color: TOK.muted, marginLeft: 4 }}>{subtitle}</span>}
        <div style={{ flex: 1 }} />
        {headerRight && <span onClick={(e) => e.stopPropagation()}>{headerRight}</span>}
        <span style={{ color: TOK.muted, display: 'inline-flex' }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </div>
      {open && <div style={{ padding: '10px 16px 14px' }}>{children}</div>}
    </div>
  );
}

function StatusQuickPill({ status, onChange, statuses }) {
  const [menu, setMenu] = useState(null);
  const opts = statuses || STATUSES;
  const safeStatus = status || opts[0] || 'Planned';
  const map = {
    Planned: { fg: TOK.plannedFg, bg: TOK.plannedBg, icon: <Circle size={10} /> },
    InProgress: { fg: TOK.inprogFg, bg: TOK.inprogBg, icon: <PlayCircle size={10} /> },
    Completed: { fg: TOK.doneFg, bg: TOK.doneBg, icon: <CheckCircle2 size={10} /> },
    Dropped: { fg: TOK.droppedFg, bg: TOK.droppedBg, icon: <X size={10} /> },
    Pending: { fg: TOK.plannedFg, bg: TOK.plannedBg, icon: <Circle size={10} /> },
    'Pushed to OP': { fg: TOK.programFg, bg: TOK.programBg, icon: <Activity size={10} /> },
    Done: { fg: TOK.doneFg, bg: TOK.doneBg, icon: <CheckCircle2 size={10} /> },
    Cancelled: { fg: TOK.droppedFg, bg: TOK.droppedBg, icon: <X size={10} /> },
    Open: { fg: TOK.muted, bg: TOK.bg, icon: <Circle size={10} /> },
    Blocked: { fg: '#A32D2D', bg: '#FCEBEB', icon: <X size={10} /> },
  };
  const s = map[safeStatus] || map.Planned;
  const openMenu = (e) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu({ x: rect.left, y: rect.bottom + 4 });
  };
  return (
    <>
      <button
        type="button"
        onClick={onChange ? openMenu : (e) => e.stopPropagation()}
        title={onChange ? 'Change status' : undefined}
        style={{
          fontFamily: FONT_STACK, fontSize: 10.5, fontWeight: 500,
          padding: '2px 7px', borderRadius: 999, border: 'none',
          color: s.fg, background: s.bg, cursor: onChange ? 'pointer' : 'default',
          display: 'inline-flex', alignItems: 'center', gap: 3,
        }}>
        {s.icon} {STATUS_LABEL[safeStatus] || safeStatus}
        {onChange && <ChevronDown size={9} style={{ opacity: 0.7, marginLeft: 1 }} />}
      </button>
      {menu && onChange && (
        <PopoverMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={opts.map((st) => ({
            label: (STATUS_LABEL[st] || st) + (st === safeStatus ? '  ✓' : ''),
            icon: (map[st] || map.Planned).icon,
            danger: st === 'Dropped' || st === 'Cancelled',
            onClick: () => { if (st !== safeStatus) onChange(st); },
          }))}
        />
      )}
    </>
  );
}

function MyWorkBreadcrumb({ project, program, workstream }) {
  const parts = [project?.name, program?.name, workstream?.name].filter(Boolean);
  return <span style={{ fontSize: 11, color: TOK.muted }}>{parts.join(' › ')}</span>;
}

// U1: one close request in My Work ("needs" = I decide, "sent" = I asked).
// The buttons are the task panel's CloseControl, writing through the same
// onTaskUpdate -> applyTaskUpdate choke point as every other My Work edit.
function MyWorkApprovalRow({ item, mode, onTaskClick, onTaskUpdate, dialogs }) {
  const me = useContext(MeContext);
  const { project, program, workstream, task, waitingDays, escalated } = item;
  const cr = task.closeRequest || {};
  const who = mode === 'needs'
    ? `Requested by ${me.nameOf(cr.requestedByUid) || cr.requestedBy || '—'}`
    : `Approver: ${me.nameOf(cr.approverUid) || '—'}`;
  const waiting = waitingDays === 0 ? 'Sent today' : `Waiting ${waitingDays} working day${waitingDays === 1 ? '' : 's'}`;
  return (
    <div style={{ borderLeft: '3px solid ' + (escalated ? TOK.overdueFg : TOK.inprogFg), padding: '8px 12px', background: TOK.bg, marginBottom: 6, borderRadius: 4 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: TOK.ink }}>
        <span role="button" tabIndex={0} style={{ cursor: 'pointer' }}
          onClick={() => onTaskClick(task.id, project.id)}
          onKeyDown={(e) => { if (e.key === 'Enter') onTaskClick(task.id, project.id); }}>
          {task.name}
        </span>
      </div>
      <div style={{ fontSize: 11, color: TOK.muted, marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <MyWorkBreadcrumb project={project} program={program} workstream={workstream} />
        <span>· {who}</span>
        <span>· {cr.outcome === 'Dropped' ? 'Submitted as dropped' : 'Submitted as done'}</span>
        {escalated ? (
          <span style={{ color: TOK.overdueFg, background: TOK.overdueBg, fontWeight: 600, padding: '1px 7px', borderRadius: 999 }}>
            {`Waiting ${waitingDays} working days — escalated`}
          </span>
        ) : <span>· {waiting}</span>}
      </div>
      <div style={{ marginTop: 8 }}>
        <CloseControl task={task} roles={project.__v2.roles} onUpdate={(t) => onTaskUpdate(t, project.id)} dialogs={dialogs} />
      </div>
    </div>
  );
}

function MyWorkDeadlineTypePill({ type }) {
  if (!type) return null;
  const hard = type === 'hard';
  return (
    <span style={{
      fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 999,
      color: hard ? TOK.overdueFg : TOK.inprogFg,
      background: hard ? TOK.overdueBg : TOK.inprogBg,
      display: 'inline-flex', alignItems: 'center', gap: 3,
    }}>
      {hard ? '🔒 Hard' : '🎯 Soft'}
    </span>
  );
}

// v30.M — Collect "steps" for a task by walking linked action items.
// In Option B we don't add a new task.steps[] schema; instead we treat each
// open subtask of an actionItem with relatedTaskId === task.id as a step
// shown inline under the task card. The parent action is tracked so the
// caller knows which action document to mutate when a step is marked Done.
function collectTaskSteps(task, project) {
  if (!task?.id || !project?.actionItems) return [];
  const out = [];
  let order = 0;
  for (const a of project.actionItems) {
    if (a.relatedTaskId !== task.id) continue;
    for (const sub of (a.subtasks || [])) {
      order++;
      out.push({ subtask: sub, action: a, order });
    }
  }
  return out;
}

// v30.M — Compact step row used inline inside the task card. ✓ Done button
// shows only when this user owns the step. Done steps render at the bottom
// dimmed/strikethrough; not interactive.
function StepLine({ entry, isFirstOpen, isMine, onDone }) {
  const { subtask, order } = entry;
  const done = subtask.status === 'Done';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
      opacity: done ? 0.55 : 1,
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%',
        background: done ? TOK.accent : (isFirstOpen ? TOK.ink : '#EDEBE4'),
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 700, flexShrink: 0,
      }}>
        {done ? '✓' : order}
      </div>
      <span style={{
        fontSize: 12, flex: 1, color: done ? TOK.muted : TOK.ink,
        textDecoration: done ? 'line-through' : 'none',
        fontWeight: isFirstOpen && !done ? 500 : 400,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{subtask.title || '(untitled step)'}</span>
      {isFirstOpen && !done && (
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
          background: TOK.ink, color: '#fff', letterSpacing: 0.3,
        }}>NEXT</span>
      )}
      {subtask.pic && !done && (
        <span style={{ fontSize: 10, color: TOK.muted, marginLeft: 4 }}>· {subtask.pic}</span>
      )}
      {isMine && !done && onDone && (
        <button onClick={(e) => { e.stopPropagation(); onDone(); }}
          title="Mark step done"
          style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid #9FCB75',
            background: TOK.doneBg || '#E6EFD6', color: TOK.doneFg || '#356512',
            cursor: 'pointer', fontWeight: 500,
          }}>✓ Done</button>
      )}
    </div>
  );
}

function TaskRowInline({ task, project, program, workstream, author, teamMembers, onStatusChange, onAddUpdate, onRequestExtension, onOpenDetails, onAddAction, onMarkDone, onStepDone }) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState('');
  const [isBlocker, setIsBlocker] = useState(false);
  const overdue = isOverdue(task);
  const endDate = parseDate(task.end);
  const steps = useMemo(() => collectTaskSteps(task, project), [task, project]);
  const openSteps = steps.filter((s) => s.subtask.status !== 'Done');
  const doneCount = steps.length - openSteps.length;
  const firstOpen = openSteps[0] || null;
  const recentUpdates = (task.updates || []).slice(0, 2);
  return (
    <div style={{ border: '1px solid ' + TOK.line, borderRadius: 8, marginBottom: 6, background: TOK.surface }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', minHeight: 40 }}>
        <span style={{ color: TOK.subtle, fontSize: 13, lineHeight: 1 }}>▢</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: TOK.ink, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {task.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
            <MyWorkBreadcrumb project={project} program={program} workstream={workstream} />
            {endDate && (
              <span style={{ fontSize: 11, color: overdue ? TOK.overdueFg : TOK.muted, fontWeight: overdue ? 500 : 400 }}>
                {overdue ? '⚠ ' : ''}due {fmtDateShort(task.end)}
              </span>
            )}
            <MyWorkDeadlineTypePill type={task.deadlineType} />
            {openSteps.length > 0 && (
              <span style={{ fontSize: 11, color: TOK.muted }}>· {openSteps.length} step{openSteps.length > 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
        <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
          <StatusQuickPill status={task.status} onChange={(st) => onStatusChange(st)} />
        </span>
        {task.status !== 'Completed' && onMarkDone && (
          <Btn size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); onMarkDone(); }} title="Mark done">✓</Btn>
        )}
        <ChevronDown size={14} style={{ color: TOK.muted, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }} />
      </div>
      {/* NEXT STEP preview strip — collapsed-only hint of what's next */}
      {!expanded && firstOpen && (
        <div style={{
          padding: '6px 12px 8px 38px', borderTop: '1px dashed ' + TOK.line,
          fontSize: 11, color: TOK.muted, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
            background: TOK.ink, color: '#fff', letterSpacing: 0.3,
          }}>NEXT</span>
          <span style={{ color: TOK.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {firstOpen.subtask.title || '(untitled step)'}
          </span>
          {firstOpen.subtask.pic && <span>· {firstOpen.subtask.pic}</span>}
        </div>
      )}
      {expanded && (
        <div style={{ padding: '10px 12px 12px', borderTop: '1px solid ' + TOK.line, background: TOK.bg }}>
          {/* Steps (subtasks of linked actions) — option B */}
          {steps.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>Steps</div>
              {openSteps.slice(0, 6).map((entry, idx) => (
                <StepLine
                  key={entry.action.id + ':' + (entry.subtask.id || idx)}
                  entry={entry}
                  isFirstOpen={idx === 0}
                  isMine={entry.subtask.pic === author}
                  onDone={onStepDone ? () => onStepDone(entry.action, entry.subtask) : null}
                />
              ))}
              {openSteps.length > 6 && (
                <div style={{ fontSize: 11, color: TOK.muted, paddingLeft: 26, marginTop: 2 }}>
                  +{openSteps.length - 6} more open step{openSteps.length - 6 > 1 ? 's' : ''}
                </div>
              )}
              {doneCount > 0 && (
                <div style={{ fontSize: 10, color: TOK.subtle, paddingLeft: 26, marginTop: 4 }}>
                  ✓ {doneCount} completed step{doneCount > 1 ? 's' : ''}
                </div>
              )}
            </div>
          )}

          {/* Recent updates feed (last 2) */}
          {recentUpdates.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>Recent updates</div>
              {recentUpdates.map((u) => (
                <div key={u.id} style={{
                  display: 'flex', gap: 8, padding: '5px 0',
                  borderTop: '1px dashed ' + TOK.line,
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: TOK.bg, color: TOK.muted,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 700, flexShrink: 0,
                  }}>{(u.author || '??').slice(0, 2).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 11.5 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                      <strong style={{ fontSize: 11 }}>{u.author}</strong>
                      <span style={{ fontSize: 10, color: TOK.subtle }}>{fmtDateTime ? fmtDateTime(u.timestamp) : ''}</span>
                      {u.isBlocker && <span style={{ fontSize: 10, color: TOK.overdueFg }}>🚩 Blocker</span>}
                    </div>
                    <div style={{ color: TOK.ink, marginTop: 2, lineHeight: 1.5 }}>
                      <MentionedText text={u.text || ''} teamMembers={teamMembers} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, marginBottom: 6 }}>Post update</div>
          <MentionTextarea
            value={draft}
            onChange={setDraft}
            rows={2}
            placeholder={`Type @ to mention. Posted as ${author || '…'}.`}
            teamMembers={teamMembers}
          />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: TOK.muted, marginTop: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={isBlocker} onChange={(e) => setIsBlocker(e.target.checked)} /> This is a blocker
          </label>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            <Btn size="sm" variant="primary" disabled={!draft.trim()} onClick={() => {
              onAddUpdate(draft.trim(), isBlocker);
              setDraft(''); setIsBlocker(false); setExpanded(false);
            }}>Post update</Btn>
            <Btn size="sm" onClick={onRequestExtension}><Calendar size={11} /> Request extension</Btn>
            {onAddAction && (
              <Btn size="sm" onClick={(e) => { e.stopPropagation(); onAddAction(); }}><Plus size={11} /> Add action</Btn>
            )}
            <Btn size="sm" variant="ghost" onClick={onOpenDetails}>→ Open full details</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// v30.A — Row for an action item in My Work. C+D hybrid expand pattern,
// mirrors TaskRowInline. Collapsed shows title + breadcrumb + due +
// priority + status. Expanded reveals inline-editable title, PIC, due,
// priority, plus comment thread with @mention support.
function ActionRowInline({ action, project, related, author, teamMembers, picSuggestions, onChange, onAddComment, onOpenDetails, onMarkDone, onSubtasksChange, showToast }) {
  const me = useContext(MeContext);
  const dirIndex = useContext(DirectoryIndexContext);
  const [expanded, setExpanded] = useState(false);
  const [titleDraft, setTitleDraft] = useState(action.title || '');
  const [commentDraft, setCommentDraft] = useState('');
  const [isBlocker, setIsBlocker] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  const webhook = project?.googleChatWebhook || null;
  const [notifyChat, setNotifyChat] = useState(() => webhook ? getNotifyPref(project.id) : false);

  // Keep local title in sync when external action.title changes
  useEffect(() => { setTitleDraft(action.title || ''); }, [action.title]);

  const overdue = action.dueDate && action.status !== 'Done' && action.status !== 'Cancelled' && parseDate(action.dueDate) < today();
  const pc = priorityColor(action.priority);
  const updates = action.updates || [];
  const visibleComments = showAllComments ? updates : updates.slice(0, 3);

  const commitTitle = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== action.title) onChange({ title: trimmed });
    else if (!trimmed) setTitleDraft(action.title || '');
  };

  return (
    <div style={{ border: '1px solid ' + TOK.line, borderRadius: 8, marginBottom: 6, background: TOK.surface }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', minHeight: 44 }}>
        <span style={{ color: TOK.subtle, fontSize: 13, lineHeight: 1 }}>▢</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {expanded ? (
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
              onClick={(e) => e.stopPropagation()}
              style={{ fontFamily: FONT_STACK, fontSize: 13, fontWeight: 500, width: '100%', padding: '4px 6px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface, color: TOK.ink, outline: 'none' }}
            />
          ) : (
            <div style={{ fontSize: 13, color: TOK.ink, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <MentionedText text={action.title || '(untitled action)'} teamMembers={teamMembers} />
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap', fontSize: 11, color: TOK.muted }}>
            <span>{project.name}</span>
            {related && <span>· {related.program.name} › {related.workstream.name} › {related.task.name}</span>}
            {action.dueDate && <span style={{ color: overdue ? TOK.overdueFg : TOK.muted, fontWeight: overdue ? 500 : 400 }}>· 📅 {fmtDateShort(action.dueDate)}</span>}
            {updates.length > 0 && <span>· 💬 {updates.length}</span>}
            {(action.subtasks || []).length > 0 && (
              <span>· ✓ {(action.subtasks || []).filter((s) => s.status === 'Done').length}/{(action.subtasks || []).length}</span>
            )}
          </div>
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 500, padding: '2px 7px', borderRadius: 999, color: pc.fg, background: pc.bg }}>{action.priority}</span>
        <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
          <StatusQuickPill status={action.status} onChange={(st) => onChange({ status: st })} statuses={ACTION_STATUSES} />
        </span>
        {action.status !== 'Done' && onMarkDone && (
          <Btn size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); onMarkDone(); }} title="Mark done">✓</Btn>
        )}
        <ChevronDown size={14} style={{ color: TOK.muted, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }} />
      </div>
      {expanded && (
        <div style={{ padding: '10px 12px 12px', borderTop: '1px solid ' + TOK.line, background: TOK.bg, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, minWidth: 50 }}>PIC</span>
            <select
              value={action.pic || ''}
              onChange={(e) => onChange({ pic: dirIndex ? resolvePicValue(e.target.value, teamMembers, dirIndex) : e.target.value })}
              onClick={(e) => e.stopPropagation()}
              style={{ fontFamily: FONT_STACK, fontSize: 12, padding: '4px 8px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface, color: TOK.ink, minWidth: 160 }}>
              <option value="">(unassigned)</option>
              {(picSuggestions || []).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, minWidth: 50 }}>Due</span>
            <input
              type="date"
              value={action.dueDate || ''}
              onChange={(e) => onChange({ dueDate: e.target.value || null })}
              onClick={(e) => e.stopPropagation()}
              style={{ fontFamily: FONT_STACK, fontSize: 12, padding: '4px 8px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface, color: TOK.ink }}
            />
            <span style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, marginLeft: 16 }}>Priority</span>
            <select
              value={action.priority || 'Medium'}
              onChange={(e) => onChange({ priority: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              style={{ fontFamily: FONT_STACK, fontSize: 12, padding: '4px 8px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface, color: TOK.ink }}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div style={{ borderTop: '1px solid ' + TOK.line, paddingTop: 10 }}>
            <div style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, marginBottom: 6 }}>💬 Comments ({updates.length})</div>
            {visibleComments.map((u) => (
              <div key={u.id} style={{ fontSize: 12, color: TOK.ink, padding: '6px 0', borderBottom: '1px dashed ' + TOK.line, display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, color: TOK.muted, marginBottom: 2 }}>
                    <span style={{ color: TOK.ink, fontWeight: 500 }}>{u.author}</span> · {myWorkTimeAgo(u.timestamp)}
                    {u.isBlocker && <span style={{ marginLeft: 6, color: TOK.blocker, fontWeight: 500 }}>🚨 Blocker</span>}
                  </div>
                  <MentionedText text={u.text} teamMembers={teamMembers} />
                </div>
              </div>
            ))}
            {updates.length > 3 && !showAllComments && (
              <button onClick={() => setShowAllComments(true)} style={{ background: 'none', border: 'none', color: TOK.accent, fontSize: 11.5, cursor: 'pointer', padding: '4px 0', fontFamily: FONT_STACK }}>
                Show all ({updates.length})
              </button>
            )}
            <div style={{ marginTop: 8 }}>
              <MentionTextarea
                value={commentDraft}
                onChange={setCommentDraft}
                rows={2}
                placeholder={`Type @ to mention. Posted as ${author || '…'}.`}
                teamMembers={teamMembers}
              />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: TOK.muted, marginTop: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={isBlocker} onChange={(e) => setIsBlocker(e.target.checked)} /> Mark as blocker
              </label>
              {webhook && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: TOK.muted, marginTop: 6, marginLeft: 14, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={notifyChat}
                    onChange={(e) => {
                      setNotifyChat(e.target.checked);
                      setNotifyPref(project.id, e.target.checked);
                    }}
                  /> 📢 Notify {project.name} chat
                </label>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <Btn size="sm" variant="primary" disabled={!commentDraft.trim()} onClick={async () => {
                  const text = commentDraft.trim();
                  const wantsNotify = notifyChat && !!webhook;
                  // Apply the existing comment write first — chat failure must never block this.
                  onAddComment(text, isBlocker);
                  setCommentDraft(''); setIsBlocker(false);
                  if (!wantsNotify || me.readOnly) return; // P3-16: View as never posts to Chat
                  const result = await postToChat(webhook, buildActionCard({
                    project,
                    action,
                    related,
                    author,
                    text,
                    isBlocker,
                    timestamp: new Date().toISOString(),
                  }));
                  if (result.ok) {
                    showToast && showToast('Comment posted · 📢 Sent to chat');
                  } else {
                    showToast && showToast(`Comment posted. Chat notify failed: ${result.status} ${result.statusText} — owner can re-check the webhook URL in Project Settings.`);
                  }
                }}>Post comment</Btn>
                {onOpenDetails && <Btn size="sm" variant="ghost" onClick={onOpenDetails}>→ Open in Actions tab</Btn>}
              </div>
            </div>
          </div>

          {onSubtasksChange && (
            <div style={{ borderTop: '1px solid ' + TOK.line, paddingTop: 10 }}>
              <SubtaskEditor
                subtasks={action.subtasks || []}
                picSuggestions={picSuggestions}
                author={author}
                onChange={onSubtasksChange}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// v30 — Inline row for a RAID mitigation action surfaced inside Actions /
// My Work / By Project. Mirrors ActionRowInline collapsed-vs-expanded UX
// but writes back to project.programs[].raid[].mitigationActions[] via
// applyMitigationUpdate. Footer has a "→ Open RAID item" link that calls
// onNavigateRaid(projectId, programId).
function MitigationRowInline({
  entry, // { mitigation, parentItem, parentProgram, project }
  author, teamMembers, picSuggestions,
  onApplyMitigation, // (newProject) => void — typically wraps updateProject
  onNavigateRaid,    // (projectId, programId) => void
  showToast,
}) {
  const dirIndex = useContext(DirectoryIndexContext);
  const me = useContext(MeContext);
  const { mitigation, parentItem, parentProgram, project } = entry;
  // Wave 2 R5: on v2 a mitigation is part of raid/{programId}: editable only by the
  // Owner or a PM / Deputy / Sub-PM of that program; read-only otherwise. v1 unchanged.
  const canEdit = canEditRaid({
    isOwner: !!me.isOwner, isV2: !!project.__v2, roles: project.__v2?.roles || null, uid: me.uid, programId: parentProgram.id,
  });
  const [expanded, setExpanded] = useState(false);
  const [titleDraft, setTitleDraft] = useState(mitigation.name || '');
  useEffect(() => { setTitleDraft(mitigation.name || ''); }, [mitigation.name]);

  // Map RAID risk level → action priority pill (visual continuity with
  // the regular ActionRowInline priority chip).
  const derivedPriority = (() => {
    const lvl = parentItem.type === 'Risk'
      ? raidRiskLevel(parentItem.likelihood, parentItem.impact)
      : parentItem.level || null;
    if (!lvl) return null;
    if (lvl === 'Critical' || lvl === 'High') return 'High';
    if (lvl === 'Medium') return 'Medium';
    return 'Low';
  })();
  const pc = derivedPriority ? priorityColor(derivedPriority) : null;

  const overdue = mitigation.due && mitigation.status !== 'Done'
    && parseDate(mitigation.due) < today();

  const writePatch = (patch) => {
    const next = applyMitigationUpdate(project, parentProgram, parentItem, mitigation.id, patch);
    onApplyMitigation(next);
  };

  const commitTitle = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== mitigation.name) writePatch({ name: trimmed });
    else if (!trimmed) setTitleDraft(mitigation.name || '');
  };

  const markDone = () => {
    writePatch({ status: 'Done', completedAt: new Date().toISOString() });
    showToast?.('✓ Mitigation done');
  };

  const breadcrumbText = `RAID: ${parentItem.title || '(untitled risk)'}`.slice(0, 80);

  return (
    <div style={{ border: '1px solid ' + TOK.line, borderRadius: 8, marginBottom: 6, background: TOK.surface }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', minHeight: 44 }}>
        <span style={{ color: TOK.subtle, fontSize: 13, lineHeight: 1 }}>▢</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {expanded && canEdit ? (
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
              onClick={(e) => e.stopPropagation()}
              style={{ fontFamily: FONT_STACK, fontSize: 13, fontWeight: 500, width: '100%', padding: '4px 6px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface, color: TOK.ink, outline: 'none' }}
            />
          ) : (
            <div style={{ fontSize: 13, color: TOK.ink, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <MentionedText text={mitigation.name || '(untitled mitigation)'} teamMembers={teamMembers} />
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap', fontSize: 11, color: TOK.muted }}>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 4,
              background: TOK.overdueBg, color: TOK.overdueFg,
            }}>🛡 RAID</span>
            <span>{breadcrumbText}</span>
            {mitigation.due && (
              <span style={{ color: overdue ? TOK.overdueFg : TOK.muted, fontWeight: overdue ? 500 : 400 }}>
                · 📅 {fmtDateShort(mitigation.due)}
              </span>
            )}
          </div>
        </div>
        {pc && (
          <span style={{ fontSize: 10.5, fontWeight: 500, padding: '2px 7px', borderRadius: 999, color: pc.fg, background: pc.bg }}>{derivedPriority}</span>
        )}
        <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
          <StatusQuickPill status={mitigation.status || 'Open'} onChange={canEdit ? (st) => writePatch({ status: st }) : null} statuses={MITIGATION_STATUSES} />
        </span>
        {canEdit && mitigation.status !== 'Done' && (
          <Btn size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); markDone(); }} title="Mark done">✓</Btn>
        )}
        <ChevronDown size={14} style={{ color: TOK.muted, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }} />
      </div>
      {expanded && (
        <div style={{ padding: '10px 12px 12px', borderTop: '1px solid ' + TOK.line, background: TOK.bg, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, minWidth: 50 }}>PIC</span>
            <select
              value={mitigation.pic || ''}
              disabled={!canEdit}
              onChange={(e) => canEdit && writePatch({ pic: dirIndex ? resolvePicValue(e.target.value, teamMembers, dirIndex) : e.target.value })}
              onClick={(e) => e.stopPropagation()}
              style={{ fontFamily: FONT_STACK, fontSize: 12, padding: '4px 8px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface, color: TOK.ink, minWidth: 160 }}>
              <option value="">(unassigned)</option>
              {(picSuggestions || []).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, minWidth: 50 }}>Due</span>
            <input
              type="date"
              value={mitigation.due || ''}
              disabled={!canEdit}
              onChange={(e) => canEdit && writePatch({ due: e.target.value || null })}
              onClick={(e) => e.stopPropagation()}
              style={{ fontFamily: FONT_STACK, fontSize: 12, padding: '4px 8px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface, color: TOK.ink }}
            />
          </div>
          <div style={{ fontSize: 11, color: TOK.subtle, fontStyle: 'italic', borderTop: '1px solid ' + TOK.line, paddingTop: 8 }}>
            💬 Comments and full risk context live in the RAID detail. Use "Open RAID item" below to view or comment.
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid ' + TOK.line }}>
            {canEdit && mitigation.status !== 'Done' && (
              <Btn size="sm" variant="primary" onClick={markDone}>✓ Mark done</Btn>
            )}
            <Btn size="sm" variant="ghost" onClick={() => onNavigateRaid && onNavigateRaid(project.id, parentProgram.id)}>
              → Open RAID item
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// v30.B — Minimal row for a sub-task in sub-PIC's My Work. No expand,
// no comments — just title + parent breadcrumb + ✓ Mark done + → Open
// parent. Sub-task structure: { id, title, pic, status }.
function SubtaskMyWorkRow({ subtask, parentAction, project, teamMembers, onMarkDone, onOpenParent }) {
  return (
    <div style={{ border: '1px solid ' + TOK.line, borderRadius: 8, marginBottom: 6, background: TOK.surface, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ color: TOK.subtle, fontSize: 13, lineHeight: 1 }}>▢</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: TOK.ink, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <MentionedText text={subtask.title || '(untitled sub-task)'} teamMembers={teamMembers} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap', fontSize: 11, color: TOK.muted }}>
          <span>Sub of: "<span style={{ color: TOK.ink }}>{parentAction.title}</span>"</span>
          <span>· {project.name}</span>
          {parentAction.dueDate && <span>· 📅 {fmtDateShort(parentAction.dueDate)} (parent due)</span>}
        </div>
      </div>
      {onMarkDone && (
        <Btn size="sm" variant="primary" onClick={onMarkDone} title="Mark done">✓</Btn>
      )}
      {onOpenParent && (
        <Btn size="sm" variant="ghost" onClick={onOpenParent} title="Open parent action">→</Btn>
      )}
    </div>
  );
}

function MyWorkSubTabs({ value, onChange, tabs }) {
  return (
    <div style={{ display: 'inline-flex', gap: 2, padding: 2, background: TOK.surface, borderRadius: 6, border: '1px solid ' + TOK.line }}>
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          style={{
            fontFamily: FONT_STACK, fontSize: 11, fontWeight: 500,
            padding: '3px 8px', borderRadius: 4, border: 'none',
            background: value === t.id ? TOK.bg : 'transparent',
            color: value === t.id ? TOK.ink : TOK.muted,
            cursor: 'pointer',
          }}>
          {t.label} <span style={{ opacity: 0.7 }}>({t.count})</span>
        </button>
      ))}
    </div>
  );
}

// v30 Phase 3 — Walk every task/check-in/update + action comment to find
// the latest entry authored by member. Returns { ts, t, description } or null.
function getLastActivityForMember(member, projects, dirIndex = null) {
  // P1: with dirIndex, any alias of the member matches; without it, the exact name (legacy).
  const meId = dirIndex ? personKey(dirIndex, member.email || member.name) : null;
  const isMember = (raw) => (dirIndex ? !!raw && personKey(dirIndex, raw) === meId : raw === member.name);
  let latest = null;
  const consider = (ts, description) => {
    if (!ts) return;
    const t = new Date(ts).getTime();
    if (isNaN(t)) return;
    if (!latest || t > latest.t) latest = { t, ts, description };
  };
  for (const proj of Object.values(projects || {})) {
    for (const pg of (proj.programs || [])) {
      for (const ws of (pg.workstreams || [])) {
        for (const tk of (ws.tasks || [])) {
          for (const upd of (tk.updates || [])) {
            if (isMember(upd.author)) consider(upd.timestamp, `Posted update on "${tk.name}"`);
          }
          for (const ci of (tk.checkIns || [])) {
            if (isMember(ci.author)) consider(ci.timestamp, `Posted check-in on "${tk.name}"`);
          }
        }
      }
    }
    for (const a of (proj.actionItems || [])) {
      for (const upd of (a.updates || [])) {
        if (isMember(upd.author)) consider(upd.timestamp, `Commented on action "${a.title}"`);
      }
    }
  }
  return latest;
}

// v30 Phase 3 — Per-member workload aggregation. Reuses computeMyWork
// (isOwner=false so deadline_approval items don't leak into member counts).
function computeTeamOverview(projects, members, dirIndex = null) {
  return (members || []).map((m) => {
    const myWork = computeMyWork(m.name, projects, false, null, dirIndex);
    const tasksOwned = myWork.tasksOwned.today.length + myWork.tasksOwned.week.length + myWork.tasksOwned.later.length;
    const actionItemsOpen = myWork.actionItems.today.length + myWork.actionItems.week.length + myWork.actionItems.later.length;
    const tasksOverdue = myWork.needsAttention.filter((it) =>
      it.kind === 'overdue_task' || it.kind === 'overdue_action' || it.kind === 'overdue_subtask'
    ).length;
    return {
      member: m,
      tasksOwned,
      tasksOverdue,
      tasksContributing: myWork.tasksContributing.length,
      actionItemsOpen,
      credit: myWork.credit,
      lastActivity: getLastActivityForMember(m, projects, dirIndex),
    };
  });
}

// v30 Phase 3 — One row per team member showing workload metrics and
// last activity. "(you)" badge on self; View-as button hidden for self.
function MemberOverviewRow({ data, onViewAs, currentAuthor }) {
  const { member, tasksOwned, tasksOverdue, tasksContributing, actionItemsOpen, credit, lastActivity } = data;
  const isSelf = member.name === currentAuthor;
  const empty = tasksOwned === 0 && actionItemsOpen === 0 && tasksContributing === 0 && credit.projected === 0;
  return (
    <div style={{ padding: '12px 14px', border: '1px solid ' + TOK.line, borderRadius: 8, background: TOK.surface, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: TOK.ink }}>
          {member.name}
          {member.email && <span style={{ color: TOK.muted, fontWeight: 400, marginLeft: 8 }}>{member.email}</span>}
          {isSelf && <span style={{ color: TOK.accent, fontWeight: 400, marginLeft: 8, fontSize: 11 }}>(you)</span>}
        </div>
        {!isSelf && (
          <Btn size="sm" variant="primary" onClick={() => onViewAs(member.name)}>View as →</Btn>
        )}
      </div>
      {empty ? (
        <div style={{ fontSize: 12.5, color: TOK.muted }}>
          🌱 No assignments yet. Add them as PIC or contributor to track their workload.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: TOK.ink, marginBottom: 4 }}>
            <span>📋 {tasksOwned} owned</span>
            {tasksOverdue > 0 && <span style={{ color: TOK.overdueFg, fontWeight: 500 }}>⚠ {tasksOverdue} overdue</span>}
            <span>🤝 {tasksContributing} contributing</span>
            <span>✅ {actionItemsOpen} actions</span>
          </div>
          {credit.projected > 0 && (
            <div style={{ fontSize: 12, color: TOK.muted }}>
              📊 {Math.round(credit.earned * 10) / 10} / {Math.round(credit.projected * 10) / 10} cp ({Math.round(credit.pct)}%)
            </div>
          )}
          {lastActivity && (
            <div style={{ fontSize: 11.5, color: TOK.muted, marginTop: 2 }}>
              🕐 Last activity: {myWorkTimeAgo(lastActivity.ts)} — {lastActivity.description}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// v30 Phase 3 — Owner-only Team Overview view.
function TeamOverviewView({ projects, teamMembers, currentAuthor, onImpersonate }) {
  const dirIndex = useContext(DirectoryIndexContext);
  const [sortBy, setSortBy] = useState('overdue'); // overdue | name | tasks | credit | activity

  const teamData = useMemo(
    () => computeTeamOverview(projects, teamMembers, dirIndex),
    [projects, teamMembers, dirIndex]
  );

  const sorted = useMemo(() => {
    const arr = [...teamData];
    if (sortBy === 'name') arr.sort((a, b) => a.member.name.localeCompare(b.member.name));
    else if (sortBy === 'overdue') arr.sort((a, b) => b.tasksOverdue - a.tasksOverdue || a.member.name.localeCompare(b.member.name));
    else if (sortBy === 'tasks') arr.sort((a, b) => b.tasksOwned - a.tasksOwned || a.member.name.localeCompare(b.member.name));
    else if (sortBy === 'credit') arr.sort((a, b) => b.credit.earned - a.credit.earned || a.member.name.localeCompare(b.member.name));
    else if (sortBy === 'activity') {
      arr.sort((a, b) => {
        const ta = a.lastActivity?.t || 0;
        const tb = b.lastActivity?.t || 0;
        return tb - ta;
      });
    }
    return arr;
  }, [teamData, sortBy]);

  const summary = useMemo(() => {
    let activeMembers = 0;
    let totalOpenActions = 0;
    let totalOverdue = 0;
    let pendingApprovals = 0;
    for (const d of teamData) {
      if (d.tasksOwned + d.actionItemsOpen + d.tasksContributing > 0) activeMembers++;
      totalOpenActions += d.actionItemsOpen;
      totalOverdue += d.tasksOverdue;
    }
    for (const proj of Object.values(projects || {})) {
      for (const pg of (proj.programs || [])) {
        for (const ws of (pg.workstreams || [])) {
          for (const tk of (ws.tasks || [])) {
            if (tk.deadlineRequest) pendingApprovals++;
          }
        }
      }
    }
    return { activeMembers, totalOpenActions, totalOverdue, pendingApprovals };
  }, [teamData, projects]);

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const rows = sorted.map((d) => ({
      'Member': d.member.name,
      'Email': d.member.email || '',
      'Tasks owned': d.tasksOwned,
      'Tasks overdue': d.tasksOverdue,
      'Contributing': d.tasksContributing,
      'Action items open': d.actionItemsOpen,
      'Credit earned (cp)': Math.round(d.credit.earned * 100) / 100,
      'Credit projected (cp)': Math.round(d.credit.projected * 100) / 100,
      'Credit % earned': Math.round(d.credit.pct * 10) / 10 + '%',
      'Last activity': d.lastActivity ? fmtDateTime(d.lastActivity.ts) : '—',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Team Overview');
    XLSX.writeFile(wb, `Team_Overview_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 20, fontFamily: FONT_STACK, background: TOK.bg }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
              Team Overview <span style={{ color: TOK.accent, fontSize: 11, fontWeight: 400, marginLeft: 6 }}>[OWNER ONLY]</span>
            </h2>
            <div style={{ fontSize: 12, color: TOK.muted, marginTop: 2 }}>
              Workload, activity, and credit attribution for all team members.
            </div>
          </div>
          <Btn size="sm" onClick={exportExcel}><FileSpreadsheet size={11} /> Export Excel</Btn>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
          <SummaryCard label="Active members" value={summary.activeMembers} />
          <SummaryCard label="Open action items" value={summary.totalOpenActions} />
          <SummaryCard label="Overdue across team" value={summary.totalOverdue} accent={summary.totalOverdue > 0 ? TOK.overdueFg : null} />
          <SummaryCard label="Pending approvals" value={summary.pendingApprovals} accent={summary.pendingApprovals > 0 ? TOK.inprogFg : null} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12, color: TOK.muted, flexWrap: 'wrap' }}>
          <span>Sort:</span>
          {[
            { id: 'overdue', label: 'Overdue first' },
            { id: 'name', label: 'Name' },
            { id: 'tasks', label: 'Open tasks' },
            { id: 'credit', label: 'Credit earned' },
            { id: 'activity', label: 'Last activity' },
          ].map((opt) => (
            <button key={opt.id} onClick={() => setSortBy(opt.id)}
              style={{
                background: sortBy === opt.id ? TOK.surface : 'transparent',
                border: '1px solid ' + (sortBy === opt.id ? TOK.lineStrong : TOK.line),
                borderRadius: 6, padding: '4px 10px', fontSize: 12,
                fontFamily: FONT_STACK, cursor: 'pointer', color: TOK.ink,
              }}>
              {opt.label}
            </button>
          ))}
        </div>

        {sorted.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: TOK.subtle, fontSize: 13, background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 10 }}>
            No team members yet. Members appear as you assign PICs or invite them via Members modal.
          </div>
        ) : (
          sorted.map((d) => (
            <MemberOverviewRow key={d.member.email || d.member.name} data={d} onViewAs={onImpersonate} currentAuthor={currentAuthor} />
          ))
        )}
      </div>
    </div>
  );
}

// v30 RAID Phase 2 — Interactive 3×3 likelihood × impact selector.
// Used by AddRAIDForm. Renders 9 cells; each cell is clickable and shows
// the computed risk level (Critical / High / Medium / Low).
function RiskMatrixSelector({ likelihood, impact, onChange }) {
  const levels = ['High', 'Medium', 'Low'];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(3, 1fr)', gap: 4, fontFamily: FONT_STACK }}>
      {/* Header row */}
      <div />
      {levels.map((i) => (
        <div key={i} style={{ fontSize: 10, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', textAlign: 'center', padding: 4 }}>
          Imp: {i}
        </div>
      ))}
      {/* Rows */}
      {levels.map((l) => (
        <React.Fragment key={l}>
          <div style={{ fontSize: 10, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', alignSelf: 'center', textAlign: 'right', paddingRight: 4 }}>
            Lik: {l}
          </div>
          {levels.map((i) => {
            const lvl = raidRiskLevel(l, i);
            const selected = l === likelihood && i === impact;
            const cellBg = lvl === 'Critical' ? '#FCEBEB' : lvl === 'High' ? '#FFF0EE' : lvl === 'Medium' ? '#FAEEDA' : '#E6EFD6';
            const cellFg = lvl === 'Critical' ? '#7B1D1D' : lvl === 'High' ? '#A32D2D' : lvl === 'Medium' ? '#B7791F' : '#356512';
            return (
              <button
                key={l + i}
                type="button"
                onClick={() => onChange(l, i)}
                style={{
                  background: cellBg,
                  color: cellFg,
                  fontFamily: FONT_STACK,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '10px 6px',
                  border: selected ? '2px solid ' + TOK.ink : '1px solid ' + TOK.line,
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
                title={`Likelihood ${l} × Impact ${i} = ${lvl}`}>
                {lvl}
              </button>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}

// v30 RAID Phase 2 — Readonly badge for an already-set likelihood × impact pair.
// Used in RAIDCard expanded view.
function RiskLevelBadge({ likelihood, impact }) {
  const lvl = raidRiskLevel(likelihood, impact);
  const bg = lvl === 'Critical' ? '#FCEBEB' : lvl === 'High' ? '#FFF0EE' : lvl === 'Medium' ? '#FAEEDA' : '#E6EFD6';
  const fg = lvl === 'Critical' ? '#7B1D1D' : lvl === 'High' ? '#A32D2D' : lvl === 'Medium' ? '#B7791F' : '#356512';
  return (
    <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: bg, color: fg, fontFamily: FONT_STACK }}>
      {lvl} risk
    </span>
  );
}

// v30 RAID Phase 2 — Typeahead PIC picker. Searches BOTH name and email.
// Stores the selected canonical name string in `value`. Dropdown shows
// `Name · email` so users can disambiguate. Falls back to free-text entry
// (useful for departments like AF/Legal/HR that may not have emails).
// teamMembers: [{ name, email? }]; extraSuggestions: [string] for departments.
function PicPicker({ value, onChange, teamMembers, extraSuggestions, placeholder }) {
  const dirIndex = useContext(DirectoryIndexContext);
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => { setQuery(value || ''); }, [value]);

  const suggestions = useMemo(() => {
    const q = (query || '').trim().toLowerCase();
    const all = [
      ...(teamMembers || []).map((m) => ({ name: m?.name, email: m?.email })).filter((m) => m.name),
      ...((extraSuggestions || []).filter((n) => n && !findMember(teamMembers, n, dirIndex)).map((n) => ({ name: n, email: null }))),
    ];
    if (!q) return all.slice(0, 8);
    return all.filter((m) =>
      m.name.toLowerCase().includes(q) || (m.email && m.email.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [query, teamMembers, extraSuggestions, dirIndex]);

  const commit = (name) => {
    setQuery(name);
    setOpen(false);
    onChange(name);
  };

  return (
    <div style={{ position: 'relative', fontFamily: FONT_STACK }}>
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setFocused(true); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && suggestions[0]) {
            e.preventDefault();
            commit(suggestions[0].name);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
            e.currentTarget.blur();
          }
        }}
        onBlur={() => {
          setFocused(false);
          setTimeout(() => setOpen(false), 150);
          const raw = (query || '').trim();
          if (!raw) { onChange(''); return; }
          // 1. Email-typed and a member has that email → canonicalize.
          const resolved = resolvePicValue(raw, teamMembers, dirIndex);
          if (resolved !== raw) { setQuery(resolved); onChange(resolved); return; }
          // 2. Smart-pick: if exactly one teamMember name substring-matches
          //    the raw input (case-insensitive), auto-pick that member.
          //    Avoids ambiguous matches.
          const lc = raw.toLowerCase();
          const subMatches = (teamMembers || []).filter((m) =>
            m?.name && m.name.toLowerCase().includes(lc)
          );
          if (subMatches.length === 1) {
            setQuery(subMatches[0].name);
            onChange(subMatches[0].name);
            return;
          }
          // 3. Fall back: save raw free-text. The warning chip surfaces below.
          onChange(raw);
        }}
        placeholder={placeholder || 'Type a name or email…'}
        style={{ width: '100%', padding: '8px 10px', border: '1px solid ' + (focused ? TOK.lineStrong : TOK.lineStrong), borderRadius: 7, fontFamily: FONT_STACK, fontSize: 12, outline: 'none', background: TOK.surface, color: TOK.ink, boxSizing: 'border-box' }}
      />
      {open && suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 2, background: TOK.surface, border: '1px solid ' + TOK.lineStrong, borderRadius: 7, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', zIndex: 60, maxHeight: 220, overflowY: 'auto' }}>
          {suggestions.map((m) => (
            <button
              key={m.name + '|' + (m.email || '')}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(m.name)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FONT_STACK, fontSize: 12, color: TOK.ink, borderBottom: '1px solid ' + TOK.line }}
              onMouseEnter={(e) => e.currentTarget.style.background = TOK.bg}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
              <div style={{ fontWeight: 500 }}>{m.name}</div>
              {m.email && <div style={{ fontSize: 10.5, color: TOK.muted, marginTop: 1 }}>{m.email}</div>}
            </button>
          ))}
        </div>
      )}
      {value && !findMember(teamMembers, value, dirIndex) && (
        <button
          type="button"
          onClick={(e) => {
            const inp = e.currentTarget.parentElement?.querySelector('input');
            if (inp) inp.focus();
          }}
          style={{
            marginTop: 4, padding: '2px 8px', borderRadius: 999,
            fontSize: 10.5, fontFamily: FONT_STACK, fontWeight: 500,
            color: '#A8660C', background: '#FAEEDA',
            border: '1px solid #E0BC75', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
          title="Click to edit — free-text PIC won't show in the team-member dropdown elsewhere."
        >
          ⚠ Not a team member — free-text saved
        </button>
      )}
    </div>
  );
}

// v30 RAID Phase 2 — One mitigation/resolution action row inside a RAIDCard.
// Simpler than ActionRowInline: no priority, no sub-tasks, no inline rename.
// Comments use the same shape as task/action updates: { id, author, text, ts }.
// onUpdate receives a partial diff to merge into the action.
function MitigationActionRow({ action, currentUser, teamMembers, onUpdate, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const overdue = action.due && action.status !== 'Done' && parseDate(action.due) < today();
  const comments = action.comments || [];
  // Wave 2 R5: onUpdate null = no edit rights on this RAID doc (read-only row).
  const canMarkDone = !!onUpdate && action.pic === currentUser && action.status !== 'Done';

  const statusColor = {
    Open: { fg: TOK.muted, bg: TOK.bg },
    Blocked: { fg: '#A32D2D', bg: '#FCEBEB' },
    Done: { fg: '#356512', bg: '#E6EFD6' },
  }[action.status || 'Open'];

  const postComment = () => {
    const trimmed = commentDraft.trim();
    if (!trimmed) return;
    const newComment = { id: uid('c'), author: currentUser, text: trimmed, ts: new Date().toISOString() };
    onUpdate({ comments: [...comments, newComment] });
    setCommentDraft('');
  };

  return (
    <div style={{ border: '1px solid ' + TOK.line, borderRadius: 7, marginBottom: 6, background: TOK.surface, fontFamily: FONT_STACK }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', minHeight: 36 }}>
        <span style={{ color: TOK.subtle, fontSize: 12 }}>{action.status === 'Done' ? '☑' : '☐'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: action.status === 'Done' ? TOK.muted : TOK.ink, fontWeight: 500, textDecoration: action.status === 'Done' ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {action.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, fontSize: 10.5, color: TOK.muted }}>
            <span>@{action.pic || '—'}</span>
            {action.due && (
              <span style={{ color: overdue ? TOK.overdueFg : TOK.muted, fontWeight: overdue ? 500 : 400 }}>
                · 📅 {fmtDateShort(action.due)} {overdue ? '(overdue)' : ''}
              </span>
            )}
            {comments.length > 0 && <span>· 💬 {comments.length}</span>}
          </div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, color: statusColor.fg, background: statusColor.bg }}>
          {action.status || 'Open'}
        </span>
        {canMarkDone && (
          <Btn size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); onUpdate({ status: 'Done' }); }} title="Mark done">✓</Btn>
        )}
        <ChevronDown size={13} style={{ color: TOK.muted, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }} />
      </div>
      {expanded && (
        <div style={{ padding: '10px 12px 12px', borderTop: '1px solid ' + TOK.line, background: TOK.bg }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, fontSize: 11, color: TOK.muted, flexWrap: 'wrap' }}>
            <span>Status</span>
            <select
              value={action.status || 'Open'}
              disabled={!onUpdate}
              onChange={(e) => onUpdate && onUpdate({ status: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              style={{ fontFamily: FONT_STACK, fontSize: 11.5, padding: '3px 6px', border: '1px solid ' + TOK.lineStrong, borderRadius: 5, background: TOK.surface, color: TOK.ink }}>
              {['Open', 'Done', 'Blocked'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {onRemove && (
              <button onClick={(e) => { e.stopPropagation(); onRemove(); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: TOK.muted, cursor: 'pointer', fontSize: 11 }} title="Remove this mitigation action">
                <Trash2 size={12} /> Remove
              </button>
            )}
          </div>
          <div style={{ fontSize: 11, color: TOK.muted, fontWeight: 500, marginBottom: 6 }}>💬 Comments ({comments.length})</div>
          {comments.map((c) => (
            <div key={c.id} style={{ fontSize: 12, padding: '6px 0', borderBottom: '1px dashed ' + TOK.line }}>
              <div style={{ fontSize: 10.5, color: TOK.muted, marginBottom: 2 }}>
                <span style={{ color: TOK.ink, fontWeight: 500 }}>{c.author}</span> · {myWorkTimeAgo(c.ts)}
              </div>
              <MentionedText text={c.text} teamMembers={teamMembers} />
            </div>
          ))}
          {onUpdate && (
          <div style={{ marginTop: 8 }}>
            <MentionTextarea
              value={commentDraft}
              onChange={setCommentDraft}
              rows={2}
              placeholder={`Comment as ${currentUser || '…'}. Type @ to mention.`}
              teamMembers={teamMembers}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              <Btn size="sm" variant="primary" onClick={postComment} disabled={!commentDraft.trim()}>Post comment</Btn>
            </div>
          </div>
          )}
        </div>
      )}
    </div>
  );
}

// v30 RAID Phase 2 — Review history + inline "add review note" form for a RAID item.
// Shows the latest entry + Show all (N) toggle. Add form has a 3-way trend toggle
// and a textarea. On save, calls onAddReview(trend, note) which the parent translates
// into a full item update (append history + bump lastReviewedAt + sync trend).
function TrendHistoryBlock({ item, currentUser, teamMembers, onAddReview }) {
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draftTrend, setDraftTrend] = useState(item.trend || 'stable');
  const [draftNote, setDraftNote] = useState('');

  const history = item.history || [];
  const visible = showAll ? history.slice().reverse() : history.slice(-1).reverse();
  const lastReviewedDays = raidDaysSinceReview(item);

  const submit = () => {
    const trimmed = draftNote.trim();
    if (!trimmed) return;
    onAddReview(draftTrend, trimmed);
    setDraftNote('');
    setDraftTrend(item.trend || 'stable');
    setAdding(false);
  };

  return (
    <div style={{ marginTop: 10, fontFamily: FONT_STACK }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Review History
        </span>
        <span style={{ fontSize: 10.5, color: lastReviewedDays > RAID_REVIEW_STALE_DAYS ? TOK.overdueFg : TOK.subtle, marginLeft: 'auto' }}>
          Last reviewed: {lastReviewedDays === 0 ? 'today' : `${lastReviewedDays}d ago`}
        </span>
      </div>

      {history.length === 0 && (
        <div style={{ fontSize: 11.5, color: TOK.subtle, fontStyle: 'italic' }}>No review notes yet.</div>
      )}
      {visible.map((h) => {
        const tc = RAID_TREND_CONFIG[h.trend] || RAID_TREND_CONFIG.stable;
        return (
          <div key={h.id} style={{ padding: '6px 0', borderBottom: '1px dashed ' + TOK.line, fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 12 }}>{tc.icon}</span>
              <span style={{ color: TOK.ink, fontWeight: 500, fontSize: 11 }}>{h.author}</span>
              <span style={{ color: TOK.muted, fontSize: 10.5 }}>· {fmtDateShort(h.ts)}</span>
            </div>
            <MentionedText text={h.note} teamMembers={teamMembers} />
          </div>
        );
      })}
      {history.length > 1 && !showAll && (
        <button onClick={() => setShowAll(true)} style={{ background: 'none', border: 'none', color: TOK.accent, fontSize: 11.5, cursor: 'pointer', padding: '4px 0', fontFamily: FONT_STACK }}>
          Show all ({history.length})
        </button>
      )}
      {showAll && history.length > 1 && (
        <button onClick={() => setShowAll(false)} style={{ background: 'none', border: 'none', color: TOK.muted, fontSize: 11.5, cursor: 'pointer', padding: '4px 0', fontFamily: FONT_STACK }}>
          Show less
        </button>
      )}

      {!adding && onAddReview && (
        <Btn size="sm" onClick={() => setAdding(true)} style={{ marginTop: 8 }}><Plus size={11} /> Add review note</Btn>
      )}
      {adding && onAddReview && (
        <div style={{ marginTop: 10, padding: 10, background: TOK.bg, borderRadius: 7, border: '1px solid ' + TOK.line }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {Object.entries(RAID_TREND_CONFIG).map(([k, v]) => (
              <button
                key={k}
                type="button"
                onClick={() => setDraftTrend(k)}
                style={{
                  fontFamily: FONT_STACK,
                  fontSize: 11,
                  fontWeight: 500,
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: draftTrend === k ? '2px solid ' + TOK.ink : '1px solid ' + TOK.lineStrong,
                  background: draftTrend === k ? v.bg : TOK.surface,
                  color: draftTrend === k ? v.fg : TOK.muted,
                  cursor: 'pointer',
                }}>
                {v.icon} {v.label}
              </button>
            ))}
          </div>
          <MentionTextarea
            value={draftNote}
            onChange={setDraftNote}
            rows={2}
            placeholder={`What's the current status? Posted as ${currentUser || '…'}. Type @ to mention.`}
            teamMembers={teamMembers}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
            <Btn size="sm" variant="ghost" onClick={() => { setAdding(false); setDraftNote(''); }}>Cancel</Btn>
            <Btn size="sm" variant="primary" onClick={submit} disabled={!draftNote.trim()}>Save review</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// v30 RAID Phase 2 — Create-RAID modal. Tabs across 4 types; type-specific fields
// below. On save, builds a complete RAIDItem with id, status='PendingApproval',
// createdAt/By, initial history entry, and escalateToBoD default for Risk.
function AddRAIDForm({ onSave, onCancel, currentUser, teamMembers, picSuggestions }) {
  const [type, setType] = useState('Risk');
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState(currentUser || '');
  const [likelihood, setLikelihood] = useState('Medium');
  const [impact, setImpact] = useState('Medium');
  const [mitigationPlan, setMitigationPlan] = useState('');
  const [escalateToBoD, setEscalateToBoD] = useState(false);
  const [validationDeadline, setValidationDeadline] = useState('');
  const [validationOwner, setValidationOwner] = useState('');
  const [severity, setSeverity] = useState('Medium');
  const [dependsOn, setDependsOn] = useState('');
  const [blockedUntil, setBlockedUntil] = useState('');
  const [initialNote, setInitialNote] = useState('');

  // Risk: when impact changes, default escalateToBoD to (impact === 'High') — but allow override.
  // Track whether user has manually toggled; if so, do not re-apply default.
  const [bodTouched, setBodTouched] = useState(false);
  useEffect(() => {
    if (type === 'Risk' && !bodTouched) setEscalateToBoD(impact === 'High');
  }, [type, impact, bodTouched]);

  const canSave = title.trim().length > 0 && owner.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const now = new Date().toISOString();
    const id = uid('raid');
    const initial = {
      id,
      type,
      title: title.trim(),
      owner: owner.trim(),
      status: 'PendingApproval',
      createdBy: currentUser,
      createdAt: now,
      approvedBy: null,
      approvedAt: null,
      trend: 'stable',
      lastReviewedAt: now,
      history: [{
        id: uid('h'),
        ts: now,
        author: currentUser,
        note: initialNote.trim() || `${type} created.`,
        trend: 'stable',
      }],
      mitigationActions: [],
    };
    if (type === 'Risk') {
      initial.likelihood = likelihood;
      initial.impact = impact;
      initial.mitigationPlan = mitigationPlan.trim() || null;
      initial.escalateToBoD = escalateToBoD;
    } else if (type === 'Assumption') {
      initial.validationDeadline = validationDeadline || null;
      initial.validationOwner = validationOwner.trim() || null;
      initial.validated = false;
    } else if (type === 'Issue') {
      initial.severity = severity;
      initial.raisedAt = now;
    } else if (type === 'Dependency') {
      initial.dependsOn = dependsOn.trim() || null;
      initial.blockedUntil = blockedUntil || null;
    }
    onSave(initial);
  };

  return (
    <Modal title="Add RAID item" onClose={onCancel} width={560}>
      <div style={{ fontFamily: FONT_STACK }}>
        {/* Type tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 14, background: TOK.bg, padding: 3, borderRadius: 8 }}>
          {Object.entries(RAID_TYPES).map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => setType(k)}
              style={{
                flex: 1,
                fontFamily: FONT_STACK,
                fontSize: 12,
                fontWeight: 500,
                padding: '7px 10px',
                borderRadius: 6,
                border: 'none',
                background: type === k ? TOK.surface : 'transparent',
                color: type === k ? v.fg : TOK.muted,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                boxShadow: type === k ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}>
              <span>{v.icon}</span> {v.label}
            </button>
          ))}
        </div>

        {/* Common fields */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10.5, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>Title</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`What is the ${type.toLowerCase()}?`}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, fontFamily: FONT_STACK, fontSize: 12, outline: 'none', background: TOK.surface, boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10.5, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>Owner</div>
          <PicPicker
            value={owner}
            onChange={setOwner}
            teamMembers={teamMembers}
            extraSuggestions={picSuggestions}
            placeholder="Type name or email…"
          />
        </div>

        {/* Type-specific */}
        {type === 'Risk' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10.5, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>Likelihood × Impact</div>
              <RiskMatrixSelector likelihood={likelihood} impact={impact} onChange={(l, i) => { setLikelihood(l); setImpact(i); }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10.5, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>Mitigation plan (optional)</div>
              <textarea
                value={mitigationPlan}
                onChange={(e) => setMitigationPlan(e.target.value)}
                rows={2}
                placeholder="What's the mitigation strategy?"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, fontFamily: FONT_STACK, fontSize: 12, outline: 'none', background: TOK.surface, boxSizing: 'border-box', resize: 'vertical' }}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 12, color: TOK.ink, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={escalateToBoD}
                onChange={(e) => { setBodTouched(true); setEscalateToBoD(e.target.checked); }}
              />
              <span>⬆ Escalate to BoD <span style={{ color: TOK.muted, fontSize: 11 }}>(auto-set for High impact; you can override)</span></span>
            </label>
          </>
        )}

        {type === 'Assumption' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10.5, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>Validation deadline</div>
              <input
                type="date"
                value={validationDeadline}
                onChange={(e) => setValidationDeadline(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, fontFamily: FONT_STACK, fontSize: 12, outline: 'none', background: TOK.surface, boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10.5, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>Validation owner</div>
              <PicPicker
                value={validationOwner}
                onChange={setValidationOwner}
                teamMembers={teamMembers}
                extraSuggestions={picSuggestions}
                placeholder="Type name or email…"
              />
            </div>
          </>
        )}

        {type === 'Issue' && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10.5, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>Severity</div>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, fontFamily: FONT_STACK, fontSize: 12, background: TOK.surface, color: TOK.ink }}>
              {['High', 'Medium', 'Low'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        {type === 'Dependency' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10.5, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>Depends on</div>
              <input
                value={dependsOn}
                onChange={(e) => setDependsOn(e.target.value)}
                placeholder="What must happen first?"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, fontFamily: FONT_STACK, fontSize: 12, outline: 'none', background: TOK.surface, boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10.5, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>Blocked until</div>
              <input
                type="date"
                value={blockedUntil}
                onChange={(e) => setBlockedUntil(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, fontFamily: FONT_STACK, fontSize: 12, outline: 'none', background: TOK.surface, boxSizing: 'border-box' }}
              />
            </div>
          </>
        )}

        {/* Initial review note */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10.5, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>Initial review note (optional)</div>
          <MentionTextarea
            value={initialNote}
            onChange={setInitialNote}
            rows={2}
            placeholder="Context, why now, what's known so far. Type @ to mention."
            teamMembers={teamMembers}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <Btn size="sm" variant="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn size="sm" variant="primary" onClick={handleSave} disabled={!canSave}>Submit for approval</Btn>
        </div>
        <div style={{ fontSize: 11, color: TOK.subtle, marginTop: 10, textAlign: 'right' }}>
          New items start as <strong>PendingApproval</strong>. Workspace owner must approve before everyone can see.
        </div>
      </div>
    </Modal>
  );
}

// v30 RAID Phase 2 — Card for one RAID item. Collapsed: one-line summary.
// Expanded: type-specific metadata, approval banner (if PendingApproval & isOwner),
// trend history, mitigation actions, status transitions.
// All mutations route through onUpdate(partial) which the parent translates into an
// applyRaidUpdate call.
function RAIDCard({ item, isOwner, currentUser, teamMembers, picSuggestions, onUpdate, onDelete, canEdit = true }) {
  const [expanded, setExpanded] = useState(false);
  const [addingAction, setAddingAction] = useState(false);
  const [actionDraftName, setActionDraftName] = useState('');
  const [actionDraftPic, setActionDraftPic] = useState('');
  const [actionDraftDue, setActionDraftDue] = useState('');

  const tcfg = RAID_TYPES[item.type] || RAID_TYPES.Risk;
  const trendCfg = item.trend ? RAID_TREND_CONFIG[item.trend] : null;
  const isRisk = item.type === 'Risk';
  const level = isRisk ? raidRiskLevel(item.likelihood, item.impact) : null;
  const daysSince = raidDaysSinceReview(item);
  const isStale = daysSince > RAID_REVIEW_STALE_DAYS && (item.status === 'Active' || item.status === 'Mitigating');
  const openMitigations = (item.mitigationActions || []).filter((a) => a.status !== 'Done').length;

  const handleAddReview = (trend, note) => {
    const newHist = {
      id: uid('h'),
      ts: new Date().toISOString(),
      author: currentUser,
      note,
      trend,
    };
    onUpdate({
      ...item,
      trend,
      lastReviewedAt: newHist.ts,
      history: [...(item.history || []), newHist],
    });
  };

  const handleMitigationUpdate = (actionId, diff) => {
    const updated = (item.mitigationActions || []).map((a) => a.id === actionId ? { ...a, ...diff } : a);
    onUpdate({ ...item, mitigationActions: updated });
  };

  const handleMitigationRemove = (actionId) => {
    const updated = (item.mitigationActions || []).filter((a) => a.id !== actionId);
    onUpdate({ ...item, mitigationActions: updated });
  };

  const handleMitigationAdd = () => {
    const name = actionDraftName.trim();
    if (!name) return;
    const newAct = {
      id: uid('ma'),
      name,
      pic: actionDraftPic || null,
      due: actionDraftDue || null,
      status: 'Open',
      comments: [],
    };
    onUpdate({ ...item, mitigationActions: [...(item.mitigationActions || []), newAct] });
    setActionDraftName(''); setActionDraftPic(''); setActionDraftDue('');
    setAddingAction(false);
  };

  const setStatus = (newStatus) => onUpdate({ ...item, status: newStatus });

  const approve = () => onUpdate({
    ...item,
    status: 'Active',
    approvedBy: currentUser,
    approvedAt: new Date().toISOString(),
  });

  const reject = () => onUpdate({
    ...item,
    status: 'Draft',
    approvedBy: null,
    approvedAt: null,
  });

  // Status colors
  const statusColor = {
    Draft: { fg: TOK.muted, bg: TOK.bg },
    PendingApproval: { fg: '#B7791F', bg: '#FAEEDA' },
    Active: { fg: '#356512', bg: '#E6EFD6' },
    Mitigating: { fg: '#0C447C', bg: '#E6F1FB' },
    Resolved: { fg: TOK.muted, bg: TOK.bg },
    Accepted: { fg: TOK.muted, bg: TOK.bg },
    Closed: { fg: TOK.muted, bg: TOK.bg },
  }[item.status] || { fg: TOK.muted, bg: TOK.bg };

  return (
    <div style={{ border: '1px solid ' + TOK.line, borderRadius: 9, marginBottom: 8, background: TOK.surface, fontFamily: FONT_STACK }}>
      {/* Collapsed header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <span style={{ fontSize: 16 }}>{tcfg.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: TOK.ink, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, fontSize: 11, color: TOK.muted, flexWrap: 'wrap' }}>
            <span style={{ color: tcfg.fg, fontWeight: 500 }}>{tcfg.label}</span>
            <span>· @{item.owner || '—'}</span>
            {openMitigations > 0 && <span>· {openMitigations} open action{openMitigations === 1 ? '' : 's'}</span>}
            {item.escalateToBoD && <span style={{ color: '#A32D2D', fontWeight: 500 }}>· ⬆ BoD</span>}
            {isStale && <span style={{ color: TOK.overdueFg, fontWeight: 500 }}>· ⏰ Needs review</span>}
          </div>
        </div>
        {isRisk && level && <RiskLevelBadge likelihood={item.likelihood} impact={item.impact} />}
        <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: statusColor.bg, color: statusColor.fg }}>
          {item.status}
        </span>
        {trendCfg && <span style={{ fontSize: 12 }} title={trendCfg.label}>{trendCfg.icon}</span>}
        <ChevronDown size={14} style={{ color: TOK.muted, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }} />
      </div>

      {expanded && (
        <div style={{ padding: '12px 14px 14px', borderTop: '1px solid ' + TOK.line, background: TOK.bg }}>
          {/* Approval banner */}
          {item.status === 'PendingApproval' && isOwner && (
            <div style={{ padding: '10px 12px', background: '#FAEEDA', border: '1px solid #F0D490', borderRadius: 8, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14 }}>⏳</span>
              <div style={{ flex: 1, fontSize: 12, color: '#7A5D00' }}>
                <strong>Pending your approval</strong>
                <div style={{ fontSize: 11, marginTop: 2 }}>Submitted by {item.createdBy} · {fmtDateShort(item.createdAt)}</div>
              </div>
              <Btn size="sm" variant="primary" onClick={approve}>✓ Approve</Btn>
              <Btn size="sm" onClick={reject}>✕ Reject</Btn>
            </div>
          )}

          {/* Type-specific metadata */}
          {isRisk && (
            <div style={{ marginBottom: 10, fontSize: 12, color: TOK.ink }}>
              <strong>Risk matrix:</strong> Likelihood <em>{item.likelihood}</em> × Impact <em>{item.impact}</em> = <strong>{level}</strong>
              {item.mitigationPlan && <div style={{ marginTop: 4, color: TOK.muted, fontSize: 11.5 }}>Plan: {item.mitigationPlan}</div>}
            </div>
          )}
          {item.type === 'Assumption' && (
            <div style={{ marginBottom: 10, fontSize: 12, color: TOK.ink }}>
              <strong>Validation:</strong> {item.validated ? '✓ Validated' : 'Pending'} · deadline {item.validationDeadline ? fmtDateShort(item.validationDeadline) : '—'} · owner @{item.validationOwner || '—'}
            </div>
          )}
          {item.type === 'Issue' && (
            <div style={{ marginBottom: 10, fontSize: 12, color: TOK.ink }}>
              <strong>Severity:</strong> {item.severity || '—'} · raised {item.raisedAt ? fmtDateShort(item.raisedAt) : '—'}
            </div>
          )}
          {item.type === 'Dependency' && (
            <div style={{ marginBottom: 10, fontSize: 12, color: TOK.ink }}>
              <strong>Depends on:</strong> {item.dependsOn || '—'} · blocked until {item.blockedUntil ? fmtDateShort(item.blockedUntil) : '—'}
            </div>
          )}

          {/* Trend & review history */}
          <TrendHistoryBlock item={item} currentUser={currentUser} teamMembers={teamMembers} onAddReview={canEdit ? handleAddReview : null} />

          {/* Mitigation actions */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
              Mitigation actions ({(item.mitigationActions || []).length})
            </div>
            {(item.mitigationActions || []).map((a) => (
              <MitigationActionRow
                key={a.id}
                action={a}
                currentUser={currentUser}
                teamMembers={teamMembers}
                onUpdate={canEdit ? (diff) => handleMitigationUpdate(a.id, diff) : null}
                onRemove={canEdit ? () => handleMitigationRemove(a.id) : null}
              />
            ))}
            {canEdit && !addingAction && (
              <Btn size="sm" onClick={() => setAddingAction(true)} style={{ marginTop: 4 }}><Plus size={11} /> Add action</Btn>
            )}
            {canEdit && addingAction && (
              <div style={{ marginTop: 8, padding: 10, background: TOK.surface, borderRadius: 7, border: '1px solid ' + TOK.line }}>
                <input
                  value={actionDraftName}
                  onChange={(e) => setActionDraftName(e.target.value)}
                  placeholder="What needs to be done?"
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, fontFamily: FONT_STACK, fontSize: 12, outline: 'none', background: TOK.surface, boxSizing: 'border-box', marginBottom: 6 }}
                />
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <div style={{ flex: 1 }}>
                    <PicPicker
                      value={actionDraftPic}
                      onChange={setActionDraftPic}
                      teamMembers={teamMembers}
                      extraSuggestions={picSuggestions}
                      placeholder="Owner — type name or email…"
                    />
                  </div>
                  <input
                    type="date"
                    value={actionDraftDue}
                    onChange={(e) => setActionDraftDue(e.target.value)}
                    style={{ padding: '6px 8px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, fontFamily: FONT_STACK, fontSize: 12, background: TOK.surface, color: TOK.ink }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                  <Btn size="sm" variant="ghost" onClick={() => { setAddingAction(false); setActionDraftName(''); setActionDraftPic(''); setActionDraftDue(''); }}>Cancel</Btn>
                  <Btn size="sm" variant="primary" onClick={handleMitigationAdd} disabled={!actionDraftName.trim()}>Add action</Btn>
                </div>
              </div>
            )}
          </div>

          {/* Status transitions (wave 2 R5: hidden without edit rights) */}
          {(canEdit || onDelete) && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid ' + TOK.line, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {canEdit && <span style={{ fontSize: 11, color: TOK.muted, fontWeight: 500 }}>Change status:</span>}
            {canEdit && (item.status === 'Active' || item.status === 'Mitigating') && (
              <>
                {isRisk && item.status === 'Active' && <Btn size="sm" onClick={() => setStatus('Mitigating')}>→ Mitigating</Btn>}
                {item.type === 'Issue' && <Btn size="sm" onClick={() => setStatus('Resolved')}>→ Resolved</Btn>}
                {isRisk && <Btn size="sm" onClick={() => setStatus('Accepted')}>→ Accepted</Btn>}
                <Btn size="sm" onClick={() => setStatus('Closed')}>→ Closed</Btn>
              </>
            )}
            {canEdit && (item.status === 'Resolved' || item.status === 'Accepted') ? (
              <Btn size="sm" onClick={() => setStatus('Closed')}>→ Closed</Btn>
            ) : null}
            {onDelete && (item.createdBy === currentUser || isOwner) && (
              <button
                onClick={onDelete}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: TOK.muted, cursor: 'pointer', fontSize: 11, fontFamily: FONT_STACK }}
                title="Delete this RAID item">
                <Trash2 size={12} /> Delete
              </button>
            )}
          </div>
          )}
        </div>
      )}
    </div>
  );
}

// v30 RAID Phase 2 — Top-level RAID Register view. Two-panel layout: program
// sidebar on the left, item list + filters + summary on the right. Supports
// single-project and all-projects modes.
function RaidRegisterView({ projects, currentProjectId, author, isOwner, teamMembers, scopeProgramId, onApplyRaidUpdate, onRaidNavigate, dialogs, uid: myUid = null }) {
  // Hooks before any early return.
  const [selectedProgramKey, setSelectedProgramKey] = useState(null);
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('Active'); // Active | Closed | All
  const [showAddForm, setShowAddForm] = useState(false);

  // Build a flat list of {projectId, programId, project, program} entries.
  const allProgramEntries = useMemo(() => {
    const entries = [];
    const sourceProjects = currentProjectId ? [projects[currentProjectId]].filter(Boolean) : Object.values(projects || {});
    for (const proj of sourceProjects) {
      for (const pg of (proj.programs || [])) {
        if (scopeProgramId && pg.id !== scopeProgramId) continue;
        entries.push({
          key: `${proj.id}::${pg.id}`,
          projectId: proj.id,
          programId: pg.id,
          project: proj,
          program: pg,
        });
      }
    }
    return entries;
  }, [projects, currentProjectId, scopeProgramId]);

  // Auto-select first program if none selected, or if selection no longer exists.
  useEffect(() => {
    if (allProgramEntries.length === 0) return;
    if (!selectedProgramKey || !allProgramEntries.find((e) => e.key === selectedProgramKey)) {
      setSelectedProgramKey(allProgramEntries[0].key);
    }
  }, [allProgramEntries, selectedProgramKey]);

  const selectedEntry = allProgramEntries.find((e) => e.key === selectedProgramKey);
  // Wave 2 R5: on v2, RAID is edited only by the Owner or a PM / Deputy / Sub-PM
  // of this program; item delete is Owner-only. v1 unchanged.
  const selIsV2 = !!selectedEntry?.project?.__v2;
  const canEditSel = !!selectedEntry && canEditRaid({
    isOwner, isV2: selIsV2, roles: selectedEntry.project.__v2?.roles || null, uid: myUid, programId: selectedEntry.programId,
  });
  const canDeleteSel = canDeleteRaidOrDecision({ isOwner, isV2: selIsV2 });
  const picSuggestions = useMemo(() => {
    const names = new Set();
    // Primary source: workspace-wide team members (App-level derived roster used by every other form).
    (teamMembers || []).forEach((m) => m?.name && names.add(m.name));
    // Secondary source: per-project contributor registry (departments like AF, Legal, HR, etc.) when present.
    if (selectedEntry) {
      (selectedEntry.project.contributorRegistry || []).forEach((r) => r?.name && names.add(r.name));
    }
    return Array.from(names).sort();
  }, [teamMembers, selectedEntry]);

  // Visibility filter — Draft visible only to creator; PendingApproval visible to creator + owner.
  const visibleItems = useMemo(() => {
    if (!selectedEntry) return [];
    return (selectedEntry.program.raid || []).filter((item) => {
      if (item.status === 'Draft' && item.createdBy !== author) return false;
      if (item.status === 'PendingApproval' && item.createdBy !== author && !isOwner) return false;
      return true;
    });
  }, [selectedEntry, author, isOwner]);

  // Apply type + status filters.
  const filteredItems = useMemo(() => {
    return visibleItems.filter((item) => {
      if (typeFilter !== 'All' && item.type !== typeFilter) return false;
      const closed = item.status === 'Closed' || item.status === 'Resolved' || item.status === 'Accepted';
      if (statusFilter === 'Active' && closed) return false;
      if (statusFilter === 'Closed' && !closed) return false;
      return true;
    }).sort((a, b) => {
      // Sort PendingApproval first, then by computed level desc, then by createdAt desc.
      if (a.status === 'PendingApproval' && b.status !== 'PendingApproval') return -1;
      if (b.status === 'PendingApproval' && a.status !== 'PendingApproval') return 1;
      const levelOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      const al = a.type === 'Risk' ? levelOrder[raidRiskLevel(a.likelihood, a.impact)] : 4;
      const bl = b.type === 'Risk' ? levelOrder[raidRiskLevel(b.likelihood, b.impact)] : 4;
      if (al !== bl) return al - bl;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }, [visibleItems, typeFilter, statusFilter]);

  // Summary strip counts.
  const summary = useMemo(() => {
    const items = visibleItems.filter((i) => i.status !== 'Closed' && i.status !== 'Resolved' && i.status !== 'Accepted');
    const risks = items.filter((i) => i.type === 'Risk');
    const counts = {
      Critical: risks.filter((r) => raidRiskLevel(r.likelihood, r.impact) === 'Critical').length,
      High: risks.filter((r) => raidRiskLevel(r.likelihood, r.impact) === 'High').length,
      Issue: items.filter((i) => i.type === 'Issue').length,
      Assumption: items.filter((i) => i.type === 'Assumption' && !i.validated).length,
      stale: items.filter((i) => raidDaysSinceReview(i) > RAID_REVIEW_STALE_DAYS && (i.status === 'Active' || i.status === 'Mitigating')).length,
    };
    return counts;
  }, [visibleItems]);

  // Type tab counts (over visible items, ignoring status filter so the counts don't jump).
  const typeCounts = useMemo(() => ({
    All: visibleItems.length,
    Risk: visibleItems.filter((i) => i.type === 'Risk').length,
    Assumption: visibleItems.filter((i) => i.type === 'Assumption').length,
    Issue: visibleItems.filter((i) => i.type === 'Issue').length,
    Dependency: visibleItems.filter((i) => i.type === 'Dependency').length,
  }), [visibleItems]);

  const handleSave = (newItem) => {
    if (!selectedEntry) return;
    onApplyRaidUpdate(newItem, selectedEntry.projectId, selectedEntry.programId, 'raid');
    setShowAddForm(false);
  };

  const handleUpdate = (updatedItem) => {
    if (!selectedEntry) return;
    onApplyRaidUpdate(updatedItem, selectedEntry.projectId, selectedEntry.programId, 'raid');
  };

  const handleDelete = async (item) => {
    if (!selectedEntry) return;
    const ok = await dialogs.confirm({ title: 'Delete RAID item?', message: `Delete "${item.title}"? This cannot be undone.`, okLabel: 'Delete' });
    if (!ok) return;
    if (onRaidNavigate?.deleteHandler) {
      onRaidNavigate.deleteHandler(item.id, selectedEntry.projectId, selectedEntry.programId);
    }
  };

  if (allProgramEntries.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: TOK.muted, padding: 40, textAlign: 'center', fontFamily: FONT_STACK }}>
        <div style={{ fontSize: 32 }}>📋</div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>No programs to show</div>
        <div style={{ fontSize: 12, color: TOK.subtle, maxWidth: 400 }}>Create a program first, then come back to log Risks, Assumptions, Issues, or Dependencies.</div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', fontFamily: FONT_STACK }}>
      {/* Program sidebar */}
      <div style={{ width: 200, borderRight: '1px solid ' + TOK.line, background: TOK.bg, overflowY: 'auto', padding: '12px 8px' }}>
        <div style={{ fontSize: 10.5, color: TOK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, padding: '4px 8px 8px' }}>
          Programs ({allProgramEntries.length})
        </div>
        {allProgramEntries.map((e) => {
          const active = (e.program.raid || []).filter((r) => r.status === 'Active' || r.status === 'Mitigating');
          const risks = active.filter((r) => r.type === 'Risk');
          const highestLevel = risks.length === 0 ? null : risks.reduce((acc, r) => {
            const lvl = raidRiskLevel(r.likelihood, r.impact);
            const order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
            if (acc === null) return lvl;
            return order[lvl] < order[acc] ? lvl : acc;
          }, null);
          const dotColor = highestLevel === 'Critical' ? '#A32D2D' : highestLevel === 'High' ? '#A32D2D' : highestLevel === 'Medium' ? '#B7791F' : highestLevel === 'Low' ? '#356512' : 'transparent';
          const hasPending = (e.program.raid || []).some((r) => r.status === 'PendingApproval');
          const hasStale = active.some((r) => raidDaysSinceReview(r) > RAID_REVIEW_STALE_DAYS);
          const selected = selectedProgramKey === e.key;
          return (
            <button
              key={e.key}
              onClick={() => setSelectedProgramKey(e.key)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                marginBottom: 2,
                background: selected ? TOK.surface : 'transparent',
                color: TOK.ink,
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontFamily: FONT_STACK,
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentProjectId ? e.program.name : `${e.project.name} › ${e.program.name}`}
              </span>
              {hasPending && <span title="Pending approval">⏳</span>}
              {hasStale && <span title="Needs review" style={{ fontSize: 11 }}>⏰</span>}
            </button>
          );
        })}
      </div>

      {/* Main panel */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 32px' }}>
        {selectedEntry && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TOK.ink }}>
                {selectedEntry.program.name}
              </h2>
              <span style={{ fontSize: 12, color: TOK.muted }}>· RAID Register</span>
              <div style={{ flex: 1 }} />
              {canEditSel && <Btn size="sm" variant="primary" onClick={() => setShowAddForm(true)}><Plus size={12} /> Add</Btn>}
            </div>

            {/* Summary strip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 8, marginBottom: 12, fontSize: 12, color: TOK.ink, flexWrap: 'wrap' }}>
              {summary.Critical > 0 && <span><strong style={{ color: '#7B1D1D' }}>{summary.Critical}</strong> Critical</span>}
              {summary.High > 0 && <span><strong style={{ color: '#A32D2D' }}>{summary.High}</strong> High</span>}
              {summary.Issue > 0 && <span>🔥 <strong>{summary.Issue}</strong> open</span>}
              {summary.Assumption > 0 && <span>💡 <strong>{summary.Assumption}</strong> unvalidated</span>}
              {summary.stale > 0 && <span style={{ color: TOK.overdueFg }}>⏰ <strong>{summary.stale}</strong> needs review</span>}
              {summary.Critical + summary.High + summary.Issue + summary.Assumption + summary.stale === 0 && (
                <span style={{ color: TOK.subtle, fontStyle: 'italic' }}>No active items.</span>
              )}
            </div>

            {/* Type filter tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 10, background: TOK.bg, padding: 3, borderRadius: 8, fontSize: 12 }}>
              {['All', 'Risk', 'Assumption', 'Issue', 'Dependency'].map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  style={{
                    flex: 1,
                    fontFamily: FONT_STACK,
                    fontSize: 12,
                    fontWeight: 500,
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: typeFilter === t ? TOK.surface : 'transparent',
                    color: typeFilter === t ? TOK.ink : TOK.muted,
                    cursor: 'pointer',
                    boxShadow: typeFilter === t ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  }}>
                  {t === 'All' ? 'All' : RAID_TYPES[t]?.icon} {t === 'All' ? '' : t} ({typeCounts[t]})
                </button>
              ))}
            </div>

            {/* Status toggle */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center', fontSize: 11.5, color: TOK.muted }}>
              <span style={{ fontWeight: 500 }}>Status:</span>
              {['Active', 'Closed', 'All'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  style={{
                    fontFamily: FONT_STACK,
                    fontSize: 11.5,
                    fontWeight: 500,
                    padding: '3px 9px',
                    borderRadius: 999,
                    border: '1px solid ' + (statusFilter === s ? TOK.ink : TOK.line),
                    background: statusFilter === s ? TOK.ink : TOK.surface,
                    color: statusFilter === s ? '#fff' : TOK.muted,
                    cursor: 'pointer',
                  }}>
                  {s}
                </button>
              ))}
            </div>

            {/* Card list */}
            {filteredItems.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', fontSize: 12, color: TOK.subtle, fontStyle: 'italic' }}>
                No items match the current filters.
              </div>
            ) : (
              filteredItems.map((item) => (
                <RAIDCard
                  key={item.id}
                  item={item}
                  isOwner={isOwner}
                  currentUser={author}
                  teamMembers={teamMembers}
                  picSuggestions={picSuggestions}
                  canEdit={canEditSel}
                  onUpdate={handleUpdate}
                  onDelete={canDeleteSel ? () => handleDelete(item) : null}
                />
              ))
            )}

            {showAddForm && canEditSel && (
              <AddRAIDForm
                onSave={handleSave}
                onCancel={() => setShowAddForm(false)}
                currentUser={author}
                teamMembers={teamMembers}
                picSuggestions={picSuggestions}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// v30 RAID Phase 4 — Renders the 3 RAID-related sections inside MyWorkView.
// onNavigateRaid(projectId, programId) switches the view to RAID with that
// program selected.
function MyRaidSection({ myRaid, teamMembers, onNavigateRaid }) {
  const attentionCount =
    myRaid.pendingApproval.length +
    myRaid.escalating.length +
    myRaid.overdueActions.length +
    myRaid.needsReview.length;

  const MiniItemCard = ({ enriched, badge }) => {
    const tcfg = RAID_TYPES[enriched.item.type] || RAID_TYPES.Risk;
    const tr = enriched.item.trend ? RAID_TREND_CONFIG[enriched.item.trend] : null;
    return (
      <div
        onClick={() => onNavigateRaid(enriched.project.id, enriched.program.id)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          border: '1px solid ' + TOK.line, borderRadius: 7, marginBottom: 5,
          background: TOK.surface, cursor: 'pointer', fontFamily: FONT_STACK,
        }}>
        <span style={{ fontSize: 14 }}>{tcfg.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: TOK.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <MentionedText text={enriched.item.title} teamMembers={teamMembers} />
          </div>
          <div style={{ fontSize: 10.5, color: TOK.muted, marginTop: 1 }}>
            {enriched.project.name} › {enriched.program.name} · @{enriched.item.owner || '—'}
          </div>
        </div>
        {badge}
        {tr && <span style={{ fontSize: 12 }} title={tr.label}>{tr.icon}</span>}
        <ChevronRight size={13} style={{ color: TOK.subtle }} />
      </div>
    );
  };

  const MiniActionCard = ({ enriched, overdue }) => (
    <div
      onClick={() => onNavigateRaid(enriched.project.id, enriched.program.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        border: '1px solid ' + (overdue ? '#F5C8C8' : TOK.line), borderRadius: 7,
        marginBottom: 5, background: overdue ? '#FCEBEB' : TOK.surface,
        cursor: 'pointer', fontFamily: FONT_STACK,
      }}>
      <span style={{ color: TOK.subtle, fontSize: 12 }}>☐</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: overdue ? '#7B1D1D' : TOK.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {enriched.action.name}
        </div>
        <div style={{ fontSize: 10.5, color: overdue ? '#A32D2D' : TOK.muted, marginTop: 1 }}>
          In: {enriched.item.title.slice(0, 50)}{enriched.item.title.length > 50 ? '…' : ''} · {enriched.program.name}
          {enriched.action.due && <> · {overdue ? 'was due' : 'due'} {fmtDateShort(enriched.action.due)}</>}
        </div>
      </div>
      <ChevronRight size={13} style={{ color: TOK.subtle }} />
    </div>
  );

  return (
    <>
      {/* Attention section (only render if any sub-group is non-empty) */}
      {attentionCount > 0 && (
        <MyWorkSection
          icon="⚠"
          title="RAID items needing my attention"
          count={attentionCount}
          defaultOpen={true}>
          {myRaid.pendingApproval.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#B7791F', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>
                ⏳ Pending your approval ({myRaid.pendingApproval.length})
              </div>
              {myRaid.pendingApproval.map((e, i) => (
                <MiniItemCard
                  key={`pa-${i}`}
                  enriched={e}
                  badge={<span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, color: '#B7791F', background: '#FAEEDA' }}>Approve</span>}
                />
              ))}
            </div>
          )}
          {myRaid.escalating.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#A32D2D', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>
                🔴 Escalating risks I own ({myRaid.escalating.length})
              </div>
              {myRaid.escalating.map((e, i) => (
                <MiniItemCard
                  key={`es-${i}`}
                  enriched={e}
                  badge={e.item.type === 'Risk' ? <RiskLevelBadge likelihood={e.item.likelihood} impact={e.item.impact} /> : null}
                />
              ))}
            </div>
          )}
          {myRaid.overdueActions.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#A32D2D', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>
                ⚠ Overdue mitigation actions ({myRaid.overdueActions.length})
              </div>
              {myRaid.overdueActions.map((e, i) => (
                <MiniActionCard key={`oa-${i}`} enriched={e} overdue={true} />
              ))}
            </div>
          )}
          {myRaid.needsReview.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#B7791F', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>
                ⏰ Risks not reviewed in &gt;7 days ({myRaid.needsReview.length})
              </div>
              {myRaid.needsReview.map((e, i) => (
                <MiniItemCard
                  key={`nr-${i}`}
                  enriched={e}
                  badge={<span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, color: '#B7791F', background: '#FAEEDA' }}>Review</span>}
                />
              ))}
            </div>
          )}
        </MyWorkSection>
      )}

      {/* Mitigation actions due this week */}
      {myRaid.dueThisWeek.length > 0 && (
        <MyWorkSection
          icon="📅"
          title="Mitigation actions due this week"
          count={myRaid.dueThisWeek.length}
          defaultOpen={true}>
          {myRaid.dueThisWeek.map((e, i) => (
            <MiniActionCard key={`dw-${i}`} enriched={e} overdue={false} />
          ))}
        </MyWorkSection>
      )}

      {/* All RAID items I own — collapsed by default */}
      {myRaid.owned.length > 0 && (
        <MyWorkSection
          icon="📋"
          title="All RAID items I own"
          count={myRaid.owned.length}
          defaultOpen={false}>
          {myRaid.owned.map((e, i) => (
            <MiniItemCard
              key={`ow-${i}`}
              enriched={e}
              badge={e.item.type === 'Risk' ? <RiskLevelBadge likelihood={e.item.likelihood} impact={e.item.impact} /> : <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, color: TOK.muted, background: TOK.bg }}>{e.item.status}</span>}
            />
          ))}
        </MyWorkSection>
      )}
    </>
  );
}

// v30 RAID Phase 3 — Read-only collapsible signal inside TaskDetail panel.
// Shows up to 3 highest-priority active RAID items for the task's parent program.
// `program` is the task's parent program object (already destructured in TaskDetail
// from findTaskInProject). `onNavigateRaid` switches to RAID tab + scopes program.
function TaskProgramRaidSignal({ program, onNavigateRaid }) {
  const activeItems = useMemo(() => {
    return (program?.raid || [])
      .filter((r) => r.status === 'Active' || r.status === 'Mitigating')
      .sort((a, b) => {
        // PendingApproval items already excluded by filter above.
        // Sort: Risk by computed level desc, then non-Risk by createdAt desc.
        const levelOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
        const al = a.type === 'Risk' ? levelOrder[raidRiskLevel(a.likelihood, a.impact)] : 4;
        const bl = b.type === 'Risk' ? levelOrder[raidRiskLevel(b.likelihood, b.impact)] : 4;
        if (al !== bl) return al - bl;
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });
  }, [program]);

  const [expanded, setExpanded] = useState(activeItems.length > 0);

  if (!program) return null;

  const top3 = activeItems.slice(0, 3);
  const extra = activeItems.length - top3.length;
  const issueCount = activeItems.filter((r) => r.type === 'Issue').length;
  const dependencyCount = activeItems.filter((r) => r.type === 'Dependency').length;
  const escalatingCount = activeItems.filter((r) => r.trend === 'escalating').length;

  return (
    <div style={{ marginTop: 14, border: '1px solid ' + TOK.line, borderRadius: 8, background: TOK.surface, fontFamily: FONT_STACK }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <span style={{ fontSize: 14 }}>⚠</span>
        <div style={{ flex: 1, fontSize: 12.5, color: TOK.ink, fontWeight: 500 }}>
          {activeItems.length === 0 ? (
            <span style={{ color: TOK.muted, fontWeight: 400 }}>No active RAID items in {program.name}</span>
          ) : (
            <>
              {activeItems.length} active RAID item{activeItems.length === 1 ? '' : 's'} in {program.name}
              {escalatingCount > 0 && <span style={{ marginLeft: 8, color: '#A32D2D', fontSize: 11, fontWeight: 500 }}>🔴 {escalatingCount} escalating</span>}
            </>
          )}
        </div>
        {activeItems.length > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onNavigateRaid(program.id); }}
            style={{ background: 'none', border: 'none', color: TOK.accent, fontSize: 11, cursor: 'pointer', fontFamily: FONT_STACK, padding: '2px 6px' }}>
            View all →
          </button>
        )}
        <ChevronDown size={13} style={{ color: TOK.muted, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }} />
      </div>
      {expanded && activeItems.length > 0 && (
        <div style={{ padding: '4px 12px 12px', borderTop: '1px solid ' + TOK.line }}>
          {top3.map((item) => {
            const tcfg = RAID_TYPES[item.type] || RAID_TYPES.Risk;
            const trendCfg = item.trend ? RAID_TREND_CONFIG[item.trend] : null;
            const isRisk = item.type === 'Risk';
            const truncated = item.title.length > 60 ? item.title.slice(0, 60) + '…' : item.title;
            return (
              <div key={item.id} style={{ padding: '6px 0', borderBottom: '1px dashed ' + TOK.line, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{ fontSize: 13 }}>{tcfg.icon}</span>
                <span style={{ flex: 1, minWidth: 0, color: TOK.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {truncated}
                </span>
                {isRisk && <RiskLevelBadge likelihood={item.likelihood} impact={item.impact} />}
                {trendCfg && <span style={{ fontSize: 12 }} title={trendCfg.label}>{trendCfg.icon}</span>}
                <span style={{ fontSize: 10.5, color: TOK.muted }}>@{item.owner || '—'}</span>
              </div>
            );
          })}
          {extra > 0 && (
            <div style={{ padding: '6px 0', fontSize: 11, color: TOK.muted, fontStyle: 'italic' }}>
              +{extra} more · {issueCount > 0 && <>🔥 {issueCount} issue{issueCount === 1 ? '' : 's'} · </>}{dependencyCount > 0 && <>🔗 {dependencyCount} dependenc{dependencyCount === 1 ? 'y' : 'ies'} · </>}
              <button
                type="button"
                onClick={() => onNavigateRaid(program.id)}
                style={{ background: 'none', border: 'none', color: TOK.accent, fontSize: 11, cursor: 'pointer', fontFamily: FONT_STACK, padding: 0 }}>
                View all →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// v30.M — Convert "#0C447C" → "rgba(12,68,124,0.1)" for a soft background tint.
function hex2rgba(hex, a = 0.1) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return `rgba(12,68,124,${a})`;
  const [r, g, b] = h.match(/\w\w/g).map((x) => parseInt(x, 16));
  return `rgba(${r},${g},${b},${a})`;
}

// v30.M — One project card with 4 labeled blocks: Task / Action / RAID / Decision.
// Each block surfaces its "today/now" items inline and nests less-urgent
// buckets behind collapse toggles. Card header acts as the project alert
// summary; the alert strip lists each urgent item by name.
function ByProjectCard({
  bundle, author, teamMembers, picSuggestions, lastSeenAt,
  onTaskClick, onActionClick, onCreateAction, onActionUpdate, onProjectUpdate, onDecisionClick,
  handleStatusChange, handleAddUpdate, handleRequestExtension, handleActionDone, handleStepDone,
  showToast, onNavigateRaid,
}) {
  const { project, owned, contributing, actions, mentions, unreadMentions, raid, decisions } = bundle;
  const [collapsed, setCollapsed] = useState(false);
  const [openSec, setOpenSec] = useState({
    taskWeek: false, taskLater: false, taskContrib: false,
    actionWeek: false, actionLater: false,
    raidEsc: false, raidOver: false, raidReview: false, raidApprove: false,
  });
  const togSec = (k) => setOpenSec((s) => ({ ...s, [k]: !s[k] }));

  const overdueTasks = owned.today.filter((e) => isOverdue(e.task));
  const totalTasks = owned.today.length + owned.week.length + owned.later.length;
  const totalActions = actions.today.length + actions.week.length + actions.later.length;
  const totalRaid = raid.escalating.length + raid.overdueActions.length + raid.needsReview.length + raid.pendingApproval.length;
  const totalDecisions = decisions.length;
  const urgentCount = overdueTasks.length + unreadMentions.length + raid.escalating.length;
  const color = project.color || '#0C447C';
  const colorBg = hex2rgba(color, 0.08);

  const renderTaskCard = (e) => (
    <TaskRowInline
      key={`p-${project.id}-t-${e.task.id}`}
      task={e.task} project={e.project} program={e.program} workstream={e.workstream}
      author={author} teamMembers={teamMembers}
      onStatusChange={(st) => handleStatusChange(e.task, e.project, st)}
      onAddUpdate={(text, blocker) => handleAddUpdate(e.task, e.project, text, blocker)}
      onRequestExtension={() => handleRequestExtension(e.task, e.project)}
      onOpenDetails={() => onTaskClick(e.task.id, e.project.id)}
      onAddAction={onCreateAction ? () => onCreateAction(e.project.id, e.task.id) : null}
      onMarkDone={() => handleStatusChange(e.task, e.project, 'Completed')}
      onStepDone={(action, subtask) => handleStepDone(action, subtask, e.project)}
    />
  );

  const renderActionEntry = (e, i) => {
    if (e.kind === 'mitigation') {
      return (
        <MitigationRowInline
          key={`p-${project.id}-mit-${e.mitigation.id || i}`}
          entry={e}
          author={author}
          teamMembers={teamMembers}
          picSuggestions={picSuggestions}
          onApplyMitigation={(nextProject) => onProjectUpdate(nextProject)}
          onNavigateRaid={onNavigateRaid}
          showToast={showToast}
        />
      );
    }
    if (e.kind === 'subtask') {
      const sub = e.subtask;
      const parent = e.parentAction;
      return (
        <SubtaskMyWorkRow
          key={`p-${project.id}-sub-${sub.id || i}`}
          subtask={sub}
          parentAction={parent}
          project={e.project}
          teamMembers={teamMembers}
          onMarkDone={() => {
            const updatedParent = {
              ...parent,
              subtasks: (parent.subtasks || []).map((s) => s.id === sub.id ? { ...s, status: 'Done' } : s),
            };
            onActionUpdate(updatedParent, e.project.id);
          }}
          onOpenParent={() => onActionClick && onActionClick(e.project.id, parent.id)}
        />
      );
    }
    const a = e.action;
    const related = a.relatedTaskId ? findTaskInProject(e.project, a.relatedTaskId) : null;
    return (
      <ActionRowInline
        key={`p-${project.id}-a-${a.id || i}`}
        action={a}
        project={e.project}
        related={related}
        author={author}
        teamMembers={teamMembers}
        picSuggestions={picSuggestions}
        onChange={(patch) => onActionUpdate({ ...a, ...patch }, e.project.id)}
        onAddComment={(text, blocker) => onActionUpdate({
          ...a,
          updates: [
            { id: uid('aupd'), timestamp: new Date().toISOString(), author, text, isBlocker: !!blocker },
            ...(a.updates || []),
          ],
        }, e.project.id)}
        onMarkDone={() => handleActionDone(a, e.project)}
        onOpenDetails={onActionClick ? () => onActionClick(e.project.id, a.id) : null}
        onSubtasksChange={(newSubtasks) => onActionUpdate({ ...a, subtasks: newSubtasks }, e.project.id)}
        showToast={showToast}
      />
    );
  };

  const BlockHeader = ({ icon, label, count }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 10px', marginBottom: 8, marginTop: 4,
      background: colorBg, borderRadius: 6,
      borderLeft: '3px solid ' + color,
    }}>
      <span style={{ fontSize: 13 }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: TOK.ink, letterSpacing: 0.2 }}>{label}</span>
      {count > 0 && (
        <span style={{
          fontSize: 10, padding: '1px 7px', borderRadius: 999,
          background: TOK.surface, color: TOK.muted, fontWeight: 600,
        }}>{count}</span>
      )}
    </div>
  );
  const subToggle = (key, label) => (
    <button onClick={() => togSec(key)} style={{
      background: 'none', border: 'none', cursor: 'pointer',
      fontFamily: FONT_STACK, fontSize: 11, color: TOK.muted, fontWeight: 500,
      display: 'flex', alignItems: 'center', gap: 5, padding: '4px 0', marginTop: 4,
    }}>
      {openSec[key] ? '▼' : '▶'} {label}
    </button>
  );

  return (
    <div style={{
      marginBottom: 14,
      border: '1.5px solid ' + (urgentCount > 0 ? color : TOK.lineStrong),
      borderRadius: 12, overflow: 'hidden', background: TOK.surface,
      boxShadow: urgentCount > 0 ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
    }}>
      <div onClick={() => setCollapsed((c) => !c)} style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px',
        cursor: 'pointer', background: colorBg,
        borderBottom: collapsed ? 'none' : '1px solid ' + TOK.line,
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 15, fontWeight: 700, color }}>{project.name}</span>
        {overdueTasks.length > 0 && (
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: TOK.overdueBg, color: TOK.overdueFg, fontWeight: 600 }}>⚠ {overdueTasks.length} overdue</span>
        )}
        {unreadMentions.length > 0 && (
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#E6EFD6', color: '#356512', fontWeight: 600 }}>💬 {unreadMentions.length} @you</span>
        )}
        {raid.escalating.length > 0 && (
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: TOK.overdueBg, color: TOK.overdueFg, fontWeight: 600 }}>🔴 {raid.escalating.length} escalating</span>
        )}
        {totalDecisions > 0 && (
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: TOK.bg, color: TOK.ink, fontWeight: 600 }}>🤔 {totalDecisions}</span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color, opacity: 0.7 }}>{totalTasks} task{totalTasks !== 1 ? 's' : ''} · {totalActions} action{totalActions !== 1 ? 's' : ''}</span>
        <span style={{ color, fontSize: 12, marginLeft: 8 }}>{collapsed ? '▼' : '▲'}</span>
      </div>

      {!collapsed && (
        <div style={{ padding: '12px 16px 14px' }}>
          {urgentCount > 0 && (
            <div style={{
              padding: '8px 12px', background: '#FFF8F8',
              border: '1px solid #F5C8C8', borderRadius: 8,
              marginBottom: 12, fontSize: 12,
            }}>
              {overdueTasks.map((e) => (
                <div key={'al-' + e.task.id} style={{ color: TOK.overdueFg, fontWeight: 500, marginBottom: 2 }}>
                  ⚠ Task overdue: <strong>{e.task.name}</strong> — was due {fmtDateShort(e.task.end)}
                </div>
              ))}
              {raid.escalating.map((r, i) => (
                <div key={'ar-' + (r.item?.id || i)} style={{ color: TOK.overdueFg, marginBottom: 2 }}>
                  🔴 Risk escalating: {r.item?.title || '(untitled)'}
                </div>
              ))}
              {unreadMentions.slice(0, 5).map((m, i) => (
                <div key={'am-' + i} style={{ color: '#356512', marginBottom: 2 }}>
                  💬 {m.postAuthor || '—'}: "{(m.text || '').slice(0, 55)}…"
                </div>
              ))}
            </div>
          )}

          {/* 📋 BLOCK 1 — TASKS */}
          {totalTasks + contributing.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <BlockHeader icon="📋" label="Tasks" count={totalTasks + contributing.length} />
              {owned.today.length > 0 ? (
                owned.today.map(renderTaskCard)
              ) : (
                <div style={{ fontSize: 11.5, color: TOK.muted, padding: '4px 4px 6px' }}>Nothing due today / overdue.</div>
              )}
              {owned.week.length > 0 && (
                <>
                  {subToggle('taskWeek', `This week (${owned.week.length})`)}
                  {openSec.taskWeek && owned.week.map(renderTaskCard)}
                </>
              )}
              {owned.later.length > 0 && (
                <>
                  {subToggle('taskLater', `Later (${owned.later.length})`)}
                  {openSec.taskLater && owned.later.map(renderTaskCard)}
                </>
              )}
              {contributing.length > 0 && (
                <>
                  {subToggle('taskContrib', `Contributing (${contributing.length})`)}
                  {openSec.taskContrib && contributing.map(renderTaskCard)}
                </>
              )}
            </div>
          )}

          {/* ✅ BLOCK 2 — ACTIONS */}
          {totalActions > 0 && (
            <div style={{ marginBottom: 14 }}>
              <BlockHeader icon="✅" label="Actions" count={totalActions} />
              {actions.today.length > 0 ? (
                actions.today.map(renderActionEntry)
              ) : (
                <div style={{ fontSize: 11.5, color: TOK.muted, padding: '4px 4px 6px' }}>Nothing due today / overdue.</div>
              )}
              {actions.week.length > 0 && (
                <>
                  {subToggle('actionWeek', `This week (${actions.week.length})`)}
                  {openSec.actionWeek && actions.week.map(renderActionEntry)}
                </>
              )}
              {actions.later.length > 0 && (
                <>
                  {subToggle('actionLater', `Later (${actions.later.length})`)}
                  {openSec.actionLater && actions.later.map(renderActionEntry)}
                </>
              )}
            </div>
          )}

          {/* 🔴 BLOCK 3 — RAID */}
          {totalRaid > 0 && (
            <div style={{ marginBottom: 14 }}>
              <BlockHeader icon="🔴" label="RAID" count={totalRaid} />
              {[
                { key: 'raidEsc', label: 'Escalating', list: raid.escalating },
                { key: 'raidOver', label: 'Overdue mitigation actions', list: raid.overdueActions },
                { key: 'raidReview', label: 'Needs review', list: raid.needsReview },
                { key: 'raidApprove', label: 'Pending your approval', list: raid.pendingApproval },
              ].filter((b) => b.list.length > 0).map((b) => (
                <div key={b.key}>
                  {subToggle(b.key, `${b.label} (${b.list.length})`)}
                  {openSec[b.key] && b.list.map((r, i) => {
                    const item = r.item || r;
                    return (
                      <div key={b.key + '-' + i}
                        onClick={() => onNavigateRaid && onNavigateRaid(project.id, r.program?.id)}
                        style={{
                          display: 'flex', gap: 8, padding: '6px 10px',
                          border: '1px solid ' + TOK.line, borderRadius: 6,
                          marginBottom: 4, background: TOK.surface,
                          alignItems: 'center', fontSize: 12, cursor: 'pointer',
                        }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: TOK.overdueFg, flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item?.title || '(untitled)'}
                        </span>
                        {item?.level && (
                          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: TOK.bg, color: TOK.muted, fontWeight: 600 }}>{item.level}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* 🤔 BLOCK 4 — DECISIONS */}
          {totalDecisions > 0 && (
            <div style={{ marginBottom: 6 }}>
              <BlockHeader icon="🤔" label="Decisions awaiting input" count={totalDecisions} />
              {decisions.map((d, i) => {
                const dec = d.decision;
                const reviewDate = dec?.expectedReviewDate || dec?.date;
                return (
                  <div key={'dec-' + (dec?.id || i)}
                    onClick={() => onDecisionClick && onDecisionClick(d.project.id, dec?.id)}
                    style={{
                      padding: '8px 10px', border: '1px solid ' + TOK.line, borderRadius: 6,
                      marginBottom: 4, background: TOK.surface, cursor: 'pointer',
                    }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: TOK.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {dec?.text || dec?.title || '(untitled decision)'}
                    </div>
                    <div style={{ fontSize: 10.5, color: TOK.muted, marginTop: 2 }}>
                      {dec?.followUpStatus && <span>{dec.followUpStatus} · </span>}
                      {reviewDate && <span>review {fmtDateShort(reviewDate)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {totalTasks + contributing.length + totalActions + totalRaid + totalDecisions === 0 && (
            <div style={{ color: TOK.muted, fontSize: 12.5, padding: '12px 0' }}>
              No work assigned to you in this project right now.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// v30.M — Regroup myWork + myRaid by project; render one card per project
// with tasks/actions/RAID for that project. Sort: overdue first, then urgent
// mentions, escalating RAID, alphabetical.
function ByProjectView({
  myWork, myRaid, author, teamMembers, picSuggestions, lastSeenAt,
  onTaskClick, onActionClick, onCreateAction, onActionUpdate, onProjectUpdate, onDecisionClick,
  handleStatusChange, handleAddUpdate, handleRequestExtension, handleActionDone, handleStepDone,
  showToast, onNavigateRaid,
}) {
  const bundles = useMemo(() => {
    const map = new Map();
    const ensure = (proj) => {
      if (!proj?.id) return null;
      if (!map.has(proj.id)) {
        map.set(proj.id, {
          project: proj,
          owned: { today: [], week: [], later: [] },
          contributing: [],
          actions: { today: [], week: [], later: [] },
          mentions: [],
          unreadMentions: [],
          raid: { escalating: [], overdueActions: [], needsReview: [], pendingApproval: [] },
          decisions: [],
        });
      }
      return map.get(proj.id);
    };
    for (const bucket of ['today', 'week', 'later']) {
      for (const e of (myWork.tasksOwned?.[bucket] || [])) ensure(e.project)?.owned[bucket].push(e);
      for (const e of (myWork.actionItems?.[bucket] || [])) ensure(e.project)?.actions[bucket].push(e);
    }
    for (const e of (myWork.tasksContributing || [])) ensure(e.project)?.contributing.push(e);
    for (const m of (myWork.allMentions || [])) ensure(m.project)?.mentions.push(m);
    for (const m of (myWork.unreadMentions || [])) ensure(m.project)?.unreadMentions.push(m);
    for (const d of (myWork.decisions || [])) ensure(d.project)?.decisions.push(d);
    if (myRaid) {
      for (const key of ['pendingApproval', 'escalating', 'overdueActions', 'needsReview']) {
        for (const e of (myRaid[key] || [])) ensure(e.project)?.raid[key].push(e);
      }
    }
    const arr = Array.from(map.values()).filter((b) => {
      const tasks = b.owned.today.length + b.owned.week.length + b.owned.later.length + b.contributing.length;
      const acts = b.actions.today.length + b.actions.week.length + b.actions.later.length;
      const r = b.raid.escalating.length + b.raid.overdueActions.length + b.raid.needsReview.length + b.raid.pendingApproval.length;
      return tasks + acts + b.unreadMentions.length + r + b.decisions.length > 0;
    });
    arr.sort((a, b) => {
      const aOv = a.owned.today.filter((e) => isOverdue(e.task)).length;
      const bOv = b.owned.today.filter((e) => isOverdue(e.task)).length;
      if (aOv !== bOv) return bOv - aOv;
      if (a.unreadMentions.length !== b.unreadMentions.length) return b.unreadMentions.length - a.unreadMentions.length;
      if (a.raid.escalating.length !== b.raid.escalating.length) return b.raid.escalating.length - a.raid.escalating.length;
      return (a.project.name || '').localeCompare(b.project.name || '');
    });
    return arr;
  }, [myWork, myRaid]);

  if (bundles.length === 0) {
    return (
      <div style={{ background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 10, padding: '24px 18px', textAlign: 'center', color: TOK.muted, fontSize: 13 }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>🌤</div>
        <div style={{ color: TOK.ink, fontWeight: 500, marginBottom: 4 }}>No project work yet</div>
        <div style={{ fontSize: 12 }}>You don't currently have tasks, actions, or RAID items assigned across any project.</div>
      </div>
    );
  }

  return (
    <div>
      {bundles.map((b) => (
        <ByProjectCard
          key={b.project.id}
          bundle={b}
          author={author}
          teamMembers={teamMembers}
          picSuggestions={picSuggestions}
          lastSeenAt={lastSeenAt}
          onTaskClick={onTaskClick}
          onActionClick={onActionClick}
          onCreateAction={onCreateAction}
          onActionUpdate={onActionUpdate}
          onProjectUpdate={onProjectUpdate}
          onDecisionClick={onDecisionClick}
          handleStatusChange={handleStatusChange}
          handleAddUpdate={handleAddUpdate}
          handleRequestExtension={handleRequestExtension}
          handleActionDone={handleActionDone}
          handleStepDone={handleStepDone}
          showToast={showToast}
          onNavigateRaid={onNavigateRaid}
        />
      ))}
    </div>
  );
}

function MyWorkView({
  projects, author, authorEmail = null, isOwner, userPrefs, teamMembers,
  onTaskClick, onActionClick, onDecisionClick, onCreateAction,
  onTaskUpdate: onTaskUpdateProp, onActionUpdate: onActionUpdateProp, onDecisionUpdate, onProjectUpdate,
  onApproveDeadline, onRejectDeadline,
  onMarkSeen, showToast,
  onNavigateRaid, dialogs = null,
}) {
  // P3-16: the App passes null handlers while "View as" is on; a write attempt toasts.
  const readOnlyWrite = () => { if (showToast) showToast(READ_ONLY_MESSAGE); return 'read-only'; };
  const onTaskUpdate = onTaskUpdateProp || readOnlyWrite;
  const onActionUpdate = onActionUpdateProp || readOnlyWrite;
  const dirIndex = useContext(DirectoryIndexContext);
  const lastSeenAt = userPrefs?.lastSeenMyWorkAt || null;
  const projectsLatest = useRef(projects);
  projectsLatest.current = projects;
  // U1: close requests waiting on me / sent by me (v2 projects). Keyed on the
  // signed-in uid, so hidden under View as. `now` is read per render.
  const me = useContext(MeContext);
  const approvals = me.readOnly ? { needsMine: [], sent: [] } : approvalBuckets(projects, me.uid, new Date());
  const myWork = useMemo(
    () => computeMyWork(author, projects, isOwner, lastSeenAt, dirIndex, authorEmail),
    [projects, author, isOwner, lastSeenAt, dirIndex, authorEmail]
  );
  const myRaid = useMemo(
    () => computeMyRaid(author, projects, isOwner),
    [projects, author, isOwner]
  );
  const picSuggestions = useMemo(() => {
    const set = new Set();
    for (const m of (teamMembers || [])) if (m?.name) set.add(m.name);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [teamMembers]);
  const [ownedTab, setOwnedTab] = useState('today');
  const [actionsTab, setActionsTab] = useState('today');

  // v30.M — Dual-view toggle. "project" focus mode is the default; "urgency"
  // is the morning-triage list. Persists to localStorage so the user's pick
  // survives page reload.
  const [viewMode, setViewMode] = useState(() => {
    try {
      const v = localStorage.getItem('myWorkViewMode');
      return v === 'urgency' || v === 'project' ? v : 'project';
    } catch { return 'project'; }
  });
  useEffect(() => {
    try { localStorage.setItem('myWorkViewMode', viewMode); } catch { /* ignore */ }
  }, [viewMode]);

  useEffect(() => {
    if (!onMarkSeen || !author) return;
    const t = setTimeout(() => onMarkSeen(), 5000);
    return () => clearTimeout(t);
  }, [author, onMarkSeen]);

  const handleStatusChange = (task, project, newStatus) => {
    const prevStatus = task.status || 'Planned';
    const outcome = onTaskUpdate({ ...task, status: newStatus }, project.id);
    // P3: a v2 submit / refusal keeps the choke point's own toast (no Undo).
    if (outcome && outcome !== 'direct' && outcome !== 'legacy') return;
    // B4: completing a task from My Work is one click — offer Undo.
    if (newStatus === 'Completed' && prevStatus !== 'Completed' && showToast) {
      showToast(`Marked “${task.name}” done`, { label: 'Undo', onClick: () => {
        // Rebuild from the latest project so edits made since the click are kept.
        const current = taskWithStatus(projectsLatest.current[project.id], task.id, prevStatus);
        if (current) onTaskUpdate(current, project.id);
      } });
    }
  };
  const handleAddUpdate = (task, project, text, blocker) => {
    onTaskUpdate({
      ...task,
      updates: [
        {
          id: uid('upd'),
          timestamp: new Date().toISOString(),
          author,
          text,
          isBlocker: !!blocker,
        },
        ...(task.updates || []),
      ],
    }, project.id);
  };
  const handleRequestExtension = (task, project) => {
    onTaskClick(task.id, project.id);
    if (showToast) showToast('Open the task to request an extension');
  };
  const handleActionDone = (action, project) => {
    onActionUpdate({ ...action, status: 'Done', completedAt: new Date().toISOString() }, project.id);
  };
  // v30.M — Mark a step done by mutating the parent action's subtasks. The
  // step is identified by (action, subtask) returned from collectTaskSteps;
  // we find the project the action belongs to via the enriched task entry.
  const handleStepDone = (action, subtask, project) => {
    if (!action || !subtask?.id) return;
    const nextSubs = (action.subtasks || []).map((s) =>
      s.id === subtask.id ? { ...s, status: 'Done', completedAt: new Date().toISOString() } : s
    );
    onActionUpdate({ ...action, subtasks: nextSubs }, project.id);
    if (showToast) showToast('✓ Step done');
  };

  const counts = {
    owned: myWork.tasksOwned.today.length + myWork.tasksOwned.week.length + myWork.tasksOwned.later.length,
    actions: myWork.actionItems.today.length + myWork.actionItems.week.length + myWork.actionItems.later.length,
  };
  const hasAnyAssignment = (
    counts.owned + myWork.tasksContributing.length + counts.actions +
    myWork.decisions.length + myWork.allMentions.length + myWork.credit.perProject.length +
    approvals.needsMine.length + approvals.sent.length
  ) > 0;
  const urgentEmpty = (
    myWork.needsAttention.length === 0 && myWork.unreadMentions.length === 0 &&
    myWork.tasksOwned.today.length === 0 && myWork.actionItems.today.length === 0 &&
    myWork.decisions.length === 0
  );

  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Red badge on "By urgency" tab: overdue tasks + unread mentions + RAID
  // needing attention. needsAttention already includes overdue tasks and
  // overdue subtasks; add RAID counts from myRaid for completeness.
  const urgencyBadge = (
    myWork.needsAttention.length +
    myWork.unreadMentions.length +
    (myRaid?.pendingApproval?.length || 0) +
    (myRaid?.escalating?.length || 0)
  );

  const ToggleHint = (
    <div style={{
      fontSize: 11, color: TOK.subtle, fontStyle: 'italic',
      maxWidth: 240, lineHeight: 1.4, marginLeft: 4,
    }}>
      {viewMode === 'urgency' ? "Morning triage — what's on fire?" : 'Focus mode — block time per project'}
    </div>
  );

  const ViewToggle = (
    <div style={{
      display: 'inline-flex', background: TOK.bg, borderRadius: 8,
      padding: 3, border: '1px solid ' + TOK.line,
    }}>
      {[
        { id: 'urgency', label: '⚡ By urgency', badge: urgencyBadge > 0 ? urgencyBadge : null },
        { id: 'project', label: '📁 By project', badge: null },
      ].map((t) => {
        const active = viewMode === t.id;
        return (
          <button key={t.id} onClick={() => setViewMode(t.id)} style={{
            padding: '6px 14px', borderRadius: 6, border: 'none',
            background: active ? TOK.surface : 'transparent',
            fontFamily: FONT_STACK, fontSize: 12,
            color: active ? TOK.ink : TOK.muted,
            fontWeight: active ? 600 : 400, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            transition: 'background 0.12s',
          }}>
            {t.label}
            {t.badge != null && (
              <span style={{
                background: '#FCEBEB', color: '#A32D2D', borderRadius: 999,
                padding: '1px 6px', fontSize: 10, fontWeight: 700,
              }}>{t.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );

  const Header = (
    <div style={{
      marginBottom: 16, display: 'flex', alignItems: 'flex-start',
      gap: 16, flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <h1 style={{ fontFamily: FONT_STACK, fontSize: 22, fontWeight: 600, margin: 0, color: TOK.ink, letterSpacing: -0.2 }}>My Work</h1>
        <div style={{ fontSize: 12, color: TOK.muted, marginTop: 4 }}>
          {author ? <><span style={{ color: TOK.ink, fontWeight: 500 }}>{author}</span> · </> : null}
          Today: {todayLabel}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {ViewToggle}
        {ToggleHint}
      </div>
    </div>
  );

  if (!author) {
    return (
      <div style={{ flex: 1, overflow: 'auto', padding: 20, background: TOK.bg, fontFamily: FONT_STACK }}>
        <div style={{ color: TOK.muted, fontSize: 13 }}>Sign in to see your work.</div>
      </div>
    );
  }

  if (!hasAnyAssignment) {
    return (
      <div style={{ flex: 1, overflow: 'auto', padding: 20, background: TOK.bg, fontFamily: FONT_STACK }}>
        {Header}
        <div style={{ background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 10, padding: '36px 24px', textAlign: 'center', color: TOK.muted, fontSize: 13 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🌱</div>
          <div style={{ fontSize: 15, color: TOK.ink, fontWeight: 500, marginBottom: 6 }}>No tasks assigned yet</div>
          <div style={{ maxWidth: 440, margin: '0 auto', lineHeight: 1.5 }}>
            Ask your workspace owner to assign you to a task or invite you to a project.
            Once you're added as a PIC or contributor, your work will appear here.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 20, background: TOK.bg, fontFamily: FONT_STACK }}>
      {Header}

      {approvals.needsMine.length > 0 && (
        <MyWorkSection icon="⏳" title="Needs my approval" count={approvals.needsMine.length} defaultOpen>
          {approvals.needsMine.map((it) => (
            <MyWorkApprovalRow key={it.project.id + ':' + it.task.id} item={it} mode="needs"
              onTaskClick={onTaskClick} onTaskUpdate={onTaskUpdate} dialogs={dialogs} />
          ))}
        </MyWorkSection>
      )}
      {approvals.sent.length > 0 && (
        <MyWorkSection icon="📤" title="Sent for approval" count={approvals.sent.length} defaultOpen>
          {approvals.sent.map((it) => (
            <MyWorkApprovalRow key={it.project.id + ':' + it.task.id} item={it} mode="sent"
              onTaskClick={onTaskClick} onTaskUpdate={onTaskUpdate} dialogs={dialogs} />
          ))}
        </MyWorkSection>
      )}

      {viewMode === 'project' ? (
        <ByProjectView
          myWork={myWork}
          myRaid={myRaid}
          author={author}
          teamMembers={teamMembers}
          picSuggestions={picSuggestions}
          lastSeenAt={lastSeenAt}
          onTaskClick={onTaskClick}
          onActionClick={onActionClick}
          onCreateAction={onCreateAction}
          onActionUpdate={onActionUpdate}
          onProjectUpdate={onProjectUpdate}
          onDecisionClick={onDecisionClick}
          handleStatusChange={handleStatusChange}
          handleAddUpdate={handleAddUpdate}
          handleRequestExtension={handleRequestExtension}
          handleActionDone={handleActionDone}
          handleStepDone={handleStepDone}
          showToast={showToast}
          onNavigateRaid={onNavigateRaid}
        />
      ) : (
        <>
      {urgentEmpty && (
        <div style={{ background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 10, padding: '16px 18px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 24 }}>🌤</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: TOK.ink }}>Nothing urgent today</div>
            <div style={{ fontSize: 12, color: TOK.muted, marginTop: 2 }}>
              No overdue tasks, no unread mentions, no pending action items, and no decisions to review.
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap', fontSize: 11.5, color: TOK.muted }}>
              {counts.owned > 0 && <span>📋 {counts.owned} tasks owned</span>}
              {myWork.tasksContributing.length > 0 && <span>🤝 {myWork.tasksContributing.length} contributing</span>}
              {myWork.credit.earned > 0 && <span>📊 {(Math.round(myWork.credit.earned * 10) / 10)} cp earned</span>}
            </div>
          </div>
        </div>
      )}

      {/* 🔴 Needs attention now */}
      <MyWorkSection
        icon="🔴" title="Needs attention now"
        count={myWork.needsAttention.length}
        defaultOpen={myWork.needsAttention.length > 0}>
        {myWork.needsAttention.length === 0 && (
          <div style={{ color: TOK.muted, fontSize: 12.5 }}>Nothing urgent right now.</div>
        )}
        {myWork.needsAttention.map((it, i) => {
          if (it.kind === 'overdue_task') {
            const days = (() => {
              const e = parseDate(it.task.end); if (!e) return 0;
              return Math.floor((Date.now() - e.getTime()) / 86400000);
            })();
            return (
              <div key={`na-${i}`} style={{ borderLeft: '3px solid ' + TOK.overdueFg, padding: '8px 12px', background: TOK.overdueBg + '40', marginBottom: 6, borderRadius: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: TOK.ink }}>
                  ⚠ {it.task.name}
                </div>
                <div style={{ fontSize: 11, color: TOK.muted, marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <MyWorkBreadcrumb project={it.project} program={it.program} workstream={it.workstream} />
                  <MyWorkDeadlineTypePill type={it.task.deadlineType} />
                  <span style={{ color: TOK.overdueFg, fontWeight: 500 }}>
                    was due {fmtDateShort(it.task.end)}{days > 0 ? ` · ${days} day${days === 1 ? '' : 's'} overdue` : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <Btn size="sm" variant="primary" onClick={() => onTaskClick(it.task.id, it.project.id)}>→ Open</Btn>
                </div>
              </div>
            );
          }
          if (it.kind === 'overdue_action') {
            const related = it.action.relatedTaskId ? findTaskInProject(it.project, it.action.relatedTaskId) : null;
            return (
              <div key={`na-${i}`} style={{ borderLeft: '3px solid ' + TOK.overdueFg, padding: '8px 12px', background: TOK.overdueBg + '40', marginBottom: 6, borderRadius: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: TOK.ink }}>
                  ⚠ <MentionedText text={it.action.title || '(untitled action)'} teamMembers={teamMembers} />
                </div>
                <div style={{ fontSize: 11, color: TOK.muted, marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <span>{it.project.name}</span>
                  {related && <span>· {related.program.name} › {related.workstream.name} › {related.task.name}</span>}
                  <span style={{ color: TOK.overdueFg, fontWeight: 500 }}>· was due {fmtDateShort(it.action.dueDate)}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <Btn size="sm" variant="primary" onClick={() => handleActionDone(it.action, it.project)}>✓ Mark done</Btn>
                  {onActionClick && <Btn size="sm" variant="ghost" onClick={() => onActionClick(it.project.id, it.action.id)}>→ Open</Btn>}
                </div>
              </div>
            );
          }
          if (it.kind === 'overdue_subtask') {
            const sub = it.subtask;
            const parent = it.parentAction;
            return (
              <div key={`na-${i}`} style={{ borderLeft: '3px solid ' + TOK.overdueFg, padding: '8px 12px', background: TOK.overdueBg + '40', marginBottom: 6, borderRadius: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: TOK.ink }}>
                  ⚠ Sub: <MentionedText text={sub.title || '(untitled sub-task)'} teamMembers={teamMembers} />
                </div>
                <div style={{ fontSize: 11, color: TOK.muted, marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <span>in "{parent.title}"</span>
                  <span>· {it.project.name}</span>
                  <span style={{ color: TOK.overdueFg, fontWeight: 500 }}>· parent was due {fmtDateShort(parent.dueDate)}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <Btn size="sm" variant="primary" onClick={() => {
                    const updatedParent = {
                      ...parent,
                      subtasks: (parent.subtasks || []).map((s) => s.id === sub.id ? { ...s, status: 'Done' } : s),
                    };
                    onActionUpdate(updatedParent, it.project.id);
                  }}>✓ Mark done</Btn>
                  {onActionClick && <Btn size="sm" variant="ghost" onClick={() => onActionClick(it.project.id, parent.id)}>→ Open parent</Btn>}
                </div>
              </div>
            );
          }
          if (it.kind === 'deadline_approval') {
            const req = it.request;
            return (
              <div key={`na-${i}`} style={{ borderLeft: '3px solid ' + TOK.inprogFg, padding: '8px 12px', background: TOK.inprogBg + '60', marginBottom: 6, borderRadius: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: TOK.ink }}>
                  ⏳ Approval pending: {req.requestedBy} wants to {req.action || 'change'} deadline on "{it.task.name}"
                </div>
                <div style={{ fontSize: 11.5, color: TOK.muted, marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <MyWorkBreadcrumb project={it.project} program={it.program} workstream={it.workstream} />
                  {req.newDate && <span>· new date: <span style={{ color: TOK.ink, fontWeight: 500 }}>{fmtDateShort(req.newDate)}</span>{typeof req.days === 'number' ? ` (${req.days >= 0 ? '+' : ''}${req.days}d)` : ''}</span>}
                </div>
                {req.reason && (
                  <div style={{ fontSize: 11.5, color: TOK.muted, marginTop: 3, fontStyle: 'italic' }}>
                    "{req.reason}"
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  {isOwner && onApproveDeadline && (
                    <Btn size="sm" variant="primary" onClick={() => onApproveDeadline(it.task.id, it.project.id)}>✓ Approve</Btn>
                  )}
                  {isOwner && onRejectDeadline && (
                    <Btn size="sm" onClick={() => onRejectDeadline(it.task.id, it.project.id)}>✕ Reject</Btn>
                  )}
                  <Btn size="sm" variant="ghost" onClick={() => onTaskClick(it.task.id, it.project.id)}>→ Open</Btn>
                </div>
              </div>
            );
          }
          return null;
        })}
      </MyWorkSection>

      {/* v30 RAID Phase 4 — RAID needs-attention + due-this-week + owned */}
      <MyRaidSection
        myRaid={myRaid}
        currentUser={author}
        teamMembers={teamMembers}
        onNavigateRaid={onNavigateRaid || (() => {})}
      />

      {/* ✅ Action items assigned to me */}
      <MyWorkSection
        icon="✅" title="Action items assigned to me"
        count={counts.actions}
        defaultOpen={myWork.actionItems.today.length > 0}
        headerRight={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {onCreateAction && (
              <Btn size="sm" variant="primary" onClick={() => onCreateAction(null, null)}>
                <Plus size={11} /> New action
              </Btn>
            )}
            <MyWorkSubTabs value={actionsTab} onChange={setActionsTab} tabs={[
              { id: 'today', label: 'Today', count: myWork.actionItems.today.length },
              { id: 'week', label: 'Week', count: myWork.actionItems.week.length },
              { id: 'later', label: 'Later', count: myWork.actionItems.later.length },
            ]} />
          </div>
        }>
        {myWork.actionItems[actionsTab].length === 0 ? (
          <div style={{ color: TOK.muted, fontSize: 12.5 }}>No action items in this bucket.</div>
        ) : myWork.actionItems[actionsTab].map((e, i) => {
          if (e.kind === 'mitigation') {
            return (
              <MitigationRowInline
                key={`mit-${actionsTab}-${e.mitigation.id || i}`}
                entry={e}
                author={author}
                teamMembers={teamMembers}
                picSuggestions={picSuggestions}
                onApplyMitigation={(nextProject) => onProjectUpdate(nextProject)}
                onNavigateRaid={onNavigateRaid}
                showToast={showToast}
              />
            );
          }
          if (e.kind === 'subtask') {
            const sub = e.subtask;
            const parent = e.parentAction;
            return (
              <SubtaskMyWorkRow
                key={`sub-${actionsTab}-${sub.id || i}`}
                subtask={sub}
                parentAction={parent}
                project={e.project}
                teamMembers={teamMembers}
                onMarkDone={() => {
                  const updatedParent = {
                    ...parent,
                    subtasks: (parent.subtasks || []).map((s) => s.id === sub.id ? { ...s, status: 'Done' } : s),
                  };
                  onActionUpdate(updatedParent, e.project.id);
                }}
                onOpenParent={() => onActionClick && onActionClick(e.project.id, parent.id)}
              />
            );
          }
          const a = e.action;
          const related = a.relatedTaskId ? findTaskInProject(e.project, a.relatedTaskId) : null;
          return (
            <ActionRowInline
              key={`a-${actionsTab}-${a.id || i}`}
              action={a}
              project={e.project}
              related={related}
              author={author}
              teamMembers={teamMembers}
              picSuggestions={picSuggestions}
              onChange={(patch) => onActionUpdate({ ...a, ...patch }, e.project.id)}
              onAddComment={(text, blocker) => onActionUpdate({
                ...a,
                updates: [
                  { id: uid('aupd'), timestamp: new Date().toISOString(), author, text, isBlocker: !!blocker },
                  ...(a.updates || []),
                ],
              }, e.project.id)}
              onMarkDone={() => handleActionDone(a, e.project)}
              onOpenDetails={onActionClick ? () => onActionClick(e.project.id, a.id) : null}
              onSubtasksChange={(newSubtasks) => onActionUpdate({ ...a, subtasks: newSubtasks }, e.project.id)}
              showToast={showToast}
            />
          );
        })}
      </MyWorkSection>

      {/* 💬 Mentions */}
      <MyWorkSection
        icon="💬" title="Mentions"
        count={myWork.allMentions.length}
        subtitle={myWork.unreadMentions.length > 0 ? `${myWork.unreadMentions.length} unread` : null}
        defaultOpen={myWork.unreadMentions.length > 0}>
        {myWork.allMentions.length === 0 && (
          <div style={{ color: TOK.muted, fontSize: 12.5 }}>No mentions yet.</div>
        )}
        {myWork.allMentions.slice(0, 12).map((m, i) => {
          const unread = m.ts && new Date(m.ts) > new Date(lastSeenAt || 0);
          const isAction = !!m.action;
          const name = isAction ? m.action.title : m.task.name;
          const kindLabel = isAction ? 'action' : 'task';
          const handleOpen = isAction
            ? () => onActionClick && onActionClick(m.project.id, m.action?.id)
            : () => onTaskClick(m.task.id, m.project.id);
          return (
            <div key={`m-${i}`} style={{
              padding: '8px 12px', marginBottom: 6, borderRadius: 6,
              background: unread ? TOK.mentionBg : TOK.bg,
              border: '1px solid ' + (unread ? TOK.mention + '30' : TOK.line),
            }}>
              <div style={{ fontSize: 11, color: TOK.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
                {unread && <span style={{ fontSize: 9, fontWeight: 600, color: TOK.mention, background: '#fff', padding: '1px 5px', borderRadius: 4 }}>UNREAD</span>}
                <span style={{ color: TOK.ink, fontWeight: 500 }}>{m.postAuthor || '—'}</span>
                <span>· {myWorkTimeAgo(m.ts)} ·</span>
                <span>in {kindLabel} "{name || '(untitled)'}"</span>
              </div>
              <div style={{ fontSize: 13, color: TOK.ink, marginTop: 4, lineHeight: 1.4 }}>
                <MentionedText text={m.text} teamMembers={teamMembers} />
              </div>
              <div style={{ marginTop: 6 }}>
                <Btn size="sm" variant="ghost" onClick={handleOpen}>→ Open {kindLabel}</Btn>
              </div>
            </div>
          );
        })}
      </MyWorkSection>

      {/* 📋 Tasks I own */}
      <MyWorkSection
        icon="📋" title="Tasks I own as Primary PIC"
        count={counts.owned}
        defaultOpen={myWork.tasksOwned.today.length > 0}
        headerRight={
          <MyWorkSubTabs value={ownedTab} onChange={setOwnedTab} tabs={[
            { id: 'today', label: 'Today', count: myWork.tasksOwned.today.length },
            { id: 'week', label: 'Week', count: myWork.tasksOwned.week.length },
            { id: 'later', label: 'Later', count: myWork.tasksOwned.later.length },
          ]} />
        }>
        {myWork.tasksOwned[ownedTab].length === 0 ? (
          <div style={{ color: TOK.muted, fontSize: 12.5 }}>No tasks in this bucket.</div>
        ) : myWork.tasksOwned[ownedTab].map((e, i) => (
          <TaskRowInline
            key={`own-${ownedTab}-${i}`}
            task={e.task} project={e.project} program={e.program} workstream={e.workstream}
            author={author} teamMembers={teamMembers}
            onStatusChange={(st) => handleStatusChange(e.task, e.project, st)}
            onAddUpdate={(text, blocker) => handleAddUpdate(e.task, e.project, text, blocker)}
            onRequestExtension={() => handleRequestExtension(e.task, e.project)}
            onOpenDetails={() => onTaskClick(e.task.id, e.project.id)}
            onAddAction={onCreateAction ? () => onCreateAction(e.project.id, e.task.id) : null}
            onMarkDone={() => handleStatusChange(e.task, e.project, 'Completed')}
            onStepDone={(action, subtask) => handleStepDone(action, subtask, e.project)}
          />
        ))}
      </MyWorkSection>

      {/* 🤝 Tasks I contribute to */}
      <MyWorkSection
        icon="🤝" title="Tasks I contribute to"
        count={myWork.tasksContributing.length}
        defaultOpen={myWork.tasksContributing.length > 0 && myWork.tasksContributing.length <= 6}>
        {myWork.tasksContributing.length === 0 && (
          <div style={{ color: TOK.muted, fontSize: 12.5 }}>You're not a contributor on any task yet.</div>
        )}
        {myWork.tasksContributing.map((e, i) => (
          <TaskRowInline
            key={`contrib-${i}`}
            task={e.task} project={e.project} program={e.program} workstream={e.workstream}
            author={author} teamMembers={teamMembers}
            onStatusChange={(st) => handleStatusChange(e.task, e.project, st)}
            onAddUpdate={(text, blocker) => handleAddUpdate(e.task, e.project, text, blocker)}
            onRequestExtension={() => handleRequestExtension(e.task, e.project)}
            onOpenDetails={() => onTaskClick(e.task.id, e.project.id)}
            onAddAction={onCreateAction ? () => onCreateAction(e.project.id, e.task.id) : null}
            onMarkDone={() => handleStatusChange(e.task, e.project, 'Completed')}
            onStepDone={(action, subtask) => handleStepDone(action, subtask, e.project)}
          />
        ))}
      </MyWorkSection>

      {/* 🤔 Decisions awaiting input */}
      <MyWorkSection
        icon="🤔" title="Decisions awaiting your input"
        count={myWork.decisions.length}
        defaultOpen={myWork.decisions.length > 0}>
        {myWork.decisions.length === 0 && (
          <div style={{ color: TOK.muted, fontSize: 12.5 }}>No decisions need your input.</div>
        )}
        {myWork.decisions.map((e, i) => {
          const d = e.decision;
          const reviewOverdue = d.expectedReviewDate && (d.followUpStatus || 'Open') !== 'Done' && parseDate(d.expectedReviewDate) < today();
          return (
            <div key={`d-${i}`} style={{ padding: '10px 12px', marginBottom: 6, border: '1px solid ' + TOK.line, borderRadius: 6, background: TOK.surface, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: TOK.ink, fontWeight: 500, marginBottom: 2 }}>
                  <MentionedText text={d.text || '(no decision text)'} teamMembers={teamMembers} />
                </div>
                <div style={{ fontSize: 11, color: TOK.muted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span>{e.project.name}</span>
                  <span>· decided by {(d.decidedBy || []).length} {(d.decidedBy || []).length === 1 ? 'person' : 'people'}</span>
                  {d.date && <span>· {fmtDateShort(d.date)}</span>}
                  {d.expectedReviewDate && <span style={{ color: reviewOverdue ? TOK.overdueFg : TOK.muted, fontWeight: reviewOverdue ? 500 : 400 }}>· review {fmtDateShort(d.expectedReviewDate)}{reviewOverdue ? ' ⚠' : ''}</span>}
                </div>
              </div>
              {/* Wave 2 R5 / W2-9: read-only unless the decision's stored program is mine (v2). */}
              <span onClick={(ev) => ev.stopPropagation()} style={{ display: 'inline-flex' }}>
                <StatusQuickPill
                  status={d.followUpStatus || 'Open'}
                  statuses={FOLLOWUP_STATUSES}
                  onChange={canEditDecision({ isOwner, isV2: !!e.project.__v2, roles: e.project.__v2?.roles || null, uid: me.uid, decision: d })
                    ? (st) => onDecisionUpdate && onDecisionUpdate({ ...d, followUpStatus: st }, e.project.id)
                    : null}
                />
              </span>
              {onDecisionClick && <Btn size="sm" variant="ghost" onClick={() => onDecisionClick(e.project.id, d.id)} title="Open in Decisions tab">→</Btn>}
            </div>
          );
        })}
      </MyWorkSection>

      {/* 📊 My credit (always collapsed by default) */}
      <MyWorkSection
        icon="📊" title={`My credit this year (${new Date().getFullYear()})`}
        defaultOpen={false}>
        {myWork.credit.projected === 0 ? (
          <div style={{ color: TOK.muted, fontSize: 12.5 }}>
            No credit allocation set up for projects you're in.
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ fontSize: 13 }}>
                <span style={{ color: TOK.muted }}>Earned:</span> <span style={{ fontWeight: 600, color: TOK.ink }}>{(Math.round(myWork.credit.earned * 10) / 10)} cp</span>
              </div>
              <div style={{ fontSize: 13 }}>
                <span style={{ color: TOK.muted }}>Projected:</span> <span style={{ fontWeight: 600, color: TOK.ink }}>{(Math.round(myWork.credit.projected * 10) / 10)} cp</span>
              </div>
              <div style={{ fontSize: 13, color: TOK.accent, fontWeight: 600 }}>
                {Math.round(myWork.credit.pct)}%
              </div>
            </div>
            <div style={{ height: 6, background: TOK.bg, borderRadius: 999, overflow: 'hidden', marginBottom: 14 }}>
              <div style={{ height: '100%', width: `${Math.min(100, myWork.credit.pct)}%`, background: TOK.accent }} />
            </div>
            <div style={{ fontSize: 11.5, color: TOK.muted, marginBottom: 6, fontWeight: 500 }}>By project</div>
            {myWork.credit.perProject.map((p, i) => {
              const pct = p.projected > 0 ? (p.earned / p.projected) * 100 : 0;
              return (
                <div key={`cp-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, padding: '4px 0' }}>
                  <span style={{ color: TOK.ink, minWidth: 100, fontWeight: 500 }}>{p.project.name}</span>
                  <span style={{ color: TOK.muted }}>
                    {(Math.round(p.earned * 10) / 10)} / {(Math.round(p.projected * 10) / 10)} cp
                  </span>
                  <span style={{ color: TOK.muted }}>({Math.round(pct)}%)</span>
                </div>
              );
            })}
          </div>
        )}
      </MyWorkSection>
        </>
      )}
    </div>
  );
}

function CreditReportView({ projects, isOwner }) {
  // ─── ALL hooks declared BEFORE any return (Rules of Hooks) ───
  const dirIndex = useContext(DirectoryIndexContext);
  const thisYear = new Date().getFullYear();
  const allYears = useMemo(() => {
    const years = new Set();
    for (const proj of Object.values(projects || {})) {
      if (typeof proj.creditYear === 'number') years.add(proj.creditYear);
    }
    if (years.size === 0) years.add(thisYear);
    years.add(thisYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [projects, thisYear]);

  const [selectedYear, setSelectedYear] = useState(allYears[0] || thisYear);
  const [sortBy, setSortBy] = useState('projected');
  const [selectedPic, setSelectedPic] = useState(null);
  useEffect(() => { setSelectedPic(null); }, [dirIndex]); // P1: ids change when the directory loads

  const report = useMemo(() => computeWorkspaceCredits(projects, selectedYear, dirIndex), [projects, selectedYear, dirIndex]);

  const picRows = useMemo(() => {
    const rows = Array.from(report.perPic.entries()).map(([id, val]) => ({
      id, name: val.name,
      earned: val.earned,
      projected: val.projected,
      pct: report.totalCp > 0 ? (val.projected / report.totalCp) * 100 : 0,
      pctEarned: val.projected > 0 ? (val.earned / val.projected) * 100 : 0,
    }));
    if (sortBy === 'name') rows.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'earned') rows.sort((a, b) => b.earned - a.earned);
    else if (sortBy === 'pct') rows.sort((a, b) => b.pct - a.pct);
    else rows.sort((a, b) => b.projected - a.projected);
    return rows;
  }, [report, sortBy]);

  const drilldown = useMemo(() => {
    if (!selectedPic) return null;
    const byProject = new Map();
    for (const [projId, projData] of report.perProject.entries()) {
      const myEntries = projData.breakdown.filter((b) => b.picId === selectedPic);
      if (myEntries.length === 0) continue;
      const proj = projData.project;
      const projTotalProjected = myEntries.reduce((s, e) => s + e.projected, 0);
      const projTotalActual = myEntries.reduce((s, e) => s + e.actual, 0);
      const byProgram = new Map();
      for (const e of myEntries) {
        const pgKey = e.programId || '__lead__';
        if (!byProgram.has(pgKey)) {
          byProgram.set(pgKey, { name: e.programName, entries: [], projected: 0, actual: 0, isLead: e.isProjectLead });
        }
        const pg = byProgram.get(pgKey);
        pg.entries.push(e);
        pg.projected += e.projected;
        pg.actual += e.actual;
      }
      byProject.set(projId, {
        project: proj,
        projected: projTotalProjected,
        actual: projTotalActual,
        programs: Array.from(byProgram.values()).sort((a, b) => b.projected - a.projected),
      });
    }
    return Array.from(byProject.values()).sort((a, b) => b.projected - a.projected);
  }, [selectedPic, report]);

  const summary = useMemo(() => {
    let projectCount = 0;
    let lockedCount = 0;
    let totalEarned = 0;
    let totalProjected = 0;
    for (const [, pd] of report.perProject.entries()) {
      projectCount++;
      if (pd.project.weightsLocked) lockedCount++;
    }
    for (const [, val] of report.perPic.entries()) {
      totalEarned += val.earned;
      totalProjected += val.projected;
    }
    const overallEarnedPct = totalProjected > 0 ? (totalEarned / totalProjected) * 100 : 0;
    return { projectCount, lockedCount, totalEarned, totalProjected, overallEarnedPct };
  }, [report]);

  // Owner gate AFTER all hooks
  if (!isOwner) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: TOK.muted, fontSize: 13 }}>
        Credit report is workspace-owner only.
      </div>
    );
  }

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const picSheet = picRows.map((r) => ({
      'PIC': sanitizeCell(r.name),
      'Earned (cp)': Math.round(r.earned * 100) / 100,
      'Projected (cp)': Math.round(r.projected * 100) / 100,
      '% of total': Math.round(r.pct * 10) / 10 + '%',
      '% earned (vs projected)': Math.round(r.pctEarned * 10) / 10 + '%',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(picSheet), 'PIC summary');

    const fullRows = [];
    for (const [, pd] of report.perProject.entries()) {
      for (const b of pd.breakdown) {
        fullRows.push({
          'Project': sanitizeCell(pd.project.name),
          'Program': sanitizeCell(b.programName),
          'Workstream': sanitizeCell(b.workstreamName || ''),
          'Task': sanitizeCell(b.taskName),
          'Status': b.taskStatus || (b.isProjectLead ? 'Project Lead' : ''),
          'PIC': sanitizeCell(b.picName),
          'Share (%)': Math.round(b.sharePct * 10) / 10,
          'Task pool (cp)': Math.round((b.taskCp || 0) * 100) / 100,
          'Projected (cp)': Math.round(b.projected * 100) / 100,
          'Earned (cp)': Math.round(b.actual * 100) / 100,
          'Credited?': b.credited ? 'Yes' : 'No',
        });
      }
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fullRows), 'Full breakdown');

    const projRows = [];
    for (const [, pd] of report.perProject.entries()) {
      projRows.push({
        'Project': sanitizeCell(pd.project.name),
        'Year': pd.project.creditYear || '',
        'Total pool (cp)': pd.totalCp,
        'Project Lead': sanitizeCell(pd.project.projectLead || '—'),
        'Lead share (%)': pd.leadSharePct,
        'Lead pool (cp)': Math.round(pd.leadCp * 100) / 100,
        'Locked?': pd.project.weightsLocked ? 'Yes' : 'No',
      });
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(projRows), 'Projects');

    XLSX.writeFile(wb, `Credit_Report_${selectedYear}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 20, fontFamily: FONT_STACK, background: TOK.bg }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
              Credit Report <span style={{ fontSize: 11, color: TOK.accent, fontWeight: 500, marginLeft: 6 }}>OWNER ONLY</span>
            </h2>
            <div style={{ fontSize: 12, color: TOK.muted, marginTop: 4, lineHeight: 1.5 }}>
              Year-end performance attribution. <strong>Earned</strong> = credit from Completed tasks (real). <strong>Projected</strong> = credit if all tasks complete. Effort-based: only Completed tasks earn credit, except Project Lead (proportional to overall completion).
            </div>
          </div>
          <select
            value={selectedYear}
            onChange={(e) => { setSelectedYear(Number(e.target.value)); setSelectedPic(null); }}
            style={{ fontFamily: FONT_STACK, fontSize: 13, padding: '8px 12px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, background: TOK.surface, color: TOK.ink, outline: 'none' }}>
            {allYears.map((y) => <option key={y} value={y}>Year {y}</option>)}
          </select>
          <Btn variant="primary" onClick={exportExcel} disabled={picRows.length === 0}>
            <Download size={12} /> Export Excel
          </Btn>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
          <SummaryCard label="Total credit pool" value={`${Math.round(summary.totalProjected * 10) / 10} cp`} sub={`${summary.projectCount} project${summary.projectCount === 1 ? '' : 's'}`} />
          <SummaryCard label="Earned so far" value={`${Math.round(summary.totalEarned * 10) / 10} cp`} sub={`${Math.round(summary.overallEarnedPct * 10) / 10}% of projected`} accent="#356512" />
          <SummaryCard label="Locked projects" value={`${summary.lockedCount} / ${summary.projectCount}`} sub={summary.lockedCount === summary.projectCount && summary.projectCount > 0 ? 'All locked' : 'Partial'} accent={summary.lockedCount === summary.projectCount && summary.projectCount > 0 ? '#A32D2D' : TOK.muted} />
          <SummaryCard label="Distinct PICs" value={String(picRows.length)} sub="With credit allocation" />
        </div>

        {picRows.length === 0 ? (
          <div style={{ background: TOK.surface, padding: 40, borderRadius: 8, textAlign: 'center', border: '1px solid ' + TOK.line }}>
            <div style={{ fontSize: 32 }}>📊</div>
            <div style={{ fontSize: 14, color: TOK.muted, marginTop: 8 }}>
              No credit allocation for year {selectedYear} yet.
            </div>
            <div style={{ fontSize: 12, color: TOK.subtle, marginTop: 6, maxWidth: 400, margin: '6px auto 0', lineHeight: 1.5 }}>
              Set <strong>Credit points</strong>, <strong>Year</strong>, and weights in Project Settings + Outline view. PICs with credit shares on tasks will appear here.
            </div>
          </div>
        ) : (
          <>
            {/* Per-PIC table */}
            <div style={{ background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 0.5fr', gap: 10,
                padding: '10px 14px', background: TOK.bg, fontSize: 11, fontWeight: 500,
                color: TOK.muted, letterSpacing: 0.3, textTransform: 'uppercase', borderBottom: '1px solid ' + TOK.line,
              }}>
                <SortableHeader label="PIC" field="name" sortBy={sortBy} onSort={setSortBy} align="left" />
                <SortableHeader label="Earned (cp)" field="earned" sortBy={sortBy} onSort={setSortBy} align="right" />
                <SortableHeader label="Projected (cp)" field="projected" sortBy={sortBy} onSort={setSortBy} align="right" />
                <SortableHeader label="% of total" field="pct" sortBy={sortBy} onSort={setSortBy} align="right" />
                <div style={{ textAlign: 'right' }}>% earned</div>
                <div></div>
              </div>
              {picRows.map((r) => (
                <div key={r.id}
                  onClick={() => setSelectedPic(selectedPic === r.id ? null : r.id)}
                  style={{
                    display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 0.5fr', gap: 10,
                    padding: '12px 14px', borderBottom: '1px solid ' + TOK.line,
                    cursor: 'pointer', alignItems: 'center',
                    background: selectedPic === r.id ? '#E6F1FB' : 'transparent',
                    transition: 'background .12s',
                  }}
                  onMouseEnter={(e) => { if (selectedPic !== r.id) e.currentTarget.style.background = TOK.bg; }}
                  onMouseLeave={(e) => { if (selectedPic !== r.id) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div>
                  <div style={{ textAlign: 'right', fontSize: 13, color: '#356512', fontWeight: 500 }}>
                    {Math.round(r.earned * 100) / 100}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 13, color: TOK.ink }}>
                    {Math.round(r.projected * 100) / 100}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 13, color: TOK.muted }}>
                    {Math.round(r.pct * 10) / 10}%
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-block', width: 60, height: 5, background: 'rgba(0,0,0,0.08)', borderRadius: 999, overflow: 'hidden', verticalAlign: 'middle' }}>
                      <div style={{ width: `${Math.min(100, r.pctEarned)}%`, height: '100%', background: '#356512' }} />
                    </div>
                    <span style={{ fontSize: 11, color: TOK.muted, marginLeft: 6 }}>{Math.round(r.pctEarned)}%</span>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 11, color: TOK.subtle }}>
                    {selectedPic === r.id ? '▼' : '▶'}
                  </div>
                </div>
              ))}
            </div>

            {/* Drill-down panel */}
            {selectedPic && drilldown && drilldown.length > 0 && (
              <div style={{ background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 8, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>
                    {picRows.find((r) => r.id === selectedPic)?.name ?? selectedPic} — Breakdown
                  </h3>
                  <span style={{ fontSize: 12, color: TOK.muted }}>
                    ({Math.round((picRows.find((r) => r.id === selectedPic)?.earned || 0) * 10) / 10} earned · {Math.round((picRows.find((r) => r.id === selectedPic)?.projected || 0) * 10) / 10} projected)
                  </span>
                  <span style={{ flex: 1 }} />
                  <Btn size="sm" onClick={() => setSelectedPic(null)}>Close</Btn>
                </div>
                {drilldown.map((projData, pi) => (
                  <div key={pi} style={{ marginBottom: 14, paddingBottom: 12, borderBottom: pi < drilldown.length - 1 ? '1px solid ' + TOK.line : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{projData.project.name}</span>
                      <span style={{ fontSize: 11, color: TOK.muted }}>Year {projData.project.creditYear || '—'}</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 12, color: '#356512', fontWeight: 500 }}>
                        {Math.round(projData.actual * 100) / 100} cp earned
                      </span>
                      <span style={{ fontSize: 11, color: TOK.muted }}>
                        / {Math.round(projData.projected * 100) / 100} projected
                      </span>
                    </div>
                    {projData.programs.map((pg, pgi) => (
                      <div key={pgi} style={{ marginLeft: 16, marginBottom: 8, paddingLeft: 12, borderLeft: '2px solid ' + (pg.isLead ? '#E6B800' : TOK.line) }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 12 }}>
                          <span style={{ fontWeight: 500, color: pg.isLead ? '#856100' : TOK.programFg }}>
                            {pg.isLead ? '👑 ' : ''}{pg.name}
                          </span>
                          <span style={{ flex: 1 }} />
                          <span style={{ color: '#356512', fontWeight: 500 }}>
                            {Math.round(pg.actual * 100) / 100} / {Math.round(pg.projected * 100) / 100} cp
                          </span>
                        </div>
                        {!pg.isLead && (
                          <div style={{ marginLeft: 12, fontSize: 11, color: TOK.muted }}>
                            {pg.entries.slice(0, 20).map((e, ei) => (
                              <div key={ei} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                                <span style={{ color: TOK.subtle, minWidth: 70 }}>{e.workstreamName}</span>
                                <span style={{ flex: 1, color: e.credited ? TOK.ink : TOK.muted, textDecoration: e.taskStatus === 'Dropped' ? 'line-through' : 'none' }}>
                                  {e.credited ? '✓ ' : '○ '}{e.taskName}
                                  {' '}<span style={{ fontSize: 10, color: TOK.subtle }}>({Math.round(e.sharePct * 10) / 10}%)</span>
                                </span>
                                <span style={{ color: e.credited ? '#356512' : TOK.subtle, fontVariantNumeric: 'tabular-nums' }}>
                                  {Math.round(e.projected * 100) / 100} cp
                                </span>
                              </div>
                            ))}
                            {pg.entries.length > 20 && (
                              <div style={{ fontSize: 10, color: TOK.subtle, fontStyle: 'italic', marginTop: 4 }}>
                                +{pg.entries.length - 20} more tasks (see Excel export)
                              </div>
                            )}
                          </div>
                        )}
                        {pg.isLead && (
                          <div style={{ marginLeft: 12, fontSize: 11, color: TOK.subtle, fontStyle: 'italic' }}>
                            Awarded proportional to overall project completion (effort tied to lead role oversight).
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div style={{ marginTop: 14, fontSize: 11, color: TOK.subtle, lineHeight: 1.6 }}>
          <strong>Read this report:</strong> Sort by any column. Click a PIC row to drill down by project → program → tasks. Excel export contains 3 sheets: PIC summary, full task breakdown, and project metadata (lock status, lead info). Use export for year-end calibration discussions and HR review.
        </div>
      </div>
    </div>
  );
}

/* ═════════ BRIEFING PACK ═════════ */

function generateBriefingMarkdown({ projects, daysBack = 7, ownerName = null }) {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - daysBack);
  from.setHours(0, 0, 0, 0);

  const inWindow = (ts) => {
    if (!ts) return false;
    const d = new Date(ts);
    return !isNaN(d) && d >= from && d <= now;
  };
  const inWindowDate = (dateStr) => {
    if (!dateStr) return false;
    const d = parseDate(dateStr);
    return d && d >= from && d <= now;
  };

  const lines = [];
  const headerDate = `${fmtDate(from)} → ${fmtDate(now)}`;
  lines.push(`# 📋 Weekly Briefing — ${headerDate}`);
  lines.push('');
  if (ownerName) {
    lines.push(`**Owner:** ${ownerName}`);
    lines.push('');
  }

  const newDecisions = [];
  const decayedDecisions = [];
  const newActions = [];
  const completedActions = [];
  const newBlockers = [];
  const resolvedBlockers = [];
  const overdueTasks = [];
  const completedTasks = [];

  for (const project of Object.values(projects)) {
    for (const d of (project.decisions || [])) {
      const decay = getDecisionDecay(d, now);
      if (decay.decayed) decayedDecisions.push({ project, decision: d, decay });
      if (inWindowDate(d.date)) newDecisions.push({ project, decision: d });
    }
    for (const a of (project.actionItems || [])) {
      if (inWindow(a.timestamp)) newActions.push({ project, action: a });
      if (a.status === 'Done' && inWindow(a.completedAt || a.timestamp)) completedActions.push({ project, action: a });
    }
    for (const pg of project.programs || []) {
      for (const ws of pg.workstreams || []) {
        for (const t of ws.tasks || []) {
          for (const u of (t.updates || [])) {
            if (u.isBlocker && inWindow(u.timestamp)) newBlockers.push({ project, program: pg, workstream: ws, task: t, update: u });
            if (u.isBlocker && u.resolvedAt && inWindow(u.resolvedAt)) resolvedBlockers.push({ project, program: pg, workstream: ws, task: t, update: u });
          }
          if (isOverdueTask(t, now)) {
            const lateDays = daysBetween(t.end, now);
            if (lateDays >= 0) overdueTasks.push({ project, program: pg, workstream: ws, task: t, lateDays });
          }
          if (t.status === 'Completed' && t.end && inWindowDate(t.end)) {
            completedTasks.push({ project, program: pg, workstream: ws, task: t });
          }
        }
      }
    }
  }

  lines.push(`## 📊 At a glance`);
  lines.push('');
  lines.push(`- **${newDecisions.length}** new decision${newDecisions.length === 1 ? '' : 's'} logged this week`);
  lines.push(`- **${newActions.length}** new action item${newActions.length === 1 ? '' : 's'} created · **${completedActions.length}** completed`);
  lines.push(`- **${newBlockers.length}** new blocker${newBlockers.length === 1 ? '' : 's'} raised · **${resolvedBlockers.length}** resolved`);
  if (completedTasks.length > 0) lines.push(`- ✅ **${completedTasks.length}** milestone${completedTasks.length === 1 ? '' : 's'} completed`);
  if (overdueTasks.length > 0) lines.push(`- 🔴 **${overdueTasks.length}** milestone${overdueTasks.length === 1 ? '' : 's'} overdue right now`);
  if (decayedDecisions.length > 0) lines.push(`- 🕐 **${decayedDecisions.length}** decision${decayedDecisions.length === 1 ? '' : 's'} need review (past expected review date)`);
  lines.push('');

  const talkingPoints = [];
  if (overdueTasks.length > 0) {
    const top = overdueTasks.sort((a, b) => b.lateDays - a.lateDays).slice(0, 3);
    for (const o of top) talkingPoints.push(`**${o.task.name}** is ${o.lateDays}d overdue (${o.project.name})`);
  }
  if (decayedDecisions.length > 0) {
    talkingPoints.push(`Review ${decayedDecisions.length} decision${decayedDecisions.length === 1 ? '' : 's'} past expected review date`);
  }
  const unresolvedNew = newBlockers.filter((b) => !b.update.resolvedAt);
  if (unresolvedNew.length > 0) {
    talkingPoints.push(`${unresolvedNew.length} blocker${unresolvedNew.length === 1 ? '' : 's'} still unresolved`);
  }
  if (newDecisions.length === 0 && newActions.length === 0) {
    talkingPoints.push(`Quiet week — confirm each program is making progress`);
  }
  if (talkingPoints.length > 0) {
    lines.push(`## 💬 Suggested talking points`);
    lines.push('');
    for (const tp of talkingPoints) lines.push(`- ${tp}`);
    lines.push('');
  }

  if (overdueTasks.length > 0) {
    lines.push(`## 🔴 Overdue right now`);
    lines.push('');
    lines.push(`| Milestone | Program | PIC | Days late |`);
    lines.push(`|---|---|---|---|`);
    overdueTasks.sort((a, b) => b.lateDays - a.lateDays).slice(0, 10).forEach((o) => {
      lines.push(`| ${o.task.name} | ${o.program.name} | ${o.task.pic || '—'} | ${o.lateDays}d |`);
    });
    if (overdueTasks.length > 10) lines.push(`| _… and ${overdueTasks.length - 10} more_ | | | |`);
    lines.push('');
  }

  if (decayedDecisions.length > 0) {
    lines.push(`## 🕐 Decisions need review`);
    lines.push('');
    lines.push(`| Decision | Project | Days overdue | Decided by |`);
    lines.push(`|---|---|---|---|`);
    decayedDecisions.sort((a, b) => b.decay.daysOverdue - a.decay.daysOverdue).slice(0, 10).forEach((d) => {
      lines.push(`| ${(d.decision.text || '').slice(0, 80)} | ${d.project.name} | ${d.decay.daysOverdue}d | ${(d.decision.decidedBy || []).join(', ')} |`);
    });
    lines.push('');
  }

  if (newDecisions.length > 0) {
    lines.push(`## 📋 New decisions this week`);
    lines.push('');
    for (const { project, decision } of newDecisions) {
      lines.push(`- **${decision.text}** _(${project.name})_`);
      const meta = [];
      if (decision.decidedBy && decision.decidedBy.length) meta.push(`by ${decision.decidedBy.join(', ')}`);
      if (decision.meetingRef) meta.push(decision.meetingRef);
      if (meta.length) lines.push(`  - ${meta.join(' · ')}`);
    }
    lines.push('');
  }

  const activeBlockers = newBlockers.filter((b) => !b.update.resolvedAt);
  if (activeBlockers.length > 0) {
    lines.push(`## 🚩 Active blockers`);
    lines.push('');
    for (const b of activeBlockers) {
      lines.push(`- **${b.task.name}** (${b.project.name}): ${b.update.text || ''}`);
      lines.push(`  - Raised by ${b.update.author} on ${fmtDateTime(b.update.timestamp)}`);
    }
    lines.push('');
  }

  if (resolvedBlockers.length > 0) {
    lines.push(`## ✓ Blockers resolved this week`);
    lines.push('');
    for (const b of resolvedBlockers) {
      lines.push(`- ${b.task.name} (${b.project.name}) — resolved by ${b.update.resolvedBy}`);
    }
    lines.push('');
  }

  if (completedTasks.length > 0 || completedActions.length > 0) {
    lines.push(`## ✅ Completed this week`);
    lines.push('');
    for (const c of completedTasks) lines.push(`- 🎯 ${c.task.name} (${c.project.name})`);
    for (const c of completedActions) lines.push(`- ✓ ${c.action.title} (${c.project.name})`);
    lines.push('');
  }

  lines.push(`---`);
  lines.push('');
  lines.push(`_Generated ${fmtDateTime(now)} from AF Master Project Tracker._`);

  return lines.join('\n');
}

function generateBriefingHtml({ projects, daysBack = 7, ownerName = null }) {
  const FONT = `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;`;
  const cell = `border: 1px solid #e5e3dc; padding: 8px 10px; vertical-align: top;`;
  const cellHead = `${cell} background: #f7f5ef; font-weight: 600; text-align: left;`;

  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - daysBack);
  from.setHours(0, 0, 0, 0);

  const inWindow = (ts) => {
    if (!ts) return false;
    const d = new Date(ts);
    return !isNaN(d) && d >= from && d <= now;
  };
  const inWindowDate = (dateStr) => {
    if (!dateStr) return false;
    const d = parseDate(dateStr);
    return d && d >= from && d <= now;
  };

  const newDecisions = [];
  const decayedDecisions = [];
  const newActions = [];
  const completedActions = [];
  const newBlockers = [];
  const resolvedBlockers = [];
  const overdueTasks = [];
  const completedTasks = [];

  for (const project of Object.values(projects)) {
    for (const d of (project.decisions || [])) {
      const decay = getDecisionDecay(d, now);
      if (decay.decayed) decayedDecisions.push({ project, decision: d, decay });
      if (inWindowDate(d.date)) newDecisions.push({ project, decision: d });
    }
    for (const a of (project.actionItems || [])) {
      if (inWindow(a.timestamp)) newActions.push({ project, action: a });
      if (a.status === 'Done' && inWindow(a.completedAt || a.timestamp)) completedActions.push({ project, action: a });
    }
    for (const pg of project.programs || []) {
      for (const ws of pg.workstreams || []) {
        for (const t of ws.tasks || []) {
          for (const u of (t.updates || [])) {
            if (u.isBlocker && inWindow(u.timestamp)) newBlockers.push({ project, program: pg, workstream: ws, task: t, update: u });
            if (u.isBlocker && u.resolvedAt && inWindow(u.resolvedAt)) resolvedBlockers.push({ project, program: pg, workstream: ws, task: t, update: u });
          }
          if (isOverdueTask(t, now)) {
            const lateDays = daysBetween(t.end, now);
            if (lateDays >= 0) overdueTasks.push({ project, program: pg, workstream: ws, task: t, lateDays });
          }
          if (t.status === 'Completed' && t.end && inWindowDate(t.end)) {
            completedTasks.push({ project, program: pg, workstream: ws, task: t });
          }
        }
      }
    }
  }

  const parts = [];
  const headerDate = `${fmtDate(from)} → ${fmtDate(now)}`;
  parts.push(`<div style="${FONT} font-size: 14px; line-height: 1.55; color: #1a1a19; max-width: 900px;">`);
  parts.push(`<h1 style="font-size: 22px; font-weight: 600; margin: 0 0 8px;">📋 Weekly Briefing — ${escapeHtml(headerDate)}</h1>`);
  if (ownerName) {
    parts.push(`<p style="margin: 0 0 16px; color: #6e6c66;"><strong>Owner:</strong> ${escapeHtml(ownerName)}</p>`);
  }

  parts.push(`<h2 style="font-size: 16px; font-weight: 600; margin: 24px 0 8px;">📊 At a glance</h2>`);
  parts.push(`<ul style="margin: 0 0 16px; padding-left: 22px;">`);
  parts.push(`<li><strong>${newDecisions.length}</strong> new decision${newDecisions.length === 1 ? '' : 's'} logged this week</li>`);
  parts.push(`<li><strong>${newActions.length}</strong> new action${newActions.length === 1 ? '' : 's'} created · <strong>${completedActions.length}</strong> completed</li>`);
  parts.push(`<li><strong>${newBlockers.length}</strong> new blocker${newBlockers.length === 1 ? '' : 's'} raised · <strong>${resolvedBlockers.length}</strong> resolved</li>`);
  if (completedTasks.length > 0) parts.push(`<li>✅ <strong>${completedTasks.length}</strong> milestone${completedTasks.length === 1 ? '' : 's'} completed</li>`);
  if (overdueTasks.length > 0) parts.push(`<li>🔴 <strong>${overdueTasks.length}</strong> milestone${overdueTasks.length === 1 ? '' : 's'} overdue right now</li>`);
  if (decayedDecisions.length > 0) parts.push(`<li>🕐 <strong>${decayedDecisions.length}</strong> decision${decayedDecisions.length === 1 ? '' : 's'} need review</li>`);
  parts.push(`</ul>`);

  const talkingPoints = [];
  if (overdueTasks.length > 0) {
    const top = overdueTasks.sort((a, b) => b.lateDays - a.lateDays).slice(0, 3);
    for (const o of top) talkingPoints.push(`<strong>${escapeHtml(o.task.name)}</strong> is ${o.lateDays}d overdue (${escapeHtml(o.project.name)})`);
  }
  if (decayedDecisions.length > 0) talkingPoints.push(`Review ${decayedDecisions.length} decision${decayedDecisions.length === 1 ? '' : 's'} past expected review date`);
  const unresolvedNew = newBlockers.filter((b) => !b.update.resolvedAt);
  if (unresolvedNew.length > 0) talkingPoints.push(`${unresolvedNew.length} blocker${unresolvedNew.length === 1 ? '' : 's'} still unresolved`);
  if (newDecisions.length === 0 && newActions.length === 0) talkingPoints.push(`Quiet week — confirm each program is making progress`);

  if (talkingPoints.length > 0) {
    parts.push(`<h2 style="font-size: 16px; font-weight: 600; margin: 24px 0 8px;">💬 Suggested talking points</h2>`);
    parts.push(`<ul style="margin: 0 0 16px; padding-left: 22px;">`);
    for (const tp of talkingPoints) parts.push(`<li>${tp}</li>`);
    parts.push(`</ul>`);
  }

  if (overdueTasks.length > 0) {
    parts.push(`<h2 style="font-size: 16px; font-weight: 600; margin: 24px 0 8px;">🔴 Overdue right now</h2>`);
    parts.push(`<table style="border-collapse: collapse; width: 100%; margin: 0 0 16px; font-size: 13px; ${FONT}">`);
    parts.push(`<thead><tr><th style="${cellHead}">Milestone</th><th style="${cellHead}">Program</th><th style="${cellHead}">PIC</th><th style="${cellHead}">Days late</th></tr></thead><tbody>`);
    overdueTasks.sort((a, b) => b.lateDays - a.lateDays).slice(0, 10).forEach((o) => {
      parts.push(`<tr><td style="${cell}">${escapeHtml(o.task.name)}</td><td style="${cell}">${escapeHtml(o.program.name)}</td><td style="${cell}">${escapeHtml(o.task.pic || '—')}</td><td style="${cell} color: #A32D2D; font-weight: 500;">${o.lateDays}d</td></tr>`);
    });
    parts.push(`</tbody></table>`);
  }

  if (decayedDecisions.length > 0) {
    parts.push(`<h2 style="font-size: 16px; font-weight: 600; margin: 24px 0 8px;">🕐 Decisions need review</h2>`);
    parts.push(`<table style="border-collapse: collapse; width: 100%; margin: 0 0 16px; font-size: 13px; ${FONT}">`);
    parts.push(`<thead><tr><th style="${cellHead}">Decision</th><th style="${cellHead}">Project</th><th style="${cellHead}">Days overdue</th><th style="${cellHead}">Decided by</th></tr></thead><tbody>`);
    decayedDecisions.sort((a, b) => b.decay.daysOverdue - a.decay.daysOverdue).slice(0, 10).forEach((d) => {
      parts.push(`<tr><td style="${cell}">${escapeHtml((d.decision.text || '').slice(0, 80))}</td><td style="${cell}">${escapeHtml(d.project.name)}</td><td style="${cell} color: #A8660C; font-weight: 500;">${d.decay.daysOverdue}d</td><td style="${cell}">${escapeHtml((d.decision.decidedBy || []).join(', '))}</td></tr>`);
    });
    parts.push(`</tbody></table>`);
  }

  if (newDecisions.length > 0) {
    parts.push(`<h2 style="font-size: 16px; font-weight: 600; margin: 24px 0 8px;">📋 New decisions this week</h2>`);
    parts.push(`<ul style="margin: 0 0 16px; padding-left: 22px;">`);
    for (const { project, decision } of newDecisions) {
      parts.push(`<li><strong>${escapeHtml(decision.text)}</strong> <em style="color: #6e6c66;">(${escapeHtml(project.name)})</em>`);
      if ((decision.decidedBy || []).length || decision.meetingRef) {
        parts.push(`<div style="font-size: 12px; color: #6e6c66; margin-top: 2px;">${escapeHtml((decision.decidedBy || []).join(', '))}${decision.meetingRef ? ' · ' + escapeHtml(decision.meetingRef) : ''}</div>`);
      }
      parts.push(`</li>`);
    }
    parts.push(`</ul>`);
  }

  const activeB = newBlockers.filter((b) => !b.update.resolvedAt);
  if (activeB.length > 0) {
    parts.push(`<h2 style="font-size: 16px; font-weight: 600; margin: 24px 0 8px;">🚩 Active blockers</h2>`);
    parts.push(`<ul style="margin: 0 0 16px; padding-left: 22px;">`);
    for (const b of activeB) {
      parts.push(`<li><strong>${escapeHtml(b.task.name)}</strong> <em style="color: #6e6c66;">(${escapeHtml(b.project.name)})</em>: ${escapeHtml(b.update.text || '')}<div style="font-size: 12px; color: #95938c; margin-top: 2px;">Raised by ${escapeHtml(b.update.author)} on ${escapeHtml(fmtDateTime(b.update.timestamp))}</div></li>`);
    }
    parts.push(`</ul>`);
  }

  if (resolvedBlockers.length > 0) {
    parts.push(`<h2 style="font-size: 16px; font-weight: 600; margin: 24px 0 8px;">✓ Blockers resolved this week</h2>`);
    parts.push(`<ul style="margin: 0 0 16px; padding-left: 22px;">`);
    for (const b of resolvedBlockers) {
      parts.push(`<li>${escapeHtml(b.task.name)} <em style="color: #6e6c66;">(${escapeHtml(b.project.name)})</em> — resolved by ${escapeHtml(b.update.resolvedBy)}</li>`);
    }
    parts.push(`</ul>`);
  }

  if (completedTasks.length > 0 || completedActions.length > 0) {
    parts.push(`<h2 style="font-size: 16px; font-weight: 600; margin: 24px 0 8px;">✅ Completed this week</h2>`);
    parts.push(`<ul style="margin: 0 0 16px; padding-left: 22px;">`);
    for (const c of completedTasks) parts.push(`<li>🎯 ${escapeHtml(c.task.name)} <em style="color: #6e6c66;">(${escapeHtml(c.project.name)})</em></li>`);
    for (const c of completedActions) parts.push(`<li>✓ ${escapeHtml(c.action.title)} <em style="color: #6e6c66;">(${escapeHtml(c.project.name)})</em></li>`);
    parts.push(`</ul>`);
  }

  parts.push(`<hr style="border: none; border-top: 1px solid #e5e3dc; margin: 24px 0;" />`);
  parts.push(`<p style="font-size: 11px; color: #95938c; font-style: italic; margin: 0;">Generated ${escapeHtml(fmtDateTime(now))} from AF Master Project Tracker.</p>`);
  parts.push(`</div>`);
  return parts.join('');
}

function BriefingDialog({ projects, isOwnerMode = false, ownerName = null, teamMembers = [], onClose, showToast }) {
  const [daysBack, setDaysBack] = useState(BRIEFING_DEFAULT_WINDOW_DAYS);
  const [preview, setPreview] = useState('');
  const [generated, setGenerated] = useState(false);

  const generate = () => {
    const md = generateBriefingMarkdown({ projects, daysBack, ownerName: isOwnerMode ? ownerName : null });
    setPreview(md);
    setGenerated(true);
  };

  const copyMarkdown = async () => {
    try { await navigator.clipboard.writeText(preview); showToast?.('Markdown copied'); } catch { showToast?.('Copy failed'); }
  };
  const copyRich = async () => {
    const html = generateBriefingHtml({ projects, daysBack, ownerName: isOwnerMode ? ownerName : null });
    try {
      if (window.ClipboardItem) {
        const blob = new Blob([html], { type: 'text/html' });
        const textBlob = new Blob([preview], { type: 'text/plain' });
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': blob, 'text/plain': textBlob })]);
        showToast?.('Rich text copied — paste into Gmail');
      } else {
        await navigator.clipboard.writeText(html);
        showToast?.('HTML source copied');
      }
    } catch { showToast?.('Copy failed'); }
  };
  const download = () => {
    const blob = new Blob([preview], { type: 'text/markdown' });
    downloadBlob(blob, `briefing-${todayISODate()}.md`);
  };
  const openGmail = () => {
    const cc = isOwnerMode ? (teamMembers || []).map((m) => m.email).filter(Boolean).join(',') : '';
    const url = buildGmailUrl({
      to: '',
      cc,
      subject: `📋 Weekly Briefing — ${fmtDate(new Date())}`,
      body: preview,
    });
    openLinkInNewTab(url);
  };

  return (
    <Modal title={isOwnerMode ? '📨 Weekly digest (owner)' : '📋 Weekly briefing'} onClose={onClose} width={720}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <FieldLabel>Look-back window</FieldLabel>
        <select value={daysBack} onChange={(e) => { setDaysBack(Number(e.target.value)); setGenerated(false); }}
          style={{ fontFamily: FONT_STACK, fontSize: 13, padding: '5px 22px 5px 8px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface }}>
          <option value={3}>Last 3 days</option>
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
        </select>
        <div style={{ flex: 1 }} />
        <Btn size="sm" variant="primary" onClick={generate}>{generated ? 'Regenerate' : 'Generate preview'}</Btn>
      </div>

      {generated && (
        <>
          <Textarea value={preview} onChange={setPreview} rows={18} />
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            <Btn size="sm" onClick={copyMarkdown}>Copy Markdown</Btn>
            <Btn size="sm" onClick={copyRich}>✨ Copy rich text</Btn>
            <Btn size="sm" onClick={download}>Download .md</Btn>
            <Btn size="sm" variant="primary" onClick={openGmail}>📧 Open in Gmail</Btn>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ═════════ TRANSFER OWNER DIALOG ═════════ */

function TransferOwnerDialog({ teamMembers, currentOwner, projects, onClose, onTransfer }) {
  const [pickedEmail, setPickedEmail] = useState('');
  const [typedConfirm, setTypedConfirm] = useState('');
  const candidates = useMemo(
    () => transferCandidates(projects, teamMembers, currentOwner),
    [teamMembers, currentOwner, projects]
  );
  const picked = candidates.find((c) => c.email === pickedEmail) || null;
  const canTransfer = !!picked && typedConfirm.trim().toLowerCase() === picked.email;
  return (
    <Modal title="Transfer workspace owner" onClose={onClose} width={460}>
      <div style={{ padding: 10, background: TOK.healthAmberBg, color: TOK.healthAmber, borderRadius: 6, fontSize: 12, marginBottom: 14 }}>
        Transfer is permanent. The new owner gains full workspace access; you become a regular user. Audit trail is logged.
      </div>
      <FieldLabel>New owner</FieldLabel>
      <select value={pickedEmail} onChange={(e) => { setPickedEmail(e.target.value); setTypedConfirm(''); }}
        style={{ fontFamily: FONT_STACK, fontSize: 13, padding: '7px 26px 7px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface, width: '100%' }}>
        <option value="">— pick a teammate —</option>
        {candidates.map((m) => <option key={m.email} value={m.email}>{m.name} ({m.email})</option>)}
      </select>
      {candidates.length === 0 && (
        <div style={{ fontSize: 11, color: TOK.muted, marginTop: 6 }}>
          No teammate with an email address. Add emails in Project Settings → Team members first.
        </div>
      )}
      {picked && (
        <>
          <div style={{ height: 14 }} />
          <FieldLabel>Type the recipient's email to confirm</FieldLabel>
          <Input value={typedConfirm} onChange={setTypedConfirm} placeholder={picked.email} />
        </>
      )}
      <div style={{ marginTop: 16, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" disabled={!canTransfer} onClick={() => onTransfer(picked.email)}>Transfer ownership</Btn>
      </div>
    </Modal>
  );
}

/* ═════════ MAIN APP ═════════ */
export default function App() {
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState(false);
  const [author, setAuthor] = useState(null);
  const [authorEmail, setAuthorEmail] = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [meta, setMeta] = useState(null);
  const [projects, setProjects] = useState({}); // id → project
  // Latest projects for handlers invoked after an await or a delay (B4 review fix).
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const [currentId, setCurrentId] = useState(null);
  // Current project at the time an await resolves (activity logs must not land in another project's view).
  const currentIdRef = useRef(currentId);
  currentIdRef.current = currentId;
  const [view, setView] = useState(null); // resolved by effect once meta+author load (v30)
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [toast, setToast] = useState(null);
  const [activity, setActivity] = useState([]);
  // C1: activity loads lazily; remembers which project's log is in `activity`. Failed project loads are retried from a banner.
  const [activityLoadedId, setActivityLoadedId] = useState(null);
  const [loadFailed, setLoadFailed] = useState([]);
  const [showImport, setShowImport] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [scopeProgramId, setScopeProgramId] = useState(null);
  // v30 RAID Phase 3 — When navigating to the RAID tab from another view
  // (e.g. via TaskDetail's "View all →"), this state pre-selects the program.
  // Reset to null when the user manually clicks the RAID tab in the strip.
  const [raidScopeProgramId, setRaidScopeProgramId] = useState(null);
  const [projectMenu, setProjectMenu] = useState(null);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [showRoles, setShowRoles] = useState(false);
  const [meetingMode, setMeetingMode] = useState(false);
  const [showMeetingExport, setShowMeetingExport] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [helpMenu, setHelpMenu] = useState(null);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showBriefingDialog, setShowBriefingDialog] = useState(false);
  const [briefingDialogIsOwnerMode, setBriefingDialogIsOwnerMode] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [showTransferOwner, setShowTransferOwner] = useState(false);
  useSearchHotkey(() => setShowSearch(true));
  const { user: authUser, logOut } = useAuth();
  const directory = useUserDirectory();
  const { entries: dirEntries, reload: reloadDirectory } = useWorkspaceDirectory(authUser);
  const [showDirectory, setShowDirectory] = useState(false);
  const dirIndex = useMemo(() => (dirEntries.length ? buildDirectoryIndex(dirEntries) : null), [dirEntries]);
  const fileInputRef = useRef(null);
  const walkthroughRef = useRef(null);
  const saveTimers = useRef({});
  // B2/B3: per-project save failures shown in a persistent banner.
  const [saveState, setSaveState] = useState({});
  const pendingSaves = useRef(0);
  const [pendingN, setPendingN] = useState(0); // re-render mirror of pendingSaves.current (C2 chip)
  const bumpPending = useCallback((d) => { pendingSaves.current = Math.max(0, pendingSaves.current + d); setPendingN(pendingSaves.current); }, []);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const saveStateRef = useRef({});
  saveStateRef.current = saveState;
  const { dialog, api: dialogs, close: closeDialog } = useDialogs();

  // Roster of @mention-able teammates: derived from PICs + check-in/update authors + project teamMembers list + RBAC members (from user directory)
  const teamMembers = useMemo(
    () => deriveTeamMembers(projects, author, authorEmail, directory, dirIndex),
    [projects, author, authorEmail, directory, dirIndex]
  );

  // Load on mount
  useEffect(() => {
    (async () => {
      const boot = await loadMetaStrict(window.storage);
      if (boot.status === 'error') {
        // Failed read: never seed or write; show Retry.
        setBootError(true);
        setLoading(false);
        return;
      }
      let m = boot.meta;
      const localUser = await sgetLocal(K.userLocal);

      if (boot.status === 'missing') {
        // First-time: seed with CRP project
        const seeded = cloneDeep(SEED_CRP);
        seeded.createdAt = new Date().toISOString();
        await saveProject(seeded);
        m = { workspaceName: 'Project Tracker', projectIds: [seeded.id], currentProjectId: seeded.id };
        await saveMeta(m);
        await appendActivity(seeded.id, { id: uid('act'), timestamp: new Date().toISOString(), author: 'system', type: 'seed', description: `Seeded project "${seeded.name}"` });
      }
      setMeta(m);
      setCurrentId(m.currentProjectId);

      const ps = {};
      const results = await Promise.all(m.projectIds.map((pid) => loadProject(pid)));
      m.projectIds.forEach((pid, i) => { if (results[i]) ps[pid] = ensureProjectRaid(results[i]); });
      setLoadFailed(loadFailures(m.projectIds, results));
      setProjects(ps);

      if (localUser) {
        // Back-compat: localUser was previously a plain string; now it's JSON {name, email}
        try {
          const parsed = JSON.parse(localUser);
          if (parsed && typeof parsed === 'object' && parsed.name) {
            setAuthor(parsed.name);
            setAuthorEmail(parsed.email || null);
          } else {
            setAuthor(localUser); // legacy format
          }
        } catch {
          setAuthor(localUser); // legacy plain string
        }
      }
      setLoading(false);

      // Stage 1 deep link — Google Chat "View" → ?project=X&action=Y. Switch to
      // the project and Actions tab if the user has access. Clear the params so a
      // refresh doesn't re-trigger.
      try {
        const { project: dpProj, action: dpAct, task: dpTask } = parseDeepLink(window.location.search);
        if (dpProj && (dpAct || dpTask)) {
          if (ps[dpProj]) {
            setCurrentId(dpProj);
            rememberCurrentProject(dpProj);
            if (dpTask) {
              // Task panel renders beside any view; keep the current one.
              setSelectedTaskId(dpTask);
            } else {
              setView('actions');
              setInitialActionEditId(dpAct);
              // Opens the action's edit form via ActionItemsView's initialEditId prop.
            }
          }
          // Always clear, even when the project is inaccessible (nothing opens).
          window.history.replaceState({}, '', window.location.pathname);
        }
      } catch {
        /* ignore — defensive guard for any URL parse oddity */
      }
    })();
  }, []);

  // Auto-derive identity from Firebase profile whenever authUser arrives
  // without a local cached identity. After sign-out → sign-in, localStorage
  // is cleared but Firebase displayName + email are still authoritative —
  // no welcome dialog re-prompt needed. Persists to localStorage so the
  // next reload is fast and survives offline.
  useEffect(() => {
    if (!authUser || author) return;
    const fbName = authUser.name || (authUser.email || '').split('@')[0];
    if (!fbName) return;
    setAuthor(fbName);
    setAuthorEmail(authUser.email || null);
    ssetLocal(K.userLocal, JSON.stringify({ name: fbName, email: authUser.email || '' })).catch(() => { /* ignore */ });
  }, [authUser, author]);

  const project = (currentId && currentId !== '__all__') ? projects[currentId] : null;
  const isAllProjectsMode = currentId === '__all__';
  // B1: owner = verified Firebase email only (case-insensitive). Display-name
  // claims are no longer accepted; Firestore rules enforce the same.
  const verifiedEmail = authUser?.email || authorEmail || null;
  const isOwner = isWorkspaceOwnerEmail(meta?.workspaceOwner, verifiedEmail);

  // v30 — per-user preferences (lastSeenMyWorkAt, defaultViewOverride, etc.)
  // meta.userPreferences is optional; default to {} so legacy workspaces just work.
  const userPrefs = useMemo(
    () => (author ? (meta?.userPreferences?.[author] || {}) : {}),
    [meta, author]
  );

  // v30 Phase 4 — Badge count on the My Work tab. needsAttention always
  // counted; unreadMentions only counted after the user's first visit
  // (lastSeenMyWorkAt is set) to avoid scary backlog badges on new members.
  const myWorkBadge = useMemo(() => {
    if (!author) return 0;
    const w = computeMyWork(author, projects, isOwner, userPrefs?.lastSeenMyWorkAt, dirIndex, verifiedEmail);
    const r = computeMyRaid(author, projects, isOwner);
    const hasVisited = !!userPrefs?.lastSeenMyWorkAt;
    const raidAttention = r.pendingApproval.length + r.escalating.length + r.overdueActions.length + r.needsReview.length;
    return w.needsAttention.length + raidAttention + (hasVisited ? w.unreadMentions.length : 0);
  }, [projects, author, isOwner, userPrefs, dirIndex, verifiedEmail]);

  // v30 RAID Phase 2 — Owner-only pending approval count for the RAID tab badge.
  const raidPendingBadge = useMemo(() => {
    if (!isOwner) return 0;
    let n = 0;
    for (const proj of Object.values(projects || {})) {
      for (const pg of (proj.programs || [])) {
        for (const r of (pg.raid || [])) {
          if (r.status === 'PendingApproval') n++;
        }
      }
    }
    return n;
  }, [projects, isOwner]);

  // Resolve landing view once meta + author are ready. Fallback chain:
  // personal override → workspace default → 'my-work' (the new v30 default).
  useEffect(() => {
    if (view !== null || !meta || !author) return;
    const v = userPrefs?.defaultViewOverride || meta?.defaultView || 'my-work';
    // Activity is workspace-owner only (PR-E U5): never land a non-Owner there.
    setView(v === 'activity' && !isOwner ? 'my-work' : v);
  }, [meta, author, view, userPrefs, isOwner]);

  // v30.A.1 — modal state for creating an action from My Work + state
  // for routing "→ Open" from My Work to a specific action's Edit form.
  const [actionCreate, setActionCreate] = useState(null);
  const [initialActionEditId, setInitialActionEditId] = useState(null);

  // Clear the auto-edit trigger when leaving the Actions tab so a future
  // navigation doesn't re-open a stale ID.
  useEffect(() => {
    if (view !== 'actions') setInitialActionEditId(null);
  }, [view]);

  // v30.A.2 — Sibling state + clear effect for decisions.
  const [initialDecisionEditId, setInitialDecisionEditId] = useState(null);
  useEffect(() => {
    if (view !== 'decisions') setInitialDecisionEditId(null);
  }, [view]);

  // v30 — mark mentions as seen. Functional setMeta keeps deps stable.
  const markMyWorkSeen = useCallback(async () => {
    if (!author) return;
    setMeta((m) => {
      if (!m) return m;
      const prefs = m.userPreferences || {};
      const m2 = {
        ...m,
        userPreferences: {
          ...prefs,
          [author]: { ...(prefs[author] || {}), lastSeenMyWorkAt: new Date().toISOString() },
        },
      };
      saveMeta(m2);
      return m2;
    });
  }, [author]);

  // v30 Phase 4 — Owner picks the workspace-wide default landing view.
  // Writes meta.defaultView. Defense-in-depth: also guard at handler.
  const setWorkspaceDefaultView = useCallback(async (viewId) => {
    if (!isOwner) return;
    setMeta((m) => {
      if (!m) return m;
      const m2 = { ...m, defaultView: viewId };
      saveMetaOwnerFields(m2);
      return m2;
    });
    const label = DEFAULT_VIEW_OPTIONS.find((o) => o.id === viewId)?.label || viewId;
    showToast(`Workspace default set to "${label}"`);
  }, [isOwner]);

  // v30 Phase 4 — Per-user override. Pass null to clear and fall back to
  // workspace default on next app load.
  const setPersonalDefaultOverride = useCallback(async (viewId) => {
    if (!author) return;
    setMeta((m) => {
      if (!m) return m;
      const prefs = m.userPreferences || {};
      const m2 = {
        ...m,
        userPreferences: {
          ...prefs,
          [author]: { ...(prefs[author] || {}), defaultViewOverride: viewId || null },
        },
      };
      saveMeta(m2);
      return m2;
    });
    if (viewId) {
      const label = DEFAULT_VIEW_OPTIONS.find((o) => o.id === viewId)?.label || viewId;
      showToast(`Your personal default: "${label}"`);
    } else {
      showToast(`Cleared personal override (will follow workspace default)`);
    }
  }, [author]);

  // v30 Phase 3 — Owner impersonation state. In-memory only; cleared on refresh.
  // effectiveAuthor flows through MyWorkView render and apply* handlers so
  // the impersonated user appears to be acting from the desk.
  const [impersonatingAs, setImpersonatingAs] = useState(null);
  const effectiveAuthor = impersonatingAs || author;

  const startImpersonation = useCallback((memberName) => {
    if (!isOwner) return;
    if (!memberName || memberName === author) return;
    setImpersonatingAs(memberName);
    setView('my-work');
  }, [isOwner, author]);

  const clearImpersonation = useCallback(() => {
    setImpersonatingAs(null);
  }, []);

  // action: optional { label, onClick } rendered as a button (e.g. Undo); stays 6s.
  const showToast = (message, action) => {
    const id = uid('t');
    setToast({ message, id, action });
    setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), action ? 6000 : 3500);
  };
  // Refs so the write choke points below stay stable callbacks.
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  // P3-16: View as is read-only.
  const impersonatingRef = useRef(impersonatingAs);
  impersonatingRef.current = impersonatingAs;
  // P3 Task 7: who acts (CloseControl, choke point); names / active status by uid.
  const dirByUid = useMemo(() => directoryByUid(dirEntries), [dirEntries]);
  const meValue = useMemo(() => ({
    uid: authUser?.uid || null,
    name: author,
    isOwner,
    readOnly: !!impersonatingAs,
    nameOf: dirByUid.nameOf,
    isActive: dirByUid.isActive,
    onReadOnly: () => showToastRef.current(READ_ONLY_MESSAGE),
    notify: (msg) => showToastRef.current(msg),
  }), [authUser, author, isOwner, impersonatingAs, dirByUid]);
  const meRef = useRef(meValue);
  meRef.current = meValue;
  // U1: the My Work tab count adds close requests waiting on me (not under View as:
  // the approvals shown are keyed on the signed-in uid). `now` is read per render.
  const myWorkTabCount = myWorkBadge + (impersonatingAs ? 0 : approvalBuckets(projects, authUser?.uid || null, new Date()).needsMine.length);
  // Role assignment: people a role picker of the current v2 project offers (memberUids
  // come from the shim cache; `project` changes after a role / member refresh).
  const rolePeople = useMemo(() => (project?.__v2
    ? rolePickerPeople({ dirEntries, memberUids: v2MemberUidsNow(project.id), isOwner })
    : []), [project, dirEntries, isOwner]);

  // P2.3: Owner-only notice, once per project, when a v2 project loaded with orphans.
  const orphanToastShown = useRef(new Set());
  useEffect(() => {
    if (!isOwner) return;
    for (const p of Object.values(projects || {})) {
      const n = p?.__v2?.orphans || 0;
      if (n > 0 && !orphanToastShown.current.has(p.id)) {
        orphanToastShown.current.add(p.id);
        const id = uid('t');
        setToast({ message: `${n} item(s) in this project could not be placed; see the console.`, id });
        setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), 3500);
        break;
      }
    }
  }, [isOwner, projects]);

  // P3 Task 7 (carry 1): after a v2 save, role data comes from the shim's refreshed
  // `loaded` cache (in-session PIC / contributor edits, tasks created this session).
  const rolesNowFor = useCallback((pid) => {
    const p = projectsRef.current[pid];
    if (!p?.__v2) return null;
    return v2RolesNow(pid, p.__v2.roles?.ownerUids) || p.__v2.roles || null;
  }, []);
  const refreshV2Roles = useCallback((pid) => {
    const roles = rolesNowFor(pid);
    if (!roles) return;
    setProjects((prev) => {
      const p = prev[pid];
      if (!p?.__v2 || JSON.stringify(p.__v2.roles) === JSON.stringify(roles)) return prev;
      return { ...prev, [pid]: { ...p, __v2: { ...p.__v2, roles } } };
    });
  }, [rolesNowFor]);

  // Debounced save of a project. Failures surface in the save banner (B2/B3).
  // P3: the pending tree / in-flight save are tracked so a v2 close can flush them
  // first, and a debounced save waits while a close is being saved step by step.
  const pendingTree = useRef({});
  const inflightSaves = useRef({});
  const closeBusy = useRef({});
  const persistProject = useCallback((p) => {
    if (!p) return;
    if (!saveTimers.current[p.id]) bumpPending(1);
    clearTimeout(saveTimers.current[p.id]);
    pendingTree.current[p.id] = p;
    const fire = async () => {
      if (closeBusy.current[p.id]) { saveTimers.current[p.id] = setTimeout(fire, 400); return; }
      delete saveTimers.current[p.id];
      // v2: always the latest in-memory state (a close may have been re-planned,
      // e.g. direct -> submit, since this edit was queued). v1: as before.
      const tree = (p.__v2 && projectsRef.current[p.id]) || pendingTree.current[p.id] || p;
      delete pendingTree.current[p.id];
      const pr = saveProject(tree);
      inflightSaves.current[p.id] = pr;
      const status = await pr;
      if (inflightSaves.current[p.id] === pr) delete inflightSaves.current[p.id];
      bumpPending(-1);
      if (status === 'ok') setLastSavedAt(nowHHMM());
      setSaveState((prev) => nextSaveState(prev, p.id, status, tree.name || 'project'));
      refreshV2Roles(p.id);
    };
    saveTimers.current[p.id] = setTimeout(fire, 400);
  }, [refreshV2Roles, bumpPending]);

  // C2: re-run saves that failed with a retryable 'error' (network/unknown). Conflict, denied,
  // refused and history are never retried: that would fail again or overwrite.
  const retryFailedSaves = useCallback(() => {
    for (const pid of retryablePids(saveStateRef.current)) {
      if (projectsRef.current[pid]) persistProject(projectsRef.current[pid]);
      // Project no longer in memory (e.g. deleted): nothing to save, drop the stale entry.
      else setSaveState((prev) => nextSaveState(prev, pid, 'ok'));
    }
  }, [persistProject]);
  useEffect(() => {
    window.addEventListener('online', retryFailedSaves);
    return () => window.removeEventListener('online', retryFailedSaves);
  }, [retryFailedSaves]);

  // P3 (carry 2, 3): save a pending debounced edit of this project now (before a
  // close step), or wait for one in flight. -> that save's status, or null when nothing was pending.
  const flushProjectSave = useCallback(async (pid) => {
    if (saveTimers.current[pid]) {
      clearTimeout(saveTimers.current[pid]);
      delete saveTimers.current[pid];
      const tree = pendingTree.current[pid];
      delete pendingTree.current[pid];
      if (!tree) { bumpPending(-1); return null; }
      const status = await saveProject(tree);
      bumpPending(-1);
      if (status === 'ok') setLastSavedAt(nowHHMM());
      setSaveState((prev) => nextSaveState(prev, pid, status, tree.name || 'project'));
      refreshV2Roles(pid);
      return status;
    }
    if (inflightSaves.current[pid]) return await inflightSaves.current[pid];
    return null;
  }, [refreshV2Roles, bumpPending]);

  // B2: warn before closing the tab while a save is pending or has failed.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (bypassUnloadGuard || !hasUnsavedWork(pendingSaves.current, saveState)) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [saveState]);

  const updateProject = useCallback((updated) => {
    if (impersonatingRef.current) { showToastRef.current(READ_ONLY_MESSAGE); return; } // P3-16
    setProjects((prev) => ({ ...prev, [updated.id]: updated }));
    persistProject(updated);
  }, [persistProject]);

  const logActivity = useCallback(async ({ type, description }) => {
    if (impersonatingRef.current) { showToastRef.current(READ_ONLY_MESSAGE); return; } // P3-16
    if (!currentId || !author) return;
    const entry = { id: uid('act'), timestamp: new Date().toISOString(), author, type, description };
    const v2 = !!projectsRef.current[currentId]?.__v2;
    const pid = currentId;
    const log = await appendActivity(pid, entry, { v2 });
    if (pid !== currentIdRef.current) return; // switched project meanwhile: keep the new view's log
    if (log) setActivity(log);
    else if (v2) setActivity((prev) => [entry, ...prev]);
  }, [currentId, author]);

  // v30 — write to a specific project's activity log (My Work edits tasks/actions
  // across projects, not just currentId). Refresh in-memory feed only if it's
  // the project currently in view. P3-19: `before` / `after` are kept on the entry.
  const logActivityForProject = useCallback(async (projectId, { type, description, before, after, programId, workstreamId }) => {
    if (impersonatingRef.current) { showToastRef.current(READ_ONLY_MESSAGE); return; } // P3-16
    if (!projectId || !author) return;
    const entry = {
      id: uid('act'), timestamp: new Date().toISOString(), author, type, description,
      ...(before !== undefined ? { before } : {}),
      ...(after !== undefined ? { after } : {}),
      ...(programId !== undefined ? { programId } : {}),
      ...(workstreamId !== undefined ? { workstreamId } : {}),
    };
    const v2 = !!projectsRef.current[projectId]?.__v2;
    const log = await appendActivity(projectId, entry, { v2 });
    if (projectId === currentIdRef.current) {
      if (log) setActivity(log);
      else if (v2) setActivity((prev) => [entry, ...prev]);
    }
  }, [author]);

  // Sign out: clear local identity AND Firebase auth session. After Firebase
  // signs out, AuthGate (auth.tsx) re-renders the "Sign in with Google" screen
  // automatically — App.jsx will unmount. Shared project data is preserved.
  const signOut = async () => {
    const ok = await dialogs.confirm({
      title: 'Sign out?',
      message: `You will be signed out as "${author}". Project data is shared with the team and will not be affected — only your name and email on this device will be cleared.`,
      okLabel: 'Sign out',
    });
    if (!ok) return;
    setUserMenuOpen(false);
    await sdeleteLocal(K.userLocal);
    await logOut();
    setAuthor(null);
    setAuthorEmail(null);
  };

  // P3: replace one task in memory without a save; projectsRef is updated at once so
  // a close step saved before the next render is built from this state.
  const setTaskNow = useCallback((projectId, taskId, t) => {
    const cur = projectsRef.current[projectId];
    if (cur) projectsRef.current = { ...projectsRef.current, [projectId]: replaceTask(cur, taskId, t) };
    setProjects((prev) => (prev[projectId]
      ? { ...prev, [projectId]: replaceTask(prev[projectId], taskId, t) } : prev));
  }, []);

  // P3 Task 7: save a v2 close transition. Flush pending edits first, then one
  // save per step in order (carry 2, 3; closeWiring.runCloseFlow), then log the
  // close events (P3-19). In-memory state already shows `intent.task`.
  // Closes of one project run one after another (closeChain); debounced saves of
  // that project wait meanwhile (closeBusy).
  const closeChain = useRef({});
  const runV2CloseNow = useCallback(async ({ projectId, oldTask, nextTask, intent, me, now, tag }) => {
    const setTask = (t) => setTaskNow(projectId, oldTask.id, t);
    const res = await runCloseFlow({
      initial: intent, oldTask, nextTask, me, now,
      isActive: meRef.current.isActive,
      getRoles: () => rolesNowFor(projectId),
      flush: () => flushProjectSave(projectId),
      saveStep: async (step) => {
        // Last-saved state + this step only: other unsaved edits never ride in a close write.
        const saved = v2SavedTree(projectId);
        // The task must be in the saved tree (else replaceTask would write nothing useful).
        if (!saved || !findTaskInProject(saved, oldTask.id)) {
          setSaveState((prev) => nextSaveState(prev, projectId, 'error', projectsRef.current[projectId]?.name || 'project'));
          return 'error';
        }
        const tree = replaceTask(saved, oldTask.id, step);
        const status = await saveProject(tree);
        setSaveState((prev) => nextSaveState(prev, projectId, status, tree.name || 'project'));
        refreshV2Roles(projectId);
        return status;
      },
    });
    if (res.status === 'flush-failed') {
      // The pending edit was not saved (banner shows it): drop the optimistic close.
      setTask(oldTask);
      return;
    }
    if (res.status === 'denied' || res.status === 'needs-reason' || res.status === 'no-approver') {
      // Re-planned after a flush and refused before any write: undo the optimistic change.
      setTask(res.task);
      showToastRef.current(chokeMessage(res.status));
      return;
    }
    if (res.status !== 'ok') {
      // The save banner reports it. Drop the optimistic close (back to the last saved task) so
      // Retry / online cannot later save an unlogged close through the general save path.
      setTask(closeRollbackTask(v2SavedTree(projectId), oldTask.id, res.task));
      return;
    }
    if (res.task !== intent.task) {
      setTask(res.task);
      const msg = res.outcome !== intent.outcome ? replanMessage(res.outcome, meRef.current.nameOf(res.task.closeRequest?.approverUid)) : null;
      if (msg) showToastRef.current(msg);
    }
    const closeEvents = closeEventsFor(oldTask, res.task, meRef.current.nameOf);
    for (const ev of closeEvents) {
      logActivityForProject(projectId, { ...ev, description: ev.description + tag });
    }
    // Google Chat card on a submit / reject (only when the project has a webhook). Fire-and-forget.
    const webhook = projectsRef.current[projectId]?.googleChatWebhook;
    if (webhook) {
      const nameOf = meRef.current.nameOf;
      const pname = projectsRef.current[projectId]?.name || 'project';
      const url = taskUrl(window.location.origin, projectId, oldTask.id);
      let card = null;
      if (closeEvents.some((e) => e.type === 'close_submitted')) {
        const cr = res.task.closeRequest || {};
        card = buildCloseSubmittedCard({
          projectName: pname, taskName: res.task.name || oldTask.name || 'task',
          requesterName: nameOf(cr.requestedByUid) || cr.requestedBy || 'Someone',
          approverName: nameOf(cr.approverUid) || 'the approver',
          outcome: cr.outcome, note: cr.note, taskUrl: url,
        });
      } else if (closeEvents.some((e) => e.type === 'close_rejected')) {
        const h = (res.task.closeRequestHistory || [])[0] || {};
        card = buildCloseRejectedCard({
          projectName: pname, taskName: res.task.name || oldTask.name || 'task',
          deciderName: me.name || nameOf(me.uid) || 'Someone',
          requesterName: nameOf(h.requestedByUid) || 'the requester',
          reason: h.reason || '', taskUrl: url,
        });
      }
      if (card) {
        postToChat(webhook, card).then((r) => {
          if (!r.ok) showToastRef.current(`Chat notify failed: ${r.status} ${r.statusText}`);
        });
      }
    }
  }, [rolesNowFor, flushProjectSave, refreshV2Roles, logActivityForProject, setTaskNow]);
  const runV2Close = useCallback((args) => {
    const pid = args.projectId;
    closeBusy.current[pid] = (closeBusy.current[pid] || 0) + 1;
    bumpPending(1);
    const done = () => {
      closeBusy.current[pid] -= 1;
      if (!closeBusy.current[pid]) delete closeBusy.current[pid];
      bumpPending(-1);
    };
    const run = (closeChain.current[pid] || Promise.resolve())
      .then(() => runV2CloseNow(args))
      .catch((e) => console.error('[p3] close save failed:', e))
      .finally(done);
    closeChain.current[pid] = run;
    return run;
  }, [runV2CloseNow, bumpPending]);

  // Role assignment (spec §7): the role write never carries tree edits. Pending edits
  // are flushed first, the role goes through changeRoleV2, then pending close requests
  // move to the new approver with a save of the last-saved tree + those tasks only
  // (like runV2CloseNow). `preMoves` (shown in the confirm) is recomputed on the
  // saved tree after the role write.
  const changeRoleNow = useCallback(async ({ projectId, change, before, preMoves, addMemberUid, state = {} }) => {
    const nameOf = meRef.current.nameOf;
    // A failed flush is ignored on purpose: the role write carries no tree data; the edit stays in memory and the banner shows it.
    await flushProjectSave(projectId);
    const status = await changeRoleV2(projectId, change, addMemberUid ? { addMemberUid } : {});
    if (status === 'changed') { showToastRef.current('Someone changed this role. Reload to see it.'); return; }
    if (status !== 'ok') { showToastRef.current(`Role not saved (${status}). Reload and try again.`); return; }
    state.roleSaved = true;
    refreshV2Roles(projectId);
    logActivityForProject(projectId, roleChangeEvent(change, nameOf, scopeNameOf(projectsRef.current[projectId], change)));

    const after = rolesNowFor(projectId);
    const saved = v2SavedTree(projectId);
    const moves = saved && after
      ? reroutePlan({ before, after, change, tasks: collectTasks(saved), isActive: meRef.current.isActive })
      : preMoves;
    if (!moves.length) { showToastRef.current(roleSavedMessage(change.toUid, nameOf)); return; }
    const failed = [];
    const done = [];
    let tree = saved;
    if (saved && after) {
      const me = { uid: meRef.current.uid, name: meRef.current.name };
      const now = new Date().toISOString();
      for (const m of moves) {
        const old = findTaskInProject(tree, m.taskId)?.task;
        const t = old ? reassignClose({ roles: after, task: old, me, toUid: m.toUid, now }) : null;
        if (!t) { failed.push(m); continue; }
        tree = replaceTask(tree, m.taskId, t);
        done.push({ m, old, t });
      }
    } else {
      failed.push(...moves);
    }
    if (done.length) {
      const st = await saveProject(tree);
      setSaveState((prev) => nextSaveState(prev, projectId, st, tree.name || 'project'));
      refreshV2Roles(projectId);
      if (st === 'ok') {
        for (const { m, old, t } of done) {
          // Keep any newer in-memory edit of the task; only the close request moves.
          const cur = projectsRef.current[projectId] && findTaskInProject(projectsRef.current[projectId], m.taskId)?.task;
          setTaskNow(projectId, m.taskId, cur ? { ...cur, closeRequest: t.closeRequest, closeRequestHistory: t.closeRequestHistory } : t);
          for (const ev of closeEventsFor(old, t, nameOf)) {
            logActivityForProject(projectId, { ...ev, description: ev.description + ' (role change)' });
          }
        }
      } else {
        failed.push(...done.map((d) => d.m));
      }
    }
    if (failed.length) {
      console.warn('[roles] pending requests not moved:', failed);
      showToastRef.current(rerouteFailedMessage(failed, nameOf));
    } else {
      showToastRef.current(roleSavedMessage(change.toUid, nameOf));
    }
  }, [rolesNowFor, flushProjectSave, refreshV2Roles, logActivityForProject, setTaskNow]);
  const changeRole = useCallback(async (projectId, change) => {
    const me = meRef.current;
    if (me.readOnly) { showToastRef.current(READ_ONLY_MESSAGE); return; }
    const before = rolesNowFor(projectId);
    if (!before || !canEditRole(before, me, change.kind, change.programId)) return;
    const err = validateRoleChange(before, change);
    if (err) { showToastRef.current(err); return; }
    const after = rolesAfter(before, change);
    const saved = v2SavedTree(projectId);
    const preMoves = reroutePlan({ before, after, change, tasks: saved ? collectTasks(saved) : [], isActive: me.isActive });
    const addMemberUid = me.isOwner && change.toUid && !v2MemberUidsNow(projectId).includes(change.toUid) ? change.toUid : null;
    const lines = roleChangeConfirmLines({
      change, nameOf: me.nameOf, scopeName: scopeNameOf(projectsRef.current[projectId], change), moves: preMoves, addMemberUid,
    });
    const ok = await dialogs.confirm({
      title: 'Change role?',
      message: lines.map((l, i) => <span key={i} style={{ display: 'block' }}>{l}</span>),
      okLabel: 'Save',
    });
    if (!ok) return;
    // Same per-project chain as closes; debounced saves of the project wait meanwhile.
    closeBusy.current[projectId] = (closeBusy.current[projectId] || 0) + 1;
    bumpPending(1);
    const state = { roleSaved: false };
    const run = (closeChain.current[projectId] || Promise.resolve())
      .then(() => changeRoleNow({ projectId, change, before, preMoves, addMemberUid, state }))
      .catch((e) => {
        console.error('[roles] change failed:', e);
        showToastRef.current(state.roleSaved
          ? 'Role saved. Pending requests may not have moved; the PM or Owner can reassign them.'
          : 'Role not saved (error). Reload and try again.');
      })
      .finally(() => {
        closeBusy.current[projectId] -= 1;
        if (!closeBusy.current[projectId]) delete closeBusy.current[projectId];
        bumpPending(-1);
      });
    closeChain.current[projectId] = run;
    return run;
  }, [rolesNowFor, changeRoleNow, dialogs, bumpPending]);

  // v30 — Apply a task update to any project (not just `currentId`) and emit
  // diff-based activity log entries to that project's log. `source` is an
  // optional suffix (e.g. "My Work") to tag the entry-point in the audit.
  // P3 choke point: every task change passes applyCloseIntent. v1 (no __v2) ->
  // 'legacy', and a change that touches no close key -> 'unchanged': both keep the
  // v30 path below. Returns the outcome (My Work uses it for its Undo toast).
  const applyTaskUpdate = useCallback((updatedTask, projectId, source = '', actingAs = '', retried = false) => {
    if (impersonatingRef.current) { showToastRef.current(READ_ONLY_MESSAGE); return 'read-only'; } // P3-16
    const targetProj = projectsRef.current[projectId];
    if (!targetProj) return;
    const loc = findTaskInProject(targetProj, updatedTask.id);
    if (!loc) return;
    const oldTask = loc.task;
    if (targetProj.__v2) {
      const me = { uid: meRef.current.uid, name: meRef.current.name };
      const now = new Date().toISOString();
      const nextTask = { ...oldTask, ...updatedTask };
      const intent = closeIntentFor({ roles: rolesNowFor(projectId), oldTask, nextTask, me, now, isActive: meRef.current.isActive });
      if (intent.outcome === 'denied' && !retried && !rolesNowFor(projectId)?.tasks?.[oldTask.id]) {
        // A task created this session has no roles entry until its first save:
        // save it now, refresh roles, and try once more.
        flushProjectSave(projectId).then((st) => {
          if (st == null || st === 'ok') applyTaskUpdateRef.current(updatedTask, projectId, source, actingAs, true);
        });
        return 'retry';
      }
      if (intent.outcome === 'denied' || intent.outcome === 'needs-reason' || intent.outcome === 'no-approver') {
        showToastRef.current(chokeMessage(intent.outcome));
        return intent.outcome;
      }
      if (isCloseOutcome(intent.outcome)) {
        const msg = chokeMessage(intent.outcome, meRef.current.nameOf(intent.task.closeRequest?.approverUid));
        if (msg) showToastRef.current(msg);
        setTaskNow(projectId, oldTask.id, intent.task);
        runV2Close({ projectId, oldTask, nextTask, intent, me, now, tag: source ? ` (from ${source})` : '' });
        return intent.outcome;
      }
    }
    const updated = cloneDeep(targetProj);
    const ul = findTaskInProject(updated, updatedTask.id);
    Object.assign(ul.task, updatedTask);
    updateProject(updated);

    const tag = source ? ` (from ${source})` : '';
    const actingPrefix = actingAs ? `acting as ${actingAs}: ` : '';
    const log = (entry) => logActivityForProject(projectId, {
      ...entry,
      description: actingPrefix + entry.description,
    });

    if (oldTask.status !== updatedTask.status) {
      log({ type: 'status_change', description: `Changed "${updatedTask.name}" status: ${STATUS_LABEL[oldTask.status || 'Planned']} → ${STATUS_LABEL[updatedTask.status]}${tag}` });
    }
    if ((oldTask.checkIns?.length || 0) < (updatedTask.checkIns?.length || 0)) {
      log({ type: 'checkin', description: `Posted check-in on "${updatedTask.name}"${tag}` });
    }
    if ((oldTask.updates?.length || 0) < (updatedTask.updates?.length || 0)) {
      const newest = (updatedTask.updates || [])[0];
      log({ type: 'task_update', description: `Posted update on "${updatedTask.name}"${newest?.isBlocker ? ' 🚨 Blocker' : ''}${tag}` });
    }
    if (oldTask.name !== updatedTask.name) {
      log({ type: 'task_rename', description: `Renamed task "${oldTask.name}" → "${updatedTask.name}"${tag}` });
    }
    const oldMode = oldTask.creditSharesMode || 'auto';
    const newMode = updatedTask.creditSharesMode || 'auto';
    if (oldMode !== newMode) {
      log({ type: 'credit_mode_change', description: `Credit shares for "${updatedTask.name}": ${oldMode} → ${newMode}${tag}` });
    }
    const oldShares = JSON.stringify(oldTask.creditShares || {});
    const newShares = JSON.stringify(updatedTask.creditShares || {});
    if (oldShares !== newShares && newMode === 'manual') {
      const fmt = (s) => Object.entries(JSON.parse(s)).map(([n, v]) => `${n}:${Math.round(Number(v) * 10) / 10}%`).join(', ') || '—';
      log({ type: 'credit_shares_change', description: `Credit shares manually edited on "${updatedTask.name}": ${fmt(oldShares)} → ${fmt(newShares)}${tag}` });
    }
    const oldReq = oldTask.deadlineRequest;
    const newReq = updatedTask.deadlineRequest;
    if (!oldReq && newReq) {
      log({ type: 'deadline_request', description: `${newReq.requestedBy} requested to ${newReq.action || 'change'} "${updatedTask.name}" deadline by ${Math.abs(newReq.days || 0)}d → ${fmtDateShort(newReq.newDate)}${tag}` });
    } else if (oldReq && !newReq) {
      const lastHist = (updatedTask.deadlineRequestHistory || []).slice(-1)[0];
      if (lastHist) {
        const verb = lastHist.status === 'approved' ? 'Approved' : lastHist.status === 'rejected' ? 'Rejected' : 'Cancelled';
        log({ type: 'deadline_request_' + lastHist.status, description: `${verb} ${oldReq.requestedBy}'s deadline request on "${updatedTask.name}"${lastHist.resolverNote ? ' — ' + lastHist.resolverNote : ''}${tag}` });
      }
    }
    if ((oldTask.deadlineType || 'hard') !== (updatedTask.deadlineType || 'hard')) {
      log({ type: 'deadline_type_change', description: `Changed "${updatedTask.name}" deadline type: ${oldTask.deadlineType || 'hard'} → ${updatedTask.deadlineType || 'hard'}${tag}` });
    }
  }, [updateProject, logActivityForProject, rolesNowFor, runV2Close, setTaskNow, flushProjectSave]); // reads projectsRef.current
  const applyTaskUpdateRef = useRef(applyTaskUpdate);
  applyTaskUpdateRef.current = applyTaskUpdate;

  const onTaskUpdate = (updatedTask) => {
    if (!project) return;
    applyTaskUpdate(updatedTask, project.id);
  };

  // v30 — Patch a single action item in any project. Used by My Work's
  // "Mark done" buttons in needs-attention + action-items sections.
  const applyActionUpdate = useCallback((updatedAction, projectId, source = '', actingAs = '') => {
    const targetProj = projects[projectId];
    if (!targetProj) return;
    const oldAction = (targetProj.actionItems || []).find((a) => a.id === updatedAction.id);
    const updated = cloneDeep(targetProj);
    updated.actionItems = (updated.actionItems || []).map((a) => a.id === updatedAction.id ? { ...a, ...updatedAction } : a);
    updateProject(updated);

    const tag = source ? ` (from ${source})` : '';
    const actingPrefix = actingAs ? `acting as ${actingAs}: ` : '';
    const log = (entry) => logActivityForProject(projectId, {
      ...entry,
      description: actingPrefix + entry.description,
    });
    if (!oldAction) return;

    if (oldAction.status !== updatedAction.status) {
      if (updatedAction.status === 'Done') {
        log({ type: 'action_complete', description: `Marked action done: "${updatedAction.title}"${tag}` });
      } else {
        log({ type: 'action_status_change', description: `Action "${updatedAction.title}": ${oldAction.status || 'Pending'} → ${updatedAction.status}${tag}` });
      }
    }
    if (oldAction.title !== updatedAction.title) {
      log({ type: 'action_rename', description: `Renamed action "${oldAction.title}" → "${updatedAction.title}"${tag}` });
    }
    if (oldAction.pic !== updatedAction.pic) {
      log({ type: 'action_reassign', description: `Reassigned action "${updatedAction.title}": ${oldAction.pic || '—'} → ${updatedAction.pic || '—'}${tag}` });
    }
    if (oldAction.dueDate !== updatedAction.dueDate) {
      log({ type: 'action_due_change', description: `Changed action "${updatedAction.title}" due date: ${oldAction.dueDate ? fmtDateShort(oldAction.dueDate) : '—'} → ${updatedAction.dueDate ? fmtDateShort(updatedAction.dueDate) : '—'}${tag}` });
    }
    if (oldAction.priority !== updatedAction.priority) {
      log({ type: 'action_priority_change', description: `Changed action "${updatedAction.title}" priority: ${oldAction.priority || '—'} → ${updatedAction.priority || '—'}${tag}` });
    }
    if ((oldAction.updates?.length || 0) < (updatedAction.updates?.length || 0)) {
      const newest = (updatedAction.updates || [])[0];
      log({ type: 'action_comment', description: `Posted comment on action "${updatedAction.title}"${newest?.isBlocker ? ' 🚨 Blocker' : ''}${tag}` });
    }
    // v30.B — Sub-task diffs (by id; reorder is invisible)
    const oldSubs = oldAction.subtasks || [];
    const newSubs = updatedAction.subtasks || [];
    const oldSubMap = new Map(oldSubs.map((s) => [s.id, s]));
    const newSubMap = new Map(newSubs.map((s) => [s.id, s]));
    for (const [id, sub] of newSubMap.entries()) {
      if (oldSubMap.has(id)) continue;
      log({ type: 'subtask_create', description: `Added sub-task "${sub.title || '(empty)'}" → ${sub.pic || '—'} on "${updatedAction.title}"${tag}` });
    }
    for (const [id, sub] of oldSubMap.entries()) {
      if (newSubMap.has(id)) continue;
      log({ type: 'subtask_delete', description: `Removed sub-task "${sub.title || '(empty)'}" from "${updatedAction.title}"${tag}` });
    }
    for (const [id, sub] of newSubMap.entries()) {
      const prev = oldSubMap.get(id);
      if (!prev) continue;
      if (prev.status !== sub.status) {
        if (sub.status === 'Done') {
          log({ type: 'subtask_complete', description: `Sub-task done: "${sub.title}" on "${updatedAction.title}" (${sub.pic || '—'})${tag}` });
        } else {
          log({ type: 'subtask_status_change', description: `Sub-task "${sub.title}" reverted to ${sub.status} on "${updatedAction.title}"${tag}` });
        }
      }
      if (prev.pic !== sub.pic) {
        log({ type: 'subtask_reassign', description: `Sub-task "${sub.title}" reassigned: ${prev.pic || '—'} → ${sub.pic || '—'} on "${updatedAction.title}"${tag}` });
      }
      if (prev.title !== sub.title) {
        log({ type: 'subtask_rename', description: `Sub-task renamed: "${prev.title}" → "${sub.title}" on "${updatedAction.title}"${tag}` });
      }
    }
  }, [projects, updateProject, logActivityForProject]);

  // v30.A.2 — Apply a decision update to any project. Diff-logger covers
  // followUpStatus only (Phase A.2 inline scope). Other field edits go
  // through DecisionsView's saveDecision path which is unchanged.
  const applyDecisionUpdate = useCallback((updatedDecision, projectId, source = '', actingAs = '') => {
    const targetProj = projects[projectId];
    if (!targetProj) return;
    const oldDecision = (targetProj.decisions || []).find((d) => d.id === updatedDecision.id);
    const updated = cloneDeep(targetProj);
    updated.decisions = (updated.decisions || []).map((d) => d.id === updatedDecision.id ? { ...d, ...updatedDecision } : d);
    updateProject(updated);
    const tag = source ? ` (from ${source})` : '';
    const actingPrefix = actingAs ? `acting as ${actingAs}: ` : '';
    if (oldDecision && oldDecision.followUpStatus !== updatedDecision.followUpStatus) {
      const snippet = (updatedDecision.text || '').slice(0, 60);
      const ellipsis = (updatedDecision.text || '').length > 60 ? '…' : '';
      logActivityForProject(projectId, {
        type: 'decision_status_change',
        description: `${actingPrefix}Decision "${snippet}${ellipsis}": ${oldDecision.followUpStatus || 'Open'} → ${updatedDecision.followUpStatus}${tag}`,
      });
    }
  }, [projects, updateProject, logActivityForProject]);

  // v30 RAID Phase 2 — Apply a RAID item update to any project/program.
  // updatedItem must include `id`. If `programId` does not contain an item
  // with that id, the item is treated as new and appended to that program's
  // raid array. Otherwise the existing item is shallow-merged.
  // Diff-logger emits typed raid_* activity entries with the standard
  // `(from <source>)` suffix and `acting as <name>: ` prefix conventions.
  const applyRaidUpdate = useCallback((updatedItem, projectId, programId, source = '', actingAs = '') => {
    const targetProj = projects[projectId];
    if (!targetProj) return;
    const program = (targetProj.programs || []).find((p) => p.id === programId);
    if (!program) return;
    const oldItem = (program.raid || []).find((r) => r.id === updatedItem.id);

    const updated = cloneDeep(targetProj);
    updated.programs = updated.programs.map((p) => {
      if (p.id !== programId) return p;
      const existing = (p.raid || []).some((r) => r.id === updatedItem.id);
      if (existing) {
        return { ...p, raid: (p.raid || []).map((r) => r.id === updatedItem.id ? { ...r, ...updatedItem } : r) };
      }
      return { ...p, raid: [...(p.raid || []), updatedItem] };
    });
    updateProject(updated);

    const tag = source ? ` (from ${source})` : '';
    const actingPrefix = actingAs ? `acting as ${actingAs}: ` : '';
    const log = (entry) => logActivityForProject(projectId, {
      ...entry,
      description: actingPrefix + entry.description,
    });

    // New item — single "create" entry; skip diff comparison.
    if (!oldItem) {
      log({
        type: 'raid_create',
        description: `Created ${updatedItem.type || 'RAID item'} "${updatedItem.title || '(untitled)'}" in ${program.name}${tag}`,
      });
      return;
    }

    // Status transitions — emit specific events for the important ones.
    if (oldItem.status !== updatedItem.status) {
      if (updatedItem.status === 'Active' && oldItem.status === 'PendingApproval') {
        log({ type: 'raid_approve', description: `Approved ${updatedItem.type} "${updatedItem.title}"${tag}` });
      } else if (updatedItem.status === 'Draft' && oldItem.status === 'PendingApproval') {
        log({ type: 'raid_reject', description: `Rejected ${updatedItem.type} "${updatedItem.title}" — returned to Draft${tag}` });
      } else if (updatedItem.status === 'Closed' || updatedItem.status === 'Resolved' || updatedItem.status === 'Accepted') {
        log({ type: 'raid_close', description: `${updatedItem.type} "${updatedItem.title}": ${oldItem.status} → ${updatedItem.status}${tag}` });
      } else {
        log({ type: 'raid_status_change', description: `${updatedItem.type} "${updatedItem.title}": ${oldItem.status} → ${updatedItem.status}${tag}` });
      }
    }

    // Trend change — emitted when explicit review note is added (length of history grew).
    if ((oldItem.history?.length || 0) < (updatedItem.history?.length || 0)) {
      const newest = updatedItem.history[updatedItem.history.length - 1];
      const trendLabel = (RAID_TREND_CONFIG[newest?.trend]?.label) || newest?.trend || '—';
      log({
        type: 'raid_review',
        description: `Added review note (${trendLabel}) on ${updatedItem.type} "${updatedItem.title}"${tag}`,
      });
    }

    // Mitigation action diffs — additions, completions, deletions.
    const oldActs = oldItem.mitigationActions || [];
    const newActs = updatedItem.mitigationActions || [];
    const oldActMap = new Map(oldActs.map((a) => [a.id, a]));
    const newActMap = new Map(newActs.map((a) => [a.id, a]));
    for (const [id, act] of newActMap.entries()) {
      if (oldActMap.has(id)) continue;
      log({ type: 'raid_action_add', description: `Added mitigation "${act.name}" → ${act.pic || '—'} on "${updatedItem.title}"${tag}` });
    }
    for (const [id, act] of oldActMap.entries()) {
      if (newActMap.has(id)) continue;
      log({ type: 'raid_action_remove', description: `Removed mitigation "${act.name}" from "${updatedItem.title}"${tag}` });
    }
    for (const [id, act] of newActMap.entries()) {
      const prev = oldActMap.get(id);
      if (!prev) continue;
      if (prev.status !== act.status && act.status === 'Done') {
        log({ type: 'raid_action_done', description: `Mitigation done: "${act.name}" on "${updatedItem.title}" (${act.pic || '—'})${tag}` });
      }
    }
  }, [projects, updateProject, logActivityForProject]);

  // v30 RAID Phase 2 — Delete a RAID item. Distinct from applyRaidUpdate because
  // delete is not a merge. Logs a typed raid_delete event.
  const deleteRaidItem = useCallback((itemId, projectId, programId, source = '', actingAs = '') => {
    const targetProj = projects[projectId];
    if (!targetProj) return;
    const program = (targetProj.programs || []).find((p) => p.id === programId);
    const oldItem = (program?.raid || []).find((r) => r.id === itemId);
    if (!oldItem) return;
    const updated = cloneDeep(targetProj);
    updated.programs = updated.programs.map((p) =>
      p.id !== programId ? p : { ...p, raid: (p.raid || []).filter((r) => r.id !== itemId) }
    );
    updateProject(updated);
    const tag = source ? ` (from ${source})` : '';
    const actingPrefix = actingAs ? `acting as ${actingAs}: ` : '';
    logActivityForProject(projectId, {
      type: 'raid_delete',
      description: `${actingPrefix}Deleted ${oldItem.type} "${oldItem.title}"${tag}`,
    });
  }, [projects, updateProject, logActivityForProject]);

  // v30.A.1 — Create a new action in any project (from My Work entry points).
  // Prepends to actionItems so it shows immediately at the top of the
  // Actions tab list. Activity log entry tags "(from My Work)".
  const createActionFromMyWork = useCallback((newAction, projectId, actingAs = '', opts = {}) => {
    if (impersonatingRef.current) { showToastRef.current(READ_ONLY_MESSAGE); return; } // P3-16: no Chat post either
    const targetProj = projects[projectId];
    if (!targetProj) return;
    const updated = cloneDeep(targetProj);
    updated.actionItems = [newAction, ...(updated.actionItems || [])];
    updateProject(updated);
    const actingPrefix = actingAs ? `acting as ${actingAs}: ` : '';
    logActivityForProject(projectId, {
      type: 'action_create',
      description: `${actingPrefix}Created action: "${newAction.title}" → ${newAction.pic || '—'} (from My Work)`,
    });
    // v30 — notify chat on create (opt-in). Never blocks the create.
    if (opts.notifyChat && targetProj.googleChatWebhook) {
      const related = newAction.relatedTaskId ? findTaskInProject(targetProj, newAction.relatedTaskId) : null;
      postToChat(targetProj.googleChatWebhook, buildNewActionCard({
        project: targetProj, action: newAction, related, author: effectiveAuthor,
      })).then((res) => {
        showToast(res.ok
          ? `Action created in ${targetProj.name} · 📢 Sent to chat`
          : `Action created. Chat notify failed: ${res.status} ${res.statusText}`);
      });
    } else {
      showToast(`Action created in ${targetProj.name}`);
    }
  }, [projects, updateProject, logActivityForProject, effectiveAuthor]);

  // v30 — Owner-only inline approve/reject of a deadline change request,
  // callable from My Work needs-attention. Mirrors TaskDetail's flow but
  // operates cross-project. State mutations route through applyTaskUpdate
  // so the standard diff-logger emits the audit trail.
  const myWorkApproveDeadline = async (taskId, projectId) => {
    if (!isOwner) return;
    const targetProj = projects[projectId];
    if (!targetProj) return;
    const loc = findTaskInProject(targetProj, taskId);
    if (!loc || !loc.task.deadlineRequest) return;
    const task = loc.task;
    const req = task.deadlineRequest;
    const ok = await dialogs.confirm({
      title: `Approve deadline ${req.action || 'change'}?`,
      message: `Apply new end date ${fmtDateShort(req.newDate)} to "${task.name}"? This will be recorded in the audit log.`,
      okLabel: 'Approve',
    });
    if (!ok) return;
    const histEntry = {
      id: uid('dh'),
      from: task.end || null,
      to: req.newDate,
      changedBy: req.requestedBy,
      changedAt: new Date().toISOString(),
      reason: req.reason,
      approvedBy: author,
      approvedAt: new Date().toISOString(),
    };
    const reqHistEntry = { ...req, status: 'approved', resolvedBy: author, resolvedAt: new Date().toISOString() };
    applyTaskUpdate({
      ...task,
      end: req.newDate,
      deadlineRequest: null,
      deadlineHistory: [...(task.deadlineHistory || []), histEntry],
      deadlineRequestHistory: [...(task.deadlineRequestHistory || []), reqHistEntry],
    }, projectId, 'My Work');
  };

  const myWorkRejectDeadline = async (taskId, projectId) => {
    if (!isOwner) return;
    const targetProj = projects[projectId];
    if (!targetProj) return;
    const loc = findTaskInProject(targetProj, taskId);
    if (!loc || !loc.task.deadlineRequest) return;
    const task = loc.task;
    const req = task.deadlineRequest;
    const note = await dialogs.prompt({
      title: 'Reject deadline change?',
      message: `Optionally explain why "${req.requestedBy}" should keep the original deadline.`,
      placeholder: 'e.g., Dependencies on this task; please re-prioritize',
      okLabel: 'Reject',
      allowEmpty: true,
    });
    if (note === null) return;
    const reqHistEntry = {
      ...req, status: 'rejected',
      resolvedBy: author, resolvedAt: new Date().toISOString(),
      resolverNote: (note || '').trim() || null,
    };
    applyTaskUpdate({
      ...task,
      deadlineRequest: null,
      deadlineRequestHistory: [...(task.deadlineRequestHistory || []), reqHistEntry],
    }, projectId, 'My Work');
  };

  // CLAUDE.md: never hard-delete a task — mark it Dropped (reversible, keeps history and credit trail).
  const onTaskDelete = async (task) => {
    if (!project) return;
    const ok = await dialogs.confirm({ title: 'Drop task?', message: `Mark task "${task.name}" as Dropped? It stays in the plan (greyed out) and can be reopened by changing its status.`, okLabel: 'Drop task' });
    if (!ok) return;
    applyTaskUpdate({ ...task, status: 'Dropped' }, project.id);
    setSelectedTaskId(null);
  };

  const switchProject = async (id) => {
    if (!id || !meta) return;
    setCurrentId(id);
    setSelectedTaskId(null);
    setScopeProgramId(null);
    setActivity([]);
    setActivityLoadedId(null);
    rememberCurrentProject(id);
    setMeta({ ...meta, currentProjectId: id });
  };

  // C1: load the activity log only when a view that shows it is open.
  useEffect(() => {
    if (view !== 'dashboard' && view !== 'activity') return;
    if (!currentId || currentId === '__all__' || activityLoadedId === currentId) return;
    let cancelled = false;
    const id = currentId;
    (async () => {
      const list = await loadActivityStrict(id);
      if (cancelled || !list) return; // failed read: keep the list, stay unloaded so it retries
      setActivity(list);
      setActivityLoadedId(id);
    })();
    return () => { cancelled = true; };
  }, [view, currentId, activityLoadedId]);

  const retryFailedLoads = async () => {
    const ids = loadFailed;
    const results = await Promise.all(ids.map((pid) => loadProject(pid)));
    const got = {};
    ids.forEach((pid, i) => { if (results[i]) got[pid] = ensureProjectRaid(results[i]); });
    if (Object.keys(got).length) setProjects((prev) => ({ ...prev, ...got }));
    setLoadFailed(loadFailures(ids, results));
  };

  const changeOwnership = async (action, newOwner) => {
    if (transferLocked(meta)) { showToast(TRANSFER_LOCKED_MESSAGE); return false; }
    const oldOwner = meta?.workspaceOwner || null;
    const entry = {
      id: uid('own'),
      ts: new Date().toISOString(),
      by: authUser?.email || author,
      action,
      from: oldOwner,
      to: newOwner,
    };
    const m2 = {
      ...meta,
      workspaceOwner: newOwner,
      ownershipLog: [...(meta?.ownershipLog || []), entry],
    };
    // B1: save first; only update local state and log if the server accepted it.
    const ok = await saveMetaOwnerFields(m2);
    if (!ok) return false;
    setMeta(m2);
    if (currentId && currentId !== '__all__') {
      await logActivity({ type: 'ownership_change', description: `Transferred workspace owner: ${oldOwner} → ${newOwner}` });
    }
    return true;
  };

  const renameCurrentProject = async () => {
    if (!project) return;
    const name = await dialogs.prompt({ title: 'Rename project', initial: project.name, okLabel: 'Rename' });
    if (!name || name === project.name) return;
    const old = project.name;
    const updated = { ...project, name };
    updateProject(updated);
    logActivity({ type: 'project_rename', description: `Renamed project "${old}" → "${name}"` });
    showToast(`Renamed to "${name}"`);
  };

  const createNewProject = async (name) => {
    const p = {
      id: uid('proj'),
      name: name.trim(),
      createdAt: new Date().toISOString(),
      programs: [], decisions: [], actionItems: [],
      creditPoints: DEFAULT_CREDIT_POINTS,
      creditYear: new Date().getFullYear(),
      projectLeadShare: 10,
      contributorRegistry: DEFAULT_DEPARTMENTS.map((nm) => ({ name: nm })),
    };
    if (await saveProject(p) !== 'ok') {
      showToast('Couldn’t create the project — nothing was saved. Check your connection and try again.');
      return;
    }
    const m2 = { ...meta, projectIds: [...meta.projectIds, p.id], currentProjectId: p.id };
    setMeta(m2); await saveMeta(m2);
    setProjects((prev) => ({ ...prev, [p.id]: p }));
    setCurrentId(p.id);
    setActivity([]);
    setShowNewProject(false);
    const entry = { id: uid('act'), timestamp: new Date().toISOString(), author, type: 'project_create', description: `Created project "${p.name}"` };
    await appendActivity(p.id, entry);
    setActivity([entry]);
    showToast(`Created project “${p.name}”`);
  };

  const handleFileImport = async (file) => {
    if (!file) return;
    if (!isOwner) { showToast('Only the workspace Owner can import a new project.'); return; }
    try {
      const imported = await parseExcelFile(file, dirIndex);
      // Append (2) etc if duplicate name
      const names = new Set(Object.values(projects).map((p) => p.name));
      let finalName = imported.name, i = 2;
      while (names.has(finalName)) finalName = `${imported.name} (${i++})`;
      if (finalName !== imported.name) {
        showToast(`A project named "${imported.name}" already exists. Imported as "${finalName}".`);
        imported.name = finalName;
      }
      if (await saveProject(imported) !== 'ok') {
        showToast('Couldn’t save the imported project — nothing was added. Check your connection and try again.');
        return;
      }
      const m2 = { ...meta, projectIds: [...meta.projectIds, imported.id], currentProjectId: imported.id };
      setMeta(m2); await saveMeta(m2);
      setProjects((prev) => ({ ...prev, [imported.id]: imported }));
      setCurrentId(imported.id);
      const tasks = collectTasks(imported).length;
      const entry = { id: uid('act'), timestamp: new Date().toISOString(), author, type: 'project_import', description: `Imported project "${imported.name}" (${tasks} tasks)` };
      await appendActivity(imported.id, entry);
      setActivity([entry]);
      setShowImport(false);
      showToast(`Imported "${imported.name}" · ${tasks} tasks`);

      // Post-import validation: detect unrecognized PICs/contributors (v29)
      const registryNames = new Set((imported.contributorRegistry || []).map((r) => r.name.toLowerCase()));
      const memberNames = new Set((imported.teamMembers || []).map((m) => m.name.toLowerCase()));
      const unknownContributors = new Map();
      const unknownPics = new Map();
      for (const pg of (imported.programs || [])) {
        for (const ws of (pg.workstreams || [])) {
          for (const t of (ws.tasks || [])) {
            for (const c of (t.contributors || [])) {
              const cs = String(c).toLowerCase();
              if (!registryNames.has(cs) && !memberNames.has(cs)) {
                unknownContributors.set(String(c), (unknownContributors.get(String(c)) || 0) + 1);
              }
            }
            if (t.pic) {
              const ps = String(t.pic).toLowerCase();
              if (!memberNames.has(ps)) {
                unknownPics.set(String(t.pic), (unknownPics.get(String(t.pic)) || 0) + 1);
              }
            }
          }
        }
      }
      if (unknownContributors.size > 0 || unknownPics.size > 0) {
        const lines = [];
        if (unknownPics.size > 0) {
          lines.push(`PICs not in team members (${unknownPics.size} unique):`);
          for (const [n, c] of Array.from(unknownPics.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
            lines.push(`  • ${n} — ${c} task${c === 1 ? '' : 's'}`);
          }
          if (unknownPics.size > 8) lines.push(`  ... and ${unknownPics.size - 8} more`);
          lines.push('');
        }
        if (unknownContributors.size > 0) {
          lines.push(`Contributors not in registry (${unknownContributors.size} unique):`);
          for (const [n, c] of Array.from(unknownContributors.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
            lines.push(`  • ${n} — ${c} task${c === 1 ? '' : 's'}`);
          }
          if (unknownContributors.size > 8) lines.push(`  ... and ${unknownContributors.size - 8} more`);
          lines.push('');
        }
        lines.push('→ Open Project Settings to add these to team members / contributor registry, or use the Cleanup tool to merge with existing entries.');
        await dialogs.alert({
          title: '⚠ Import warnings — unrecognized names',
          message: lines.join('\n'),
        });
      }
    } catch (err) {
      await dialogs.alert({ title: 'Import failed', message: err.message || 'Could not parse the file.' });
    }
  };

  const exportExcel = () => {
    if (!project) return;
    const blob = projectToExcelBlob(project);
    downloadBlob(blob, project.name.replace(/[^a-z0-9]+/gi, '_') + '_' + toISODate(new Date()) + '.xlsx');
  };
  const backupJson = async () => {
    const everything = { meta, projects, activity: {} };
    const unreadable = [];
    for (const pid of meta.projectIds) {
      const list = await loadActivityStrict(pid);
      if (list === null) unreadable.push((projects[pid] && projects[pid].name) || pid);
      else everything.activity[pid] = list;
    }
    if (unreadable.length) { await dialogs.alert({ title: "Backup not created", message: `Couldn't read the activity of: ${unreadable.join(', ')}. Check your connection and try again.` }); return; }
    const blob = new Blob([JSON.stringify(everything, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'workspace_backup_' + toISODate(new Date()) + '.json');
    showToast('Backup downloaded');
  };
  const restoreJson = async (file) => {
    const ok = await dialogs.confirm({ title: 'Restore workspace?', message: 'This will REPLACE the shared data (tasks, check-ins, activity) of the projects in this backup. Projects that use the new storage are skipped. Continue?', danger: true, okLabel: 'Restore' });
    if (!ok) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.meta || !data.projects) throw new Error('Invalid backup file.');
      const { v1Ids, v2Ids } = splitRestoreByV2(data, projects);
      if (v1Ids.length === 0 && v2Ids.length > 0) { await dialogs.alert({ title: "Can't restore", message: V2_RESTORE_MESSAGE }); return; }
      await saveMeta(data.meta);
      const results = [];
      for (const pid of v1Ids) {
        if (!data.projects[pid]) continue;
        // Explicit restore overrides the stale-write guard (B3) for this write only.
        const status = await saveProject({ ...data.projects[pid], [FORCE_WRITE_FLAG]: true });
        results.push({ name: data.projects[pid].name || pid, status });
        if (activityToRestore(status, data.activity && data.activity[pid])) await ssetShared(K.activity(pid), JSON.stringify(data.activity[pid]));
      }
      const failed = failedRestores(results);
      if (failed.length) {
        await dialogs.alert({ title: 'Restore incomplete', message: `These projects were NOT restored: ${failed.join(', ')}. Check your permissions or connection and try again. Other projects were restored.` });
      }
      if (v2Ids.length) {
        const names = v2Ids.map((pid) => data.projects[pid].name || pid).join(', ');
        await dialogs.alert({ title: 'Some projects skipped', message: `${V2_RESTORE_MESSAGE} Skipped: ${names}.` });
      }
      window.location.reload();
    } catch (err) { await dialogs.alert({ title: 'Restore failed', message: err.message }); }
  };
  const deleteCurrentProject = async () => {
    if (!project || !meta) return;
    if (meta.projectIds.length === 1) { await dialogs.alert({ title: 'Cannot delete', message: 'This is the only project in the workspace.' }); return; }
    const ok = await dialogs.confirm({ title: 'Delete project?', message: `Delete project "${project.name}" and all its data (tasks, check-ins, activity)? This cannot be undone.`, danger: true, okLabel: 'Delete' });
    if (!ok) return;
    await deleteProjectStore(project.id);
    const remaining = meta.projectIds.filter((pid) => pid !== project.id);
    const next = remaining[0];
    const m2 = { ...meta, projectIds: remaining, currentProjectId: next };
    setMeta(m2); await saveMeta(m2);
    const np = { ...projects }; delete np[project.id]; setProjects(np);
    setCurrentId(next);
    setActivity([]); setActivityLoadedId(null);
    showToast(`Deleted project "${project.name}"`);
  };

  if (bootError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: FONT_STACK, background: TOK.bg, color: TOK.muted, fontSize: 13 }}>
        <div>Couldn't load AF-MPT — check your connection.</div>
        <Btn variant="primary" onClick={() => window.location.reload()}>Retry</Btn>
      </div>
    );
  }

  if (loading || (author && view === null)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: FONT_STACK, background: TOK.bg, color: TOK.muted, fontSize: 13 }}>
        Loading workspace…
      </div>
    );
  }

  // Auth gate. AuthGate (auth.tsx) only renders App when Firebase user is
  // signed in, so authUser is non-null here. Identity auto-derives from the
  // Google profile via the effect above; we just show a brief loader during
  // the race between authUser arriving and author state catching up.
  if (!author) {
    // AuthGate (auth.tsx) only renders App when Firebase user !== null, so
    // authUser is always present here. The auto-derive effect above sets
    // author from authUser.name/email moments after render. Show a brief
    // loader during that race.
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: FONT_STACK, background: TOK.bg, color: TOK.muted, fontSize: 13 }}>
        Signing you in as {authUser?.email || '…'}…
      </div>
    );
  }

  const r = project ? rollup(project) : null;

  return (
    <DirectoryIndexContext.Provider value={dirIndex}><MeContext.Provider value={meValue}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 999px; border: 2px solid ${TOK.bg}; }
        ::-webkit-scrollbar-track { background: ${TOK.bg}; }
      `}</style>

      <div style={{
        display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden',
        fontFamily: FONT_STACK, color: TOK.ink, background: TOK.bg, fontSize: 13, position: 'relative',
      }}>
        {impersonatingAs && (
          <ImpersonationBanner
            actingAs={impersonatingAs}
            realAuthor={author}
            onExit={clearImpersonation}
          />
        )}
        {/* Top bar */}
        <div style={{ background: TOK.surface, borderBottom: '1px solid ' + TOK.line, padding: '10px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Project Tracker</div>
            <ChevronRight size={12} color={TOK.muted} />
            <select value={currentId || ''} onChange={(e) => switchProject(e.target.value)}
              style={{ fontFamily: FONT_STACK, fontSize: 13, padding: '6px 24px 6px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, background: TOK.surface, color: TOK.ink, cursor: 'pointer', fontWeight: 500 }}>
              <option value="__all__">🌐 All projects</option>
              <option disabled>──────────</option>
              {meta.projectIds.map((pid) => <option key={pid} value={pid}>{projects[pid]?.name || '(unknown)'}</option>)}
            </select>
            {project && project.__v2 && (() => {
              // Wave 1 U6: my highest role on this (v2) project; tooltip lists all.
              const rs = myRoleSummary(project.__v2.roles || null, meValue?.uid || null, project);
              const viewOnly = rs.label === 'View only';
              return (
                <span data-tour="role-chip" title={rs.detail.join('\n')} style={{
                  fontSize: 11, fontFamily: FONT_STACK, whiteSpace: 'nowrap', padding: '2px 8px', borderRadius: 999,
                  border: '1px solid ' + (viewOnly ? TOK.line : TOK.lineStrong),
                  background: viewOnly ? TOK.bg : TOK.surface,
                  color: viewOnly ? TOK.muted : TOK.ink, fontWeight: viewOnly ? 400 : 500,
                }}>Your role: {rs.label}</span>
              );
            })()}
            <span data-tour="project-menu" style={{ display: 'inline-flex' }}><Btn size="sm" variant="ghost" onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setProjectMenu({ x: rect.left, y: rect.bottom + 4 });
            }} title="Project options"><MoreHorizontal size={12} /></Btn></span>
            {isOwner && <Btn size="sm" variant="ghost" onClick={() => setShowNewProject(true)} title="New project"><Plus size={12} /></Btn>}
            {isOwner && <Btn size="sm" variant="ghost" onClick={() => setShowImport(true)} title="Import Excel"><FileUp size={12} /></Btn>}
            <span data-tour="search" style={{ display: 'inline-flex' }}><Btn size="sm" variant="ghost" onClick={() => setShowSearch(true)} title="Search across projects (Ctrl/Cmd+K)"><Search size={12} /></Btn></span>
            <span data-tour="members" style={{ display: 'inline-flex' }}><Btn size="sm" variant="ghost" onClick={() => setShowMembers(true)} title="Manage members & related parties" disabled={!project}><UserCircle size={12} /></Btn></span>
            <span data-tour="help" style={{ display: 'inline-flex' }}><Btn size="sm" variant="ghost" onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); setHelpMenu({ x: Math.max(8, rect.left - 120), y: rect.bottom + 4 }); }} title="Help"><HelpCircle size={12} /></Btn></span>
          </div>

          {/* Scope / focus selector */}
          {project && (project.programs || []).length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', borderLeft: '1px solid ' + TOK.line }}>
              <span style={{ fontSize: 11, color: TOK.muted, fontWeight: 500 }}>FOCUS</span>
              <select value={scopeProgramId || ''} onChange={(e) => setScopeProgramId(e.target.value || null)}
                style={{ fontFamily: FONT_STACK, fontSize: 12, padding: '5px 22px 5px 8px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface, color: TOK.ink, cursor: 'pointer' }}>
                <option value="">All programs</option>
                {(project.programs || []).map((pg) => <option key={pg.id} value={pg.id}>{pg.name}</option>)}
              </select>
            </div>
          )}

          {project && r && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '0 12px', borderLeft: '1px solid ' + TOK.line }}>
              <div style={{ fontSize: 11, color: TOK.muted }}>
                <span style={{ color: TOK.accent, fontWeight: 500, fontSize: 13 }}>{r.pct}%</span> · {r.done}/{r.total} complete
              </div>
              {r.overdue > 0 && <span style={{ fontSize: 11, color: TOK.overdueFg, display: 'flex', alignItems: 'center', gap: 3 }}><AlertTriangle size={11} /> {r.overdue} overdue</span>}
            </div>
          )}

          <div style={{ flex: 1 }} />

          {(() => {
            const chip = saveChip({ pending: pendingN, saveState, lastSavedAt });
            if (!chip.label) return null;
            const col = chip.tone === 'error' ? TOK.overdueFg : chip.tone === 'ok' ? TOK.doneFg : TOK.muted;
            const st = { fontSize: 11, color: col, whiteSpace: 'nowrap', fontFamily: FONT_STACK };
            return chip.retry
              ? <button onClick={retryFailedSaves} title="Retry saving" style={{ ...st, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>{chip.label}</button>
              : <span role="status" style={st}>{chip.label}</span>;
          })()}

          <div data-tour="view-tabs" style={{ display: 'flex', gap: 2, padding: 2, background: TOK.bg, borderRadius: 8, flexWrap: 'wrap' }}>
            {(() => {
              const allTabs = [
                { id: 'my-work', label: 'My Work', icon: <UserCircle size={12} /> },
                { id: 'mindmap', label: 'Mind map', icon: <MapIcon size={12} /> },
                { id: 'outline', label: 'Outline', icon: <ListIcon size={12} /> },
                { id: 'gantt', label: 'Gantt', icon: <BarChart3 size={12} /> },
                { id: 'dashboard', label: 'Dashboard', icon: <Home size={12} /> },
                { id: 'decisions', label: 'Decisions', icon: <CheckCircle2 size={12} />, count: (project?.decisions?.length || 0) },
                { id: 'actions', label: 'Actions', icon: <Activity size={12} />, count: (project?.actionItems?.length || 0) },
                { id: 'aggregation', label: 'Aggregation', icon: <Activity size={12} /> },
                { id: 'raid', label: 'RAID', icon: <AlertTriangle size={12} /> },
                // Wave 1 U5: Activity is Owner-only for now (Q3).
                ...(isOwner ? [{ id: 'activity', label: 'Activity', icon: <Activity size={12} />, ownerOnly: true }] : []),
                ...(isOwner ? [{ id: 'portfolio', label: 'Portfolio', icon: <Home size={12} />, ownerOnly: true }] : []),
                ...(isOwner ? [{ id: 'credit-report', label: 'Credits', icon: <Activity size={12} />, ownerOnly: true }] : []),
                ...(isOwner ? [{ id: 'team-overview', label: 'Team', icon: <Users size={12} />, ownerOnly: true }] : []),
              ];
              // v30 Phase 3 — during impersonation, only My Work tab is visible.
              const visibleTabs = impersonatingAs ? allTabs.filter((t) => t.id === 'my-work') : allTabs;
              return visibleTabs.map((v) => (
                <button key={v.id} data-tour={'tab-' + v.id} onClick={() => {
                  if (v.id === 'raid') setRaidScopeProgramId(null);
                  setView(v.id);
                }} style={{
                  fontFamily: FONT_STACK, fontSize: 12, fontWeight: 500, padding: '5px 10px', borderRadius: 6,
                  border: 'none', background: view === v.id ? TOK.surface : 'transparent',
                  color: v.ownerOnly ? TOK.accent : TOK.ink, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  boxShadow: view === v.id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }} title={v.ownerOnly ? 'Workspace owner only' : undefined}>{v.icon}{v.label}{v.id === 'my-work' && myWorkTabCount > 0 && (
                  <span style={{
                    marginLeft: 2, padding: '0 6px', borderRadius: 999,
                    background: TOK.overdueFg, color: '#fff', fontSize: 10, fontWeight: 500,
                    lineHeight: '14px', minWidth: 16, textAlign: 'center',
                  }}>{myWorkTabCount}</span>
                )}{v.id === 'raid' && raidPendingBadge > 0 && (
                  <span style={{
                    marginLeft: 2, padding: '0 6px', borderRadius: 999,
                    background: '#B7791F', color: '#fff', fontSize: 10, fontWeight: 500,
                    lineHeight: '14px', minWidth: 16, textAlign: 'center',
                  }} title={`${raidPendingBadge} pending approval${raidPendingBadge === 1 ? '' : 's'}`}>{raidPendingBadge}</span>
                )}{v.count > 0 && <span style={{ fontSize: 10, color: TOK.muted, fontWeight: 400 }}>·{v.count}</span>}</button>
              ));
            })()}
          </div>

          <Btn size="sm" variant="primary" onClick={() => setMeetingMode(true)} title="Enter meeting mode (presentation view)">▶ Meeting</Btn>
          <Btn size="sm" onClick={() => { setBriefingDialogIsOwnerMode(false); setShowBriefingDialog(true); }} title="Generate weekly briefing pack">📋 Briefing</Btn>
          <Btn size="sm" onClick={() => setShowMeetingExport(true)} title="Generate meeting minutes"><FileText size={12} /> Minutes</Btn>
          <Btn size="sm" onClick={exportExcel} title="Export to Excel"><FileSpreadsheet size={12} /> Excel</Btn>
          <Btn size="sm" onClick={backupJson} title="Backup all workspace data to JSON"><Download size={12} /></Btn>
          <input type="file" ref={fileInputRef} accept=".json" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && restoreJson(e.target.files[0])} />
          {isOwner && (
            <Btn size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()} title="Restore from JSON backup"><Upload size={12} /></Btn>
          )}
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            title="Account menu"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', background: userMenuOpen ? TOK.surface : TOK.bg,
              border: '1px solid ' + (userMenuOpen ? TOK.lineStrong : 'transparent'),
              borderRadius: 999, fontSize: 11, color: TOK.muted,
              cursor: 'pointer', fontFamily: FONT_STACK,
            }}
            onMouseEnter={(e) => { if (!userMenuOpen) e.currentTarget.style.background = TOK.surface; }}
            onMouseLeave={(e) => { if (!userMenuOpen) e.currentTarget.style.background = TOK.bg; }}
          >
            <UserCircle size={13} /> {author}
            <ChevronDown size={11} style={{ opacity: 0.7 }} />
          </button>
        </div>

        {loadFailed.length > 0 && (
          <div role="alert" style={{ background: TOK.blockerBg, color: TOK.blocker, borderBottom: '1px solid currentColor', padding: '6px 14px', fontSize: 13, fontFamily: FONT_STACK, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {loadFailed.map((pid) => (
              <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>Couldn't load {meta?.names?.[pid] || pid} —</span>
                <Btn size="sm" onClick={retryFailedLoads}>Retry</Btn>
              </div>
            ))}
          </div>
        )}

        {/* Monday banner */}
        {!bannerDismissed && isMonday() && !isBriefingDismissed(todayISODate()) && !(meta?.dismissedBriefingDates || []).includes(todayISODate()) && (
          <div style={{
            padding: '10px 16px',
            background: isOwner ? '#e8f0fe' : '#fff8e1',
            borderBottom: '1px solid ' + (isOwner ? '#c8dcf0' : '#f0e3a0'),
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 18 }}>{isOwner ? '📨' : '📋'}</span>
            <div style={{ flex: 1, fontSize: 13, color: isOwner ? '#1f4e8c' : '#7a5d00' }}>
              <strong>{isOwner ? 'Time to send the weekly digest' : 'Weekly briefing ready'}</strong>
              <span style={{ marginLeft: 8, opacity: 0.85 }}>
                {isOwner
                  ? 'As workspace owner, generate this week\'s digest to share with the team.'
                  : 'Review what changed last week before today\'s meeting.'}
              </span>
            </div>
            <Btn size="sm" variant="primary" onClick={() => {
              setBriefingDialogIsOwnerMode(isOwner);
              setShowBriefingDialog(true);
            }}>
              {isOwner ? 'Generate digest' : 'Generate briefing'}
            </Btn>
            <Btn size="sm" variant="ghost" onClick={() => {
              dismissBriefing(todayISODate());
              setBannerDismissed(true);
            }} title="Dismiss for today">
              <X size={14} />
            </Btn>
          </div>
        )}

        {/* Main area: view + optional task detail */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <ErrorBoundary>
              {view === 'my-work' && (
                <MyWorkView
                  projects={projects}
                  author={effectiveAuthor}
                  authorEmail={impersonatingAs ? null : verifiedEmail}
                  isOwner={isOwner && !impersonatingAs}
                  userPrefs={userPrefs}
                  teamMembers={teamMembers}
                  onTaskClick={async (taskId, projectId) => {
                    if (projectId && projectId !== currentId) {
                      await switchProject(projectId);
                    }
                    setSelectedTaskId(taskId);
                    setView('outline');
                  }}
                  onActionClick={async (projectId, actionId) => {
                    if (projectId && projectId !== currentId) {
                      await switchProject(projectId);
                    }
                    setView('actions');
                    if (actionId) setInitialActionEditId(actionId);
                  }}
                  onNavigateRaid={async (projectId, programId) => {
                    if (projectId && projectId !== currentId) {
                      await switchProject(projectId);
                    }
                    setRaidScopeProgramId(programId || null);
                    setView('raid');
                  }}
                  onCreateAction={impersonatingAs ? null : (projectId, relatedTaskId) => setActionCreate({
                    projectId: projectId || currentId,
                    relatedTaskId: relatedTaskId || null,
                    defaultPic: effectiveAuthor,
                  })}
                  onDecisionClick={async (projectId, decisionId) => {
                    if (projectId && projectId !== currentId) {
                      await switchProject(projectId);
                    }
                    setView('decisions');
                    if (decisionId) setInitialDecisionEditId(decisionId);
                  }}
                  onDecisionUpdate={impersonatingAs ? null : (updatedDecision, projectId) => applyDecisionUpdate(updatedDecision, projectId, 'My Work')}
                  onTaskUpdate={impersonatingAs ? null : (updatedTask, projectId) => applyTaskUpdate(updatedTask, projectId, 'My Work')}
                  onActionUpdate={impersonatingAs ? null : (updatedAction, projectId) => applyActionUpdate(updatedAction, projectId, 'My Work')}
                  onProjectUpdate={updateProject}
                  onApproveDeadline={impersonatingAs ? null : myWorkApproveDeadline}
                  onRejectDeadline={impersonatingAs ? null : myWorkRejectDeadline}
                  onMarkSeen={impersonatingAs ? null : markMyWorkSeen}
                  showToast={showToast}
                  dialogs={dialogs}
                />
              )}
              {project && view === 'mindmap' && <MindMapView project={project} selectedTaskId={selectedTaskId} onTaskClick={setSelectedTaskId} scopeProgramId={scopeProgramId} onProjectUpdate={updateProject} onActivity={logActivity} dialogs={dialogs} roles={project.__v2?.roles || null} nameOf={meValue?.nameOf || null} onOpenRoles={(f) => setShowRoles(f)} isOwner={isOwner} uid={meValue?.uid || null} />}
              {project && view === 'outline' && <OutlineView project={project} selectedTaskId={selectedTaskId} onTaskClick={setSelectedTaskId} onProjectUpdate={updateProject} onActivity={logActivity} dialogs={dialogs} scopeProgramId={scopeProgramId} isOwner={isOwner} roles={project.__v2?.roles || null} me={meValue} people={rolePeople} onChangeRole={(c) => changeRole(project.id, c)} />}
              {project && view === 'gantt' && <GanttView project={project} selectedTaskId={selectedTaskId} onTaskClick={setSelectedTaskId} scopeProgramId={scopeProgramId} />}
              {project && view === 'dashboard' && <DashboardView project={project} activity={activity} onTaskClick={(id) => { setSelectedTaskId(id); setView('outline'); }} scopeProgramId={scopeProgramId} />}
              {project && view === 'decisions' && <DecisionsView project={project} onProjectUpdate={updateProject} teamMembers={teamMembers} author={author} dialogs={dialogs} onActivity={logActivity} initialEditId={initialDecisionEditId} isOwner={isOwner && !impersonatingAs} uid={meValue?.uid || null} />}
              {project && view === 'actions' && <ActionItemsView project={project} onProjectUpdate={updateProject} teamMembers={teamMembers} author={author} dialogs={dialogs} onActivity={logActivity} showToast={showToast} initialEditId={initialActionEditId} onApplyAction={applyActionUpdate} onNavigateRaid={(projectId, programId) => { setRaidScopeProgramId(programId || null); setView('raid'); }} />}
              {isAllProjectsMode && view === 'decisions' && <AggregationView projects={projects} currentProjectId={currentId} teamMembers={teamMembers} dialogs={dialogs} showToast={showToast} author={author} initialTab="decisions" />}
              {isAllProjectsMode && view === 'actions' && <AggregationView projects={projects} currentProjectId={currentId} teamMembers={teamMembers} dialogs={dialogs} showToast={showToast} author={author} initialTab="actions" />}
              {view === 'aggregation' && <AggregationView projects={projects} currentProjectId={currentId} teamMembers={teamMembers} dialogs={dialogs} showToast={showToast} author={author} />}
              {view === 'raid' && (
                <RaidRegisterView
                  projects={projects}
                  currentProjectId={isAllProjectsMode ? null : currentId}
                  author={effectiveAuthor}
                  isOwner={isOwner && !impersonatingAs}
                  uid={meValue?.uid || null}
                  teamMembers={teamMembers}
                  scopeProgramId={raidScopeProgramId || scopeProgramId}
                  onApplyRaidUpdate={(item, projectId, programId, source) =>
                    applyRaidUpdate(item, projectId, programId, source || 'raid')
                  }
                  onRaidNavigate={{
                    deleteHandler: (itemId, projectId, programId) =>
                      deleteRaidItem(itemId, projectId, programId, 'raid'),
                  }}
                  dialogs={dialogs}
                />
              )}
              {view === 'activity' && isOwner && <ActivityDashboardView projects={projects} onProjectUpdate={updateProject} isOwner={isOwner} />}
              {view === 'activity' && !isOwner && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: TOK.muted, fontSize: 13 }}>
                  Activity view is workspace-owner only.
                </div>
              )}
              {view === 'portfolio' && isOwner && (
                <PortfolioView projects={projects} onProjectClick={(pid) => switchProject(pid)} />
              )}
              {view === 'portfolio' && !isOwner && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: TOK.muted, fontSize: 13 }}>
                  Portfolio view is workspace-owner only.
                </div>
              )}
              {view === 'credit-report' && isOwner && (
                <CreditReportView projects={projects} isOwner={isOwner} />
              )}
              {view === 'credit-report' && !isOwner && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: TOK.muted, fontSize: 13 }}>
                  Credit report is workspace-owner only.
                </div>
              )}
              {view === 'team-overview' && isOwner && !impersonatingAs && (
                <TeamOverviewView
                  projects={projects}
                  teamMembers={teamMembers}
                  currentAuthor={author}
                  onImpersonate={startImpersonation}
                />
              )}
              {view === 'team-overview' && !isOwner && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: TOK.muted, fontSize: 13 }}>
                  Team overview is workspace-owner only.
                </div>
              )}
              {isAllProjectsMode && (view === 'mindmap' || view === 'outline' || view === 'dashboard' || view === 'gantt') && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: TOK.muted, fontSize: 13, gap: 10 }}>
                  <div>🌐 This view is project-specific.</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn size="sm" onClick={() => setView('aggregation')}>Open Aggregation</Btn>
                    {isOwner && <Btn size="sm" onClick={() => setView('activity')}>Open Activity</Btn>}
                  </div>
                </div>
              )}
              {!project && !isAllProjectsMode && view !== 'aggregation' && view !== 'activity' && view !== 'portfolio' && view !== 'credit-report' && view !== 'my-work' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: TOK.muted, fontSize: 13 }}>No project selected.</div>
              )}
            </ErrorBoundary>
          </div>
          {selectedTaskId && project && (
            <TaskDetail project={project} taskId={selectedTaskId} showToast={showToast} author={author} teamMembers={teamMembers} dialogs={dialogs}
              onClose={() => setSelectedTaskId(null)}
              onUpdate={onTaskUpdate}
              onDelete={onTaskDelete}
              onProjectUpdate={updateProject}
              isOwner={isOwner}
              onNavigateRaid={(programId) => {
                setRaidScopeProgramId(programId);
                setView('raid');
              }} />
          )}
        </div>

        {actionCreate && (
          <ActionCreateModal
            projects={projects}
            defaultProjectId={actionCreate.projectId}
            defaultRelatedTaskId={actionCreate.relatedTaskId}
            author={author}
            defaultPic={actionCreate.defaultPic || null}
            teamMembers={teamMembers}
            onClose={() => setActionCreate(null)}
            onCreate={(newAction, projectId, opts) => createActionFromMyWork(newAction, projectId, '', opts)}
          />
        )}
        <SaveBanner saveState={saveState} onRetry={retryFailedSaves} />
        <Toast toast={toast} onClose={() => setToast(null)} />
        <DialogHost dialog={dialog} close={closeDialog} />
        <Walkthrough
          ref={walkthroughRef}
          uid={authUser?.uid || null}
          ready={!loading && !!meta && !!currentId}
        />

        {helpMenu && (
          <PopoverMenu x={helpMenu.x} y={helpMenu.y} onClose={() => setHelpMenu(null)}
            items={[{ label: 'Walkthrough', icon: <HelpCircle size={13} />, onClick: () => walkthroughRef.current?.start() }, { label: 'Glossary', icon: <BookOpen size={13} />, onClick: () => setShowGlossary(true) }]} />
        )}
        {showGlossary && <Modal title="Glossary" onClose={() => setShowGlossary(false)} width={560}><GlossaryList muted={TOK.muted} /></Modal>}
        {projectMenu && (
          <PopoverMenu x={projectMenu.x} y={projectMenu.y}
            items={[
              { label: 'Manage members & related parties', icon: <UserCircle size={13} />, onClick: () => setShowMembers(true) },
              { label: 'Project settings…', icon: <Edit2 size={13} />, onClick: () => setShowProjectSettings(true) },
              { label: 'Roles…', icon: <Users size={13} />, onClick: () => setShowRoles(true) },
              // B4: deleting a whole project is workspace-owner only.
              ...(isOwner ? [
                { separator: true },
                { label: meta.projectIds.length > 1 ? 'Delete project' : 'Delete project (need 2+)', icon: <Trash2 size={13} />, danger: true, onClick: deleteCurrentProject },
              ] : []),
            ]}
            onClose={() => setProjectMenu(null)} />
        )}

        {showNewProject && (
          <NewProjectModal onClose={() => setShowNewProject(false)} onCreate={createNewProject} />
        )}
        {showImport && (
          <ImportModal onClose={() => setShowImport(false)} onImport={handleFileImport} />
        )}
        {showSearch && (
          <SearchModal
            open={showSearch}
            onClose={() => setShowSearch(false)}
            myProjects={Object.values(projects)}
            onSelect={async (pid, taskId) => {
              if (pid !== currentId) await switchProject(pid);
              if (taskId) setSelectedTaskId(taskId);
              setShowSearch(false);
            }}
          />
        )}
        {showMembers && project && authUser && (
          <MembersModal
            projectId={project.id}
            currentUserId={authUser.uid}
            onClose={() => setShowMembers(false)}
            showToast={showToast}
          />
        )}
        {showDirectory && isOwner && verifiedEmail && (
          <DirectoryModal
            entries={dirEntries}
            ownerEmail={verifiedEmail}
            onChanged={reloadDirectory}
            onClose={() => setShowDirectory(false)}
            showToast={showToast}
          />
        )}
        {showRoles && project && (
          <RolesModal
            project={project}
            roles={project.__v2?.roles || null}
            me={meValue}
            people={rolePeople}
            onChangeRole={(c) => changeRole(project.id, c)}
            focus={typeof showRoles === 'object' ? showRoles : null}
            onClose={() => setShowRoles(false)}
          />
        )}
        {showProjectSettings && project && (
          <ProjectSettingsModal
            project={project}
            directory={directory}
            onClose={() => setShowProjectSettings(false)}
            onSave={(updated) => { updateProject(updated); logActivity({ type: 'project_settings', description: `Updated project settings for "${updated.name}"` }); showToast('Project settings saved'); }}
            dialogs={dialogs}
            isOwner={isOwner}
            author={author}
          />
        )}
        {showMeetingExport && (
          <MeetingExportDialog
            projects={projects}
            onClose={() => setShowMeetingExport(false)}
            dialogs={dialogs}
            showToast={showToast}
            author={author}
            teamMembers={teamMembers}
          />
        )}
        {meetingMode && (
          <MeetingMode
            projects={projects}
            onExit={() => setMeetingMode(false)}
          />
        )}
        {userMenuOpen && (
          <>
            {/* Click-outside backdrop */}
            <div onMouseDown={() => setUserMenuOpen(false)}
              style={{ position: 'absolute', inset: 0, zIndex: 199, background: 'transparent' }} />
            <div style={{
              position: 'absolute', top: 50, right: 16, zIndex: 200,
              background: TOK.surface, border: '1px solid ' + TOK.lineStrong, borderRadius: 8,
              boxShadow: '0 8px 20px rgba(0,0,0,0.15)', fontFamily: FONT_STACK,
              minWidth: 280, overflow: 'hidden',
            }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid ' + TOK.line }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: TOK.ink }}>{author}</div>
                {authorEmail && <div style={{ fontSize: 11, color: TOK.muted, marginTop: 2 }}>{authorEmail}</div>}
              </div>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid ' + TOK.line, fontSize: 12 }}>
                <div style={{ fontSize: 10, color: TOK.muted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Workspace owner</div>
                {meta?.workspaceOwner ? (
                  <>
                    <div style={{ color: TOK.ink, marginBottom: 6 }}>
                      {isOwner ? <><span style={{ color: TOK.accent, fontWeight: 500 }}>You ({author})</span></> : meta.workspaceOwner}
                    </div>
                    {isOwner ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Btn size="sm" disabled={transferLocked(meta)} title={transferLocked(meta) ? TRANSFER_LOCKED_MESSAGE : undefined} onClick={async () => {
                          setUserMenuOpen(false);
                          setShowTransferOwner(true);
                        }}>Transfer</Btn>
                        <Btn size="sm" onClick={() => { setUserMenuOpen(false); setShowDirectory(true); }}>People directory…</Btn>
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: TOK.subtle }}>Owner-only changes</div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: TOK.muted }}>
                    No workspace owner set. Ask the admin to assign one.
                  </div>
                )}
                {(meta?.ownershipLog || []).length > 0 && (
                  <div style={{ fontSize: 11, color: TOK.subtle, marginTop: 6 }}>{(meta?.ownershipLog || []).length} change{(meta?.ownershipLog || []).length === 1 ? '' : 's'} logged</div>
                )}
              </div>
              {/* v30 Phase 4 — Default landing view (workspace-wide, owner-set) */}
              <div style={{ padding: '10px 14px', borderBottom: '1px solid ' + TOK.line, fontSize: 12 }}>
                <div style={{ fontSize: 10, color: TOK.muted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  Default landing view
                </div>
                {isOwner ? (
                  <>
                    <select
                      value={meta?.defaultView || 'my-work'}
                      onChange={(e) => setWorkspaceDefaultView(e.target.value)}
                      style={{ width: '100%', fontFamily: FONT_STACK, fontSize: 12, padding: '4px 8px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface, color: TOK.ink, marginBottom: 4 }}>
                      {DEFAULT_VIEW_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    <div style={{ fontSize: 10.5, color: TOK.muted }}>Workspace-wide. Members can override their own below.</div>
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: TOK.ink }}>
                    {DEFAULT_VIEW_OPTIONS.find((o) => o.id === meta?.defaultView)?.label || 'My Work'}
                    <span style={{ color: TOK.muted, fontWeight: 400, marginLeft: 6 }}>(set by owner)</span>
                  </div>
                )}
              </div>
              {/* v30 Phase 4 — Personal override (per-user) */}
              <div style={{ padding: '10px 14px', borderBottom: '1px solid ' + TOK.line, fontSize: 12 }}>
                <div style={{ fontSize: 10, color: TOK.muted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  My personal override
                </div>
                <select
                  value={userPrefs?.defaultViewOverride || ''}
                  onChange={(e) => setPersonalDefaultOverride(e.target.value || null)}
                  style={{ width: '100%', fontFamily: FONT_STACK, fontSize: 12, padding: '4px 8px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface, color: TOK.ink, marginBottom: 4 }}>
                  <option value="">(Use workspace default)</option>
                  {DEFAULT_VIEW_OPTIONS.filter((o) => isOwner || o.id !== 'activity').map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <div style={{ fontSize: 10.5, color: TOK.muted }}>Applies on your next app load.</div>
              </div>
              <button
                onClick={signOut}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '10px 14px', fontSize: 13,
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontFamily: FONT_STACK, color: TOK.overdueFg, textAlign: 'left',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = TOK.bg}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <ArrowRightLeft size={13} /> Sign out
              </button>
            </div>
          </>
        )}

        {showBriefingDialog && (
          <BriefingDialog
            projects={projects}
            isOwnerMode={briefingDialogIsOwnerMode}
            ownerName={meta?.workspaceOwner || null}
            teamMembers={teamMembers}
            onClose={() => setShowBriefingDialog(false)}
            showToast={showToast}
          />
        )}
        {showTransferOwner && (
          <TransferOwnerDialog
            teamMembers={teamMembers}
            currentOwner={meta?.workspaceOwner}
            projects={projects}
            onClose={() => setShowTransferOwner(false)}
            onTransfer={async (newOwner) => {
              setShowTransferOwner(false);
              const ok = await changeOwnership('transfer', newOwner);
              if (!ok && transferLocked(meta)) return; // changeOwnership already explained why
              showToast(ok ? `Ownership transferred to ${newOwner}` : 'Transfer failed — reload the page and try again');
            }}
          />
        )}
      </div>
    </MeContext.Provider></DirectoryIndexContext.Provider>
  );
}

// Role assignment: the whole project's PM / Deputy / Sub-PM in one table (spec §6.2).
// Same pickers and permissions as the Outline headers; every reader can open it.
function RolesModal({ project, roles, me, people = [], focus = null, onChangeRole, onClose }) {
  // focus ({ programId, wsId? }) comes from a Mind map node menu; "Show all" clears it.
  const [scope, setScope] = useState(focus);
  const [blankOnly, setBlankOnly] = useState(false);
  const [inactiveOnly, setInactiveOnly] = useState(false);
  const v2 = !!(project?.__v2 && roles && me);
  const rows = useMemo(() => (v2 ? focusRoleRows(rowsForRoles(project, roles), scope) : []), [v2, project, roles, scope]);
  const shown = useMemo(() => {
    if (!blankOnly && !inactiveOnly) return rows;
    const uidsOf = (r) => (r.kind === 'program' ? [r.pmUid, r.deputyUid] : [r.leadUid]);
    const hit = (r) => (!blankOnly || uidsOf(r).some((u) => !u))
      && (!inactiveOnly || uidsOf(r).some((u) => u && !me.isActive(u)));
    // Keep a program row as context when one of its workstreams matches.
    const keepPg = new Set(rows.filter(hit).map((r) => r.programId));
    return rows.filter((r) => hit(r) || (r.kind === 'program' && keepPg.has(r.programId)));
  }, [rows, blankOnly, inactiveOnly, me]);
  const picker = (kind, r, valueUid, label, blankText, scopeName) => (
    <RolePicker label={label} valueUid={valueUid} scopeName={scopeName}
      editable={canEditRole(roles, me, kind, r.programId)} people={people} nameOf={me.nameOf} isActive={me.isActive}
      blankText={blankText}
      onPick={(toUid) => onChangeRole && onChangeRole({ kind, programId: r.programId, ...(kind === 'lead' ? { wsId: r.wsId } : {}), fromUid: valueUid, toUid })} />
  );
  const check = (checked, set, label) => (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: TOK.ink, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} />{label}
    </label>
  );
  return (
    <Modal title="Roles" onClose={onClose} width={640}>
      {!v2 ? (
        <p style={{ margin: 0, fontSize: 13, color: TOK.ink }}>Roles become available after this project is switched to v2.</p>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
            {check(blankOnly, setBlankOnly, 'Blank roles only')}
            {check(inactiveOnly, setInactiveOnly, 'Inactive people only')}
            {scope && <Btn size="sm" variant="ghost" onClick={() => setScope(null)}>Show all</Btn>}
          </div>
          {shown.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: TOK.muted }}>No roles match these filters.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {shown.map((r) => (r.kind === 'program' ? (
                  <tr key={'p_' + r.programId} style={{ borderTop: '1px solid ' + TOK.line, background: TOK.programBg }}>
                    <td style={{ padding: '8px 10px', fontWeight: 500, color: TOK.programFg }}>{r.name}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {picker('pm', r, r.pmUid, 'PM', '— (Owner decides)', r.name)}
                        {picker('deputy', r, r.deputyUid, 'Deputy', '— (Owner decides)', r.name)}
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={'w_' + r.wsId} style={{ borderTop: '1px solid ' + TOK.line }}>
                    <td style={{ padding: '6px 10px 6px 28px', color: TOK.workstreamFg }}>{r.name}</td>
                    <td style={{ padding: '6px 10px' }}>{picker('lead', r, r.leadUid, 'Sub-PM', '— (PM decides)', r.name)}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Modal>
  );
}

function ProjectSettingsModal({ project, directory = [], onClose, onSave, dialogs, isOwner = false, author }) {
  const [name, setName] = useState(project.name);
  const [opCode, setOpCode] = useState(project.openProjectCode || '');
  const [members, setMembers] = useState(project.teamMembers || []);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [showDirSuggest, setShowDirSuggest] = useState(false);
  // Credit allocation (v22)
  const [creditPoints, setCreditPoints] = useState(
    typeof project.creditPoints === 'number' ? String(project.creditPoints) : String(DEFAULT_CREDIT_POINTS)
  );
  const [creditYear, setCreditYear] = useState(
    typeof project.creditYear === 'number' ? project.creditYear : new Date().getFullYear()
  );
  const [weightsLocked, setWeightsLocked] = useState(!!project.weightsLocked);
  const [weightsLockHistory] = useState(Array.isArray(project.weightsLockHistory) ? project.weightsLockHistory : []);
  const [showLockHistory, setShowLockHistory] = useState(false);
  const [projectLead, setProjectLead] = useState(project.projectLead || '');
  const [projectLeadShare, setProjectLeadShare] = useState(
    typeof project.projectLeadShare === 'number' ? String(project.projectLeadShare) : '10'
  );
  // Contributor registry (v26)
  const [contributorRegistry, setContributorRegistry] = useState(
    Array.isArray(project.contributorRegistry) ? project.contributorRegistry : []
  );
  const [newContribName, setNewContribName] = useState('');
  const [mergeFrom, setMergeFrom] = useState('');
  const [mergeTo, setMergeTo] = useState('');
  // Google Chat integration (Stage 1)
  const [chatWebhook, setChatWebhook] = useState(project.googleChatWebhook || '');
  const [chatWebhookError, setChatWebhookError] = useState('');
  const [chatTestStatus, setChatTestStatus] = useState(null); // { kind: 'ok'|'err', message: string }

  const commitChatWebhook = () => {
    const trimmed = chatWebhook.trim();
    if (trimmed && !validateWebhookUrl(trimmed)) {
      setChatWebhookError(`URL must start with ${WEBHOOK_PREFIX}`);
      return;
    }
    setChatWebhookError('');
    // Persist null when empty so absence of integration is clean
    onSave({ ...project, googleChatWebhook: trimmed || null });
  };

  const sendChatTest = async () => {
    const trimmed = chatWebhook.trim();
    if (!validateWebhookUrl(trimmed)) {
      setChatTestStatus({ kind: 'err', message: 'Save a valid webhook URL first.' });
      return;
    }
    setChatTestStatus({ kind: 'ok', message: 'Sending…' });
    const result = await postToChat(trimmed, buildTestText({
      projectName: project.name,
      author: author || '(workspace owner)',
    }));
    if (result.ok) {
      setChatTestStatus({ kind: 'ok', message: 'Test message delivered ✓' });
    } else {
      setChatTestStatus({ kind: 'err', message: `Failed: ${result.status} ${result.statusText}` });
    }
  };

  // Directory autocomplete: filter signed-in users (from useUserDirectory) by
  // either field. Strip leading @ to support @-mention syntax in either input.
  // Excludes users already in the team list (matched by email).
  const dirSuggestions = useMemo(() => {
    const q = ((newEmail || newName) || '').trim().replace(/^@+/, '').toLowerCase();
    if (!q) return [];
    const haveEmails = new Set(members.map((m) => (m.email || '').toLowerCase()).filter(Boolean));
    return (directory || [])
      .filter((u) => u && (u.email || u.name))
      .filter((u) => !haveEmails.has((u.email || '').toLowerCase()))
      .filter((u) =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [directory, newEmail, newName, members]);

  const pickFromDirectory = (entry) => {
    const nm = entry.name || (entry.email || '').split('@')[0];
    setNewName(nm);
    setNewEmail(entry.email || '');
    setShowDirSuggest(false);
  };

  // Compute contributors actually used in tasks (for cleanup tool)
  const usedContributors = useMemo(() => {
    const seen = new Map();
    for (const pg of (project.programs || [])) {
      for (const ws of (pg.workstreams || [])) {
        for (const t of (ws.tasks || [])) {
          for (const c of (t.contributors || [])) {
            if (!seen.has(c)) seen.set(c, { count: 0, taskIds: [] });
            const entry = seen.get(c);
            entry.count++;
            entry.taskIds.push(t.id);
          }
        }
      }
    }
    return seen;
  }, [project]);

  // v30.1.3 — Audit panel data: walk project content for unique PIC names,
  // classify each, and compute a merge suggestion for orphans.
  const [showKnownNames, setShowKnownNames] = useState(false);
  const auditData = useMemo(() => {
    const picMap = collectProjectPicNames(project);
    const known = [];
    const group = [];
    const orphan = [];
    for (const [, entry] of picMap.entries()) {
      const cat = categorizePicName(entry.name, members, directory, project.memberIds, contributorRegistry);
      if (cat === 'known') known.push(entry);
      else if (cat === 'group') group.push(entry);
      else orphan.push({ ...entry, suggested: suggestMergeTarget(entry.name, members) });
    }
    const byCount = (a, b) => (b.count - a.count) || a.name.localeCompare(b.name);
    return {
      known: known.sort(byCount),
      group: group.sort(byCount),
      orphan: orphan.sort(byCount),
      total: picMap.size,
    };
  }, [project, members, directory, contributorRegistry]);

  const addMember = () => {
    const n = newName.trim();
    if (!n) return;
    // Avoid duplicate names (case-insensitive)
    if (members.some((m) => m.name.toLowerCase() === n.toLowerCase())) {
      dialogs.alert({ title: 'Duplicate', message: `"${n}" is already in the team list.` });
      return;
    }
    setMembers([...members, { name: n, email: newEmail.trim() || '' }]);
    setNewName('');
    setNewEmail('');
  };

  const updateMember = (i, field, value) => {
    const next = [...members];
    next[i] = { ...next[i], [field]: value };
    setMembers(next);
  };

  const removeMember = (i) => {
    setMembers(members.filter((_, j) => j !== i));
  };

  // ─── Contributor registry handlers (v26) ───
  const addContributorToRegistry = () => {
    const n = newContribName.trim();
    if (!n) return;
    if (contributorRegistry.some((r) => r.name.toLowerCase() === n.toLowerCase())) {
      dialogs.alert({ title: 'Duplicate', message: `"${n}" is already in the registry.` });
      return;
    }
    setContributorRegistry([...contributorRegistry, { name: n }]);
    setNewContribName('');
  };
  const removeContributorFromRegistry = (rname) => {
    setContributorRegistry(contributorRegistry.filter((r) => r.name !== rname));
  };
  const adoptToRegistry = (rname) => {
    if (contributorRegistry.some((r) => r.name === rname)) return;
    setContributorRegistry([...contributorRegistry, { name: rname }]);
  };
  const seedDefaultDepartments = () => {
    const existing = new Set(contributorRegistry.map((r) => r.name.toLowerCase()));
    const toAdd = DEFAULT_DEPARTMENTS.filter((d) => !existing.has(d.toLowerCase()));
    if (toAdd.length === 0) {
      dialogs.alert({ title: 'Already seeded', message: 'All default departments are already in the registry.' });
      return;
    }
    setContributorRegistry([...contributorRegistry, ...toAdd.map((nm) => ({ name: nm }))]);
  };
  // Build a payload that includes ALL current modal state — important per pitfall #4
  // so unsaved modal edits aren't lost when calling onSave from cleanup actions.
  const buildModalSnapshot = (overrides = {}) => {
    const cpNum = Number(creditPoints);
    const finalCp = (!isNaN(cpNum) && cpNum >= 0) ? cpNum : DEFAULT_CREDIT_POINTS;
    const leadShareNum = Number(projectLeadShare);
    const finalLeadShare = (!isNaN(leadShareNum) && leadShareNum >= 0 && leadShareNum <= 100) ? leadShareNum : 10;
    return {
      ...project,
      name: name.trim(),
      openProjectCode: opCode.trim() || null,
      teamMembers: members,
      creditPoints: finalCp,
      creditYear,
      weightsLocked,
      weightsLockHistory,
      projectLead: projectLead.trim() || null,
      projectLeadShare: finalLeadShare,
      contributorRegistry,
      ...overrides,
    };
  };
  // ─── Legacy-name merge by email (issue 3 fix) ───
  // Detect team members whose email matches a directory entry but whose name
  // differs (e.g. "hattt4" vs Firebase "Hà Trương Thị Thu"). Same email = same
  // person; merging rewrites every reference under the project so PIC, credit
  // shares, decisions, action items, check-in/update authors, projectLead, and
  // weightChangeLog all switch to the canonical (Firebase) name.
  const legacyMismatches = useMemo(() => {
    const dirByEmail = new Map();
    for (const u of (directory || [])) {
      if (u?.email && u?.name) dirByEmail.set(u.email.toLowerCase(), u.name);
    }
    const out = [];
    for (const m of members) {
      const em = (m.email || '').trim().toLowerCase();
      if (!em) continue;
      const canonical = dirByEmail.get(em);
      if (canonical && canonical !== (m.name || '').trim()) {
        out.push({ from: m.name, to: canonical, email: m.email });
      }
    }
    return out;
  }, [members, directory]);

  const performLegacyMerge = async ({ from, to, email }) => {
    if (!from || !to || from === to) return;
    let touched = 0;

    // Rewrite { author?, resolvedBy? } on an array of update/check-in
    // entries. Idempotent: only mutates entries where the field equals
    // `from`. Returns a new array; the immutable .map preserves
    // identity equality when nothing changes.
    const renameUpdateMeta = (arr) => Array.isArray(arr)
      ? arr.map((u) => {
          if (!u) return u;
          let next = u;
          if (u.author === from) next = { ...next, author: to };
          if (u.resolvedBy === from) next = { ...next, resolvedBy: to };
          return next;
        })
      : arr;

    // Programs walk — rewrite tasks AND raid items inside each program.
    const updatedPrograms = (project.programs || []).map((pg) => {
      const nextWorkstreams = (pg.workstreams || []).map((ws) => ({
        ...ws,
        tasks: (ws.tasks || []).map((t) => {
          let next = t;
          let dirty = false;
          if (t.pic === from) { next = { ...next, pic: to }; dirty = true; }
          if (Array.isArray(t.contributors) && t.contributors.includes(from)) {
            const cs = new Set(t.contributors);
            cs.delete(from);
            if (to !== (next.pic || t.pic)) cs.add(to);
            next = { ...next, contributors: Array.from(cs) };
            dirty = true;
          }
          if (t.creditShares && Object.prototype.hasOwnProperty.call(t.creditShares, from)) {
            const nsh = { ...t.creditShares };
            const v = Number(nsh[from]) || 0;
            delete nsh[from];
            nsh[to] = (Number(nsh[to]) || 0) + v;
            next = { ...next, creditShares: nsh };
            dirty = true;
          }
          const newCheckIns = renameUpdateMeta(t.checkIns);
          const newUpdates = renameUpdateMeta(t.updates);
          if (newCheckIns !== t.checkIns || newUpdates !== t.updates) {
            next = { ...next, checkIns: newCheckIns, updates: newUpdates };
            dirty = true;
          }
          if (dirty) touched++;
          return next;
        }),
      }));
      // RAID rewrite — owner / createdBy / approvedBy / validationOwner /
      // history[].author and mitigationActions[].pic.
      const nextRaid = Array.isArray(pg.raid)
        ? pg.raid.map((item) => {
            let next = item;
            if (item.owner === from) next = { ...next, owner: to };
            if (item.createdBy === from) next = { ...next, createdBy: to };
            if (item.approvedBy === from) next = { ...next, approvedBy: to };
            if (item.validationOwner === from) next = { ...next, validationOwner: to };
            if (Array.isArray(item.history)) {
              const nh = item.history.map((h) => (h && h.author === from ? { ...h, author: to } : h));
              if (nh.some((h, i) => h !== item.history[i])) next = { ...next, history: nh };
            }
            if (Array.isArray(item.mitigationActions)) {
              const nm = item.mitigationActions.map((m) => (m && m.pic === from ? { ...m, pic: to } : m));
              if (nm.some((m, i) => m !== item.mitigationActions[i])) next = { ...next, mitigationActions: nm };
            }
            return next;
          })
        : pg.raid;
      return { ...pg, workstreams: nextWorkstreams, raid: nextRaid };
    });

    const updatedLead = project.projectLead === from ? to : project.projectLead;

    // Decisions — decidedBy[] (existing) + author (new).
    const updatedDecisions = (project.decisions || []).map((d) => {
      let nd = d;
      if (Array.isArray(d.decidedBy) && d.decidedBy.includes(from)) {
        const s = new Set(d.decidedBy); s.delete(from); s.add(to);
        nd = { ...nd, decidedBy: Array.from(s) };
      }
      if (d.author === from) nd = { ...nd, author: to };
      return nd;
    });

    // Action items — pic, decidedBy[] (existing) + subtasks[].pic + updates[].author (new).
    const updatedActions = (project.actionItems || []).map((a) => {
      let na = a;
      if (a.pic === from) na = { ...na, pic: to };
      if (Array.isArray(a.decidedBy) && a.decidedBy.includes(from)) {
        const s = new Set(a.decidedBy); s.delete(from); s.add(to);
        na = { ...na, decidedBy: Array.from(s) };
      }
      if (Array.isArray(a.subtasks)) {
        const ns = a.subtasks.map((s) => (s && s.pic === from ? { ...s, pic: to } : s));
        if (ns.some((s, i) => s !== a.subtasks[i])) na = { ...na, subtasks: ns };
      }
      const newAUpd = renameUpdateMeta(a.updates);
      if (newAUpd !== a.updates) na = { ...na, updates: newAUpd };
      return na;
    });

    const updatedLog = Array.isArray(project.weightChangeLog)
      ? project.weightChangeLog.map((l) => (l && l.by === from ? { ...l, by: to } : l))
      : project.weightChangeLog;

    // Update teamMembers: drop the old entry; ensure canonical exists with email
    const withoutFrom = members.filter((m) => m.name !== from);
    const finalMembers = withoutFrom.some((m) => m.name === to)
      ? withoutFrom
      : [...withoutFrom, { name: to, email: email || '' }];

    const ok = await dialogs.confirm({
      title: 'Merge legacy name?',
      message: `Replace "${from}" with "${to}" across this project — ${touched} task occurrence${touched === 1 ? '' : 's'}, plus decisions, action items, subtasks, action updates, check-ins, task updates (incl. resolved-by), RAID items (owner / createdBy / approvedBy / validationOwner / history / mitigations), project lead, weight log, and team list. Cannot be undone.`,
      okLabel: 'Merge',
    });
    if (!ok) return;
    setMembers(finalMembers);
    onSave(buildModalSnapshot({
      programs: updatedPrograms,
      decisions: updatedDecisions,
      actionItems: updatedActions,
      projectLead: updatedLead,
      weightChangeLog: updatedLog,
      teamMembers: finalMembers,
    }));
    dialogs.alert({ title: 'Merge complete', message: `Renamed "${from}" → "${to}" across this project.` });
  };

  const performMerge = async () => {
    const from = (mergeFrom || '').trim();
    const to = (mergeTo || '').trim();
    if (!from || !to || from === to) return;
    let touched = 0;
    const updatedPrograms = (project.programs || []).map((pg) => ({
      ...pg,
      workstreams: (pg.workstreams || []).map((ws) => ({
        ...ws,
        tasks: (ws.tasks || []).map((t) => {
          let next = t;
          if ((t.contributors || []).includes(from)) {
            const cs = new Set([...(t.contributors || [])]);
            cs.delete(from);
            cs.add(to);
            next = { ...next, contributors: Array.from(cs).filter((c) => c !== next.pic) };
            touched++;
          }
          if (t.creditShares && Object.prototype.hasOwnProperty.call(t.creditShares, from)) {
            const nsh = { ...t.creditShares };
            const fromVal = Number(nsh[from]) || 0;
            delete nsh[from];
            nsh[to] = (Number(nsh[to]) || 0) + fromVal;
            next = { ...next, creditShares: nsh };
          }
          return next;
        }),
      })),
    }));
    const ok = await dialogs.confirm({
      title: 'Merge contributor names?',
      message: `Replace "${from}" with "${to}" across all tasks (and credit shares). ${touched} task occurrences affected.`,
      okLabel: 'Merge',
    });
    if (!ok) return;
    onSave(buildModalSnapshot({ programs: updatedPrograms }));
    setMergeFrom(''); setMergeTo('');
    dialogs.alert({ title: 'Merge complete', message: `Replaced "${from}" with "${to}" in ${touched} task occurrence${touched === 1 ? '' : 's'}.` });
  };
  const performDeleteFromTasks = async (rname) => {
    const ok = await dialogs.confirm({
      title: `Remove "${rname}" from all tasks?`,
      message: `Remove "${rname}" from contributors and credit shares of every task. The registry stays unchanged. This cannot be undone.`,
      danger: true,
      okLabel: 'Remove',
    });
    if (!ok) return;
    let touched = 0;
    const updatedPrograms = (project.programs || []).map((pg) => ({
      ...pg,
      workstreams: (pg.workstreams || []).map((ws) => ({
        ...ws,
        tasks: (ws.tasks || []).map((t) => {
          let next = t;
          if ((t.contributors || []).includes(rname)) {
            next = { ...next, contributors: (next.contributors || []).filter((c) => c !== rname) };
            touched++;
          }
          if (t.creditShares && Object.prototype.hasOwnProperty.call(t.creditShares, rname)) {
            const nsh = { ...t.creditShares };
            delete nsh[rname];
            next = { ...next, creditShares: nsh };
          }
          return next;
        }),
      })),
    }));
    onSave(buildModalSnapshot({ programs: updatedPrograms }));
    dialogs.alert({ title: 'Remove complete', message: `Removed "${rname}" from ${touched} task occurrence${touched === 1 ? '' : 's'}.` });
  };

  const save = () => {
    const cpNum = Number(creditPoints);
    const finalCp = (!isNaN(cpNum) && cpNum >= 0) ? cpNum : DEFAULT_CREDIT_POINTS;
    const leadShareNum = Number(projectLeadShare);
    const finalLeadShare = (!isNaN(leadShareNum) && leadShareNum >= 0 && leadShareNum <= 100) ? leadShareNum : 10;
    let lockHist = weightsLockHistory;
    if (!!project.weightsLocked !== weightsLocked) {
      lockHist = [...weightsLockHistory, {
        ts: new Date().toISOString(),
        action: weightsLocked ? 'lock' : 'unlock',
        year: creditYear,
      }];
    }
    onSave({
      ...project,
      name: name.trim(),
      openProjectCode: opCode.trim() || null,
      teamMembers: members,
      creditPoints: finalCp,
      creditYear,
      weightsLocked,
      weightsLockHistory: lockHist,
      projectLead: projectLead.trim() || null,
      projectLeadShare: finalLeadShare,
      contributorRegistry,
    });
    onClose();
  };

  return (
    <Modal title="Project settings" onClose={onClose} width={560}>
      <FieldLabel>Project name</FieldLabel>
      <Input value={name} onChange={setName} />

      <div style={{ height: 16 }} />
      <FieldLabel>OpenProject Code</FieldLabel>
      <Input value={opCode} onChange={setOpCode} placeholder="e.g., CRP" />
      <div style={{ marginTop: 6, fontSize: 11, color: TOK.subtle, lineHeight: 1.5 }}>
        Used in the Excel template when exporting action items for OpenProject upload. Leave blank if you'll fill it in manually later.
      </div>

      <div style={{ height: 20 }} />
      <div style={{ border: '1px solid ' + TOK.line, borderRadius: 8, padding: 12, background: TOK.bg }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <FieldLabel>⚖ Credit allocation</FieldLabel>
          {!isOwner && <span style={{ fontSize: 10, color: TOK.subtle }}>(workspace owner only)</span>}
        </div>
        <div style={{ fontSize: 11, color: TOK.subtle, lineHeight: 1.5, marginBottom: 10 }}>
          Total credit points decided by BoD/HR upfront. Default rules: 1 PIC + 0 contrib → 100/0; +1 contrib → 70/30; +2 → 70/15/15; +3+ → enter manually.
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <FieldLabel>Total credit points</FieldLabel>
            <input type="number" value={creditPoints} onChange={(e) => setCreditPoints(e.target.value)} placeholder="100" disabled={!isOwner}
              style={{ fontFamily: FONT_STACK, fontSize: 13, width: '100%', padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, background: isOwner ? TOK.surface : TOK.bg, color: TOK.ink, opacity: isOwner ? 1 : 0.7 }} />
          </div>
          <div style={{ width: 120 }}>
            <FieldLabel>Year</FieldLabel>
            <select
              value={creditYear}
              onChange={(e) => setCreditYear(Number(e.target.value))}
              disabled={!isOwner}
              style={{ width: '100%', fontFamily: FONT_STACK, fontSize: 13, padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, background: TOK.surface, color: TOK.ink, opacity: isOwner ? 1 : 0.7 }}
            >
              {[creditYear - 2, creditYear - 1, creditYear, creditYear + 1, creditYear + 2].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <FieldLabel>Project lead <span style={{ color: TOK.subtle, fontWeight: 400 }}>(receives a share of total pool, tied to overall completion)</span></FieldLabel>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
          <select
            value={projectLead}
            onChange={(e) => setProjectLead(e.target.value)}
            disabled={!isOwner || members.length === 0}
            style={{ flex: 1, fontFamily: FONT_STACK, fontSize: 13, padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, background: TOK.surface, color: TOK.ink, opacity: (isOwner && members.length > 0) ? 1 : 0.5 }}
          >
            <option value="">— No project lead —</option>
            {members.map((m) => <option key={m.name} value={m.name}>{m.name}{m.email ? ` (${m.email})` : ''}</option>)}
          </select>
          <div style={{ width: 110, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: TOK.muted, whiteSpace: 'nowrap' }}>Lead share:</span>
            <input type="number" value={projectLeadShare} onChange={(e) => setProjectLeadShare(e.target.value)} placeholder="10" disabled={!isOwner}
              style={{ fontFamily: FONT_STACK, fontSize: 13, width: '100%', padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, background: isOwner ? TOK.surface : TOK.bg, color: TOK.ink, opacity: isOwner ? 1 : 0.7 }} />
            <span style={{ fontSize: 11, color: TOK.muted }}>%</span>
          </div>
        </div>
        {members.length === 0 ? (
          <div style={{ fontSize: 11, color: '#A8660C', marginTop: 3 }}>
            ⚠ Add team members below first, then return to pick project lead.
          </div>
        ) : projectLead ? (
          <div style={{ fontSize: 11, color: TOK.muted, lineHeight: 1.5 }}>
            ℹ️ {projectLead} will earn up to {Math.round(Number(projectLeadShare) || 10)} cp based on overall project completion.
            Remaining {100 - (Math.round(Number(projectLeadShare) || 10))}% ({(Number(creditPoints) || DEFAULT_CREDIT_POINTS) * (100 - (Number(projectLeadShare) || 10)) / 100} cp) is split among programs/workstreams/tasks.
          </div>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 12, padding: '4px 10px', borderRadius: 999,
            background: weightsLocked ? TOK.healthRedBg : TOK.healthGreenBg,
            color: weightsLocked ? TOK.healthRed : TOK.healthGreen,
          }}>
            {weightsLocked ? `🔒 Locked for ${creditYear}` : '🔓 Unlocked'}
          </span>
          <Btn size="sm" disabled={!isOwner} onClick={async () => {
            if (!isOwner) return;
            const ok = await dialogs.confirm({
              title: weightsLocked ? `Unlock weights for ${creditYear}?` : `Lock weights for ${creditYear}?`,
              message: weightsLocked
                ? 'Unlocking allows owners to change weights again. The change is recorded in the lock history.'
                : 'Locking prevents anyone (including owners) from changing weights until unlocked. The change is recorded in the lock history.',
              okLabel: weightsLocked ? 'Unlock' : 'Lock',
            });
            if (!ok) return;
            setWeightsLocked(!weightsLocked);
          }}>
            {weightsLocked ? 'Unlock' : 'Lock'}
          </Btn>
          {weightsLockHistory.length > 0 && (
            <button onClick={() => setShowLockHistory(!showLockHistory)}
              style={{ background: 'none', border: 'none', fontSize: 11, color: TOK.muted, cursor: 'pointer' }}>
              {showLockHistory ? '▾' : '▸'} Lock history ({weightsLockHistory.length})
            </button>
          )}
        </div>
        {showLockHistory && weightsLockHistory.length > 0 && (
          <div style={{ marginTop: 8, padding: 8, background: TOK.surface, borderRadius: 6, fontSize: 11, color: TOK.muted }}>
            {weightsLockHistory.slice().reverse().map((h, i) => (
              <div key={i}>
                {h.action === 'lock' ? '🔒 Locked' : '🔓 Unlocked'} year {h.year} — {fmtDateTime(h.ts)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ height: 20 }} />
      <div style={{
        background: TOK.bg, border: '1px solid ' + TOK.line, borderRadius: 8,
        padding: 12, marginBottom: 12, fontSize: 12, color: TOK.ink, lineHeight: 1.55,
      }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>👥 How members work in this project</div>
        <div style={{ marginBottom: 6 }}>
          To grant <strong>access</strong>, click <strong>Manage Members</strong> in the top toolbar (RBAC). Anyone with access automatically appears in PIC autocomplete elsewhere — you don't need to re-add them here.
        </div>
        <div>
          The list below is for <strong>external contacts not yet signed in</strong> (vendors, advisors). Add them so their name autocompletes in PIC fields and emails. They will NOT get access until you also add them via Manage Members.
        </div>
      </div>
      <FieldLabel>Team members & emails</FieldLabel>
      <div style={{ fontSize: 11, color: TOK.subtle, lineHeight: 1.5, marginBottom: 10 }}>
        Names here are autocomplete-able with @mention. Emails are used for action-item emails. PIC names already used in tasks are picked up automatically — add their emails here.
      </div>

      {/* Add row — inline form, no chained dialogs */}
      <div style={{ padding: 8, background: TOK.bg, borderRadius: 7, marginBottom: 8, position: 'relative' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <Input
            value={newName}
            onChange={(v) => { setNewName(v); setShowDirSuggest(true); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && dirSuggestions[0] && (newEmail.trim().startsWith('@') || newName.trim().startsWith('@'))) {
                e.preventDefault(); pickFromDirectory(dirSuggestions[0]);
              } else if (e.key === 'Enter' && newName.trim()) {
                e.preventDefault(); addMember();
              } else if (e.key === 'Escape') {
                e.preventDefault(); // close the suggestions only, not the settings modal
                setShowDirSuggest(false);
              }
            }}
            onFocus={() => setShowDirSuggest(true)}
            placeholder="Name * (e.g., An Nguyen, or @ to search)"
            style={{ flex: 1 }}
          />
          <Input
            value={newEmail}
            onChange={(v) => {
              setNewEmail(v);
              setShowDirSuggest(true);
              // Auto-derive name from email prefix if name is empty
              if (!newName.trim() && v && v.includes('@') && !v.startsWith('@')) {
                const prefix = v.split('@')[0].trim();
                if (prefix) setNewName(prefix);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && dirSuggestions[0]) {
                e.preventDefault(); pickFromDirectory(dirSuggestions[0]);
              } else if (e.key === 'Enter' && newName.trim()) {
                e.preventDefault(); addMember();
              } else if (e.key === 'Escape') {
                e.preventDefault(); // close the suggestions only, not the settings modal
                setShowDirSuggest(false);
              }
            }}
            onFocus={() => setShowDirSuggest(true)}
            placeholder="@trag → trangvk@smartosc.com, or type email"
            type="email"
            style={{ flex: 1.4 }}
          />
          <Btn size="sm" variant="primary" onClick={addMember} disabled={!newName.trim()}>
            <Plus size={11} /> Add
          </Btn>
        </div>
        {showDirSuggest && dirSuggestions.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 8, right: 8,
            background: TOK.surface, border: '1px solid ' + TOK.lineStrong, borderRadius: 6,
            marginTop: 2, maxHeight: 240, overflowY: 'auto', zIndex: 50,
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}>
            <div style={{ padding: '6px 10px', fontSize: 10, color: TOK.subtle, borderBottom: '1px solid ' + TOK.line }}>
              Sign-in directory · click to add
            </div>
            {dirSuggestions.map((u) => (
              <button key={u.uid} onMouseDown={(e) => { e.preventDefault(); pickFromDirectory(u); }}
                style={{
                  width: '100%', textAlign: 'left', padding: '7px 10px',
                  fontFamily: FONT_STACK, fontSize: 12, border: 'none',
                  background: 'transparent', cursor: 'pointer', color: TOK.ink,
                  borderBottom: '1px solid ' + TOK.line,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = TOK.bg}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                <span style={{ fontWeight: 500 }}>{u.name || (u.email || '').split('@')[0]}</span>
                {u.email && <span style={{ color: TOK.muted, fontSize: 11 }}>{u.email}</span>}
              </button>
            ))}
            <button onMouseDown={(e) => { e.preventDefault(); setShowDirSuggest(false); }}
              style={{
                width: '100%', textAlign: 'left', padding: '6px 10px',
                fontFamily: FONT_STACK, fontSize: 11, border: 'none',
                background: TOK.bg, cursor: 'pointer', color: TOK.muted,
              }}>
              Cancel
            </button>
          </div>
        )}
        {!newName.trim() && newEmail.trim() && (
          <div style={{ fontSize: 11, color: '#A8660C', marginTop: 4 }}>
            ⚠ Name is required to add this member.
          </div>
        )}
      </div>

      {legacyMismatches.length > 0 && isOwner && (
        <div style={{
          background: '#FAEEDA', border: '1px solid #E0BC75', borderRadius: 7,
          padding: '10px 12px', marginBottom: 8,
        }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#A8660C', marginBottom: 4 }}>
            ⚠ Legacy name mismatch detected
          </div>
          <div style={{ fontSize: 11, color: TOK.muted, marginBottom: 8, lineHeight: 1.5 }}>
            Same email is registered in this project under a different name than the user's Google profile.
            Merge to consolidate task PIC, contributors, decisions, action items, check-ins/updates, and credit shares under the canonical name.
          </div>
          {legacyMismatches.map((mm) => (
            <div key={mm.email} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 12, fontFamily: 'monospace', color: TOK.ink }}>
                <span style={{ textDecoration: 'line-through', color: TOK.muted }}>{mm.from}</span>
                {' → '}
                <span style={{ fontWeight: 500 }}>{mm.to}</span>
              </span>
              <span style={{ fontSize: 11, color: TOK.muted }}>({mm.email})</span>
              <span style={{ flex: 1 }} />
              <Btn size="sm" variant="primary" onClick={() => performLegacyMerge(mm)}>Merge</Btn>
            </div>
          ))}
        </div>
      )}

      {members.length === 0 && (
        <div style={{ fontSize: 12, color: TOK.subtle, padding: 12, textAlign: 'center', background: TOK.bg, borderRadius: 6 }}>
          No teammates added yet. Type a name and email above, then click Add.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {members.map((m, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Input value={m.name} onChange={(v) => updateMember(i, 'name', v)} placeholder="Name" style={{ flex: 1 }} />
            <Input value={m.email} onChange={(v) => updateMember(i, 'email', v)} placeholder="email@smartosc.com" type="email" style={{ flex: 1.4 }} />
            <Btn size="sm" variant="ghost" onClick={() => removeMember(i)} title="Remove">
              <Trash2 size={12} />
            </Btn>
          </div>
        ))}
      </div>

      {/* v30.1.3 — PIC names audit panel */}
      <div style={{ height: 20 }} />
      <div style={{ border: '1px solid ' + TOK.line, borderRadius: 8, padding: 12, background: TOK.surface }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <FieldLabel>🔎 PIC names in this project</FieldLabel>
          <span style={{ fontSize: 10, color: TOK.subtle }}>({auditData.total} unique)</span>
          {!isOwner && <span style={{ fontSize: 10, color: TOK.subtle, fontStyle: 'italic' }}>(owner only)</span>}
        </div>
        <div style={{ fontSize: 11, color: TOK.subtle, lineHeight: 1.5, marginBottom: 10 }}>
          Every name actually used as a PIC anywhere in this project's tasks, actions, decisions, or RAID items. Flagged names (⚠) don't match a member — merge them into a canonical member to consolidate.
        </div>

        {auditData.orphan.length === 0 && auditData.group.length === 0 && auditData.known.length === 0 && (
          <div style={{ fontSize: 12, color: TOK.muted, padding: '8px 4px', fontStyle: 'italic' }}>
            No PIC names in this project yet — add tasks or actions to see them here.
          </div>
        )}

        {auditData.orphan.map((entry) => {
          const sug = entry.suggested;
          return (
            <div key={'o-' + entry.name} title={`Sources: ${entry.sources.join(', ')}`} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
              border: '1px solid ' + TOK.line, borderRadius: 6, marginBottom: 4,
              background: TOK.bg,
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 4, color: '#A8660C', background: '#FAEEDA' }}>⚠</span>
              <span style={{ fontSize: 12, fontWeight: 500, minWidth: 0, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.name}</span>
              <span style={{ fontSize: 10, color: TOK.subtle, whiteSpace: 'nowrap' }}>{entry.count}×</span>
              {sug ? (
                <>
                  <span style={{ fontSize: 11, color: TOK.muted, whiteSpace: 'nowrap' }}>→ Suggested: <strong>{sug.name}</strong></span>
                  {isOwner && (
                    <Btn size="sm" variant="primary" onClick={() => performLegacyMerge({ from: entry.name, to: sug.name, email: sug.email })}>
                      Merge
                    </Btn>
                  )}
                </>
              ) : (
                isOwner && members.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const targetName = e.target.value;
                      if (!targetName) return;
                      if (targetName === '__add__') {
                        setMembers([...members, { name: entry.name, email: '' }]);
                        return;
                      }
                      const target = members.find((m) => m.name === targetName);
                      if (target) performLegacyMerge({ from: entry.name, to: target.name, email: target.email || '' });
                    }}
                    style={{ fontFamily: FONT_STACK, fontSize: 11, padding: '3px 6px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface, color: TOK.ink, maxWidth: 200 }}
                  >
                    <option value="">Merge into…</option>
                    {members.map((m) => (
                      <option key={m.name} value={m.name}>{m.name}{m.email ? ` (${m.email})` : ''}</option>
                    ))}
                    <option value="__add__">+ Add "{entry.name}" to Team Members</option>
                  </select>
                )
              )}
              {!isOwner && <span style={{ fontSize: 10, color: TOK.subtle, fontStyle: 'italic' }}>(owner only)</span>}
            </div>
          );
        })}

        {auditData.group.map((entry) => (
          <div key={'g-' + entry.name} title={`Sources: ${entry.sources.join(', ')}`} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px',
            fontSize: 12, color: TOK.muted,
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 4, color: TOK.muted, background: TOK.bg }}>📁</span>
            <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.name}</span>
            <span style={{ fontSize: 10, color: TOK.subtle }}>group · {entry.count}×</span>
          </div>
        ))}

        {auditData.known.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowKnownNames((v) => !v)}
              style={{ fontFamily: FONT_STACK, fontSize: 11, color: TOK.muted, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              {showKnownNames ? '▾' : '▸'} ✅ {auditData.known.length} known name{auditData.known.length === 1 ? '' : 's'}
            </button>
            {showKnownNames && (
              <div style={{ marginTop: 4 }}>
                {auditData.known.map((entry) => (
                  <div key={'k-' + entry.name} title={`Sources: ${entry.sources.join(', ')}`} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '3px 8px',
                    fontSize: 12, color: TOK.ink,
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 4, color: TOK.doneFg || '#356512', background: TOK.doneBg || '#E6EFD6' }}>✓</span>
                    <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.name}</span>
                    <span style={{ fontSize: 10, color: TOK.subtle }}>{entry.count}×</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Contributor Registry (v26) */}
      <div style={{ height: 20 }} />
      <div style={{ border: '1px solid ' + TOK.line, borderRadius: 8, padding: 12, background: TOK.bg }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <FieldLabel>📋 Contributor registry</FieldLabel>
          {!isOwner && <span style={{ fontSize: 10, color: TOK.subtle }}>(workspace owner only)</span>}
        </div>
        <div style={{ fontSize: 11, color: TOK.subtle, lineHeight: 1.5, marginBottom: 10 }}>
          Standard list of contributor names (teams, roles, external parties). Used for autocomplete in task editor and to detect typos in legacy data.
        </div>
        {isOwner && (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
              <Input
                value={newContribName}
                onChange={setNewContribName}
                onKeyDown={(e) => { if (e.key === 'Enter' && newContribName.trim()) { e.preventDefault(); addContributorToRegistry(); } }}
                placeholder="Add custom name: e.g., Marketing, Sales, Vendor X"
                style={{ flex: 1 }}
              />
              <Btn size="sm" variant="primary" onClick={addContributorToRegistry} disabled={!newContribName.trim()}>
                <Plus size={11} /> Add
              </Btn>
              <Btn size="sm" onClick={seedDefaultDepartments} title={`Add common company departments: ${DEFAULT_DEPARTMENTS.join(', ')}`}>
                ✨ Seed defaults
              </Btn>
            </div>
            <div style={{ fontSize: 11, color: TOK.subtle, marginBottom: 10, lineHeight: 1.5 }}>
              Type a custom contributor name then press <kbd style={{ background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 3, padding: '0 4px', fontSize: 10 }}>Enter</kbd> or click <strong>+ Add</strong>. To attach a contributor to a specific task, edit the task → ContributorEditor.
            </div>
          </>
        )}
        {contributorRegistry.length === 0 ? (
          <div style={{ fontSize: 12, color: TOK.subtle, padding: 12, textAlign: 'center', background: TOK.surface, borderRadius: 6, lineHeight: 1.6 }}>
            <div style={{ marginBottom: 4 }}>📋 Empty registry</div>
            <div>
              Click <strong>✨ Seed defaults</strong> above to add common departments<br />
              ({DEFAULT_DEPARTMENTS.join(', ')}), or type a custom name and click <strong>+ Add</strong>.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {contributorRegistry.map((r) => {
              const usage = usedContributors.get(r.name);
              return (
                <span key={r.name} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 999,
                  padding: '3px 4px 3px 10px', fontSize: 12,
                }}>
                  {r.name}
                  {usage && <span style={{ fontSize: 10, color: TOK.muted }}>({usage.count})</span>}
                  {isOwner && (
                    <button onClick={() => removeContributorFromRegistry(r.name)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 2, display: 'flex' }}
                      title="Remove from registry">
                      <X size={11} />
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        )}

        {/* Cleanup section: unregistered names */}
        {(() => {
          const registrySet = new Set(contributorRegistry.map((r) => r.name));
          const memberSet = new Set(members.map((m) => m.name));
          const unregistered = Array.from(usedContributors.entries())
            .filter(([n]) => !registrySet.has(n) && !memberSet.has(n))
            .sort((a, b) => b[1].count - a[1].count);
          if (unregistered.length === 0) return null;
          return (
            <div style={{ marginTop: 10, padding: 10, background: '#FAEEDA', borderRadius: 6, border: '1px solid #E0BC75' }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: '#A8660C', marginBottom: 6 }}>
                ⚠ Unregistered contributor names found in tasks ({unregistered.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {unregistered.map(([n, info]) => (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span style={{ flex: 1 }}>{n} <span style={{ color: TOK.muted, fontSize: 11 }}>({info.count} task{info.count === 1 ? '' : 's'})</span></span>
                    {isOwner && (
                      <>
                        <Btn size="sm" onClick={() => adoptToRegistry(n)} title="Add to registry as-is">Adopt</Btn>
                        <Btn size="sm" onClick={() => { setMergeFrom(n); setMergeTo(''); }} title="Replace with another name">Merge…</Btn>
                        <Btn size="sm" variant="ghost" onClick={() => performDeleteFromTasks(n)} title="Delete from all tasks">Remove</Btn>
                      </>
                    )}
                  </div>
                ))}
              </div>
              {mergeFrom && isOwner && (
                <div style={{ marginTop: 10, padding: 10, background: TOK.surface, borderRadius: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Merge "{mergeFrom}" → ?</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select value={mergeTo} onChange={(e) => setMergeTo(e.target.value)}
                      style={{ flex: 1, fontFamily: FONT_STACK, fontSize: 12, padding: '6px 8px', border: '1px solid ' + TOK.lineStrong, borderRadius: 6, background: TOK.surface }}>
                      <option value="">— pick target name —</option>
                      <optgroup label="Team members">
                        {members.filter((m) => m.name !== mergeFrom).map((m) => (
                          <option key={m.name} value={m.name}>{m.name}{m.email ? ` (${m.email})` : ''}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Registry">
                        {contributorRegistry.filter((r) => r.name !== mergeFrom).map((r) => (
                          <option key={r.name} value={r.name}>{r.name}</option>
                        ))}
                      </optgroup>
                    </select>
                    <Btn size="sm" variant="primary" onClick={performMerge} disabled={!mergeTo}>Merge</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => { setMergeFrom(''); setMergeTo(''); }}>Cancel</Btn>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* ─── 🗨 Google Chat integration ─── */}
      <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid ' + TOK.line }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>🗨 Google Chat integration</div>
        <div style={{ fontSize: 11, color: TOK.muted, marginBottom: 10, lineHeight: 1.5 }}>
          Paste the project's Google Chat space webhook URL. Action update notifications post to that space when "📢 Notify chat" is ticked.
        </div>
        <input
          type="text"
          value={chatWebhook}
          onChange={(e) => { setChatWebhook(e.target.value); setChatWebhookError(''); setChatTestStatus(null); }}
          onBlur={commitChatWebhook}
          disabled={!isOwner}
          placeholder={WEBHOOK_PREFIX + '...'}
          style={{
            fontFamily: FONT_STACK, fontSize: 12, width: '100%',
            padding: '7px 10px', border: '1px solid ' + (chatWebhookError ? TOK.overdueFg : TOK.lineStrong),
            borderRadius: 6, background: isOwner ? TOK.surface : TOK.bg, color: TOK.ink, outline: 'none',
          }}
        />
        {chatWebhookError && (
          <div style={{ fontSize: 11, color: TOK.overdueFg, marginTop: 4 }}>{chatWebhookError}</div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          {isOwner && (
            <Btn size="sm" onClick={sendChatTest} disabled={!chatWebhook.trim()}>
              Send test message
            </Btn>
          )}
          {chatTestStatus && (
            <span style={{ fontSize: 11, color: chatTestStatus.kind === 'ok' ? TOK.doneFg : TOK.overdueFg }}>
              {chatTestStatus.message}
            </span>
          )}
          {!isOwner && (
            <span style={{ fontSize: 11, color: TOK.subtle, fontStyle: 'italic' }}>
              🔒 Workspace owner only
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: TOK.subtle, marginTop: 10, lineHeight: 1.5 }}>
          How to get this: open the project's Google Chat space → Space settings → Apps &amp; integrations → + Add webhook → Copy URL and paste above.
        </div>
      </div>

      <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" disabled={!name.trim()} onClick={save}>Save</Btn>
      </div>
    </Modal>
  );
}

function NewProjectModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const submit = () => { if (name.trim()) onCreate(name); };
  return (
    <Modal title="Create new project" onClose={onClose} width={420}>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: TOK.muted }}>Start fresh with an empty project you'll build out manually.</p>
      <FieldLabel>Project name</FieldLabel>
      <Input
        value={name}
        onChange={setName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        }}
        placeholder="e.g., Vietnam Expansion 2027"
        autoFocus
      />
      <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" disabled={!name.trim()} onClick={submit}>Create</Btn>
      </div>
    </Modal>
  );
}

function ImportModal({ onClose, onImport }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const pick = () => inputRef.current?.click();
  return (
    <Modal title="Import Excel / CSV" onClose={onClose} width={520}>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: TOK.muted, lineHeight: 1.55 }}>
        Upload an Excel (.xlsx) or CSV file using the CRP template columns: Project, Program Stream (PS), Work Stream, Main Task, Status, PIC, Start date, End date, Durations, Key Deliverables, Dependencies.
      </p>
      <div onClick={pick}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) onImport(f); }}
        style={{ border: '2px dashed ' + (drag ? TOK.accent : TOK.lineStrong), borderRadius: 10, padding: 28, textAlign: 'center', cursor: 'pointer', background: drag ? TOK.doneBg : TOK.bg, color: TOK.muted }}>
        <FileSpreadsheet size={28} style={{ margin: '0 auto 8px', display: 'block', color: TOK.muted }} />
        <div style={{ fontSize: 13, color: TOK.ink, fontWeight: 500, marginBottom: 3 }}>Drop file here or click to browse</div>
        <div style={{ fontSize: 11 }}>.xlsx, .xls, .csv</div>
      </div>
      <input type="file" ref={inputRef} accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
      <div style={{ marginTop: 14, fontSize: 11, color: TOK.subtle }}>Imported projects are added alongside existing ones. If a name already exists, a number is appended (e.g., "CRP (2)").</div>
    </Modal>
  );
}
