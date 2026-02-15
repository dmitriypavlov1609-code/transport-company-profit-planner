const ids = [
  "activeVehicles", "tripsPerVehicle", "revenuePerTrip", "loadFactor", "otherRevenue",
  "fuelPerTrip", "driverPayroll", "maintenanceCost", "roadAndFees", "adminCost"
];

const elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
const calculateBtn = document.getElementById("calculateBtn");
const exportPdfBtn = document.getElementById("exportPdfBtn");
const demoBtn = document.getElementById("demoBtn");
const clearBtn = document.getElementById("clearBtn");
const results = document.getElementById("results");

const revenueValue = document.getElementById("revenueValue");
const costValue = document.getElementById("costValue");
const profitValue = document.getElementById("profitValue");
const marginValue = document.getElementById("marginValue");
const breakevenText = document.getElementById("breakevenText");
const scenarioTable = document.getElementById("scenarioTable");

const pdfReport = document.getElementById("pdfReport");
const pdfGeneratedAt = document.getElementById("pdfGeneratedAt");
const pdfMetrics = document.getElementById("pdfMetrics");
const pdfBreakeven = document.getElementById("pdfBreakeven");
const pdfScenarioTable = document.getElementById("pdfScenarioTable");

let lastCalculation = null;

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatRub(value) {
  return new Intl.NumberFormat("ru-RU").format(Math.round(value)) + " ₽";
}

function getState() {
  return Object.fromEntries(ids.map((id) => [id, num(elements[id].value)]));
}

function model(state, tripFactor = 1, revenueFactor = 1) {
  const trips = state.activeVehicles * state.tripsPerVehicle * tripFactor;
  const effectiveRevenuePerTrip = state.revenuePerTrip * (state.loadFactor / 100) * revenueFactor;
  const tripRevenue = trips * effectiveRevenuePerTrip;
  const totalRevenue = tripRevenue + state.otherRevenue;

  const fuelCost = trips * state.fuelPerTrip;
  const fixedCost = state.driverPayroll + state.maintenanceCost + state.roadAndFees + state.adminCost;
  const totalCost = fuelCost + fixedCost;

  const profit = totalRevenue - totalCost;
  const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

  return {
    trips,
    effectiveRevenuePerTrip,
    totalRevenue,
    totalCost,
    profit,
    margin,
    fixedCost
  };
}

function breakeven(state) {
  const effectiveRevenuePerTrip = state.revenuePerTrip * (state.loadFactor / 100);
  const contributionPerTrip = effectiveRevenuePerTrip - state.fuelPerTrip;
  const fixedCost = state.driverPayroll + state.maintenanceCost + state.roadAndFees + state.adminCost;
  const netFixedCost = Math.max(0, fixedCost - state.otherRevenue);

  if (contributionPerTrip <= 0) {
    return { trips: Infinity, perVehicle: Infinity };
  }

  const trips = netFixedCost / contributionPerTrip;
  const perVehicle = state.activeVehicles > 0 ? trips / state.activeVehicles : Infinity;
  return { trips, perVehicle };
}

