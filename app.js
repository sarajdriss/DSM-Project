const DEFAULTS = {
  smig: 17.92,
  empDedRate: 6.74,      // employee paid (deducted): CNSS 4.48 + AMO 2.26
  employerRate: 21.09,   // patronal paid by company
  replacement: 8.50,
  secHours: 1456,
  clnHours: 1056,
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

function num(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  const v = parseFloat(el.value);
  return isFinite(v) ? v : 0;
}

function bool(id) {
  const el = document.getElementById(id);
  return !!(el && el.checked);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setDonut(sec, cln, other) {
  const total = sec + cln + other;
  const s1 = total > 0 ? (sec / total) : 0;
  const s2 = total > 0 ? (cln / total) : 0;

  const p1 = (s1 * 100).toFixed(2) + '%';
  const p2 = ((s1 + s2) * 100).toFixed(2) + '%';

  const donut = document.getElementById('donut');
  if (donut) {
    donut.style.setProperty('--p1', p1);
    donut.style.setProperty('--p2', p2);
  }
}

function loadSaved() {
  IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const saved = localStorage.getItem('DSM_' + id);
    if (saved === null) return;

    if (el.type === 'checkbox') el.checked = saved === 'true';
    else el.value = saved;
  });
}

function saveAll() {
  IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') localStorage.setItem('DSM_' + id, el.checked ? 'true' : 'false');
    else localStorage.setItem('DSM_' + id, el.value);
  });
}

function resetDefaults() {
  IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = DEFAULTS[id];
    else el.value = DEFAULTS[id];
    localStorage.removeItem('DSM_' + id);
  });
  calc();
}

function calc() {
  const smig = num('smig'); // gross hourly
  const empDedRate = num('empDedRate') / 100;
  const employerRate = num('employerRate') / 100;
  const replacement = num('replacement') / 100;

  const secHours = num('secHours');
  const clnHours = num('clnHours');

  const secPpeCapex = num('secPpeCapex');
  const clnPpeCapex = num('clnPpeCapex');
  const equipCapex = num('equipCapex');

  const clnProducts = num('clnProducts');
  const otherFixed = num('otherFixed');

  const includeCapex = bool('includeCapex');

  // Employee vs employer:
  const grossHourly = smig;
  const empDedHourly = grossHourly * empDedRate;      // paid by employee (deducted)
  const netHourly = grossHourly - empDedHourly;        // informational

  const employerContribHourly = grossHourly * employerRate; // paid by company
  const employerHourly = grossHourly + employerContribHourly;

  // Chargeable hourly with replacement
  const chargeableHourly = employerHourly * (1 + replacement);

  // Monthly labor (recurring)
  const secLabor = chargeableHourly * secHours;
  const clnLabor = chargeableHourly * clnHours;

  // Recurring other costs
  const otherRecurring = clnProducts + otherFixed;

  // Recurring totals (NET – TVA Exempt)
  const secTotal = secLabor;
  const clnTotal = clnLabor;
  const grandTotal = secTotal + clnTotal + otherRecurring;
  const annualTotal = grandTotal * 12;

  // One-time CAPEX
  const capexTotal = secPpeCapex + clnPpeCapex + equipCapex;
  const firstMonthTotal = includeCapex ? (grandTotal + capexTotal) : grandTotal;

  // Hourly outputs
  setText('grossHourly', moneyMAD(grossHourly, 2));
  setText('empDedHourly', moneyMAD(empDedHourly, 2));
  setText('netHourly', moneyMAD(netHourly, 2));
  setText('employerContribHourly', moneyMAD(employerContribHourly, 2));
  setText('employerHourly', moneyMAD(employerHourly, 2));
  setText('chargeableHourly', moneyMAD(chargeableHourly, 2));

  // Monthly breakdown table
  setText('secLabor', moneyMAD(secLabor, 0));
  setText('clnLabor', moneyMAD(clnLabor, 0));
  setText('consumables', moneyMAD(clnProducts, 0));
  setText('otherFixedOut', moneyMAD(otherFixed, 0));

  // Summary cards
  setText('secTotal', moneyMAD(secTotal, 0));
  setText('clnTotal', moneyMAD(clnTotal, 0));
  setText('otherRecurring', moneyMAD(otherRecurring, 0));
  setText('grandTotal', moneyMAD(grandTotal, 0));
  setText('annualText', 'Annual: ' + moneyMAD(annualTotal, 0));

  setText('secLaborText', 'Labor: ' + moneyMAD(secLabor, 0));
  setText('clnLaborText', 'Labor: ' + moneyMAD(clnLabor, 0));

  // KPI
  setText('kpiMonthly', moneyMAD(grandTotal, 0));
  setText('kpiFirstMonth', moneyMAD(firstMonthTotal, 0));

  // CAPEX box
  setText('capexSec', moneyMAD(secPpeCapex, 0));
  setText('capexCln', moneyMAD(clnPpeCapex, 0));
  setText('capexEq', moneyMAD(equipCapex, 0));
  setText('capexTotal', moneyMAD(capexTotal, 0));
  setText('firstMonthTotal', moneyMAD(firstMonthTotal, 0));
  setText('capexIncludedText', includeCapex ? 'Yes' : 'No');

  // Donut chart on recurring totals
  setDonut(secTotal, clnTotal, otherRecurring);

  saveAll();
}

function bind() {
  IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', calc);
    el.addEventListener('change', calc);
  });

  const printBtn = document.getElementById('printBtn');
  if (printBtn) printBtn.addEventListener('click', () => window.print());

  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn) resetBtn.addEventListener('click', resetDefaults);
}

loadSaved();
bind();
calc();
