
import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "sudarat_finance_v1"; // default / legacy key for user "sudarat"
const USERS_KEY = "sf_users_v1";

const AVATAR_OPTIONS = ["👩‍💼","👨‍💼","🧑‍💼","👩","👨","🧒","👧","👦","👩‍🦰","👩‍🦱","👩‍🦳","👨‍🦰","👨‍🦱","🐱","🐶","🦊","🐼","🐨","🦁","🤖"];
const COLOR_OPTIONS  = ["#378ADD","#1D9E75","#D85A30","#EF9F27","#7F77DD","#993556","#0F6E56","#185FA5","#B8860B","#E24B4A"];

function getStoredUsers() {
  try {
    const u = JSON.parse(localStorage.getItem(USERS_KEY) || "null");
    return u && u.length > 0 ? u : [{ id: "sudarat", name: "Sudarat", avatar: "👩‍💼", color: "#378ADD", password: "" }];
  } catch {
    return [{ id: "sudarat", name: "Sudarat", avatar: "👩‍💼", color: "#378ADD", password: "" }];
  }
}

function userStorageKey(userId) {
  return userId === "sudarat" ? STORAGE_KEY : `sf_data_${userId}`;
}

const TAX_BRACKETS = [
  { min: 0, max: 150000, rate: 0 },
  { min: 150000, max: 300000, rate: 0.05 },
  { min: 300000, max: 500000, rate: 0.10 },
  { min: 500000, max: 750000, rate: 0.15 },
  { min: 750000, max: 1000000, rate: 0.20 },
  { min: 1000000, max: 2000000, rate: 0.25 },
  { min: 2000000, max: 5000000, rate: 0.30 },
  { min: 5000000, max: Infinity, rate: 0.35 },
];

function calcTax(netIncome) {
  let tax = 0;
  for (const b of TAX_BRACKETS) {
    if (netIncome <= b.min) break;
    const taxable = Math.min(netIncome, b.max) - b.min;
    tax += taxable * b.rate;
  }
  return Math.max(0, tax);
}

function fmt(n) {
  return new Intl.NumberFormat("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function fmtDec(n, d = 2) {
  return new Intl.NumberFormat("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
}

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const EXPENSE_CATS = [
  { key: "daily", label: "ค่าครองชีพรายวัน", default: 10000, color: "#378ADD" },
  { key: "rent", label: "ค่าหอพัก", default: 5500, color: "#1D9E75" },
  { key: "vivy", label: "อาหาร Vivy", default: 3000, color: "#D85A30" },
  { key: "shopping", label: "ช้อปปิ้ง", default: 2000, color: "#7F77DD" },
  { key: "ais", label: "AIS", default: 1300, color: "#EF9F27" },
  { key: "youtube", label: "YouTube", default: 200, color: "#E24B4A" },
  { key: "disney", label: "Disney+", default: 97, color: "#185FA5" },
  { key: "suda", label: "SUDA B.", default: 2500, color: "#0F6E56" },
  { key: "travel", label: "เที่ยว / อื่นๆ", default: 2500, color: "#993556" },
  { key: "other", label: "รายจ่ายอื่น", default: 0, color: "#888780" },
];

const SAVINGS_CATS = [
  { key: "kept", label: "Kept (10–20%)", color: "#378ADD" },
  { key: "oomssin", label: "ออมสิน", color: "#1D9E75" },
  { key: "krungthai", label: "Krung Thai", color: "#EF9F27" },
  { key: "sp500", label: "SCB S&P500A", color: "#7F77DD" },
  { key: "gold_orn", label: "ทองรูปพรรณ", color: "#D4A017" },
  { key: "gold_bar", label: "ทองแท่ง", color: "#B8860B" },
];

// ─── Settings ──────────────────────────────────────────────
const SETTINGS_KEY = (userId) => `sf_settings_${userId}`;
const DEFAULT_SETTINGS = {
  // รอบการตัด
  otCutoffDay: 20,          // วันตัดรอบ OT (1–31)
  leaveCutoffEOM: true,     // วันตัดวันลา = สิ้นเดือน (false = ใช้ otCutoffDay)
  // ค่าตอบแทนรายวัน
  mealRatePerDay: 30,       // ค่าข้าว/วันทำงานปกติ
  mealRateOT: 0,            // ค่าข้าวเพิ่มเมื่อทำ OT วันนั้น
  travelPerDay: 0,          // ค่าเดินทาง/วัน
  diligenceBonus: 500,      // เบี้ยขยัน/เดือน
  // ตัวหารชั่วโมง
  workingDaysPerMonth: 30,  // วันทำงาน/เดือน (ตัวหาร)
  workingHoursPerDay: 8,    // ชั่วโมง/วัน
};

function loadSettings(userId) {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY(userId)) || "{}") }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}

// ─── Month defaults (ใช้ settings เป็น default) ─────────────
function defaultMonth(monthIdx, year = 2026, settings = DEFAULT_SETTINGS) {
  const expenses = {};
  EXPENSE_CATS.forEach(c => (expenses[c.key] = c.default));
  const savings = {};
  SAVINGS_CATS.forEach(s => (savings[s.key] = 0));
  return {
    year,
    monthIdx,
    baseSalary: 0,
    ot1: 0, ot15: 0, ot2: 0, ot25: 0, ot3: 0,
    hourlyRate: 0,
    foodAllowance: 0,
    mealRatePerDay: settings.mealRatePerDay,
    diligenceBonus: settings.diligenceBonus,
    dayTypes: {},
    bonus: 0,
    sso: 750,
    providentFund: 0,
    expenses,
    savings,
    notes: "",
  };
}

// Quarter → month index ที่จ่ายโบนัส (สิ้นไตรมาส)
const Q_PAY_MONTH = { q1: 2, q2: 5, q3: 8, q4: 11 };

function getQuarterlyBonusForMonth(monthIdx, bonusData) {
  for (const [key, payMonth] of Object.entries(Q_PAY_MONTH)) {
    if (monthIdx === payMonth && bonusData?.[key]) {
      return { label: `โบนัส Q${key.slice(1)}`, amount: +bonusData[key] || 0 };
    }
  }
  return null;
}

function calcWorkDays(m) {
  const year = m.year || 2026;
  const daysInMonth = new Date(year, m.monthIdx + 1, 0).getDate();
  const dayTypes = m.dayTypes || {};
  const otLog   = m.otLog   || {};
  let workDays = 0, leaveCount = 0, otHolidayDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, m.monthIdx, d).getDay();
    if (dow === 0 || dow === 6) continue; // skip weekends
    const t = dayTypes[String(d)];
    if (!t) {
      workDays++; // วันทำงานปกติ
    } else if (t === "sick" || t === "personal") {
      leaveCount++; // ลา → หักเบี้ยขยัน ไม่ได้ค่าข้าว
    } else if (t === "holiday") {
      // วันหยุดบริษัท — ถ้าไปทำ OT วันนั้น → นับค่าข้าว
      const dayOT = otLog[String(d)];
      const hasOT = dayOT && Object.values(dayOT).some(h => h > 0);
      if (hasOT) otHolidayDays++;
    }
  }
  return { workDays, leaveCount, otHolidayDays };
}

function calcPayslip(m, bonusData) {
  const { workDays, leaveCount, otHolidayDays } = calcWorkDays(m);

  // ค่าข้าว:
  //   - วันทำงานปกติ × mealRatePerDay
  //   - วันหยุดที่ไปทำ OT × mealRatePerDay (ยังได้ค่าข้าว)
  //   - legacy: ถ้า mealRatePerDay = 0 ใช้ foodAllowance แทน
  const actualMeal = (m.mealRatePerDay || 0) > 0
    ? (workDays + otHolidayDays) * m.mealRatePerDay
    : (m.foodAllowance || 0);

  // เบี้ยขยัน: หักทั้งหมดถ้ามีลา
  const actualDiligence = leaveCount > 0 ? 0 : (m.diligenceBonus || 0);

  // โบนัสรายไตรมาส
  const qBonus = getQuarterlyBonusForMonth(m.monthIdx, bonusData);
  const quarterlyBonusAmt = qBonus?.amount || 0;

  const ot = (m.ot1 || 0) * m.hourlyRate
    + (m.ot15 || 0) * m.hourlyRate * 1.5
    + (m.ot2 || 0) * m.hourlyRate * 2
    + (m.ot25 || 0) * m.hourlyRate * 2.5
    + (m.ot3 || 0) * m.hourlyRate * 3;

  const gross = m.baseSalary + ot + actualMeal + actualDiligence + (m.bonus || 0) + quarterlyBonusAmt;
  const deductions = (m.sso || 0) + (m.providentFund || 0);
  const net = gross - deductions;
  return { ot, gross, deductions, net, workDays, leaveCount, actualMeal, actualDiligence, quarterlyBonusAmt };
}


const TABS = [
  { id: "dashboard",   label: "ภาพรวม",   icon: "📊" },
  { id: "payslip",     label: "เงินเดือน", icon: "💵" },
  { id: "calendar",    label: "ปฏิทิน",   icon: "🗓" },
  { id: "ot",          label: "OT",        icon: "⏰" },
  { id: "bonus",       label: "โบนัส",    icon: "🎁" },
  { id: "expenses",    label: "รายจ่าย",  icon: "🧾" },
  { id: "annual",      label: "ปีละครั้ง", icon: "📅" },
  { id: "savings",     label: "การออม",   icon: "🏦" },
  { id: "investments", label: "ลงทุน",    icon: "📈" },
  { id: "tax",         label: "ภาษี",     icon: "🧮" },
  { id: "settings",    label: "ตั้งค่า",  icon: "⚙️" },
];

// ─── Work Calendar ──────────────────────────────────────────
const DAY_TYPE_CONF = {
  holiday:  { label: "หยุดบริษัท", short: "หยุด", color: "#D85A30", bg: "#FDEEE9" },
  sick:     { label: "ลาป่วย",     short: "ป่วย",  color: "#EF9F27", bg: "#FEF3E2" },
  personal: { label: "ลากิจ",      short: "กิจ",   color: "#7F77DD", bg: "#F0EFFE" },
};

