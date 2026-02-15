const SNAPSHOT_KEY = "transportPlannerSnapshotV1";

const generatedAt = document.getElementById("generatedAt");
const emptyState = document.getElementById("emptyState");
const reportContent = document.getElementById("reportContent");
const downloadPdfBtn = document.getElementById("downloadPdfBtn");
const downloadCsvBtn = document.getElementById("downloadCsvBtn");
const downloadJsonBtn = document.getElementById("downloadJsonBtn");
const downloadTxtBtn = document.getElementById("downloadTxtBtn");
const printBtn = document.getElementById("printBtn");

const mRevenue = document.getElementById("mRevenue");
const mCost = document.getElementById("mCost");
const mProfit = document.getElementById("mProfit");
const mMargin = document.getElementById("mMargin");

const kpiTable = document.getElementById("kpiTable");
const pnlTable = document.getElementById("pnlTable");
const cashflowTable = document.getElementById("cashflowTable");
const scenarioTable = document.getElementById("scenarioTable");

let snapshot = null;

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

function row(target, label, value) {
  const tr = document.createElement("tr");
  tr.innerHTML = `<td>${label}</td><td>${value}</td>`;
  target.appendChild(tr);
}

function loadSnapshot() {
  const raw = localStorage.getItem(SNAPSHOT_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function renderReport(data) {
  generatedAt.textContent = `Сформирован: ${new Date(data.generatedAt).toLocaleString("ru-RU")}`;

  mRevenue.textContent = formatRub(data.metrics.monthlyRevenueNet);
  mCost.textContent = formatRub(data.metrics.monthlyTotalExpense);
  mProfit.textContent = formatRub(data.metrics.netProfit);
  mMargin.textContent = `${data.metrics.marginPercent}%`;

  kpiTable.innerHTML = "";
  row(kpiTable, "Рейсов в месяц", String(data.metrics.tripsPerMonth));
  row(kpiTable, "Комиссия агрегатора", formatRub(data.metrics.aggregatorFee));
  row(kpiTable, "Точка безубыточности (рейсов)", data.breakeven.trips === null ? "н/д" : String(Math.ceil(data.breakeven.trips)));
  row(kpiTable, "Точка безубыточности (рейсов на машину)", data.breakeven.tripsPerVehicle === null ? "н/д" : String(data.breakeven.tripsPerVehicle));

  pnlTable.innerHTML = "";
  row(pnlTable, "Выручка (нетто)", formatRub(data.pnl.revenueNet));
  row(pnlTable, "Себестоимость (комиссия агрегатора + ЗП водителей)", formatRub(data.pnl.costOfSales));
  row(
    pnlTable,
    "Комиссия агрегатора в себестоимости",
    formatRub(data.pnl.costOfSalesAggregatorFee ?? data.metrics.aggregatorFee)
  );
  row(
    pnlTable,
    "Зарплата водителей в себестоимости",
    formatRub(data.pnl.costOfSalesDriverPayroll ?? data.inputs.driverPayroll ?? 0)
  );
  row(pnlTable, "Валовая прибыль", formatRub(data.pnl.grossProfit));
  row(
    pnlTable,
    "Операционные расходы (без себестоимости, налогов и амортизации)",
    formatRub(data.pnl.otherOperatingExpenses ?? data.pnl.operatingExpenses)
  );
  row(pnlTable, "  Топливо", formatRub(data.pnl.operatingFuel ?? data.inputs.fuelPerTrip * data.metrics.tripsPerMonth));
  row(pnlTable, "  Зарплаты офиса", formatRub(data.pnl.operatingOfficePayroll ?? data.inputs.officePayroll ?? 0));
  row(pnlTable, "  Обслуживание", formatRub(data.pnl.operatingMaintenance ?? data.inputs.maintenanceCost ?? 0));
  row(pnlTable, "  Дороги и сборы", formatRub(data.pnl.operatingRoadAndFees ?? data.inputs.roadAndFees ?? 0));
  row(pnlTable, "  Административные", formatRub(data.pnl.operatingAdmin ?? data.inputs.adminCost ?? 0));
  row(pnlTable, "  Страховки и лицензии", formatRub(data.pnl.operatingInsuranceLicenses ?? data.inputs.insuranceLicenses ?? 0));
  row(pnlTable, "  Диспетчеризация и ПО", formatRub(data.pnl.operatingSoftwareDispatch ?? data.inputs.softwareDispatch ?? 0));
  row(pnlTable, "  Лизинг", formatRub(data.pnl.operatingLeasing ?? data.inputs.leasingPayments ?? 0));
  row(pnlTable, "EBITDA", formatRub(data.pnl.ebitda));
  row(pnlTable, "Налоги", formatRub(data.pnl.tax));
  row(pnlTable, "Чистая прибыль", formatRub(data.pnl.netProfit));

  cashflowTable.innerHTML = "";
  row(cashflowTable, "Денежные поступления", formatRub(data.cashflow.cashIn));
  row(cashflowTable, "Денежные выплаты", formatRub(data.cashflow.cashOut));
  row(cashflowTable, "Чистый денежный поток", formatRub(data.cashflow.netCashFlow));

  scenarioTable.innerHTML = "";
  for (const s of data.scenarios) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.scenario}</td>
      <td>${s.trips}</td>
      <td>${formatRub(s.tariffRub)}</td>
      <td>${formatRub(s.netProfitRub)}</td>
    `;
    scenarioTable.appendChild(tr);
  }
}

function downloadPdf() {
  if (!snapshot) {
    return;
  }

  const jsPdf = window.jspdf?.jsPDF;
  if (!jsPdf) {
    alert("PDF библиотека не загружена.");
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

  write("Отчет ОПиУ и ДДС по транспортной компании", 15, true);
  write(`Сформирован: ${new Date(snapshot.generatedAt).toLocaleString("ru-RU")}`);
  y += 6;

  write("Ключевые показатели", 12, true);
  write(`Выручка (нетто): ${formatRub(snapshot.metrics.monthlyRevenueNet)}`);
  write(`Совокупные расходы: ${formatRub(snapshot.metrics.monthlyTotalExpense)}`);
  write(`Чистая прибыль: ${formatRub(snapshot.metrics.netProfit)}`);
  write(`Маржа: ${snapshot.metrics.marginPercent}%`);
  write(`Комиссия агрегатора: ${formatRub(snapshot.metrics.aggregatorFee)}`);
  y += 6;

  write("ОПиУ", 12, true);
  write(`Выручка (нетто): ${formatRub(snapshot.pnl.revenueNet)}`);
  write(`Себестоимость (комиссия агрегатора + ЗП водителей): ${formatRub(snapshot.pnl.costOfSales)}`);
  write(`Комиссия агрегатора в себестоимости: ${formatRub(snapshot.pnl.costOfSalesAggregatorFee ?? snapshot.metrics.aggregatorFee)}`);
  write(`Зарплата водителей в себестоимости: ${formatRub(snapshot.pnl.costOfSalesDriverPayroll ?? snapshot.inputs.driverPayroll ?? 0)}`);
  write(`Валовая прибыль: ${formatRub(snapshot.pnl.grossProfit)}`);
  write(`Операционные расходы: ${formatRub(snapshot.pnl.otherOperatingExpenses ?? snapshot.pnl.operatingExpenses)}`);
  write(`  Топливо: ${formatRub(snapshot.pnl.operatingFuel ?? snapshot.inputs.fuelPerTrip * snapshot.metrics.tripsPerMonth)}`);
  write(`  Зарплаты офиса: ${formatRub(snapshot.pnl.operatingOfficePayroll ?? snapshot.inputs.officePayroll ?? 0)}`);
  write(`  Обслуживание: ${formatRub(snapshot.pnl.operatingMaintenance ?? snapshot.inputs.maintenanceCost ?? 0)}`);
  write(`  Дороги и сборы: ${formatRub(snapshot.pnl.operatingRoadAndFees ?? snapshot.inputs.roadAndFees ?? 0)}`);
  write(`  Административные: ${formatRub(snapshot.pnl.operatingAdmin ?? snapshot.inputs.adminCost ?? 0)}`);
  write(`  Страховки и лицензии: ${formatRub(snapshot.pnl.operatingInsuranceLicenses ?? snapshot.inputs.insuranceLicenses ?? 0)}`);
  write(`  Диспетчеризация и ПО: ${formatRub(snapshot.pnl.operatingSoftwareDispatch ?? snapshot.inputs.softwareDispatch ?? 0)}`);
  write(`  Лизинг: ${formatRub(snapshot.pnl.operatingLeasing ?? snapshot.inputs.leasingPayments ?? 0)}`);
  write(`EBITDA: ${formatRub(snapshot.pnl.ebitda)}`);
  write(`Налоги: ${formatRub(snapshot.pnl.tax)}`);
  write(`Чистая прибыль: ${formatRub(snapshot.pnl.netProfit)}`);
  y += 6;

  write("ДДС", 12, true);
  write(`Денежные поступления: ${formatRub(snapshot.cashflow.cashIn)}`);
  write(`Денежные выплаты: ${formatRub(snapshot.cashflow.cashOut)}`);
  write(`Чистый денежный поток: ${formatRub(snapshot.cashflow.netCashFlow)}`);

  doc.save("otchet_opiu_dds_transportnoy_kompanii.pdf");
}

function downloadCsv() {
  if (!snapshot) {
    return;
  }

  const lines = [
    "раздел,показатель,значение",
    `ключевые_показатели,выручка_нетто_в_месяц,${snapshot.metrics.monthlyRevenueNet}`,
    `ключевые_показатели,совокупные_расходы_в_месяц,${snapshot.metrics.monthlyTotalExpense}`,
    `ключевые_показатели,чистая_прибыль,${snapshot.metrics.netProfit}`,
    `ключевые_показатели,маржа_процентов,${snapshot.metrics.marginPercent}`,
    `ключевые_показатели,рейсов_в_месяц,${snapshot.metrics.tripsPerMonth}`,
    `ключевые_показатели,комиссия_агрегатора,${snapshot.metrics.aggregatorFee}`,
    `опиу,выручка_нетто,${snapshot.pnl.revenueNet}`,
    `опиу,себестоимость_(комиссия_агрегатора_+_зп_водителей),${snapshot.pnl.costOfSales}`,
    `опиу,комиссия_агрегатора_в_себестоимости,${snapshot.pnl.costOfSalesAggregatorFee ?? snapshot.metrics.aggregatorFee}`,
    `опиу,зарплата_водителей_в_себестоимости,${snapshot.pnl.costOfSalesDriverPayroll ?? snapshot.inputs.driverPayroll ?? 0}`,
    `опиу,валовая_прибыль,${snapshot.pnl.grossProfit}`,
    `опиу,операционные_расходы,${snapshot.pnl.otherOperatingExpenses ?? snapshot.pnl.operatingExpenses}`,
    `опиу,операционные_расходы_топливо,${snapshot.pnl.operatingFuel ?? snapshot.inputs.fuelPerTrip * snapshot.metrics.tripsPerMonth}`,
    `опиу,операционные_расходы_зарплата_офиса,${snapshot.pnl.operatingOfficePayroll ?? snapshot.inputs.officePayroll ?? 0}`,
    `опиу,операционные_расходы_обслуживание,${snapshot.pnl.operatingMaintenance ?? snapshot.inputs.maintenanceCost ?? 0}`,
    `опиу,операционные_расходы_дороги_и_сборы,${snapshot.pnl.operatingRoadAndFees ?? snapshot.inputs.roadAndFees ?? 0}`,
    `опиу,операционные_расходы_административные,${snapshot.pnl.operatingAdmin ?? snapshot.inputs.adminCost ?? 0}`,
    `опиу,операционные_расходы_страховки_и_лицензии,${snapshot.pnl.operatingInsuranceLicenses ?? snapshot.inputs.insuranceLicenses ?? 0}`,
    `опиу,операционные_расходы_диспетчеризация_и_по,${snapshot.pnl.operatingSoftwareDispatch ?? snapshot.inputs.softwareDispatch ?? 0}`,
    `опиу,операционные_расходы_лизинг,${snapshot.pnl.operatingLeasing ?? snapshot.inputs.leasingPayments ?? 0}`,
    `опиу,ebitda,${snapshot.pnl.ebitda}`,
    `опиу,налоги,${snapshot.pnl.tax}`,
    `опиу,чистая_прибыль,${snapshot.pnl.netProfit}`,
    `ддс,денежные_поступления,${snapshot.cashflow.cashIn}`,
    `ддс,денежные_выплаты,${snapshot.cashflow.cashOut}`,
    `ддс,чистый_денежный_поток,${snapshot.cashflow.netCashFlow}`,
    `безубыточность,рейсов,${snapshot.breakeven.trips ?? ""}`,
    `безубыточность,рейсов_на_машину,${snapshot.breakeven.tripsPerVehicle ?? ""}`
  ];

  snapshot.scenarios.forEach((s, idx) => {
    lines.push(`сценарий_${idx + 1},название,${s.scenario}`);
    lines.push(`сценарий_${idx + 1},рейсов,${s.trips}`);
    lines.push(`сценарий_${idx + 1},тариф_руб,${s.tariffRub}`);
    lines.push(`сценарий_${idx + 1},чистая_прибыль_руб,${s.netProfitRub}`);
  });

  downloadFile(`otchet_opiu_dds_transportnoy_kompanii_${timestampSlug()}.csv`, lines.join("\n"), "text/csv;charset=utf-8");
}

function downloadJson() {
  if (!snapshot) {
    return;
  }
  downloadFile(
    `otchet_opiu_dds_transportnoy_kompanii_${timestampSlug()}.json`,
    JSON.stringify(snapshot, null, 2),
    "application/json;charset=utf-8"
  );
}

function downloadTxt() {
  if (!snapshot) {
    return;
  }

  const rows = [
    "Отчет ОПиУ и ДДС по транспортной компании",
    `Сформирован: ${new Date(snapshot.generatedAt).toLocaleString("ru-RU")}`,
    "",
    "Ключевые показатели:",
    `- Выручка (нетто): ${formatRub(snapshot.metrics.monthlyRevenueNet)}`,
    `- Совокупные расходы: ${formatRub(snapshot.metrics.monthlyTotalExpense)}`,
    `- Чистая прибыль: ${formatRub(snapshot.metrics.netProfit)}`,
    `- Маржа: ${snapshot.metrics.marginPercent}%`,
    `- Комиссия агрегатора: ${formatRub(snapshot.metrics.aggregatorFee)}`,
    "",
    "ОПиУ:",
    `- Выручка (нетто): ${formatRub(snapshot.pnl.revenueNet)}`,
    `- Себестоимость (комиссия агрегатора + ЗП водителей): ${formatRub(snapshot.pnl.costOfSales)}`,
    `- Комиссия агрегатора в себестоимости: ${formatRub(snapshot.pnl.costOfSalesAggregatorFee ?? snapshot.metrics.aggregatorFee)}`,
    `- Зарплата водителей в себестоимости: ${formatRub(snapshot.pnl.costOfSalesDriverPayroll ?? snapshot.inputs.driverPayroll ?? 0)}`,
    `- Валовая прибыль: ${formatRub(snapshot.pnl.grossProfit)}`,
    `- Операционные расходы: ${formatRub(snapshot.pnl.otherOperatingExpenses ?? snapshot.pnl.operatingExpenses)}`,
    `- Топливо: ${formatRub(snapshot.pnl.operatingFuel ?? snapshot.inputs.fuelPerTrip * snapshot.metrics.tripsPerMonth)}`,
    `- Зарплаты офиса: ${formatRub(snapshot.pnl.operatingOfficePayroll ?? snapshot.inputs.officePayroll ?? 0)}`,
    `- Обслуживание: ${formatRub(snapshot.pnl.operatingMaintenance ?? snapshot.inputs.maintenanceCost ?? 0)}`,
    `- Дороги и сборы: ${formatRub(snapshot.pnl.operatingRoadAndFees ?? snapshot.inputs.roadAndFees ?? 0)}`,
    `- Административные: ${formatRub(snapshot.pnl.operatingAdmin ?? snapshot.inputs.adminCost ?? 0)}`,
    `- Страховки и лицензии: ${formatRub(snapshot.pnl.operatingInsuranceLicenses ?? snapshot.inputs.insuranceLicenses ?? 0)}`,
    `- Диспетчеризация и ПО: ${formatRub(snapshot.pnl.operatingSoftwareDispatch ?? snapshot.inputs.softwareDispatch ?? 0)}`,
    `- Лизинг: ${formatRub(snapshot.pnl.operatingLeasing ?? snapshot.inputs.leasingPayments ?? 0)}`,
    `- EBITDA: ${formatRub(snapshot.pnl.ebitda)}`,
    `- Налоги: ${formatRub(snapshot.pnl.tax)}`,
    `- Чистая прибыль: ${formatRub(snapshot.pnl.netProfit)}`,
    "",
    "ДДС:",
    `- Денежные поступления: ${formatRub(snapshot.cashflow.cashIn)}`,
    `- Денежные выплаты: ${formatRub(snapshot.cashflow.cashOut)}`,
    `- Чистый денежный поток: ${formatRub(snapshot.cashflow.netCashFlow)}`
  ];

  downloadFile(`otchet_opiu_dds_transportnoy_kompanii_${timestampSlug()}.txt`, rows.join("\n"), "text/plain;charset=utf-8");
}

snapshot = loadSnapshot();
if (!snapshot) {
  emptyState.classList.remove("hidden");
} else {
  reportContent.classList.remove("hidden");
  renderReport(snapshot);
}

downloadPdfBtn.addEventListener("click", downloadPdf);
downloadCsvBtn.addEventListener("click", downloadCsv);
downloadJsonBtn.addEventListener("click", downloadJson);
downloadTxtBtn.addEventListener("click", downloadTxt);
printBtn.addEventListener("click", () => window.print());
