/* DSM Project — app.js (v4.5)
   SECURITY is now HEADCOUNT-based only:
   - Inputs: secDayAgents + secNightAgents
   - Total security = day + night
   - Security monthly cost = total × legalMonthlyHours × chargeableHourly
   - No security overtime computation (since no coverage/required hours model)

   Cleaning kept as planned-hours coverage model (agents × hours/day × days/month),
   with OT if required hours exceed capacity (day/night split).
*/

const DEFAULTS = {
  // Payroll
  smig: 17.92,
  empDedRate: 6.74,        // employee CNSS+AMO (deduction)
  employerRate: 21.09,     // employer patronal
  legalMonthlyHours: 191,

  // Replacement coefficient toggle + value
  replacementEnabled: true,
  replacement: 8.50,

  // Replacement components (for auto-calc)
  annualLeaveDaysPerYear: 18,
  publicHolidaysDaysPerYear: 13,
  weeklyRestDaysPerYear: 52,
  sickAbsenceBufferPercent: 2.0,

  // Overtime premiums (used for CLEANING OT only in this version)
  otDayPremium: 25,
  otNightPremium: 50,

  // Day/Night definition used to split cleaning required hours (by night staffing ratio)
  nightHoursPerDay: 12,

  // SECURITY (headcount input only)
  secDayAgents: 5,
  secNightAgents: 2,
  secPaidHoursPerShift: 10, // info only

  // CLEANING (planned-hours model)
  clnHoursPerDay: 8,
  clnDaysPerMonth: 22,
  clnAgents: 5,
  clnNightAgents: 0,

  // CAPEX & OPEX
  secPpeCapex: 6090,
  clnPpeCapex: 3600,
  equipCapex: 29000,
  clnProducts: 3040,
  otherFixed: 0,
  includeCapex: true
};

const STORAGE_PREFIX = "DSM_";

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

function computeLaborCostCoverage({ reqDay, reqNight, dayAgents, nightAgents, legalMonthlyHours, rateNormal, rateOtDay, rateOtNight }) {
  const capDay = dayAgents * legalMonthlyHours;
  const capNight = nightAgents * legalMonthlyHours;

  const normalDay = Math.min(reqDay, capDay);
  const normalNight = Math.min(reqNight, capNight);

  const otDay = Math.max(0, reqDay - capDay);
  const otNight = Math.max(0, reqNight - capNight);

  const costNormal = (normalDay + normalNight) * rateNormal;
  const costOtDay = otDay * rateOtDay;
  const costOtNight = otNight * rateOtNight;

  return {
    capDay, capNight,
    otDayHours: otDay,
    otNightHours: otNight,
    costNormal,
    costOtDay,
    costOtNight,
    totalCost: costNormal + costOtDay + costOtNight
  };
}