function WorkCalendarTab({ month, onChange }) {
  const year = 2026;
  const monthIdx = month.monthIdx;
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const firstDay = new Date(year, monthIdx, 1).getDay();
  const dayTypes = month.dayTypes || {};

  // Stats
  let workDays = 0, holidayDays = 0, sickDays = 0, personalDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, monthIdx, d).getDay();
    if (dow === 0 || dow === 6) continue;
    const t = dayTypes[String(d)];
    if (!t)               workDays++;
    else if (t === "holiday")  holidayDays++;
    else if (t === "sick")     sickDays++;
    else if (t === "personal") personalDays++;
  }
  const otLog = month.otLog || {};
  const otHolidayDays = Object.entries(dayTypes).filter(([d, t]) => {
    if (t !== "holiday") return false;
    const dow = new Date(year, monthIdx, +d).getDay();
    if (dow === 0 || dow === 6) return false;
    const dayOT = otLog[d];
    return dayOT && Object.values(dayOT).some(h => h > 0);
  }).length;

  const leaveCount = sickDays + personalDays;
  const actualMeal = (workDays + otHolidayDays) * (month.mealRatePerDay || 0);

  const TYPE_CYCLE = [null, "holiday", "sick", "personal"];

  function toggleDay(d) {
    const dow = new Date(year, monthIdx, d).getDay();
    if (dow === 0 || dow === 6) return;
    const cur = dayTypes[String(d)] || null;
    const next = TYPE_CYCLE[(TYPE_CYCLE.indexOf(cur) + 1) % TYPE_CYCLE.length];
    const next_ = { ...dayTypes };
    if (next === null) delete next_[String(d)]; else next_[String(d)] = next;
    onChange({ ...month, dayTypes: next_ });
  }

  const DAY_LABELS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Summary cards */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)", marginBottom: 10 }}>
          สรุป — {MONTHS[monthIdx]}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 12 }}>
          {[
            { label: "ทำงาน",      value: workDays,     color: "#1D9E75", bg: "#E6F7F2" },
            { label: "หยุดบริษัท", value: holidayDays,  color: "#D85A30", bg: "#FDEEE9" },
            { label: "ลาป่วย",     value: sickDays,     color: "#EF9F27", bg: "#FEF3E2" },
            { label: "ลากิจ",      value: personalDays, color: "#7F77DD", bg: "#F0EFFE" },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: 8, padding: "8px 4px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: s.color, fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: s.color }}>วัน</div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <span style={{ fontSize: 13, color: "var(--text2)" }}>
                ค่าข้าว ({workDays}{otHolidayDays > 0 ? `+${otHolidayDays}` : ""} วัน × ฿{month.mealRatePerDay || 0})
              </span>
              {otHolidayDays > 0 && (
                <div style={{ fontSize: 10, color: "#EF9F27", marginTop: 1 }}>
                  🔥 วันหยุด+OT {otHolidayDays} วัน → ได้ค่าข้าวด้วย
                </div>
              )}
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#378ADD" }}>฿{fmt(actualMeal)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: "var(--text2)" }}>
              เบี้ยขยัน {leaveCount > 0 ? `(ลา ${leaveCount} วัน → หัก)` : "(ได้เต็ม)"}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: leaveCount > 0 ? "#D85A30" : "#1D9E75" }}>
              {leaveCount > 0 ? "฿0" : `฿${fmt(month.diligenceBonus || 0)}`}
            </span>
          </div>
        </div>
      </div>

      {/* Settings */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)", marginBottom: 10 }}>ตั้งค่า</div>
        {[
          { label: "อัตราค่าข้าว/วัน (฿)", field: "mealRatePerDay" },
          { label: "เบี้ยขยัน/เดือน (฿)",  field: "diligenceBonus" },
        ].map(f => (
          <div key={f.field} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
            <label style={{ fontSize: 13, color: "var(--text2)" }}>{f.label}</label>
            <input type="number" value={month[f.field] ?? 0}
              onChange={e => onChange({ ...month, [f.field]: +e.target.value || 0 })}
              style={{ width: 110, textAlign: "right", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 13, color: "var(--text1)" }} />
          </div>
        ))}
      </div>

      {/* Calendar */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)", marginBottom: 4 }}>ปฏิทิน — กดเพื่อเปลี่ยนสถานะ</div>
        <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 10 }}>กด 1 ครั้ง = หยุดบริษัท → ลาป่วย → ลากิจ → ทำงาน</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 3 }}>
          {DAY_LABELS.map((d, i) => (
            <div key={d} style={{ textAlign: "center", fontSize: 11, padding: "2px 0",
              color: (i === 0 || i === 6) ? "#D85A30" : "var(--text3)" }}>{d}</div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
          {Array.from({ length: firstDay }).map((_, i) => <div key={"e"+i} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const d = i + 1;
            const dow = new Date(year, monthIdx, d).getDay();
            const isWeekend = dow === 0 || dow === 6;
            const type = dayTypes[String(d)] || null;
            const conf = type ? DAY_TYPE_CONF[type] : null;
            const dayOTData = otLog[String(d)];
            const hasOT = dayOTData && Object.values(dayOTData).some(h => h > 0);
            const isHolidayWithOT = type === "holiday" && hasOT;

            return (
              <div key={d} onClick={() => toggleDay(d)} style={{
                aspectRatio: "1", borderRadius: 7, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", cursor: isWeekend ? "default" : "pointer",
                background: isWeekend ? "transparent" : (conf ? conf.bg : "var(--bg2)"),
                border: `1.5px solid ${isWeekend ? "transparent" : (isHolidayWithOT ? "#EF9F27" : conf ? conf.color : "transparent")}`,
                opacity: isWeekend ? 0.35 : 1, transition: "all 0.12s",
                boxShadow: isHolidayWithOT ? "0 0 0 2px #EF9F2740" : "none",
              }}>
                <span style={{
                  fontSize: 13, fontWeight: conf ? 700 : 400, lineHeight: 1,
                  color: isWeekend ? (dow === 0 ? "#D85A30" : "var(--text3)") : (conf ? conf.color : "var(--text1)"),
                }}>{d}</span>
                {isHolidayWithOT
                  ? <span style={{ fontSize: 7, lineHeight: 1, marginTop: 1 }}>🔥OT</span>
                  : conf && <span style={{ fontSize: 7, color: conf.color, lineHeight: 1, marginTop: 1 }}>{conf.short}</span>
                }
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 14, height: 14, borderRadius: 4, background: "var(--bg2)", border: "1.5px solid var(--border)" }} />
            <span style={{ fontSize: 11, color: "var(--text2)" }}>ทำงาน</span>
          </div>
          {Object.entries(DAY_TYPE_CONF).map(([k, c]) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 14, height: 14, borderRadius: 4, background: c.bg, border: `1.5px solid ${c.color}` }} />
              <span style={{ fontSize: 11, color: "var(--text2)" }}>{c.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Leave detail */}
      {Object.keys(dayTypes).length > 0 && (
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)", marginBottom: 8 }}>รายละเอียด</div>
          {Object.entries(dayTypes).sort((a, b) => +a[0] - +b[0]).map(([day, type]) => {
            const c = DAY_TYPE_CONF[type];
            return (
              <div key={day} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 13, color: "var(--text2)" }}>วันที่ {day} {MONTHS[monthIdx]}</span>
                <span style={{ fontSize: 12, background: c.bg, color: c.color, borderRadius: 10, padding: "2px 10px", fontWeight: 600 }}>{c.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ background: "rgba(128,128,128,0.15)", borderRadius: 4, height: 5, width: "100%", marginTop: 4 }}>
      <div style={{ width: pct + "%", height: 5, borderRadius: 4, background: color, transition: "width 0.4s" }} />
    </div>
  );
}


const YEAR_COLORS = ["#378ADD", "#1D9E75", "#EF9F27", "#7F77DD", "#D85A30"];

function Dashboard({ months, year, allYears = [], allMonths = [] }) {
  const [chartMode, setChartMode] = useState("net"); // net | salary | ot

  if (months.length === 0 && allMonths.length === 0) return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text2)" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
      <div style={{ fontSize: 16, fontWeight: 500 }}>ยังไม่มีข้อมูล</div>
      <div style={{ fontSize: 13, marginTop: 6 }}>กรุณาเพิ่มข้อมูลเงินเดือนในแท็บ "เงินเดือน"</div>
    </div>
  );

  // ── Per-year stats ──
  const sortedYears = [...new Set(allMonths.map(m => m.year || 2026))].sort();
  const yearStats = sortedYears.map((y, yi) => {
    const ym = allMonths.filter(m => (m.year || 2026) === y);
    const nets = ym.map(m => calcPayslip(m, {}).net);
    const salaries = ym.map(m => m.baseSalary);
    const otIncomes = ym.map(m => calcPayslip(m, {}).ot);
    const avgNet = nets.reduce((a, b) => a + b, 0) / nets.length;
    const avgSalary = salaries.reduce((a, b) => a + b, 0) / salaries.length;
    const avgOT = otIncomes.reduce((a, b) => a + b, 0) / otIncomes.length;
    const maxSalary = Math.max(...salaries);
    const minSalary = Math.min(...salaries);
    return { year: y, months: ym.length, avgNet, avgSalary, avgOT, maxSalary, minSalary, color: YEAR_COLORS[yi % YEAR_COLORS.length] };
  });

  // ── Current year stats ──
  const curMonths = months.length > 0 ? months : allMonths.filter(m => (m.year || 2026) === year);
  const curNets = curMonths.map(m => calcPayslip(m, {}).net);
  const totalIncome = curNets.reduce((a, b) => a + b, 0);
  const avgNetCur = curNets.length ? totalIncome / curNets.length : 0;

  // ── Salary progression (all months sorted) ──
  const allSorted = [...allMonths].sort((a, b) => (a.year - b.year) || (a.monthIdx - b.monthIdx));
  const firstSalary = allSorted[0]?.baseSalary || 0;
  const lastSalary = allSorted[allSorted.length - 1]?.baseSalary || 0;
  const totalGrowthPct = firstSalary > 0 ? ((lastSalary - firstSalary) / firstSalary) * 100 : 0;

  // ── Salary change events ──
  const salaryChanges = [];
  for (let i = 1; i < allSorted.length; i++) {
    const prev = allSorted[i - 1].baseSalary;
    const cur2 = allSorted[i].baseSalary;
    if (Math.abs(cur2 - prev) > 100) {
      const pct = ((cur2 - prev) / prev) * 100;
      const mname = MONTHS[allSorted[i].monthIdx];
      salaryChanges.push({ year: allSorted[i].year, month: mname, from: prev, to: cur2, pct });
    }
  }

  // ── Year-over-year comparison ──
  const prevYearStat = yearStats.length >= 2 ? yearStats[yearStats.length - 2] : null;
  const curYearStat = yearStats.find(s => s.year === year) || yearStats[yearStats.length - 1];
  const yoyNet = prevYearStat && curYearStat ? ((curYearStat.avgNet - prevYearStat.avgNet) / prevYearStat.avgNet) * 100 : null;

  // ── Multi-year bar chart data ──
  const chartMax = Math.max(...allSorted.map(m => {
    if (chartMode === "net") return calcPayslip(m, {}).net;
    if (chartMode === "salary") return m.baseSalary;
    return calcPayslip(m, {}).ot;
  }), 1);

  const ChartH = 100;
  const BAR_YEAR_COLOR = (m) => YEAR_COLORS[(sortedYears.indexOf(m.year || 2026)) % YEAR_COLORS.length];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Hero: ปีปัจจุบัน ── */}
      <div style={{ background: "linear-gradient(135deg,#1a4fa0 0%,#378ADD 100%)", borderRadius: 16, padding: "20px 20px 16px", color: "#fff" }}>
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>รายรับสุทธิเฉลี่ย/เดือน • ปี {year}</div>
        <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-1px" }}>
          ฿{fmt(avgNetCur)}
        </div>
        {yoyNet !== null && (
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4, display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{
              background: yoyNet >= 0 ? "rgba(29,158,117,0.35)" : "rgba(216,90,48,0.35)",
              borderRadius: 10, padding: "2px 8px", fontSize: 12, fontWeight: 600
            }}>
              {yoyNet >= 0 ? "▲" : "▼"} {fmtDec(Math.abs(yoyNet), 1)}% vs ปี {year - 1}
            </span>
            <span style={{ opacity: 0.7, fontSize: 11 }}>({curMonths.length} เดือน)</span>
          </div>
        )}
        {/* Mini bar sparkline */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 28, marginTop: 12 }}>
          {curMonths.map((m, i) => {
            const v = calcPayslip(m, {}).net;
            const h = Math.max(3, (v / Math.max(...curNets, 1)) * 28);
            return <div key={i} style={{ flex: 1, height: h, background: "rgba(255,255,255,0.55)", borderRadius: 2 }} title={MONTHS[m.monthIdx]} />;
          })}
        </div>
      </div>

      {/* ── Quick stats row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[
          { icon: "📈", label: "เงินเดือนฐานตอนนี้", value: `฿${fmt(lastSalary)}`, sub: totalGrowthPct > 0 ? `+${fmtDec(totalGrowthPct, 1)}% จากเริ่มต้น` : "" },
          { icon: "⏰", label: "OT เฉลี่ย/เดือน (ปีนี้)", value: `฿${fmt(curYearStat?.avgOT || 0)}`, sub: `avg ${fmtDec((curYearStat?.avgOT || 0) / (lastSalary || 1) * 100, 1)}% ของเงินเดือน` },
        ].map(s => (
          <div key={s.label} style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text1)" }}>{s.value}</div>
            {s.sub && <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 2 }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Salary change events ── */}
      {salaryChanges.length > 0 && (
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)", marginBottom: 10 }}>📊 ประวัติการขึ้นเงินเดือน</div>
          {salaryChanges.map((c, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: i < salaryChanges.length - 1 ? "1px solid var(--border)" : "none" }}>
              <div>
                <div style={{ fontSize: 13, color: "var(--text1)", fontWeight: 500 }}>{c.month} {c.year}</div>
                <div style={{ fontSize: 11, color: "var(--text3)" }}>฿{fmt(c.from)} → ฿{fmt(c.to)}</div>
              </div>
              <div style={{
                padding: "4px 12px", borderRadius: 20, fontSize: 13, fontWeight: 700,
                background: c.pct > 0 ? "#E6F7F2" : "#FDEEE9",
                color: c.pct > 0 ? "#0F6E56" : "#D85A30"
              }}>
                {c.pct > 0 ? "+" : ""}{fmtDec(c.pct, 2)}%
              </div>
            </div>
          ))}
          <div style={{ marginTop: 10, padding: "8px 12px", background: "var(--bg2)", borderRadius: 8, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "var(--text2)" }}>เติบโตรวม ({allSorted[0]?.year} → {lastSalary ? allSorted[allSorted.length-1]?.year : ""})</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1D9E75" }}>+{fmtDec(totalGrowthPct, 2)}%</span>
          </div>
        </div>
      )}

      {/* ── Multi-year chart ── */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)" }}>แนวโน้มรายเดือน (ทุกปี)</div>
          <div style={{ display: "flex", gap: 4 }}>
            {[["net","รายรับสุทธิ"],["salary","เงินเดือน"],["ot","OT"]].map(([k,l]) => (
              <button key={k} onClick={() => setChartMode(k)} style={{
                fontSize: 10, padding: "3px 8px", borderRadius: 10,
                border: `1px solid ${chartMode===k ? "#378ADD" : "var(--border)"}`,
                background: chartMode===k ? "#E6F1FB" : "transparent",
                color: chartMode===k ? "#185FA5" : "var(--text3)", cursor: "pointer"
              }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: ChartH }}>
          {allSorted.map((m, i) => {
            const v = chartMode === "net" ? calcPayslip(m, {}).net : chartMode === "salary" ? m.baseSalary : calcPayslip(m, {}).ot;
            const h = Math.max(3, (v / chartMax) * (ChartH - 20));
            const isCurrentYear = (m.year || 2026) === year;
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                <div title={`${m.year} ${MONTHS[m.monthIdx]}: ฿${fmt(v)}`} style={{
                  width: "100%", borderRadius: "2px 2px 0 0", height: h,
                  background: BAR_YEAR_COLOR(m),
                  opacity: isCurrentYear ? 1 : 0.45,
                }} />
                {(i === 0 || allSorted[i-1]?.year !== m.year) && (
                  <div style={{ fontSize: 7, color: "var(--text3)", position: "relative" }}>{m.year}</div>
                )}
              </div>
            );
          })}
        </div>
        {/* Year legend */}
        <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          {sortedYears.map((y, i) => (
            <div key={y} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: YEAR_COLORS[i % YEAR_COLORS.length], opacity: y === year ? 1 : 0.5 }} />
              <span style={{ fontSize: 11, color: "var(--text2)" }}>{y}{y === year ? " (ปัจจุบัน)" : ""}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Year comparison table ── */}
      {yearStats.length > 1 && (
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)", marginBottom: 12 }}>เปรียบเทียบรายปี</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "var(--text3)" }}>
                  <th style={{ textAlign: "left", padding: "4px 8px 8px 0", fontWeight: 500 }}>ปี</th>
                  <th style={{ textAlign: "right", padding: "4px 0 8px", fontWeight: 500 }}>เงินเดือนเฉลี่ย</th>
                  <th style={{ textAlign: "right", padding: "4px 0 8px", fontWeight: 500 }}>OT เฉลี่ย</th>
                  <th style={{ textAlign: "right", padding: "4px 0 8px", fontWeight: 500 }}>รายรับสุทธิ</th>
                  <th style={{ textAlign: "right", padding: "4px 0 8px", fontWeight: 500 }}>เทียบปีก่อน</th>
                </tr>
              </thead>
              <tbody>
                {yearStats.map((s, i) => {
                  const prev2 = i > 0 ? yearStats[i - 1] : null;
                  const vsLastNet = prev2 ? ((s.avgNet - prev2.avgNet) / prev2.avgNet) * 100 : null;
                  const isCurrent = s.year === year;
                  return (
                    <tr key={s.year} style={{ borderTop: "1px solid var(--border)", background: isCurrent ? "var(--bg2)" : "transparent" }}>
                      <td style={{ padding: "8px 8px 8px 0", fontWeight: isCurrent ? 700 : 500, color: s.color }}>
                        {s.year}{isCurrent ? " ★" : ""}
                        <div style={{ fontSize: 10, color: "var(--text3)", fontWeight: 400 }}>{s.months} เดือน</div>
                      </td>
                      <td style={{ textAlign: "right", padding: "8px 0", color: "var(--text1)" }}>฿{fmt(s.avgSalary)}</td>
                      <td style={{ textAlign: "right", padding: "8px 0", color: "#EF9F27" }}>฿{fmt(s.avgOT)}</td>
                      <td style={{ textAlign: "right", padding: "8px 0", fontWeight: 600, color: "var(--text1)" }}>฿{fmt(s.avgNet)}</td>
                      <td style={{ textAlign: "right", padding: "8px 0" }}>
                        {vsLastNet !== null ? (
                          <span style={{ color: vsLastNet >= 0 ? "#1D9E75" : "#D85A30", fontWeight: 600 }}>
                            {vsLastNet >= 0 ? "+" : ""}{fmtDec(vsLastNet, 1)}%
                          </span>
                        ) : <span style={{ color: "var(--text3)" }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Current year income breakdown ── */}
      {curMonths.length > 0 && (() => {
        const avgBase = curMonths.reduce((a, m) => a + m.baseSalary, 0) / curMonths.length;
        const avgOT2 = curMonths.reduce((a, m) => a + calcPayslip(m, {}).ot, 0) / curMonths.length;
        const avgFood = curMonths.reduce((a, m) => a + calcPayslip(m, {}).actualMeal, 0) / curMonths.length;
        const avgBonus = curMonths.reduce((a, m) => a + (m.bonus || 0), 0) / curMonths.length;
        const total2 = avgBase + avgOT2 + avgFood + avgBonus;
        return (
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)", marginBottom: 12 }}>สัดส่วนรายได้เฉลี่ย/เดือน ปี {year}</div>
            {[
              { label: "เงินเดือนฐาน", v: avgBase, color: "#378ADD" },
              { label: "OT รวม", v: avgOT2, color: "#1D9E75" },
              { label: "ค่าข้าว", v: avgFood, color: "#EF9F27" },
              { label: "โบนัส/พิเศษ", v: avgBonus, color: "#7F77DD" },
            ].filter(r => r.v > 0).map(r => (
              <div key={r.label} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                  <span style={{ color: "var(--text2)" }}>{r.label}</span>
                  <span style={{ fontWeight: 600, color: r.color }}>฿{fmt(r.v)} <span style={{ color: "var(--text3)", fontWeight: 400 }}>({fmtDec(r.v/total2*100,1)}%)</span></span>
                </div>
                <MiniBar value={r.v} max={total2} color={r.color} />
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

function PayslipTab({ month, onChange, bonusData = {} }) {
  const { ot, gross, deductions, net, workDays, leaveCount, actualMeal, actualDiligence, quarterlyBonusAmt } = calcPayslip(month, bonusData);

  function set(field, val) {
    onChange({ ...month, [field]: +val || 0 });
  }

  const Row = ({ label, field, readOnly = false, value }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
      <label style={{ fontSize: 13, color: "var(--text2)", flex: 1 }}>{label}</label>
      {readOnly ? (
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text1)" }}>฿{fmt(value ?? 0)}</span>
      ) : (
        <input type="number" value={month[field] ?? 0}
          onChange={e => set(field, e.target.value)}
          style={{ width: 120, textAlign: "right", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 13, color: "var(--text1)" }} />
      )}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px" }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)", marginBottom: 12 }}>ข้อมูลเงินเดือน</div>
        <Row label="เงินเดือนฐาน (บาท)" field="baseSalary" />
        <Row label="อัตราค่าแรง/ชั่วโมง" field="hourlyRate" />
        <Row label="OT x1 (ชั่วโมง)" field="ot1" />
        <Row label="OT x1.5 (ชั่วโมง)" field="ot15" />
        <Row label="OT x2 (ชั่วโมง)" field="ot2" />
        <Row label="OT x2.5 (ชั่วโมง)" field="ot25" />
        <Row label="OT x3 (ชั่วโมง)" field="ot3" />
        <Row label="อัตราค่าข้าว/วัน (฿)" field="mealRatePerDay" />
        <Row label={`ค่าข้าว (${workDays} วัน)`} readOnly value={actualMeal} />
        <Row label="เบี้ยขยัน (เต็ม/เดือน)" field="diligenceBonus" />
        <Row label={leaveCount > 0 ? `เบี้ยขยัน (ลา ${leaveCount} วัน → หัก)` : "เบี้ยขยัน (ได้เต็ม)"}
             readOnly value={actualDiligence} />
        <Row label="โบนัส / พิเศษอื่น" field="bonus" />
        <Row label="หัก ประกันสังคม" field="sso" />
        <Row label="หัก กองทุนสำรองเลี้ยงชีพ" field="providentFund" />
      </div>

      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px" }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)", marginBottom: 12 }}>สรุปสลิปเงินเดือน</div>
        {[
          { label: "เงินเดือนฐาน", v: month.baseSalary, color: "var(--text1)" },
          { label: `OT รวม (${OT_TYPES.reduce((a, t) => a + (month[t.key] || 0), 0)} ชม.)`, v: ot, color: "#1D9E75", hide: ot === 0 },
          { label: `ค่าข้าว (${workDays} วัน)`, v: actualMeal, color: "#378ADD", hide: actualMeal === 0 },
          { label: leaveCount > 0 ? `เบี้ยขยัน (ลา ${leaveCount} วัน)` : "เบี้ยขยัน", v: actualDiligence, color: leaveCount > 0 ? "#D85A30" : "#1D9E75", hide: (month.diligenceBonus || 0) === 0 },
          { label: "โบนัส Q" + (Object.entries(Q_PAY_MONTH).find(([,v]) => v === month.monthIdx)?.[0]?.slice(1) || ""), v: quarterlyBonusAmt, color: "#7F77DD", hide: quarterlyBonusAmt === 0 },
          { label: "โบนัส / พิเศษ", v: month.bonus || 0, color: "#378ADD", hide: !month.bonus },
          { label: "รายได้รวม (gross)", v: gross, color: "var(--text1)", bold: true },
          { label: "หักรวม", v: -deductions, color: "#D85A30" },
          { label: "รับสุทธิ (net)", v: net, color: "#1D9E75", bold: true, large: true },
        ].filter(r => !r.hide).map(r => (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 13, color: "var(--text2)", fontWeight: r.bold ? 500 : 400 }}>{r.label}</span>
            <span style={{ fontSize: r.large ? 18 : 13, fontWeight: r.bold ? 600 : 400, color: r.color }}>
              {r.v < 0 ? "-฿" : "฿"}{fmt(Math.abs(r.v))}
            </span>
          </div>
        ))}
      </div>

      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
        <label style={{ fontSize: 12, color: "var(--text2)" }}>หมายเหตุ</label>
        <textarea value={month.notes || ""} onChange={e => onChange({ ...month, notes: e.target.value })}
          rows={2} placeholder="บันทึกเพิ่มเติม..."
          style={{ width: "100%", marginTop: 6, background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "var(--text1)", resize: "vertical", boxSizing: "border-box" }} />
      </div>
    </div>
  );
}

function ExpensesTab({ month, onChange }) {
  const total = EXPENSE_CATS.reduce((a, c) => a + (+month.expenses?.[c.key] || 0), 0);
  const { net } = calcPayslip(month, {});

  function setExp(key, val) {
    onChange({ ...month, expenses: { ...month.expenses, [key]: +val || 0 } });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)" }}>รายการจ่าย</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: "#D85A30" }}>รวม ฿{fmt(total)}</span>
        </div>
        {EXPENSE_CATS.map(c => (
          <div key={c.key} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color }} />
                <label style={{ fontSize: 13, color: "var(--text2)" }}>{c.label}</label>
              </div>
              <input type="number" value={month.expenses?.[c.key] ?? c.default}
                onChange={e => setExp(c.key, e.target.value)}
                style={{ width: 110, textAlign: "right", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 13, color: "var(--text1)" }} />
            </div>
            <MiniBar value={+month.expenses?.[c.key] || 0} max={net} color={c.color} />
          </div>
        ))}
      </div>

      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: "var(--text2)" }}>รายรับสุทธิ</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: "#1D9E75" }}>฿{fmt(net)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: "var(--text2)" }}>รายจ่ายรวม</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: "#D85A30" }}>฿{fmt(total)}</span>
        </div>
        <div style={{ height: 1, background: "var(--border)", margin: "8px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text1)" }}>คงเหลือก่อนออม</span>
          <span style={{ fontSize: 16, fontWeight: 600, color: net - total >= 0 ? "#1D9E75" : "#D85A30" }}>
            ฿{fmt(net - total)}
          </span>
        </div>
        <MiniBar value={Math.max(0, net - total)} max={net} color="#1D9E75" />
      </div>
    </div>
  );
}

