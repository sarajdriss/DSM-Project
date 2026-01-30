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

function $(id){ return document.getElementById(id); }

function moneyMAD(n, decimals = 0) {
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: 'MAD',
    maximumFractionDigits: decimals
  }).format(isFinite(n) ? n : 0);
}
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

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

  const normalDayHours = Math.min(reqDay, capDay);
  const normalNightHours = Math.min(reqNight, capNight);

  const otDayHours = Math.max(0, reqDay - capDay);
  const otNightHours = Math.max(0, reqNight - capNight);

  const costNormal = (normalDayHours + normalNightHours) * rateNormal;
  const costOtDay = otDayHours * rateOtDay;
  const costOtNight = otNightHours * rateOtNight;

  return {
    capDay, capNight,
    otDayHours, otNightHours,
    costNormal, costOtDay, costOtNight,
    totalCost: costNormal + costOtDay + costOtNight
  };
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

function syncSliderConstraints(){
  // Keep night agents <= total agents and set max dynamically (best practice UX)
  const secAgents = Math.round(readNum('secAgents'));
  const secNight = $('secNightAgents');
  if (secNight) secNight.max = String(Math.max(0, secAgents));

  const clnAgents = Math.round(readNum('clnAgents'));
  const clnNight = $('clnNightAgents');
  if (clnNight) clnNight.max = String(Math.max(0, clnAgents));
}

function calc(){
  syncSliderConstraints();

  // payroll
  const smig = readNum('smig');
  const empDedRate = readNum('empDedRate') / 100;
  const employerRate = readNum('employerRate') / 100;
  const replacement = readNum('replacement') / 100;

  const legalMonthlyHours = readNum('legalMonthlyHours');
  const nightHoursPerDay = clamp(readNum('nightHoursPerDay'), 0, 24);
  const dayHoursPerDay = 24 - nightHoursPerDay;

  const otDayPremium = readNum('otDayPremium') / 100;
  const otNightPremium = readNum('otNightPremium') / 100;

  const grossHourly = smig;
  const netHourly = grossHourly * (1 - empDedRate);

  const employerHourly = grossHourly * (1 + employerRate);
  const chargeableHourly = employerHourly * (1 + replacement);

  const otDayHourly = chargeableHourly * (1 + otDayPremium);
  const otNightHourly = chargeableHourly * (1 + otNightPremium);

  setText('employerHourly', moneyMAD(employerHourly, 2));
  setText('chargeableHourly', moneyMAD(chargeableHourly, 2));
  setText('otDayHourly', moneyMAD(otDayHourly, 2));
  setText('otNightHourly', moneyMAD(otNightHourly, 2));
  setText('netHourly', moneyMAD(netHourly, 2));

  setText('oneAgentMonthlyCost', moneyMAD(legalMonthlyHours * chargeableHourly, 0));

  // SECURITY
  const daysInMonth = readNum('daysInMonth');
  const secPosts = Math.round(readNum('secPosts'));
  const secAgents = Math.round(readNum('secAgents'));
  let secNightAgents = Math.round(readNum('secNightAgents'));
  secNightAgents = clamp(secNightAgents, 0, secAgents);
  const secDayAgents = secAgents - secNightAgents;

  // keep slider value synced after clamp
  if ($('secNightAgents')) $('secNightAgents').value = String(secNightAgents);

  setText('secPostsVal', secPosts);
  setText('secAgentsVal', secAgents);
  setText('secNightAgentsVal', secNightAgents);
  setText('secDayAgentsOut', `${secDayAgents} day`);

  const secReqTotal = secPosts * 24 * daysInMonth;
  const secReqNight = secReqTotal * (nightHoursPerDay / 24);
  const secReqDay = secReqTotal * (dayHoursPerDay / 24);

  setText('secReqHours', `${Math.round(secReqTotal)} h`);
  setText('secCapacity', `${Math.round(secAgents * legalMonthlyHours)} h`);

  const secRes = computeLaborCost({
    reqDay: secReqDay, reqNight: secReqNight,
    dayAgents: secDayAgents, nightAgents: secNightAgents,
    legalMonthlyHours,
    rateNormal: chargeableHourly,
    rateOtDay: otDayHourly,
    rateOtNight: otNightHourly
  });

  const secShort = secRes.otDayHours + secRes.otNightHours;
  setText('secOtAlert',
    secShort > 0
      ? `Security OT required: ${Math.round(secShort)} h (Day: ${Math.round(secRes.otDayHours)} h | Night: ${Math.round(secRes.otNightHours)} h).`
      : `Security staffing OK: no overtime required.`
  );

  // CLEANING
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
  const clnReqNight = (clnAgents > 0) ? (clnReqTotal * (clnNightAgents / clnAgents)) : 0;
  const clnReqDay = clnReqTotal - clnReqNight;

  setText('clnReqHours', `${Math.round(clnReqTotal)} h`);

  const clnRes = computeLaborCost({
    reqDay: clnReqDay, reqNight: clnReqNight,
    dayAgents: clnDayAgents, nightAgents: clnNightAgents,
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

  // OPEX & CAPEX
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

  // Summary outputs (same ids as your page)
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
  // Best practice: event delegation — any input change triggers calc
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
