const ids = [
  "activeVehicles", "tripsPerVehicle", "revenuePerTrip", "aggregatorCommission", "otherRevenue", "cashCollectionRate",
  "fuelPerTrip", "driverPayroll", "officePayroll", "maintenanceCost", "roadAndFees", "adminCost",
  "insuranceLicenses", "softwareDispatch", "leasingPayments", "taxRate", "capex", "loanPayments"
];

const SNAPSHOT_KEY = "transportPlannerSnapshotV1";
const FORM_STATE_KEY = "transportPlannerFormStateV1";

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
const revenueTarget = document.getElementById("revenueTarget");
const totalExpensesAuto = document.getElementById("totalExpensesAuto");

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

function persistFormState() {
  const payload = {
    inputs: getState(),
    revenueTarget: num(revenueTarget.value)
  };
  localStorage.setItem(FORM_STATE_KEY, JSON.stringify(payload));
}

function applyFormState(payload) {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const inputs = payload.inputs;
  if (!inputs || typeof inputs !== "object") {
    return false;
  }
  for (const id of ids) {
    if (Object.prototype.hasOwnProperty.call(inputs, id)) {
      elements[id].value = num(inputs[id]);
    }
  }
  revenueTarget.value = num(payload.revenueTarget);
  return true;
}

function restoreFormState() {
  const raw = localStorage.getItem(FORM_STATE_KEY);
  if (!raw) {
    return false;
  }
  try {
    return applyFormState(JSON.parse(raw));
  } catch {
    return false;
  }
}

function restoreFormStateFromSnapshot() {
  const raw = localStorage.getItem(SNAPSHOT_KEY);
  if (!raw) {
    return false;
  }
  try {
    const snapshot = JSON.parse(raw);
    if (!snapshot || typeof snapshot !== "object" || !snapshot.inputs) {
      return false;
    }
    const fallbackForm = {
      inputs: snapshot.inputs,
      revenueTarget: snapshot.metrics?.monthlyRevenueNet ?? 0
    };
    return applyFormState(fallbackForm);
  } catch {
    return false;
  }
}