function SavingsTab({ month, onChange }) {
  const total = SAVINGS_CATS.reduce((a, c) => a + (+month.savings?.[c.key] || 0), 0);
  const { net } = calcPayslip(month, {});
  const pct = net > 0 ? (total / net) * 100 : 0;

  function setSav(key, val) {
    onChange({ ...month, savings: { ...month.savings, [key]: +val || 0 } });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)" }}>บัญชีออมทรัพย์</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: "#1D9E75" }}>฿{fmt(total)} ({fmtDec(pct, 1)}%)</span>
        </div>
        {SAVINGS_CATS.map(c => (
          <div key={c.key} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color }} />
                <label style={{ fontSize: 13, color: "var(--text2)" }}>{c.label}</label>
              </div>
              <input type="number" value={month.savings?.[c.key] ?? 0}
                onChange={e => setSav(c.key, e.target.value)}
                style={{ width: 110, textAlign: "right", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 13, color: "var(--text1)" }} />
            </div>
            <MiniBar value={+month.savings?.[c.key] || 0} max={net * 0.3} color={c.color} />
          </div>
        ))}
      </div>
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 6 }}>เป้าหมายการออม</div>
        {[
          { label: "เป้า 10%", target: net * 0.1 },
          { label: "เป้า 20%", target: net * 0.2 },
          { label: "ออมได้จริง", target: total, bold: true },
        ].map(r => (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
            <span style={{ fontSize: 12, color: "var(--text2)", fontWeight: r.bold ? 500 : 400 }}>{r.label}</span>
            <span style={{ fontSize: 12, fontWeight: r.bold ? 600 : 400, color: r.bold ? "#1D9E75" : "var(--text2)" }}>฿{fmt(r.target)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InvestmentsTab({ liveData, refreshLive }) {
  const [holdings, setHoldings] = useState(() => {
    try { return JSON.parse(localStorage.getItem("sudarat_holdings") || "{}"); } catch { return {}; }
  });

  function setH(key, val) {
    const next = { ...holdings, [key]: val };
    setHoldings(next);
    localStorage.setItem("sudarat_holdings", JSON.stringify(next));
  }

  const sp = liveData.sp500;
  const goldOrn = liveData.goldOrnament;
  const goldBar = liveData.goldBullion;

  const sp500Units = +(holdings.sp500Units || 0);
  const sp500CostPerUnit = +(holdings.sp500Cost || 0);
  const goldOrnGrams = +(holdings.goldOrnGrams || 0);
  const goldOrnCost = +(holdings.goldOrnCost || 0);
  const goldBarGrams = +(holdings.goldBarGrams || 0);
  const goldBarCost = +(holdings.goldBarCost || 0);

  const sp500Value = sp500Units * (sp?.nav || 0);
  const sp500Gain = sp500Value - sp500Units * sp500CostPerUnit;
  const goldOrnValue = goldOrnGrams * (goldOrn?.sellPrice || 0);
  const goldOrnGain = goldOrnValue - goldOrnCost;
  const goldBarValue = goldBarGrams * (goldBar?.sellPrice || 0);
  const goldBarGain = goldBarValue - goldBarCost;

  const totalValue = sp500Value + goldOrnValue + goldBarValue;
  const totalCost = sp500Units * sp500CostPerUnit + goldOrnCost + goldBarCost;
  const totalGain = totalValue - totalCost;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, color: "var(--text3)" }}>
          {liveData.lastUpdated ? `อัปเดตล่าสุด: ${new Date(liveData.lastUpdated).toLocaleTimeString("th-TH")}` : "ยังไม่ได้โหลดราคา"}
        </div>
        <button onClick={refreshLive} style={{
          fontSize: 12, padding: "5px 14px", borderRadius: 20, border: "1px solid var(--border)",
          background: "var(--card-bg)", color: "var(--text2)", cursor: "pointer"
        }}>🔄 รีเฟรชราคา</button>
      </div>

      {[
        {
          title: "SCB S&P500A (SCBS&P500A)",
          color: "#7F77DD",
          price: sp?.nav ? `NAV ฿${fmtDec(sp.nav, 4)}` : "กำลังโหลด...",
          change: sp?.change,
          fields: [
            { label: "จำนวนหน่วยลงทุน", key: "sp500Units", placeholder: "0.0000" },
            { label: "ราคาทุน/หน่วย (฿)", key: "sp500Cost", placeholder: "0.0000" },
          ],
          value: sp500Value, gain: sp500Gain,
          note: sp?.source || "",
        },
        {
          title: "ทองรูปพรรณ (Gold Ornament)",
          color: "#D4A017",
          price: goldOrn?.sellPrice ? `ขาย ฿${fmt(goldOrn.sellPrice)}/บาททอง` : "กำลังโหลด...",
          change: goldOrn?.change,
          fields: [
            { label: "น้ำหนักที่ถือ (บาททอง)", key: "goldOrnGrams", placeholder: "0.00" },
            { label: "ต้นทุนรวม (฿)", key: "goldOrnCost", placeholder: "0" },
          ],
          value: goldOrnValue, gain: goldOrnGain,
          note: goldOrn?.source || "",
        },
        {
          title: "ทองแท่ง 96.5% (Gold Bullion)",
          color: "#B8860B",
          price: goldBar?.sellPrice ? `ขาย ฿${fmt(goldBar.sellPrice)}/บาททอง` : "กำลังโหลด...",
          change: goldBar?.change,
          fields: [
            { label: "น้ำหนักที่ถือ (บาททอง)", key: "goldBarGrams", placeholder: "0.00" },
            { label: "ต้นทุนรวม (฿)", key: "goldBarCost", placeholder: "0" },
          ],
          value: goldBarValue, gain: goldBarGain,
          note: goldBar?.source || "",
        },
      ].map(inv => (
        <div key={inv.title} style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: inv.color, display: "inline-block" }} />
                {inv.title}
              </div>
              {inv.note && <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 2 }}>{inv.note}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: inv.color }}>{inv.price}</div>
              {inv.change != null && (
                <div style={{ fontSize: 11, color: inv.change >= 0 ? "#1D9E75" : "#D85A30" }}>
                  {inv.change >= 0 ? "▲" : "▼"} {fmtDec(Math.abs(inv.change), 2)}%
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            {inv.fields.map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 11, color: "var(--text3)" }}>{f.label}</label>
                <input type="number" value={holdings[f.key] ?? ""} placeholder={f.placeholder}
                  onChange={e => setH(f.key, e.target.value)}
                  style={{ display: "block", width: "100%", marginTop: 3, background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 8px", fontSize: 13, color: "var(--text1)", boxSizing: "border-box" }} />
              </div>
            ))}
          </div>
          {inv.value > 0 && (
            <div style={{ background: "var(--bg2)", borderRadius: 8, padding: "10px 12px", display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--text3)" }}>มูลค่าปัจจุบัน</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text1)" }}>฿{fmt(inv.value)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "var(--text3)" }}>กำไร/ขาดทุน</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: inv.gain >= 0 ? "#1D9E75" : "#D85A30" }}>
                  {inv.gain >= 0 ? "+" : ""}฿{fmt(inv.gain)}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      {totalValue > 0 && (
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)", marginBottom: 10 }}>พอร์ตรวม</div>
          {[
            { label: "ต้นทุนรวม", v: totalCost, color: "var(--text2)" },
            { label: "มูลค่าปัจจุบัน", v: totalValue, color: "var(--text1)" },
            { label: "กำไร/ขาดทุนรวม", v: totalGain, color: totalGain >= 0 ? "#1D9E75" : "#D85A30" },
          ].map(r => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 13, color: "var(--text2)" }}>{r.label}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: r.color }}>
                {r.label.includes("กำไร") && r.v >= 0 ? "+" : ""}฿{fmt(r.v)}
              </span>
            </div>
          ))}
          {totalCost > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0" }}>
              <span style={{ fontSize: 13, color: "var(--text2)" }}>ผลตอบแทนรวม</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: totalGain >= 0 ? "#1D9E75" : "#D85A30" }}>
                {totalGain >= 0 ? "+" : ""}{fmtDec((totalGain / totalCost) * 100, 2)}%
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const TAX_DEDUCTIONS_DEFS = [
  { key: "rmf",            label: "กองทุน RMF",          note: "ไม่เกิน 30% ของรายได้ และ 500,000",    cap: (inc) => Math.min(inc * 0.3, 500000) },
  { key: "ssf",            label: "กองทุน SSF/TESG",     note: "ไม่เกิน 30% ของรายได้ และ 200,000",    cap: (inc) => Math.min(inc * 0.3, 200000) },
  { key: "pvd",            label: "กองทุนสำรองเลี้ยงชีพ (PVD)", note: "ไม่เกิน 15% ของรายได้ และ 500,000", cap: (inc) => Math.min(inc * 0.15, 500000) },
  { key: "lifeInsurance",  label: "ประกันชีวิต",          note: "ไม่เกิน 100,000",                     cap: () => 100000 },
  { key: "healthInsurance",label: "ประกันสุขภาพ (ตนเอง)", note: "ไม่เกิน 25,000",                      cap: () => 25000  },
  { key: "parentHealth",   label: "ประกันสุขภาพพ่อแม่",  note: "ไม่เกิน 15,000",                      cap: () => 15000  },
  { key: "mortgageInterest",label: "ดอกเบี้ยบ้าน",       note: "ไม่เกิน 100,000",                     cap: () => 100000 },
  { key: "parents",        label: "ลดหย่อนบิดา-มารดา",  note: "คนละ 30,000 (ใส่จำนวนคน 0–4)",       isCount: true, perUnit: 30000, cap: () => 120000 },
  { key: "children",       label: "ลดหย่อนบุตร",         note: "คนละ 30,000 (ใส่จำนวนบุตร)",         isCount: true, perUnit: 30000, cap: () => 999999 },
  { key: "donation",       label: "เงินบริจาคทั่วไป",    note: "ไม่เกิน 10% ของเงินได้หลังหักค่าใช้จ่าย", cap: null },
];

