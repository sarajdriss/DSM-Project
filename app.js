// app.js
/* DSM Project — app.js (v6.0)
   COMPLETE CAPEX/OPEX OVERHAUL per PPT and Prices.txt
   
   KEY CHANGES:
   - Fixed working days at 23 days/month
   - Two procurement options: Minimum (baseline) vs Full (+30% uplift)
   - CAPEX restructured into 6 groups (Security PPE, Cleaning PPE, Cleaning Equipment,
     Cleaning Products Initial Stock, Washroom Dispensers, Uniforms & Workwear)
   - OPEX Consumables: minimum essential items only, with monthly quantities
   - Initial Stock items also appear in OPEX consumables
   - Transport: default 3 trips/day, 23 days/month fixed
   - Consistent rounding rules for +30% uplift
   - Replacement coefficient: DISABLED by default
*/

const DEFAULTS = {
  // Payroll
  smig: 17.92,
  empDedRate: 6.74,
  employerRate: 21.09,

  // Capacity/planning reference (used for cleaning cost + "1 agent/month cost" display)
  legalMonthlyHours: 191,

  // Replacement coefficient - DISABLED by default per requirements
  replacementEnabled: false,
  replacement: 8.50,

  // Replacement components (auto-calc)
  annualLeaveDaysPerYear: 18,
  publicHolidaysDaysPerYear: 13,
  weeklyRestDaysPerYear: 52,
  sickAbsenceBufferPercent: 2.0,

  // OT premium (fixed by client code: +25%)
  otDayPremium: 25,

  // SECURITY inputs (weekly OT model)
  secDayAgents: 5,
  secNightAgents: 2,
  secPaidHoursPerDay: 10,
  secWorkDaysPerMonth: 23,    // FIXED at 23
  secWorkDaysPerWeek: 5,
  secPaidHoursPerShift: 10,

  // CLEANING inputs (headcount-based)
  clnAgents: 5,
  clnNightAgents: 0,
  clnHoursPerDay: 8,
  clnDaysPerMonth: 23,        // FIXED at 23

  // TRANSPORT (OPEX) - default 3 trips/day
  transportTripsPerDay: 3,
  transportCostPerTrip: 120,
  transportDaysPerMonth: 23,  // FIXED at 23
  transportBuses: 1,

  // Other recurring
  otherFixed: 0,

  // Procurement option
  procurementOption: 'min',   // 'min' or 'full'

  includeCapex: true
};

const STORAGE_PREFIX = "DSM_";
const WEEKLY_LIMIT_HOURS = 48;
const OT_PREMIUM = 0.25;
const WORKING_DAYS_PER_MONTH = 23; // Fixed per requirements
const OPTION_2_UPLIFT = 0.30;      // +30% for Full Requirement

// Uplift rounding rules:
// - Integers for pieces/boxes/units (round up to ensure coverage)
// - Decimals allowed for liters (round to 1 decimal)
function roundUplift(value, isInteger) {
  if (isInteger) {
    return Math.ceil(value);
  }
  return Math.round(value * 10) / 10;
}

