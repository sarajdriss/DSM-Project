/* DSM Project — app.js (v5.2)
   LAST UPDATE APPLIED (per your latest Index/CSS):

   SECURITY:
   - Day + Night headcount (night priced same as day; no night premium)
   - Overtime premium: +25% ONLY (no 50% anywhere)
   - Overtime condition: ONLY hours above 48 hours/week
   - Weekly table generated like your Excel:
       - input: secWorkDaysPerMonth (e.g. 23)
       - input: secWorkDaysPerWeek (e.g. 5)
       - input: secPaidHoursPerDay (e.g. 10 includes break)
     => distributes month days into weeks: 5,5,5,5,3 and computes OT per week.

   CLEANING:
   - Headcount-based pricing (no overtime computed in this version)
   - Keeps "planned hours" display for information only.

   SUMMARY (right panel):
   - Security Team monthly
   - Cleaning Team monthly
   - Cleaning consumables monthly
   - OPEX total + annual
   - CAPEX panel toggled by button
*/

const DEFAULTS = {
  // Payroll
  smig: 17.92,
  empDedRate: 6.74,
  employerRate: 21.09,

  // Capacity/planning reference (used for cleaning cost + “1 agent/month cost” display)
  legalMonthlyHours: 191,

  // Replacement coefficient
  replacementEnabled: true,
  replacement: 8.50,

  // Replacement components (auto-calc)
  annualLeaveDaysPerYear: 18,
  publicHolidaysDaysPerYear: 13,
  weeklyRestDaysPerYear: 52,
  sickAbsenceBufferPercent: 2.0,

  // OT premium (fixed by client code: +25%) — keep input for display
  otDayPremium: 25,

  // SECURITY inputs (weekly OT model)
  secDayAgents: 5,
  secNightAgents: 2,
  secPaidHoursPerDay: 10,     // 10h paid/day incl break
  secWorkDaysPerMonth: 23,    // e.g. 23
  secWorkDaysPerWeek: 5,      // e.g. 5
  secPaidHoursPerShift: 10,   // info only (exists in Definitions)

  // CLEANING inputs (headcount-based)
  clnAgents: 5,
  clnNightAgents: 0,          // informational only
  clnHoursPerDay: 8,          // info only
  clnDaysPerMonth: 22,        // info only

  // CAPEX & OPEX
  secPpeCapex: 6090,
  clnPpeCapex: 3600,
  equipCapex: 29000,
  clnProducts: 3040,
  otherFixed: 0,
  includeCapex: true
};

const STORAGE_PREFIX = "DSM_";
const WEEKLY_LIMIT_HOURS = 48;   // OT starts above this
const OT_PREMIUM = 0.25;         // +25% only

function $(id){ return document.getElementById(id); }
function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }

function moneyMAD(n, decimals = 0) {
  return new Intl.NumberFormat("fr-MA", {
    style: "currency",
    currency: "MAD",
    maximumFractionDigits: decimals
  }).format(isFinite(n) ? n : 0);
}

function readNum(id) {
  const e = $(id);
  if (!e) return DEFAULTS[id] ?? 0;
  const v = parseFloat(e.value);
  return Number.isFinite(v) ? v : (DEFAULTS[id] ?? 0);
}

function readBool(id) {
  const e = $(id);
  if (!e) return !!DEFAULTS[id];
  return !!e.checked;
}

function setText(id, value) {
  const e = $(id);
  if (e) e.textContent = value;
}

function saveAll() {
  Object.keys(DEFAULTS).forEach(id => {
    const e = $(id);
    if (!e) return;
    const key = STORAGE_PREFIX + id;
    if (e.type === "checkbox") localStorage.setItem(key, e.checked ? "true" : "false");
    else localStorage.setItem(key, e.value);
  });
}

function loadSaved() {
  Object.keys(DEFAULTS).forEach(id => {
    const e = $(id);
    if (!e) return;
    const key = STORAGE_PREFIX + id;
    const saved = localStorage.getItem(key);
    if (saved === null) return;
    if (e.type === "checkbox") e.checked = (saved === "true");
    else e.value = saved;
  });
}

function resetDefaults() {
  Object.keys(DEFAULTS).forEach(id => {
    const e = $(id);
    if (!e) return;
    if (e.type === "checkbox") e.checked = !!DEFAULTS[id];
    else e.value = DEFAULTS[id];
    localStorage.removeItem(STORAGE_PREFIX + id);
  });
  calc();
}