function calcExtraDeductions(td, annualIncome) {
  let total = 0;
  for (const def of TAX_DEDUCTIONS_DEFS) {
    const raw = +(td?.[def.key] || 0);
    if (!raw) continue;
    if (def.isCount) {
      total += Math.min(raw * def.perUnit, def.cap());
    } else if (def.key === "donation") {
      total += Math.min(raw, annualIncome * 0.1);
    } else {
      total += Math.min(raw, def.cap(annualIncome));
    }
  }
  return total;
}

function TaxTab({ months, taxDeductions = {}, onChangeTaxDeductions }) {
  if (months.length === 0) return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text2)" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🧮</div>
      <div>กรุณาเพิ่มข้อมูลเงินเดือนก่อน</div>
    </div>
  );

  const lastM = months[months.length - 1];
  const avgNet = months.reduce((a, m) => a + calcPayslip(m, {}).net, 0) / months.length;
  const projectedAnnual = avgNet * 12;
  const personalDeduction = 60000;
  const employmentDeduction = Math.min(projectedAnnual * 0.5, 100000);
  const ssoDeduct = (lastM.sso || 0) * 12;
  const extraDeduct = calcExtraDeductions(taxDeductions, projectedAnnual);
  const projTaxable = Math.max(0, projectedAnnual - personalDeduction - employmentDeduction - ssoDeduct - extraDeduct);
  const projTax = calcTax(projTaxable);
  const effRate = projectedAnnual > 0 ? (projTax / projectedAnnual) * 100 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px" }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)", marginBottom: 12 }}>
          ประมาณการภาษีเงินได้บุคคลธรรมดา ภ.ง.ด.91
        </div>
        {[
          { label: "รายได้ประจำปีประมาณการ", v: projectedAnnual, note: `(จาก ${months.length} เดือน × 12)` },
          { label: "หักค่าใช้จ่าย 50% (ไม่เกิน 1 แสน)", v: -employmentDeduction, color: "#1D9E75" },
          { label: "หักลดหย่อนส่วนตัว", v: -personalDeduction, color: "#1D9E75" },
          { label: "หักเงินประกันสังคม", v: -ssoDeduct, color: "#1D9E75" },
          ...(extraDeduct > 0 ? [{ label: "หักลดหย่อนเพิ่มเติม", v: -extraDeduct, color: "#7F77DD" }] : []),
          { label: "เงินได้สุทธิ (taxable income)", v: projTaxable, bold: true },
          { label: "ภาษีที่ต้องชำระ/ปี", v: projTax, color: "#EF9F27", bold: true, large: true },
          { label: "ควรกันไว้/เดือน", v: projTax / 12, color: "#D85A30" },
          { label: "อัตราภาษีที่แท้จริง (effective rate)", v: null, text: fmtDec(effRate, 2) + "%" },
        ].map(r => (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
            <div>
              <span style={{ fontSize: 13, color: "var(--text2)", fontWeight: r.bold ? 500 : 400 }}>{r.label}</span>
              {r.note && <div style={{ fontSize: 10, color: "var(--text3)" }}>{r.note}</div>}
            </div>
            <span style={{ fontSize: r.large ? 18 : 13, fontWeight: r.bold ? 600 : 400, color: r.color || "var(--text1)" }}>
              {r.text || (r.v !== null ? ((r.v < 0 ? "-฿" : "฿") + fmt(Math.abs(r.v))) : "")}
            </span>
          </div>
        ))}
      </div>

      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px" }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)", marginBottom: 12 }}>อัตราภาษีแบบขั้นบันได</div>
        {TAX_BRACKETS.filter(b => b.rate > 0).map(b => {
          const active = projTaxable > b.min;
          return (
            <div key={b.min} style={{ display: "flex", gap: 10, alignItems: "center", padding: "5px 0", opacity: active ? 1 : 0.4 }}>
              <div style={{ minWidth: 8, height: 8, borderRadius: "50%", background: active ? "#EF9F27" : "var(--border)" }} />
              <span style={{ fontSize: 12, color: "var(--text2)", flex: 1 }}>
                ฿{fmt(b.min)} – {b.max === Infinity ? "ขึ้นไป" : "฿" + fmt(b.max)}
              </span>
              <span style={{ fontSize: 12, fontWeight: 500, color: active ? "#EF9F27" : "var(--text3)" }}>
                {(b.rate * 100).toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>

      {/* ─ ลดหย่อนเพิ่มเติม ─ */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)", marginBottom: 4 }}>
          ค่าลดหย่อนเพิ่มเติม
        </div>
        <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 12 }}>
          กรอกจำนวนเงินจริงต่อปี ระบบจะคำนวณตามเพดานของกรมสรรพากร
        </div>
        {TAX_DEDUCTIONS_DEFS.map(def => (
          <div key={def.key} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                <div style={{ fontSize: 13, color: "var(--text1)" }}>{def.label}</div>
                <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 1 }}>{def.note}</div>
              </div>
              <input
                type="number"
                value={taxDeductions[def.key] ?? ""}
                placeholder="0"
                onChange={e => onChangeTaxDeductions({ ...taxDeductions, [def.key]: +e.target.value || 0 })}
                style={{ width: 100, textAlign: "right", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 13, color: "var(--text1)", flexShrink: 0 }}
              />
            </div>
            {/* คำนวณเพดาน */}
            {(+(taxDeductions[def.key] || 0) > 0) && (() => {
              const raw = +(taxDeductions[def.key] || 0);
              const capped = def.isCount ? Math.min(raw * def.perUnit, def.cap())
                           : def.key === "donation" ? Math.min(raw, projectedAnnual * 0.1)
                           : Math.min(raw, def.cap(projectedAnnual));
              return (
                <div style={{ fontSize: 11, color: "#7F77DD", marginTop: 3, textAlign: "right" }}>
                  ใช้ได้จริง: ฿{fmt(capped)}{raw !== capped ? ` (จำกัดที่ ฿${fmt(capped)})` : ""}
                </div>
              );
            })()}
          </div>
        ))}
        {extraDeduct > 0 && (
          <div style={{ paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)" }}>รวมลดหย่อนเพิ่มเติม</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#7F77DD" }}>฿{fmt(extraDeduct)}</span>
          </div>
        )}
      </div>

      <div style={{ background: "#FFF8E7", border: "1px solid #EF9F27", borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ fontSize: 12, color: "#633806", fontWeight: 500 }}>⚠️ หมายเหตุสำคัญ</div>
        <div style={{ fontSize: 12, color: "#854F0B", marginTop: 4, lineHeight: 1.6 }}>
          การคำนวณนี้เป็นการประมาณการเบื้องต้นเท่านั้น ควรปรึกษานักบัญชีหรือสรรพากรเพื่อยื่นภาษีจริง
        </div>
      </div>
    </div>
  );
}



const ANNUAL_EXPENSE_CATS = [
  { key: "car_insurance", label: "ประกันรถยนต์", icon: "🚗", default: 0 },
  { key: "health_insurance", label: "ประกันสุขภาพ", icon: "🏥", default: 0 },
  { key: "life_insurance", label: "ประกันชีวิต", icon: "🛡", default: 0 },
  { key: "tax_payment", label: "ภาษีรถยนต์ / พ.ร.บ.", icon: "📄", default: 0 },
  { key: "annual_checkup", label: "ตรวจสุขภาพประจำปี", icon: "🩺", default: 0 },
  { key: "other_annual", label: "อื่นๆ ประจำปี", icon: "📦", default: 0 },
];

function BonusTab({ bonusData, onChange }) {
  const quarters = [
    { key: "q1", label: "ไตรมาส 1 (ม.ค.–มี.ค.)", color: "#378ADD" },
    { key: "q2", label: "ไตรมาส 2 (เม.ย.–มิ.ย.)", color: "#1D9E75" },
    { key: "q3", label: "ไตรมาส 3 (ก.ค.–ก.ย.)", color: "#EF9F27" },
    { key: "q4", label: "ไตรมาส 4 (ต.ค.–ธ.ค.)", color: "#7F77DD" },
  ];

  function set(key, val) {
    onChange({ ...bonusData, [key]: +val || 0 });
  }

  const totalQuarterly = quarters.reduce((a, q) => a + (+bonusData[q.key] || 0), 0);
  const annualBonus = +bonusData.annual || 0;
  const performanceBonus = +bonusData.performance || 0;
  const totalBonus = totalQuarterly + annualBonus + performanceBonus;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Quarterly */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)", marginBottom: 12 }}>🗓 โบนัสรายไตรมาส</div>
        {quarters.map(q => (
          <div key={q.key} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: q.color }} />
                <label style={{ fontSize: 13, color: "var(--text2)" }}>{q.label}</label>
              </div>
              <input type="number" value={bonusData[q.key] ?? ""}
                placeholder="0"
                onChange={e => set(q.key, e.target.value)}
                style={{ width: 120, textAlign: "right", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 13, color: "var(--text1)" }} />
            </div>
            <MiniBar value={+bonusData[q.key] || 0} max={Math.max(totalBonus, 1)} color={q.color} />
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 0", borderTop: "1px solid var(--border)", marginTop: 4 }}>
          <span style={{ fontSize: 13, color: "var(--text2)" }}>รวมโบนัสรายไตรมาส</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#378ADD" }}>฿{fmt(totalQuarterly)}</span>
        </div>
      </div>

      {/* Annual & Performance */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)", marginBottom: 12 }}>🏆 โบนัสพิเศษ</div>
        {[
          { key: "annual", label: "โบนัสประจำปี", color: "#D85A30" },
          { key: "performance", label: "โบนัส Performance", color: "#1D9E75" },
          { key: "other_bonus", label: "โบนัสอื่นๆ", color: "#888780" },
        ].map(b => (
          <div key={b.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: b.color }} />
              <label style={{ fontSize: 13, color: "var(--text2)" }}>{b.label}</label>
            </div>
            <input type="number" value={bonusData[b.key] ?? ""}
              placeholder="0"
              onChange={e => set(b.key, e.target.value)}
              style={{ width: 120, textAlign: "right", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 13, color: "var(--text1)" }} />
          </div>
        ))}
      </div>

      {/* Summary */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)", marginBottom: 10 }}>สรุปโบนัสทั้งปี</div>
        {[
          { label: "โบนัสรายไตรมาสรวม", v: totalQuarterly, color: "#378ADD" },
          { label: "โบนัสประจำปี", v: annualBonus, color: "#D85A30" },
          { label: "โบนัส Performance", v: performanceBonus, color: "#1D9E75" },
          { label: "โบนัสอื่นๆ", v: +bonusData.other_bonus || 0, color: "#888780" },
        ].map(r => (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 13, color: "var(--text2)" }}>{r.label}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: r.color }}>฿{fmt(r.v)}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text1)" }}>รวมโบนัสทั้งปี</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#1D9E75" }}>฿{fmt(totalBonus)}</span>
        </div>
        {totalBonus > 0 && (
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4, textAlign: "right" }}>
            เฉลี่ย ฿{fmt(totalBonus / 12)} / เดือน
          </div>
        )}
      </div>

      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
        <label style={{ fontSize: 12, color: "var(--text2)" }}>หมายเหตุ</label>
        <textarea value={bonusData.notes || ""} onChange={e => onChange({ ...bonusData, notes: e.target.value })}
          rows={2} placeholder="บันทึกเงื่อนไข หรือ KPI..."
          style={{ width: "100%", marginTop: 6, background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "var(--text1)", resize: "vertical", boxSizing: "border-box" }} />
      </div>
    </div>
  );
}

