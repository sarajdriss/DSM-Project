/* DSM Project — app.js (v4.9)
   UPDATED per your rules (Primak client code):

   1) Security Day vs Night agents:
      - SAME cost basis (night agent is priced like day agent).
      - No night premium on normal hours.

   2) Overtime:
      - OT premium is ALWAYS +25% (1.25 multiplier).
      - OT applies ONLY to hours above 48 hours/week.
      - This is implemented by converting the 48h/week threshold into a monthly threshold:
          monthlyLimit = 48 * (52/12) ≈ 208 hours/month per agent
      - Any planned monthly hours per agent above this threshold are priced at OT rate.

   3) Pricing method (headcount-based for both Security & Cleaning):
      - Team monthly = Σ(regular hours × rate) + Σ(OT hours × rate × 1.25)
      - Planned monthly hours per agent = the input "legalMonthlyHours"
        (you can set it to match your planning; e.g., if 10h/day × 5 days/week => ~216.7h/month)

   Compatibility:
   - Works with your current index.html IDs (secTotal/clnTotal/opexOther/etc).
   - Also writes the newer IDs if they exist (secTeamMonthly/clnTeamMonthly/etc).
*/

const DEFAULTS = {
  // Payroll
  smig: 17.92,
  empDedRate: 6.74,        // employee CNSS+AMO (deduction)
  employerRate: 21.09,     // employer patronal

  // IMPORTANT:
  // In this version, "legalMonthlyHours" is used as the PLANNED paid hours per agent per month.
  // OT is computed only if this exceeds the 48h/week threshold converted to monthly.
  legalMonthlyHours: 191,

  // Replacement coefficient toggle + value
  replacementEnabled: true,
  replacement: 8.50,

  // Replacement components (for auto-calc)
  annualLeaveDaysPerYear: 18,
  publicHolidaysDaysPerYear: 13,
  weeklyRestDaysPerYear: 52,
  sickAbsenceBufferPercent: 2.0,

  // OT premium display inputs (kept in UI, but OT premium is forced to +25% by rule)
  otDayPremium: 25,
  otNightPremium: 50, // ignored for pricing (night treated as day)

  // SECURITY headcount
  secDayAgents: 5,
  secNightAgents: 2,
  secPaidHoursPerShift: 10, // info/explanation (8h work + 2h break)

  // CLEANING headcount (night allocation informational)
  clnAgents: 5,
  clnNightAgents: 0,
  clnHoursPerDay: 8,     // informational/planning only
  clnDaysPerMonth: 22,   // informational/planning only

  // CAPEX & OPEX
  secPpeCapex: 6090,
  clnPpeCapex: 3600,
  equipCapex: 29000,
  clnProducts: 3040,
  otherFixed: 0,
  includeCapex: true
};

const STORAGE_PREFIX = "DSM_";
const WEEKS_PER_MONTH = 52 / 12;     // ≈ 4.3333
const WEEKLY_OT_LIMIT = 48;          // per your rule
const OT_PREMIUM = 0.25;             // ALWAYS +25%

function $(id) { return document.getElementById(id); }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

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

/**
 * Computes regular vs overtime hours based on 48h/week rule.
 * plannedMonthlyHoursPerAgent: the planned paid hours per agent in the month (input legalMonthlyHours).
 */
function splitRegularOvertimeHours(plannedMonthlyHoursPerAgent) {
  const monthlyLimit = WEEKLY_OT_LIMIT * WEEKS_PER_MONTH; // ≈ 208h/month
  const regular = Math.max(0, Math.min(plannedMonthlyHoursPerAgent, monthlyLimit));
  const overtime = Math.max(0, plannedMonthlyHoursPerAgent - monthlyLimit);
  return { monthlyLimit, regular, overtime };
}

