function moneyMAD(n, decimals = 0) {
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: 'MAD',
    maximumFractionDigits: decimals
  }).format(isFinite(n) ? n : 0);
}

function num(id) {
  const v = parseFloat(document.getElementById(id).value);
  return isFinite(v) ? v : 0;
}

function safeDiv(a, b) {
  if (!isFinite(a) || !isFinite(b) || b <= 0) return 0;
  return a / b;
}

function calc() {
  const smig = num('smig');
  const employerCharges = num('employerCharges') / 100;
  const replacement = num('replacement') / 100;
  const vat = num('vat') / 100;

  const secHours = num('secHours');
  const clnHours = num('clnHours');

  const secPpeInv = num('secPpeInv');
  const secPpeMonths = num('secPpeMonths');

  const clnPpeInv = num('clnPpeInv');
  const clnPpeMonths = num('clnPpeMonths');

  const equipInv = num('equipInv');
  const equipMonths = num('equipMonths');

  const clnProducts = num('clnProducts');
  const otherFixed = num('otherFixed');

  // Corrected logic:
  // Employer hourly cost uses EMPLOYER charges only (starting from gross SMIG).
  // Replacement coefficient is applied for service continuity (leave/holidays/absences).
  const employerHourly = smig * (1 + employerCharges);
  const chargeableHourly = employerHourly * (1 + replacement);

  // Monthly amortization
  const secPpeMonthly = safeDiv(secPpeInv, secPpeMonths);
  const clnPpeMonthly = safeDiv(clnPpeInv, clnPpeMonths);
  const equipMonthly = safeDiv(equipInv, equipMonths);

  // Labor
  const secLabor = chargeableHourly * secHours;
  const clnLabor = chargeableHourly * clnHours;

  // Other costs
  const secOther = secPpeMonthly;
  const clnOther = clnPpeMonthly + equipMonthly + clnProducts;

  const secTotal = secLabor + secOther;
  const clnTotal = clnLabor + clnOther;

  const grandTotal = secTotal + clnTotal + otherFixed;
  const annualTotal = grandTotal * 12;

  const grandTotalVat = grandTotal * (1 + vat);
  const annualTotalVat = annualTotal * (1 + vat);

  // Display
  document.getElementById('employerHourly').textContent = moneyMAD(employerHourly, 2);
  document.getElementById('chargeableHourly').textContent = moneyMAD(chargeableHourly, 2);

  document.getElementById('secPpeMonthly').textContent = moneyMAD(secPpeMonthly, 0);
  document.getElementById('clnPpeMonthly').textContent = moneyMAD(clnPpeMonthly, 0);
  document.getElementById('equipMonthly').textContent = moneyMAD(equipMonthly, 0);

  document.getElementById('secLabor').textContent = moneyMAD(secLabor, 0);
  document.getElementById('secOther').textContent = moneyMAD(secOther, 0);
  document.getElementById('secTotal').textContent = moneyMAD(secTotal, 0);

  document.getElementById('clnLabor').textContent = moneyMAD(clnLabor, 0);
  document.getElementById('clnOther').textContent = moneyMAD(clnOther, 0);
  document.getElementById('clnTotal').textContent = moneyMAD(clnTotal, 0);

  document.getElementById('grandTotal').textContent = moneyMAD(grandTotal, 0);
  document.getElementById('annualTotal').textContent = moneyMAD(annualTotal, 0);

  document.getElementById('grandTotalVat').textContent = moneyMAD(grandTotalVat, 0);
  document.getElementById('annualTotalVat').textContent = moneyMAD(annualTotalVat, 0);
}

[
  'smig','employerCharges','replacement','vat',
  'secHours','clnHours',
  'secPpeInv','secPpeMonths',
  'clnPpeInv','clnPpeMonths',
  'equipInv','equipMonths',
  'clnProducts','otherFixed'
].forEach(id => document.getElementById(id).addEventListener('input', calc));

document.getElementById('printBtn').addEventListener('click', () => window.print());

calc();