function AnnualExpensesTab({ annualExp, onChange }) {
  const total = ANNUAL_EXPENSE_CATS.reduce((a, c) => a + (+annualExp[c.key] || 0), 0);

  function set(key, val) {
    onChange({ ...annualExp, [key]: +val || 0 });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)" }}>รายจ่ายประจำปี</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: "#D85A30" }}>฿{fmt(total)} / ปี</span>
        </div>
        {ANNUAL_EXPENSE_CATS.map(c => (
          <div key={c.key} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>{c.icon}</span>
                <label style={{ fontSize: 13, color: "var(--text2)" }}>{c.label}</label>
              </div>
              <input type="number" value={annualExp[c.key] ?? ""}
                placeholder="0"
                onChange={e => set(c.key, e.target.value)}
                style={{ width: 120, textAlign: "right", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 13, color: "var(--text1)" }} />
            </div>
            <MiniBar value={+annualExp[c.key] || 0} max={Math.max(total, 1)} color="#D85A30" />
          </div>
        ))}

        {/* Custom items */}
        {(annualExp.custom || []).map((item, i) => (
          <div key={i} style={{ marginBottom: 10, display: "flex", gap: 8, alignItems: "center" }}>
            <input value={item.label} onChange={e => {
              const custom = [...(annualExp.custom || [])];
              custom[i] = { ...custom[i], label: e.target.value };
              onChange({ ...annualExp, custom });
            }} placeholder="ชื่อรายการ"
              style={{ flex: 1, background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 13, color: "var(--text1)" }} />
            <input type="number" value={item.amount ?? ""} onChange={e => {
              const custom = [...(annualExp.custom || [])];
              custom[i] = { ...custom[i], amount: +e.target.value || 0 };
              onChange({ ...annualExp, custom });
            }} placeholder="0"
              style={{ width: 110, textAlign: "right", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 13, color: "var(--text1)" }} />
            <button onClick={() => {
              const custom = (annualExp.custom || []).filter((_, j) => j !== i);
              onChange({ ...annualExp, custom });
            }} style={{ background: "none", border: "none", color: "#D85A30", cursor: "pointer", fontSize: 16 }}>✕</button>
          </div>
        ))}
        <button onClick={() => onChange({ ...annualExp, custom: [...(annualExp.custom || []), { label: "", amount: 0 }] })}
          style={{ marginTop: 4, fontSize: 12, color: "#378ADD", background: "none", border: "1px dashed #378ADD", borderRadius: 6, padding: "4px 12px", cursor: "pointer", width: "100%" }}>
          + เพิ่มรายการเอง
        </button>
      </div>

      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)", marginBottom: 10 }}>สรุป</div>
        {[
          { label: "รายจ่ายประจำปีรวม", v: total + (annualExp.custom || []).reduce((a, c) => a + (+c.amount || 0), 0) },
          { label: "เฉลี่ยต่อเดือน", v: (total + (annualExp.custom || []).reduce((a, c) => a + (+c.amount || 0), 0)) / 12 },
        ].map(r => (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 13, color: "var(--text2)" }}>{r.label}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#D85A30" }}>฿{fmt(r.v)}</span>
          </div>
        ))}
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--text3)", lineHeight: 1.6 }}>
          💡 ควรกันเงินไว้เดือนละ ฿{fmt((total + (annualExp.custom || []).reduce((a, c) => a + (+c.amount || 0), 0)) / 12)} เพื่อรับมือรายจ่ายก้อนเหล่านี้
        </div>
      </div>
    </div>
  );
}


const OT_TYPES = [
  { key: "ot1",  label: "x1",   color: "#378ADD", bg: "#E6F1FB" },
  { key: "ot15", label: "x1.5", color: "#1D9E75", bg: "#E6F7F2" },
  { key: "ot2",  label: "x2",   color: "#EF9F27", bg: "#FEF3E2" },
  { key: "ot25", label: "x2.5", color: "#993556", bg: "#F5E8EE" },
  { key: "ot3",  label: "x3",   color: "#D85A30", bg: "#FDEEE9" },
];

const OT_MULT = { ot1: 1, ot15: 1.5, ot2: 2, ot25: 2.5, ot3: 3 };

function OTCalendarTab({ month, onChange }) {
  const [selectedDays, setSelectedDays] = useState([]);
  const [otType, setOtType] = useState("ot15");
  const [hours, setHours] = useState(2);

  const monthIdx = month.monthIdx;
  const year = 2026;
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const firstDay = new Date(year, monthIdx, 1).getDay(); // 0=Sun
  const hourlyRate = month.hourlyRate || 129.24;

  // otLog: { "1": {ot15: 2}, "3": {ot1: 1, ot15: 2}, ... }
  const otLog = month.otLog || {};

  function toggleDay(d) {
    setSelectedDays(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
    );
  }

  function applyOT() {
    if (selectedDays.length === 0) return;
    const newLog = { ...otLog };
    selectedDays.forEach(d => {
      const key = String(d);
      newLog[key] = { ...(newLog[key] || {}), [otType]: (newLog[key]?.[otType] || 0) + Number(hours) };
    });
    // Recalculate totals
    const totals = { ot1: 0, ot15: 0, ot2: 0, ot3: 0 };
    Object.values(newLog).forEach(dayEntry => {
      OT_TYPES.forEach(t => { totals[t.key] += dayEntry[t.key] || 0; });
    });
    onChange({ ...month, otLog: newLog, ...totals });
    setSelectedDays([]);
  }

  function clearDay(d) {
    const newLog = { ...otLog };
    delete newLog[String(d)];
    const totals = { ot1: 0, ot15: 0, ot2: 0, ot3: 0 };
    Object.values(newLog).forEach(dayEntry => {
      OT_TYPES.forEach(t => { totals[t.key] += dayEntry[t.key] || 0; });
    });
    onChange({ ...month, otLog: newLog, ...totals });
  }

  const totalOTBaht = OT_TYPES.reduce((a, t) =>
    a + (month[t.key] || 0) * hourlyRate * OT_MULT[t.key], 0);

  const DAY_LABELS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Summary */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)", marginBottom: 10 }}>
          สรุป OT — {MONTHS[monthIdx]}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${OT_TYPES.length},1fr)`, gap: 6 }}>
          {OT_TYPES.map(t => (
            <div key={t.key} style={{ background: t.bg, borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: t.color, fontWeight: 600 }}>{t.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.color }}>{month[t.key] || 0}</div>
              <div style={{ fontSize: 10, color: t.color }}>ชม.</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
          <span style={{ fontSize: 13, color: "var(--text2)" }}>รวมค่า OT</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#1D9E75" }}>฿{fmt(totalOTBaht)}</span>
        </div>
      </div>

      {/* Controls */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)", marginBottom: 10 }}>เลือกประเภท OT และชั่วโมง</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {OT_TYPES.map(t => (
            <button key={t.key} onClick={() => setOtType(t.key)} style={{
              padding: "6px 16px", borderRadius: 20, border: "2px solid",
              borderColor: otType === t.key ? t.color : "var(--border)",
              background: otType === t.key ? t.bg : "transparent",
              color: otType === t.key ? t.color : "var(--text2)",
              fontWeight: otType === t.key ? 600 : 400,
              fontSize: 13, cursor: "pointer"
            }}>{t.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: "var(--text2)" }}>จำนวนชั่วโมง:</span>
          <button onClick={() => setHours(h => Math.max(0.5, h - 0.5))} style={{
            width: 32, height: 32, borderRadius: "50%", border: "1px solid var(--border)",
            background: "var(--bg2)", color: "var(--text1)", fontSize: 18, cursor: "pointer"
          }}>−</button>
          <span style={{ fontSize: 18, fontWeight: 600, color: "var(--text1)", minWidth: 32, textAlign: "center" }}>{hours}</span>
          <button onClick={() => setHours(h => h + 0.5)} style={{
            width: 32, height: 32, borderRadius: "50%", border: "1px solid var(--border)",
            background: "var(--bg2)", color: "var(--text1)", fontSize: 18, cursor: "pointer"
          }}>+</button>
          <span style={{ fontSize: 12, color: "var(--text3)" }}>= ฿{fmt(hours * hourlyRate * OT_MULT[otType])}/วัน</span>
        </div>
      </div>

      {/* Calendar */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)" }}>
            {selectedDays.length > 0 ? `เลือก ${selectedDays.length} วัน` : "กดเลือกวันที่ทำ OT"}
          </div>
          {selectedDays.length > 0 && (
            <button onClick={applyOT} style={{
              padding: "6px 16px", borderRadius: 20, background: "#378ADD",
              color: "#fff", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer"
            }}>✓ บันทึก OT</button>
          )}
        </div>

        {/* Day headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, marginBottom: 3 }}>
          {DAY_LABELS.map(d => (
            <div key={d} style={{ textAlign: "center", fontSize: 11, color: "var(--text3)", padding: "2px 0" }}>{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
          {Array.from({ length: firstDay }).map((_, i) => <div key={"e" + i} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const d = i + 1;
            const dayData = otLog[String(d)];
            const hasOT = dayData && OT_TYPES.some(t => dayData[t.key] > 0);
            const isSelected = selectedDays.includes(d);
            const dayOfWeek = new Date(year, monthIdx, d).getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            // Find dominant OT type for color
            let dotColor = null;
            if (hasOT) {
              const dominant = OT_TYPES.slice().reverse().find(t => dayData[t.key] > 0);
              dotColor = dominant?.color;
            }

            return (
              <div key={d} onClick={() => toggleDay(d)}
                style={{
                  aspectRatio: "1", borderRadius: 8, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", cursor: "pointer",
                  background: isSelected ? "#378ADD" : hasOT ? (dotColor + "22") : "var(--bg2)",
                  border: "2px solid",
                  borderColor: isSelected ? "#378ADD" : hasOT ? dotColor : "transparent",
                  position: "relative", transition: "all 0.15s"
                }}>
                <span style={{
                  fontSize: 13, fontWeight: hasOT || isSelected ? 600 : 400,
                  color: isSelected ? "#fff" : isWeekend ? "#D85A30" : "var(--text1)"
                }}>{d}</span>
                {hasOT && !isSelected && (
                  <div style={{ display: "flex", gap: 2, marginTop: 1 }}>
                    {OT_TYPES.filter(t => dayData[t.key] > 0).map(t => (
                      <div key={t.key} style={{ width: 4, height: 4, borderRadius: "50%", background: t.color }} />
                    ))}
                  </div>
                )}
                {hasOT && (
                  <button onClick={e => { e.stopPropagation(); clearDay(d); }} style={{
                    position: "absolute", top: 1, right: 1,
                    background: "none", border: "none", fontSize: 8,
                    color: isSelected ? "#fff" : "var(--text3)", cursor: "pointer", padding: 0, lineHeight: 1
                  }}>✕</button>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap" }}>
          {OT_TYPES.map(t => (
            <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.color }} />
              <span style={{ fontSize: 11, color: "var(--text2)" }}>{t.label}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: "#378ADD" }} />
            <span style={{ fontSize: 11, color: "var(--text2)" }}>เลือกอยู่</span>
          </div>
        </div>
      </div>

      {/* Daily detail */}
      {Object.keys(otLog).length > 0 && (
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)", marginBottom: 10 }}>รายละเอียดรายวัน</div>
          {Object.entries(otLog).sort((a,b) => +a[0] - +b[0]).map(([day, data]) => (
            <div key={day} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 13, color: "var(--text2)" }}>วันที่ {day} {MONTHS[monthIdx]}</span>
              <div style={{ display: "flex", gap: 6 }}>
                {OT_TYPES.filter(t => data[t.key] > 0).map(t => (
                  <span key={t.key} style={{ fontSize: 11, background: t.bg, color: t.color, borderRadius: 10, padding: "2px 8px", fontWeight: 600 }}>
                    {t.label} × {data[t.key]}ชม.
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text2)" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <div>กดปุ่ม "+ เดือน" เพื่อเริ่ม</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
//  AUTH SCREENS
// ─────────────────────────────────────────────────────────

function AuthBg({ darkMode, children }) {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: darkMode
        ? "linear-gradient(160deg,#0d0d0d 0%,#111827 100%)"
        : "linear-gradient(160deg,#f0ede8 0%,#e8e4f0 100%)",
      padding: "40px 20px", fontFamily: "'Sarabun','Noto Sans Thai',sans-serif",
    }}>
      {children}
    </div>
  );
}

function UserSelectScreen({ darkMode, onSelect, onAddUser }) {
  const [users, setUsers] = useState(getStoredUsers);

  // re-read when screen shows
  useEffect(() => { setUsers(getStoredUsers()); }, []);

  const card = darkMode
    ? { bg: "rgba(255,255,255,0.04)", hover: "rgba(255,255,255,0.08)", text: "#e0e0e0" }
    : { bg: "rgba(0,0,0,0.03)",       hover: "rgba(0,0,0,0.07)",       text: "#333" };

  return (
    <AuthBg darkMode={darkMode}>
      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{ fontSize: 48, marginBottom: 10 }}>💰</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: darkMode ? "#f0f0f0" : "#1a1a1a", letterSpacing: "-0.5px" }}>
          My Finance
        </div>
        <div style={{ fontSize: 13, color: darkMode ? "#555" : "#aaa", marginTop: 4 }}>
          เลือกบัญชีเพื่อเข้าใช้งาน
        </div>
      </div>

      {/* User cards */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, justifyContent: "center", maxWidth: 520, marginBottom: 40 }}>
        {users.map(u => (
          <UserCard key={u.id} u={u} card={card} darkMode={darkMode} onClick={() => onSelect(u)} />
        ))}

        {/* Add user */}
        <button onClick={onAddUser} style={{
          background: card.bg, border: `2px dashed ${darkMode ? "#333" : "#d0d0d0"}`,
          borderRadius: 20, cursor: "pointer", padding: "20px 28px",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
          transition: "background 0.15s",
          minWidth: 110,
        }}
          onMouseEnter={e => e.currentTarget.style.background = card.hover}
          onMouseLeave={e => e.currentTarget.style.background = card.bg}
        >
          <div style={{
            width: 72, height: 72, borderRadius: "50%",
            border: `2px dashed ${darkMode ? "#444" : "#ccc"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28, color: darkMode ? "#555" : "#bbb",
          }}>+</div>
          <span style={{ fontSize: 13, color: darkMode ? "#555" : "#aaa" }}>เพิ่มผู้ใช้</span>
        </button>
      </div>

      <div style={{ fontSize: 11, color: darkMode ? "#333" : "#ccc" }}>2026 • Personal Finance</div>
    </AuthBg>
  );
}

