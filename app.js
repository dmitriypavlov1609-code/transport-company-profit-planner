const ids = [
  "activeVehicles", "tripsPerVehicle", "revenuePerTrip", "loadFactor", "aggregatorCommission", "otherRevenue", "cashCollectionRate",
  "fuelPerTrip", "driverPayroll", "officePayroll", "maintenanceCost", "roadAndFees", "adminCost",
  "insuranceLicenses", "softwareDispatch", "leasingPayments", "taxRate", "capex", "loanPayments"
];

const SNAPSHOT_KEY = "transportPlannerSnapshotV1";

const elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
const calculateBtn = document.getElementById("calculateBtn");
const openReportBtn = document.getElementById("openReportBtn");
const exportPdfBtn = document.getElementById("exportPdfBtn");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const exportJsonBtn = document.getElementById("exportJsonBtn");
const exportTxtBtn = document.getElementById("exportTxtBtn");
const demoBtn = document.getElementById("demoBtn");
const clearBtn = document.getElementById("clearBtn");
const results = document.getElementById("results");

const revenueValue = document.getElementById("revenueValue");
const costValue = document.getElementById("costValue");
const profitValue = document.getElementById("profitValue");
const marginValue = document.getElementById("marginValue");
const breakevenText = document.getElementById("breakevenText");
const scenarioTable = document.getElementById("scenarioTable");

let lastCalculation = null;

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatRub(value) {
  return new Intl.NumberFormat("ru-RU").format(Math.round(value)) + " ₽";
}

function timestampSlug() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getState() {
  return Object.fromEntries(ids.map((id) => [id, num(elements[id].value)]));
}

function model(state, tripFactor = 1, revenueFactor = 1) {
  const trips = state.activeVehicles * state.tripsPerVehicle * tripFactor;
  const grossTariffPerTrip = state.revenuePerTrip * (state.loadFactor / 100) * revenueFactor;
  const netTariffPerTrip = grossTariffPerTrip * (1 - state.aggregatorCommission / 100);

  const grossTripRevenue = trips * grossTariffPerTrip;
  const aggregatorFee = grossTripRevenue - trips * netTariffPerTrip;
  const netTripRevenue = trips * netTariffPerTrip;
  const totalRevenue = netTripRevenue + state.otherRevenue;

  const variableCost = trips * state.fuelPerTrip;
  const fixedOperatingCost =
    state.driverPayroll + state.officePayroll + state.maintenanceCost + state.roadAndFees + state.adminCost +
    state.insuranceLicenses + state.softwareDispatch + state.leasingPayments;

  const totalOperatingCost = variableCost + fixedOperatingCost;

  const grossProfit = totalRevenue - variableCost;
  const ebitda = totalRevenue - totalOperatingCost;
  const tax = Math.max(0, ebitda) * (state.taxRate / 100);
  const netProfit = ebitda - tax;

  const cashIn = totalRevenue * (state.cashCollectionRate / 100);
  const cashOut = totalOperatingCost + tax + state.capex + state.loanPayments;
  const netCashFlow = cashIn - cashOut;

  return {
    trips,
    grossTariffPerTrip,
    netTariffPerTrip,
    grossTripRevenue,
    aggregatorFee,
    netTripRevenue,
    totalRevenue,
    variableCost,
    fixedOperatingCost,
    totalOperatingCost,
    grossProfit,
    ebitda,
    tax,
    netProfit,
    cashIn,
    cashOut,
    netCashFlow,
    margin: totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0
  };
}

