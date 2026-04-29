import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Plus, Edit2, Trash2, X, Upload, Download, ChevronRight, ChevronDown,
  Save, Map as MapIcon, List as ListIcon, Calendar, FileSpreadsheet,
  Clock, AlertTriangle, CheckCircle2, Circle, PlayCircle,
  MessageSquare, Search, MoreHorizontal, FolderPlus, FileDown,
  FileUp, Activity, Home, ArrowRightLeft, Info, RefreshCw, UserCircle,
  Move, FileText, History, Grip, BarChart3
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { SearchModal, useSearchHotkey } from './components/SearchModal';
import { GanttView } from './components/GanttView';
import { MembersModal } from './components/MembersModal';
import { useAuth } from './auth';

/* ═════════ SEED DATA ═════════ */
const SEED_CRP = {"id": "proj_crp", "name": "CRP", "createdAt": "2026-04-24T00:00:00.000Z", "programs": [{"id": "p_1", "name": "LLCs", "workstreams": [{"id": "w_1", "name": "HIO", "tasks": [{"id": "t_1", "name": "Resolution for dissolutions & Submit to BRA", "status": "Planned", "pic": "Legal", "start": "2026-04-15", "end": "2026-04-30", "duration": 15, "deliverables": "Quyết định chấp thuận Hồ sơ xin giải thể", "dependencies": null, "checkIns": []}, {"id": "t_2", "name": "Debt payment plan, asset liquidation", "status": "Planned", "pic": "AF", "start": "2026-04-15", "end": "2026-04-30", "duration": 15, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_3", "name": "Close Tax code - Tổng hợp rủi ro & estimate inspection cost", "status": "Planned", "pic": "AF", "start": "2026-03-20", "end": "2026-03-30", "duration": 10, "deliverables": "1. Bảng tổng hợp rủi ro & review report for tax status during previous years", "dependencies": null, "checkIns": []}, {"id": "t_4", "name": "Submit request for tax code closure", "status": "Planned", "pic": "AF", "start": "2026-03-30", "end": "2026-04-14", "duration": 15, "deliverables": "2. Tax audit request for closure", "dependencies": null, "checkIns": []}, {"id": "t_5", "name": "Tax inspection process for tax code closre", "status": "Planned", "pic": "AF", "start": "2026-04-14", "end": "2026-06-13", "duration": 60, "deliverables": "2. Biên bản quyết toán Thuế\n3. Chấp thuận đóng Mã Số Thuế", "dependencies": null, "checkIns": []}, {"id": "t_6", "name": "Settles debts, distribute remainders to owners", "status": "Planned", "pic": "AF", "start": "2026-06-13", "end": "2026-07-13", "duration": 30, "deliverables": "Shares returns to individuals", "dependencies": "Meeting + BoD", "checkIns": []}, {"id": "t_7", "name": "Submit application for dissolustions to BRAs", "status": "Planned", "pic": "Legal", "start": "2026-07-13", "end": "2026-08-12", "duration": 30, "deliverables": "Quyết định chấp thuận Hồ sơ xin giải thể", "dependencies": null, "checkIns": []}]}, {"id": "w_2", "name": "SKT", "tasks": [{"id": "t_8", "name": "Resolution for dissolutions & Submit to BRA", "status": "Planned", "pic": "Legal", "start": "2026-04-15", "end": "2026-04-30", "duration": 15, "deliverables": "Quyết định chấp thuận Hồ sơ xin giải thể", "dependencies": null, "checkIns": []}, {"id": "t_9", "name": "Debt payment plan, asset liquidation", "status": "Planned", "pic": "AF", "start": "2026-04-15", "end": "2026-04-30", "duration": 15, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_10", "name": "Close Tax code - Tổng hợp rủi ro & estimate inspection cost", "status": "Planned", "pic": "AF", "start": "2026-04-15", "end": "2026-04-30", "duration": 15, "deliverables": "1. Bảng tổng hợp rủi ro & review report for tax status during previous years", "dependencies": null, "checkIns": []}, {"id": "t_11", "name": "Submit request for tax code closure", "status": "Planned", "pic": "AF", "start": "2026-04-30", "end": "2026-05-15", "duration": 15, "deliverables": "2. Tax audit request for closure", "dependencies": null, "checkIns": []}, {"id": "t_12", "name": "Tax inspection process for tax code closre", "status": "Planned", "pic": "AF", "start": "2026-05-15", "end": "2026-08-13", "duration": 90, "deliverables": "2. Biên bản quyết toán Thuế\n3. Chấp thuận đóng Mã Số Thuế", "dependencies": null, "checkIns": []}, {"id": "t_13", "name": "Settles debts, distribute remainders to owners", "status": "Planned", "pic": "AF", "start": "2026-08-13", "end": "2026-09-12", "duration": 30, "deliverables": "Shares returns to individuals", "dependencies": null, "checkIns": []}, {"id": "t_14", "name": "Submit application for dissolustions to BRAs", "status": "Planned", "pic": "Legal", "start": "2026-09-12", "end": "2026-10-12", "duration": 30, "deliverables": "Quyết định chấp thuận Hồ sơ xin giải thể", "dependencies": null, "checkIns": []}]}]}, {"id": "p_2", "name": "NSC", "workstreams": [{"id": "w_3", "name": "New SingCo", "tasks": [{"id": "t_15", "name": "Chốt Business Plan ( Owner structure,  Nhân sự, business operation model, estimate PnL)", "status": "Planned", "pic": "AF", "start": "2026-04-15", "end": "2026-04-25", "duration": 10, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_16", "name": "High-level communication", "status": "Planned", "pic": "Sponsor", "start": "2026-04-15", "end": "2026-04-30", "duration": 15, "deliverables": "BOM, Appointed Legal Rep/ Ownership, Moved HODs", "dependencies": null, "checkIns": []}, {"id": "t_17", "name": "Overseas investment registration", "status": "Planned", "pic": "Legal", "start": "2026-04-25", "end": "2026-06-09", "duration": 45, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_18", "name": "Advisory Report for NewSingco Structure", "status": "Planned", "pic": "AF", "start": "2026-04-25", "end": "2026-05-20", "duration": 25, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_19", "name": "Incorporate Registration", "status": "Planned", "pic": "Legal", "start": "2026-06-09", "end": "2026-07-09", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_20", "name": "Góp vốn thành lập", "status": "Planned", "pic": "AF", "start": "2026-07-09", "end": "2026-07-19", "duration": 10, "deliverables": "Mở tài khoản NH + Góp vốn theo đăng ký tại ERCs", "dependencies": null, "checkIns": []}, {"id": "t_21", "name": "Compliance work - Legal", "status": "Planned", "pic": "Legal", "start": "2026-07-09", "end": "2026-07-24", "duration": 15, "deliverables": "Công bố thông tin + khắc dấu", "dependencies": null, "checkIns": []}, {"id": "t_22", "name": "Compliance work - Taxes & Accounting", "status": "Planned", "pic": "AF", "start": "2026-07-09", "end": "2026-07-24", "duration": 15, "deliverables": "Đăng ký thuế, set up kế toán", "dependencies": null, "checkIns": []}, {"id": "t_23", "name": "Compliance work - Insurance, ....", "status": "Planned", "pic": "HR", "start": "2026-07-09", "end": "2026-07-24", "duration": 15, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_24", "name": "Bank mandate set up", "status": "Planned", "pic": "AF", "start": "2026-07-09", "end": "2026-07-24", "duration": 15, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_25", "name": "Prepare cash flow", "status": "Planned", "pic": "AF", "start": "2026-07-09", "end": "2026-07-24", "duration": 15, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_26", "name": "Hire key staffs", "status": "Planned", "pic": "HR", "start": "2026-05-25", "end": "2026-07-24", "duration": 60, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_27", "name": "Vendor for opeartion- Accounting", "status": "Planned", "pic": "AF", "start": "2026-06-09", "end": "2026-07-24", "duration": 45, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_28", "name": "Vendor for opeartion- HR", "status": "Planned", "pic": "HR", "start": "2026-07-09", "end": "2026-08-08", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_29", "name": "Vendor for opeartion- Legal", "status": "Planned", "pic": "HR", "start": "2026-07-09", "end": "2026-08-08", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_30", "name": "DOA, SOPs ver 2 ( HR)", "status": "Planned", "pic": "HR", "start": "2026-07-24", "end": "2026-09-07", "duration": 45, "deliverables": "Nội quy lao động, Quy chế, Org chart, UQ etc", "dependencies": null, "checkIns": []}, {"id": "t_31", "name": "DOA, SOPs ver 2 ( AF)", "status": "Planned", "pic": "AF", "start": "2026-07-24", "end": "2026-09-07", "duration": 45, "deliverables": "Quy chế TC, DOAs", "dependencies": null, "checkIns": []}, {"id": "t_32", "name": "Data migration & System update - Legal", "status": "Planned", "pic": "Legal", "start": "2026-07-24", "end": "2026-10-22", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_33", "name": "Data migration & System update - IT", "status": "Planned", "pic": "IT", "start": "2026-07-24", "end": "2026-10-22", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_34", "name": "Data migration & System update - HR", "status": "Planned", "pic": "HR", "start": "2026-07-24", "end": "2026-10-22", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_35", "name": "Data migration & System update - AF", "status": "Planned", "pic": "AF", "start": "2026-07-24", "end": "2026-10-22", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_36", "name": "Business Performance reporting New Structure - FIN", "status": "Planned", "pic": "FIN", "start": "2026-07-24", "end": "2026-10-22", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_37", "name": "First year PnL & Divident distribution - AF Work", "status": "Planned", "pic": "AF", "start": "2026-10-22", "end": "2026-12-21", "duration": 60, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_38", "name": "First year PnL & Divident distribution - Legal Work", "status": "Planned", "pic": "Legal", "start": "2026-12-21", "end": "2027-02-19", "duration": 60, "deliverables": null, "dependencies": null, "checkIns": []}]}]}, {"id": "p_3", "name": "NVNC", "workstreams": [{"id": "w_4", "name": "New VNCo", "tasks": [{"id": "t_39", "name": "Chốt Business Plan ( Owner structure,  Nhân sự, business operation model, estimate PnL)", "status": "Planned", "pic": "AF", "start": "2026-04-15", "end": "2026-05-15", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_40", "name": "High-level communication", "status": "Planned", "pic": "Sponsor", "start": "2026-04-15", "end": "2026-05-15", "duration": 30, "deliverables": "BOM, Appointed Legal Rep/ Ownership, Moved HODs", "dependencies": null, "checkIns": []}, {"id": "t_41", "name": "Investment registration", "status": "Planned", "pic": "Legal", "start": "2026-07-19", "end": "2026-08-18", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_42", "name": "Enterprise Registration", "status": "Planned", "pic": "Legal", "start": "2026-08-18", "end": "2026-09-17", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_43", "name": "Góp vốn thành lập", "status": "Planned", "pic": "AF", "start": "2026-09-17", "end": "2026-09-27", "duration": 10, "deliverables": "Mở tài khoản NH + Góp vốn theo đăng ký tại ERCs", "dependencies": null, "checkIns": []}, {"id": "t_44", "name": "Compliance work - Legal", "status": "Planned", "pic": "Legal", "start": "2026-09-17", "end": "2026-10-07", "duration": 20, "deliverables": "Công bố thông tin + khắc dấu", "dependencies": null, "checkIns": []}, {"id": "t_45", "name": "Compliance work - Taxes & Accounting", "status": "Planned", "pic": "AF", "start": "2026-09-17", "end": "2026-10-07", "duration": 20, "deliverables": "Đăng ký thuế, set up kế toán", "dependencies": null, "checkIns": []}, {"id": "t_46", "name": "Compliance work - HR", "status": "Planned", "pic": "HR", "start": "2026-09-17", "end": "2026-10-07", "duration": 20, "deliverables": "Insurances, etc", "dependencies": null, "checkIns": []}, {"id": "t_47", "name": "Bank mandate set up", "status": "Planned", "pic": "AF", "start": "2026-09-17", "end": "2026-10-07", "duration": 20, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_48", "name": "Prepare cash flow", "status": "Planned", "pic": "AF", "start": "2026-09-17", "end": "2026-10-07", "duration": 20, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_49", "name": "Coms & Move Staffs", "status": "Planned", "pic": "HR", "start": "2026-08-18", "end": "2026-10-17", "duration": 60, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_50", "name": "Vendor, asset  movement - Accouting systems", "status": "Planned", "pic": "AF", "start": "2026-09-17", "end": "2026-10-17", "duration": 30, "deliverables": "Chuyển tài sản, HĐ vendor gắn với nhân sự sang sở hữu bởi SPVs\nChuyển HĐ thuê VP sang SPVs", "dependencies": null, "checkIns": []}, {"id": "t_51", "name": "Vendor, asset  movement - Vendor works", "status": "Planned", "pic": "GA", "start": "2026-09-17", "end": "2026-10-17", "duration": 30, "deliverables": "Chuyển tài sản, HĐ vendor gắn với nhân sự sang sở hữu bởi SPVs\nChuyển HĐ thuê VP sang SPVs", "dependencies": null, "checkIns": []}, {"id": "t_52", "name": "Management  Contracts (InterCo)", "status": "Planned", "pic": "AF", "start": "2026-07-19", "end": "2026-09-17", "duration": 60, "deliverables": "Ký Hợp đồng với SM Sing/ ANZ", "dependencies": null, "checkIns": []}, {"id": "t_53", "name": "Management  Contracts (New Clients)", "status": "Planned", "pic": "AF", "start": "2026-05-15", "end": "2026-08-13", "duration": 90, "deliverables": "Communicate với key levels (MLs, HODs) v/v chuyển các HĐ đang kí với VN qua kí với new entities & v/v các khách hàng mới sẽ kí với new VNCO", "dependencies": null, "checkIns": []}, {"id": "t_54", "name": "Management billings", "status": "Planned", "pic": "AF", "start": "2026-10-07", "end": "2026-11-21", "duration": 45, "deliverables": "Luồng billing giữa các entities", "dependencies": null, "checkIns": []}, {"id": "t_55", "name": "TPs & documents", "status": "Planned", "pic": "AF", "start": "2026-10-17", "end": "2026-12-01", "duration": 45, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_56", "name": "DOA, SOPs ver 2 ( Legal)", "status": "Planned", "pic": "Legal", "start": "2026-10-07", "end": "2026-11-21", "duration": 45, "deliverables": "Quy chế, DOAs", "dependencies": null, "checkIns": []}, {"id": "t_57", "name": "DOA, SOPs ver 2 ( HR)", "status": "Planned", "pic": "HR", "start": "2026-10-07", "end": "2026-11-21", "duration": 45, "deliverables": "Nội quy lao động, Quy chế, Org chart, UQ etc", "dependencies": null, "checkIns": []}, {"id": "t_58", "name": "DOA, SOPs ver 2 ( AF)", "status": "Planned", "pic": "AF", "start": "2026-10-07", "end": "2026-11-21", "duration": 45, "deliverables": "Quy chế TC, DOAs", "dependencies": null, "checkIns": []}, {"id": "t_59", "name": "Data migration & System update - Legal", "status": "Planned", "pic": "Legal", "start": "2026-10-07", "end": "2027-01-05", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_60", "name": "Data migration & System update - IT", "status": "Planned", "pic": "IT", "start": "2026-10-07", "end": "2027-01-05", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_61", "name": "Data migration & System update - HR", "status": "Planned", "pic": "HR", "start": "2026-10-07", "end": "2027-01-05", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_62", "name": "Data migration & System update - AF", "status": "Planned", "pic": "AF", "start": "2026-10-07", "end": "2027-01-05", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_63", "name": "Business Performance reporting New Structure - FIN", "status": "Planned", "pic": "FIN", "start": "2026-10-07", "end": "2027-01-05", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_64", "name": "First year PnL & Divident distribution - AF Work", "status": "Planned", "pic": "AF", "start": "2027-03-26", "end": "2027-06-24", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_65", "name": "First year PnL & Divident distribution - Legal Work", "status": "Planned", "pic": "Legal", "start": "2027-03-26", "end": "2027-06-24", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}]}]}, {"id": "p_4", "name": "SSWAP", "workstreams": [{"id": "w_5", "name": "New Sing Co.", "tasks": [{"id": "t_66", "name": "Obtain M&A Approval", "status": "Planned", "pic": "Legal", "start": "2026-07-24", "end": "2026-08-23", "duration": 30, "deliverables": "Thông báo chấp thuận việc mua cổ phần", "dependencies": null, "checkIns": []}, {"id": "t_67", "name": "SPA a among SingCo & LLCs", "status": "Planned", "pic": "Legal", "start": "2026-07-24", "end": "2026-08-23", "duration": 30, "deliverables": "SPAs", "dependencies": null, "checkIns": []}, {"id": "t_68", "name": "Ký kết HĐ chuyển nhượng vốn và Kê khai, nộp thuế", "status": "Planned", "pic": "AF", "start": "2026-08-24", "end": "2026-09-08", "duration": 15, "deliverables": "1. Hợp đồng chuyển nhượng vốn\n2. Seller Kê khai, nộp thuế liên quan chuyển nhượng vốn", "dependencies": null, "checkIns": []}, {"id": "t_69", "name": "Thực hiện chuyển nhượng vốn và trả tiền cho Sellers", "status": "Planned", "pic": "AF", "start": "2026-09-09", "end": "2026-09-24", "duration": 15, "deliverables": "1.Chuyển vốn vào TK DICA của SM Corp\n2. SM Corp trả tiền bán Cổ phần cho Sellers từ DICA", "dependencies": null, "checkIns": []}, {"id": "t_70", "name": "Cập nhật Sổ đăng ký cổ đông", "status": "Planned", "pic": "Legal", "start": "2026-09-25", "end": "2026-09-30", "duration": 5, "deliverables": "Sổ đăng ký cổ đông", "dependencies": null, "checkIns": []}, {"id": "t_71", "name": "Notify of change innumber of shares hold by foreignshare holder", "status": "Planned", "pic": "Legal", "start": "2026-09-30", "end": "2026-10-05", "duration": 5, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_72", "name": "Dividend pays to NewSingCo", "status": "Planned", "pic": "Legal", "start": "2026-10-05", "end": "2026-10-10", "duration": 5, "deliverables": null, "dependencies": null, "checkIns": []}]}]}, {"id": "p_5", "name": "SPVs", "workstreams": [{"id": "w_6", "name": "ManagementCo", "tasks": [{"id": "t_73", "name": "Chốt Business Plan ( Owner structure,  Nhân sự, business operation model, estimte PnL)", "status": "Planned", "pic": "AF", "start": "2026-03-23", "end": "2026-04-07", "duration": 15, "deliverables": null, "dependencies": "Meeting + BoD", "checkIns": []}, {"id": "t_74", "name": "High-level communication", "status": "Planned", "pic": "Sponsor", "start": "2026-03-23", "end": "2026-04-12", "duration": 20, "deliverables": "BOM, Appointed Legal Rep/ Ownership, Moved HODs", "dependencies": null, "checkIns": []}, {"id": "t_75", "name": "Nộp hồ sơ đăng ký thành lập SPVs (get ERC)", "status": "Planned", "pic": "Legal", "start": "2026-04-12", "end": "2026-04-27", "duration": 15, "deliverables": "Đăng ký kinh doanh (ERC)", "dependencies": null, "checkIns": []}, {"id": "t_76", "name": "Góp vốn thành lập", "status": "Planned", "pic": "AF", "start": "2026-04-27", "end": "2026-05-07", "duration": 10, "deliverables": "Mở tài khoản NH + Góp vốn theo đăng ký tại ERCs", "dependencies": null, "checkIns": []}, {"id": "t_77", "name": "Compliance work - Legal", "status": "Planned", "pic": "Legal", "start": "2026-04-27", "end": "2026-05-07", "duration": 10, "deliverables": "Công bố thông tin + khắc dấu", "dependencies": null, "checkIns": []}, {"id": "t_78", "name": "Compliance work - Taxes & Accounting", "status": "Planned", "pic": "AF", "start": "2026-04-27", "end": "2026-05-07", "duration": 10, "deliverables": "Đăng ký thuế, set up kế toán", "dependencies": null, "checkIns": []}, {"id": "t_79", "name": "Compliance work - HR", "status": "Planned", "pic": "HR", "start": "2026-04-27", "end": "2026-05-07", "duration": 10, "deliverables": "Insurances, ...", "dependencies": null, "checkIns": []}, {"id": "t_80", "name": "Bank mandate set up", "status": "Planned", "pic": "AF", "start": "2026-04-27", "end": "2026-05-17", "duration": 20, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_81", "name": "Prepare cash flow", "status": "Planned", "pic": "AF", "start": "2026-04-27", "end": "2026-05-17", "duration": 20, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_82", "name": "Coms & Move Staffs", "status": "Planned", "pic": "HR", "start": "2026-04-12", "end": "2026-05-27", "duration": 45, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_83", "name": "Vendor, asset  movement - Accouting systems", "status": "Planned", "pic": "AF", "start": "2026-04-27", "end": "2026-05-27", "duration": 30, "deliverables": "Chuyển tài sản, HĐ vendor gắn với nhân sự sang sở hữu bởi SPVs\nChuyển HĐ thuê VP sang SPVs", "dependencies": null, "checkIns": []}, {"id": "t_84", "name": "Vendor, asset  movement - Vendor works", "status": "Planned", "pic": "GA", "start": "2026-04-27", "end": "2026-05-27", "duration": 30, "deliverables": "Chuyển tài sản, HĐ vendor gắn với nhân sự sang sở hữu bởi SPVs\nChuyển HĐ thuê VP sang SPVs", "dependencies": null, "checkIns": []}, {"id": "t_85", "name": "Management  Contracts", "status": "Planned", "pic": "AF", "start": "2026-04-27", "end": "2026-06-11", "duration": 45, "deliverables": "Ký Hợp đồng với SM Sing/ ANZ", "dependencies": null, "checkIns": []}, {"id": "t_86", "name": "Management billings", "status": "Planned", "pic": "AF", "start": "2026-04-27", "end": "2026-06-11", "duration": 45, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_87", "name": "TPs & documents", "status": "Planned", "pic": "AF", "start": "2026-04-27", "end": "2026-06-11", "duration": 45, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_88", "name": "DOA, SOPs ver 2 ( HR)", "status": "Planned", "pic": "HR", "start": "2026-05-07", "end": "2026-06-21", "duration": 45, "deliverables": "Nội quy lao động, Quy chế, Org chart, UQ etc", "dependencies": null, "checkIns": []}, {"id": "t_89", "name": "DOA, SOPs ver 2 ( AF)", "status": "Planned", "pic": "AF", "start": "2026-05-27", "end": "2026-07-11", "duration": 45, "deliverables": "Quy chế TC, DOAs", "dependencies": null, "checkIns": []}, {"id": "t_90", "name": "Data migration & System update - Legal", "status": "Planned", "pic": "Legal", "start": "2026-05-27", "end": "2026-08-25", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_91", "name": "Data migration & System update - IT", "status": "Planned", "pic": "IT", "start": "2026-05-27", "end": "2026-08-25", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_92", "name": "Data migration & System update - HR", "status": "Planned", "pic": "HR", "start": "2026-05-27", "end": "2026-08-25", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_93", "name": "Data migration & System update - AF", "status": "Planned", "pic": "AF", "start": "2026-05-27", "end": "2026-08-25", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_94", "name": "First year PnL & Divident distribution - AF Work", "status": "Planned", "pic": "AF", "start": "2026-08-25", "end": "2026-10-24", "duration": 60, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_95", "name": "First year PnL & Divident distribution - Legal Work", "status": "Planned", "pic": "Legal", "start": "2026-10-24", "end": "2026-12-23", "duration": 60, "deliverables": null, "dependencies": null, "checkIns": []}]}, {"id": "w_7", "name": "SPVs", "tasks": [{"id": "t_96", "name": "Business Performance reporting New Structure - FIN", "status": "Planned", "pic": "FIN", "start": "2026-05-27", "end": "2026-08-25", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}]}, {"id": "w_8", "name": "FIB Co", "tasks": [{"id": "t_97", "name": "Chốt Business Plan ( Owner structure,  Nhân sự, business operation model, estimte PnL)", "status": "Planned", "pic": "AF", "start": "2026-03-23", "end": "2026-04-07", "duration": 15, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_98", "name": "High-level communication", "status": "Planned", "pic": "Sponsor", "start": "2026-03-23", "end": "2026-04-22", "duration": 30, "deliverables": "BOM, Appointed Legal Rep/ Ownership, Moved HODs", "dependencies": null, "checkIns": []}, {"id": "t_99", "name": "Nộp hồ sơ đăng ký thành lập SPVs (get ERC)", "status": "Planned", "pic": "Legal", "start": "2026-04-22", "end": "2026-05-22", "duration": 30, "deliverables": "Đăng ký kinh doanh (ERC)", "dependencies": null, "checkIns": []}, {"id": "t_100", "name": "Góp vốn thành lập", "status": "Planned", "pic": "AF", "start": "2026-05-22", "end": "2026-06-01", "duration": 10, "deliverables": "Mở tài khoản NH + Góp vốn theo đăng ký tại ERCs", "dependencies": null, "checkIns": []}, {"id": "t_101", "name": "Compliance work - Legal", "status": "Planned", "pic": "Legal", "start": "2026-05-22", "end": "2026-06-01", "duration": 10, "deliverables": "Công bố thông tin + khắc dấu", "dependencies": null, "checkIns": []}, {"id": "t_102", "name": "Compliance work - Taxes & Accounting", "status": "Planned", "pic": "AF", "start": "2026-05-22", "end": "2026-06-01", "duration": 10, "deliverables": "Đăng ký thuế, set up kế toán", "dependencies": null, "checkIns": []}, {"id": "t_103", "name": "Compliance work - Insurance, ....", "status": "Planned", "pic": "HR", "start": "2026-05-22", "end": "2026-06-01", "duration": 10, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_104", "name": "Bank mandate set up", "status": "Planned", "pic": "AF", "start": "2026-05-22", "end": "2026-06-06", "duration": 15, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_105", "name": "Prepare cash flow", "status": "Planned", "pic": "AF", "start": "2026-05-22", "end": "2026-06-06", "duration": 15, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_106", "name": "Coms & Move Staffs", "status": "Planned", "pic": "HR", "start": "2026-04-22", "end": "2026-06-21", "duration": 60, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_107", "name": "Vendor, asset  movement - Accouting systems", "status": "Planned", "pic": "AF", "start": "2026-05-22", "end": "2026-06-21", "duration": 30, "deliverables": "Chuyển tài sản, HĐ vendor gắn với nhân sự sang sở hữu bởi SPVs\nChuyển HĐ thuê VP sang SPVs", "dependencies": null, "checkIns": []}, {"id": "t_108", "name": "Vendor, asset  movement - Vendor works", "status": "Planned", "pic": "GA", "start": "2026-05-22", "end": "2026-06-21", "duration": 30, "deliverables": "Chuyển tài sản, HĐ vendor gắn với nhân sự sang sở hữu bởi SPVs\nChuyển HĐ thuê VP sang SPVs", "dependencies": null, "checkIns": []}, {"id": "t_109", "name": "Management  Contracts", "status": "Planned", "pic": "AF", "start": "2026-05-22", "end": "2026-07-06", "duration": 45, "deliverables": "Ký Hợp đồng với SM OSC", "dependencies": null, "checkIns": []}, {"id": "t_110", "name": "Management billings", "status": "Planned", "pic": "AF", "start": "2026-05-22", "end": "2026-07-06", "duration": 45, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_111", "name": "TPs & documents", "status": "Planned", "pic": "AF", "start": "2026-05-22", "end": "2026-07-06", "duration": 45, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_112", "name": "DOA, SOPs ver 2 ( HR)", "status": "Planned", "pic": "HR", "start": "2026-06-01", "end": "2026-07-16", "duration": 45, "deliverables": "Nội quy lao động, Quy chế, Org chart, UQ etc", "dependencies": null, "checkIns": []}, {"id": "t_113", "name": "DOA, SOPs ver 2 ( AF)", "status": "Planned", "pic": "AF", "start": "2026-06-21", "end": "2026-08-05", "duration": 45, "deliverables": "Quy chế TC, DOAs", "dependencies": null, "checkIns": []}, {"id": "t_114", "name": "Data migration & System update - Legal", "status": "Planned", "pic": "Legal", "start": "2026-06-21", "end": "2026-09-19", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_115", "name": "Data migration & System update - IT", "status": "Planned", "pic": "IT", "start": "2026-06-21", "end": "2026-09-19", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_116", "name": "Data migration & System update - HR", "status": "Planned", "pic": "HR", "start": "2026-06-21", "end": "2026-09-19", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_117", "name": "Data migration & System update - AF", "status": "Planned", "pic": "AF", "start": "2026-06-21", "end": "2026-09-19", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_118", "name": "First year PnL & Divident distribution - AF Work", "status": "Planned", "pic": "AF", "start": "2026-09-19", "end": "2026-11-18", "duration": 60, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_119", "name": "First year PnL & Divident distribution - Legal Work", "status": "Planned", "pic": "Legal", "start": "2026-11-18", "end": "2027-01-17", "duration": 60, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_120", "name": "Quyết toán + Đóng cửa VP HCM - AF Part", "status": "Planned", "pic": "AF", "start": "2026-11-18", "end": "2027-02-16", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}]}]}, {"id": "p_6", "name": "FINTECH", "workstreams": [{"id": "w_9", "name": "Fintech Co", "tasks": [{"id": "t_121", "name": "Chốt Business Plan ( Owner structure,  Nhân sự, business operation model, estimte PnL)", "status": "Planned", "pic": "AF", "start": "2025-09-15", "end": "2025-09-30", "duration": 15, "deliverables": null, "dependencies": "Meeting + BoD", "checkIns": []}, {"id": "t_122", "name": "High-level communication", "status": "Planned", "pic": "Sponsor", "start": "2025-10-01", "end": "2025-10-13", "duration": 12, "deliverables": "BOM, Appointed Legal Rep/ Ownership, Moved HODs", "dependencies": null, "checkIns": []}, {"id": "t_123", "name": "Cập nhật cơ cấu sở hữu (nếu có) - Cash", "status": "Planned", "pic": "AF", "start": "2026-04-15", "end": "2026-04-27", "duration": 12, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_124", "name": "Cập nhật cơ cấu sở hữu (nếu có) - Documents", "status": "Planned", "pic": "Legal", "start": "2026-04-15", "end": "2026-04-27", "duration": 12, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_125", "name": "Bank mandate set up", "status": "Planned", "pic": "AF", "start": "2026-04-15", "end": "2026-04-30", "duration": 15, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_126", "name": "Prepare cash flow", "status": "Planned", "pic": "AF", "start": "2026-04-15", "end": "2026-04-30", "duration": 15, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_127", "name": "Compliance work - Taxes", "status": "Planned", "pic": "AF", "start": "2025-10-06", "end": "2025-11-20", "duration": 45, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_128", "name": "Compliance work - Insurance, ....", "status": "Planned", "pic": "HR", "start": "2025-10-06", "end": "2025-11-20", "duration": 45, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_129", "name": "Coms & Move Staffs", "status": "Planned", "pic": "HR", "start": "2025-10-06", "end": "2025-11-05", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_130", "name": "Vendor, asset  movement - Accouting systems", "status": "Planned", "pic": "AF", "start": "2025-10-06", "end": "2025-11-05", "duration": 30, "deliverables": "Chuyển tài sản, HĐ vendor gắn với nhân sự sang sở hữu bởi SPVs\nChuyển HĐ thuê VP sang SPVs", "dependencies": null, "checkIns": []}, {"id": "t_131", "name": "Vendor, asset  movement - Vendor works", "status": "Planned", "pic": "GA", "start": "2025-10-06", "end": "2025-11-05", "duration": 30, "deliverables": "Chuyển tài sản, HĐ vendor gắn với nhân sự sang sở hữu bởi SPVs\nChuyển HĐ thuê VP sang SPVs", "dependencies": null, "checkIns": []}, {"id": "t_132", "name": "Inteco contract", "status": "Planned", "pic": "AF", "start": "2025-10-06", "end": "2025-11-20", "duration": 45, "deliverables": "Ký Hợp đồng với SM Sing/ ANZ", "dependencies": null, "checkIns": []}, {"id": "t_133", "name": "DOA, SOPs ver 2 ( HR)", "status": "Planned", "pic": "HR", "start": "2026-03-23", "end": "2026-05-07", "duration": 45, "deliverables": "Nội quy lao động, Quy chế, Org chart, UQ etc", "dependencies": null, "checkIns": []}, {"id": "t_134", "name": "DOA, SOPs ver 2 ( AF)", "status": "Planned", "pic": "AF", "start": "2026-03-23", "end": "2026-05-07", "duration": 45, "deliverables": "Quy chế TC, DOAs", "dependencies": null, "checkIns": []}, {"id": "t_135", "name": "Data migration & System update - Legal", "status": "Planned", "pic": "Legal", "start": "2026-03-23", "end": "2026-06-21", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_136", "name": "Data migration & System update - IT", "status": "Planned", "pic": "IT", "start": "2026-03-23", "end": "2026-06-21", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_137", "name": "Data migration & System update - HR", "status": "Planned", "pic": "HR", "start": "2026-03-23", "end": "2026-06-21", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_138", "name": "Data migration & System update - AF", "status": "Planned", "pic": "AF", "start": "2026-03-23", "end": "2026-06-21", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_139", "name": "Business Performance reporting New Structure - FIN", "status": "Planned", "pic": "FIN", "start": "2026-03-23", "end": "2026-06-21", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_140", "name": "Quyết toán với Cơ quan Thuế (incl rà soát & lên plan)", "status": "Planned", "pic": "AF", "start": "2026-08-01", "end": "2026-12-29", "duration": 150, "deliverables": null, "dependencies": null, "checkIns": []}]}]}, {"id": "p_7", "name": "SDigital", "workstreams": [{"id": "w_10", "name": "SDigital", "tasks": [{"id": "t_141", "name": "Nghiên cứu các khả năng sử dụng Smart Digital", "status": "Planned", "pic": "AF", "start": "2026-03-23", "end": "2026-05-07", "duration": 45, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_142", "name": "Chốt Business Plan ( Owner structure,  Nhân sự, business operation model, estimte PnL)", "status": "Planned", "pic": "AF", "start": "2026-05-07", "end": "2026-06-06", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_143", "name": "High-level communication", "status": "Planned", "pic": "Sponsor", "start": "2026-05-07", "end": "2026-06-06", "duration": 30, "deliverables": "BOM, Appointed Legal Rep/ Ownership, Moved HODs", "dependencies": null, "checkIns": []}, {"id": "t_144", "name": "Cập nhật cơ cấu sở hữu (nếu có) - Cash", "status": "Planned", "pic": "AF", "start": "2026-06-06", "end": "2026-07-06", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_145", "name": "Cập nhật cơ cấu sở hữu (nếu có) - Documents", "status": "Planned", "pic": "Legal", "start": "2026-06-06", "end": "2026-07-06", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_146", "name": "Bank mandate set up", "status": "Planned", "pic": "AF", "start": "2026-06-06", "end": "2026-07-06", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_147", "name": "Prepare cash flow", "status": "Planned", "pic": "AF", "start": "2026-06-06", "end": "2026-07-06", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_148", "name": "Compliance work - Taxes", "status": "Planned", "pic": "AF", "start": "2026-07-06", "end": "2026-08-20", "duration": 45, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_149", "name": "Compliance work - Insurance, ....", "status": "Planned", "pic": "HR", "start": "2026-07-06", "end": "2026-08-20", "duration": 45, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_150", "name": "Coms & Move Staffs", "status": "Planned", "pic": "HR", "start": "2025-10-06", "end": "2025-11-05", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_151", "name": "Vendor, asset  movement - Accouting systems", "status": "Planned", "pic": "AF", "start": "2026-07-06", "end": "2026-08-05", "duration": 30, "deliverables": "Chuyển tài sản, HĐ vendor gắn với nhân sự sang sở hữu bởi SPVs\nChuyển HĐ thuê VP sang SPVs", "dependencies": null, "checkIns": []}, {"id": "t_152", "name": "Vendor, asset  movement - Vendor works", "status": "Planned", "pic": "GA", "start": "2026-07-06", "end": "2026-08-05", "duration": 30, "deliverables": "Chuyển tài sản, HĐ vendor gắn với nhân sự sang sở hữu bởi SPVs\nChuyển HĐ thuê VP sang SPVs", "dependencies": null, "checkIns": []}, {"id": "t_153", "name": "Inteco contract", "status": "Planned", "pic": "AF", "start": "2026-07-06", "end": "2026-08-20", "duration": 45, "deliverables": "Ký Hợp đồng với SM Sing/ ANZ", "dependencies": null, "checkIns": []}, {"id": "t_154", "name": "DOA, SOPs ver 2 ( HR)", "status": "Planned", "pic": "HR", "start": "2026-08-20", "end": "2026-10-04", "duration": 45, "deliverables": "Nội quy lao động, Quy chế, Org chart, UQ etc", "dependencies": null, "checkIns": []}, {"id": "t_155", "name": "DOA, SOPs ver 2 ( AF)", "status": "Planned", "pic": "AF", "start": "2026-08-05", "end": "2026-09-19", "duration": 45, "deliverables": "Quy chế TC, DOAs", "dependencies": null, "checkIns": []}, {"id": "t_156", "name": "Data migration & System update - Legal", "status": "Planned", "pic": "Legal", "start": "2026-08-05", "end": "2026-11-03", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_157", "name": "Data migration & System update - IT", "status": "Planned", "pic": "IT", "start": "2026-08-05", "end": "2026-11-03", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_158", "name": "Data migration & System update - HR", "status": "Planned", "pic": "HR", "start": "2026-08-05", "end": "2026-11-03", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_159", "name": "Data migration & System update - AF", "status": "Planned", "pic": "AF", "start": "2026-08-05", "end": "2026-11-03", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_160", "name": "Business Performance reporting New Structure - FIN", "status": "Planned", "pic": "FIN", "start": "2026-08-05", "end": "2026-11-03", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_161", "name": "Quyết toán + Đóng cửa VP ĐN", "status": "Planned", "pic": "AF", "start": "2026-08-05", "end": "2026-11-03", "duration": 90, "deliverables": null, "dependencies": null, "checkIns": []}]}]}, {"id": "p_8", "name": "Cash Event", "workstreams": [{"id": "w_11", "name": "Founder funding", "tasks": [{"id": "t_162", "name": "Chi relocation package để funding cho 02 UBOs thành lập New SingCo", "status": "Planned", "pic": "AF", "start": "2026-03-08", "end": "2026-04-07", "duration": 30, "deliverables": "5300000000", "dependencies": null, "checkIns": []}]}, {"id": "w_12", "name": "Smart AX", "tasks": [{"id": "t_163", "name": "Mua 5% cổ phần Smart AX từ UBO-S trước tăng vốn", "status": "Planned", "pic": "AF", "start": "2026-03-08", "end": "2026-04-07", "duration": 30, "deliverables": "1500000000", "dependencies": null, "checkIns": []}, {"id": "t_164", "name": "Tăng vốn Smart AX (thông qua founder representative)", "status": "Planned", "pic": "AF", "start": "2026-03-30", "end": "2026-04-29", "duration": 30, "deliverables": "1800000000", "dependencies": null, "checkIns": []}, {"id": "t_165", "name": "Deferred / payable tranche for share acquisition from individuals", "status": "Planned", "pic": "AF", "start": "2026-08-19", "end": "2026-09-18", "duration": 30, "deliverables": "19200000000", "dependencies": null, "checkIns": []}]}, {"id": "w_13", "name": "New SingCo", "tasks": [{"id": "t_166", "name": "New SingCo incorporation / legal / corporate services fees", "status": "Planned", "pic": "AF", "start": "2026-03-16", "end": "2026-04-15", "duration": 30, "deliverables": "397500000", "dependencies": null, "checkIns": []}, {"id": "t_167", "name": "Góp vốn lần 1: đủ để thành lập New SingCo & New VNCo + chi phí vận hành", "status": "Planned", "pic": "AF", "start": "2026-03-30", "end": "2026-04-29", "duration": 30, "deliverables": "5300000000", "dependencies": null, "checkIns": []}, {"id": "t_168", "name": "Initial bank, operating and compliance cash for New SingCo", "status": "Planned", "pic": "AF", "start": "2026-03-30", "end": "2026-04-29", "duration": 30, "deliverables": "1325000000", "dependencies": null, "checkIns": []}, {"id": "t_169", "name": "Mua 20% cổ phần Smart AX từ 02 UBO / founder seller (sau tăng vốn)", "status": "Planned", "pic": "AF", "start": "2026-08-30", "end": "2026-09-29", "duration": 30, "deliverables": "13250000000", "dependencies": null, "checkIns": []}]}, {"id": "w_14", "name": "Management Co", "tasks": [{"id": "t_170", "name": "Management Co legal and incorporation cost", "status": "Planned", "pic": "AF", "start": "2026-03-31", "end": "2026-04-30", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_171", "name": "Capital contribution to Management Co", "status": "Planned", "pic": "AF", "start": "2026-03-31", "end": "2026-04-30", "duration": 30, "deliverables": "1000000000", "dependencies": null, "checkIns": []}, {"id": "t_172", "name": "Initial working capital for Management Co", "status": "Planned", "pic": "AF", "start": "2026-04-30", "end": "2026-05-30", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}]}, {"id": "w_15", "name": "Back-up route", "tasks": [{"id": "t_173", "name": "Merge-route legal / tax / advisory cost if PA2 is activated", "status": "Planned", "pic": "AF", "start": "2026-04-01", "end": "2026-05-01", "duration": 30, "deliverables": "1000000000", "dependencies": null, "checkIns": []}]}, {"id": "w_16", "name": "LLC dissolution", "tasks": [{"id": "t_174", "name": "Legal / audit / filing cost for dissolution work", "status": "Planned", "pic": "AF", "start": "2026-04-14", "end": "2026-05-14", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_175", "name": "LLC A pays Mr Bao (Vendor)", "status": "Planned", "pic": "AF", "start": "2026-05-30", "end": "2026-06-29", "duration": 30, "deliverables": "300000000", "dependencies": null, "checkIns": []}, {"id": "t_176", "name": "LLC A tax closure / inspection / settlement cost", "status": "Planned", "pic": "AF", "start": "2026-05-30", "end": "2026-06-29", "duration": 30, "deliverables": "300000000", "dependencies": null, "checkIns": []}, {"id": "t_177", "name": "Deferred / payable tranche settled after second dividend", "status": "Planned", "pic": "AF", "start": "2027-04-01", "end": "2027-05-01", "duration": 30, "deliverables": "2129832593", "dependencies": null, "checkIns": []}]}, {"id": "w_17", "name": "New VNCo", "tasks": [{"id": "t_178", "name": "New VNCo legal, licence and incorporation cost", "status": "Planned", "pic": "AF", "start": "2026-04-30", "end": "2026-05-30", "duration": 30, "deliverables": "132500000", "dependencies": null, "checkIns": []}, {"id": "t_179", "name": "Capital contribution to New VNCo", "status": "Planned", "pic": "AF", "start": "2026-04-30", "end": "2026-05-30", "duration": 30, "deliverables": "2650000000", "dependencies": null, "checkIns": []}, {"id": "t_180", "name": "LLC B tax closure / inspection / settlement cost", "status": "Planned", "pic": "AF", "start": "2026-05-30", "end": "2026-06-29", "duration": 30, "deliverables": "1000000000", "dependencies": null, "checkIns": []}]}, {"id": "w_18", "name": "FIB Co", "tasks": [{"id": "t_181", "name": "Initial operating runway for New VNCo", "status": "Planned", "pic": "AF", "start": "2026-05-30", "end": "2026-06-29", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}, {"id": "t_182", "name": "FIB Co legal and incorporation cost", "status": "Planned", "pic": "AF", "start": "2026-05-31", "end": "2026-06-30", "duration": 30, "deliverables": "1000000000", "dependencies": null, "checkIns": []}, {"id": "t_183", "name": "Capital contribution to FIB Co", "status": "Planned", "pic": "AF", "start": "2026-05-31", "end": "2026-06-30", "duration": 30, "deliverables": null, "dependencies": null, "checkIns": []}]}, {"id": "w_19", "name": "Share acquisition", "tasks": [{"id": "t_184", "name": "Initial working capital for FIB Co", "status": "Planned", "pic": "AF", "start": "2026-07-30", "end": "2026-08-29", "duration": 30, "deliverables": "10600000000", "dependencies": null, "checkIns": []}, {"id": "t_185", "name": "Cash portion of New SingCo acquisition of shares from individuals", "status": "Planned", "pic": "AF", "start": "2026-08-04", "end": "2026-09-03", "duration": 30, "deliverables": "47700000000", "dependencies": null, "checkIns": []}, {"id": "t_186", "name": "Tăng vốn New SingCo để có đủ tiền mua lại cổ phần JSC", "status": "Planned", "pic": "AF", "start": "2026-08-30", "end": "2026-09-29", "duration": 30, "deliverables": "47700000000", "dependencies": null, "checkIns": []}, {"id": "t_187", "name": "Chia cổ tức 2025 cho New SingCo để funding cho việc mua lại cổ phần", "status": "Planned", "pic": "AF", "start": "2026-09-01", "end": "2026-10-01", "duration": 30, "deliverables": "47700000000", "dependencies": null, "checkIns": []}, {"id": "t_188", "name": "Chia cổ tức lần 2 cho New SingCo để funding phần thanh toán tiếp theo cho UBOs", "status": "Planned", "pic": "AF", "start": "2027-04-01", "end": "2027-05-01", "duration": 30, "deliverables": "47700000000", "dependencies": null, "checkIns": []}]}]}]};

