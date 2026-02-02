/* DSM Project — app.js (v5.5)
   UPDATED per latest index.html (CAPEX itemized tables + display fields)

   SECURITY
   - Day + Night headcount (night priced same as day; no night premium)
   - OT premium: +25% ONLY
   - OT applies ONLY above 48h/week
   - Weekly table like Excel using:
       secWorkDaysPerMonth, secWorkDaysPerWeek, secPaidHoursPerDay

   CLEANING
   - Headcount-based pricing (no OT computed in this version)
   - Planned hours display is informational only

   CONSUMABLES (Liters breakdown)
   - Qty (L/month) × Unit price (MAD/L)
   - Toggle to use breakdown or manual total

   TRANSPORT (OPEX)
   - Monthly Transport = buses × trips/day × cost/trip × days/month
   - Shown in summary + included in OPEX

   CAPEX (ITEMIZED)
   - Item tables (Qty × Unit) compute:
       Security PPE = 6,090 MAD (default)
       Cleaning PPE = 3,600 MAD (default)
       Cleaning Equipment = 29,000 MAD (default)
   - Updates hidden numeric inputs used by totals:
       secPpeCapex, clnPpeCapex, equipCapex
   - Updates display spans in the CAPEX infoBox:
       secPpeCapexDisplay, clnPpeCapexDisplay, equipCapexDisplay,
       capexPpeEquipmentSubtotalDisplay

   SUMMARY
   - Security Team monthly
   - Cleaning Team monthly
   - Cleaning consumables monthly
   - Transport monthly
   - OPEX total + annual
   - CAPEX toggle panel
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

  // CAPEX verified date (info)
  capexVerifiedDate: "2026-02-02",

  // CAPEX totals (derived from item tables; kept as defaults for fallback)
  secPpeCapex: 6090,
  clnPpeCapex: 3600,
  equipCapex: 29000,

  // CAPEX — Security PPE items (default total = 6,090)
  sec_qty_shoes: 3,
  sec_price_shoes: 550,
  sec_qty_vest: 3,
  sec_price_vest: 80,
  sec_qty_parka: 3,
  sec_price_parka: 420,
  sec_qty_rain: 3,
  sec_price_rain: 180,
  sec_qty_light: 3,
  sec_price_light: 150,
  sec_qty_radio: 2,
  sec_price_radio: 850,
  sec_qty_aid: 1,
  sec_price_aid: 250,

  // CAPEX — Cleaning PPE items (default total = 3,600)
  clp_qty_boots: 4,
  clp_price_boots: 220,
  clp_qty_apron: 4,
  clp_price_apron: 120,
  clp_qty_goggles: 4,
  clp_price_goggles: 95,
  clp_qty_gloves: 12,
  clp_price_gloves: 65,
  clp_qty_masks: 10,
  clp_price_masks: 55,
  clp_qty_respir: 2,
  clp_price_respir: 265,

  // CAPEX — Cleaning Equipment items (default total = 29,000)
  cle_qty_mono: 1,
  cle_price_mono: 10500,
  cle_qty_vac: 1,
  cle_price_vac: 4500,
  cle_qty_karcher: 1,
  cle_price_karcher: 6200,
  cle_qty_trolley: 1,
  cle_price_trolley: 1800,
  cle_qty_bucket: 4,
  cle_price_bucket: 450,
  cle_qty_micro: 1,
  cle_price_micro: 1200,
  cle_qty_cable: 2,
  cle_price_cable: 250,
  cle_qty_sign: 3,
  cle_price_sign: 100,
  cle_qty_ladder: 1,
  cle_price_ladder: 900,
  cle_qty_window: 1,
  cle_price_window: 700,
  cle_qty_tools: 1,
  cle_price_tools: 600,

  // TRANSPORT (OPEX)
  transportTripsPerDay: 2,     // home->factory + factory->home
  transportCostPerTrip: 120,   // MAD per trip
  transportDaysPerMonth: 23,   // working days
  transportBuses: 1,           // number of buses

  // CONSUMABLES (liters breakdown)
  useConsumablesBreakdown: true,

  floorDegreaserQtyL: 80,
  floorDegreaserPricePerL: 15,

  disinfectantQtyL: 40,
  disinfectantPricePerL: 18,

  toiletCleanerQtyL: 30,
  toiletCleanerPricePerL: 18,

  glassCleanerQtyL: 10,
  glassCleanerPricePerL: 20,

  // Manual fallback (used only if breakdown OFF)
  clnProducts: 3040,

  // Other recurring
  otherFixed: 0,

  includeCapex: true
};

const STORAGE_PREFIX = "DSM_";
const WEEKLY_LIMIT_HOURS = 48; // OT starts above this
const OT_PREMIUM = 0.25;       // +25% only

// Derived totals (computed from item tables) — do NOT persist these to storage
const DERIVED_INPUT_IDS = new Set([
  "secPpeCapex",
  "clnPpeCapex",
  "equipCapex"
]);

const CAPEX_GROUPS = [
  {
    groupName: "Security PPE",
    outInputId: "secPpeCapex",
    outDisplayId: "secPpeCapexDisplay",
    items: [
      { qty: "sec_qty_shoes", price: "sec_price_shoes", line: "sec_line_shoes" },
      { qty: "sec_qty_vest",  price: "sec_price_vest",  line: "sec_line_vest" },
      { qty: "sec_qty_parka", price: "sec_price_parka", line: "sec_line_parka" },
      { qty: "sec_qty_rain",  price: "sec_price_rain",  line: "sec_line_rain" },
      { qty: "sec_qty_light", price: "sec_price_light", line: "sec_line_light" },
      { qty: "sec_qty_radio", price: "sec_price_radio", line: "sec_line_radio" },
      { qty: "sec_qty_aid",   price: "sec_price_aid",   line: "sec_line_aid" }
    ]
  },
  {
    groupName: "Cleaning PPE",
    outInputId: "clnPpeCapex",
    outDisplayId: "clnPpeCapexDisplay",
    items: [
      { qty: "clp_qty_boots",   price: "clp_price_boots",   line: "clp_line_boots" },
      { qty: "clp_qty_apron",   price: "clp_price_apron",   line: "clp_line_apron" },
      { qty: "clp_qty_goggles", price: "clp_price_goggles", line: "clp_line_goggles" },
      { qty: "clp_qty_gloves",  price: "clp_price_gloves",  line: "clp_line_gloves" },
      { qty: "clp_qty_masks",   price: "clp_price_masks",   line: "clp_line_masks" },
      { qty: "clp_qty_respir",  price: "clp_price_respir",  line: "clp_line_respir" }
    ]
  },
  {
    groupName: "Cleaning Equipment",
    outInputId: "equipCapex",
    outDisplayId: "equipCapexDisplay",
    items: [
      { qty: "cle_qty_mono",    price: "cle_price_mono",    line: "cle_line_mono" },
      { qty: "cle_qty_vac",     price: "cle_price_vac",     line: "cle_line_vac" },
      { qty: "cle_qty_karcher", price: "cle_price_karcher", line: "cle_line_karcher" },
      { qty: "cle_qty_trolley", price: "cle_price_trolley", line: "cle_line_trolley" },
      { qty: "cle_qty_bucket",  price: "cle_price_bucket",  line: "cle_line_bucket" },
      { qty: "cle_qty_micro",   price: "cle_price_micro",   line: "cle_line_micro" },
      { qty: "cle_qty_cable",   price: "cle_price_cable",   line: "cle_line_cable" },
      { qty: "cle_qty_sign",    price: "cle_price_sign",    line: "cle_line_sign" },
      { qty: "cle_qty_ladder",  price: "cle_price_ladder",  line: "cle_line_ladder" },
      { qty: "cle_qty_window",  price: "cle_price_window",  line: "cle_line_window" },
      { qty: "cle_qty_tools",   price: "cle_price_tools",   line: "cle_line_tools" }
    ]
  }
];

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

function setVal(id, value) {
  const e = $(id);
  if (e) e.value = value;
}

/* ---------------------------
   Storage (save/load/reset)
   --------------------------- */

