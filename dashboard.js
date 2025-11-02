// dashboard.js (final) - unified IDs, robust downloads, totals, leader filtering + redirect links + absolute leader filter

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
  if (v === undefined || v === null || v === "") return 0;
  const s = String(v).replace(/,/g,"").replace(/\((.*)\)/,"-$1").trim();
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
const PIN_CODE = "11012025";

/* -------------------------
   PIN Modal
   ------------------------- */
function showPinModal() {
  if (sessionStorage.getItem("verifiedPin") === "true") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const overlay = document.createElement("div");
    overlay.id = "pinOverlay";
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;`;
    overlay.innerHTML = `
      <div style="width:360px;max-width:94%;background:#fff;border-radius:12px;padding:22px;text-align:center;">
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

    function ok() {
      const val = pinInput.value?.trim();
      if (val === PIN_CODE) {
        overlay.remove();
        sessionStorage.setItem("verifiedPin", "true");
        resolve();
      } else {
        pinError.style.display = "block";
        pinInput.value = "";
        pinInput.focus();
      }
    }
    pinOk.addEventListener("click", ok);
    pinCancel.addEventListener("click", () => { overlay.remove(); reject(new Error("cancelled")); });
    pinInput.addEventListener("keydown", (e) => { if (e.key === "Enter") ok(); if (e.key === "Escape") { overlay.remove(); reject(new Error("cancelled")); }});
  });
}

/* -------------------------
   Fetch & Build Summary
   ------------------------- */
async function fetchShopsBalance(){
  const res = await fetch(OPENSHEET.SHOPS_BALANCE);
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.map(normalize);
}