function breakeven(state) {
  const grossTariffPerTrip = state.revenuePerTrip * (state.loadFactor / 100);
  const netTariffPerTrip = grossTariffPerTrip * (1 - state.aggregatorCommission / 100);
  const contributionPerTrip = netTariffPerTrip - state.fuelPerTrip;

  const fixedApprox =
    state.driverPayroll + state.officePayroll + state.maintenanceCost + state.roadAndFees + state.adminCost +
    state.insuranceLicenses + state.softwareDispatch + state.leasingPayments;

  const fixedNet = Math.max(0, fixedApprox - state.otherRevenue);

  if (contributionPerTrip <= 0) {
    return { trips: Infinity, perVehicle: Infinity };
  }

  const trips = fixedNet / contributionPerTrip;
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
      <td>${formatRub(result.netTariffPerTrip)}</td>
      <td>${formatRub(result.netProfit)}</td>
    `;
    scenarioTable.appendChild(tr);

    rows.push({
      name: s.name,
      trips: Math.round(result.trips),
      tariff: result.netTariffPerTrip,
      profit: result.netProfit
    });
  }

  return rows;
}

function toExportObject(snapshot) {
  return {
    generatedAt: new Date(snapshot.generatedAt).toISOString(),
    inputs: snapshot.state,
    metrics: {
      monthlyRevenueNet: Math.round(snapshot.result.totalRevenue),
      monthlyOperatingCost: Math.round(snapshot.result.totalOperatingCost),
      netProfit: Math.round(snapshot.result.netProfit),
      marginPercent: Number(snapshot.result.margin.toFixed(1)),
      tripsPerMonth: Math.round(snapshot.result.trips),
      aggregatorFee: Math.round(snapshot.result.aggregatorFee)
    },
    pnl: {
      revenueNet: Math.round(snapshot.result.totalRevenue),
      variableCost: Math.round(snapshot.result.variableCost),
      grossProfit: Math.round(snapshot.result.grossProfit),
      fixedOperatingCost: Math.round(snapshot.result.fixedOperatingCost),
      ebitda: Math.round(snapshot.result.ebitda),
      tax: Math.round(snapshot.result.tax),
      netProfit: Math.round(snapshot.result.netProfit)
    },
    cashflow: {
      cashIn: Math.round(snapshot.result.cashIn),
      cashOut: Math.round(snapshot.result.cashOut),
      netCashFlow: Math.round(snapshot.result.netCashFlow)
    },
    breakeven: {
      trips: Number.isFinite(snapshot.breakpoint.trips) ? Number(snapshot.breakpoint.trips.toFixed(2)) : null,
      tripsPerVehicle: Number.isFinite(snapshot.breakpoint.perVehicle) ? Number(snapshot.breakpoint.perVehicle.toFixed(2)) : null
    },
    scenarios: snapshot.scenarios.map((s) => ({
      scenario: s.name,
      trips: s.trips,
      tariffRub: Math.round(s.tariff),
      netProfitRub: Math.round(s.profit)
    }))
  };
}

function persistSnapshot() {
  if (!lastCalculation) {
    return;
  }
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(toExportObject(lastCalculation)));
}

function calculate() {
  const state = getState();
  const result = model(state);
  const breakpoint = breakeven(state);
  const scenarios = renderScenarios(state);

  revenueValue.textContent = formatRub(result.totalRevenue);
  costValue.textContent = formatRub(result.totalOperatingCost);
  profitValue.textContent = formatRub(result.netProfit);
  marginValue.textContent = `${result.margin.toFixed(1)}%`;

  if (!Number.isFinite(breakpoint.trips) || !Number.isFinite(breakpoint.perVehicle)) {
    breakevenText.textContent = "Точка безубыточности не считается: вклад одного рейса <= 0. Пересмотрите тариф, комиссию агрегатора или затраты на рейс.";
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

  persistSnapshot();
  results.classList.remove("hidden");
}

function ensureCalculation() {
  if (!lastCalculation) {
    calculate();
  }
  return Boolean(lastCalculation);
}

function exportPdf() {
  if (!ensureCalculation()) {
    return;
  }

  const payload = toExportObject(lastCalculation);
  const jsPdf = window.jspdf?.jsPDF;
  if (!jsPdf) {
    alert("PDF библиотека не загружена. Используйте CSV/JSON/TXT или обновите страницу.");
    return;
  }

  const doc = new jsPdf({ unit: "pt", format: "a4" });
  let y = 40;
  const step = 18;
  const maxWidth = 520;

  const write = (text, size = 11, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(String(text), maxWidth);
    doc.text(lines, 40, y);
    y += lines.length * step;
    if (y > 780) {
      doc.addPage();
      y = 40;
    }
  };

  write("Transport Company Profit Report", 16, true);
  write(`Generated at: ${new Date(lastCalculation.generatedAt).toLocaleString("ru-RU")}`);
  y += 8;
  write("Key Metrics", 13, true);
  write(`Revenue net: ${formatRub(payload.metrics.monthlyRevenueNet)}`);
  write(`Operating cost: ${formatRub(payload.metrics.monthlyOperatingCost)}`);
  write(`Net profit: ${formatRub(payload.metrics.netProfit)}`);
  write(`Margin: ${payload.metrics.marginPercent}%`);
  write(`Aggregator fee: ${formatRub(payload.metrics.aggregatorFee)}`);
  y += 8;
  write("P&L", 13, true);
  write(`Revenue net: ${formatRub(payload.pnl.revenueNet)}`);
  write(`Variable cost: ${formatRub(payload.pnl.variableCost)}`);
  write(`Gross profit: ${formatRub(payload.pnl.grossProfit)}`);
  write(`Fixed operating cost: ${formatRub(payload.pnl.fixedOperatingCost)}`);
  write(`EBITDA: ${formatRub(payload.pnl.ebitda)}`);
  write(`Tax: ${formatRub(payload.pnl.tax)}`);
  write(`Net profit: ${formatRub(payload.pnl.netProfit)}`);
  y += 8;
  write("Cash Flow", 13, true);
  write(`Cash in: ${formatRub(payload.cashflow.cashIn)}`);
  write(`Cash out: ${formatRub(payload.cashflow.cashOut)}`);
  write(`Net cash flow: ${formatRub(payload.cashflow.netCashFlow)}`);

  doc.save(`transport_profit_report_${timestampSlug()}.pdf`);
}

function exportCsv() {
  if (!ensureCalculation()) {
    return;
  }

  const payload = toExportObject(lastCalculation);
  const lines = [
    "section,key,value",
    `metrics,monthlyRevenueNet,${payload.metrics.monthlyRevenueNet}`,
    `metrics,monthlyOperatingCost,${payload.metrics.monthlyOperatingCost}`,
    `metrics,netProfit,${payload.metrics.netProfit}`,
    `metrics,marginPercent,${payload.metrics.marginPercent}`,
    `metrics,tripsPerMonth,${payload.metrics.tripsPerMonth}`,
    `metrics,aggregatorFee,${payload.metrics.aggregatorFee}`,
    `pnl,revenueNet,${payload.pnl.revenueNet}`,
    `pnl,variableCost,${payload.pnl.variableCost}`,
    `pnl,grossProfit,${payload.pnl.grossProfit}`,
    `pnl,fixedOperatingCost,${payload.pnl.fixedOperatingCost}`,
    `pnl,ebitda,${payload.pnl.ebitda}`,
    `pnl,tax,${payload.pnl.tax}`,
    `pnl,netProfit,${payload.pnl.netProfit}`,
    `cashflow,cashIn,${payload.cashflow.cashIn}`,
    `cashflow,cashOut,${payload.cashflow.cashOut}`,
    `cashflow,netCashFlow,${payload.cashflow.netCashFlow}`,
    `breakeven,trips,${payload.breakeven.trips ?? ""}`,
    `breakeven,tripsPerVehicle,${payload.breakeven.tripsPerVehicle ?? ""}`
  ];

  payload.scenarios.forEach((s, idx) => {
    lines.push(`scenario_${idx + 1},name,${s.scenario}`);
    lines.push(`scenario_${idx + 1},trips,${s.trips}`);
    lines.push(`scenario_${idx + 1},tariffRub,${s.tariffRub}`);
    lines.push(`scenario_${idx + 1},netProfitRub,${s.netProfitRub}`);
  });

  downloadFile(`transport_profit_report_${timestampSlug()}.csv`, lines.join("\n"), "text/csv;charset=utf-8");
}

function exportJson() {
  if (!ensureCalculation()) {
    return;
  }
  const payload = toExportObject(lastCalculation);
  downloadFile(`transport_profit_report_${timestampSlug()}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
}