// CAPEX Data from PPT - organized by groups
const CAPEX_DATA = {
  // 1) Security PPE (One-time) - from original app.js defaults
  securityPPE: [
    { id: 'sec_shoes', name: 'Safety shoes S3 (pair)', qtyMin: 3, qtyMax: 5, price: 550, link: 'https://www.jumia.ma/catalog/?q=chaussure%20de%20securite%20S3' },
    { id: 'sec_vest', name: 'Reflective vest', qtyMin: 3, qtyMax: 5, price: 80, link: 'https://www.jumia.ma/catalog/?q=gilet%20reflechissant' },
    { id: 'sec_parka', name: 'Work parka / winter jacket', qtyMin: 3, qtyMax: 5, price: 420, link: 'https://www.jumia.ma/catalog/?q=parka%20travail' },
    { id: 'sec_rain', name: 'Raincoat (work)', qtyMin: 3, qtyMax: 5, price: 180, link: 'https://www.jumia.ma/catalog/?q=impermeable%20pluie%20travail' },
    { id: 'sec_light', name: 'Rechargeable flashlight', qtyMin: 3, qtyMax: 5, price: 150, link: 'https://www.jumia.ma/catalog/?q=lampe%20torche%20rechargeable' },
    { id: 'sec_radio', name: 'Walkie-talkie set (Motorola T50)', qtyMin: 2, qtyMax: 4, price: 850, link: 'https://alhorria.ma/produit/talkie-walkie-motorola-t50%C2%96-sans-licence/' },
    { id: 'sec_aid', name: 'First aid kit', qtyMin: 1, qtyMax: 2, price: 250, link: 'https://www.jumia.ma/catalog/?q=trousse%20premiers%20secours' }
  ],

  // 2) Cleaning PPE (One-time) - from original app.js defaults
  cleaningPPE: [
    { id: 'clp_boots', name: 'Rubber safety boots (pair)', qtyMin: 4, qtyMax: 6, price: 220, link: 'https://www.jumia.ma/catalog/?q=bottes%20caoutchouc%20securite' },
    { id: 'clp_apron', name: 'Waterproof apron', qtyMin: 4, qtyMax: 6, price: 120, link: 'https://www.jumia.ma/catalog/?q=tablier%20imperm%C3%A9able' },
    { id: 'clp_goggles', name: 'Safety goggles', qtyMin: 4, qtyMax: 6, price: 95, link: 'https://www.jumia.ma/catalog/?q=lunettes%20de%20protection' },
    { id: 'clp_gloves', name: 'Nitrile gloves (box of 100)', qtyMin: 12, qtyMax: 18, price: 65, link: 'https://www.jumia.ma/catalog/?q=gants%20nitrile%20boite%20100' },
    { id: 'clp_masks', name: 'Disposable masks (box)', qtyMin: 10, qtyMax: 15, price: 55, link: 'https://www.jumia.ma/catalog/?q=masques%20jetables%20boite' },
    { id: 'clp_respir', name: 'Half-face respirator + filters', qtyMin: 2, qtyMax: 4, price: 265, link: 'https://www.jumia.ma/catalog/?q=masque%20respiratoire%20demi%20face' }
  ],

  // 3) Cleaning Equipment (One-time) - from original app.js defaults
  cleaningEquipment: [
    { id: 'cle_mono', name: 'Single-disc floor scrubber 17"', qtyMin: 1, qtyMax: 2, price: 10500, link: 'https://www.jumia.ma/catalog/?q=monobrosse%2017' },
    { id: 'cle_vac', name: 'Wet & dry industrial vacuum 70L', qtyMin: 1, qtyMax: 2, price: 4500, link: 'https://www.jumia.ma/catalog/?q=aspirateur%20eau%20poussiere%2070L' },
    { id: 'cle_karcher', name: 'High-pressure washer', qtyMin: 1, qtyMax: 2, price: 6200, link: 'https://www.jumia.ma/catalog/?q=nettoyeur%20haute%20pression' },
    { id: 'cle_trolley', name: 'Professional janitorial trolley', qtyMin: 1, qtyMax: 2, price: 1800, link: 'https://www.jumia.ma/catalog/?q=chariot%20menage%20professionnel' },
    { id: 'cle_bucket', name: 'Mop bucket with wringer (set)', qtyMin: 4, qtyMax: 6, price: 450, link: 'https://www.jumia.ma/catalog/?q=seau%20balai%20essoreur' },
    { id: 'cle_micro', name: 'Microfiber system kit', qtyMin: 1, qtyMax: 2, price: 1200, link: 'https://www.jumia.ma/catalog/?q=kit%20microfibre%20nettoyage' },
    { id: 'cle_cable', name: 'Extension cable (25m)', qtyMin: 2, qtyMax: 4, price: 250, link: 'https://www.jumia.ma/catalog/?q=rallonge%20electrique%2025m' },
    { id: 'cle_sign', name: '"Wet floor" warning sign', qtyMin: 3, qtyMax: 5, price: 100, link: 'https://www.jumia.ma/catalog/?q=panneau%20sol%20mouill%C3%A9' },
    { id: 'cle_ladder', name: 'Aluminum ladder (6 steps)', qtyMin: 1, qtyMax: 2, price: 900, link: 'https://www.jumia.ma/catalog/?q=escabeau%206%20marches' },
    { id: 'cle_window', name: 'Window cleaning kit (squeegee)', qtyMin: 1, qtyMax: 2, price: 700, link: 'https://www.jumia.ma/catalog/?q=raclette%20vitre%20kit' },
    { id: 'cle_tools', name: 'Hand tools kit (scrapers + brushes)', qtyMin: 1, qtyMax: 2, price: 600, link: 'https://www.jumia.ma/catalog/?q=grattoir%20brosse%20nettoyage%20kit' }
  ],

  // 4) Cleaning Products & Chemicals — Initial Stock (One-time) - from PPT
  cleaningProducts: [
    { id: 'prod_floor', name: 'FLOORNET — Floor and Surface Cleaner and Degreaser', ref: 'HY8242', packaging: '5L unit', qty: 5, price: 45 },
    { id: 'prod_gras', name: 'GRASNET — Liquid degreaser for all types of surfaces', ref: 'HY8256', packaging: '5L unit', qty: 3, price: 90 },
    { id: 'prod_hand', name: 'HANDSOFT — Liquid hand soap', ref: 'HY625', packaging: '5L unit', qty: 15, price: 15 },
    { id: 'prod_bact', name: 'BACTINET — Multi-purpose liquid disinfectant detergent', ref: 'HY8239', packaging: '5L unit', qty: 4, price: 115 },
    { id: 'prod_asep', name: 'ASEPNET — Liquid disinfectant (alcohol + quaternary ammonium)', ref: 'HY015', packaging: '5L unit', qty: 1, price: 225 },
    { id: 'prod_paper', name: 'SELPAK Household Toilet Paper — EXTRA SOFT, 3-Ply', ref: 'HY783', packaging: 'Pack of 72', qty: 2, price: 187.20 }
  ],

  // 5) Washroom Dispensers / Replacement Items (One-time) - from PPT
  washroomDispensers: [
    { id: 'disp_soap', name: 'Manual Soap Dispenser 1L capacity, wall-mounted', ref: 'ZAMBU-857', notes: 'Replacement of broken units — Strategic locations', qty: 6, price: 245 },
    { id: 'disp_tp', name: 'Standard Toilet Paper Dispenser Double roll, plastic', ref: 'ZAMBU-4717', notes: 'Medical Room Toilet Only', qty: 1, price: 265 },
    { id: 'disp_towel', name: 'Economic Paper Towel Dispenser Basic model, wall-mounted', ref: 'ZAMBU-4401', notes: 'Boardroom Only', qty: 1, price: 295 }
    // Note: Sanitary bins (12) mentioned as "cost in progress" - excluded until price provided
  ],

  // 6) Uniforms & Protective Workwear — Initial Purchase (One-time) - from PPT
  uniforms: [
    { id: 'uni_overall', name: 'Grey/Navy work overalls with reflective strips', ref: 'EP4105', specs: 'Cotton/poly with reflective strips', qty: 5, price: 225 },
    { id: 'uni_shoes', name: 'Falcon High Safety Shoes (cleaning staff)', ref: 'VETE-000017', specs: 'High-top leather S3 SRC — Water-repellent, steel toe', qty: 5, price: 215 },
    { id: 'uni_masks', name: 'Surgical Respiratory Protection Masks (3-Ply)', ref: '3905', specs: '10 masks/pack — for big cleaning operations', qty: 5, price: 12.50 },
    { id: 'uni_gloves', name: 'Ultra-resistant protective gloves (100% Latex)', ref: 'HY030', specs: 'Ultra-resistant 100% Latex gloves', qty: 5, price: 15 }
  ]
};