function UserCard({ u, card, darkMode, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} style={{
      background: hov ? card.hover : card.bg,
      border: `1.5px solid ${hov ? u.color : (darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)")}`,
      borderRadius: 20, cursor: "pointer", padding: "20px 28px",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
      transition: "all 0.15s", transform: hov ? "translateY(-2px)" : "none",
      boxShadow: hov ? `0 8px 24px ${u.color}33` : "none",
      minWidth: 110,
    }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{
        width: 72, height: 72, borderRadius: "50%",
        background: u.color + "22",
        border: `3px solid ${u.color}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 32,
      }}>{u.avatar}</div>
      <span style={{ fontSize: 14, fontWeight: 600, color: card.text }}>{u.name}</span>
      {u.password ? (
        <span style={{ fontSize: 10, color: darkMode ? "#555" : "#bbb" }}>🔒 มีรหัสผ่าน</span>
      ) : (
        <span style={{ fontSize: 10, color: darkMode ? "#444" : "#ccc" }}>ไม่มีรหัสผ่าน</span>
      )}
    </button>
  );
}

function LoginScreen({ user, darkMode, onLogin, onBack }) {
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  function handleLogin() {
    if (!user.password || password === user.password) {
      onLogin(user);
    } else {
      setError("รหัสผ่านไม่ถูกต้อง");
      setPassword("");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  }

  return (
    <AuthBg darkMode={darkMode}>
      <div style={{ width: "100%", maxWidth: 340 }}>
        {/* Back */}
        <button onClick={onBack} style={{
          background: "none", border: "none", cursor: "pointer",
          color: darkMode ? "#666" : "#aaa", fontSize: 13, marginBottom: 36,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ fontSize: 16 }}>‹</span> เปลี่ยนผู้ใช้
        </button>

        {/* Avatar */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 96, height: 96, borderRadius: "50%",
            background: user.color + "22",
            border: `4px solid ${user.color}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 44, margin: "0 auto 14px",
            boxShadow: `0 0 32px ${user.color}44`,
          }}>{user.avatar}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: darkMode ? "#f0f0f0" : "#1a1a1a" }}>
            {user.name}
          </div>
        </div>

        {/* Password */}
        {user.password ? (
          <>
            <div style={{
              marginBottom: error ? 8 : 16, position: "relative",
              animation: shake ? "sf-shake 0.4s ease" : "none",
            }}>
              <style>{`@keyframes sf-shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}`}</style>
              <input
                autoFocus
                type={showPass ? "text" : "password"}
                placeholder="รหัสผ่าน"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(""); }}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                style={{
                  width: "100%", padding: "14px 50px 14px 16px",
                  borderRadius: 14, border: `1.5px solid ${error ? "#D85A30" : (darkMode ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)")}`,
                  background: darkMode ? "rgba(255,255,255,0.05)" : "#fff",
                  color: darkMode ? "#f0f0f0" : "#1a1a1a",
                  fontSize: 16, outline: "none", boxSizing: "border-box",
                  transition: "border-color 0.2s",
                }}
              />
              <button onClick={() => setShowPass(p => !p)} style={{
                position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", fontSize: 18, color: darkMode ? "#555" : "#aaa",
              }}>{showPass ? "🙈" : "👁"}</button>
            </div>
            {error && (
              <div style={{ color: "#D85A30", fontSize: 13, marginBottom: 14, textAlign: "center" }}>
                ⚠️ {error}
              </div>
            )}
          </>
        ) : (
          <div style={{
            textAlign: "center", fontSize: 13, color: darkMode ? "#555" : "#aaa",
            marginBottom: 20, padding: "10px", borderRadius: 10,
            background: darkMode ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
          }}>
            บัญชีนี้ไม่มีรหัสผ่าน กดเข้าสู่ระบบได้เลย
          </div>
        )}

        <button onClick={handleLogin} style={{
          width: "100%", padding: "15px",
          borderRadius: 14, border: "none",
          background: user.color, color: "#fff",
          fontSize: 16, fontWeight: 700, cursor: "pointer",
          boxShadow: `0 4px 16px ${user.color}55`,
          transition: "opacity 0.15s",
        }}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
          onMouseLeave={e => e.currentTarget.style.opacity = "1"}
        >
          เข้าสู่ระบบ
        </button>
      </div>
    </AuthBg>
  );
}

function AddUserScreen({ darkMode, onAdd, onBack }) {
  const [name, setName]           = useState("");
  const [avatar, setAvatar]       = useState("👩‍💼");
  const [color, setColor]         = useState("#378ADD");
  const [password, setPassword]   = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError]         = useState("");

  function handleAdd() {
    if (!name.trim()) { setError("กรุณาใส่ชื่อผู้ใช้"); return; }
    if (password && password !== confirmPw) { setError("รหัสผ่านไม่ตรงกัน"); return; }
    const newUser = { id: Date.now().toString(), name: name.trim(), avatar, color, password };
    const updated = [...getStoredUsers(), newUser];
    localStorage.setItem(USERS_KEY, JSON.stringify(updated));
    onAdd(newUser);
  }

  const inputStyle = {
    width: "100%", padding: "12px 14px", borderRadius: 12, marginBottom: 10,
    border: `1.5px solid ${darkMode ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
    background: darkMode ? "rgba(255,255,255,0.05)" : "#fff",
    color: darkMode ? "#f0f0f0" : "#1a1a1a",
    fontSize: 15, outline: "none", boxSizing: "border-box",
    fontFamily: "'Sarabun','Noto Sans Thai',sans-serif",
  };

  return (
    <AuthBg darkMode={darkMode}>
      <div style={{ width: "100%", maxWidth: 360, maxHeight: "90vh", overflowY: "auto" }}>
        <button onClick={onBack} style={{
          background: "none", border: "none", cursor: "pointer",
          color: darkMode ? "#666" : "#aaa", fontSize: 13, marginBottom: 24,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ fontSize: 16 }}>‹</span> กลับ
        </button>

        <div style={{ fontSize: 20, fontWeight: 700, color: darkMode ? "#f0f0f0" : "#1a1a1a", marginBottom: 24 }}>
          สร้างบัญชีผู้ใช้ใหม่
        </div>

        {/* Avatar preview */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{
            width: 80, height: 80, borderRadius: "50%",
            background: color + "22", border: `3px solid ${color}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 36, margin: "0 auto",
            boxShadow: `0 0 20px ${color}44`,
          }}>{avatar}</div>
        </div>

        {/* Avatar picker */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: darkMode ? "#888" : "#999", marginBottom: 8 }}>เลือก Avatar</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {AVATAR_OPTIONS.map(a => (
              <button key={a} onClick={() => setAvatar(a)} style={{
                width: 40, height: 40, borderRadius: 10, fontSize: 20, cursor: "pointer",
                border: `2px solid ${a === avatar ? color : "transparent"}`,
                background: a === avatar ? color + "22" : (darkMode ? "rgba(255,255,255,0.05)" : "#f2f2f2"),
              }}>{a}</button>
            ))}
          </div>
        </div>

        {/* Color picker */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: darkMode ? "#888" : "#999", marginBottom: 8 }}>เลือกสีธีม</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {COLOR_OPTIONS.map(c => (
              <button key={c} onClick={() => setColor(c)} style={{
                width: 32, height: 32, borderRadius: "50%", background: c, cursor: "pointer",
                border: `3px solid ${c === color ? "#fff" : "transparent"}`,
                outline: c === color ? `2px solid ${c}` : "none",
                transition: "transform 0.15s", transform: c === color ? "scale(1.2)" : "none",
              }} />
            ))}
          </div>
        </div>

        <input value={name} onChange={e => { setName(e.target.value); setError(""); }}
          placeholder="ชื่อผู้ใช้ *" style={inputStyle} autoFocus />
        <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(""); }}
          placeholder="รหัสผ่าน (ไม่บังคับ)" style={inputStyle} />
        <input type="password" value={confirmPw} onChange={e => { setConfirmPw(e.target.value); setError(""); }}
          placeholder="ยืนยันรหัสผ่าน" style={{ ...inputStyle, marginBottom: 16 }} />

        {error && <div style={{ color: "#D85A30", fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}

        <button onClick={handleAdd} style={{
          width: "100%", padding: "14px", borderRadius: 14, border: "none",
          background: color, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer",
          boxShadow: `0 4px 16px ${color}55`,
        }}>สร้างบัญชี</button>
      </div>
    </AuthBg>
  );
}

function EditProfileScreen({ user, darkMode, onSave, onBack }) {
  const [name, setName]           = useState(user.name);
  const [avatar, setAvatar]       = useState(user.avatar);
  const [color, setColor]         = useState(user.color);
  const [newPw, setNewPw]         = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError]         = useState("");
  const [saved, setSaved]         = useState(false);

  function handleSave() {
    if (!name.trim()) { setError("กรุณาใส่ชื่อ"); return; }
    if (newPw && newPw !== confirmPw) { setError("รหัสผ่านไม่ตรงกัน"); return; }
    const updatedUser = {
      ...user,
      name: name.trim(),
      avatar,
      color,
      password: newPw || user.password,
    };
    const users = getStoredUsers().map(u => u.id === user.id ? updatedUser : u);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    setSaved(true);
    setTimeout(() => onSave(updatedUser), 600);
  }

  const inputStyle = {
    width: "100%", padding: "12px 14px", borderRadius: 12, marginBottom: 10,
    border: `1.5px solid ${darkMode ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
    background: darkMode ? "rgba(255,255,255,0.05)" : "#fff",
    color: darkMode ? "#f0f0f0" : "#1a1a1a",
    fontSize: 15, outline: "none", boxSizing: "border-box",
    fontFamily: "'Sarabun','Noto Sans Thai',sans-serif",
  };

  return (
    <AuthBg darkMode={darkMode}>
      <div style={{ width: "100%", maxWidth: 360, maxHeight: "90vh", overflowY: "auto" }}>
        <button onClick={onBack} style={{
          background: "none", border: "none", cursor: "pointer",
          color: darkMode ? "#666" : "#aaa", fontSize: 13, marginBottom: 20,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ fontSize: 16 }}>‹</span> กลับ
        </button>

        <div style={{ fontSize: 20, fontWeight: 700, color: darkMode ? "#f0f0f0" : "#1a1a1a", marginBottom: 20 }}>
          แก้ไขโปรไฟล์
        </div>

        {/* Avatar preview */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{
            width: 80, height: 80, borderRadius: "50%",
            background: color + "22", border: `3px solid ${color}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 36, margin: "0 auto",
            boxShadow: `0 0 20px ${color}44`,
          }}>{avatar}</div>
        </div>

        {/* Avatar picker */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: darkMode ? "#888" : "#999", marginBottom: 8 }}>Avatar</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {AVATAR_OPTIONS.map(a => (
              <button key={a} onClick={() => setAvatar(a)} style={{
                width: 40, height: 40, borderRadius: 10, fontSize: 20, cursor: "pointer",
                border: `2px solid ${a === avatar ? color : "transparent"}`,
                background: a === avatar ? color + "22" : (darkMode ? "rgba(255,255,255,0.05)" : "#f2f2f2"),
              }}>{a}</button>
            ))}
          </div>
        </div>

        {/* Color picker */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: darkMode ? "#888" : "#999", marginBottom: 8 }}>สีธีม</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {COLOR_OPTIONS.map(c => (
              <button key={c} onClick={() => setColor(c)} style={{
                width: 32, height: 32, borderRadius: "50%", background: c, cursor: "pointer",
                border: `3px solid ${c === color ? "#fff" : "transparent"}`,
                outline: c === color ? `2px solid ${c}` : "none",
                transition: "transform 0.15s", transform: c === color ? "scale(1.2)" : "none",
              }} />
            ))}
          </div>
        </div>

        {/* Name */}
        <div style={{ fontSize: 12, color: darkMode ? "#888" : "#999", marginBottom: 6 }}>ชื่อผู้ใช้</div>
        <input value={name} onChange={e => { setName(e.target.value); setError(""); }}
          placeholder="ชื่อผู้ใช้ *" style={inputStyle} />

        {/* Password section */}
        <div style={{ fontSize: 12, color: darkMode ? "#888" : "#999", margin: "6px 0" }}>
          เปลี่ยนรหัสผ่าน <span style={{ color: darkMode ? "#555" : "#bbb" }}>(เว้นว่างเพื่อคงเดิม)</span>
        </div>
        <input type="password" value={newPw} onChange={e => { setNewPw(e.target.value); setError(""); }}
          placeholder="รหัสผ่านใหม่" style={inputStyle} />
        <input type="password" value={confirmPw} onChange={e => { setConfirmPw(e.target.value); setError(""); }}
          placeholder="ยืนยันรหัสผ่านใหม่" style={{ ...inputStyle, marginBottom: 16 }} />

        {error && <div style={{ color: "#D85A30", fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}

        <button onClick={handleSave} style={{
          width: "100%", padding: "14px", borderRadius: 14, border: "none",
          background: saved ? "#1D9E75" : color, color: "#fff",
          fontSize: 16, fontWeight: 700, cursor: "pointer",
          boxShadow: `0 4px 16px ${color}55`,
          transition: "background 0.3s",
        }}>
          {saved ? "✓ บันทึกแล้ว!" : "บันทึก"}
        </button>

        {/* Delete account */}
        <div style={{ marginTop: 32, borderTop: `1px solid ${darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, paddingTop: 20 }}>
          <div style={{ fontSize: 12, color: darkMode ? "#555" : "#bbb", marginBottom: 10, textAlign: "center" }}>
            Danger Zone
          </div>
          <DeleteAccountButton user={user} darkMode={darkMode} onDeleted={onBack} />
        </div>
      </div>
    </AuthBg>
  );
}

function DeleteAccountButton({ user, darkMode, onDeleted }) {
  const [step, setStep] = useState(0); // 0=idle 1=confirm 2=typing
  const [input, setInput] = useState("");
  const isMatch = input.trim().toLowerCase() === user.name.toLowerCase();

  function doDelete() {
    // ลบ user จาก list
    const users = getStoredUsers().filter(u => u.id !== user.id);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    // ลบข้อมูลทั้งหมดของ user นี้
    [
      userStorageKey(user.id),
      `sf_bonus_${user.id}`,
      `sf_annual_${user.id}`,
      `sf_taxded_${user.id}`,
      SETTINGS_KEY(user.id),
      `sf_holdings_${user.id}`,
    ].forEach(k => localStorage.removeItem(k));
    sessionStorage.removeItem("sf_session");
    onDeleted();
  }

  if (step === 0) return (
    <button onClick={() => setStep(1)} style={{
      width: "100%", padding: "12px", borderRadius: 12, border: "1.5px solid #D85A30",
      background: "transparent", color: "#D85A30", fontSize: 14, fontWeight: 600, cursor: "pointer",
    }}>
      🗑 ลบบัญชีนี้
    </button>
  );

  if (step === 1) return (
    <div style={{
      background: darkMode ? "rgba(216,90,48,0.1)" : "#FFF1EE",
      border: "1.5px solid #D85A30", borderRadius: 12, padding: 16,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#D85A30", marginBottom: 6 }}>⚠️ ยืนยันการลบบัญชี</div>
      <div style={{ fontSize: 12, color: darkMode ? "#aaa" : "#666", lineHeight: 1.6, marginBottom: 14 }}>
        การลบบัญชี <strong>{user.name}</strong> จะลบข้อมูลทั้งหมด<br />
        รายรับ-รายจ่าย, การออม, ภาษี และการตั้งค่า<br />
        <strong>ไม่สามารถกู้คืนได้</strong>
      </div>
      <div style={{ fontSize: 12, color: darkMode ? "#888" : "#999", marginBottom: 6 }}>
        พิมพ์ชื่อ <strong style={{ color: "#D85A30" }}>{user.name}</strong> เพื่อยืนยัน
      </div>
      <input
        autoFocus
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder={user.name}
        style={{
          width: "100%", padding: "10px 12px", borderRadius: 10, marginBottom: 10,
          border: `1.5px solid ${isMatch ? "#D85A30" : (darkMode ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)")}`,
          background: darkMode ? "rgba(255,255,255,0.05)" : "#fff",
          color: darkMode ? "#f0f0f0" : "#1a1a1a",
          fontSize: 14, outline: "none", boxSizing: "border-box",
          fontFamily: "'Sarabun','Noto Sans Thai',sans-serif",
        }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => { setStep(0); setInput(""); }} style={{
          flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border)",
          background: "transparent", color: "var(--text2)", fontSize: 13, cursor: "pointer",
        }}>ยกเลิก</button>
        <button onClick={doDelete} disabled={!isMatch} style={{
          flex: 1, padding: "10px", borderRadius: 10, border: "none",
          background: isMatch ? "#D85A30" : (darkMode ? "#333" : "#ddd"),
          color: isMatch ? "#fff" : (darkMode ? "#555" : "#aaa"),
          fontSize: 13, fontWeight: 700, cursor: isMatch ? "pointer" : "default",
          transition: "all 0.2s",
        }}>ลบบัญชี</button>
      </div>
    </div>
  );
}