function renderScenarios(state) {
  const scenarios = [
    { name: "Пессимистичный", tripFactor: 0.85, revenueFactor: 0.92 },
    { name: "Базовый", tripFactor: 1, revenueFactor: 1 },
    { name: "Оптимистичный", tripFactor: 1.12, revenueFactor: 1.07 }
  ];

  const rows = [];
  scenarioTable.innerHTML = "";

  for (const s of scenarios) {
    const result = model(state, s.tripFactor, s.revenueFactor);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.name}</td>
      <td>${Math.round(result.trips)}</td>
      <td>${formatRub(result.effectiveRevenuePerTrip)}</td>
      <td>${formatRub(result.profit)}</td>
    `;
    scenarioTable.appendChild(tr);

    rows.push({
      name: s.name,
      trips: Math.round(result.trips),
      tariff: result.effectiveRevenuePerTrip,
      profit: result.profit
    });
  }

  return rows;
}

function renderPdf(snapshot) {
  pdfGeneratedAt.textContent = `Сформирован: ${new Date(snapshot.generatedAt).toLocaleString("ru-RU")}`;

  pdfMetrics.innerHTML = "";
  const metrics = [
    `Месячная выручка: ${formatRub(snapshot.result.totalRevenue)}`,
    `Месячные расходы: ${formatRub(snapshot.result.totalCost)}`,
    `Ожидаемая прибыль: ${formatRub(snapshot.result.profit)}`,
    `Маржа: ${snapshot.result.margin.toFixed(1)}%`,
    `Рейсов в месяц: ${Math.round(snapshot.result.trips)}`
  ];

  for (const m of metrics) {
    const li = document.createElement("li");
    li.textContent = m;
    pdfMetrics.appendChild(li);
  }

  if (!Number.isFinite(snapshot.breakpoint.trips) || !Number.isFinite(snapshot.breakpoint.perVehicle)) {
    pdfBreakeven.textContent = "Точка безубыточности не считается: вклад одного рейса <= 0. Пересмотрите тариф или затраты на рейс.";
  } else {
    pdfBreakeven.textContent = `Для безубыточности нужно примерно ${Math.ceil(snapshot.breakpoint.trips)} рейсов в месяц (${snapshot.breakpoint.perVehicle.toFixed(1)} рейсов на машину).`;
  }

  pdfScenarioTable.innerHTML = "";
  for (const s of snapshot.scenarios) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.name}</td>
      <td>${s.trips}</td>
      <td>${formatRub(s.tariff)}</td>
      <td>${formatRub(s.profit)}</td>
    `;
    pdfScenarioTable.appendChild(tr);
  }
}

function calculate() {
  const state = getState();
  const result = model(state);
  const breakpoint = breakeven(state);
  const scenarios = renderScenarios(state);

  revenueValue.textContent = formatRub(result.totalRevenue);
  costValue.textContent = formatRub(result.totalCost);
  profitValue.textContent = formatRub(result.profit);
  marginValue.textContent = `${result.margin.toFixed(1)}%`;

  if (!Number.isFinite(breakpoint.trips) || !Number.isFinite(breakpoint.perVehicle)) {
    breakevenText.textContent = "Точка безубыточности не считается: вклад одного рейса <= 0. Пересмотрите тариф или затраты на рейс.";
  } else {
    breakevenText.textContent = `Для безубыточности нужно примерно ${Math.ceil(breakpoint.trips)} рейсов в месяц (${breakpoint.perVehicle.toFixed(1)} рейсов на машину).`;
  }

  lastCalculation = {
    generatedAt: Date.now(),
    state,
    result,
    breakpoint,
    scenarios
  };

  renderPdf(lastCalculation);
  results.classList.remove("hidden");
}

function exportPdf() {
  if (!lastCalculation) {
    calculate();
  }

  if (!lastCalculation) {
    return;
  }

  renderPdf(lastCalculation);
  pdfReport.classList.remove("hidden");
  window.print();
  pdfReport.classList.add("hidden");
}

function loadDemo() {
  const demo = {
    activeVehicles: 26,
    tripsPerVehicle: 38,
    revenuePerTrip: 18500,
    loadFactor: 84,
    otherRevenue: 260000,
    fuelPerTrip: 4700,
    driverPayroll: 1980000,
    maintenanceCost: 510000,
    roadAndFees: 290000,
    adminCost: 370000
  };

  for (const [key, value] of Object.entries(demo)) {
    elements[key].value = value;
  }

  calculate();
}

function resetAll() {
  for (const id of ids) {
    elements[id].value = 0;
  }
  elements.activeVehicles.value = 18;
  elements.tripsPerVehicle.value = 42;
  elements.revenuePerTrip.value = 16500;
  elements.loadFactor.value = 82;
  results.classList.add("hidden");
  pdfReport.classList.add("hidden");
  lastCalculation = null;
}

calculateBtn.addEventListener("click", calculate);
exportPdfBtn.addEventListener("click", exportPdf);
demoBtn.addEventListener("click", loadDemo);
clearBtn.addEventListener("click", resetAll);
