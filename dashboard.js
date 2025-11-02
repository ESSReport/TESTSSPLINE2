// dashboard.js
// Full working dashboard logic with PIN modal, CSV export (filtered) and optimized ZIP builder
// Keeps your original balance computations unchanged

/* -------------------------
   Configuration / Helpers
   ------------------------- */
const SHEET_ID = "1lukJC1vKSq02Nus23svZ21_pp-86fz0mU1EARjalCBI";
const OPENSHEET_BASE = `https://opensheet.elk.sh/${SHEET_ID}`;
const OPENSHEET = {
  SHOPS_BALANCE: `${OPENSHEET_BASE}/SHOPS%20BALANCE`,
  DEPOSIT: `${OPENSHEET_BASE}/TOTAL%20DEPOSIT`,
  WITHDRAWAL: `${OPENSHEET_BASE}/TOTAL%20WITHDRAWAL`,
  STLM: `${OPENSHEET_BASE}/STLM%2FTOPUP`,
  COMM: `${OPENSHEET_BASE}/COMM`
};

const HEADERS = [
  "SHOP NAME","TEAM LEADER","GROUP NAME","SECURITY DEPOSIT","BRING FORWARD BALANCE",
  "TOTAL DEPOSIT","TOTAL WITHDRAWAL","INTERNAL TRANSFER IN","INTERNAL TRANSAFER OUT",
  "SETTLEMENT","SPECIAL PAYMENT","ADJUSTMENT","DP COMM","WD COMM","ADD COMM","RUNNING BALANCE"
];

const cleanKey = k => String(k||"").replace(/\s+/g," ").trim().toUpperCase();
const parseNumber = v => {
  if (!v) return 0;
  const s = String(v).replace(/[,\s]/g,"").replace(/\((.*)\)/,"-$1");
  const n = Number(s);
  return isFinite(n) ? n : 0;
};
const normalize = row => {
  const out = {};
  for (const k in row) out[cleanKey(k)] = String(row[k]||"").trim();
  return out;
};

let rawData = [], cachedData = [], filteredData = [];
let currentPage = 1, rowsPerPage = 20;

/* -------------------------
   PIN Modal (prevents loading until correct PIN)
   ------------------------- */