function exportTxt() {
  if (!ensureCalculation()) {
    return;
  }

  const payload = toExportObject(lastCalculation);
  const rows = [
    "Отчет по прибыльности транспортной компании",
    `Сформирован: ${new Date(lastCalculation.generatedAt).toLocaleString("ru-RU")}`,
    "",
    "Ключевые показатели:",
    `- Выручка (нетто): ${formatRub(payload.metrics.monthlyRevenueNet)}`,
    `- Операционные расходы: ${formatRub(payload.metrics.monthlyOperatingCost)}`,
    `- Чистая прибыль: ${formatRub(payload.metrics.netProfit)}`,
    `- Маржа: ${payload.metrics.marginPercent}%`,
    `- Комиссия агрегатора: ${formatRub(payload.metrics.aggregatorFee)}`,
    "",
    "P&L:",
    `- Выручка (нетто): ${formatRub(payload.pnl.revenueNet)}`,
    `- Переменные затраты: ${formatRub(payload.pnl.variableCost)}`,
    `- Валовая прибыль: ${formatRub(payload.pnl.grossProfit)}`,
    `- Фиксированные операционные: ${formatRub(payload.pnl.fixedOperatingCost)}`,
    `- EBITDA: ${formatRub(payload.pnl.ebitda)}`,
    `- Налоги: ${formatRub(payload.pnl.tax)}`,
    `- Чистая прибыль: ${formatRub(payload.pnl.netProfit)}`,
    "",
    "ДДС:",
    `- Денежные поступления: ${formatRub(payload.cashflow.cashIn)}`,
    `- Денежные выплаты: ${formatRub(payload.cashflow.cashOut)}`,
    `- Чистый денежный поток: ${formatRub(payload.cashflow.netCashFlow)}`
  ];
  downloadFile(`transport_profit_report_${timestampSlug()}.txt`, rows.join("\n"), "text/plain;charset=utf-8");
}