// ─── Export / Import helpers ────────────────────────────────
function exportUserData(user, months, bonusData, annualExp, taxDeductions, settings) {
  const payload = {
    exportedAt: new Date().toISOString(),
    exportedBy: user.name,
    version: "1.0",
    user: { id: user.id, name: user.name, avatar: user.avatar, color: user.color },
    months,
    bonusData,
    annualExp,
    taxDeductions,
    settings,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `MyFinance_${user.name}_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Settings Tab ──────────────────────────────────────────
function SettingsTab({ settings, onChange, onExport, onImport }) {
  function set(key, val) { onChange({ ...settings, [key]: val }); }

  const Section = ({ title, children }) => (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)", marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );

  const Row = ({ label, note, children }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ flex: 1, paddingRight: 12 }}>
        <div style={{ fontSize: 13, color: "var(--text2)" }}>{label}</div>
        {note && <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 1 }}>{note}</div>}
      </div>
      {children}
    </div>
  );

  const NumInput = ({ field, min = 0, step = 1 }) => (
    <input type="number" min={min} step={step} value={settings[field] ?? 0}
      onChange={e => set(field, +e.target.value || 0)}
      style={{ width: 100, textAlign: "right", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 8px", fontSize: 13, color: "var(--text1)" }} />
  );

  const hourlyRateCalc = settings.workingDaysPerMonth > 0 && settings.workingHoursPerDay > 0
    ? `ตัวหาร = ${settings.workingDaysPerMonth} × ${settings.workingHoursPerDay} = ${settings.workingDaysPerMonth * settings.workingHoursPerDay} ชม./เดือน`
    : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      <Section title="⏰ รอบการตัดเงินเดือน">
        <Row label="วันตัดรอบ OT" note="ระบบนับ OT ตั้งแต่วันนี้ของเดือนก่อน ถึงวันนี้ของเดือนปัจจุบัน">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <NumInput field="otCutoffDay" min={1} />
            <span style={{ fontSize: 12, color: "var(--text3)" }}>ของเดือน</span>
          </div>
        </Row>
        <Row label="วันตัดรอบวันลา" note="วันที่นับวันลาของรอบนั้น">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => set("leaveCutoffEOM", true)} style={{
              padding: "5px 12px", borderRadius: 16, border: `1.5px solid ${settings.leaveCutoffEOM ? "#378ADD" : "var(--border)"}`,
              background: settings.leaveCutoffEOM ? "#E6F1FB" : "transparent",
              color: settings.leaveCutoffEOM ? "#185FA5" : "var(--text2)", fontSize: 12, cursor: "pointer",
            }}>สิ้นเดือน</button>
            <button onClick={() => set("leaveCutoffEOM", false)} style={{
              padding: "5px 12px", borderRadius: 16, border: `1.5px solid ${!settings.leaveCutoffEOM ? "#378ADD" : "var(--border)"}`,
              background: !settings.leaveCutoffEOM ? "#E6F1FB" : "transparent",
              color: !settings.leaveCutoffEOM ? "#185FA5" : "var(--text2)", fontSize: 12, cursor: "pointer",
            }}>ตาม OT</button>
          </div>
        </Row>
      </Section>

      <Section title="💰 ค่าตอบแทนรายวัน">
        <Row label="ค่าข้าว / วันทำงานปกติ (฿)" note="ใช้เป็นค่า default ของเดือนใหม่">
          <NumInput field="mealRatePerDay" />
        </Row>
        <Row label="ค่าข้าวเพิ่ม / วันที่ทำ OT (฿)" note="วันที่ log OT ไว้ จะได้ค่าข้าวเพิ่มอีก">
          <NumInput field="mealRateOT" />
        </Row>
        <Row label="ค่าเดินทาง / วันทำงาน (฿)" note="ถ้าได้ทุกวันทำงาน">
          <NumInput field="travelPerDay" />
        </Row>
        <Row label="เบี้ยขยัน / เดือน (฿)" note="ได้เต็มถ้าไม่มีลาป่วย/ลากิจ">
          <NumInput field="diligenceBonus" />
        </Row>
      </Section>

      <Section title="📐 ตัวหารอัตราค่าแรง OT">
        <Row label="วันทำงาน / เดือน" note="ตัวเลขสำหรับหาร (เช่น 30 วัน)">
          <NumInput field="workingDaysPerMonth" min={1} />
        </Row>
        <Row label="ชั่วโมงทำงาน / วัน" note="เช่น 8 หรือ 9 ชม./วัน">
          <NumInput field="workingHoursPerDay" min={1} />
        </Row>
        {hourlyRateCalc && (
          <div style={{ padding: "10px 0 4px", fontSize: 12, color: "var(--text3)" }}>
            💡 {hourlyRateCalc}
            <br />อัตรา OT x1 = เงินเดือน ÷ {settings.workingDaysPerMonth * settings.workingHoursPerDay} ชม.
          </div>
        )}
      </Section>

      <div style={{ background: "#E6F7F2", border: "1px solid #1D9E75", borderRadius: 10, padding: "10px 14px" }}>
        <div style={{ fontSize: 12, color: "#0F6E56", fontWeight: 500, marginBottom: 4 }}>💡 การใช้งาน</div>
        <div style={{ fontSize: 12, color: "#1D9E75", lineHeight: 1.7 }}>
          • ตั้งค่าที่นี่จะกลายเป็น default ของเดือนใหม่ที่เพิ่ม<br />
          • สามารถแก้ไขค่า mealRate และ เบี้ยขยัน เป็นรายเดือนได้ในแท็บปฏิทิน<br />
          • ตัวหารชั่วโมงใช้คำนวณ hourlyRate อ้างอิง เท่านั้น (ยังแก้ใน payslip ได้)
        </div>
      </div>

      {/* Export / Import */}
      <DataBackupSection onExport={onExport} onImport={onImport} />
    </div>
  );
}

function DataBackupSection({ onExport, onImport }) {
  const fileRef = useRef(null);
  const [status, setStatus] = useState(null); // null | "ok" | "err"
  const [errMsg, setErrMsg] = useState("");

  function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.months || !Array.isArray(data.months)) throw new Error("ไฟล์ไม่ถูกต้อง");
        onImport(data);
        setStatus("ok");
        // Reload page so all state picks up new data from localStorage
        setTimeout(() => window.location.reload(), 1200);
      } catch (err) {
        setErrMsg(err.message || "ไฟล์ไม่ถูกต้อง");
        setStatus("err");
        setTimeout(() => setStatus(null), 4000);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)", marginBottom: 4 }}>💾 สำรอง & กู้คืนข้อมูล</div>
      <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 14, lineHeight: 1.6 }}>
        Export ข้อมูลทั้งหมดเป็นไฟล์ .json เพื่อสำรองหรือย้ายไปเครื่องอื่น<br />
        Import ไฟล์กลับมาเพื่อกู้คืนข้อมูล
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onExport} style={{
          flex: 1, padding: "11px", borderRadius: 10, border: "1.5px solid #378ADD",
          background: "#E6F1FB", color: "#185FA5", fontSize: 13, fontWeight: 600, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}>
          ⬇️ Export
        </button>
        <button onClick={() => fileRef.current?.click()} style={{
          flex: 1, padding: "11px", borderRadius: 10, border: "1.5px solid #1D9E75",
          background: "#E6F7F2", color: "#0F6E56", fontSize: 13, fontWeight: 600, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}>
          ⬆️ Import
        </button>
        <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImportFile} />
      </div>

      {status === "ok" && (
        <div style={{ marginTop: 10, padding: "8px 12px", background: "#E6F7F2", borderRadius: 8, fontSize: 12, color: "#0F6E56", fontWeight: 500 }}>
          ✅ Import สำเร็จ! ข้อมูลถูกกู้คืนแล้ว
        </div>
      )}
      {status === "err" && (
        <div style={{ marginTop: 10, padding: "8px 12px", background: "#FDEEE9", borderRadius: 8, fontSize: 12, color: "#D85A30", fontWeight: 500 }}>
          ⚠️ {errMsg}
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 11, color: "var(--text3)", lineHeight: 1.6 }}>
        📌 ไฟล์ Export จะมีข้อมูลทั้งหมด: เงินเดือน, โบนัส, รายจ่ายประจำปี, ลดหย่อนภาษี และการตั้งค่า
      </div>
    </div>
  );
}


function MainApp({ user, darkMode, setDarkMode, onLogout, onEditProfile }) {
  const storageKey    = userStorageKey(user.id);
  const bonusKey      = `sf_bonus_${user.id}`;
  const annualKey     = `sf_annual_${user.id}`;
  const taxDedKey     = `sf_taxded_${user.id}`;

  const [activeTab, setActiveTab] = useState("dashboard");
  const [months, setMonths] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (!saved || !saved.length) return [];
      // Migrate old data: เพิ่ม year: 2026 ถ้ายังไม่มี
      return saved.map(m => ({ year: 2026, ...m }));
    } catch { return []; }
  });

  // Year support
  const allYears = [...new Set(months.map(m => m.year || 2026))].sort((a,b) => a - b);
  const [selectedYear, setSelectedYear] = useState(() => {
    const cur = new Date().getFullYear();
    return allYears.length ? allYears[allYears.length - 1] : cur;
  });
  const yearMonths = months.filter(m => (m.year || 2026) === selectedYear);
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(
    yearMonths.length ? yearMonths[yearMonths.length - 1].monthIdx : 0
  );
  const currentMonth = yearMonths.find(m => m.monthIdx === selectedMonthIdx) || null;

  const [liveData, setLiveData] = useState({ lastUpdated: null });
  const [adding, setAdding] = useState(false);
  const [addingYear, setAddingYear] = useState(false);
  const [settings, setSettings] = useState(() => loadSettings(user.id));
  const [bonusData, setBonusData] = useState(() => {
    try { return JSON.parse(localStorage.getItem(bonusKey) || "{}"); } catch { return {}; }
  });
  const [annualExp, setAnnualExp] = useState(() => {
    try { return JSON.parse(localStorage.getItem(annualKey) || "{}"); } catch { return {}; }
  });
  const [taxDeductions, setTaxDeductions] = useState(() => {
    try { return JSON.parse(localStorage.getItem(taxDedKey) || "{}"); } catch { return {}; }
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(months));
  }, [months, storageKey]);
  useEffect(() => { localStorage.setItem(bonusKey,  JSON.stringify(bonusData));  }, [bonusData,  bonusKey]);
  useEffect(() => { localStorage.setItem(annualKey, JSON.stringify(annualExp)); },  [annualExp, annualKey]);
  useEffect(() => { localStorage.setItem(taxDedKey, JSON.stringify(taxDeductions)); }, [taxDeductions, taxDedKey]);
  useEffect(() => { localStorage.setItem(SETTINGS_KEY(user.id), JSON.stringify(settings)); }, [settings, user.id]);

  function addMonth(monthIdx) {
    const exists = months.find(m => (m.year || 2026) === selectedYear && m.monthIdx === monthIdx);
    if (exists) { setSelectedMonthIdx(monthIdx); setAdding(false); return; }
    const newM = defaultMonth(monthIdx, selectedYear, settings);
    const next = [...months, newM].sort((a, b) => (a.year - b.year) || (a.monthIdx - b.monthIdx));
    setMonths(next);
    setSelectedMonthIdx(monthIdx);
    setAdding(false);
  }

  function addYear(year) {
    if (allYears.includes(year)) { setSelectedYear(year); setAddingYear(false); return; }
    setSelectedYear(year);
    setSelectedMonthIdx(0);
    setAddingYear(false);
  }

  function updateMonth(updated) {
    setMonths(months.map(m =>
      (m.year || 2026) === (updated.year || 2026) && m.monthIdx === updated.monthIdx ? updated : m
    ));
  }

  function deleteMonth() {
    if (!window.confirm("ลบข้อมูลเดือนนี้?")) return;
    const next = months.filter(m => !((m.year || 2026) === selectedYear && m.monthIdx === selectedMonthIdx));
    setMonths(next);
    const rem = next.filter(m => (m.year || 2026) === selectedYear);
    setSelectedMonthIdx(rem.length ? rem[rem.length - 1].monthIdx : 0);
  }

  const refreshLive = useCallback(async () => {
    setLiveData(prev => ({ ...prev, loading: true }));
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{
            role: "user",
            content: `Search for current prices and return ONLY a JSON object (no markdown, no extra text) with this exact structure:
{
  "sp500": { "nav": <SCB S&P500A or SCBS&P500A fund NAV in THB per unit as number>, "change": <1-day change % as number>, "source": "description" },
  "goldOrnament": { "sellPrice": <Thai gold ornament sell price per baht-weight in THB as number>, "change": <1-day change % as number>, "source": "description" },
  "goldBullion": { "sellPrice": <Thai gold bullion 96.5% sell price per baht-weight in THB as number>, "change": <1-day change % as number>, "source": "description" }
}
Search: "SCB S&P500A NAV today THB" and "ราคาทองคำวันนี้ ทองรูปพรรณ ทองแท่ง"
Use 0 for any price you can't find.`
          }]
        })
      });
      const data = await response.json();
      const text = data.content?.map(c => c.text || "").join("") || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setLiveData({ ...parsed, lastUpdated: Date.now(), loading: false });
      }
    } catch (e) {
      setLiveData(prev => ({ ...prev, loading: false, error: "โหลดไม่สำเร็จ" }));
    }
  }, []);

  const cssVars = darkMode ? {
    "--bg": "#0f0f0f", "--card-bg": "#1a1a1a", "--bg2": "#222",
    "--border": "rgba(255,255,255,0.1)", "--text1": "#f0f0f0", "--text2": "#aaa", "--text3": "#666",
    "--input-bg": "#111", "--nav-bg": "rgba(15,15,15,0.95)",
  } : {
    "--bg": "#f7f6f3", "--card-bg": "#ffffff", "--bg2": "#f4f4f1",
    "--border": "rgba(0,0,0,0.1)", "--text1": "#1a1a1a", "--text2": "#555", "--text3": "#999",
    "--input-bg": "#fafafa", "--nav-bg": "rgba(255,255,255,0.95)",
  };

  const monthSelectorTabs = ["bonus", "annual", "dashboard", "investments", "tax", "settings"];

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Sarabun', 'Noto Sans Thai', sans-serif; }
        input:focus, textarea:focus { outline: 2px solid #378ADD; outline-offset: 1px; }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.5; }
        .sf-root { display: flex; min-height: 100vh; background: var(--bg); color: var(--text1); }
        .sf-sidebar { display: none; }
        .sf-main { flex: 1; max-width: 480px; margin: 0 auto; padding-bottom: calc(80px + env(safe-area-inset-bottom)); }
        .sf-bottom-nav {
          position: fixed; bottom: 0; left: 50%; transform: translateX(-50%);
          width: 100%; max-width: 480px;
          background: var(--nav-bg);
          border-top: 1px solid var(--border);
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
          display: flex; justify-content: flex-start;
          overflow-x: auto; overflow-y: hidden;
          -webkit-overflow-scrolling: touch; scrollbar-width: none;
          padding-top: 5px;
          padding-bottom: max(8px, env(safe-area-inset-bottom));
          padding-left: 4px; padding-right: 4px;
          z-index: 100;
        }
        .sf-bottom-nav::-webkit-scrollbar { display: none; }
        .sf-nav-btn {
          background: none; border: none; cursor: pointer;
          display: flex; flex-direction: column; align-items: center; gap: 2px;
          padding: 3px 4px; min-width: 48px; min-height: 44px; justify-content: center;
          flex-shrink: 0;
          -webkit-tap-highlight-color: transparent;
        }
        .sf-dark-toggle-mobile { display: flex; }
        @media (min-width: 768px) {
          .sf-sidebar {
            display: flex; flex-direction: column; width: 220px;
            position: fixed; left: 0; top: 0; height: 100vh;
            border-right: 1px solid var(--border);
            background: var(--card-bg);
            overflow-y: auto; z-index: 50;
          }
          .sf-main { margin-left: 220px; max-width: none; padding-bottom: 40px; }
          .sf-main-inner { max-width: 680px; }
          .sf-bottom-nav { display: none !important; }
          .sf-dark-toggle-mobile { display: none; }
        }
      `}</style>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600&display=swap" rel="stylesheet" />
      <div className="sf-root" style={cssVars}>

        {/* ── Desktop Sidebar ── */}
        <nav className="sf-sidebar">
          <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border)", marginBottom: 8 }}>
            <button onClick={onEditProfile} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              background: "none", border: "none", cursor: "pointer", padding: "6px 8px", borderRadius: 10,
              textAlign: "left", transition: "background 0.15s",
            }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg2)"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}
            >
              <div style={{
                width: 40, height: 40, borderRadius: "50%",
                background: user.color + "22", border: `2.5px solid ${user.color}`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0,
              }}>{user.avatar}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.name}</div>
                <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 1 }}>✏️ แก้ไขโปรไฟล์</div>
              </div>
            </button>
          </div>
          <div style={{ flex: 1, padding: "4px 12px" }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 8, border: "none", cursor: "pointer", marginBottom: 2,
                background: activeTab === t.id ? "#E6F1FB" : "transparent",
                color: activeTab === t.id ? "#185FA5" : "var(--text2)",
                fontSize: 14, fontWeight: activeTab === t.id ? 600 : 400,
                textAlign: "left", transition: "background 0.15s",
              }}>
                <span style={{ fontSize: 18 }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 4 }}>
            <button onClick={() => setDarkMode(!darkMode)} style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 13, color: "var(--text2)", display: "flex", alignItems: "center", gap: 8,
              padding: "7px 8px", borderRadius: 8, width: "100%", textAlign: "left",
            }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg2)"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}
            >
              <span style={{ fontSize: 16 }}>{darkMode ? "☀️" : "🌙"}</span>
              {darkMode ? "โหมดกลางวัน" : "โหมดกลางคืน"}
            </button>
            <button onClick={onLogout} style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 13, color: "#D85A30", display: "flex", alignItems: "center", gap: 8,
              padding: "7px 8px", borderRadius: 8, width: "100%", textAlign: "left",
            }}
              onMouseEnter={e => e.currentTarget.style.background = "#D85A3011"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}
            >
              <span style={{ fontSize: 16 }}>🚪</span> ออกจากระบบ
            </button>
          </div>
        </nav>

        {/* ── Main Content ── */}
        <main className="sf-main">
          <div className="sf-main-inner">
            {/* Header */}
            <div style={{ padding: "14px 16px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button onClick={onEditProfile} style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left",
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: "50%",
                  background: user.color + "22", border: `2.5px solid ${user.color}`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0,
                }}>{user.avatar}</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text1)" }}>สวัสดี, {user.name} 👋</div>
                  <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 1 }}>แตะเพื่อแก้ไขโปรไฟล์</div>
                </div>
              </button>
              <div style={{ display: "flex", gap: 4 }}>
                <button className="sf-dark-toggle-mobile" onClick={() => setDarkMode(!darkMode)} style={{
                  background: "none", border: "none", fontSize: 20, cursor: "pointer",
                  minWidth: 40, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center",
                }}>{darkMode ? "☀️" : "🌙"}</button>
                <button className="sf-dark-toggle-mobile" onClick={onLogout} style={{
                  background: "none", border: "none", fontSize: 20, cursor: "pointer",
                  minWidth: 40, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center",
                }}>🚪</button>
              </div>
            </div>

            {/* Year + Month selector */}
            {!monthSelectorTabs.includes(activeTab) && (
              <div style={{ padding: "0 16px 10px" }}>

                {/* ── Year row ── */}
                <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, alignItems: "center" }}>
                  {allYears.map(y => (
                    <button key={y} onClick={() => { setSelectedYear(y); const ym = months.filter(m=>(m.year||2026)===y); setSelectedMonthIdx(ym.length ? ym[ym.length-1].monthIdx : 0); }} style={{
                      padding: "4px 14px", borderRadius: 16, border: "1px solid",
                      borderColor: y === selectedYear ? "#378ADD" : "var(--border)",
                      background: y === selectedYear ? "#378ADD" : "transparent",
                      color: y === selectedYear ? "#fff" : "var(--text2)",
                      fontSize: 13, fontWeight: y === selectedYear ? 700 : 400,
                      cursor: "pointer", flexShrink: 0, minHeight: 30,
                    }}>{y}</button>
                  ))}
                  <button onClick={() => setAddingYear(true)} style={{
                    padding: "4px 12px", borderRadius: 16, border: "1px dashed var(--border)",
                    background: "transparent", color: "var(--text3)", fontSize: 12, cursor: "pointer", flexShrink: 0
                  }}>+ ปีใหม่</button>
                </div>

                {addingYear && (
                  <div style={{ marginBottom: 8, background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 8 }}>เลือกปีที่ต้องการเพิ่ม</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {[2020,2021,2022,2023,2024,2025,2026,2027,2028].map(y => {
                        const exists = allYears.includes(y);
                        return (
                          <button key={y} onClick={() => addYear(y)} style={{
                            padding: "5px 14px", borderRadius: 14, border: "1px solid",
                            borderColor: exists ? "var(--border)" : "#378ADD",
                            background: exists ? "var(--bg2)" : "#E6F1FB",
                            color: exists ? "var(--text3)" : "#185FA5",
                            fontSize: 13, cursor: "pointer", fontWeight: exists ? 400 : 600
                          }}>{y}{exists ? " ✓" : ""}</button>
                        );
                      })}
                    </div>
                    <button onClick={() => setAddingYear(false)} style={{
                      marginTop: 8, fontSize: 11, color: "var(--text3)", background: "none", border: "none", cursor: "pointer"
                    }}>ยกเลิก</button>
                  </div>
                )}

                {/* ── Month row ── */}
                <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                  {yearMonths.map(m => (
                    <button key={m.monthIdx} onClick={() => setSelectedMonthIdx(m.monthIdx)} style={{
                      padding: "5px 13px", borderRadius: 20, border: "1px solid",
                      borderColor: m.monthIdx === selectedMonthIdx ? "#1D9E75" : "var(--border)",
                      background: m.monthIdx === selectedMonthIdx ? "#E6F7F2" : "transparent",
                      color: m.monthIdx === selectedMonthIdx ? "#0F6E56" : "var(--text2)",
                      fontSize: 12, whiteSpace: "nowrap", cursor: "pointer", flexShrink: 0, minHeight: 32,
                    }}>
                      {MONTHS[m.monthIdx]}
                    </button>
                  ))}
                  <button onClick={() => setAdding(true)} style={{
                    padding: "5px 12px", borderRadius: 20, border: "1px dashed var(--border)",
                    background: "transparent", color: "var(--text3)", fontSize: 12, cursor: "pointer", flexShrink: 0, minHeight: 32
                  }}>+ เดือน</button>
                </div>

                {adding && (
                  <div style={{ marginTop: 6, background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 8 }}>เพิ่มเดือนใน ปี {selectedYear}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {MONTHS.map((m, i) => {
                        const exists = yearMonths.some(mo => mo.monthIdx === i);
                        return (
                          <button key={i} onClick={() => addMonth(i)} style={{
                            padding: "5px 12px", borderRadius: 14, border: "1px solid",
                            borderColor: exists ? "var(--border)" : "#1D9E75",
                            background: exists ? "var(--bg2)" : "#E6F7F2",
                            color: exists ? "var(--text3)" : "#0F6E56",
                            fontSize: 12, cursor: "pointer", fontWeight: exists ? 400 : 600
                          }}>{m}{exists ? " ✓" : ""}</button>
                        );
                      })}
                    </div>
                    <button onClick={() => setAdding(false)} style={{
                      marginTop: 8, fontSize: 11, color: "var(--text3)", background: "none", border: "none", cursor: "pointer"
                    }}>ยกเลิก</button>
                  </div>
                )}

                {currentMonth && yearMonths.length > 1 && (
                  <div style={{ marginTop: 4, textAlign: "right" }}>
                    <button onClick={deleteMonth} style={{
                      fontSize: 11, color: "#D85A30", background: "none", border: "none", cursor: "pointer"
                    }}>🗑 ลบเดือนนี้</button>
                  </div>
                )}
              </div>
            )}

            {/* Content */}
            <div style={{ padding: "0 16px" }}>
              {activeTab === "dashboard"  && <Dashboard months={yearMonths} year={selectedYear} allYears={allYears} allMonths={months} />}
              {activeTab === "payslip"   && (currentMonth ? <PayslipTab month={currentMonth} onChange={updateMonth} bonusData={bonusData} /> : <EmptyState icon="📋" />)}
              {activeTab === "calendar"  && (currentMonth ? <WorkCalendarTab month={currentMonth} onChange={updateMonth} /> : <EmptyState icon="🗓" />)}
              {activeTab === "ot"        && (currentMonth ? <OTCalendarTab month={currentMonth} onChange={updateMonth} /> : <EmptyState icon="⏰" />)}
              {activeTab === "expenses" && (currentMonth ? <ExpensesTab month={currentMonth} onChange={updateMonth} /> : <EmptyState icon="🧾" />)}
              {activeTab === "savings" && (currentMonth ? <SavingsTab month={currentMonth} onChange={updateMonth} /> : <EmptyState icon="🏦" />)}
              {activeTab === "investments" && <InvestmentsTab liveData={liveData} refreshLive={refreshLive} />}
              {activeTab === "tax"         && <TaxTab months={yearMonths} taxDeductions={taxDeductions} onChangeTaxDeductions={setTaxDeductions} />}
              {activeTab === "bonus"       && <BonusTab bonusData={bonusData} onChange={setBonusData} />}
              {activeTab === "annual"      && <AnnualExpensesTab annualExp={annualExp} onChange={setAnnualExp} />}
              {activeTab === "settings"    && <SettingsTab
                settings={settings}
                onChange={setSettings}
                onExport={() => exportUserData(user, months, bonusData, annualExp, taxDeductions, settings)}
                onImport={(data) => {
                  if (data.months)       { setMonths(data.months); localStorage.setItem(storageKey, JSON.stringify(data.months)); }
                  if (data.bonusData)    { setBonusData(data.bonusData); localStorage.setItem(bonusKey, JSON.stringify(data.bonusData)); }
                  if (data.annualExp)    { setAnnualExp(data.annualExp); localStorage.setItem(annualKey, JSON.stringify(data.annualExp)); }
                  if (data.taxDeductions){ setTaxDeductions(data.taxDeductions); localStorage.setItem(taxDedKey, JSON.stringify(data.taxDeductions)); }
                  if (data.settings)     { setSettings(data.settings); localStorage.setItem(SETTINGS_KEY(user.id), JSON.stringify(data.settings)); }
                }}
              />}
            </div>
          </div>
        </main>

        {/* ── Bottom Nav (mobile only) ── */}
        <nav className="sf-bottom-nav">
          {TABS.map(t => (
            <button key={t.id} className="sf-nav-btn" onClick={() => setActiveTab(t.id)}>
              <span style={{ fontSize: 22 }}>{t.icon}</span>
              <span style={{
                fontSize: 9, fontWeight: activeTab === t.id ? 600 : 400,
                color: activeTab === t.id ? "#378ADD" : "var(--text3)"
              }}>{t.label}</span>
            </button>
          ))}
        </nav>

      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────
//  AUTH WRAPPER  (default export)
// ─────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen]           = useState("users"); // "users"|"login"|"addUser"|"app"|"editProfile"
  const [loginTarget, setLoginTarget] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [darkMode, setDarkMode]       = useState(false);

  // Restore session
  useEffect(() => {
    try {
      const sess = sessionStorage.getItem("sf_session");
      if (sess) { const u = JSON.parse(sess); setCurrentUser(u); setScreen("app"); }
    } catch {}
  }, []);

  function handleSelectUser(u) { setLoginTarget(u); setScreen("login"); }

  function handleLogin(u) {
    sessionStorage.setItem("sf_session", JSON.stringify(u));
    setCurrentUser(u);
    setScreen("app");
  }

  function handleLogout() {
    sessionStorage.removeItem("sf_session");
    setCurrentUser(null);
    setLoginTarget(null);
    setScreen("users");
  }

  function handleSaveProfile(updatedUser) {
    sessionStorage.setItem("sf_session", JSON.stringify(updatedUser));
    setCurrentUser(updatedUser);
    setScreen("app");
  }

  return (
    <>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; } body { font-family: 'Sarabun','Noto Sans Thai',sans-serif; }`}</style>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600&display=swap" rel="stylesheet" />
      {screen === "users"       && <UserSelectScreen  darkMode={darkMode} onSelect={handleSelectUser} onAddUser={() => setScreen("addUser")} />}
      {screen === "login"       && <LoginScreen        user={loginTarget}  darkMode={darkMode} onLogin={handleLogin} onBack={() => setScreen("users")} />}
      {screen === "addUser"     && <AddUserScreen      darkMode={darkMode} onAdd={u => { setLoginTarget(u); setScreen("login"); }} onBack={() => setScreen("users")} />}
      {screen === "editProfile" && <EditProfileScreen  user={currentUser}  darkMode={darkMode} onSave={handleSaveProfile} onBack={() => setScreen("app")} />}
      {screen === "app"         && (
        <MainApp
          user={currentUser}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          onLogout={handleLogout}
          onEditProfile={() => setScreen("editProfile")}
        />
      )}
    </>
  );
}
