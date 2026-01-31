/* DSM Project — app.js (v4.4)
   Adds Pricing Mode toggle:
   - Headcount-based (Mode 2): cost = agents × legalMonthlyHours × chargeableHourly (no OT / no posts sizing)
   - Coverage-based: required hours from posts/schedule; OT computed if shortage
*/

const DEFAULTS = {
  // Pricing mode
  pricingModeHeadcount: true, // TRUE = headcount-based; FALSE = coverage-based

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

  // Day/Night & overtime
  nightHoursPerDay: 12,     // Security night shift 19:00–07:00 = 12h
  otDayPremium: 25,         // +25%
  otNightPremium: 50,       // +50% (editable)

  // Security
  daysInMonth: 30.33,
  secPosts: 2,
  autoSizeSecurity: true,   // only used in coverage-based mode
  secAgents: 7,
  secNightAgents: 2,
  secPaidHoursPerShift: 10, // 8h work + 2h break = 10h paid per 12h shift

  // Cleaning
  clnHoursPerDay: 8,        // paid/billable hours per agent/day (coverage-based mode uses this)
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

function syncNightAgentMax() {
  const secAgents = Math.round(readNum("secAgents"));
  const secNightEl = $("secNightAgents");
  if (secNightEl) secNightEl.max = String(Math.max(0, secAgents));

  const clnAgents = Math.round(readNum("clnAgents"));
  const clnNightEl = $("clnNightAgents");
  if (clnNightEl) clnNightEl.max = String(Math.max(0, clnAgents));
}

function calc() {
  syncNightAgentMax();

  // Replacement computed display
  const replComputed = computeReplacementPercentFromComponents();
  setText("replacementComputedDisplay", `${replComputed.toFixed(2)}%`);

  // Pricing Mode
  const headcountMode = readBool("pricingModeHeadcount");
  setText("pricingModeOut", headcountMode ? "Pricing mode: Headcount-based" : "Pricing mode: Coverage-based");

  setText(
    "pricingModeNote",
    headcountMode
      ? "Headcount-based: pricing is per agent/month (agents × standard monthly hours × chargeable hourly). Posts/coverage are shown for information only; no overtime is computed."
      : "Coverage-based: pricing is driven by required billable hours (from posts/schedule). Overtime is computed if staffing capacity is insufficient."
  );

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

  // Day/Night hours (used in coverage mode for security split)
  const nightHoursPerDay = clamp(readNum("nightHoursPerDay"), 0, 24);

  // Read headcounts + enforce linkage (night <= total)
  let secAgents = Math.round(readNum("secAgents"));
  let secNightAgents = Math.round(readNum("secNightAgents"));
  secNightAgents = clamp(secNightAgents, 0, secAgents);
  if ($("secNightAgents")) $("secNightAgents").value = String(secNightAgents);
  const secDayAgents = secAgents - secNightAgents;

  setText("secAgentsVal", secAgents);
  setText("secNightAgentsVal", secNightAgents);
  setText("secDayAgentsOut", `${secDayAgents} day`);

  let clnAgents = Math.round(readNum("clnAgents"));
  let clnNightAgents = Math.round(readNum("clnNightAgents"));
  clnNightAgents = clamp(clnNightAgents, 0, clnAgents);
  if ($("clnNightAgents")) $("clnNightAgents").value = String(clnNightAgents);
  const clnDayAgents = clnAgents - clnNightAgents;

  setText("clnAgentsVal", clnAgents);
  setText("clnNightAgentsVal", clnNightAgents);
  setText("clnDayAgentsOut", `${clnDayAgents} day`);

  // SECURITY info (coverage/billable hours display)
  const daysInMonth = readNum("daysInMonth");
  const secPosts = Math.round(readNum("secPosts"));
  const secPaidHoursPerShift = readNum("secPaidHoursPerShift");
  const autoSizeSecurity = readBool("autoSizeSecurity");

  setText("secPostsVal", secPosts);

  const secCoverageHours = secPosts * 24 * daysInMonth;
  const secBillableHours = secPosts * 2 * secPaidHoursPerShift * daysInMonth;

  setText("secCoverageHours", `${Math.round(secCoverageHours)} h`);
  setText("secBillableHours", `${Math.round(secBillableHours)} h`);
  setText("secCapacity", `${Math.round(secAgents * legalMonthlyHours)} h`);

  // CLEANING schedule inputs (only used in coverage mode)
  const clnHoursPerDay = readNum("clnHoursPerDay");
  const clnDaysPerMonth = readNum("clnDaysPerMonth");
  const clnReqTotal = clnAgents * clnHoursPerDay * clnDaysPerMonth;
  setText("clnReqHours", `${Math.round(clnReqTotal)} h`);

  // Compute Security and Cleaning costs depending on mode
  let secRes, clnRes;

  if (headcountMode) {
    // Headcount-based = per-agent monthly lumpsum (no overtime)
    const secCostNormal = secAgents * legalMonthlyHours * chargeableHourly;
    secRes = { costNormal: secCostNormal, costOtDay: 0, costOtNight: 0, otDayHours: 0, otNightHours: 0, totalCost: secCostNormal };
    setText("secOtAlert", `Headcount mode: Security cost = ${secAgents} agents × ${legalMonthlyHours}h × hourly rate. Overtime not computed.`);

    const clnCostNormal = clnAgents * legalMonthlyHours * chargeableHourly;
    clnRes = { costNormal: clnCostNormal, costOtDay: 0, costOtNight: 0, otDayHours: 0, otNightHours: 0, totalCost: clnCostNormal };
    setText("clnOtAlert", `Headcount mode: Cleaning cost = ${clnAgents} agents × ${legalMonthlyHours}h × hourly rate. Overtime not computed.`);
  } else {
    // Coverage-based (security uses billable hours from posts; cleaning uses planned hours)
    // Optional auto-size security headcount (coverage mode only)
    if (autoSizeSecurity && $("secAgents")) {
      const currentTotal = Math.max(1, secAgents);
      const nightShare = currentTotal > 0 ? (secNightAgents / currentTotal) : 0.5;

      const neededAgents = Math.max(1, Math.ceil(secBillableHours / Math.max(1, legalMonthlyHours)));
      $("secAgents").value = String(neededAgents);

      // keep ratio for night
      const newNight = Math.round(neededAgents * nightShare);
      if ($("secNightAgents")) $("secNightAgents").value = String(clamp(newNight, 0, neededAgents));

      // re-read after autosize
      secAgents = neededAgents;
      secNightAgents = clamp(Math.round(readNum("secNightAgents")), 0, secAgents);
    }

    const secDayAgents2 = secAgents - secNightAgents;
    setText("secAgentsVal", secAgents);
    setText("secNightAgentsVal", secNightAgents);
    setText("secDayAgentsOut", `${secDayAgents2} day`);
    setText("secCapacity", `${Math.round(secAgents * legalMonthlyHours)} h`);

    // Split required billable hours into day/night by nightHoursPerDay ratio
    const secReqNight = secBillableHours * (nightHoursPerDay / 24);
    const secReqDay = secBillableHours - secReqNight;

    secRes = computeLaborCostCoverage({
      reqDay: secReqDay,
      reqNight: secReqNight,
      dayAgents: secDayAgents2,
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
        : `Security staffing OK: no overtime required (coverage mode).`
    );

    // Cleaning coverage mode: use planned required hours and split by night allocation
    const clnReqNight = (clnAgents > 0) ? (clnReqTotal * (clnNightAgents / clnAgents)) : 0;
    const clnReqDay = clnReqTotal - clnReqNight;

    clnRes = computeLaborCostCoverage({
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
        : `Cleaning staffing OK: no overtime required (coverage mode).`
    );
  }

  // OPEX & CAPEX totals
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
