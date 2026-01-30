const DEFAULTS = {
  // payroll
  smig: 17.92,
  empDedRate: 6.74,
  employerRate: 21.09,
  replacement: 8.50,

  legalMonthlyHours: 191,
  nightHoursPerDay: 9,

  otDayPremium: 25,
  otNightPremium: 50,

  // security
  daysInMonth: 30.33,
  secPosts: 2,
  secAgents: 8,
  secNightAgents: 4,

  // cleaning
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

function moneyMAD(n, decimals = 0) {
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: 'MAD',
    maximumFractionDigits: decimals
  }).format(isFinite(n) ? n : 0);
}
function round2(n){ return Math.round((n + Number.EPSILON) * 100) / 100; }

function el(id){ return document.getElementById(id); }
function num(id){
  const e = el(id);
  if (!e) return 0;
  const v = parseFloat(e.value);
  return isFinite(v) ? v : 0;
}
function bool(id){
  const e = el(id);
  return !!(e && e.checked);
}
function setText(id, value){
  const e = el(id);
  if (e) e.textContent = value;
}

function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

function setDonut(sec, cln, other) {
  const total = sec + cln + other;
  const s1 = total > 0 ? (sec / total) : 0;
  const s2 = total > 0 ? (cln / total) : 0;
  const p1 = (s1 * 100).toFixed(2) + '%';
  const p2 = ((s1 + s2) * 100).toFixed(2) + '%';
  const d = el('donut');
  if (d) {
    d.style.setProperty('--p1', p1);
    d.style.setProperty('--p2', p2);
  }
}

function loadSaved() {
  IDS.forEach(id => {
    const e = el(id);
    if (!e) return;
    const saved = localStorage.getItem('DSM_' + id);
    if (saved === null) return;
    if (e.type === 'checkbox') e.checked = saved === 'true';
    else e.value = saved;
  });
}
function saveAll(){
  IDS.forEach(id => {
    const e = el(id);
    if (!e) return;
    if (e.type === 'checkbox') localStorage.setItem('DSM_' + id, e.checked ? 'true' : 'false');
    else localStorage.setItem('DSM_' + id, e.value);
  });
}
function resetDefaults(){
  IDS.forEach(id => {
    const e = el(id);
    if (!e) return;
    if (e.type === 'checkbox') e.checked = DEFAULTS[id];
    else e.value = DEFAULTS[id];
    localStorage.removeItem('DSM_' + id);
  });
  calc();
}

function computeLaborCost({ reqDay, reqNight, dayAgents, nightAgents, legalMonthlyHours, rateNormal, rateOtDay, rateOtNight }) {
  const capDay = dayAgents * legalMonthlyHours;
  const capNight = nightAgents * legalMonthlyHours;

  const normalDayHours = Math.min(reqDay, capDay);
  const normalNightHours = Math.min(reqNight, capNight);

  const otDayHours = Math.max(0, reqDay - capDay);
  const otNightHours = Math.max(0, reqNight - capNight);

  const costNormal = (normalDayHours + normalNightHours) * rateNormal;
  const costOtDay = otDayHours * rateOtDay;
  const costOtNight = otNightHours * rateOtNight;

  const totalHours = reqDay + reqNight;
  const totalCost = costNormal + costOtDay + costOtNight;

  return {
    capDay, capNight,
    normalDayHours, normalNightHours,
    otDayHours, otNightHours,
    costNormal, costOtDay, costOtNight,
    totalHours, totalCost
  };
}

