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
const revenuePreview = document.getElementById("revenuePreview");

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

  const variableFuelCost = trips * state.fuelPerTrip;
  // Себестоимость: топливо + зарплата водителей + комиссия агрегатора.
  const costOfSales = variableFuelCost + state.driverPayroll + aggregatorFee;
  // Операционные расходы: все прочие расходы, кроме налогов и амортизации.
  const operatingExpenses =
    state.officePayroll + state.maintenanceCost + state.roadAndFees + state.adminCost +
    state.insuranceLicenses + state.softwareDispatch + state.leasingPayments;

  const totalOperatingCost = costOfSales + operatingExpenses;

  const grossProfit = totalRevenue - costOfSales;
  const ebitda = grossProfit - operatingExpenses;
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
    variableFuelCost,
    costOfSales,
    operatingExpenses,
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

function updateRevenuePreview() {
  const state = getState();
  const result = model(state);
  revenuePreview.value = formatRub(result.totalRevenue);
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
      monthlyTotalExpense: Math.round(snapshot.result.totalOperatingCost),
      netProfit: Math.round(snapshot.result.netProfit),
      marginPercent: Number(snapshot.result.margin.toFixed(1)),
      tripsPerMonth: Math.round(snapshot.result.trips),
      aggregatorFee: Math.round(snapshot.result.aggregatorFee)
    },
    pnl: {
      revenueNet: Math.round(snapshot.result.totalRevenue),
      costOfSales: Math.round(snapshot.result.costOfSales),
      grossProfit: Math.round(snapshot.result.grossProfit),
      operatingExpenses: Math.round(snapshot.result.operatingExpenses),
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

function toRussianExportObject(payload) {
  return {
    сформирован: payload.generatedAt,
    входные_данные: payload.inputs,
    ключевые_показатели: {
      выручка_нетто_в_месяц: payload.metrics.monthlyRevenueNet,
      совокупные_расходы_в_месяц: payload.metrics.monthlyTotalExpense,
      чистая_прибыль: payload.metrics.netProfit,
      маржа_процентов: payload.metrics.marginPercent,
      рейсов_в_месяц: payload.metrics.tripsPerMonth,
      комиссия_агрегатора: payload.metrics.aggregatorFee
    },
    опиу: {
      выручка_нетто: payload.pnl.revenueNet,
      себестоимость: payload.pnl.costOfSales,
      валовая_прибыль: payload.pnl.grossProfit,
      операционные_расходы: payload.pnl.operatingExpenses,
      ebitda: payload.pnl.ebitda,
      налоги: payload.pnl.tax,
      чистая_прибыль: payload.pnl.netProfit
    },
    ддс: {
      денежные_поступления: payload.cashflow.cashIn,
      денежные_выплаты: payload.cashflow.cashOut,
      чистый_денежный_поток: payload.cashflow.netCashFlow
    },
    безубыточность: {
      рейсов: payload.breakeven.trips,
      рейсов_на_машину: payload.breakeven.tripsPerVehicle
    },
    сценарии: payload.scenarios.map((s) => ({
      сценарий: s.scenario,
      рейсов: s.trips,
      тариф_руб: s.tariffRub,
      чистая_прибыль_руб: s.netProfitRub
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
  updateRevenuePreview();
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

  write("Отчет по прибыльности транспортной компании", 16, true);
  write(`Сформирован: ${new Date(lastCalculation.generatedAt).toLocaleString("ru-RU")}`);
  y += 8;
  write("Ключевые показатели", 13, true);
  write(`Выручка (нетто): ${formatRub(payload.metrics.monthlyRevenueNet)}`);
  write(`Совокупные расходы: ${formatRub(payload.metrics.monthlyTotalExpense)}`);
  write(`Чистая прибыль: ${formatRub(payload.metrics.netProfit)}`);
  write(`Маржа: ${payload.metrics.marginPercent}%`);
  write(`Комиссия агрегатора: ${formatRub(payload.metrics.aggregatorFee)}`);
  y += 8;
  write("ОПиУ", 13, true);
  write(`Выручка (нетто): ${formatRub(payload.pnl.revenueNet)}`);
  write(`Себестоимость: ${formatRub(payload.pnl.costOfSales)}`);
  write(`Валовая прибыль: ${formatRub(payload.pnl.grossProfit)}`);
  write(`Операционные расходы: ${formatRub(payload.pnl.operatingExpenses)}`);
  write(`EBITDA: ${formatRub(payload.pnl.ebitda)}`);
  write(`Налоги: ${formatRub(payload.pnl.tax)}`);
  write(`Чистая прибыль: ${formatRub(payload.pnl.netProfit)}`);
  y += 8;
  write("ДДС", 13, true);
  write(`Денежные поступления: ${formatRub(payload.cashflow.cashIn)}`);
  write(`Денежные выплаты: ${formatRub(payload.cashflow.cashOut)}`);
  write(`Чистый денежный поток: ${formatRub(payload.cashflow.netCashFlow)}`);

  doc.save(`otchet_transportnoy_kompanii_${timestampSlug()}.pdf`);
}

function exportCsv() {
  if (!ensureCalculation()) {
    return;
  }

  const payload = toExportObject(lastCalculation);
  const lines = [
    "раздел,показатель,значение",
    `ключевые_показатели,выручка_нетто_в_месяц,${payload.metrics.monthlyRevenueNet}`,
    `ключевые_показатели,совокупные_расходы_в_месяц,${payload.metrics.monthlyTotalExpense}`,
    `ключевые_показатели,чистая_прибыль,${payload.metrics.netProfit}`,
    `ключевые_показатели,маржа_процентов,${payload.metrics.marginPercent}`,
    `ключевые_показатели,рейсов_в_месяц,${payload.metrics.tripsPerMonth}`,
    `ключевые_показатели,комиссия_агрегатора,${payload.metrics.aggregatorFee}`,
    `опиу,выручка_нетто,${payload.pnl.revenueNet}`,
    `опиу,себестоимость,${payload.pnl.costOfSales}`,
    `опиу,валовая_прибыль,${payload.pnl.grossProfit}`,
    `опиу,операционные_расходы,${payload.pnl.operatingExpenses}`,
    `опиу,ebitda,${payload.pnl.ebitda}`,
    `опиу,налоги,${payload.pnl.tax}`,
    `опиу,чистая_прибыль,${payload.pnl.netProfit}`,
    `ддс,денежные_поступления,${payload.cashflow.cashIn}`,
    `ддс,денежные_выплаты,${payload.cashflow.cashOut}`,
    `ддс,чистый_денежный_поток,${payload.cashflow.netCashFlow}`,
    `безубыточность,рейсов,${payload.breakeven.trips ?? ""}`,
    `безубыточность,рейсов_на_машину,${payload.breakeven.tripsPerVehicle ?? ""}`
  ];

  payload.scenarios.forEach((s, idx) => {
    lines.push(`сценарий_${idx + 1},название,${s.scenario}`);
    lines.push(`сценарий_${idx + 1},рейсов,${s.trips}`);
    lines.push(`сценарий_${idx + 1},тариф_руб,${s.tariffRub}`);
    lines.push(`сценарий_${idx + 1},чистая_прибыль_руб,${s.netProfitRub}`);
  });

  downloadFile(`otchet_transportnoy_kompanii_${timestampSlug()}.csv`, lines.join("\n"), "text/csv;charset=utf-8");
}

function exportJson() {
  if (!ensureCalculation()) {
    return;
  }
  const payload = toExportObject(lastCalculation);
  const russianPayload = toRussianExportObject(payload);
  downloadFile(`otchet_transportnoy_kompanii_${timestampSlug()}.json`, JSON.stringify(russianPayload, null, 2), "application/json;charset=utf-8");
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
    `- Совокупные расходы: ${formatRub(payload.metrics.monthlyTotalExpense)}`,
    `- Чистая прибыль: ${formatRub(payload.metrics.netProfit)}`,
    `- Маржа: ${payload.metrics.marginPercent}%`,
    `- Комиссия агрегатора: ${formatRub(payload.metrics.aggregatorFee)}`,
    "",
    "P&L:",
    `- Выручка (нетто): ${formatRub(payload.pnl.revenueNet)}`,
    `- Себестоимость: ${formatRub(payload.pnl.costOfSales)}`,
    `- Валовая прибыль: ${formatRub(payload.pnl.grossProfit)}`,
    `- Операционные расходы: ${formatRub(payload.pnl.operatingExpenses)}`,
    `- EBITDA: ${formatRub(payload.pnl.ebitda)}`,
    `- Налоги: ${formatRub(payload.pnl.tax)}`,
    `- Чистая прибыль: ${formatRub(payload.pnl.netProfit)}`,
    "",
    "ДДС:",
    `- Денежные поступления: ${formatRub(payload.cashflow.cashIn)}`,
    `- Денежные выплаты: ${formatRub(payload.cashflow.cashOut)}`,
    `- Чистый денежный поток: ${formatRub(payload.cashflow.netCashFlow)}`
  ];
  downloadFile(`otchet_transportnoy_kompanii_${timestampSlug()}.txt`, rows.join("\n"), "text/plain;charset=utf-8");
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
  updateRevenuePreview();
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
  updateRevenuePreview();
}

calculateBtn.addEventListener("click", calculate);
openReportBtn.addEventListener("click", openReportPage);
exportPdfBtn.addEventListener("click", exportPdf);
exportCsvBtn.addEventListener("click", exportCsv);
exportJsonBtn.addEventListener("click", exportJson);
exportTxtBtn.addEventListener("click", exportTxt);
demoBtn.addEventListener("click", loadDemo);
clearBtn.addEventListener("click", resetAll);

for (const id of ids) {
  elements[id].addEventListener("input", updateRevenuePreview);
}

updateRevenuePreview();