const PIN_CODE = "11012025"; // correct PIN
function showPinModal() {
  // if already verified in sessionStorage, skip
  if (sessionStorage.getItem("verifiedPin") === "true") return Promise.resolve();

  return new Promise((resolve, reject) => {
    const overlay = document.createElement("div");
    overlay.id = "pinOverlay";
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;
    `;
    overlay.innerHTML = `
      <div style="width:360px;max-width:94%;background:#fff;border-radius:12px;padding:22px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,0.2);">
        <h2 style="margin:0 0 12px;color:#0077cc;">🔒 Enter PIN to access dashboard</h2>
        <input id="pinInput" type="password" maxlength="12" autofocus
          style="width:100%;padding:10px;font-size:16px;border-radius:8px;border:1px solid #ddd;text-align:center;" />
        <div style="margin-top:14px;display:flex;gap:8px;justify-content:center;">
          <button id="pinOk" style="padding:8px 12px;border-radius:8px;border:none;background:#0077cc;color:#fff;cursor:pointer;">Unlock</button>
          <button id="pinCancel" style="padding:8px 12px;border-radius:8px;border:none;background:#ccc;color:#111;cursor:pointer;">Cancel</button>
        </div>
        <p id="pinError" style="color:#a00;margin-top:10px;display:none;">Incorrect PIN — try again</p>
      </div>
    `;
    document.body.appendChild(overlay);

    const pinInput = document.getElementById("pinInput");
    const pinOk = document.getElementById("pinOk");
    const pinCancel = document.getElementById("pinCancel");
    const pinError = document.getElementById("pinError");

    function cleanUpAndResolve() {
      overlay.remove();
      sessionStorage.setItem("verifiedPin", "true");
      resolve();
    }
    function cleanUpAndReject() {
      overlay.remove();
      reject(new Error("Access cancelled"));
    }

    pinOk.addEventListener("click", () => {
      const val = pinInput.value?.trim();
      if (val === PIN_CODE) {
        cleanUpAndResolve();
      } else {
        pinError.style.display = "block";
        pinInput.value = "";
        pinInput.focus();
      }
    });

    pinCancel.addEventListener("click", () => {
      pinError.style.display = "none";
      cleanUpAndReject();
    });

    // Enter key works
    pinInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") pinOk.click();
      if (e.key === "Escape") pinCancel.click();
    });
  });
}

/* -------------------------
   Data fetchers & builders
   ------------------------- */
async function fetchShopsBalance(){
  const res = await fetch(OPENSHEET.SHOPS_BALANCE);
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.map(normalize);
}

/* buildSummary / renderTable / filters / totals: original logic (kept intact) */
function buildSummary(data){
  const summary = {};
  data.forEach(r=>{
    const shop = (r["SHOP"]||r["SHOP NAME"]||"").trim();
    if(!shop) return;
    if(!summary[shop]) summary[shop] = Object.assign({}, ...HEADERS.map(h=> ({
      [h]: (h==="SHOP NAME"? shop :
            h==="TEAM LEADER"? ((r["TEAM LEADER"]||"").trim().toUpperCase()) :
            h==="GROUP NAME"? ((r["GROUP NAME"]||"").trim().toUpperCase()) : 0)
    })));
    ["SECURITY DEPOSIT","BRING FORWARD BALANCE","TOTAL DEPOSIT","TOTAL WITHDRAWAL",
     "INTERNAL TRANSFER IN","INTERNAL TRANSAFER OUT","SETTLEMENT","SPECIAL PAYMENT",
     "ADJUSTMENT","DP COMM","WD COMM","ADD COMM"].forEach(key=>{
      summary[shop][key] = (summary[shop][key] || 0) + parseNumber(r[key]);
    });
    summary[shop]["RUNNING BALANCE"] = 
      (summary[shop]["BRING FORWARD BALANCE"]||0) +
      (summary[shop]["TOTAL DEPOSIT"]||0) - (summary[shop]["TOTAL WITHDRAWAL"]||0) +
      (summary[shop]["INTERNAL TRANSFER IN"]||0) - (summary[shop]["INTERNAL TRANSAFER OUT"]||0) -
      (summary[shop]["SETTLEMENT"]||0) - (summary[shop]["SPECIAL PAYMENT"]||0) +
      (summary[shop]["ADJUSTMENT"]||0) - (summary[shop]["DP COMM"]||0) -
      (summary[shop]["WD COMM"]||0) - (summary[shop]["ADD COMM"]||0);
    summary[shop]["WALLET NUMBER"] = r["WALLET NUMBER"] || summary[shop]["WALLET NUMBER"];
  });
  cachedData = Object.values(summary);
  filteredData = cachedData;
  renderTable();
}

function renderTable(){
  const tableHead = document.getElementById("tableHeader");
  const tableBody = document.getElementById("tableBody");
  tableHead.innerHTML = ""; tableBody.innerHTML = "";

  HEADERS.forEach(h=>{
    const th=document.createElement("th");
    th.textContent=h;
    tableHead.appendChild(th);
  });

  const start = (currentPage-1)*rowsPerPage;
  const pageData = filteredData.slice(start, start+rowsPerPage);

  pageData.forEach(r=>{
    const tr=document.createElement("tr");
    HEADERS.forEach(h=>{
      const td=document.createElement("td");
      if(h==="SHOP NAME"){
        const a=document.createElement("a");
        a.textContent = r[h] + (r["WALLET NUMBER"]? ` (${r["WALLET NUMBER"]})` : "");
        a.href = `shop_dashboard.html?shopName=${encodeURIComponent(r[h])}`;
        a.target="_blank";
        td.appendChild(a);
      } else if(["TEAM LEADER","GROUP NAME"].includes(h)){
        td.textContent = r[h] || "";
      } else {
        td.textContent = (Number(r[h])||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
      }
      tr.appendChild(td);
    });
    tableBody.appendChild(tr);
  });

  updatePagination();
  renderTotals();
  updateTeamDashboardLink();
}

function updatePagination(){
  const totalPages = Math.ceil(filteredData.length/rowsPerPage) || 1;
  document.getElementById("pageInfo").textContent = `Page ${currentPage} of ${totalPages}`;
  document.getElementById("prevPage").disabled = currentPage===1;
  document.getElementById("nextPage").disabled = currentPage===totalPages;
}

function renderTotals(){
  const totalsDiv = document.getElementById("totalsRow");
  totalsDiv.innerHTML = "";
  HEADERS.forEach(h=>{
    if(["SHOP NAME","TEAM LEADER","GROUP NAME"].includes(h)) return;
    const total = filteredData.reduce((a,b)=> a + (parseNumber(b[h])||0), 0);
    const card=document.createElement("div");
    card.className="total-card";
    card.innerHTML = `<div>${h}</div><div>${total.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>`;
    totalsDiv.appendChild(card);
  });
}

function updateTeamDashboardLink(){
  const leader = document.getElementById("leaderFilter").value;
  const linkDiv = document.getElementById("teamDashboardLink");
  if(leader && leader!=="ALL"){
    const url = `${window.location.origin}${window.location.pathname}?teamLeader=${encodeURIComponent(leader)}`;
    linkDiv.innerHTML = `<a href="${url}" target="_blank" style="color:#0077cc;font-weight:bold;text-decoration:underline">Open ${leader} Dashboard in New Tab</a>`;
  } else linkDiv.innerHTML = "";
}

function buildTeamLeaderDropdown(data){
  const dd = document.getElementById("leaderFilter");
  dd.innerHTML = '<option value="ALL">All Team Leaders</option>';
  const leaders = [...new Set(data.map(r=> (r["TEAM LEADER"]||"").trim().toUpperCase()))]
    .filter(x=>x&&x!=="#N/A"&&x!=="N/A").sort();
  leaders.forEach(l=>{
    const opt=document.createElement("option");
    opt.value=l; opt.textContent=l; dd.appendChild(opt);
  });
}

function buildGroupDropdown(data, selectedLeader="ALL"){
  const dd = document.getElementById("groupFilter");
  dd.innerHTML = '<option value="ALL">All Groups</option>';
  const groups = [...new Set(
    data.filter(r=> selectedLeader==="ALL" || (r["TEAM LEADER"]||"").toUpperCase()===selectedLeader)
    .map(r=> (r["GROUP NAME"]||"").trim().toUpperCase())
  )].filter(x=>x&&x!=="#N/A"&&x!=="N/A").sort();
  groups.forEach(g=>{
    const opt=document.createElement("option");
    opt.value=g; opt.textContent=g; dd.appendChild(opt);
  });
}

function filterData(){
  const leader = document.getElementById("leaderFilter").value;
  const group = document.getElementById("groupFilter").value;
  const search = document.getElementById("searchInput").value.trim().toUpperCase();
  filteredData = cachedData.filter(r=>{
    const matchLeader = leader==="ALL" || (r["TEAM LEADER"]||"").toUpperCase()===leader;
    const matchGroup = group==="ALL" || (r["GROUP NAME"]||"").toUpperCase()===group;
    const matchSearch = (r["SHOP NAME"]||"").toUpperCase().includes(search);
    return matchLeader && matchGroup && matchSearch;
  });
  currentPage = 1; renderTable();
}

/* -------------------------
   CSV Export (filteredData)
   ------------------------- */
function exportCSV() {
  if (!filteredData.length) { alert("No data to export"); return; }
  const rows = [HEADERS.join(",")];
  filteredData.forEach(r=>{
    const row = HEADERS.map(h=>{
      const v = (r[h] === undefined || r[h] === null) ? "" : String(r[h]);
      return `"${v.replace(/"/g,'""')}"`;
    }).join(",");
    rows.push(row);
  });
  const blob = new Blob([rows.join("\n")], {type:"text/csv;charset=utf-8"});
  saveAs(blob, `Shops_Summary_${new Date().toISOString().slice(0,10)}.csv`);
}