function openReportPage() {
  if (!ensureCalculation()) {
    return;
  }
  window.location.href = "report.html";
}

function loadDemo() {
  const demo = {
    activeVehicles: 26,
    tripsPerVehicle: 38,
    revenuePerTrip: 18500,
    loadFactor: 84,
    aggregatorCommission: 11,
    otherRevenue: 260000,
    cashCollectionRate: 90,
    fuelPerTrip: 4700,
    driverPayroll: 1980000,
    officePayroll: 610000,
    maintenanceCost: 510000,
    roadAndFees: 290000,
    adminCost: 370000,
    insuranceLicenses: 180000,
    softwareDispatch: 110000,
    leasingPayments: 420000,
    taxRate: 20,
    capex: 260000,
    loanPayments: 190000
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
  elements.aggregatorCommission.value = 12;
  elements.cashCollectionRate.value = 88;
  elements.taxRate.value = 20;
  results.classList.add("hidden");
  lastCalculation = null;
  localStorage.removeItem(SNAPSHOT_KEY);
}

calculateBtn.addEventListener("click", calculate);
openReportBtn.addEventListener("click", openReportPage);
exportPdfBtn.addEventListener("click", exportPdf);
exportCsvBtn.addEventListener("click", exportCsv);
exportJsonBtn.addEventListener("click", exportJson);
exportTxtBtn.addEventListener("click", exportTxt);
demoBtn.addEventListener("click", loadDemo);
clearBtn.addEventListener("click", resetAll);