function saveAll() {
  Object.keys(DEFAULTS).forEach(id => {
    const e = $(id);
    if (!e) return;

    // Do not persist derived totals (they are computed from item tables)
    if (DERIVED_INPUT_IDS.has(id)) return;

    const key = STORAGE_PREFIX + id;
    if (e.type === "checkbox") localStorage.setItem(key, e.checked ? "true" : "false");
    else localStorage.setItem(key, e.value);
  });
}

function loadSaved() {
  Object.keys(DEFAULTS).forEach(id => {
    const e = $(id);
    if (!e) return;

    // Do not load derived totals (they will be recomputed)
    if (DERIVED_INPUT_IDS.has(id)) return;

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

    // reset derived totals too (they’ll be recomputed on calc)
    if (e.type === "checkbox") e.checked = !!DEFAULTS[id];
    else e.value = DEFAULTS[id];

    localStorage.removeItem(STORAGE_PREFIX + id);
  });
  calc();
}

/* ---------------------------
   Replacement coefficient
   --------------------------- */

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

/* ---------------------------
   Security weekly breakdown
   --------------------------- */

/* Build weeks like 23 days with 5/week => 5,5,5,5,3 */
function splitDaysIntoWeeks(totalDays, daysPerWeek) {
  const weeks = [];
  let remaining = Math.max(0, Math.floor(totalDays));
  const cap = Math.max(1, Math.floor(daysPerWeek));

  while (remaining > 0) {
    const w = Math.min(cap, remaining);
    weeks.push(w);
    remaining -= w;
    if (weeks.length > 6) break;
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

/* ---------------------------
   CAPEX item tables (NEW)
   --------------------------- */

function calcCapexFromItemTables() {
  let grand = 0;

  for (const group of CAPEX_GROUPS) {
    let subtotal = 0;

    for (const it of group.items) {
      const q = Math.max(0, readNum(it.qty));
      const p = Math.max(0, readNum(it.price));
      const lineTotal = q * p;
      subtotal += lineTotal;

      // line total (rightmost column)
      setText(it.line, moneyMAD(lineTotal, 0));
    }

    // Update hidden numeric input used by the rest of the pricing model
    setVal(group.outInputId, String(Math.round(subtotal)));

    // Update visible display in CAPEX infoBox (if present)
    if (group.outDisplayId) setText(group.outDisplayId, moneyMAD(subtotal, 0));

    grand += subtotal;
  }

  // Subtotal display in CAPEX infoBox
  setText("capexPpeEquipmentSubtotalDisplay", moneyMAD(grand, 0));

  // Return numeric totals for later use
  return {
    secPpeCapex: readNum("secPpeCapex"),
    clnPpeCapex: readNum("clnPpeCapex"),
    equipCapex: readNum("equipCapex"),
    capexTotal: grand
  };
}

/* ---------------------------
   Main calc
   --------------------------- */

function calc() {
  syncCleaningNightMax();

  // Replacement computed display
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

  // Metrics
  setText("netHourly", moneyMAD(netHourly, 2));
  setText("employerHourly", moneyMAD(employerHourly, 2));
  setText("chargeableHourly", moneyMAD(chargeableHourly, 2));
  setText("otDayHourly", moneyMAD(overtimeHourly, 2));
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

  const paidHoursPerDay = readNum("secPaidHoursPerDay");
  const workDaysPerMonth = Math.max(0, Math.round(readNum("secWorkDaysPerMonth")));
  const workDaysPerWeek = Math.max(1, Math.round(readNum("secWorkDaysPerWeek")));

  setText("secPaidHoursOut", paidHoursPerDay.toFixed(0));
  setText("secWorkDaysOut", `${workDaysPerMonth} days`);

  const weeks = splitDaysIntoWeeks(workDaysPerMonth, workDaysPerWeek);
  const totals = renderSecurityScheduleTable(weeks, paidHoursPerDay) || { totalDays:0, totalHours:0, totalReg:0, totalOt:0 };

  setText("secAgentTotalHours", `${totals.totalHours.toFixed(0)} h`);
  setText("secAgentOtHours", `${totals.totalOt.toFixed(0)} h`);

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
  // CLEANING — headcount based (no OT)
  // =========================
  const clnAgents = Math.max(0, Math.round(readNum("clnAgents")));
  let clnNightAgents = Math.round(readNum("clnNightAgents"));
  clnNightAgents = clamp(clnNightAgents, 0, clnAgents);
  if ($("clnNightAgents")) $("clnNightAgents").value = String(clnNightAgents);

  const clnDayAgents = clnAgents - clnNightAgents;
  setText("clnAgentsVal", clnAgents);
  setText("clnNightAgentsVal", clnNightAgents);
  setText("clnDayAgentsOut", `${clnDayAgents} day`);

  const clnHoursPerDay = readNum("clnHoursPerDay");
  const clnDaysPerMonth = readNum("clnDaysPerMonth");
  setText("clnReqHours", `${Math.round(clnAgents * clnHoursPerDay * clnDaysPerMonth)} h`);

  const clnTeamMonthly = clnAgents * legalMonthlyHours * chargeableHourly;
  setText("clnOtAlert", "Cleaning: headcount-based pricing (no overtime computed in this version).");

  // =========================
  // CONSUMABLES — liters breakdown
  // =========================
  const useConsumablesBreakdown = readBool("useConsumablesBreakdown");

  const floorDegQty = readNum("floorDegreaserQtyL");
  const floorDegP = readNum("floorDegreaserPricePerL");
  const disQty = readNum("disinfectantQtyL");
  const disP = readNum("disinfectantPricePerL");
  const toiletQty = readNum("toiletCleanerQtyL");
  const toiletP = readNum("toiletCleanerPricePerL");
  const glassQty = readNum("glassCleanerQtyL");
  const glassP = readNum("glassCleanerPricePerL");

  const floorTotal = floorDegQty * floorDegP;
  const disTotal = disQty * disP;
  const toiletTotal = toiletQty * toiletP;
  const glassTotal = glassQty * glassP;

  setText("floorDegreaserTotal", moneyMAD(floorTotal, 0));
  setText("disinfectantTotal", moneyMAD(disTotal, 0));
  setText("toiletCleanerTotal", moneyMAD(toiletTotal, 0));
  setText("glassCleanerTotal", moneyMAD(glassTotal, 0));

  const breakdownTotal = floorTotal + disTotal + toiletTotal + glassTotal;
  setText("consumablesTotalOut", moneyMAD(breakdownTotal, 0));

  const manualConsumables = readNum("clnProducts");
  const clnProducts = useConsumablesBreakdown ? breakdownTotal : manualConsumables;

  // =========================
  // TRANSPORT — OPEX
  // =========================
  const transportTripsPerDay = Math.max(0, Math.round(readNum("transportTripsPerDay")));
  const transportCostPerTrip = readNum("transportCostPerTrip");
  const transportDaysPerMonth = Math.max(0, Math.round(readNum("transportDaysPerMonth")));
  const transportBuses = Math.max(0, Math.round(readNum("transportBuses")));

  const transportMonthly = transportBuses * transportTripsPerDay * transportCostPerTrip * transportDaysPerMonth;

  setText("transportMonthlyOut", moneyMAD(transportMonthly, 0));
  setText("transportMonthlySummary", moneyMAD(transportMonthly, 0));

  // =========================
  // CAPEX — recompute from item tables (NEW)
  // =========================
  const capex = calcCapexFromItemTables();
  const includeCapex = readBool("includeCapex");

  // =========================
  // OPEX totals
  // =========================
  const otherFixed = readNum("otherFixed");

  const opexOther = clnProducts + transportMonthly + otherFixed;
  const opexTotal = secTeamMonthly + clnTeamMonthly + opexOther;
  const opexAnnual = opexTotal * 12;
  const month1Total = includeCapex ? (opexTotal + capex.capexTotal) : opexTotal;

  // HERO KPIs
  setText("kpiOpexMonthly", moneyMAD(opexTotal, 0));
  setText("kpiMonth1", moneyMAD(month1Total, 0));

  // Right summary
  setText("secTeamMonthly", moneyMAD(secTeamMonthly, 0));
  setText("secTeamInfo", `Day: ${secDay} | Night: ${secNight} | Total: ${secTotalAgents}`);

  setText("clnTeamMonthly", moneyMAD(clnTeamMonthly, 0));
  setText("clnTeamInfo", `Total: ${clnAgents} | Night/Evening: ${clnNightAgents}`);

  setText("clnConsumablesMonthly", moneyMAD(clnProducts, 0));
  setText("opexTotal", moneyMAD(opexTotal, 0));
  setText("opexAnnual", `Annual OPEX (NET): ${moneyMAD(opexAnnual, 0)}`);

  // CAPEX panel (right side)
  setText("capexSec", moneyMAD(capex.secPpeCapex, 0));
  setText("capexCln", moneyMAD(capex.clnPpeCapex, 0));
  setText("capexEq", moneyMAD(capex.equipCapex, 0));
  setText("capexTotal", moneyMAD(capex.capexTotal, 0));
  setText("month1Total", moneyMAD(month1Total, 0));
  setText("capexIncludedText", includeCapex ? "Yes" : "No");

  // Backward compatibility IDs (if present)
  setText("secTotal", moneyMAD(secTeamMonthly, 0));
  setText("clnTotal", moneyMAD(clnTeamMonthly, 0));
  setText("consumables", moneyMAD(clnProducts, 0));
  setText("otherFixedOut", moneyMAD(otherFixed, 0));
  setText("opexOther", moneyMAD(opexOther, 0));

  // Donut (Security / Cleaning / Other OPEX)
  setDonut(secTeamMonthly, clnTeamMonthly, opexOther);

  saveAll();
}

/* ---------------------------
   Bindings
   --------------------------- */

function bind() {
  document.addEventListener("input", (e) => {
    if (e.target && e.target.matches("input")) calc();
  });
  document.addEventListener("change", (e) => {
    if (e.target && e.target.matches("input")) calc();
  });

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

  const printBtn = $("printBtn");
  if (printBtn) printBtn.addEventListener("click", () => window.print());

  const resetBtn = $("resetBtn");
  if (resetBtn) resetBtn.addEventListener("click", resetDefaults);
}

window.addEventListener("DOMContentLoaded", () => {
  loadSaved();
  bind();
  calc();
});