function calc() {
  // Replacement computed display (if present)
  const replComputed = computeReplacementPercentFromComponents();
  setText("replacementComputedDisplay", `${replComputed.toFixed(2)}%`);

  // Payroll
  const smig = readNum("smig");
  const empDedRate = readNum("empDedRate") / 100;
  const employerRate = readNum("employerRate") / 100;

  // Planned paid hours per agent per month (used for OT check)
  const plannedMonthlyHoursPerAgent = readNum("legalMonthlyHours");

  const replacementEnabled = readBool("replacementEnabled");
  const replacementPercent = readNum("replacement") / 100;

  // OT premium fixed by rule
  const otMultiplier = 1 + OT_PREMIUM;

  // Hourly rates
  const netHourly = smig * (1 - empDedRate);
  const employerHourly = smig * (1 + employerRate);

  const chargeableHourly = replacementEnabled
    ? employerHourly * (1 + replacementPercent)
    : employerHourly;

  // OT hourly shown (forced +25% rule)
  const overtimeHourly = chargeableHourly * otMultiplier;

  // Update payroll metrics (if present on page)
  setText("netHourly", moneyMAD(netHourly, 2));
  setText("employerHourly", moneyMAD(employerHourly, 2));
  setText("chargeableHourly", moneyMAD(chargeableHourly, 2));
  setText("otDayHourly", moneyMAD(overtimeHourly, 2));
  setText("otNightHourly", moneyMAD(overtimeHourly, 2)); // same as day by rule
  setText("oneAgentMonthlyCost", moneyMAD(plannedMonthlyHoursPerAgent * chargeableHourly, 0)); // planned (before OT split)

  // ==========
  // SECURITY
  // ==========
  const secDay = Math.max(0, Math.round(readNum("secDayAgents")));
  const secNight = Math.max(0, Math.round(readNum("secNightAgents")));
  const secTotalAgents = secDay + secNight;

  setText("secDayAgentsVal", secDay);
  setText("secNightAgentsVal", secNight);
  setText("secAgentsVal", secTotalAgents);

  // Split regular/OT hours per agent based on 48h/week rule
  const split = splitRegularOvertimeHours(plannedMonthlyHoursPerAgent);
  const regularHoursTeamSec = secTotalAgents * split.regular;
  const overtimeHoursTeamSec = secTotalAgents * split.overtime;

  // Security monthly cost (night = day)
  const secCostNormal = regularHoursTeamSec * chargeableHourly;
  const secCostOT = overtimeHoursTeamSec * overtimeHourly;
  const secTotal = secCostNormal + secCostOT;

  // Capacity display (uses planned monthly hours, not legal cap)
  if ($("secCapacity")) {
    $("secCapacity").textContent = `${Math.round(secTotalAgents * plannedMonthlyHoursPerAgent)} h`;
  }

  const secPaidHoursPerShift = readNum("secPaidHoursPerShift");
  const impliedWeekly = plannedMonthlyHoursPerAgent / WEEKS_PER_MONTH;
  const eqShiftsPerAgent = secPaidHoursPerShift > 0 ? (plannedMonthlyHoursPerAgent / secPaidHoursPerShift) : 0;

  setText(
    "secOtAlert",
    `Security pricing rule: Night = Day (no premium). OT +25% applies only above 48h/week. `
    + `Planned hours/agent/month = ${plannedMonthlyHoursPerAgent.toFixed(1)}h ⇒ ~${impliedWeekly.toFixed(1)}h/week. `
    + `OT threshold ≈ ${split.monthlyLimit.toFixed(1)}h/month. `
    + `Per-agent OT ≈ ${split.overtime.toFixed(1)}h/month. `
    + `Equiv. shifts/agent ≈ ${eqShiftsPerAgent.toFixed(1)} (at ${secPaidHoursPerShift}h/shift).`
  );

  // ==========
  // CLEANING (same pricing method: headcount-based + OT only if >48h/week)
  // ==========
  const clnAgents = Math.max(0, Math.round(readNum("clnAgents")));
  let clnNightAgents = Math.round(readNum("clnNightAgents"));
  clnNightAgents = clamp(clnNightAgents, 0, clnAgents);
  if ($("clnNightAgents")) $("clnNightAgents").value = String(clnNightAgents);

  const clnDayAgents = clnAgents - clnNightAgents;

  setText("clnAgentsVal", clnAgents);
  setText("clnNightAgentsVal", clnNightAgents);
  setText("clnDayAgentsOut", `${clnDayAgents} day`);

  // planned-hours display (informational only)
  const clnHoursPerDay = readNum("clnHoursPerDay");
  const clnDaysPerMonth = readNum("clnDaysPerMonth");
  const clnPlannedHoursInfo = clnAgents * clnHoursPerDay * clnDaysPerMonth;
  setText("clnReqHours", `${Math.round(clnPlannedHoursInfo)} h`);

  const regularHoursTeamCln = clnAgents * split.regular;
  const overtimeHoursTeamCln = clnAgents * split.overtime;

  const clnCostNormal = regularHoursTeamCln * chargeableHourly;
  const clnCostOT = overtimeHoursTeamCln * overtimeHourly;
  const clnTotal = clnCostNormal + clnCostOT;

  setText(
    "clnOtAlert",
    `Cleaning pricing rule: OT +25% applies only above 48h/week. `
    + `Using planned hours/agent/month = ${plannedMonthlyHoursPerAgent.toFixed(1)}h (same basis as Security).`
  );

  // ==========
  // OPEX & CAPEX
  // ==========
  const clnProducts = readNum("clnProducts"); // monthly consumables
  const otherFixed = readNum("otherFixed");

  const secPpeCapex = readNum("secPpeCapex");
  const clnPpeCapex = readNum("clnPpeCapex");
  const equipCapex = readNum("equipCapex");
  const includeCapex = readBool("includeCapex");

  const capexTotal = secPpeCapex + clnPpeCapex + equipCapex;

  const opexOther = clnProducts + otherFixed;
  const opexTotal = secTotal + clnTotal + opexOther;
  const opexAnnual = opexTotal * 12;

  const month1Total = includeCapex ? (opexTotal + capexTotal) : opexTotal;

  // HERO KPI
  setText("kpiOpexMonthly", moneyMAD(opexTotal, 0));
  setText("kpiMonth1", moneyMAD(month1Total, 0));

  // ===== Summary outputs (support both summary layouts) =====
  // Old summary IDs
  setText("secTotal", moneyMAD(secTotal, 0));
  setText("clnTotal", moneyMAD(clnTotal, 0));
  setText("opexOther", moneyMAD(opexOther, 0));
  setText("opexTotal", moneyMAD(opexTotal, 0));
  setText("opexAnnual", `Annual OPEX (NET): ${moneyMAD(opexAnnual, 0)}`);

  // If you use the simplified summary IDs (new layout)
  setText("secTeamMonthly", moneyMAD(secTotal, 0));
  setText("secTeamInfo", `Day: ${secDay} | Night: ${secNight} | Total: ${secTotalAgents}`);
  setText("clnTeamMonthly", moneyMAD(clnTotal, 0));
  setText("clnTeamInfo", `Total: ${clnAgents} | Night/Evening: ${clnNightAgents}`);
  setText("clnConsumablesMonthly", moneyMAD(clnProducts, 0));

  // Detail lines (if present)
  setText("secDetailLine", `Normal: ${moneyMAD(secCostNormal,0)} | OT (+25%): ${moneyMAD(secCostOT,0)}`);
  setText("clnDetailLine", `Normal: ${moneyMAD(clnCostNormal,0)} | OT (+25%): ${moneyMAD(clnCostOT,0)}`);

  // CAPEX outputs
  setText("capexSec", moneyMAD(secPpeCapex, 0));
  setText("capexCln", moneyMAD(clnPpeCapex, 0));
  setText("capexEq", moneyMAD(equipCapex, 0));
  setText("capexTotal", moneyMAD(capexTotal, 0));
  setText("month1Total", moneyMAD(month1Total, 0));
  setText("capexIncludedText", includeCapex ? "Yes" : "No");

  // Old detail table IDs (if present)
  setText("secCostNormal", moneyMAD(secCostNormal, 0));
  setText("secCostOtDay", moneyMAD(secCostOT, 0));
  setText("secCostOtNight", moneyMAD(0, 0)); // not used (night=day; OT not split by time)

  setText("clnCostNormal", moneyMAD(clnCostNormal, 0));
  setText("clnCostOtDay", moneyMAD(clnCostOT, 0));
  setText("clnCostOtNight", moneyMAD(0, 0)); // not split by time

  setText("consumables", moneyMAD(clnProducts, 0));
  setText("otherFixedOut", moneyMAD(otherFixed, 0));

  // Donut (if exists)
  setDonut(secTotal, clnTotal, opexOther);

  // Optional CAPEX panel IDs (if using simplified summary)
  setText("capexExplainTotal", moneyMAD(capexTotal, 0));
  setText("opexExplainMonthly", moneyMAD(opexTotal, 0));
  setText("opexExplainAnnual", moneyMAD(opexAnnual, 0));
  setText("month1ExplainTotal", moneyMAD(month1Total, 0));

  saveAll();
}

function bind() {
  // Any input change triggers calc
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

  // CAPEX toggle button (if using simplified summary)
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
