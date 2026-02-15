const SNAPSHOT_KEY = "transportPlannerSnapshotV1";

const generatedAt = document.getElementById("generatedAt");
const emptyState = document.getElementById("emptyState");
const reportContent = document.getElementById("reportContent");
const downloadPdfBtn = document.getElementById("downloadPdfBtn");
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
  mCost.textContent = formatRub(data.metrics.monthlyOperatingCost);
  mProfit.textContent = formatRub(data.metrics.netProfit);
  mMargin.textContent = `${data.metrics.marginPercent}%`;

  kpiTable.innerHTML = "";
  row(kpiTable, "Рейсов в месяц", String(data.metrics.tripsPerMonth));
  row(kpiTable, "Комиссия агрегатора", formatRub(data.metrics.aggregatorFee));
  row(kpiTable, "Точка безубыточности (рейсов)", data.breakeven.trips === null ? "н/д" : String(Math.ceil(data.breakeven.trips)));
  row(kpiTable, "Точка безубыточности (рейсов на машину)", data.breakeven.tripsPerVehicle === null ? "н/д" : String(data.breakeven.tripsPerVehicle));

  pnlTable.innerHTML = "";
  row(pnlTable, "Выручка (нетто)", formatRub(data.pnl.revenueNet));
  row(pnlTable, "Себестоимость рейсов (переменная)", formatRub(data.pnl.variableCost));
  row(pnlTable, "Валовая прибыль", formatRub(data.pnl.grossProfit));
  row(pnlTable, "Операционные расходы (фикс)", formatRub(data.pnl.fixedOperatingCost));
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

  write("P&L и ДДС отчет по транспортной компании", 15, true);
  write(`Сформирован: ${new Date(snapshot.generatedAt).toLocaleString("ru-RU")}`);
  y += 6;

  write("Ключевые показатели", 12, true);
  write(`Выручка (нетто): ${formatRub(snapshot.metrics.monthlyRevenueNet)}`);
  write(`Операционные расходы: ${formatRub(snapshot.metrics.monthlyOperatingCost)}`);
  write(`Чистая прибыль: ${formatRub(snapshot.metrics.netProfit)}`);
  write(`Маржа: ${snapshot.metrics.marginPercent}%`);
  write(`Комиссия агрегатора: ${formatRub(snapshot.metrics.aggregatorFee)}`);
  y += 6;

  write("P&L", 12, true);
  write(`Выручка (нетто): ${formatRub(snapshot.pnl.revenueNet)}`);
  write(`Себестоимость рейсов: ${formatRub(snapshot.pnl.variableCost)}`);
  write(`Валовая прибыль: ${formatRub(snapshot.pnl.grossProfit)}`);
  write(`Операционные расходы: ${formatRub(snapshot.pnl.fixedOperatingCost)}`);
  write(`EBITDA: ${formatRub(snapshot.pnl.ebitda)}`);
  write(`Налоги: ${formatRub(snapshot.pnl.tax)}`);
  write(`Чистая прибыль: ${formatRub(snapshot.pnl.netProfit)}`);
  y += 6;

  write("ДДС", 12, true);
  write(`Денежные поступления: ${formatRub(snapshot.cashflow.cashIn)}`);
  write(`Денежные выплаты: ${formatRub(snapshot.cashflow.cashOut)}`);
  write(`Чистый денежный поток: ${formatRub(snapshot.cashflow.netCashFlow)}`);

  doc.save("pnl_dds_otchet_transportnoy_kompanii.pdf");
}

snapshot = loadSnapshot();
if (!snapshot) {
  emptyState.classList.remove("hidden");
} else {
  reportContent.classList.remove("hidden");
  renderReport(snapshot);
}

downloadPdfBtn.addEventListener("click", downloadPdf);
printBtn.addEventListener("click", () => window.print());