/* -------------------------
   Optimized ZIP builder (per-shop daily transactions)
   Matches logic from shop_dashboard.js
   ------------------------- */
function createProgressOverlay() {
  let overlay = document.getElementById("zipProgressOverlay");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "zipProgressOverlay";
  overlay.style.cssText = `
    position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,0.45);z-index:99998;
  `;
  overlay.innerHTML = `
    <div style="background:#fff;padding:20px;border-radius:10px;min-width:260px;text-align:center;">
      <div id="zipProgressText" style="font-weight:600;margin-bottom:8px;">Building ZIP... please wait</div>
      <div id="zipProgressCounter" style="font-size:13px;color:#555;"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

async function downloadAllShops() {
  try {
    // overlay
    const overlay = createProgressOverlay();
    const progressText = document.getElementById("zipProgressText");
    const progressCounter = document.getElementById("zipProgressCounter");
    overlay.style.display = "flex";
    progressText.textContent = "Fetching sheets...";

    // fetch once
    const [deposits, withdrawals, stlm, comm, shopBalance] = await Promise.all([
      fetch(OPENSHEET.DEPOSIT).then(r=>r.ok? r.json(): [] ),
      fetch(OPENSHEET.WITHDRAWAL).then(r=>r.ok? r.json(): [] ),
      fetch(OPENSHEET.STLM).then(r=>r.ok? r.json(): [] ),
      fetch(OPENSHEET.COMM).then(r=>r.ok? r.json(): [] ),
      fetch(OPENSHEET.SHOPS_BALANCE).then(r=>r.ok? r.json(): [] )
    ]);

    progressText.textContent = "Building CSVs per shop...";
    // find shops from shopBalance
    const normalizeStr = s => (s||"").toString().trim().toUpperCase();
    const parseNum = v => {
      if (v === undefined || v === null || v === "") return 0;
      const s = String(v).replace(/,/g,"").replace(/\((.*)\)/,"-$1").trim();
      const n = parseFloat(s);
      return isFinite(n) ? n : 0;
    };

    const shopList = [...new Set((shopBalance || []).map(r => normalizeStr(r["SHOP NAME"] || r["SHOP"]))).values()].filter(Boolean);
    const zip = new JSZip();

    let processed = 0;
    for (const shopNormalized of shopList) {
      processed++;
      progressCounter.textContent = `${processed} / ${shopList.length} shops processed`;

      // find comm and shopRow
      const shopCommRow = (comm || []).find(r => normalizeStr(r.SHOP) === shopNormalized) || {};
      const dpCommRate = parseNum(shopCommRow["DP COMM"]);
      const wdCommRate = parseNum(shopCommRow["WD COMM"]);
      const addCommRate = parseNum(shopCommRow["ADD COMM"]);

      const shopRow = (shopBalance || []).find(r => normalizeStr(r["SHOP NAME"] || r["SHOP"]) === shopNormalized) || {};
      const bringForwardBalance = parseNum(shopRow["BRING FORWARD BALANCE"]);
      const securityDeposit = parseNum(shopRow["SECURITY DEPOSIT"]);
      const teamLeader = shopRow["TEAM LEADER"] || "";

      // dates for shop
      const dateSet = new Set([
        ...(deposits || []).filter(r => normalizeStr(r.SHOP) === shopNormalized).map(r => r.DATE),
        ...(withdrawals || []).filter(r => normalizeStr(r.SHOP) === shopNormalized).map(r => r.DATE),
        ...(stlm || []).filter(r => normalizeStr(r.SHOP) === shopNormalized).map(r => r.DATE)
      ]);
      const sortedDates = Array.from(dateSet).filter(Boolean).sort((a,b)=> new Date(a)-new Date(b));

      // === Add shop header ===
      const csvRows = [
        [shopNormalized],
        [`Shop Name: ${shopRow["SHOP NAME"] || shopRow["SHOP"] || shopNormalized}`],
        [`Security Deposit: ${securityDeposit.toFixed(2)}`],
        [`Bring Forward Balance: ${bringForwardBalance.toFixed(2)}`],
        [`Team Leader: ${teamLeader}`],
        [],
        ["DATE","DEPOSIT","WITHDRAWAL","IN","OUT","SETTLEMENT","SPECIAL PAYMENT","ADJUSTMENT","SEC DEPOSIT","DP COMM","WD COMM","ADD COMM","BALANCE"]
      ];

      let runningBalance = bringForwardBalance;
      if (bringForwardBalance) {
        csvRows.push([
          "B/F Balance","0.00","0.00","0.00","0.00","0.00","0.00","0.00",
          securityDeposit.toFixed(2),"0.00","0.00","0.00",runningBalance.toFixed(2)
        ]);
      }

      for (const date of sortedDates) {
        const depTotal = (deposits || []).filter(r => normalizeStr(r.SHOP) === shopNormalized && r.DATE === date)
                          .reduce((s, rr) => s + parseNum(rr.AMOUNT), 0);
        const wdTotal = (withdrawals || []).filter(r => normalizeStr(r.SHOP) === shopNormalized && r.DATE === date)
                          .reduce((s, rr) => s + parseNum(rr.AMOUNT), 0);

        const sumMode = mode => (stlm || []).filter(r => normalizeStr(r.SHOP) === shopNormalized && r.DATE === date && normalizeStr(r.MODE) === mode)
          .reduce((s, rr) => s + parseNum(rr.AMOUNT), 0);

        const inAmt = sumMode("IN");
        const outAmt = sumMode("OUT");
        const settlement = sumMode("SETTLEMENT");
        const specialPayment = sumMode("SPECIAL PAYMENT");
        const adjustment = sumMode("ADJUSTMENT");
        const secDepRow = sumMode("SECURITY DEPOSIT");

        const dpComm = (depTotal * dpCommRate / 100);
        const wdComm = (wdTotal * wdCommRate / 100);
        const addComm = (depTotal * addCommRate / 100);

        runningBalance += depTotal - wdTotal + inAmt - outAmt - settlement - specialPayment + adjustment - dpComm - wdComm - addComm;

        csvRows.push([
          date,
          depTotal.toFixed(2),
          wdTotal.toFixed(2),
          inAmt.toFixed(2),
          outAmt.toFixed(2),
          settlement.toFixed(2),
          specialPayment.toFixed(2),
          adjustment.toFixed(2),
          secDepRow.toFixed(2),
          dpComm.toFixed(2),
          wdComm.toFixed(2),
          addComm.toFixed(2),
          runningBalance.toFixed(2)
        ]);
      }

      // convert to CSV text
      const csvText = csvRows.map(row => row.map(cell => `"${String(cell === undefined || cell === null ? "" : cell).replace(/"/g,'""')}"`).join(",")).join("\n");
      const safeName = (shopNormalized || "UNKNOWN").replace(/[\\/:*?"<>|]/g,"_");
      zip.file(`${safeName}.csv`, csvText);
    }

    progressText.textContent = "Generating ZIP file...";
    progressCounter.textContent = "";

    const blob = await zip.generateAsync({ type: "blob" }, metadata => {
      // optional: metadata.percent available, but because we generate all in-memory, this may not be detailed per-file
      // we will not update UI often here to avoid flicker
    });

    const zipName = `Shop_Daily_Summaries_${new Date().toISOString().slice(0,10)}.zip`;
    saveAs(blob, zipName);

    overlay.style.display = "none";
    overlay.remove();
    alert("ZIP download started.");
  } catch (err) {
    console.error("Failed to build ZIP:", err);
    const overlay = document.getElementById("zipProgressOverlay");
    if (overlay) { overlay.remove(); }
    alert("Failed to create ZIP: " + (err.message || err));
  }
}