/* ═════════ CONSTANTS ═════════ */
const STATUSES = ['Planned', 'InProgress', 'Completed', 'Dropped'];
const STATUS_LABEL = { Planned: 'Planned', InProgress: 'In Progress', Completed: 'Completed', Dropped: 'Dropped' };
// Weight for % rollup. Dropped is excluded from the denominator entirely (see rollup()).
const STATUS_WEIGHT = { Planned: 0, InProgress: 0.5, Completed: 1, Dropped: null };
const HEALTH_VALUES = ['green', 'amber', 'red'];
const HEALTH_LABEL = { green: 'On track', amber: 'At risk', red: 'Off track' };

const TOK = {
  bg: '#F7F5EF', surface: '#FFFFFF', ink: '#1A1A19', muted: '#6E6C66', subtle: '#95938C',
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
  healthAmber: '#B7791F', healthAmberBg: '#FBF1DC',
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
const isOverdue = (t) => { if (!t || t.status === 'Completed' || t.status === 'Dropped') return false; const e = parseDate(t.end); return e ? e < today() : false; };

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
    if (s === 'Completed') done++; else if (s === 'InProgress') inprog++; else planned++;
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
function deriveTeamMembers(projects, currentAuthor, currentUserEmail) {
  const map = new Map();
  const add = (name, email) => {
    if (!name) return;
    const trimmed = String(name).trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    const existing = map.get(key);
    if (existing) { if (email && !existing.email) existing.email = email; }
    else map.set(key, { name: trimmed, email: email || null });
  };
  if (currentAuthor) add(currentAuthor, currentUserEmail);
  for (const p of Object.values(projects || {})) {
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
async function ssetShared(k, v) { try { await window.storage.set(k, v, true); return true; } catch { return false; } }
async function sgetLocal(k) { try { const r = await window.storage.get(k, false); return r ? r.value : null; } catch { return null; } }
async function ssetLocal(k, v) { try { await window.storage.set(k, v, false); return true; } catch { return false; } }
async function sdeleteShared(k) { try { await window.storage.delete(k, true); return true; } catch { return false; } }

async function loadMeta() { const r = await sgetShared(K.meta); if (!r) return null; try { return JSON.parse(r); } catch { return null; } }
async function saveMeta(m) { return ssetShared(K.meta, JSON.stringify(m)); }
async function loadProject(id) { const r = await sgetShared(K.project(id)); if (!r) return null; try { return JSON.parse(r); } catch { return null; } }
async function saveProject(p) { return ssetShared(K.project(p.id), JSON.stringify(p)); }
async function deleteProjectStore(id) { await sdeleteShared(K.project(id)); await sdeleteShared(K.activity(id)); }
async function loadActivity(id) { const r = await sgetShared(K.activity(id)); if (!r) return []; try { return JSON.parse(r); } catch { return []; } }
async function appendActivity(id, e) {
  const log = await loadActivity(id);
  log.unshift(e);
  if (log.length > 500) log.length = 500;
  await ssetShared(K.activity(id), JSON.stringify(log));
  return log;
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
};
const pickCol = (row, opts) => { for (const o of opts) if (row[o] != null && row[o] !== '') return row[o]; return null; };
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

async function parseExcelFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  if (!rows.length) throw new Error('No rows found in the spreadsheet.');
  const projectName = String(pickCol(rows[0], COL.project) || file.name.replace(/\.[^.]+$/, '') || 'Imported Project').trim();
  const project = { id: uid('proj'), name: projectName, createdAt: new Date().toISOString(), programs: [], decisions: [], actionItems: [] };
  const progMap = new Map(), wsMap = new Map();
  for (const r of rows) {
    const tName = pickCol(r, COL.task);
    if (!tName) continue;
    const pn = String(pickCol(r, COL.program) || 'Unassigned').trim();
    const wn = String(pickCol(r, COL.workstream) || 'General').trim();
    let pg = progMap.get(pn);
    if (!pg) { pg = { id: uid('p'), name: pn, workstreams: [] }; project.programs.push(pg); progMap.set(pn, pg); }
    const wk = pn + '||' + wn;
    let wsN = wsMap.get(wk);
    if (!wsN) { wsN = { id: uid('w'), name: wn, tasks: [] }; pg.workstreams.push(wsN); wsMap.set(wk, wsN); }
    wsN.tasks.push({
      id: uid('t'),
      name: String(tName).trim(),
      status: normStatus(pickCol(r, COL.status)),
      pic: pickCol(r, COL.pic),
      start: normDate(pickCol(r, COL.start)),
      end: normDate(pickCol(r, COL.end)),
      duration: (() => { const v = pickCol(r, COL.duration); if (v == null || v === '') return null; const n = Number(v); return isNaN(n) ? null : n; })(),
      deliverables: pickCol(r, COL.deliverables),
      dependencies: pickCol(r, COL.dependencies),
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
          'Mail Project': project.name,
          'Program Stream (PS)': pg.name,
          'Work Stream': ws.name,
          'Main Task': t.name,
          'Status': STATUS_LABEL[t.status || 'Planned'],
          'PIC': t.pic || '',
          'Start date': t.start || '',
          'End date': t.end || '',
          'Durations': t.duration ?? '',
          'Key Deliverables': t.deliverables || '',
          'Dependencies': t.dependencies || '',
          'Latest check-in': (t.checkIns && t.checkIns[0]) ? `${fmtDateTime(t.checkIns[0].timestamp)} — ${t.checkIns[0].author}: ${t.checkIns[0].done || ''}` : '',
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

function Modal({ title, children, onClose, width = 480, zHigh = false }) {
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,15,14,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: zHigh ? 80 : 50, fontFamily: FONT_STACK }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width, maxWidth: 'calc(100% - 40px)', maxHeight: 'calc(100% - 60px)', background: TOK.surface, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid ' + TOK.line, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 4 }}><X size={18} /></button>
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
function CopyHelperModal({ html, title, gmailUrl, onClose }) {
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

function Input({ value, onChange, placeholder, type = 'text', autoFocus, style = {} }) {
  return (
    <input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
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
function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: TOK.ink, color: TOK.surface, padding: '10px 16px', borderRadius: 8, fontSize: 13, zIndex: 100, fontFamily: FONT_STACK, display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
      <span>{toast.message}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: TOK.surface, cursor: 'pointer', opacity: 0.7 }}><X size={14} /></button>
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
  return (
    <Modal title={dialog.title || 'Enter value'} onClose={() => close(null)} width={420} zHigh>
      {dialog.message && <p style={{ margin: '0 0 12px', fontSize: 13, color: TOK.muted }}>{dialog.message}</p>}
      <Input value={value} onChange={setValue} placeholder={dialog.placeholder} autoFocus />
      <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn onClick={() => close(null)}>Cancel</Btn>
        <Btn variant="primary"
          disabled={!dialog.allowEmpty && !value.trim()}
          onClick={() => close(value.trim())}>{dialog.okLabel || 'OK'}</Btn>
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
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
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
function NameDialog({ onSubmit }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const validEmail = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSubmit = name.trim() && validEmail;
  return (
    <Modal title="Welcome — tell us about you" onClose={() => {}} width={440}>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: TOK.muted, lineHeight: 1.55 }}>
        Your name attaches to your changes and check-ins. Your email lets the app pre-fill action-item emails to you. Both are stored locally on this device only.
      </p>
      <FieldLabel>Your name</FieldLabel>
      <Input value={name} onChange={setName} placeholder="e.g., Thao Nguyen" autoFocus />
      <div style={{ height: 12 }} />
      <FieldLabel>Your email (optional, recommended)</FieldLabel>
      <Input value={email} onChange={setEmail} placeholder="e.g., thao@smartosc.com" type="email" />
      {!validEmail && <div style={{ marginTop: 6, fontSize: 11, color: TOK.overdueFg }}>Invalid email format</div>}
      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <Btn variant="primary" disabled={!canSubmit} onClick={() => onSubmit(name.trim(), email.trim() || null)}>Continue</Btn>
      </div>
    </Modal>
  );
}

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
        rows={3}
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

/* ═════════ TASK DETAIL PANEL ═════════ */
function TaskDetail({ project, taskId, onClose, onUpdate, onDelete, onProjectUpdate, author, teamMembers, dialogs }) {
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

  // Reset all panel state when switching to a different task
  useEffect(() => {
    setPanelTab('updates');
    setShowDecisionForm(false); setEditingDecision(null);
    setShowActionForm(false); setEditingAction(null);
    setEditing(false);
    setDraft(loc?.task || null);
  }, [taskId]); // eslint-disable-line

  // Decisions linked to this milestone (task is in relatedTaskIds)
  const linkedDecisions = useMemo(
    () => (project.decisions || []).filter((d) => (d.relatedTaskIds || []).includes(taskId)).sort((a, b) => new Date(b.date) - new Date(a.date)),
    [project.decisions, taskId]
  );
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

  const save = () => { onUpdate({ ...draft }); setEditing(false); };
  const setStatus = (s) => onUpdate({ ...task, status: s });

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
  const saveAction = (a) => {
    const list = project.actionItems || [];
    const next = editingAction ? list.map((x) => x.id === a.id ? a : x) : [a, ...list];
    onProjectUpdate({ ...project, actionItems: next });
    setShowActionForm(false); setEditingAction(null);
  };
  const editAction = (a) => { setEditingAction(a); setShowActionForm(true); };
  const removeAction = async (a) => {
    const ok = await dialogs.confirm({ title: 'Delete action?', message: `Delete "${a.title}"?`, danger: true, okLabel: 'Delete' });
    if (!ok) return;
    onProjectUpdate({ ...project, actionItems: (project.actionItems || []).filter((x) => x.id !== a.id) });
  };

  return (
    <div style={{ width: 400, background: TOK.surface, borderLeft: '1px solid ' + TOK.line, display: 'flex', flexDirection: 'column', height: '100%', fontFamily: FONT_STACK }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid ' + TOK.line, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: TOK.muted, fontWeight: 500 }}>
          {program.name} › {workstream.name}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 2 }}>
          <X size={16} />
        </button>
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
          {!editing ? (
            <>
              <Btn variant="ghost" size="sm" onClick={() => setEditing(true)} title="Edit task"><Edit2 size={12} /></Btn>
              <Btn variant="ghost" size="sm" onClick={() => onDelete(task)} title="Delete task"><Trash2 size={12} /></Btn>
            </>
          ) : (
            <>
              <Btn size="sm" onClick={() => { setDraft(task); setEditing(false); }}>Cancel</Btn>
              <Btn size="sm" variant="primary" onClick={save}>Save</Btn>
            </>
          )}
        </div>

        <div style={{ margin: '16px 0' }}>
          <FieldLabel>Status</FieldLabel>
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
            <div><FieldLabel>PIC</FieldLabel><Input value={draft.pic} onChange={(v) => setDraft({ ...draft, pic: v })} /></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}><FieldLabel>Start</FieldLabel><Input type="date" value={draft.start || ''} onChange={(v) => setDraft({ ...draft, start: v || null })} /></div>
              <div style={{ flex: 1 }}><FieldLabel>End</FieldLabel><Input type="date" value={draft.end || ''} onChange={(v) => setDraft({ ...draft, end: v || null })} /></div>
            </div>
            <div><FieldLabel>Duration (days)</FieldLabel><Input type="number" value={draft.duration ?? ''} onChange={(v) => setDraft({ ...draft, duration: v === '' ? null : Number(v) })} /></div>
            <div><FieldLabel>Key deliverables</FieldLabel><Textarea value={draft.deliverables} onChange={(v) => setDraft({ ...draft, deliverables: v })} rows={3} /></div>
            <div><FieldLabel>Dependencies</FieldLabel><Textarea value={draft.dependencies} onChange={(v) => setDraft({ ...draft, dependencies: v })} rows={2} /></div>
          </div>
        ) : (
          <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Row k="PIC" v={task.pic || '—'} />
            <Row k="Start" v={fmtDate(task.start)} />
            <Row k="End" v={fmtDate(task.end)} />
            <Row k="Duration" v={task.duration != null ? `${task.duration} days` : '—'} />
            <Row k="Deliverables" v={task.deliverables || '—'} multiline />
            <Row k="Dependencies" v={task.dependencies || '—'} multiline />
          </div>
        )}

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
              {!showDecisionForm && (
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
                    onEdit={editDecision} onDelete={removeDecision} />
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
      </div>
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

function DecisionForm({ initial, project, teamMembers, author, defaultRelatedTaskId, onSave, onCancel }) {
  const [text, setText] = useState(initial?.text || '');
  const [date, setDate] = useState(initial?.date || toISODate(new Date()));
  const [decidedBy, setDecidedBy] = useState(initial?.decidedBy || []);
  const [context, setContext] = useState(initial?.context || '');
  const [relatedTaskIds, setRelatedTaskIds] = useState(initial?.relatedTaskIds || (defaultRelatedTaskId ? [defaultRelatedTaskId] : []));
  const [followUpStatus, setFollowUpStatus] = useState(initial?.followUpStatus || 'Open');
  const [meetingRef, setMeetingRef] = useState(initial?.meetingRef || '');

  const taskOptions = useMemo(() => projectTaskOptions(project), [project]);

  const toggleDecidedBy = (name) => {
    setDecidedBy(decidedBy.includes(name) ? decidedBy.filter((x) => x !== name) : [...decidedBy, name]);
  };

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
      <FieldLabel>Decided by * (multi-select)</FieldLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {teamMembers.map((m) => {
          const active = decidedBy.includes(m.name);
          return (
            <button key={m.name} onClick={() => toggleDecidedBy(m.name)} style={{
              fontFamily: FONT_STACK, fontSize: 12, padding: '5px 10px', borderRadius: 999,
              border: '1px solid ' + (active ? TOK.accent : TOK.lineStrong),
              background: active ? TOK.healthGreenBg : TOK.surface,
              color: active ? TOK.accent : TOK.ink,
              cursor: 'pointer', fontWeight: active ? 500 : 400,
            }}>{active && '✓ '}{m.name}</button>
          );
        })}
        {teamMembers.length === 0 && (
          <span style={{ fontSize: 11, color: TOK.subtle }}>No team members yet — add via Project settings.</span>
        )}
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
        <button onClick={() => onEdit(decision)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 2, display: 'flex' }}>
          <Edit2 size={11} />
        </button>
        <button onClick={() => onDelete(decision)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 2, display: 'flex' }}>
          <Trash2 size={11} />
        </button>
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
  return (
    <div style={{ background: TOK.surface, border: '1px solid ' + TOK.line, borderRadius: 10, marginBottom: 8 }}>
      <div style={{ padding: '12px 14px', cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4 }}>
            <MentionedText text={decision.text} teamMembers={teamMembers} />
          </span>
          <span style={{
            fontSize: 10.5, fontWeight: 500, padding: '2px 8px', borderRadius: 999,
            color: fc.fg, background: fc.bg, whiteSpace: 'nowrap', height: 'fit-content',
          }}>{FOLLOWUP_LABEL[decision.followUpStatus]}</span>
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
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 8 }}>
            <Btn size="sm" variant="ghost" onClick={() => onEdit(decision)}><Edit2 size={11} /> Edit</Btn>
            <Btn size="sm" variant="ghost" onClick={() => onDelete(decision)}><Trash2 size={11} /> Delete</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function DecisionsView({ project, onProjectUpdate, teamMembers, author, dialogs, onActivity }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all'); // all | Open | InProgress | Done
  const [filterTaskId, setFilterTaskId] = useState('all'); // all | <taskId>
  const [query, setQuery] = useState('');

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
          <Btn variant="primary" onClick={() => { setEditing(null); setShowForm(true); }}><Plus size={12} /> New decision</Btn>
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

        {showForm && (
          <div style={{ marginBottom: 14 }}>
            <DecisionForm
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
              <>No decisions logged yet. <button onClick={() => setShowForm(true)} style={{ background: 'none', border: 'none', color: TOK.accent, cursor: 'pointer', fontSize: 13 }}>Log your first decision</button></>
            ) : (
              'No decisions match the current filters.'
            )}
          </div>
        )}

        {filtered.map((d) => (
          <DecisionEntry key={d.id} decision={d} project={project} teamMembers={teamMembers}
            onEdit={startEdit}
            onDelete={removeDecision} />
        ))}
      </div>
    </div>
  );
}

/* ═════════ ACTION ITEMS ═════════ */
const ACTION_STATUSES = ['Pending', 'Pushed to OP', 'InProgress', 'Done', 'Cancelled'];
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

function ActionItemForm({ initial, project, teamMembers, author, defaultRelatedTaskId, onSave, onCancel }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [pic, setPic] = useState(initial?.pic || '');
  const [dueDate, setDueDate] = useState(initial?.dueDate || '');
  const [priority, setPriority] = useState(initial?.priority || 'Medium');
  const [relatedTaskId, setRelatedTaskId] = useState(initial?.relatedTaskId || defaultRelatedTaskId || '');
  const [status, setStatus] = useState(initial?.status || 'Pending');

  const taskOptions = useMemo(() => projectTaskOptions(project), [project]);

  const canSave = title.trim() && pic.trim();

  const submit = () => {
    onSave({
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
    });
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
          <FieldLabel>PIC / Assignee *</FieldLabel>
          <select value={pic} onChange={(e) => setPic(e.target.value)}
            style={{ width: '100%', fontFamily: FONT_STACK, fontSize: 13, padding: '8px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, background: TOK.surface, color: TOK.ink }}>
            <option value="">— Select PIC —</option>
            {teamMembers.map((m) => <option key={m.name} value={m.name}>{m.name}{m.email ? ` (${m.email})` : ''}</option>)}
          </select>
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

      <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn variant="primary" disabled={!canSave} onClick={submit}>{initial ? 'Save' : 'Create action'}</Btn>
      </div>
    </div>
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
    <em>Excel template (for OpenProject upload) is downloaded separately — please attach it before sending.</em>
  </p>
  <p style="margin: 16px 0 0;">
    Thanks,<br/>
    ${escapeHtml(author)}
  </p>
</div>`;
}

function ActionItemsView({ project, onProjectUpdate, teamMembers, author, dialogs, onActivity, showToast }) {
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

  const saveAction = (a) => {
    const next = editing ? actions.map((x) => x.id === a.id ? a : x) : [a, ...actions];
    onProjectUpdate({ ...project, actionItems: next });
    onActivity({ type: editing ? 'action_edit' : 'action_create', description: `${editing ? 'Updated' : 'Created'} action: "${a.title}" → ${a.pic}` });
    setShowForm(false);
    setEditing(null);
  };

  const startEdit = (a) => { setEditing(a); setShowForm(true); };

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
    lines.push(`Excel template (for OpenProject upload) is downloaded separately — please attach it before sending.`);
    lines.push(``);
    lines.push(`Thanks,`);
    lines.push(author);
    return lines.join('\n');
  };

  // Email PIC: opens an in-app modal with the formatted HTML email preview, content
  // auto-selected. User presses Ctrl+C (their own keyboard event — always works in iframes,
  // browser writes both text/html and text/plain to clipboard), then clicks Open Gmail.
  const emailPic = (picName, list) => {
    const member = teamMembers.find((m) => m.name === picName);
    if (!member?.email) {
      dialogs.alert({ title: 'No email', message: `No email on file for ${picName}. Add it via Project settings → Team members.` });
      return;
    }
    const subject = `[${project.name}] Action items — ${fmtDate(new Date())}`;
    const html = buildPicEmailHtml(picName, list, project, author);
    const meEmail = teamMembers.find((m) => m.name === author)?.email;
    const gmailUrl = buildGmailUrl({ to: member.email, subject, cc: meEmail });
    setCopyHelper({
      html,
      title: `Email to ${picName} — ${list.length} action${list.length === 1 ? '' : 's'}`,
      gmailUrl,
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

        {showForm && (
          <div style={{ marginBottom: 14 }}>
            <ActionItemForm
              initial={editing}
              project={project}
              teamMembers={teamMembers}
              author={author}
              onSave={saveAction}
              onCancel={() => { setShowForm(false); setEditing(null); }}
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
              const member = teamMembers.find((m) => m.name === pic);
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
              const member = teamMembers.find((m) => m.name === picName);
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
  const headers = [
    'Project Code', 'Project Name',
    'Subject (recommended to keep WP Code prefix)',
    'Type', 'Description',
    'Assignee (Role placeholder)', 'Reviewer (if any)',
    'Priority', 'Start date', 'Due date',
    'Entity/Company', 'Parent Task', 'Level',
  ];
  const rows = [headers];
  // Replicate the 4 type-only blank reference rows from the original template
  ['Epic', 'User Story', 'Task', 'Milestone'].forEach((tp) => {
    rows.push(['', '', '', tp, '', '', '', '', '', '', '', '', '']);
  });
  // Then our actions (default Type = Task)
  for (const a of actions) {
    rows.push([
      project.openProjectCode || '',
      project.name || '',
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
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/* ═════════ AGGREGATION VIEW (cross-project decisions & actions) ═════════ */
function AggregationView({ projects, currentProjectId, teamMembers, dialogs, showToast, author }) {
  const [scope, setScope] = useState('all'); // all | current
  const [tab, setTab] = useState('decisions'); // decisions | actions
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
      const tasks = (w.tasks || []).map((t) => mk(t, 'task', null));
      return mk(w, 'workstream', tasks);
    });
    return mk(p, 'program', ws);
  });
  return mk(project, 'project', programs);
}

function MindMapView({ project, onTaskClick, selectedTaskId, scopeProgramId, onProjectUpdate, onActivity, dialogs }) {
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
    const t = { id: uid('t'), name, status: 'Planned', pic: null, start: null, end: null, duration: null, deliverables: null, dependencies: null, checkIns: [], updates: [], health: 'green' };
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
      const r = rollup(pg);
      const ok = await dialogs.confirm({ title: 'Delete program?', message: `Delete program "${pg.name}" and all ${r.total} task${r.total === 1 ? '' : 's'}? This cannot be undone.`, danger: true, okLabel: 'Delete' });
      if (!ok) return;
      onProjectUpdate({ ...project, programs: project.programs.filter((p) => p.id !== pg.id) });
      onActivity({ type: 'program_delete', description: `Deleted program "${pg.name}" (${r.total} tasks)` });
    } else {
      const ok = await dialogs.confirm({ title: 'Delete work stream?', message: `Delete work stream "${ws.name}" and all ${(ws.tasks || []).length} task${(ws.tasks || []).length === 1 ? '' : 's'}?`, danger: true, okLabel: 'Delete' });
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
    if (node.kind === 'program') {
      const pg = node.data;
      return [
        { label: 'Add work stream', icon: <Plus size={13} />, onClick: () => actAddWorkstream(pg) },
        { label: (node.isCollapsed ? 'Expand' : 'Collapse'), icon: node.isCollapsed ? <ChevronDown size={13} /> : <ChevronRight size={13} />, onClick: () => toggle(node.id) },
        { separator: true },
        { label: 'Rename program', icon: <Edit2 size={13} />, onClick: () => actRename('program', pg) },
        { label: 'Delete program', icon: <Trash2 size={13} />, danger: true, onClick: () => actDelete('program', pg) },
      ];
    }
    if (node.kind === 'workstream') {
      const ws = node.data;
      // Find parent program
      const pg = (project.programs || []).find((p) => (p.workstreams || []).some((w) => w.id === ws.id));
      return [
        { label: 'Add task', icon: <Plus size={13} />, onClick: () => actAddTask(pg, ws) },
        { label: (node.isCollapsed ? 'Expand' : 'Collapse'), icon: node.isCollapsed ? <ChevronDown size={13} /> : <ChevronRight size={13} />, onClick: () => toggle(node.id) },
        { separator: true },
        { label: 'Rename work stream', icon: <Edit2 size={13} />, onClick: () => actRename('workstream', pg, ws) },
        { label: 'Delete work stream', icon: <Trash2 size={13} />, danger: true, onClick: () => actDelete('workstream', pg, ws) },
      ];
    }
    return [];
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: FONT_STACK, background: TOK.bg }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid ' + TOK.line, background: TOK.surface, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Btn size="sm" onClick={collapseToPrograms}>Programs</Btn>
        <Btn size="sm" onClick={showWorkstreams}>+ Work streams</Btn>
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
            {nodes.map((n) => <MindNode key={n.id} n={n} onToggle={toggle} onTaskClick={onTaskClick} selectedTaskId={selectedTaskId} onOpenMenu={openMenu} />)}
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

function MindNode({ n, onToggle, onTaskClick, selectedTaskId, onOpenMenu }) {
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
    : `${r.pct}% · ${r.done}/${r.total} task${r.total === 1 ? '' : 's'}${r.dropped ? ' · ' + r.dropped + ' dropped' : ''}`;

  const hasMenu = (n.kind === 'program' || n.kind === 'workstream');
  const opacity = isDropped ? 0.55 : 1;
  const taskHealth = isTask ? (n.data.health || 'green') : null;
  const healthColor = taskHealth === 'red' ? TOK.healthRed : taskHealth === 'amber' ? TOK.healthAmber : TOK.healthGreen;

  return (
    <g data-mindnode="true" transform={`translate(${n.x},${n.y})`} opacity={opacity}>
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
        <text x={isTask && !isDropped ? 14 : 12} y="36" fontSize="10.5" fill={TOK.muted} style={{ pointerEvents: 'none', userSelect: 'none' }}>{truncate(sub, 32)}</text>
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
function OutlineView({ project, onProjectUpdate, onTaskClick, selectedTaskId, onActivity, dialogs, scopeProgramId }) {
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
    const p = { id: uid('p'), name, workstreams: [] };
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
    const r = rollup(pg);
    const ok = await dialogs.confirm({ title: 'Delete program?', message: `Delete program "${pg.name}" and all ${r.total} task${r.total === 1 ? '' : 's'}? This cannot be undone.`, danger: true, okLabel: 'Delete' });
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
    const n = (ws.tasks || []).length;
    const ok = await dialogs.confirm({ title: 'Delete work stream?', message: `Delete work stream "${ws.name}" and all ${n} task${n === 1 ? '' : 's'}?`, danger: true, okLabel: 'Delete' });
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
    const t = { id: uid('t'), name, status: 'Planned', pic: null, start: null, end: null, duration: null, deliverables: null, dependencies: null, checkIns: [], updates: [], health: 'green' };
    onProjectUpdate({
      ...project, programs: project.programs.map((p) =>
        p.id === pg.id ? { ...p, workstreams: p.workstreams.map((w) => w.id === ws.id ? { ...w, tasks: [...w.tasks, t] } : w) } : p
      ),
    });
    onActivity({ type: 'task_add', description: `Added task "${t.name}" in "${ws.name}"` });
  };

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
        <Btn size="sm" onClick={addProgram}><FolderPlus size={12} /> Program</Btn>
        <div style={{ fontSize: 11, color: TOK.muted }}>
          <Move size={11} style={{ verticalAlign: '-2px', marginRight: 4 }} />
          Drag tasks between work streams · Drag work streams between programs
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        {visiblePrograms.map((pg) => {
          const r = rollup(pg);
          const pgOpen = expanded.has(pg.id);
          const pgMatches = matches(pg.name);
          const pgHasMatches = !q || pgMatches || (pg.workstreams || []).some((w) => matches(w.name) || (w.tasks || []).some((t) => matches(t.name)));
          if (!pgHasMatches) return null;
          const dropOn = dragOver === 'pg_' + pg.id;
          return (
            <div key={pg.id}
              onDragOver={(e) => { if (dragInfo?.kind === 'ws' && dragInfo.sourcePgId !== pg.id) onDragOverZone(e, 'pg_' + pg.id); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => dropWsIntoPg(pg)}
              style={{ background: TOK.surface, border: '1px solid ' + (dropOn ? TOK.accent : TOK.line), borderRadius: 10, marginBottom: 10, overflow: 'hidden', boxShadow: dropOn ? '0 0 0 3px rgba(59,109,17,0.15)' : 'none' }}>
              <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, background: TOK.programBg }}>
                <button onClick={() => toggleExpand(pg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.programFg, padding: 2, display: 'flex' }}>
                  {pgOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <span style={{ fontSize: 14, fontWeight: 500, color: TOK.programFg, flex: 1 }}>{pg.name}</span>
                <span style={{ fontSize: 11, color: TOK.programFg, opacity: 0.8 }}>{r.done}/{r.total} · {r.pct}%</span>
                <div style={{ width: 100, height: 5, background: 'rgba(12,68,124,0.15)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${r.pct}%`, height: '100%', background: TOK.programFg }} />
                </div>
                <Btn size="sm" variant="ghost" onClick={() => addWorkstream(pg)} title="Add work stream"><Plus size={12} /></Btn>
                <Btn size="sm" variant="ghost" onClick={() => renameProgram(pg)} title="Rename"><Edit2 size={12} /></Btn>
                <Btn size="sm" variant="ghost" onClick={() => deleteProgram(pg)} title="Delete"><Trash2 size={12} /></Btn>
              </div>
              {pgOpen && (pg.workstreams || []).map((ws) => {
                const wsR = rollup(ws);
                const wsOpen = expanded.has(ws.id);
                const wsMatches = matches(ws.name);
                const wsHasMatches = !q || pgMatches || wsMatches || (ws.tasks || []).some((t) => matches(t.name));
                if (!wsHasMatches) return null;
                const wsDragOver = dragOver === 'ws_' + ws.id;
                return (
                  <div key={ws.id}
                    draggable onDragStart={(e) => onDragStartWs(e, ws, pg)}
                    onDragOver={(e) => { if (dragInfo?.kind === 'task' && dragInfo.sourceWsId !== ws.id) onDragOverZone(e, 'ws_' + ws.id); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={() => dropTaskIntoWs(pg, ws)}
                    style={{ borderTop: '1px solid ' + TOK.line, background: wsDragOver ? 'rgba(59,109,17,0.06)' : TOK.surface }}>
                    <div style={{ padding: '8px 12px 8px 28px', display: 'flex', alignItems: 'center', gap: 8, background: TOK.workstreamBg }}>
                      <span style={{ cursor: 'grab', color: TOK.workstreamFg, opacity: 0.6, display: 'flex' }}><Grip size={12} /></span>
                      <button onClick={() => toggleExpand(ws.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.workstreamFg, padding: 2, display: 'flex' }}>
                        {wsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </button>
                      <span style={{ fontSize: 13, fontWeight: 500, color: TOK.workstreamFg, flex: 1 }}>{ws.name}</span>
                      <span style={{ fontSize: 11, color: TOK.workstreamFg, opacity: 0.8 }}>{wsR.done}/{wsR.total} · {wsR.pct}%</span>
                      <div style={{ width: 80, height: 4, background: 'rgba(15,110,86,0.2)', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ width: `${wsR.pct}%`, height: '100%', background: TOK.workstreamFg }} />
                      </div>
                      <Btn size="sm" variant="ghost" onClick={() => addTask(pg, ws)} title="Add task"><Plus size={12} /></Btn>
                      <Btn size="sm" variant="ghost" onClick={() => renameWorkstream(pg, ws)} title="Rename"><Edit2 size={12} /></Btn>
                      <Btn size="sm" variant="ghost" onClick={() => deleteWorkstream(pg, ws)} title="Delete"><Trash2 size={12} /></Btn>
                    </div>
                    {wsOpen && (ws.tasks || []).map((t) => {
                      if (q && !pgMatches && !wsMatches && !matches(t.name)) return null;
                      const sel = t.id === selectedTaskId;
                      const dropped = t.status === 'Dropped';
                      const over = isOverdue(t);
                      const totalUpdates = (t.updates?.length || 0) + (t.checkIns?.length || 0);
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
                          <Pill status={t.status || 'Planned'} overdue={over} size="sm" />
                        </div>
                      );
                    })}
                    {wsOpen && (!ws.tasks || !ws.tasks.length) && (
                      <div style={{ padding: '10px 52px', fontSize: 11, color: TOK.subtle, borderTop: '1px solid ' + TOK.line }}>
                        No tasks yet. <button onClick={() => addTask(pg, ws)} style={{ background: 'none', border: 'none', color: TOK.accent, cursor: 'pointer', fontSize: 11, padding: 0 }}>Add one</button>
                      </div>
                    )}
                  </div>
                );
              })}
              {pgOpen && (!pg.workstreams || !pg.workstreams.length) && (
                <div style={{ padding: '10px 12px 10px 28px', fontSize: 11, color: TOK.subtle, borderTop: '1px solid ' + TOK.line }}>
                  No work streams yet. <button onClick={() => addWorkstream(pg)} style={{ background: 'none', border: 'none', color: TOK.accent, cursor: 'pointer', fontSize: 11, padding: 0 }}>Add one</button>
                </div>
              )}
            </div>
          );
        })}
        {(!visiblePrograms || !visiblePrograms.length) && (
          <div style={{ textAlign: 'center', padding: 40, color: TOK.muted, fontSize: 13 }}>
            No programs yet. <button onClick={addProgram} style={{ background: 'none', border: 'none', color: TOK.accent, cursor: 'pointer', fontSize: 13 }}>Add one</button>
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

/* ═════════ MAIN APP ═════════ */
export default function App() {
  const [loading, setLoading] = useState(true);
  const [author, setAuthor] = useState(null);
  const [authorEmail, setAuthorEmail] = useState(null);
  const [meta, setMeta] = useState(null);
  const [projects, setProjects] = useState({}); // id → project
  const [currentId, setCurrentId] = useState(null);
  const [view, setView] = useState('mindmap'); // mindmap | outline | dashboard
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [toast, setToast] = useState(null);
  const [activity, setActivity] = useState([]);
  const [showImport, setShowImport] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [scopeProgramId, setScopeProgramId] = useState(null);
  const [projectMenu, setProjectMenu] = useState(null);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [meetingMode, setMeetingMode] = useState(false);
  const [showMeetingExport, setShowMeetingExport] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  useSearchHotkey(() => setShowSearch(true));
  const { user: authUser } = useAuth();
  const fileInputRef = useRef(null);
  const saveTimers = useRef({});
  const { dialog, api: dialogs, close: closeDialog } = useDialogs();

  // Roster of @mention-able teammates: derived from PICs + check-in/update authors + project teamMembers list
  const teamMembers = useMemo(
    () => deriveTeamMembers(projects, author, authorEmail),
    [projects, author, authorEmail]
  );

  // Load on mount
  useEffect(() => {
    (async () => {
      let m = await loadMeta();
      const localUser = await sgetLocal(K.userLocal);

      if (!m) {
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
      for (const pid of m.projectIds) {
        const p = await loadProject(pid);
        if (p) ps[pid] = p;
      }
      setProjects(ps);

      if (m.currentProjectId) {
        const a = await loadActivity(m.currentProjectId);
        setActivity(a);
      }

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
    })();
  }, []);

  const project = currentId ? projects[currentId] : null;

  const showToast = (message) => {
    setToast({ message, id: uid('t') });
    setTimeout(() => setToast((t) => (t && t.message === message ? null : t)), 3500);
  };

  // Debounced save of a project
  const persistProject = useCallback((p) => {
    if (!p) return;
    clearTimeout(saveTimers.current[p.id]);
    saveTimers.current[p.id] = setTimeout(() => { saveProject(p); }, 400);
  }, []);

  const updateProject = useCallback((updated) => {
    setProjects((prev) => ({ ...prev, [updated.id]: updated }));
    persistProject(updated);
  }, [persistProject]);

  const logActivity = useCallback(async ({ type, description }) => {
    if (!currentId || !author) return;
    const entry = { id: uid('act'), timestamp: new Date().toISOString(), author, type, description };
    const log = await appendActivity(currentId, entry);
    setActivity(log);
  }, [currentId, author]);

  const onNameSubmit = async (n, e) => {
    setAuthor(n);
    setAuthorEmail(e);
    await ssetLocal(K.userLocal, JSON.stringify({ name: n, email: e }));
  };

  const onTaskUpdate = (updatedTask) => {
    if (!project) return;
    const loc = findTaskInProject(project, updatedTask.id);
    if (!loc) return;
    const oldTask = loc.task;
    const updated = cloneDeep(project);
    const ul = findTaskInProject(updated, updatedTask.id);
    Object.assign(ul.task, updatedTask);
    updateProject(updated);

    // Log meaningful changes
    if (oldTask.status !== updatedTask.status) {
      logActivity({ type: 'status_change', description: `Changed "${updatedTask.name}" status: ${STATUS_LABEL[oldTask.status || 'Planned']} → ${STATUS_LABEL[updatedTask.status]}` });
    }
    if ((oldTask.checkIns?.length || 0) < (updatedTask.checkIns?.length || 0)) {
      logActivity({ type: 'checkin', description: `Posted check-in on "${updatedTask.name}"` });
    }
    if (oldTask.name !== updatedTask.name) {
      logActivity({ type: 'task_rename', description: `Renamed task "${oldTask.name}" → "${updatedTask.name}"` });
    }
  };

  const onTaskDelete = async (task) => {
    if (!project) return;
    const ok = await dialogs.confirm({ title: 'Delete task?', message: `Delete task "${task.name}"?`, danger: true, okLabel: 'Delete' });
    if (!ok) return;
    const updated = cloneDeep(project);
    for (const pg of updated.programs || [])
      for (const ws of pg.workstreams || [])
        ws.tasks = ws.tasks.filter((t) => t.id !== task.id);
    updateProject(updated);
    setSelectedTaskId(null);
    logActivity({ type: 'task_delete', description: `Deleted task "${task.name}"` });
  };

  const switchProject = async (id) => {
    if (!id || !meta) return;
    setCurrentId(id);
    setSelectedTaskId(null);
    setScopeProgramId(null);
    const a = await loadActivity(id);
    setActivity(a);
    const m2 = { ...meta, currentProjectId: id };
    setMeta(m2);
    await saveMeta(m2);
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
    const p = { id: uid('proj'), name: name.trim(), createdAt: new Date().toISOString(), programs: [], decisions: [], actionItems: [] };
    await saveProject(p);
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
    try {
      const imported = await parseExcelFile(file);
      // Append (2) etc if duplicate name
      const names = new Set(Object.values(projects).map((p) => p.name));
      let finalName = imported.name, i = 2;
      while (names.has(finalName)) finalName = `${imported.name} (${i++})`;
      if (finalName !== imported.name) {
        showToast(`A project named "${imported.name}" already exists. Imported as "${finalName}".`);
        imported.name = finalName;
      }
      await saveProject(imported);
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
    for (const pid of meta.projectIds) {
      everything.activity[pid] = await loadActivity(pid);
    }
    const blob = new Blob([JSON.stringify(everything, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'workspace_backup_' + toISODate(new Date()) + '.json');
    showToast('Backup downloaded');
  };
  const restoreJson = async (file) => {
    const ok = await dialogs.confirm({ title: 'Restore workspace?', message: 'This will REPLACE all shared workspace data (projects, check-ins, activity) for everyone using this artifact. Continue?', danger: true, okLabel: 'Restore' });
    if (!ok) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.meta || !data.projects) throw new Error('Invalid backup file.');
      await saveMeta(data.meta);
      for (const pid of data.meta.projectIds) {
        if (data.projects[pid]) await saveProject(data.projects[pid]);
        if (data.activity && data.activity[pid]) await ssetShared(K.activity(pid), JSON.stringify(data.activity[pid]));
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
    const a = await loadActivity(next); setActivity(a);
    showToast(`Deleted project "${project.name}"`);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: FONT_STACK, background: TOK.bg, color: TOK.muted, fontSize: 13 }}>
        Loading workspace…
      </div>
    );
  }

  if (!author) return <NameDialog onSubmit={onNameSubmit} />;

  const r = project ? rollup(project) : null;

  return (
    <>
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
        {/* Top bar */}
        <div style={{ background: TOK.surface, borderBottom: '1px solid ' + TOK.line, padding: '10px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Project Tracker</div>
            <ChevronRight size={12} color={TOK.muted} />
            <select value={currentId || ''} onChange={(e) => switchProject(e.target.value)}
              style={{ fontFamily: FONT_STACK, fontSize: 13, padding: '6px 24px 6px 10px', border: '1px solid ' + TOK.lineStrong, borderRadius: 7, background: TOK.surface, color: TOK.ink, cursor: 'pointer', fontWeight: 500 }}>
              {meta.projectIds.map((pid) => <option key={pid} value={pid}>{projects[pid]?.name || '(unknown)'}</option>)}
            </select>
            <Btn size="sm" variant="ghost" onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setProjectMenu({ x: rect.left, y: rect.bottom + 4 });
            }} title="Project options"><MoreHorizontal size={12} /></Btn>
            <Btn size="sm" variant="ghost" onClick={() => setShowNewProject(true)} title="New project"><Plus size={12} /></Btn>
            <Btn size="sm" variant="ghost" onClick={() => setShowImport(true)} title="Import Excel"><FileUp size={12} /></Btn>
            <Btn size="sm" variant="ghost" onClick={() => setShowSearch(true)} title="Search across projects (Ctrl/Cmd+K)"><Search size={12} /></Btn>
            <Btn size="sm" variant="ghost" onClick={() => setShowMembers(true)} title="Manage members & related parties" disabled={!project}><UserCircle size={12} /></Btn>
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

          <div style={{ display: 'flex', gap: 2, padding: 2, background: TOK.bg, borderRadius: 8, flexWrap: 'wrap' }}>
            {[
              { id: 'mindmap', label: 'Mind map', icon: <MapIcon size={12} /> },
              { id: 'outline', label: 'Outline', icon: <ListIcon size={12} /> },
              { id: 'gantt', label: 'Gantt', icon: <BarChart3 size={12} /> },
              { id: 'dashboard', label: 'Dashboard', icon: <Home size={12} /> },
              { id: 'decisions', label: 'Decisions', icon: <CheckCircle2 size={12} />, count: (project?.decisions?.length || 0) },
              { id: 'actions', label: 'Actions', icon: <Activity size={12} />, count: (project?.actionItems?.length || 0) },
              { id: 'aggregation', label: 'Aggregation', icon: <Activity size={12} /> },
            ].map((v) => (
              <button key={v.id} onClick={() => setView(v.id)} style={{
                fontFamily: FONT_STACK, fontSize: 12, fontWeight: 500, padding: '5px 10px', borderRadius: 6,
                border: 'none', background: view === v.id ? TOK.surface : 'transparent', color: TOK.ink, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 5,
                boxShadow: view === v.id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}>{v.icon}{v.label}{v.count > 0 && <span style={{ fontSize: 10, color: TOK.muted, fontWeight: 400 }}>·{v.count}</span>}</button>
            ))}
          </div>

          <Btn size="sm" variant="primary" onClick={() => setMeetingMode(true)} title="Enter meeting mode (presentation view)">▶ Meeting</Btn>
          <Btn size="sm" onClick={() => setShowMeetingExport(true)} title="Generate meeting minutes"><FileText size={12} /> Minutes</Btn>
          <Btn size="sm" onClick={exportExcel} title="Export to Excel"><FileSpreadsheet size={12} /> Excel</Btn>
          <Btn size="sm" onClick={backupJson} title="Backup all workspace data to JSON"><Download size={12} /></Btn>
          <input type="file" ref={fileInputRef} accept=".json" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && restoreJson(e.target.files[0])} />
          <Btn size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()} title="Restore from JSON backup"><Upload size={12} /></Btn>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: TOK.bg, borderRadius: 999, fontSize: 11, color: TOK.muted }}>
            <UserCircle size={13} /> {author}
          </div>
        </div>

        {/* Main area: view + optional task detail */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <ErrorBoundary>
              {project && view === 'mindmap' && <MindMapView project={project} selectedTaskId={selectedTaskId} onTaskClick={setSelectedTaskId} scopeProgramId={scopeProgramId} onProjectUpdate={updateProject} onActivity={logActivity} dialogs={dialogs} />}
              {project && view === 'outline' && <OutlineView project={project} selectedTaskId={selectedTaskId} onTaskClick={setSelectedTaskId} onProjectUpdate={updateProject} onActivity={logActivity} dialogs={dialogs} scopeProgramId={scopeProgramId} />}
              {project && view === 'gantt' && <GanttView project={project} selectedTaskId={selectedTaskId} onTaskClick={setSelectedTaskId} scopeProgramId={scopeProgramId} />}
              {project && view === 'dashboard' && <DashboardView project={project} activity={activity} onTaskClick={(id) => { setSelectedTaskId(id); setView('outline'); }} scopeProgramId={scopeProgramId} />}
              {project && view === 'decisions' && <DecisionsView project={project} onProjectUpdate={updateProject} teamMembers={teamMembers} author={author} dialogs={dialogs} onActivity={logActivity} />}
              {project && view === 'actions' && <ActionItemsView project={project} onProjectUpdate={updateProject} teamMembers={teamMembers} author={author} dialogs={dialogs} onActivity={logActivity} showToast={showToast} />}
              {view === 'aggregation' && <AggregationView projects={projects} currentProjectId={currentId} teamMembers={teamMembers} dialogs={dialogs} showToast={showToast} author={author} />}
              {!project && view !== 'aggregation' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: TOK.muted, fontSize: 13 }}>No project selected.</div>
              )}
            </ErrorBoundary>
          </div>
          {selectedTaskId && project && (
            <TaskDetail project={project} taskId={selectedTaskId} author={author} teamMembers={teamMembers} dialogs={dialogs}
              onClose={() => setSelectedTaskId(null)}
              onUpdate={onTaskUpdate}
              onDelete={onTaskDelete}
              onProjectUpdate={updateProject} />
          )}
        </div>

        <Toast toast={toast} onClose={() => setToast(null)} />
        <DialogHost dialog={dialog} close={closeDialog} />

        {projectMenu && (
          <PopoverMenu x={projectMenu.x} y={projectMenu.y}
            items={[
              { label: 'Manage members & related parties', icon: <UserCircle size={13} />, onClick: () => setShowMembers(true) },
              { label: 'Rename project', icon: <Edit2 size={13} />, onClick: renameCurrentProject },
              { label: 'Project settings…', icon: <Edit2 size={13} />, onClick: () => setShowProjectSettings(true) },
              { separator: true },
              { label: meta.projectIds.length > 1 ? 'Delete project' : 'Delete project (need 2+)', icon: <Trash2 size={13} />, danger: true, onClick: deleteCurrentProject },
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
        {showProjectSettings && project && (
          <ProjectSettingsModal
            project={project}
            onClose={() => setShowProjectSettings(false)}
            onSave={(updated) => { updateProject(updated); logActivity({ type: 'project_settings', description: `Updated project settings for "${updated.name}"` }); showToast('Project settings saved'); }}
            dialogs={dialogs}
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
      </div>
    </>
  );
}

function ProjectSettingsModal({ project, onClose, onSave, dialogs }) {
  const [name, setName] = useState(project.name);
  const [opCode, setOpCode] = useState(project.openProjectCode || '');
  const [members, setMembers] = useState(project.teamMembers || []);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');

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

  const save = () => {
    onSave({ ...project, name: name.trim(), openProjectCode: opCode.trim() || null, teamMembers: members });
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
      <FieldLabel>Team members & emails</FieldLabel>
      <div style={{ fontSize: 11, color: TOK.subtle, lineHeight: 1.5, marginBottom: 10 }}>
        Names here are autocomplete-able with @mention. Emails are used for action-item emails. PIC names already used in tasks are picked up automatically — add their emails here.
      </div>

      {/* Add row — inline form, no chained dialogs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, padding: 8, background: TOK.bg, borderRadius: 7 }}>
        <Input
          value={newName}
          onChange={setNewName}
          placeholder="Name (e.g., An Nguyen)"
          style={{ flex: 1 }}
        />
        <Input
          value={newEmail}
          onChange={setNewEmail}
          placeholder="email@smartosc.com"
          type="email"
          style={{ flex: 1.4 }}
        />
        <Btn size="sm" variant="primary" onClick={addMember} disabled={!newName.trim()}>
          <Plus size={11} /> Add
        </Btn>
      </div>

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

      <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" disabled={!name.trim()} onClick={save}>Save</Btn>
      </div>
    </Modal>
  );
}

function NewProjectModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  return (
    <Modal title="Create new project" onClose={onClose} width={420}>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: TOK.muted }}>Start fresh with an empty project you'll build out manually.</p>
      <FieldLabel>Project name</FieldLabel>
      <Input value={name} onChange={setName} placeholder="e.g., Vietnam Expansion 2027" autoFocus />
      <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" disabled={!name.trim()} onClick={() => onCreate(name)}>Create</Btn>
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
        Upload an Excel (.xlsx) or CSV file using the CRP template columns: Mail Project, Program Stream (PS), Work Stream, Main Task, Status, PIC, Start date, End date, Durations, Key Deliverables, Dependencies.
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
