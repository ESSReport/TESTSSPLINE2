const SHEET_ID = "1lukJC1vKSq02Nus23svZ21_pp-86fz0mU1EARjalCBI";
const OPENSHEET_URL = `https://opensheet.elk.sh/${SHEET_ID}/SHOPS%20BALANCE`;

const HEADERS = [
  "SHOP NAME",
  "TEAM LEADER",
  "GROUP NAME",
  "SECURITY DEPOSIT",
  "BRING FORWARD BALANCE",
  "TOTAL DEPOSIT",
  "TOTAL WITHDRAWAL",
  "INTERNAL TRANSFER IN",
  "INTERNAL TRANSAFER OUT",
  "SETTLEMENT",
  "SPECIAL PAYMENT",
  "ADJUSTMENT",
  "DP COMM",
  "WD COMM",
  "ADD COMM",
  "RUNNING BALANCE",
];

const cleanKey = (k) => String(k || "").replace(/\s+/g, " ").trim().toUpperCase();
const parseNumber = (v) => {
  if (!v) return 0;
  const s = String(v).replace(/[,\s]/g, "").replace(/\((.*)\)/, "-$1");
  const n = Number(s);
  return isFinite(n) ? n : 0;
};
const normalize = (row) => {
  const out = {};
  for (const k in row) out[cleanKey(k)] = String(row[k] || "").trim();
  return out;
};

let rawData = [];
let filteredData = [];
let cachedData = [];
let currentPage = 1;
const rowsPerPage = 20;