function model(state, tripFactor = 1, revenueFactor = 1) {
  const trips = state.activeVehicles * state.tripsPerVehicle * tripFactor;
  const grossTariffPerTrip = state.revenuePerTrip * revenueFactor;
  const commissionRate = state.aggregatorCommission / 100;
  const netTariffPerTrip = grossTariffPerTrip * (1 - commissionRate);

  const grossTripRevenue = trips * grossTariffPerTrip;
  const totalRevenue = grossTripRevenue + state.otherRevenue;
  const aggregatorFee = totalRevenue * commissionRate;
  const netTripRevenue = grossTripRevenue - grossTripRevenue * commissionRate;

  const variableFuelCost = trips * state.fuelPerTrip;
  // Себестоимость: зарплата водителей + комиссия агрегатора.
  const costOfSales = state.driverPayroll + aggregatorFee;
  // Прочие операционные расходы (без себестоимости, налогов и амортизации).
  const otherOperatingExpenses =
    variableFuelCost + state.officePayroll + state.maintenanceCost + state.roadAndFees + state.adminCost +
    state.insuranceLicenses + state.softwareDispatch + state.leasingPayments;
  // Операционные расходы (все кроме налогов и амортизации).
  const operatingExpenses = costOfSales + otherOperatingExpenses;

  const grossProfit = totalRevenue - costOfSales;
  const ebitda = grossProfit - otherOperatingExpenses;
  const tax = Math.max(0, ebitda) * (state.taxRate / 100);
  const netProfit = ebitda - tax;

  const cashIn = totalRevenue * (state.cashCollectionRate / 100);
  const cashOut = operatingExpenses + tax + state.capex + state.loanPayments;
  const netCashFlow = cashIn - cashOut;

  return {
    trips,
    grossTariffPerTrip,
    netTariffPerTrip,
    grossTripRevenue,
    aggregatorFee,
    driverPayrollCost: state.driverPayroll,
    netTripRevenue,
    totalRevenue,
    variableFuelCost,
    costOfSales,
    otherOperatingExpenses,
    operatingExpenses,
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

function updateAutoExpensesFromState() {
  if (num(revenueTarget.value) > 0) {
    applyRevenueTarget();
  }
  const state = getState();
  const result = model(state);
  totalExpensesAuto.value = formatRub(result.operatingExpenses);
}

function updateRevenueTargetFromState() {
  const state = getState();
  const result = model(state);
  revenueTarget.value = Math.round(result.totalRevenue);
}

function applyRevenueTarget() {
  const state = getState();
  const targetRevenue = num(revenueTarget.value);
  const grossTariffPerTrip = state.revenuePerTrip;
  const baseTripsPerVehicle = 50;

  if (grossTariffPerTrip <= 0) {
    return;
  }

  const requiredTripRevenue = Math.max(0, targetRevenue - state.otherRevenue);
  const requiredTrips = requiredTripRevenue / grossTariffPerTrip;

  const vehicles = Math.max(1, Math.ceil(requiredTrips / baseTripsPerVehicle));
  const tripsPerVehicle = vehicles > 0 ? requiredTrips / vehicles : 0;

  elements.activeVehicles.value = vehicles;
  elements.tripsPerVehicle.value = Math.max(0, Number(tripsPerVehicle.toFixed(1)));
}

function breakeven(state) {
  const grossTariffPerTrip = state.revenuePerTrip;
  const commissionRate = state.aggregatorCommission / 100;
  const netTariffPerTrip = grossTariffPerTrip * (1 - commissionRate);
  const contributionPerTrip = netTariffPerTrip - state.fuelPerTrip;

  const fixedApprox =
    state.driverPayroll + state.officePayroll + state.maintenanceCost + state.roadAndFees + state.adminCost +
    state.insuranceLicenses + state.softwareDispatch + state.leasingPayments;

  const fixedNet = Math.max(0, fixedApprox - state.otherRevenue * (1 - commissionRate));

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
      monthlyTotalExpense: Math.round(snapshot.result.operatingExpenses),
      netProfit: Math.round(snapshot.result.netProfit),
      marginPercent: Number(snapshot.result.margin.toFixed(1)),
      tripsPerMonth: Math.round(snapshot.result.trips),
      aggregatorFee: Math.round(snapshot.result.aggregatorFee)
    },
    pnl: {
      revenueNet: Math.round(snapshot.result.totalRevenue),
      costOfSales: Math.round(snapshot.result.costOfSales),
      costOfSalesAggregatorFee: Math.round(snapshot.result.aggregatorFee),
      costOfSalesDriverPayroll: Math.round(snapshot.result.driverPayrollCost),
      grossProfit: Math.round(snapshot.result.grossProfit),
      operatingFuel: Math.round(snapshot.result.variableFuelCost),
      operatingOfficePayroll: Math.round(snapshot.state.officePayroll),
      operatingMaintenance: Math.round(snapshot.state.maintenanceCost),
      operatingRoadAndFees: Math.round(snapshot.state.roadAndFees),
      operatingAdmin: Math.round(snapshot.state.adminCost),
      operatingInsuranceLicenses: Math.round(snapshot.state.insuranceLicenses),
      operatingSoftwareDispatch: Math.round(snapshot.state.softwareDispatch),
      operatingLeasing: Math.round(snapshot.state.leasingPayments),
      otherOperatingExpenses: Math.round(snapshot.result.otherOperatingExpenses),
      operatingExpenses: Math.round(snapshot.result.otherOperatingExpenses),
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
      себестоимость_комиссия_агрегатора: payload.pnl.costOfSalesAggregatorFee,
      себестоимость_зарплата_водителей: payload.pnl.costOfSalesDriverPayroll,
      валовая_прибыль: payload.pnl.grossProfit,
      операционные_расходы: payload.pnl.operatingExpenses,
      операционные_расходы_топливо: payload.pnl.operatingFuel,
      операционные_расходы_зарплата_офиса: payload.pnl.operatingOfficePayroll,
      операционные_расходы_то_и_ремонт: payload.pnl.operatingMaintenance,
      операционные_расходы_дороги_и_сборы: payload.pnl.operatingRoadAndFees,
      операционные_расходы_административные: payload.pnl.operatingAdmin,
      операционные_расходы_страховки_и_лицензии: payload.pnl.operatingInsuranceLicenses,
      операционные_расходы_по_диспетчеризации_и_по: payload.pnl.operatingSoftwareDispatch,
      операционные_расходы_лизинг: payload.pnl.operatingLeasing,
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
  if (num(revenueTarget.value) > 0) {
    applyRevenueTarget();
  }
  const state = getState();
  const result = model(state);
  const breakpoint = breakeven(state);
  const scenarios = renderScenarios(state);

  revenueValue.textContent = formatRub(result.totalRevenue);
  costValue.textContent = formatRub(result.operatingExpenses);
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
  persistFormState();
  totalExpensesAuto.value = formatRub(result.operatingExpenses);
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
  write(`Себестоимость (комиссия агрегатора + ЗП водителей): ${formatRub(payload.pnl.costOfSales)}`);
  write(`Комиссия агрегатора в себестоимости: ${formatRub(payload.pnl.costOfSalesAggregatorFee)}`);
  write(`Зарплата водителей в себестоимости: ${formatRub(payload.pnl.costOfSalesDriverPayroll)}`);
  write(`Валовая прибыль: ${formatRub(payload.pnl.grossProfit)}`);
  write(`Операционные расходы: ${formatRub(payload.pnl.operatingExpenses)}`);
  write(`  Топливо: ${formatRub(payload.pnl.operatingFuel)}`);
  write(`  Зарплаты офиса: ${formatRub(payload.pnl.operatingOfficePayroll)}`);
  write(`  ТО и ремонт: ${formatRub(payload.pnl.operatingMaintenance)}`);
  write(`  Дороги и сборы: ${formatRub(payload.pnl.operatingRoadAndFees)}`);
  write(`  Административные: ${formatRub(payload.pnl.operatingAdmin)}`);
  write(`  Страховки и лицензии: ${formatRub(payload.pnl.operatingInsuranceLicenses)}`);
  write(`  Диспетчеризация и ПО: ${formatRub(payload.pnl.operatingSoftwareDispatch)}`);
  write(`  Лизинг: ${formatRub(payload.pnl.operatingLeasing)}`);
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
    `опиу,себестоимость_(комиссия_агрегатора_+_зп_водителей),${payload.pnl.costOfSales}`,
    `опиу,комиссия_агрегатора_в_себестоимости,${payload.pnl.costOfSalesAggregatorFee}`,
    `опиу,зарплата_водителей_в_себестоимости,${payload.pnl.costOfSalesDriverPayroll}`,
    `опиу,валовая_прибыль,${payload.pnl.grossProfit}`,
    `опиу,операционные_расходы,${payload.pnl.operatingExpenses}`,
    `опиу,операционные_расходы_топливо,${payload.pnl.operatingFuel}`,
    `опиу,операционные_расходы_зарплата_офиса,${payload.pnl.operatingOfficePayroll}`,
    `опиу,операционные_расходы_то_и_ремонт,${payload.pnl.operatingMaintenance}`,
    `опиу,операционные_расходы_дороги_и_сборы,${payload.pnl.operatingRoadAndFees}`,
    `опиу,операционные_расходы_административные,${payload.pnl.operatingAdmin}`,
    `опиу,операционные_расходы_страховки_и_лицензии,${payload.pnl.operatingInsuranceLicenses}`,
    `опиу,операционные_расходы_диспетчеризация_и_по,${payload.pnl.operatingSoftwareDispatch}`,
    `опиу,операционные_расходы_лизинг,${payload.pnl.operatingLeasing}`,
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
    `- Себестоимость (комиссия агрегатора + ЗП водителей): ${formatRub(payload.pnl.costOfSales)}`,
    `- Комиссия агрегатора в себестоимости: ${formatRub(payload.pnl.costOfSalesAggregatorFee)}`,
    `- Зарплата водителей в себестоимости: ${formatRub(payload.pnl.costOfSalesDriverPayroll)}`,
    `- Валовая прибыль: ${formatRub(payload.pnl.grossProfit)}`,
    `- Операционные расходы: ${formatRub(payload.pnl.operatingExpenses)}`,
    `- Топливо: ${formatRub(payload.pnl.operatingFuel)}`,
    `- Зарплаты офиса: ${formatRub(payload.pnl.operatingOfficePayroll)}`,
    `- ТО и ремонт: ${formatRub(payload.pnl.operatingMaintenance)}`,
    `- Дороги и сборы: ${formatRub(payload.pnl.operatingRoadAndFees)}`,
    `- Административные: ${formatRub(payload.pnl.operatingAdmin)}`,
    `- Страховки и лицензии: ${formatRub(payload.pnl.operatingInsuranceLicenses)}`,
    `- Диспетчеризация и ПО: ${formatRub(payload.pnl.operatingSoftwareDispatch)}`,
    `- Лизинг: ${formatRub(payload.pnl.operatingLeasing)}`,
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
  updateRevenueTargetFromState();
}

function resetAll() {
  for (const id of ids) {
    elements[id].value = 0;
  }
  elements.activeVehicles.value = 18;
  elements.tripsPerVehicle.value = 42;
  elements.revenuePerTrip.value = 16500;
  elements.aggregatorCommission.value = 12;
  elements.cashCollectionRate.value = 88;
  elements.taxRate.value = 20;
  results.classList.add("hidden");
  lastCalculation = null;
  localStorage.removeItem(SNAPSHOT_KEY);
  localStorage.removeItem(FORM_STATE_KEY);
  updateRevenueTargetFromState();
  updateAutoExpensesFromState();
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
  elements[id].addEventListener("input", calculate);
  elements[id].addEventListener("input", updateAutoExpensesFromState);
  elements[id].addEventListener("input", persistFormState);
}

revenueTarget.addEventListener("input", () => {
  applyRevenueTarget();
  calculate();
  persistFormState();
});

const restoredState = restoreFormState() || restoreFormStateFromSnapshot();
if (!restoredState) {
  updateRevenueTargetFromState();
}
updateAutoExpensesFromState();
persistFormState();