// OPEX Monthly Consumables - Minimum Essential Items
// All items from Initial Stock must appear here
// Monthly quantities: if not provided in PPT, marked as "Not provided"
const OPEX_CONSUMABLES = [
  // From Initial Stock - these are the essential consumables
  { id: 'opex_floor', name: 'FLOORNET — Floor Cleaner/Degreaser', monthlyQty: 5, unit: '5L unit', price: 45, isInteger: true },
  { id: 'opex_gras', name: 'GRASNET — Liquid degreaser', monthlyQty: 3, unit: '5L unit', price: 90, isInteger: true },
  { id: 'opex_hand', name: 'HANDSOFT — Liquid hand soap', monthlyQty: 15, unit: '5L unit', price: 15, isInteger: true },
  { id: 'opex_bact', name: 'BACTINET — Disinfectant detergent', monthlyQty: 4, unit: '5L unit', price: 115, isInteger: true },
  { id: 'opex_asep', name: 'ASEPNET — Alcohol-based disinfectant', monthlyQty: 1, unit: '5L unit', price: 225, isInteger: true },
  { id: 'opex_paper', name: 'SELPAK Toilet Paper — 3-Ply (72 rolls/pack)', monthlyQty: 2, unit: 'pack', price: 187.20, isInteger: true },
  
  // Additional essential consumable (always required per prompt)
  { id: 'opex_masks', name: 'Disposable masks (box)', monthlyQty: 10, unit: 'box', price: 55, isInteger: true },
  
  // Items from Initial Stock with no monthly quantity provided
  // These will display but show "Not provided" and exclude from totals
  { id: 'opex_trash', name: 'Trash bags PROBAG BLEU (40 bags, 55x60cm)', monthlyQty: null, unit: 'pack of 40', price: 20, isInteger: true },
  { id: 'opex_cloths', name: 'Ultra Absorbent Blue Cloths (12 pack)', monthlyQty: null, unit: 'pack of 12', price: 74, isInteger: true },
  { id: 'opex_sponges', name: 'PRO multi-surface abrasive sponges (3 pack)', monthlyQty: null, unit: 'pack of 3', price: 15, isInteger: true }
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

function getProcurementOption() {
  const minOpt = $('optionMin');
  return (minOpt && minOpt.checked) ? 'min' : 'full';
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
    const key = STORAGE_PREFIX + id;
    if (e.type === "checkbox") localStorage.setItem(key, e.checked ? "true" : "false");
    else if (e.type === "radio") {
      if (e.checked) localStorage.setItem(key, e.value);
    }
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
    else if (e.type === "radio") {
      if (saved === e.value) e.checked = true;
    }
    else e.value = saved;
  });
}

