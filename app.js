const DEFAULTS = {
  // payroll
  smig: 17.92,
  empDedRate: 6.74,
  employerRate: 21.09,
  replacement: 8.50,

  legalMonthlyHours: 191,
  nightHoursPerDay: 12,     // because your security “night shift” is 19:00–07:00 (12h)
  otDayPremium: 25,
  otNightPremium: 50,

  // security
  daysInMonth: 30.33,
  secPosts: 2,
  secAgents: 8,
  secNightAgents: 4,
  secPaidHoursPerShift: 10, // 8h work + 2h break
  autoSizeSecurity: true,

  // cleaning (kept as before)
  clnHoursPerDay: 8,
  clnDaysPerMonth: 22,
  clnAgents: 6,
  clnNightAgents: 0,

  // capex & opex
  secPpeCapex: 6090,
  clnPpeCapex: 3600,
  equipCapex: 29000,
  clnProducts: 3040,
  otherFixed: 0,
  includeCapex: true
};

const IDS = Object.keys(DEFAULTS);

function $(id){ return document.getElementById(id); }
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

function moneyMAD(n, decimals = 0) {
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: 'MAD',
    maximumFractionDigits: decimals
  }).format(isFinite(n) ? n : 0);
}

function readNum(id){
  const e = $(id);
  if (!e) return 0;
  const v = parseFloat(e.value);
  return Number.isFinite(v) ? v : 0;
}
function readBool(id){
  const e = $(id);
  return !!(e && e.checked);
}
function setText(id, value){
  const e = $(id);
  if (e) e.textContent = value;
}

function saveAll(){
  IDS.forEach(id => {
    const e = $(id);
    if (!e) return;
    const key = 'DSM_' + id;
    if (e.type === 'checkbox') localStorage.setItem(key, e.checked ? 'true' : 'false');
    else localStorage.setItem(key, e.value);
  });
}

function loadSaved(){
  IDS.forEach(id => {
    const e = $(id);
    if (!e) return;
    const key = 'DSM_' + id;
    const saved = localStorage.getItem(key);
    if (saved === null) return;
    if (e.type === 'checkbox') e.checked = (saved === 'true');
    else e.value = saved;
  });
}

function resetDefaults(){
  IDS.forEach(id => {
    const e = $(id);
    if (!e) return;
    if (e.type === 'checkbox') e.checked = DEFAULTS[id];
    else e.value = DEFAULTS[id];
    localStorage.removeItem('DSM_' + id);
  });
  calc();
}

function setDonut(sec, cln, other) {
  const total = sec + cln + other;
  const s1 = total > 0 ? (sec / total) : 0;
  const s2 = total > 0 ? (cln / total) : 0;
  const p1 = (s1 * 100).toFixed(2) + '%';
  const p2 = ((s1 + s2) * 100).toFixed(2) + '%';
  const d = $('donut');
  if (d) {
    d.style.setProperty('--p1', p1);
    d.style.setProperty('--p2', p2);
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
    otDayHours: otDay, otNightHours: otNight,
    costNormal, costOtDay, costOtNight,
    totalCost: costNormal + costOtDay + costOtNight
  };
}

function syncAgentLinkages(){
  // Security linkage: night <= total, and dynamic max
  const secAgents = Math.round(readNum('secAgents'));
  const secNight = $('secNightAgents');
  if (secNight) secNight.max = String(Math.max(0, secAgents));

  // Cleaning linkage: night <= total, and dynamic max
  const clnAgents = Math.round(readNum('clnAgents'));
  const clnNight = $('clnNightAgents');
  if (clnNight) clnNight.max = String(Math.max(0, clnAgents));
}