function buildSummary(data){
  const summary = {};
  data.forEach(r=>{
    const shop = (r["SHOP"]||r["SHOP NAME"]||"").trim();
    if(!shop) return;
    if(!summary[shop]) summary[shop] = Object.assign({}, ...HEADERS.map(h=> ({ [h]: (h==="SHOP NAME"? shop : (h==="TEAM LEADER"? ((r["TEAM LEADER"]||"").trim().toUpperCase()) : (h==="GROUP NAME"? ((r["GROUP NAME"]||"").trim().toUpperCase()) : 0) ) ) })));
    ["SECURITY DEPOSIT","BRING FORWARD BALANCE","TOTAL DEPOSIT","TOTAL WITHDRAWAL","INTERNAL TRANSFER IN","INTERNAL TRANSAFER OUT","SETTLEMENT","SPECIAL PAYMENT","ADJUSTMENT","DP COMM","WD COMM","ADD COMM"].forEach(key=>{
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

/* -------------------------
   Render Table & Totals
   ------------------------- */
function renderTable(){
  const tableHead = document.getElementById("tableHeader");
  const tableBody = document.getElementById("tableBody");
  tableHead.innerHTML = ""; tableBody.innerHTML = "";

  HEADERS.forEach(h=>{
    const th=document.createElement("th"); th.textContent=h; tableHead.appendChild(th);
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
        a.style.color = "#0077cc";
        a.style.textDecoration = "underline";
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

function updatePagination(){
  const totalPages = Math.ceil(filteredData.length/rowsPerPage) || 1;
  document.getElementById("pageInfo").textContent = `Page ${currentPage} of ${totalPages}`;
  document.getElementById("prevPage").disabled = currentPage===1;
  document.getElementById("nextPage").disabled = currentPage===totalPages;
}

function updateTeamDashboardLink(){
  const leader = document.getElementById("leaderFilter").value;
  const linkDiv = document.getElementById("teamDashboardLink");
  if(leader && leader!=="ALL"){
    const url = `${window.location.origin}${window.location.pathname}?teamLeader=${encodeURIComponent(leader)}`;
    linkDiv.innerHTML = `<a href="${url}" target="_blank" style="color:#0077cc;font-weight:bold;text-decoration:underline">Open ${leader} Dashboard in New Tab</a>`;
  } else linkDiv.innerHTML = "";
}

/* -------------------------
   Filters
   ------------------------- */
function buildTeamLeaderDropdown(data){
  const dd = document.getElementById("leaderFilter");
  dd.innerHTML = '<option value="ALL">All Team Leaders</option>';
  const leaders = [...new Set(data.map(r=> (r["TEAM LEADER"]||"").trim().toUpperCase()))].filter(x=>x&&x!=="#N/A"&&x!=="N/A").sort();
  leaders.forEach(l=>{ const opt=document.createElement("option"); opt.value=l; opt.textContent=l; dd.appendChild(opt); });
}

function buildGroupDropdown(data, selectedLeader="ALL"){
  const dd = document.getElementById("groupFilter");
  dd.innerHTML = '<option value="ALL">All Groups</option>';
  const groups = [...new Set(data.filter(r=> selectedLeader==="ALL" || (r["TEAM LEADER"]||"").toUpperCase()===selectedLeader).map(r=> (r["GROUP NAME"]||"").trim().toUpperCase()))].filter(x=>x&&x!=="#N/A"&&x!=="N/A").sort();
  groups.forEach(g=>{ const opt=document.createElement("option"); opt.value=g; opt.textContent=g; dd.appendChild(opt); });
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
  // build CSV rows
  const rows = [HEADERS.join(",")];
  filteredData.forEach(r=>{
    const row = HEADERS.map(h=> {
      const v = (r[h] === undefined || r[h] === null) ? "" : String(r[h]);
      return `"${v.replace(/"/g,'""')}"`;
    }).join(",");
    rows.push(row);
  });
  const blob = new Blob([rows.join("\n")], {type:"text/csv;charset=utf-8"});
  // check saveAs available
  if (typeof saveAs !== "function") {
    console.error("FileSaver (saveAs) not available.");
    alert("Download failed: FileSaver.js not loaded.");
    return;
  }
  saveAs(blob, `Shops_Summary_${new Date().toISOString().slice(0,10)}.csv`);
}

/* -------------------------
   ZIP Download (per-shop CSVs, filtered by leader)
   ------------------------- */
async function downloadAllShops() {
  console.log("downloadAllShops triggered");
  // dependency checks
  if (typeof JSZip !== "function" && typeof JSZip !== "object") {
    alert("JSZip not loaded. Please include JSZip before dashboard.js");
    console.error("JSZip missing");
    return;
  }
  if (typeof saveAs !== "function") {
    alert("FileSaver (saveAs) not loaded. Please include FileSaver.js before dashboard.js");
    console.error("saveAs missing");
    return;
  }

  const overlay = createProgressOverlay();
  try {
    setProgressText("Fetching sheets...");
    const [deposits, withdrawals, stlm, comm, shopBalanceRaw] = await Promise.all([
      fetch(OPENSHEET.DEPOSIT).then(r=>r.ok? r.json(): []),
      fetch(OPENSHEET.WITHDRAWAL).then(r=>r.ok? r.json(): []),
      fetch(OPENSHEET.STLM).then(r=>r.ok? r.json(): []),
      fetch(OPENSHEET.COMM).then(r=>r.ok? r.json(): []),
      fetch(OPENSHEET.SHOPS_BALANCE).then(r=>r.ok? r.json(): [])
    ]);

    // normalize keys
    const normalizeKeys = obj => { const o={}; for(const k in obj) o[cleanKey(k)] = obj[k]; return o; };
    const shopBalance = (shopBalanceRaw||[]).map(normalizeKeys);
    const depositsNorm = (deposits||[]).map(normalizeKeys);
    const withdrawalsNorm = (withdrawals||[]).map(normalizeKeys);
    const stlmNorm = (stlm||[]).map(normalizeKeys);
    const commNorm = (comm||[]).map(normalizeKeys);

    setProgressText("Building CSVs per shop...");
    // selected leader
    const selectedLeader = document.getElementById("leaderFilter")?.value?.trim().toUpperCase() || "ALL";
    let shopsList = shopBalance;
    if (selectedLeader !== "ALL") shopsList = shopBalance.filter(r => ((r["TEAM LEADER"]||"").toUpperCase()) === selectedLeader);
    const shopNames = [...new Set(shopsList.map(r => (r["SHOP"]||"").toUpperCase()))].filter(Boolean);

    const zip = new JSZip();
    let idx = 0;
    for (const shopNormalized of shopNames) {
      idx++;
      setProgressText(`Building CSVs (${idx} / ${shopNames.length})`);
      document.getElementById("zipProgressCounter").textContent = `${idx} / ${shopNames.length} shops processed`;

      const shopRow = shopBalance.find(r => (r["SHOP"]||"").toUpperCase() === shopNormalized) || {};
      const teamLeader = shopRow["TEAM LEADER"] || "";
      const securityDeposit = parseNumber(shopRow["SECURITY DEPOSIT"]);
      const bringForwardBalance = parseNumber(shopRow["BRING FORWARD BALANCE"] || shopRow["BRING FORWARD BALANCE "] || 0);

      const shopCommRow = commNorm.find(r => (r["SHOP"]||"").toUpperCase() === shopNormalized) || {};
      const dpCommRate = parseNumber(shopCommRow["DP COMM"]);
      const wdCommRate = parseNumber(shopCommRow["WD COMM"]);
      const addCommRate = parseNumber(shopCommRow["ADD COMM"]);

      // find dates
      const dateSet = new Set([
        ...(depositsNorm||[]).filter(r => (r["SHOP"]||"").toUpperCase() === shopNormalized).map(r => r["DATE"]),
        ...(withdrawalsNorm||[]).filter(r => (r["SHOP"]||"").toUpperCase() === shopNormalized).map(r => r["DATE"]),
        ...(stlmNorm||[]).filter(r => (r["SHOP"]||"").toUpperCase() === shopNormalized).map(r => r["DATE"])
      ]);
      const sortedDates = Array.from(dateSet).filter(Boolean).sort((a,b)=> new Date(a)-new Date(b));

      // build rows
      const csvRows = [
        [shopNormalized],
        [`Shop Name: ${shopNormalized}`],
        [`Security Deposit: ${securityDeposit.toFixed(2)}`],
        [`Bring Forward Balance: ${bringForwardBalance.toFixed(2)}`],
        [`Team Leader: ${teamLeader}`],
        [],
        ["DATE","DEPOSIT","WITHDRAWAL","IN","OUT","SETTLEMENT","SPECIAL PAYMENT","ADJUSTMENT","SEC DEPOSIT","DP COMM","WD COMM","ADD COMM","BALANCE"]
      ];

      let runningBalance = bringForwardBalance;
      csvRows.push(["B/F Balance","0.00","0.00","0.00","0.00","0.00","0.00","0.00",securityDeposit.toFixed(2),"0.00","0.00","0.00",runningBalance.toFixed(2)]);

      // helper to sum
      const sumRows = (arr, date, shop, key, mode=null) => {
        return (arr||[]).filter(r => ((r["SHOP"]||"").toUpperCase() === shop) && r["DATE"] === date && (mode ? ((r["MODE"]||"").toUpperCase() === mode) : true))
                        .reduce((s, rr) => s + parseNumber(rr[key] || rr["AMOUNT"] || 0), 0);
      };

      for (const date of sortedDates) {
        const depTotal = sumRows(depositsNorm, date, shopNormalized, "AMOUNT");
        const wdTotal = sumRows(withdrawalsNorm, date, shopNormalized, "AMOUNT");
        const inAmt = sumRows(stlmNorm, date, shopNormalized, "AMOUNT", "IN");
        const outAmt = sumRows(stlmNorm, date, shopNormalized, "AMOUNT", "OUT");
        const settlement = sumRows(stlmNorm, date, shopNormalized, "AMOUNT", "SETTLEMENT");
        const specialPayment = sumRows(stlmNorm, date, shopNormalized, "AMOUNT", "SPECIAL PAYMENT");
        const adjustment = sumRows(stlmNorm, date, shopNormalized, "AMOUNT", "ADJUSTMENT");
        const secDepRow = sumRows(stlmNorm, date, shopNormalized, "AMOUNT", "SECURITY DEPOSIT");

        const dpComm = depTotal * dpCommRate/100;
        const wdComm = wdTotal * wdCommRate/100;
        const addComm = depTotal * addCommRate/100;

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

      // Safe totals
      const totals = {deposit:0,withdrawal:0,in:0,out:0,settlement:0,specialPayment:0,adjustment:0,secDep:0,dpComm:0,wdComm:0,addComm:0};
      for (const row of csvRows) {
        if (!row || row.length < 13) continue;
        if (row[0] === "DATE" || row[0] === "B/F Balance" || row[0] === "TOTAL" || !row[1]) continue;
        totals.deposit += parseNumber(row[1]);
        totals.withdrawal += parseNumber(row[2]);
        totals.in += parseNumber(row[3]);
        totals.out += parseNumber(row[4]);
        totals.settlement += parseNumber(row[5]);
        totals.specialPayment += parseNumber(row[6]);
        totals.adjustment += parseNumber(row[7]);
        totals.secDep += parseNumber(row[8]);
        totals.dpComm += parseNumber(row[9]);
        totals.wdComm += parseNumber(row[10]);
        totals.addComm += parseNumber(row[11]);
      }

      csvRows.push(["TOTAL",
        totals.deposit.toFixed(2),
        totals.withdrawal.toFixed(2),
        totals.in.toFixed(2),
        totals.out.toFixed(2),
        totals.settlement.toFixed(2),
        totals.specialPayment.toFixed(2),
        totals.adjustment.toFixed(2),
        totals.secDep.toFixed(2),
        totals.dpComm.toFixed(2),
        totals.wdComm.toFixed(2),
        totals.addComm.toFixed(2),
        runningBalance.toFixed(2)
      ]);

      const csvText = csvRows.map(row => row.map(cell => `"${String(cell??"").replace(/"/g,'""')}"`).join(",")).join("\n");
      const safeName = (shopNormalized||"UNKNOWN").replace(/[\\/:*?"<>|]/g,"_");
      zip.file(`${safeName}.csv`, csvText);
    }

    setProgressText("Generating ZIP file...");
    document.getElementById("zipProgressCounter").textContent = "";

    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, `Shop_Daily_Summaries_${new Date().toISOString().slice(0,10)}.zip`);
    overlay.remove();
    alert("ZIP download started.");
  } catch (err) {
    console.error("ZIP creation error:", err);
    overlay.remove();
    alert("ZIP generation failed: " + (err && err.message ? err.message : err));
  }
}

function createProgressOverlay(){
  let overlay = document.getElementById("zipProgressOverlay");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "zipProgressOverlay";
  overlay.style.cssText = `position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);z-index:99998;`;
  overlay.innerHTML = `<div style="background:#fff;padding:20px;border-radius:10px;min-width:260px;text-align:center;">
    <div id="zipProgressText" style="font-weight:600;margin-bottom:8px;">Building ZIP... please wait</div>
    <div id="zipProgressCounter" style="font-size:13px;color:#555;"></div>
  </div>`;
  document.body.appendChild(overlay);
  return overlay;
}
function setProgressText(txt){ const el=document.getElementById("zipProgressText"); if(el) el.textContent=txt; }

/* -------------------------
   Init
   ------------------------- */
document.addEventListener("DOMContentLoaded", async ()=>{
  try {
    await showPinModal();
    rawData = await fetchShopsBalance();
    buildTeamLeaderDropdown(rawData);
    buildGroupDropdown(rawData);
    buildSummary(rawData);

    // Auto-filter + absolute lock if ?teamLeader present
const params = new URLSearchParams(window.location.search);
const leaderParam = (params.get("teamLeader") || "").toUpperCase();
if (leaderParam) {
  const leaderSelect = document.getElementById("leaderFilter");
  if (leaderSelect) {
    leaderSelect.value = leaderParam;
    leaderSelect.disabled = true; // 🔒 absolute filter
    buildGroupDropdown(rawData, leaderParam);
    filterData();
  }
  // persist URL param
  const url = new URL(window.location.href);
  if (url.searchParams.get("teamLeader") !== leaderParam) {
    url.searchParams.set("teamLeader", leaderParam);
    window.history.replaceState({}, "", url.href);
  }
}

    // wire up UI - make sure these IDs exist in your HTML
    const leaderFilter = document.getElementById("leaderFilter");
    const groupFilter = document.getElementById("groupFilter");
    const searchInput = document.getElementById("searchInput");
    const prevPage = document.getElementById("prevPage");
    const nextPage = document.getElementById("nextPage");
    const exportBtn = document.getElementById("exportBtn");          // matches your HTML
    const zipBtn = document.getElementById("downloadAllShopsBtn");  // matches your HTML

    if (leaderFilter) leaderFilter.addEventListener("change", e => { buildGroupDropdown(rawData, e.target.value); filterData(); });
    if (groupFilter) groupFilter.addEventListener("change", filterData);
    if (searchInput) searchInput.addEventListener("input", filterData);
    if (prevPage) prevPage.addEventListener("click", ()=>{ if(currentPage>1){ currentPage--; renderTable(); }});
    if (nextPage) nextPage.addEventListener("click", ()=>{ if(currentPage < Math.ceil(filteredData.length/rowsPerPage)){ currentPage++; renderTable(); }});
    if (exportBtn) exportBtn.addEventListener("click", exportCSV);
    if (zipBtn) zipBtn.addEventListener("click", downloadAllShops);

  } catch (e) {
    console.error("Init error:", e);
    alert("Access denied or failed to load data.");
  }
});