function resetDefaults() {
  Object.keys(DEFAULTS).forEach(id => {
    const e = $(id);
    if (!e) return;
    if (e.type === "checkbox") e.checked = !!DEFAULTS[id];
    else if (e.type === "radio") {
      e.checked = (e.value === DEFAULTS[id]);
    }
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
   CAPEX Rendering & Calculation
   --------------------------- */

function getCapexQty(item, option) {
  if (option === 'min') return item.qty || item.qtyMin || 0;
  // Full requirement: use qtyMax if exists, otherwise apply +30% uplift
  if (item.qtyMax) return item.qtyMax;
  const baseQty = item.qty || item.qtyMin || 0;
  return roundUplift(baseQty * (1 + OPTION_2_UPLIFT), item.isInteger !== false);
}

function renderCapexTable() {
  const option = getProcurementOption();

  // 1) Security PPE
  const secBody = $('capexSecTableBody');
  if (secBody) {
    secBody.innerHTML = CAPEX_DATA.securityPPE.map(item => {
      const qty = getCapexQty(item, option);
      const total = qty * item.price;
      return `
        <tr>
          <td class="left">
            ${item.name}
            <div class="hint"><a href="${item.link}" target="_blank" rel="noopener">Market link</a></div>
          </td>
          <td>${item.qtyMin}</td>
          <td>${getCapexQty(item, 'full')}</td>
          <td>${item.price.toFixed(2)}</td>
          <td><strong>${moneyMAD(total, 0)}</strong></td>
        </tr>
      `;
    }).join('');
  }

  // 2) Cleaning PPE
  const clnPpeBody = $('capexClnPpeTableBody');
  if (clnPpeBody) {
    clnPpeBody.innerHTML = CAPEX_DATA.cleaningPPE.map(item => {
      const qty = getCapexQty(item, option);
      const total = qty * item.price;
      return `
        <tr>
          <td class="left">
            ${item.name}
            <div class="hint"><a href="${item.link}" target="_blank" rel="noopener">Market link</a></div>
          </td>
          <td>${item.qtyMin}</td>
          <td>${getCapexQty(item, 'full')}</td>
          <td>${item.price.toFixed(2)}</td>
          <td><strong>${moneyMAD(total, 0)}</strong></td>
        </tr>
      `;
    }).join('');
  }

  // 3) Cleaning Equipment
  const equipBody = $('capexEquipTableBody');
  if (equipBody) {
    equipBody.innerHTML = CAPEX_DATA.cleaningEquipment.map(item => {
      const qty = getCapexQty(item, option);
      const total = qty * item.price;
      return `
        <tr>
          <td class="left">
            ${item.name}
            <div class="hint"><a href="${item.link}" target="_blank" rel="noopener">Market link</a></div>
          </td>
          <td>${item.qtyMin}</td>
          <td>${getCapexQty(item, 'full')}</td>
          <td>${item.price.toFixed(2)}</td>
          <td><strong>${moneyMAD(total, 0)}</strong></td>
        </tr>
      `;
    }).join('');
  }

  // 4) Cleaning Products (Initial Stock)
  const prodBody = $('capexProductsTableBody');
  if (prodBody) {
    prodBody.innerHTML = CAPEX_DATA.cleaningProducts.map(item => {
      const qty = item.qty; // No uplift for initial stock - fixed quantities
      const total = qty * item.price;
      return `
        <tr>
          <td class="left">${item.name}</td>
          <td>${item.ref}</td>
          <td>${item.packaging}</td>
          <td>${qty}</td>
          <td>${item.price.toFixed(2)}</td>
          <td><strong>${moneyMAD(total, 0)}</strong></td>
        </tr>
      `;
    }).join('');
  }

  // 5) Washroom Dispensers
  const dispBody = $('capexDispensersTableBody');
  if (dispBody) {
    dispBody.innerHTML = CAPEX_DATA.washroomDispensers.map(item => {
      const qty = item.qty; // Fixed quantities
      const total = qty * item.price;
      return `
        <tr>
          <td class="left">${item.name}</td>
          <td>${item.ref}</td>
          <td>${item.notes}</td>
          <td>${qty}</td>
          <td>${item.price.toFixed(2)}</td>
          <td><strong>${moneyMAD(total, 0)}</strong></td>
        </tr>
      `;
    }).join('');
  }

  // 6) Uniforms
  const uniBody = $('capexUniformsTableBody');
  if (uniBody) {
    uniBody.innerHTML = CAPEX_DATA.uniforms.map(item => {
      const qty = item.qty; // Fixed quantities
      const total = qty * item.price;
      return `
        <tr>
          <td class="left">${item.name}</td>
          <td>${item.ref}</td>
          <td>${item.specs}</td>
          <td>${qty}</td>
          <td>${item.price.toFixed(2)}</td>
          <td><strong>${moneyMAD(total, 0)}</strong></td>
        </tr>
      `;
    }).join('');
  }
}

function calculateCapexTotals() {
  const option = getProcurementOption();

  // Security PPE
  const secTotal = CAPEX_DATA.securityPPE.reduce((sum, item) => {
    const qty = getCapexQty(item, option);
    return sum + (qty * item.price);
  }, 0);

  // Cleaning PPE
  const clnPpeTotal = CAPEX_DATA.cleaningPPE.reduce((sum, item) => {
    const qty = getCapexQty(item, option);
    return sum + (qty * item.price);
  }, 0);

  // Cleaning Equipment
  const equipTotal = CAPEX_DATA.cleaningEquipment.reduce((sum, item) => {
    const qty = getCapexQty(item, option);
    return sum + (qty * item.price);
  }, 0);

  // Cleaning Products (fixed - no uplift)
  const prodTotal = CAPEX_DATA.cleaningProducts.reduce((sum, item) => {
    return sum + (item.qty * item.price);
  }, 0);

  // Washroom Dispensers (fixed)
  const dispTotal = CAPEX_DATA.washroomDispensers.reduce((sum, item) => {
    return sum + (item.qty * item.price);
  }, 0);

  // Uniforms (fixed)
  const uniTotal = CAPEX_DATA.uniforms.reduce((sum, item) => {
    return sum + (item.qty * item.price);
  }, 0);

  const grandTotal = secTotal + clnPpeTotal + equipTotal + prodTotal + dispTotal + uniTotal;

  return {
    secTotal, clnPpeTotal, equipTotal, prodTotal, dispTotal, uniTotal, grandTotal
  };
}

/* ---------------------------
   OPEX Consumables Rendering & Calculation
   --------------------------- */

function getOpexQty(item, option) {
  if (item.monthlyQty === null) return null; // Not provided
  if (option === 'min') return item.monthlyQty;
  // Apply +30% uplift for Full requirement
  return roundUplift(item.monthlyQty * (1 + OPTION_2_UPLIFT), item.isInteger);
}

function renderOpexConsumables() {
  const option = getProcurementOption();
  const tbody = $('opexConsumablesTableBody');
  if (!tbody) return;

  tbody.innerHTML = OPEX_CONSUMABLES.map(item => {
    const qty = getOpexQty(item, option);
    const hasQty = qty !== null;
    const total = hasQty ? (qty * item.price) : 0;
    
    return `
      <tr>
        <td class="left">${item.name}</td>
        <td>${hasQty ? qty : '<span style="color:#999">Not provided</span>'}</td>
        <td>${item.unit}</td>
        <td>${item.price.toFixed(2)}</td>
        <td>${hasQty ? `<strong>${moneyMAD(total, 0)}</strong>` : '<span style="color:#999">—</span>'}</td>
      </tr>
    `;
  }).join('');
}

function calculateOpexConsumablesTotal() {
  const option = getProcurementOption();
  
  return OPEX_CONSUMABLES.reduce((sum, item) => {
    const qty = getOpexQty(item, option);
    if (qty === null) return sum; // Skip items with no quantity
    return sum + (qty * item.price);
  }, 0);
}

/* ---------------------------
   Main calc
   --------------------------- */

function calc() {
  syncCleaningNightMax();

  // Force working days to 23
  const workDaysPerMonthInput = $('secWorkDaysPerMonth');
  const clnDaysPerMonthInput = $('clnDaysPerMonth');
  const transportDaysInput = $('transportDaysPerMonth');
  
  if (workDaysPerMonthInput) workDaysPerMonthInput.value = WORKING_DAYS_PER_MONTH;
  if (clnDaysPerMonthInput) clnDaysPerMonthInput.value = WORKING_DAYS_PER_MONTH;
  if (transportDaysInput) transportDaysInput.value = WORKING_DAYS_PER_MONTH;

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
  const workDaysPerWeek = Math.max(1, Math.round(readNum("secWorkDaysPerWeek")));

  setText("secPaidHoursOut", paidHoursPerDay.toFixed(0));
  setText("secWorkDaysOut", `${WORKING_DAYS_PER_MONTH} days`);

  const weeks = splitDaysIntoWeeks(WORKING_DAYS_PER_MONTH, workDaysPerWeek);
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
  setText("clnReqHours", `${Math.round(clnAgents * clnHoursPerDay * WORKING_DAYS_PER_MONTH)} h`);

  const clnTeamMonthly = clnAgents * legalMonthlyHours * chargeableHourly;
  setText("clnOtAlert", "Cleaning: headcount-based pricing (no overtime computed in this version).");

  // =========================
  // CAPEX — render tables and calculate
  // =========================
  renderCapexTable();
  const capex = calculateCapexTotals();
  const includeCapex = readBool("includeCapex");

  // Update CAPEX display values
  setText("capexSecTotalDisplay", moneyMAD(capex.secTotal, 0));
  setText("capexClnPpeTotalDisplay", moneyMAD(capex.clnPpeTotal, 0));
  setText("capexEquipTotalDisplay", moneyMAD(capex.equipTotal, 0));
  setText("capexProductsTotalDisplay", moneyMAD(capex.prodTotal, 0));
  setText("capexDispensersTotalDisplay", moneyMAD(capex.dispTotal, 0));
  setText("capexUniformsTotalDisplay", moneyMAD(capex.uniTotal, 0));
  setText("capexGrandTotalDisplay", moneyMAD(capex.grandTotal, 0));

  // =========================
  // OPEX CONSUMABLES
  // =========================
  renderOpexConsumables();
  const consumablesTotal = calculateOpexConsumablesTotal();
  setText("opexConsumablesTotal", moneyMAD(consumablesTotal, 0));

  // =========================
  // TRANSPORT — OPEX
  // =========================
  const transportTripsPerDay = Math.max(0, Math.round(readNum("transportTripsPerDay")));
  const transportCostPerTrip = readNum("transportCostPerTrip");
  const transportBuses = Math.max(0, Math.round(readNum("transportBuses")));

  const transportMonthly = transportBuses * transportTripsPerDay * transportCostPerTrip * WORKING_DAYS_PER_MONTH;

  setText("transportMonthlyOut", moneyMAD(transportMonthly, 0));
  setText("transportMonthlySummary", moneyMAD(transportMonthly, 0));

  // =========================
  // OPEX totals
  // =========================
  const otherFixed = readNum("otherFixed");

  const opexOther = consumablesTotal + transportMonthly + otherFixed;
  const opexTotal = secTeamMonthly + clnTeamMonthly + opexOther;
  const opexAnnual = opexTotal * 12;
  const month1Total = includeCapex ? (opexTotal + capex.grandTotal) : opexTotal;

  // HERO KPIs
  setText("kpiCapexTotal", moneyMAD(capex.grandTotal, 0));
  setText("kpiOpexMonthly", moneyMAD(opexTotal, 0));
  setText("kpiMonth1", moneyMAD(month1Total, 0));

  // Right summary
  setText("secTeamMonthly", moneyMAD(secTeamMonthly, 0));
  setText("secTeamInfo", `Day: ${secDay} | Night: ${secNight} | Total: ${secTotalAgents}`);

  setText("clnTeamMonthly", moneyMAD(clnTeamMonthly, 0));
  setText("clnTeamInfo", `Total: ${clnAgents} | Night/Evening: ${clnNightAgents}`);

  setText("clnConsumablesMonthly", moneyMAD(consumablesTotal, 0));
  setText("opexTotal", moneyMAD(opexTotal, 0));
  setText("opexAnnual", `Annual OPEX (NET): ${moneyMAD(opexAnnual, 0)}`);

  // CAPEX panel (right side)
  setText("capexSec", moneyMAD(capex.secTotal, 0));
  setText("capexClnPpe", moneyMAD(capex.clnPpeTotal, 0));
  setText("capexEquip", moneyMAD(capex.equipTotal, 0));
  setText("capexProducts", moneyMAD(capex.prodTotal, 0));
  setText("capexDispensers", moneyMAD(capex.dispTotal, 0));
  setText("capexUniforms", moneyMAD(capex.uniTotal, 0));
  setText("capexTotal", moneyMAD(capex.grandTotal, 0));
  setText("month1Total", moneyMAD(month1Total, 0));
  setText("capexIncludedText", includeCapex ? "Yes" : "No");

  // Donut (Security / Cleaning / Other OPEX)
  setDonut(secTeamMonthly, clnTeamMonthly, opexOther);

  saveAll();
}

/* ---------------------------
   Bindings
   --------------------------- */

function bind() {
  // Input changes trigger calc
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

  // CAPEX toggle
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

  // Print button
  const printBtn = $("printBtn");
  if (printBtn) printBtn.addEventListener("click", () => window.print());

  // Reset button
  const resetBtn = $("resetBtn");
  if (resetBtn) resetBtn.addEventListener("click", resetDefaults);

  // Procurement option radio buttons
  const optionMin = $('optionMin');
  const optionFull = $('optionFull');
  if (optionMin) optionMin.addEventListener('change', calc);
  if (optionFull) optionFull.addEventListener('change', calc);
}

window.addEventListener("DOMContentLoaded", () => {
  loadSaved();
  bind();
  calc();
});