function computeReplacementPercentFromComponents() {
  const annualLeave = readNum("annualLeaveDaysPerYear");
  const holidays = readNum("publicHolidaysDaysPerYear");
  const weeklyRest = readNum("weeklyRestDaysPerYear");
  const sickBuffer = readNum("sickAbsenceBufferPercent") / 100;

  const workableDays = Math.max(1, 365 - weeklyRest);
  const paidAbsenceDays = Math.max(0, annualLeave + holidays);
  const availableDays = Math.max(1, workableDays - paidAbsenceDays);

  const replFromDays = paidAbsenceDays / availableDays;
  const replTotal = replFromDays + sickBuffer;

  return replTotal * 100;
}

function setDonut(sec, cln, other) {
  const total = sec + cln + other;
  const s1 = total > 0 ? (sec / total) : 0;
  const s2 = total > 0 ? (cln / total) : 0;

  const p1 = (s1 * 100).toFixed(2) + "%";
  const p2 = ((s1 + s2) * 100).toFixed(2) + "%";

  const d = $("donut");
  if (d) {
    d.style.setProperty("--p1", p1);
    d.style.setProperty("--p2", p2);
  }
}

/* Build weeks like 23 days with 5/week => 5,5,5,5,3 */
function splitDaysIntoWeeks(totalDays, daysPerWeek) {
  const weeks = [];
  let remaining = Math.max(0, Math.floor(totalDays));
  const cap = Math.max(1, Math.floor(daysPerWeek));

  while (remaining > 0) {
    const w = Math.min(cap, remaining);
    weeks.push(w);
    remaining -= w;
    if (weeks.length > 6) break; // safety
  }
  if (weeks.length === 0) weeks.push(0);
  return weeks;
}

function renderSecurityScheduleTable(weeks, paidHoursPerDay) {
  const container = $("secScheduleTable");
  if (!container) return null;

  const headers = weeks.map((_, i) => `Week ${i + 1}`);
  const weekHours = weeks.map(d => d * paidHoursPerDay);
  const weekRegular = weekHours.map(h => Math.min(h, WEEKLY_LIMIT_HOURS));
  const weekOT = weekHours.map(h => Math.max(0, h - WEEKLY_LIMIT_HOURS));

  const sum = arr => arr.reduce((a, b) => a + b, 0);
  const totalDays = sum(weeks);
  const totalHours = sum(weekHours);
  const totalReg = sum(weekRegular);
  const totalOt = sum(weekOT);

  const th = (t) => `<th>${t}</th>`;
  const td = (t) => `<td>${t}</td>`;

  container.innerHTML = `
    <table class="schedTable">
      <thead>
        <tr>
          <th></th>
          ${headers.map(th).join("")}
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="left">Work days</td>
          ${weeks.map(d => td(`<span class="schedBadge">${d}</span>`)).join("")}
          ${td(`<span class="schedBadge">${totalDays}</span>`)}
        </tr>
        <tr>
          <td class="left">Hours (paid)</td>
          ${weekHours.map(h => td(h.toFixed(0))).join("")}
          ${td(`<strong>${totalHours.toFixed(0)}</strong>`)}
        </tr>
        <tr>
          <td class="left">Standard (≤ ${WEEKLY_LIMIT_HOURS}h/week)</td>
          ${weekRegular.map(h => td(h.toFixed(0))).join("")}
          ${td(`<strong>${totalReg.toFixed(0)}</strong>`)}
        </tr>
        <tr>
          <td class="left">Overtime (> ${WEEKLY_LIMIT_HOURS}h/week)</td>
          ${weekOT.map(h => td(h.toFixed(0))).join("")}
          ${td(`<strong>${totalOt.toFixed(0)}</strong>`)}
        </tr>
      </tbody>
    </table>
  `;

  return { totalDays, totalHours, totalReg, totalOt };
}

function syncCleaningNightMax() {
  const clnAgents = Math.max(0, Math.round(readNum("clnAgents")));
  const clnNightEl = $("clnNightAgents");
  if (clnNightEl) clnNightEl.max = String(clnAgents);
}