/* -------------------------
   Event wiring & init
   ------------------------- */
document.addEventListener("DOMContentLoaded", async () => {
  // Attach UI events (filters, search, pagination, reset)
  document.getElementById("leaderFilter").addEventListener("change", () => {
    const selectedLeader = document.getElementById("leaderFilter").value;
    buildGroupDropdown(rawData, selectedLeader);
    document.getElementById("groupFilter").value = "ALL";
    filterData();
  });

  document.getElementById("groupFilter").addEventListener("change", () => {
    const selectedGroup = document.getElementById("groupFilter").value;
    if (selectedGroup !== "ALL") {
      const match = rawData.find(r => (r["GROUP NAME"] || "").trim().toUpperCase() === selectedGroup);
      if (match) document.getElementById("leaderFilter").value = (match["TEAM LEADER"] || "").trim().toUpperCase();
    }
    filterData();
  });

  document.getElementById("searchInput").addEventListener("input", filterData);
  document.getElementById("prevPage").addEventListener("click", ()=>{ currentPage = Math.max(1, currentPage-1); renderTable(); });
  document.getElementById("nextPage").addEventListener("click", ()=>{ currentPage++; renderTable(); });

  // Export CSV (filtered)
  const exportBtn = document.getElementById("exportBtn");
  if (exportBtn) exportBtn.addEventListener("click", exportCSV);

  // Download ZIP of individual shop summaries
  const zipBtn = document.getElementById("downloadAllShopsBtn");
  if (zipBtn) zipBtn.addEventListener("click", downloadAllShops);

  // Reset button (kept as your UI had it)
  const resetBtn = document.getElementById("resetBtn");
  if (resetBtn) resetBtn.addEventListener("click", ()=>{
    document.getElementById("leaderFilter").disabled = false;
    document.getElementById("leaderFilter").value="ALL";
    document.getElementById("groupFilter").value="ALL";
    document.getElementById("searchInput").value="";
    buildGroupDropdown(rawData,"ALL");
    filteredData = cachedData;
    currentPage = 1;
    renderTable();
  });

  // Show PIN modal then load dashboard (modal will call loadDashboard)
  try {
    await showPinModal(); // resolves when unlocked (or rejects)
    // After unlock, load dashboard
    try {
      rawData = await fetchShopsBalance();
      buildTeamLeaderDropdown(rawData);
      buildGroupDropdown(rawData, "ALL");
      buildSummary(rawData);

      // apply leader filter from URL if present
      const params = new URLSearchParams(window.location.search);
      const leaderFromUrl = params.get("teamLeader");
      if (leaderFromUrl) {
        const leaderSelect = document.getElementById("leaderFilter");
        leaderSelect.value = leaderFromUrl.toUpperCase();
        buildGroupDropdown(rawData, leaderSelect.value);
        filterData();

        leaderSelect.disabled = true;
        [...leaderSelect.options].forEach(opt => {
          if (opt.value === "ALL") opt.hidden = true;
        });
      }
    } catch(err) {
      console.error("Error loading dashboard data:", err);
      alert("Failed to load dashboard data: " + (err.message || err));
    }
  } catch(err) {
    // user cancelled PIN or failed -> show message and block
    document.body.innerHTML = `<h2 style="color:red;text-align:center;margin-top:40px;">Access Denied ❌<br>Invalid PIN or cancelled</h2>`;
  }
});
