/* DSM Project — app.js (v4.3)
   - Replacement coefficient: toggle + auto-calc from components (leave/holidays/rest/sick buffer)
   - Security: 24/7 posts => coverage hours + billable hours (2 shifts/day; paid hours per shift)
   - Linked sliders: night agents <= total agents; day = total - night
   - OPEX/CAPEX: NET totals (TVA exempt)
   - Robust recalculation: event delegation (any input change triggers calc)
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
  annualLeaveDaysPerYear: 18,        // 1.5 days/month worked ≈ 18/year
  publicHolidaysDaysPerYear: 13,     // typical paid public holidays
  weeklyRestDaysPerYear: 52,         // 1 day/week
  sickAbsenceBufferPercent: 2.0,     // buffer %

  // Day/Night & overtime
  nightHoursPerDay: 12,     // Security night shift 19:00–07:00 = 12h
  otDayPremium: 25,         // +25%
  otNightPremium: 50,       // +50% (editable)

  // Security
  daysInMonth: 30.33,
  secPosts: 2,
  autoSizeSecurity: true,
  secAgents: 8,
  secNightAgents: 4,
  secPaidHoursPerShift: 10, // 8h work + 2h break = 10h paid per 12h shift

  // Cleaning
  clnHoursPerDay: 8,        // paid/billable hours per agent/day
  clnDaysPerMonth: 22,
  clnAgents: 6,
  clnNightAgents: 0,        // evening/night allocation slider

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
  // Best practice approach:
  // - Weekly rest reduces the base "workable days" (denominator)
  // - Leave + holidays reduce availability within workable days
  // - Sickness handled as an extra % buffer
  const annualLeave = readNum("annualLeaveDaysPerYear");
  const holidays = readNum("publicHolidaysDaysPerYear");
  const weeklyRest = readNum("weeklyRestDaysPerYear");
  const sickBuffer = readNum("sickAbsenceBufferPercent") / 100;

  const workableDays = Math.max(1, 365 - weeklyRest); // e.g., 313
  const paidAbsenceDays = Math.max(0, annualLeave + holidays);

  // Availability days for working within workable days:
  const availableDays = Math.max(1, workableDays - paidAbsenceDays);

  // Replacement coefficient = absence / availability (+ sick buffer)
  const replFromDays = paidAbsenceDays / availableDays;
  const replTotal = replFromDays + sickBuffer;

  return replTotal * 100; // percent
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

function computeLaborCost({ reqDay, reqNight, dayAgents, nightAgents, legalMonthlyHours, rateNormal, rateOtDay, rateOtNight }) {
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

function syncNightAgentMax() {
  // Security night <= total
  const secAgents = Math.round(readNum("secAgents"));
  const secNightEl = $("secNightAgents");
  if (secNightEl) secNightEl.max = String(Math.max(0, secAgents));

  // Cleaning night <= total
  const clnAgents = Math.round(readNum("clnAgents"));
  const clnNightEl = $("clnNightAgents");
  if (clnNightEl) clnNightEl.max = String(Math.max(0, clnAgents));
}

function calc() {
  syncNightAgentMax();

  // --- Replacement computed display (always shown) ---
  const replComputed = computeReplacementPercentFromComponents();
  setText("replacementComputedDisplay", `${replComputed.toFixed(2)}%`);

  // --- Payroll & rates ---
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

  // --- Day/Night definition ---
  const nightHoursPerDay = clamp(readNum("nightHoursPerDay"), 0, 24);
  const dayHoursPerDay = 24 - nightHoursPerDay;

  // --- SECURITY ---
  const daysInMonth = readNum("daysInMonth");
  const secPosts = Math.round(readNum("secPosts"));
  const secPaidHoursPerShift = readNum("secPaidHoursPerShift"); // 10 (8 work + 2 break)
  const autoSizeSecurity = readBool("autoSizeSecurity");

  // Coverage hours (SLA presence) vs Billable/Paid hours (your costing basis)
  const secCoverageHours = secPosts * 24 * daysInMonth;
  const secBillableHours = secPosts * 2 * secPaidHoursPerShift * daysInMonth; // 2 shifts/day

  setText("secPostsVal", secPosts);
  setText("secCoverageHours", `${Math.round(secCoverageHours)} h`);
  setText("secBillableHours", `${Math.round(secBillableHours)} h`);

  // Auto-size security total agents based on billable hours
  if (autoSizeSecurity && $("secAgents")) {
    const currentTotal = Math.max(1, Math.round(readNum("secAgents")));
    const currentNight = Math.round(readNum("secNightAgents"));
    const nightShare = currentTotal > 0 ? (currentNight / currentTotal) : 0.5;

    const neededAgents = Math.max(1, Math.ceil(secBillableHours / Math.max(1, legalMonthlyHours)));
    $("secAgents").value = String(neededAgents);

    if ($("secNightAgents")) {
      const newNight = Math.round(neededAgents * nightShare);
      $("secNightAgents").value = String(clamp(newNight, 0, neededAgents));
    }
  }

  let secAgents = Math.round(readNum("secAgents"));
  let secNightAgents = Math.round(readNum("secNightAgents"));
  secNightAgents = clamp(secNightAgents, 0, secAgents);
  if ($("secNightAgents")) $("secNightAgents").value = String(secNightAgents);

  const secDayAgents = secAgents - secNightAgents;

  setText("secAgentsVal", secAgents);
  setText("secNightAgentsVal", secNightAgents);
  setText("secDayAgentsOut", `${secDayAgents} day`);
  setText("secCapacity", `${Math.round(secAgents * legalMonthlyHours)} h`);

  // Security required billable hours split into day/night using defined day/night hours
  // but since security has fixed 12/12 shifts, day/night split is ratio-based:
  const secReqNight = secBillableHours * (nightHoursPerDay / 24);
  const secReqDay = secBillableHours - secReqNight;

  const secRes = computeLaborCost({
    reqDay: secReqDay,
    reqNight: secReqNight,
    dayAgents: secDayAgents,
    nightAgents: secNightAgents,
    legalMonthlyHours,
    rateNormal: chargeableHourly,
    rateOtDay: otDayHourly,
    rateOtNight: otNightHourly
  });

  const secShort = secRes.otDayHours + secRes.otNightHours;
  setText(
    "secOtAlert",
    secShort > 0
      ? `Security OT required: ${Math.round(secShort)} h (Day: ${Math.round(secRes.otDayHours)} h | Night: ${Math.round(secRes.otNightHours)} h).`
      : `Security staffing OK: no overtime required (billable-hours basis).`
  );

  // --- CLEANING ---
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

  // Allocate cleaning required hours by staffing split (night/evening allocation)
  const clnReqNight = (clnAgents > 0) ? (clnReqTotal * (clnNightAgents / clnAgents)) : 0;
  const clnReqDay = clnReqTotal - clnReqNight;

  const clnRes = computeLaborCost({
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
      : `Cleaning staffing OK: no overtime required.`
  );

  // --- OPEX & CAPEX ---
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

  // --- Summary outputs ---
  setText("secTotal", moneyMAD(secTotal, 0));
  setText("clnTotal", moneyMAD(clnTotal, 0));
  setText("opexOther", moneyMAD(opexOther, 0));
  setText("opexTotal", moneyMAD(opexTotal, 0));
  setText("opexAnnual", `Annual OPEX (NET): ${moneyMAD(opexAnnual, 0)}`);

  setText("secDetailLine", `Normal: ${moneyMAD(secRes.costNormal,0)} | OT day: ${moneyMAD(secRes.costOtDay,0)} | OT night: ${moneyMAD(secRes.costOtNight,0)}`);
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
  setText("secCostOtDay", moneyMAD(secRes.costOtDay, 0));
  setText("secCostOtNight", moneyMAD(secRes.costOtNight, 0));

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
  // Event delegation: any input/checkbox/slider change triggers calc
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

  // CAPEX/OPEX explanation toggle
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