function calc() {
  syncCleaningNightMax();

  // Replacement computed display (if present)
  const replComputed = computeReplacementPercentFromComponents();
  setText("replacementComputedDisplay", `${replComputed.toFixed(2)}%`);

  // Payroll
  const smig = readNum("smig");
  const empDedRate = readNum("empDedRate") / 100;
  const employerRate = readNum("employerRate") / 100;
  const legalMonthlyHours = readNum("legalMonthlyHours");

  const replacementEnabled = readBool("replacementEnabled");
  const replacementPercent = readNum("replacement") / 100;

  const netHourly = smig * (1 - empDedRate);
  const employerHourly = smig * (1 + employerRate);
  const chargeableHourly = replacementEnabled ? employerHourly * (1 + replacementPercent) : employerHourly;

  // OT hourly fixed at +25%
  const overtimeHourly = chargeableHourly * (1 + OT_PREMIUM);

  // Metrics (existence-safe)
  setText("netHourly", moneyMAD(netHourly, 2));
  setText("employerHourly", moneyMAD(employerHourly, 2));
  setText("chargeableHourly", moneyMAD(chargeableHourly, 2));
  setText("otDayHourly", moneyMAD(overtimeHourly, 2));
  setText("otNightHourly", moneyMAD(overtimeHourly, 2)); // if exists, same as day (no 50%)
  setText("oneAgentMonthlyCost", moneyMAD(legalMonthlyHours * chargeableHourly, 0));

  // =========================
  // SECURITY — weekly OT model
  // =========================
  const secDay = Math.max(0, Math.round(readNum("secDayAgents")));
  const secNight = Math.max(0, Math.round(readNum("secNightAgents")));
  const secTotalAgents = secDay + secNight;

  setText("secDayAgentsVal", secDay);
  setText("secNightAgentsVal", secNight);
  setText("secAgentsVal", secTotalAgents);

  const paidHoursPerDay = readNum("secPaidHoursPerDay");           // e.g., 10
  const workDaysPerMonth = Math.max(0, Math.round(readNum("secWorkDaysPerMonth"))); // e.g., 23
  const workDaysPerWeek = Math.max(1, Math.round(readNum("secWorkDaysPerWeek")));   // e.g., 5

  setText("secPaidHoursOut", paidHoursPerDay.toFixed(0));
  setText("secWorkDaysOut", `${workDaysPerMonth} days`);

  const weeks = splitDaysIntoWeeks(workDaysPerMonth, workDaysPerWeek);
  const totals = renderSecurityScheduleTable(weeks, paidHoursPerDay) || { totalDays:0, totalHours:0, totalReg:0, totalOt:0 };

  // per agent
  setText("secAgentTotalHours", `${totals.totalHours.toFixed(0)} h`);
  setText("secAgentOtHours", `${totals.totalOt.toFixed(0)} h`);

  // team totals
  const teamRegularHours = secTotalAgents * totals.totalReg;
  const teamOtHours = secTotalAgents * totals.totalOt;

  const secCostRegular = teamRegularHours * chargeableHourly;
  const secCostOT = teamOtHours * overtimeHourly;
  const secTeamMonthly = secCostRegular + secCostOT;

  setText(
    "secOtAlert",
    `Security OT rule: > ${WEEKLY_LIMIT_HOURS}h/week, OT premium +25% only. `
    + `Per-agent OT: ${totals.totalOt.toFixed(0)}h/month. Team OT: ${teamOtHours.toFixed(0)}h/month. `
    + `Night priced same as day (Primak rule).`
  );

  // =========================
  // CLEANING — headcount based (no OT here)
  // =========================
  const clnAgents = Math.max(0, Math.round(readNum("clnAgents")));
  let clnNightAgents = Math.round(readNum("clnNightAgents"));
  clnNightAgents = clamp(clnNightAgents, 0, clnAgents);
  if ($("clnNightAgents")) $("clnNightAgents").value = String(clnNightAgents);

  const clnDayAgents = clnAgents - clnNightAgents;
  setText("clnAgentsVal", clnAgents);
  setText("clnNightAgentsVal", clnNightAgents);
  setText("clnDayAgentsOut", `${clnDayAgents} day`);

  // planning info only
  const clnHoursPerDay = readNum("clnHoursPerDay");
  const clnDaysPerMonth = readNum("clnDaysPerMonth");
  setText("clnReqHours", `${Math.round(clnAgents * clnHoursPerDay * clnDaysPerMonth)} h`);

  const clnTeamMonthly = clnAgents * legalMonthlyHours * chargeableHourly;
  setText("clnOtAlert", "Cleaning: headcount-based pricing (no overtime computed in this version).");

  // =========================
  // OPEX / CAPEX
  // =========================
  const clnProducts = readNum("clnProducts");
  const otherFixed = readNum("otherFixed");

  const secPpeCapex = readNum("secPpeCapex");
  const clnPpeCapex = readNum("clnPpeCapex");
  const equipCapex = readNum("equipCapex");
  const includeCapex = readBool("includeCapex");

  const capexTotal = secPpeCapex + clnPpeCapex + equipCapex;
  const opexOther = clnProducts + otherFixed;

  const opexTotal = secTeamMonthly + clnTeamMonthly + opexOther;
  const opexAnnual = opexTotal * 12;
  const month1Total = includeCapex ? (opexTotal + capexTotal) : opexTotal;

  // HERO KPIs
  setText("kpiOpexMonthly", moneyMAD(opexTotal, 0));
  setText("kpiMonth1", moneyMAD(month1Total, 0));

  // Right summary (new IDs)
  setText("secTeamMonthly", moneyMAD(secTeamMonthly, 0));
  setText("secTeamInfo", `Day: ${secDay} | Night: ${secNight} | Total: ${secTotalAgents}`);

  setText("clnTeamMonthly", moneyMAD(clnTeamMonthly, 0));
  setText("clnTeamInfo", `Total: ${clnAgents} | Night/Evening: ${clnNightAgents}`);

  setText("clnConsumablesMonthly", moneyMAD(clnProducts, 0));
  setText("opexTotal", moneyMAD(opexTotal, 0));
  setText("opexAnnual", `Annual OPEX (NET): ${moneyMAD(opexAnnual, 0)}`);

  // CAPEX panel IDs
  setText("capexSec", moneyMAD(secPpeCapex, 0));
  setText("capexCln", moneyMAD(clnPpeCapex, 0));
  setText("capexEq", moneyMAD(equipCapex, 0));
  setText("capexTotal", moneyMAD(capexTotal, 0));
  setText("month1Total", moneyMAD(month1Total, 0));
  setText("capexIncludedText", includeCapex ? "Yes" : "No");

  // Backward compatibility IDs (if still present somewhere)
  setText("secTotal", moneyMAD(secTeamMonthly, 0));
  setText("clnTotal", moneyMAD(clnTeamMonthly, 0));
  setText("consumables", moneyMAD(clnProducts, 0));
  setText("otherFixedOut", moneyMAD(otherFixed, 0));
  setText("opexOther", moneyMAD(opexOther, 0));

  // Donut (optional)
  setDonut(secTeamMonthly, clnTeamMonthly, opexOther);

  saveAll();
}