function calc() {
  // payroll
  const smig = num('smig');
  const empDedRate = num('empDedRate') / 100;
  const employerRate = num('employerRate') / 100;
  const replacement = num('replacement') / 100;

  const legalMonthlyHours = num('legalMonthlyHours');
  const nightHoursPerDay = clamp(num('nightHoursPerDay'), 0, 24);
  const dayHoursPerDay = 24 - nightHoursPerDay;

  const otDayPremium = num('otDayPremium') / 100;
  const otNightPremium = num('otNightPremium') / 100;

  // base rates
  const grossHourly = smig;
  const empDedHourly = grossHourly * empDedRate;
  const netHourly = grossHourly - empDedHourly;

  const employerHourly = grossHourly * (1 + employerRate);
  const chargeableHourly = employerHourly * (1 + replacement);

  const otDayHourly = chargeableHourly * (1 + otDayPremium);
  const otNightHourly = chargeableHourly * (1 + otNightPremium);

  setText('employerHourly', moneyMAD(employerHourly, 2));
  setText('chargeableHourly', moneyMAD(chargeableHourly, 2));
  setText('otDayHourly', moneyMAD(otDayHourly, 2));
  setText('otNightHourly', moneyMAD(otNightHourly, 2));
  setText('netHourly', moneyMAD(netHourly, 2));

  // 1 agent/month cost (standard capacity)
  const oneAgentMonthlyCost = legalMonthlyHours * chargeableHourly;
  setText('oneAgentMonthlyCost', moneyMAD(oneAgentMonthlyCost, 0));

  // SECURITY inputs
  const daysInMonth = num('daysInMonth');
  const secPosts = Math.round(num('secPosts'));
  const secAgents = Math.round(num('secAgents'));
  let secNightAgents = Math.round(num('secNightAgents'));
  secNightAgents = clamp(secNightAgents, 0, secAgents);
  const secDayAgents = secAgents - secNightAgents;

  // output slider values
  setText('secPostsVal', secPosts);
  setText('secAgentsVal', secAgents);
  setText('secNightAgentsVal', secNightAgents);
  setText('secDayAgentsOut', `${secDayAgents} day`);

  // Security required hours (24/7 posts)
  const secReqTotal = secPosts * 24 * daysInMonth;
  const secReqNight = secReqTotal * (nightHoursPerDay / 24);
  const secReqDay = secReqTotal * (dayHoursPerDay / 24);

  setText('secReqHours', `${Math.round(secReqTotal)} h`);
  setText('secCapacity', `${Math.round(secAgents * legalMonthlyHours)} h`);

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

  // SECURITY alert
  const secShortage = secRes.otDayHours + secRes.otNightHours;
  const secAlert = secShortage > 0
    ? `Security staffing shortage: OT required = ${Math.round(secShortage)} h (Day OT: ${Math.round(secRes.otDayHours)} h | Night OT: ${Math.round(secRes.otNightHours)} h).`
    : `Security staffing OK: no overtime required (capacity covers required hours).`;
  const secAlertEl = el('secOtAlert');
  if (secAlertEl) secAlertEl.textContent = secAlert;

  // CLEANING inputs
  const clnHoursPerDay = num('clnHoursPerDay');
  const clnDaysPerMonth = num('clnDaysPerMonth');
  const clnAgents = Math.round(num('clnAgents'));
  let clnNightAgents = Math.round(num('clnNightAgents'));
  clnNightAgents = clamp(clnNightAgents, 0, clnAgents);
  const clnDayAgents = clnAgents - clnNightAgents;

  setText('clnAgentsVal', clnAgents);
  setText('clnNightAgentsVal', clnNightAgents);
  setText('clnDayAgentsOut', `${clnDayAgents} day`);

  // Cleaning required hours based on team plan
  const clnReqTotal = clnAgents * clnHoursPerDay * clnDaysPerMonth;

  // Allocate required hours into day/night by agent split
  const clnReqNight = (clnAgents > 0) ? (clnReqTotal * (clnNightAgents / clnAgents)) : 0;
  const clnReqDay = clnReqTotal - clnReqNight;

  setText('clnReqHours', `${Math.round(clnReqTotal)} h`);

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

  const clnShortage = clnRes.otDayHours + clnRes.otNightHours;
  const clnAlert = clnShortage > 0
    ? `Cleaning staffing shortage: OT required = ${Math.round(clnShortage)} h (Day OT: ${Math.round(clnRes.otDayHours)} h | Night OT: ${Math.round(clnRes.otNightHours)} h).`
    : `Cleaning staffing OK: no overtime required (capacity covers required hours).`;
  const clnAlertEl = el('clnOtAlert');
  if (clnAlertEl) clnAlertEl.textContent = clnAlert;

  // OPEX inputs
  const clnProducts = num('clnProducts');
  const otherFixed = num('otherFixed');

  // CAPEX inputs
  const secPpeCapex = num('secPpeCapex');
  const clnPpeCapex = num('clnPpeCapex');
  const equipCapex = num('equipCapex');
  const includeCapex = bool('includeCapex');

  const capexTotal = secPpeCapex + clnPpeCapex + equipCapex;

  // Monthly totals
  const secTotal = secRes.totalCost;
  const clnTotal = clnRes.totalCost;
  const opexOther = clnProducts + otherFixed;

  const opexTotal = secTotal + clnTotal + opexOther;
  const opexAnnual = opexTotal * 12;

  const month1Total = includeCapex ? (opexTotal + capexTotal) : opexTotal;

  // Update right summary
  setText('secTotal', moneyMAD(secTotal, 0));
  setText('clnTotal', moneyMAD(clnTotal, 0));
  setText('opexOther', moneyMAD(opexOther, 0));
  setText('opexTotal', moneyMAD(opexTotal, 0));
  setText('opexAnnual', `Annual OPEX (NET): ${moneyMAD(opexAnnual, 0)}`);

  setText('secDetailLine',
    `Normal: ${moneyMAD(secRes.costNormal,0)} | OT day: ${moneyMAD(secRes.costOtDay,0)} | OT night: ${moneyMAD(secRes.costOtNight,0)}`
  );
  setText('clnDetailLine',
    `Normal: ${moneyMAD(clnRes.costNormal,0)} | OT day: ${moneyMAD(clnRes.costOtDay,0)} | OT night: ${moneyMAD(clnRes.costOtNight,0)}`
  );

  // KPI
  setText('kpiOpexMonthly', moneyMAD(opexTotal, 0));
  setText('kpiMonth1', moneyMAD(month1Total, 0));

  // CAPEX box
  setText('capexSec', moneyMAD(secPpeCapex, 0));
  setText('capexCln', moneyMAD(clnPpeCapex, 0));
  setText('capexEq', moneyMAD(equipCapex, 0));
  setText('capexTotal', moneyMAD(capexTotal, 0));
  setText('month1Total', moneyMAD(month1Total, 0));
  setText('capexIncludedText', includeCapex ? 'Yes' : 'No');

  // Detailed table
  setText('secCostNormal', moneyMAD(secRes.costNormal, 0));
  setText('secCostOtDay', moneyMAD(secRes.costOtDay, 0));
  setText('secCostOtNight', moneyMAD(secRes.costOtNight, 0));

  setText('clnCostNormal', moneyMAD(clnRes.costNormal, 0));
  setText('clnCostOtDay', moneyMAD(clnRes.costOtDay, 0));
  setText('clnCostOtNight', moneyMAD(clnRes.costOtNight, 0));

  setText('consumables', moneyMAD(clnProducts, 0));
  setText('otherFixedOut', moneyMAD(otherFixed, 0));

  // Breakdown section outputs
  setText('opexExplainMonthly', moneyMAD(opexTotal, 0));
  setText('opexExplainAnnual', moneyMAD(opexAnnual, 0));
  setText('capexExplainTotal', moneyMAD(capexTotal, 0));
  setText('month1ExplainTotal', moneyMAD(month1Total, 0));

  // Donut: OPEX breakdown
  setDonut(secTotal, clnTotal, opexOther);

  // keep night agents sliders consistent (clamped)
  if (el('secNightAgents')) el('secNightAgents').value = secNightAgents;
  if (el('clnNightAgents')) el('clnNightAgents').value = clnNightAgents;

  saveAll();
}

function bind(){
  IDS.forEach(id => {
    const e = el(id);
    if (!e) return;
    e.addEventListener('input', () => { calc(); });
    e.addEventListener('change', () => { calc(); });
  });

  const toggleBtn = el('toggleBreakdownBtn');
  const breakdown = el('breakdown');
  if (toggleBtn && breakdown) {
    toggleBtn.addEventListener('click', () => {
      breakdown.classList.toggle('hidden');
      toggleBtn.textContent = breakdown.classList.contains('hidden')
        ? 'Show CAPEX & OPEX Breakdown'
        : 'Hide CAPEX & OPEX Breakdown';
      if (!breakdown.classList.contains('hidden')) breakdown.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  const printBtn = el('printBtn');
  if (printBtn) printBtn.addEventListener('click', () => window.print());

  const resetBtn = el('resetBtn');
  if (resetBtn) resetBtn.addEventListener('click', resetDefaults);
}

loadSaved();
bind();
calc();
