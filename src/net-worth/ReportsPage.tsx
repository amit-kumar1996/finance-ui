import { useEffect, useMemo, useState } from "react";
import { loadReports, type ReportsData } from "./api.js";
import { amountInPaise, formatMoney, monthLabel, sumMoney } from "./format.js";

type ReportTab =
  | "Overview"
  | "Income"
  | "Expenses"
  | "Cash flow"
  | "Investments"
  | "Loans"
  | "Net worth";
const tabs: ReportTab[] = [
  "Overview",
  "Income",
  "Expenses",
  "Cash flow",
  "Investments",
  "Loans",
  "Net worth",
];
const currentYear = () =>
  Number(
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
    }).format(new Date()),
  );
const errorText = (cause: unknown) =>
  cause instanceof Error ? cause.message : "Could not load reports.";
const xmlEscape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
const safeText = (value: string) => (/^[\s]*[=+\-@]/.test(value) ? `'${value}` : value);

interface ExportRow {
  cells: string[];
  numericColumns: number[];
}

function saveFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ReportChart({ data, tab }: { data: ReportsData; tab: ReportTab }) {
  const points =
    tab === "Net worth"
      ? data.history.map((item) => ({
          label: `${monthLabel(item.date.slice(0, 7))} ${item.date.slice(0, 4)}`,
          value: item.netWorth,
        }))
      : data.monthly.map((item) => ({
          label: monthLabel(item.month),
          value:
            tab === "Income"
              ? item.income
              : tab === "Expenses"
                ? item.expenses
                : tab === "Investments"
                  ? item.invested
                  : item.cashFlow,
        }));
  if (!points.length) return <p className="report-empty">No data for this period yet.</p>;
  const values = points.map((point) => amountInPaise(point.value));
  const max =
    values.reduce((highest, value) => (value > highest ? value : highest), 0n) || 1n;
  return (
    <div className="history-bars report-bars" aria-label={`${tab} report chart`}>
      {points.map((point, index) => {
        const height = Number((values[index]! * 1000n) / max) / 10;
        return (
          <div className="history-bar-item" key={`${point.label}-${index}`}>
            <span>{formatMoney(point.value)}</span>
            <i style={{ height: `${Math.max(2, height)}%` }} />
            <small>{point.label}</small>
          </div>
        );
      })}
    </div>
  );
}