/* ---------- FETCH DATA ---------- */
async function fetchShopBalance() {
  const res = await fetch(OPENSHEET_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.map(normalize);
}

/* ---------- INIT DASHBOARD ---------- */
async function loadDashboard() {
  const data = await fetchShopBalance();
  rawData = data;

  const urlParams = new URLSearchParams(window.location.search);
  const teamLeaderParam = urlParams.get("teamLeader")
    ? urlParams.get("teamLeader").toUpperCase()
    : "ALL";

  buildTeamLeaderDropdown(data);
  buildGroupDropdown(data, teamLeaderParam);

  if (teamLeaderParam !== "ALL") {
    document.getElementById("leaderFilter").value = teamLeaderParam;
    document.getElementById("leaderFilter").style.display = "none";
    document.getElementById("teamDashboardLink").style.display = "none";
  }

  buildSummary(data);

  if (teamLeaderParam !== "ALL") filterData();
}

/* ---------- BUILD DROPDOWNS ---------- */
function buildTeamLeaderDropdown(data) {
  const dropdown = document.getElementById("leaderFilter");
  dropdown.innerHTML = '<option value="ALL">All Team Leaders</option>';
  const leaders = [...new Set(
    data.map(r => (r["TEAM LEADER"] || "").trim().toUpperCase())
  )].filter(name => name && name !== "#N/A" && name !== "N/A");
  leaders.sort().forEach(l => {
    const opt = document.createElement("option");
    opt.value = l;
    opt.textContent = l;
    dropdown.appendChild(opt);
  });
}

function buildGroupDropdown(data, selectedLeader = "ALL") {
  const dropdown = document.getElementById("groupFilter");
  dropdown.innerHTML = '<option value="ALL">All Groups</option>';

  const groups = [...new Set(
    data
      .filter(r =>
        selectedLeader === "ALL" ||
        (r["TEAM LEADER"] || "").trim().toUpperCase() === selectedLeader
      )
      .map(r => (r["GROUP NAME"] || "").trim().toUpperCase())
  )].filter(name => name && name !== "#N/A" && name !== "N/A");

  groups.sort().forEach(g => {
    const opt = document.createElement("option");
    opt.value = g;
    opt.textContent = g;
    dropdown.appendChild(opt);
  });
}

/* ---------- BUILD SUMMARY DATA ---------- */
function buildSummary(data) {
  const summary = {};
  data.forEach(r => {
    const shop = (r["SHOP"] || r["SHOP NAME"] || "").trim();
    if (!shop) return;

    const leader = (r["TEAM LEADER"] || "").trim().toUpperCase();
    const group = (r["GROUP NAME"] || "").trim().toUpperCase();
    const wallet = (r["WALLET NUMBER"] || "").trim();

    if (!summary[shop]) {
      summary[shop] = {
        "SHOP NAME": shop,
        "TEAM LEADER": leader,
        "GROUP NAME": group,
        "SECURITY DEPOSIT": 0,
        "BRING FORWARD BALANCE": 0,
        "TOTAL DEPOSIT": 0,
        "TOTAL WITHDRAWAL": 0,
        "INTERNAL TRANSFER IN": 0,
        "INTERNAL TRANSAFER OUT": 0,
        "SETTLEMENT": 0,
        "SPECIAL PAYMENT": 0,
        "ADJUSTMENT": 0,
        "DP COMM": 0,
        "WD COMM": 0,
        "ADD COMM": 0,
        "RUNNING BALANCE": 0,
        "WALLET NUMBER": wallet,
      };
    }

    summary[shop]["SECURITY DEPOSIT"] += parseNumber(r["SECURITY DEPOSIT"]);
    summary[shop]["BRING FORWARD BALANCE"] += parseNumber(r["BRING FORWARD BALANCE"]);
    summary[shop]["TOTAL DEPOSIT"] += parseNumber(r["TOTAL DEPOSIT"]);
    summary[shop]["TOTAL WITHDRAWAL"] += parseNumber(r["TOTAL WITHDRAWAL"]);
    summary[shop]["INTERNAL TRANSFER IN"] += parseNumber(r["INTERNAL TRANSFER IN"]);
    summary[shop]["INTERNAL TRANSAFER OUT"] += parseNumber(r["INTERNAL TRANSAFER OUT"]);
    summary[shop]["SETTLEMENT"] += parseNumber(r["SETTLEMENT"]);
    summary[shop]["SPECIAL PAYMENT"] += parseNumber(r["SPECIAL PAYMENT"]);
    summary[shop]["ADJUSTMENT"] += parseNumber(r["ADJUSTMENT"]);
    summary[shop]["DP COMM"] += parseNumber(r["DP COMM"]);
    summary[shop]["WD COMM"] += parseNumber(r["WD COMM"]);
    summary[shop]["ADD COMM"] += parseNumber(r["ADD COMM"]);

    const rb =
      summary[shop]["BRING FORWARD BALANCE"] +
      summary[shop]["TOTAL DEPOSIT"] -
      summary[shop]["TOTAL WITHDRAWAL"] +
      summary[shop]["INTERNAL TRANSFER IN"] -
      summary[shop]["INTERNAL TRANSAFER OUT"] -
      summary[shop]["SETTLEMENT"] -
      summary[shop]["SPECIAL PAYMENT"] +
      summary[shop]["ADJUSTMENT"] -
      summary[shop]["DP COMM"] -
      summary[shop]["WD COMM"] -
      summary[shop]["ADD COMM"];

    summary[shop]["RUNNING BALANCE"] = rb;
  });

  cachedData = Object.values(summary);
  filteredData = cachedData;
  renderTable();
}

/* ---------- RENDER TABLE ---------- */
function renderTable() {
  const tableHead = document.getElementById("tableHeader");
  const tableBody = document.getElementById("tableBody");
  tableHead.innerHTML = "";
  tableBody.innerHTML = "";

  HEADERS.forEach(h => {
    const th = document.createElement("th");
    th.textContent = h;
    if (["SHOP NAME", "TEAM LEADER", "GROUP NAME"].includes(h)) th.classList.add("left");
    tableHead.appendChild(th);
  });

  const start = (currentPage - 1) * rowsPerPage;
  const pageData = filteredData.slice(start, start + rowsPerPage);

  pageData.forEach(r => {
    const tr = document.createElement("tr");
    HEADERS.forEach(h => {
      const td = document.createElement("td");
      if (h === "SHOP NAME") {
        const a = document.createElement("a");
        const wallet = r["WALLET NUMBER"] ? ` (${r["WALLET NUMBER"]})` : "";
        a.textContent = `${r[h] || ""}${wallet}`;
        a.href = `shop_dashboard.html?shopName=${encodeURIComponent(r[h] || "")}`;
        a.target = "_blank";
        a.className = "shop-link";
        td.appendChild(a);
        td.classList.add("left");
      } else if (["TEAM LEADER", "GROUP NAME"].includes(h)) {
        td.textContent = r[h] || "";
        td.classList.add("left");
      } else {
        td.textContent = (Number(r[h]) || 0).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      }
      tr.appendChild(td);
    });
    tableBody.appendChild(tr);
  });

  updatePagination();
  renderTotals();
  updateTeamDashboardLink();
}

/* ---------- PAGINATION ---------- */
function updatePagination() {
  const totalPages = Math.ceil(filteredData.length / rowsPerPage);
  document.getElementById("pageInfo").textContent = `Page ${currentPage} of ${totalPages}`;
  document.getElementById("prevPage").disabled = currentPage === 1;
  document.getElementById("nextPage").disabled =
    currentPage === totalPages || totalPages === 0;
}

/* ---------- TOTALS ---------- */
function renderTotals() {
  const totalsDiv = document.getElementById("totalsRow");
  totalsDiv.innerHTML = "";

  HEADERS.forEach(h => {
    if (["SHOP NAME", "TEAM LEADER", "GROUP NAME"].includes(h)) return;
    const total = filteredData.reduce((a, b) => a + (parseNumber(b[h]) || 0), 0);
    const card = document.createElement("div");
    card.className = "total-card";
    card.innerHTML = `<div>${h}</div>
                      <div>${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>`;
    totalsDiv.appendChild(card);
  });
}

/* ---------- TEAM LEADER LINK ---------- */
function updateTeamDashboardLink() {
  const leader = document.getElementById("leaderFilter").value;
  const linkDiv = document.getElementById("teamDashboardLink");

  if (leader && leader !== "ALL") {
    const url = `${window.location.origin}${window.location.pathname}?teamLeader=${encodeURIComponent(leader)}`;
    linkDiv.innerHTML = `
      <a href="${url}" target="_blank" style="color:#0077cc; font-weight:bold; text-decoration:underline;">
        Open ${leader} Dashboard in New Tab
      </a>
    `;
  } else {
    linkDiv.innerHTML = "";
  }
}

/* ---------- FILTERING & EVENTS ---------- */
document.getElementById("leaderFilter").addEventListener("change", () => {
  const selectedLeader = document.getElementById("leaderFilter").value;
  buildGroupDropdown(rawData, selectedLeader);
  document.getElementById("groupFilter").value = "ALL";
  filterData();
});

document.getElementById("groupFilter").addEventListener("change", () => {
  const selectedGroup = document.getElementById("groupFilter").value;
  if (selectedGroup !== "ALL") {
    const match = rawData.find(
      r => (r["GROUP NAME"] || "").trim().toUpperCase() === selectedGroup
    );
    if (match) {
      document.getElementById("leaderFilter").value = (match["TEAM LEADER"] || "").trim().toUpperCase();
    }
  }
  filterData();
});

document.getElementById("searchInput").addEventListener("input", filterData);
document.getElementById("prevPage").addEventListener("click", () => { currentPage--; renderTable(); });
document.getElementById("nextPage").addEventListener("click", () => { currentPage++; renderTable(); });
document.getElementById("resetBtn").addEventListener("click", () => {
  document.getElementById("leaderFilter").value = "ALL";
  document.getElementById("groupFilter").value = "ALL";
  document.getElementById("searchInput").value = "";
  buildGroupDropdown(rawData, "ALL");
  filteredData = cachedData;
  currentPage = 1;
  renderTable();
});
document.getElementById("exportBtn").addEventListener("click", exportCSV);

function filterData() {
  const leader = document.getElementById("leaderFilter").value;
  const group = document.getElementById("groupFilter").value;
  const search = document.getElementById("searchInput").value.trim().toUpperCase();

  filteredData = cachedData.filter(r => {
    const matchLeader = leader === "ALL" || (r["TEAM LEADER"] || "").toUpperCase() === leader;
    const matchGroup = group === "ALL" || (r["GROUP NAME"] || "").toUpperCase() === group;
    const matchSearch = (r["SHOP NAME"] || "").toUpperCase().includes(search);
    return matchLeader && matchGroup && matchSearch;
  });

  currentPage = 1;
  renderTable();
}

/* ---------- CSV EXPORT (FULLY EXCEL-COMPATIBLE & SAFE) ---------- */
function exportCSV() {
  try {
    // Excel-friendly UTF-8 BOM
    const BOM = "\uFEFF";
    let csv = BOM + HEADERS.join(",") + "\r\n";

    filteredData.forEach(r => {
      const row = HEADERS.map(h => {
        let val = r[h] ?? "";
        if (typeof val === "number") val = val.toFixed(2);
        val = String(val)
          .replace(/"/g, '""')        // escape quotes
          .replace(/\r?\n|\r/g, " "); // remove line breaks
        return `"${val}"`;
      }).join(",");
      csv += row + "\r\n";
    });

    // Create a blob with Excel-compatible MIME type
    const blob = new Blob([csv], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    // Create hidden link for download
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;

    // Proper filename
    const filename =
      filteredData.length === cachedData.length
        ? "All_Shops_Summary.csv"
        : "Filtered_Shops_Summary.csv";
    a.download = filename;

    document.body.appendChild(a);
    a.click();

    // Cleanup
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);

    console.log(`✅ ${filename} downloaded successfully`);
  } catch (err) {
    console.error("CSV Export Failed:", err);
    alert("⚠️ Failed to export CSV file.");
  }
}
/* ---------- INIT ---------- */
loadDashboard();

/* ===============================================================
   📦 NEW: DOWNLOAD ALL INDIVIDUAL SHOP SUMMARIES (ZIP of CSVs)
================================================================= */
document.getElementById("downloadAllShopsBtn")?.addEventListener("click", async () => {
  const shops = filteredData.length ? filteredData : cachedData;
  if (!shops.length) {
    alert("⚠️ No shops found to download.");
    return;
  }

  const btn = document.getElementById("downloadAllShopsBtn");
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "⏳ Preparing...";

  if (typeof JSZip === "undefined") {
    const s1 = document.createElement("script");
    s1.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    document.head.appendChild(s1);
    await new Promise(res => s1.onload = res);
  }
  if (typeof saveAs === "undefined") {
    const s2 = document.createElement("script");
    s2.src = "https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js";
    document.head.appendChild(s2);
    await new Promise(res => s2.onload = res);
  }

  const zip = new JSZip();
  let done = 0;
  for (const shop of shops) {
    const csv = HEADERS.map(h => h).join(",") + "\n" +
      HEADERS.map(h => `"${shop[h] || 0}"`).join(",") + "\n";
    const safeName = (shop["SHOP NAME"] || "Shop").replace(/[^\w\s-]/g, "_");
    zip.file(`${safeName}_summary.csv`, csv);
    done++;
    btn.textContent = `⏳ ${done}/${shops.length}`;
  }

  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, "shop_summaries.zip");

  btn.textContent = originalText;
  btn.disabled = false;
});