function calc() {
  // Replacement computed display (if present)
  const replComputed = computeReplacementPercentFromComponents();
  setText("replacementComputedDisplay", `${replComputed.toFixed(2)}%`);

  // Payroll & rates
  const smig = readNum("smig");
  const empDedRate = readNum("empDedRate") / 100;
  const employerRate = readNum("employerRate") / 100;
  const legalMonthlyHours = readNum("legalMonthlyHours");

  const replacementEnabled = readBool("replacementEnabled");
  const replacementPercent = readNum("replacement") / 100;

  const otDayPremium = readNum("otDayPremium") / 100;
  const otNightPremium = readNum("otNightPremium") / 100;

  const netHourly = smig * (1 - empDedRate);
  const employerHourly = smig * (1 + employerRate);

  const chargeableHourly = replacementEnabled
    ? employerHourly * (1 + replacementPercent)
    : employerHourly;

  const otDayHourly = chargeableHourly * (1 + otDayPremium);
  const otNightHourly = chargeableHourly * (1 + otNightPremium);

  setText("netHourly", moneyMAD(netHourly, 2));
  setText("employerHourly", moneyMAD(employerHourly, 2));
  setText("chargeableHourly", moneyMAD(chargeableHourly, 2));
  setText("otDayHourly", moneyMAD(otDayHourly, 2));
  setText("otNightHourly", moneyMAD(otNightHourly, 2));
  setText("oneAgentMonthlyCost", moneyMAD(legalMonthlyHours * chargeableHourly, 0));

  // SECURITY (headcount-only)
  const secDay = Math.round(readNum("secDayAgents"));
  const secNight = Math.round(readNum("secNightAgents"));
  const secTotalAgents = Math.max(0, secDay + secNight);

  setText("secDayAgentsVal", secDay);
  setText("secNightAgentsVal", secNight);
  setText("secAgentsVal", secTotalAgents);
  setText("secCapacity", `${Math.round(secTotalAgents * legalMonthlyHours)} h`);

  // Security monthly labor cost (NO OT)
  const secCostNormal = secTotalAgents * legalMonthlyHours * chargeableHourly;
  const secRes = { costNormal: secCostNormal, costOtDay: 0, costOtNight: 0, otDayHours: 0, otNightHours: 0, totalCost: secCostNormal };

  setText("secOtAlert", "Headcount-based security pricing: overtime is not computed (no coverage/required-hours model).");

  // CLEANING (planned-hours model + OT if needed)
  const clnHoursPerDay = readNum("clnHoursPerDay");
  const clnDaysPerMonth = readNum("clnDaysPerMonth");
  const clnAgents = Math.round(readNum("clnAgents"));

  let clnNightAgents = Math.round(readNum("clnNightAgents"));
  clnNightAgents = clamp(clnNightAgents, 0, clnAgents);
  if ($("clnNightAgents")) $("clnNightAgents").value = String(clnNightAgents);

  const clnDayAgents = clnAgents - clnNightAgents;

  setText("clnAgentsVal", clnAgents);
  setText("clnNightAgentsVal", clnNightAgents);
  setText("clnDayAgentsOut", `${clnDayAgents} day`);

  const clnReqTotal = clnAgents * clnHoursPerDay * clnDaysPerMonth;
  setText("clnReqHours", `${Math.round(clnReqTotal)} h`);

  // Split cleaning required hours by night staffing ratio
  const clnReqNight = (clnAgents > 0) ? (clnReqTotal * (clnNightAgents / clnAgents)) : 0;
  const clnReqDay = clnReqTotal - clnReqNight;

  const clnRes = computeLaborCostCoverage({
    reqDay: clnReqDay,
    reqNight: clnReqNight,
    dayAgents: clnDayAgents,
    nightAgents: clnNightAgents,
    legalMonthlyHours,
    rateNormal: chargeableHourly,
    rateOtDay: otDayHourly,
    rateOtNight: otNightHourly
  });

  const clnShort = clnRes.otDayHours + clnRes.otNightHours;
  setText(
    "clnOtAlert",
    clnShort > 0
      ? `Cleaning OT required: ${Math.round(clnShort)} h (Day: ${Math.round(clnRes.otDayHours)} h | Night: ${Math.round(clnRes.otNightHours)} h).`
      : `Cleaning staffing OK: no overtime required (planned-hours model).`
  );

  // OPEX & CAPEX
  const clnProducts = readNum("clnProducts");
  const otherFixed = readNum("otherFixed");

  const secPpeCapex = readNum("secPpeCapex");
  const clnPpeCapex = readNum("clnPpeCapex");
  const equipCapex = readNum("equipCapex");
  const includeCapex = readBool("includeCapex");

  const capexTotal = secPpeCapex + clnPpeCapex + equipCapex;

  const secTotal = secRes.totalCost;
  const clnTotal = clnRes.totalCost;
  const opexOther = clnProducts + otherFixed;

  const opexTotal = secTotal + clnTotal + opexOther;
  const opexAnnual = opexTotal * 12;
  const month1Total = includeCapex ? (opexTotal + capexTotal) : opexTotal;

  // Summary outputs
  setText("secTotal", moneyMAD(secTotal, 0));
  setText("clnTotal", moneyMAD(clnTotal, 0));
  setText("opexOther", moneyMAD(opexOther, 0));
  setText("opexTotal", moneyMAD(opexTotal, 0));
  setText("opexAnnual", `Annual OPEX (NET): ${moneyMAD(opexAnnual, 0)}`);

  setText("secDetailLine", `Normal: ${moneyMAD(secRes.costNormal,0)} | OT day: ${moneyMAD(0,0)} | OT night: ${moneyMAD(0,0)}`);
  setText("clnDetailLine", `Normal: ${moneyMAD(clnRes.costNormal,0)} | OT day: ${moneyMAD(clnRes.costOtDay,0)} | OT night: ${moneyMAD(clnRes.costOtNight,0)}`);

  setText("kpiOpexMonthly", moneyMAD(opexTotal, 0));
  setText("kpiMonth1", moneyMAD(month1Total, 0));

  setText("capexSec", moneyMAD(secPpeCapex, 0));
  setText("capexCln", moneyMAD(clnPpeCapex, 0));
  setText("capexEq", moneyMAD(equipCapex, 0));
  setText("capexTotal", moneyMAD(capexTotal, 0));
  setText("month1Total", moneyMAD(month1Total, 0));
  setText("capexIncludedText", includeCapex ? "Yes" : "No");

  setText("secCostNormal", moneyMAD(secRes.costNormal, 0));
  setText("secCostOtDay", moneyMAD(0, 0));
  setText("secCostOtNight", moneyMAD(0, 0));

  setText("clnCostNormal", moneyMAD(clnRes.costNormal, 0));
  setText("clnCostOtDay", moneyMAD(clnRes.costOtDay, 0));
  setText("clnCostOtNight", moneyMAD(clnRes.costOtNight, 0));

  setText("consumables", moneyMAD(clnProducts, 0));
  setText("otherFixedOut", moneyMAD(otherFixed, 0));

  setText("opexExplainMonthly", moneyMAD(opexTotal, 0));
  setText("opexExplainAnnual", moneyMAD(opexAnnual, 0));
  setText("capexExplainTotal", moneyMAD(capexTotal, 0));
  setText("month1ExplainTotal", moneyMAD(month1Total, 0));

  setDonut(secTotal, clnTotal, opexOther);

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

  // Replacement auto-calc button (if present)
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

  // CAPEX/OPEX explanation toggle (if present)
  const toggleBtn = $("toggleBreakdownBtn");
  const breakdown = $("breakdown");
  if (toggleBtn && breakdown) {
    toggleBtn.addEventListener("click", () => {
      breakdown.classList.toggle("hidden");
      toggleBtn.textContent = breakdown.classList.contains("hidden")
        ? "Show CAPEX & OPEX Explanation"
        : "Hide CAPEX & OPEX Explanation";
      if (!breakdown.classList.contains("hidden")) {
        breakdown.scrollIntoView({ behavior: "smooth", block: "start" });
      }
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