export function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>("Expenses");
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<ReportsData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void loadReports(year)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((cause: unknown) => {
        if (active) setError(errorText(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [year]);

  const report = useMemo(() => {
    if (!data)
      return {
        headers: [] as string[],
        rows: [] as ExportRow[],
        summary: [] as Array<[string, string]>,
      };
    if (tab === "Net worth") {
      const rows = data.history.map((point) => ({
        cells: [point.date, point.assets, point.liabilities, point.netWorth],
        numericColumns: [1, 2, 3],
      }));
      return {
        headers: ["Date", "Assets (INR)", "Liabilities (INR)", "Net worth (INR)"],
        rows,
        summary: [["Current net worth", data.position.netWorth]],
      };
    }
    if (tab === "Investments") {
      const items = data.position.assetBreakdown.filter((item) =>
        item.bucket.startsWith("investment:"),
      );
      const rows = items.map((item) => ({
        cells: [item.label, item.value],
        numericColumns: [1],
      }));
      return {
        headers: ["Investment type", "Current value (INR)"],
        rows,
        summary: [["Total invested assets", sumMoney(items.map((item) => item.value))]],
      };
    }
    if (tab === "Loans") {
      const items = data.position.liabilityBreakdown.filter((item) =>
        ["loan", "creditCard", "peoplePayable"].includes(item.bucket),
      );
      const rows = items.map((item) => ({
        cells: [item.label, item.bucket, item.value],
        numericColumns: [2],
      }));
      return {
        headers: ["Liability", "Type", "Balance (INR)"],
        rows,
        summary: [["Total liabilities", data.position.totalLiabilities]],
      };
    }
    const rows = data.monthly.map((item) => ({
      cells: [item.month, item.income, item.expenses, item.invested, item.cashFlow],
      numericColumns: [1, 2, 3, 4],
    }));
    const columns =
      tab === "Income"
        ? [0, 1]
        : tab === "Expenses"
          ? [0, 2]
          : tab === "Cash flow"
            ? [0, 1, 2, 3, 4]
            : [0, 1, 2, 3, 4];
    const labels = [
      "Month",
      "Income (INR)",
      "Expenses (INR)",
      "Invested (INR)",
      "Cash flow (INR)",
    ];
    const selectedRows = rows.map((row) => ({
      cells: columns.map((column) => row.cells[column]!),
      numericColumns: row.numericColumns.flatMap((column) => {
        const index = columns.indexOf(column);
        return index >= 0 ? [index] : [];
      }),
    }));
    const headers = columns.map((column) => labels[column]!);
    const sumCol = (index: number) =>
      sumMoney(
        data.monthly.map(
          (item) => [item.income, item.expenses, item.invested, item.cashFlow][index]!,
        ),
      );
    const summary =
      tab === "Income"
        ? [["Year to date", sumCol(0)]]
        : tab === "Expenses"
          ? [["Year to date", sumCol(1)]]
          : tab === "Cash flow"
            ? [["Year to date cash flow", sumCol(3)]]
            : [
                ["Current net worth", data.position.netWorth],
                ["Total assets", data.position.totalAssets],
                ["Total liabilities", data.position.totalLiabilities],
              ];
    return { headers, rows: selectedRows, summary };
  }, [data, tab]);

  const exportCsv = () => {
    if (!report.headers.length) return;
    const matrix = [report.headers, ...report.rows.map((row) => row.cells)];
    const csv = matrix
      .map((line) =>
        line
          .map((cell, index) => {
            const value = index === 0 ? safeText(cell) : cell;
            return `"${value.replaceAll('"', '""')}"`;
          })
          .join(","),
      )
      .join("\r\n");
    saveFile(
      `pfm-${tab.toLowerCase().replaceAll(" ", "-")}-${year}.csv`,
      `\uFEFF${csv}`,
      "text/csv;charset=utf-8",
    );
  };
  const exportExcel = () => {
    if (!report.headers.length) return;
    const rows = [report.headers, ...report.rows.map((row) => row.cells)];
    const sheet = rows
      .map(
        (row, rowIndex) =>
          `<Row>${row
            .map((cell, columnIndex) => {
              const isNumber =
                rowIndex > 0 &&
                report.rows[rowIndex - 1]?.numericColumns.includes(columnIndex);
              const value = isNumber ? cell : safeText(cell);
              return `<Cell><Data ss:Type="${isNumber ? "Number" : "String"}">${xmlEscape(value)}</Data></Cell>`;
            })
            .join("")}</Row>`,
      )
      .join("");
    const workbook = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="${xmlEscape(tab.slice(0, 31))}"><Table>${sheet}</Table></Worksheet></Workbook>`;
    saveFile(
      `pfm-${tab.toLowerCase().replaceAll(" ", "-")}-${year}.xls`,
      workbook,
      "application/vnd.ms-excel;charset=utf-8",
    );
  };

  return (
    <section className="data-page reports-page" aria-labelledby="page-heading-title">
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <div className="reports-toolbar">
        <div>
          <p>Analysis and downloadable reports</p>
        </div>
        <label>
          Year
          <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {[currentYear(), currentYear() - 1, currentYear() - 2].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      <nav className="report-tabs" aria-label="Report types">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            className={tab === item ? "active" : ""}
            aria-pressed={tab === item}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      {loading ? (
        <p role="status">Loading reports…</p>
      ) : data ? (
        <>
          <div className="report-summary-cards">
            {report.summary.map(([label, value = ""], index) => (
              <article className={index === 0 ? "report-primary" : ""} key={label}>
                <span>{label}</span>
                <strong>
                  {/^-?\d+\.\d{2}$/.test(value) ? formatMoney(value) : value}
                </strong>
              </article>
            ))}
          </div>
          <div className="reports-content-grid">
            <section className="dashboard-panel panel">
              <h2>
                {tab === "Overview" ||
                tab === "Income" ||
                tab === "Expenses" ||
                tab === "Cash flow"
                  ? `Monthly ${tab === "Overview" ? "summary" : tab.toLowerCase()} · ${year}`
                  : `${tab} report · ${year}`}
              </h2>
              <ReportChart data={data} tab={tab} />
            </section>
            <section className="dashboard-panel panel">
              <h2>Report details</h2>
              <div className="report-table-wrap">
                <table>
                  <thead>
                    <tr>
                      {report.headers.map((header) => (
                        <th key={header}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row, index) => (
                      <tr key={index}>
                        {row.cells.map((cell, columnIndex) => (
                          <td key={`${index}-${columnIndex}`}>
                            {row.numericColumns.includes(columnIndex)
                              ? formatMoney(cell)
                              : tab === "Overview" ||
                                  tab === "Income" ||
                                  tab === "Expenses" ||
                                  tab === "Cash flow"
                                ? monthLabel(cell)
                                : cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {report.rows.length === 0 && (
                  <p className="report-empty">No balances or snapshots recorded.</p>
                )}
              </div>
            </section>
          </div>
          <section className="quick-reports panel">
            <h2>Quick reports</h2>
            <div>
              <span>
                {tab} · {year}
              </span>
              <span>{report.rows.length} rows</span>
              <span>CSV · Excel · PDF</span>
            </div>
          </section>
          <div className="report-export-actions">
            <button className="primary-button" type="button" onClick={exportCsv}>
              Export CSV
            </button>
            <button className="secondary-button" type="button" onClick={exportExcel}>
              Export Excel
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => window.print()}
            >
              Export PDF
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