function calc(){
  syncAgentLinkages();

  // Payroll
  const smig = readNum('smig');
  const empDedRate = readNum('empDedRate') / 100;
  const employerRate = readNum('employerRate') / 100;
  const replacement = readNum('replacement') / 100;

  const legalMonthlyHours = readNum('legalMonthlyHours');

  const otDayPremium = readNum('otDayPremium') / 100;
  const otNightPremium = readNum('otNightPremium') / 100;

  const netHourly = smig * (1 - empDedRate);
  const employerHourly = smig * (1 + employerRate);
  const chargeableHourly = employerHourly * (1 + replacement);

  const otDayHourly = chargeableHourly * (1 + otDayPremium);
  const otNightHourly = chargeableHourly * (1 + otNightPremium);

  setText('netHourly', moneyMAD(netHourly, 2));
  setText('employerHourly', moneyMAD(employerHourly, 2));
  setText('chargeableHourly', moneyMAD(chargeableHourly, 2));
  setText('otDayHourly', moneyMAD(otDayHourly, 2));
  setText('otNightHourly', moneyMAD(otNightHourly, 2));
  setText('oneAgentMonthlyCost', moneyMAD(legalMonthlyHours * chargeableHourly, 0));

  // SECURITY
  const daysInMonth = readNum('daysInMonth');
  const secPosts = Math.round(readNum('secPosts'));
  const secPaidHoursPerShift = readNum('secPaidHoursPerShift'); // 10 by default
  const autoSizeSecurity = readBool('autoSizeSecurity');

  // Required hours:
  // Coverage hours (true 24/7 SLA) vs Billable hours (your “8h work + 2h break” rule)
  const secCoverageHours = secPosts * 24 * daysInMonth;
  const secBillableHours = secPosts * 2 * secPaidHoursPerShift * daysInMonth; // 2 shifts/day

  setText('secPostsVal', secPosts);
  setText('secCoverageHours', `${Math.round(secCoverageHours)} h`);
  setText('secBillableHours', `${Math.round(secBillableHours)} h`);

  // Auto-size total security agents based on BILLABLE hours (your costing basis)
  // Best practice: we size using the same hour basis used for costing and overtime check.
  if (autoSizeSecurity && $('secAgents')) {
    const currentTotal = Math.round(readNum('secAgents'));
    const currentNight = Math.round(readNum('secNightAgents'));
    const nightShare = currentTotal > 0 ? (currentNight / currentTotal) : 0.5;

    const needed = Math.max(1, Math.ceil(secBillableHours / Math.max(1, legalMonthlyHours)));
    $('secAgents').value = String(needed);

    // Keep night ratio when autosizing
    if ($('secNightAgents')) {
      const newNight = Math.round(needed * nightShare);
      $('secNightAgents').value = String(clamp(newNight, 0, needed));
    }
  }

  let secAgents = Math.round(readNum('secAgents'));
  let secNightAgents = Math.round(readNum('secNightAgents'));
  secNightAgents = clamp(secNightAgents, 0, secAgents);
  const secDayAgents = secAgents - secNightAgents;

  if ($('secNightAgents')) $('secNightAgents').value = String(secNightAgents);

  setText('secAgentsVal', secAgents);
  setText('secNightAgentsVal', secNightAgents);
  setText('secDayAgentsOut', `${secDayAgents} day`);
  setText('secCapacity', `${Math.round(secAgents * legalMonthlyHours)} h`);

  // Allocate billable required hours into Day/Night (50/50 because two equal shifts)
  const secReqDay = secBillableHours / 2;
  const secReqNight = secBillableHours / 2;

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
  setText('secOtAlert',
    secShort > 0
      ? `Security OT required: ${Math.round(secShort)} h (Day: ${Math.round(secRes.otDayHours)} h | Night: ${Math.round(secRes.otNightHours)} h).`
      : `Security staffing OK: no overtime required on the billable-hours basis.`
  );

  // CLEANING (keep your previous logic: required hours from plan)
  const clnHoursPerDay = readNum('clnHoursPerDay');
  const clnDaysPerMonth = readNum('clnDaysPerMonth');
  const clnAgents = Math.round(readNum('clnAgents'));

  let clnNightAgents = Math.round(readNum('clnNightAgents'));
  clnNightAgents = clamp(clnNightAgents, 0, clnAgents);
  const clnDayAgents = clnAgents - clnNightAgents;

  if ($('clnNightAgents')) $('clnNightAgents').value = String(clnNightAgents);

  setText('clnAgentsVal', clnAgents);
  setText('clnNightAgentsVal', clnNightAgents);
  setText('clnDayAgentsOut', `${clnDayAgents} day`);

  const clnReqTotal = clnAgents * clnHoursPerDay * clnDaysPerMonth;
  setText('clnReqHours', `${Math.round(clnReqTotal)} h`);

  // Allocate cleaning required hours to day/night by staffing split
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
  setText('clnOtAlert',
    clnShort > 0
      ? `Cleaning OT required: ${Math.round(clnShort)} h (Day: ${Math.round(clnRes.otDayHours)} h | Night: ${Math.round(clnRes.otNightHours)} h).`
      : `Cleaning staffing OK: no overtime required.`
  );

  // OPEX/CAPEX totals
  const clnProducts = readNum('clnProducts');
  const otherFixed = readNum('otherFixed');

  const secPpeCapex = readNum('secPpeCapex');
  const clnPpeCapex = readNum('clnPpeCapex');
  const equipCapex = readNum('equipCapex');
  const includeCapex = readBool('includeCapex');

  const capexTotal = secPpeCapex + clnPpeCapex + equipCapex;

  const secTotal = secRes.totalCost;
  const clnTotal = clnRes.totalCost;
  const opexOther = clnProducts + otherFixed;

  const opexTotal = secTotal + clnTotal + opexOther;
  const opexAnnual = opexTotal * 12;
  const month1Total = includeCapex ? (opexTotal + capexTotal) : opexTotal;

  // Summary outputs (match your existing IDs)
  setText('secTotal', moneyMAD(secTotal, 0));
  setText('clnTotal', moneyMAD(clnTotal, 0));
  setText('opexOther', moneyMAD(opexOther, 0));
  setText('opexTotal', moneyMAD(opexTotal, 0));
  setText('opexAnnual', `Annual OPEX (NET): ${moneyMAD(opexAnnual, 0)}`);

  setText('secDetailLine', `Normal: ${moneyMAD(secRes.costNormal,0)} | OT day: ${moneyMAD(secRes.costOtDay,0)} | OT night: ${moneyMAD(secRes.costOtNight,0)}`);
  setText('clnDetailLine', `Normal: ${moneyMAD(clnRes.costNormal,0)} | OT day: ${moneyMAD(clnRes.costOtDay,0)} | OT night: ${moneyMAD(clnRes.costOtNight,0)}`);

  setText('kpiOpexMonthly', moneyMAD(opexTotal, 0));
  setText('kpiMonth1', moneyMAD(month1Total, 0));

  setText('capexSec', moneyMAD(secPpeCapex, 0));
  setText('capexCln', moneyMAD(clnPpeCapex, 0));
  setText('capexEq', moneyMAD(equipCapex, 0));
  setText('capexTotal', moneyMAD(capexTotal, 0));
  setText('month1Total', moneyMAD(month1Total, 0));
  setText('capexIncludedText', includeCapex ? 'Yes' : 'No');

  setText('secCostNormal', moneyMAD(secRes.costNormal, 0));
  setText('secCostOtDay', moneyMAD(secRes.costOtDay, 0));
  setText('secCostOtNight', moneyMAD(secRes.costOtNight, 0));

  setText('clnCostNormal', moneyMAD(clnRes.costNormal, 0));
  setText('clnCostOtDay', moneyMAD(clnRes.costOtDay, 0));
  setText('clnCostOtNight', moneyMAD(clnRes.costOtNight, 0));

  setText('consumables', moneyMAD(clnProducts, 0));
  setText('otherFixedOut', moneyMAD(otherFixed, 0));

  setText('opexExplainMonthly', moneyMAD(opexTotal, 0));
  setText('opexExplainAnnual', moneyMAD(opexAnnual, 0));
  setText('capexExplainTotal', moneyMAD(capexTotal, 0));
  setText('month1ExplainTotal', moneyMAD(month1Total, 0));

  setDonut(secTotal, clnTotal, opexOther);

  saveAll();
}

function bind(){
  // Best practice: any input change recalculates (prevents “no update” issues)
  document.addEventListener('input', (e) => {
    if (e.target && e.target.matches('input')) calc();
  });
  document.addEventListener('change', (e) => {
    if (e.target && e.target.matches('input')) calc();
  });

  const toggleBtn = $('toggleBreakdownBtn');
  const breakdown = $('breakdown');
  if (toggleBtn && breakdown) {
    toggleBtn.addEventListener('click', () => {
      breakdown.classList.toggle('hidden');
      toggleBtn.textContent = breakdown.classList.contains('hidden')
        ? 'Show CAPEX & OPEX Breakdown'
        : 'Hide CAPEX & OPEX Breakdown';
      if (!breakdown.classList.contains('hidden')) breakdown.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  const printBtn = $('printBtn');
  if (printBtn) printBtn.addEventListener('click', () => window.print());

  const resetBtn = $('resetBtn');
  if (resetBtn) resetBtn.addEventListener('click', resetDefaults);
}

window.addEventListener('DOMContentLoaded', () => {
  loadSaved();
  bind();
  calc();
});