function bind() {
  // any input change triggers calc
  document.addEventListener("input", (e) => {
    if (e.target && e.target.matches("input")) calc();
  });
  document.addEventListener("change", (e) => {
    if (e.target && e.target.matches("input")) calc();
  });

  // Replacement auto-calc button
  const replBtn = $("replacementAutoBtn");
  if (replBtn) {
    replBtn.addEventListener("click", () => {
      const repl = computeReplacementPercentFromComponents();
      const replRounded = Math.round(repl * 100) / 100;

      if ($("replacement")) $("replacement").value = String(replRounded);
      if ($("replacementEnabled")) $("replacementEnabled").checked = true;

      calc();
    });
  }

  // CAPEX toggle button
  const capexBtn = $("toggleCapexBtn");
  const capexPanel = $("capexPanel");
  if (capexBtn && capexPanel) {
    capexBtn.addEventListener("click", () => {
      capexPanel.classList.toggle("hidden");
      capexBtn.textContent = capexPanel.classList.contains("hidden")
        ? "Show PPE & Equipment (CAPEX)"
        : "Hide PPE & Equipment (CAPEX)";
    });
  }

  // Print
  const printBtn = $("printBtn");
  if (printBtn) printBtn.addEventListener("click", () => window.print());

  // Reset
  const resetBtn = $("resetBtn");
  if (resetBtn) resetBtn.addEventListener("click", resetDefaults);
}

window.addEventListener("DOMContentLoaded", () => {
  loadSaved();
  bind();
  calc();
});
