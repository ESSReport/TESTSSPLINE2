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
  "TOTAL DEPOSIT","TOTAL WITHDRAWAL","INTERNAL TRANSFER IN","INTERNAL TRANSFAER OUT",
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
async function showPinModal() {
  if (sessionStorage.getItem("verifiedPin") === "true") return;
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
    pinCancel.addEventListener("click", () => { overlay.remove(); reject(); });
    pinInput.addEventListener("keydown", (e) => { if(e.key==="Enter") ok(); if(e.key==="Escape") { overlay.remove(); reject(); }} );
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
    if(!summary[shop]) {
      summary[shop] = Object.assign({}, ...HEADERS.map(h=> ({ [h]: (h==="SHOP NAME"? shop : (h==="TEAM LEADER"? ((r["TEAM LEADER"]||"").trim().toUpperCase()) : (h==="GROUP NAME"? ((r["GROUP NAME"]||"").trim().toUpperCase()) : 0) ) ) })));
    }
    ["SECURITY DEPOSIT","BRING FORWARD BALANCE","TOTAL DEPOSIT","TOTAL WITHDRAWAL","INTERNAL TRANSFER IN","INTERNAL TRANSFAER OUT","SETTLEMENT","SPECIAL PAYMENT","ADJUSTMENT","DP COMM","WD COMM","ADD COMM"].forEach(key=>{
      summary[shop][key] = (summary[shop][key] || 0) + parseNumber(r[key]);
    });

    summary[shop]["RUNNING BALANCE"] = 
      (summary[shop]["BRING FORWARD BALANCE"]||0) +
      (summary[shop]["TOTAL DEPOSIT"]||0) - (summary[shop]["TOTAL WITHDRAWAL"]||0) +
      (summary[shop]["INTERNAL TRANSFER IN"]||0) - (summary[shop]["INTERNAL TRANSFAER OUT"]||0) -
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
  if (tableHead) tableHead.innerHTML = "";
  if (tableBody) tableBody.innerHTML = "";

  HEADERS.forEach(h=>{
    const th=document.createElement("th"); th.textContent=h; if (tableHead) tableHead.appendChild(th);
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
    if (tableBody) tableBody.appendChild(tr);
  });

  updatePagination();
  renderTotals();
  updateTeamDashboardLink();
}

function renderTotals(){
  const totalsDiv = document.getElementById("totalsRow");
  if (!totalsDiv) return;
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
  const pageInfo = document.getElementById("pageInfo");
  const prevBtn = document.getElementById("prevPage");
  const nextBtn = document.getElementById("nextPage");
  const totalPages = Math.ceil(filteredData.length/rowsPerPage) || 1;
  if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  if (prevBtn) prevBtn.disabled = currentPage===1;
  if (nextBtn) nextBtn.disabled = currentPage===totalPages;
}

function updateTeamDashboardLink(){
  const leader = (document.getElementById("leaderFilter")?.value || "").trim();
  const linkDiv = document.getElementById("teamDashboardLink");
  if(!linkDiv) return;
  if(leader && leader!=="ALL"){
    const url = `${window.location.origin}${window.location.pathname}?teamLeader=${encodeURIComponent(leader)}`;
    linkDiv.innerHTML = `<a href="${url}" target="_blank" style="color:#0077cc;font-weight:bold;text-decoration:underline">Open ${leader} Dashboard in New Tab</a>`;
  } else linkDiv.innerHTML = "";
}

function buildTeamLeaderDropdown(data){
  const dd = document.getElementById("leaderFilter");
  if(!dd) return;
  dd.innerHTML = '<option value="ALL">All Team Leaders</option>';
  const leaders = [...new Set(data.map(r=> (r["TEAM LEADER"]||"").trim().toUpperCase()))].filter(x=>x&&x!=="#N/A"&&x!=="N/A").sort();
  leaders.forEach(l=>{ const opt=document.createElement("option"); opt.value=l; opt.textContent=l; dd.appendChild(opt); });
}

function buildGroupDropdown(data, selectedLeader="ALL"){
  const dd = document.getElementById("groupFilter");
  if(!dd) return;
  dd.innerHTML = '<option value="ALL">All Groups</option>';
  const groups = [...new Set(data.filter(r=> selectedLeader==="ALL" || (r["TEAM LEADER"]||"").toUpperCase()===selectedLeader).map(r=> (r["GROUP NAME"]||"").trim().toUpperCase()))].filter(x=>x&&x!=="#N/A"&&x!=="N/A").sort();
  groups.forEach(g=>{ const opt=document.createElement("option"); opt.value=g; opt.textContent=g; dd.appendChild(opt); });
}

function filterData(){
  const leader = document.getElementById("leaderFilter")?.value || "ALL";
  const group = document.getElementById("groupFilter")?.value || "ALL";
  const search = document.getElementById("searchInput")?.value.trim().toUpperCase() || "";
  filteredData = cachedData.filter(r=>{
    const matchLeader = leader==="ALL" || (r["TEAM LEADER"]||"").toUpperCase()===leader;
    const matchGroup = group==="ALL" || (r["GROUP NAME"]||"").toUpperCase()===group;
    const matchSearch = (r["SHOP NAME"]||"").toUpperCase().includes(search);
    return matchLeader && matchGroup && matchSearch;
  });
  currentPage = 1;
  renderTable();
}

/* -------------------------
   CSV Export (filteredData)
------------------------- */
function exportCSV() {
  if (!filteredData.length) { alert("No data to export"); return; }
  const rows = [HEADERS.join(",")];
  filteredData.forEach(r=>{
    const row = HEADERS.map(h=> {
      const v = (r[h] === undefined || r[h] === null) ? "" : String(r[h]);
      return `"${v.replace(/"/g,'""')}"`;
    }).join(",");
    rows.push(row);
  });
  const blob = new Blob([rows.join("\n")], {type:"text/csv;charset=utf-8"});
  saveAs(blob, `Shops_Summary_${new Date().toISOString().slice(0,10)}.csv`);
}

/* -------------------------
   ZIP Download (per-shop summaries)
   Uses filteredData instead of fetching all again
------------------------- */
async function downloadAllShops() {
  if (typeof JSZip === "undefined") { alert("JSZip not loaded."); return; }
  if (typeof saveAs === "undefined") { alert("FileSaver not loaded."); return; }

  const overlay = createProgressOverlay();
  try {
    setProgressText("Building CSVs per shop...");

    const zip = new JSZip();
    const shopsList = filteredData;
    const shopNames = [...new Set(shopsList.map(r => (r["SHOP NAME"]||"").toUpperCase()))].filter(Boolean);

    let idx=0;
    for (const shopNormalized of shopNames) {
      idx++;
      setProgressText(`Building CSV (${idx}/${shopNames.length})`);
      document.getElementById("zipProgressCounter").textContent = `${idx} / ${shopNames.length} shops processed`;

      const shopRow = shopsList.find(r => (r["SHOP NAME"]||"").toUpperCase() === shopNormalized) || {};
      const csvRows = [HEADERS];
      const row = HEADERS.map(h => shopRow[h] || 0);
      csvRows.push(row);

      const csvText = csvRows.map(row => row.map(cell => `"${String(cell ?? "").replace(/"/g,'""')}"`).join(",")).join("\n");
      const safeName = (shopNormalized||"UNKNOWN").replace(/[\\\/:*?"<>|]/g,"_");
      zip.file(`${safeName}.csv`, csvText);
    }

    setProgressText("Generating ZIP file...");
    document.getElementById("zipProgressCounter").textContent = "";

    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, `Shop_Summaries_${new Date().toISOString().slice(0,10)}.zip`);
    removeProgressOverlay();
    alert("ZIP download started.");
  } catch(err){
    console.error(err);
    removeProgressOverlay();
    alert("ZIP generation failed: "+(err.message||err));
  }
}

/* -------------------------
   Progress overlay helpers
------------------------- */
function createProgressOverlay(){
  if (document.getElementById("zipProgressOverlay")) return document.getElementById("zipProgressOverlay");
  const overlay = document.createElement("div");
  overlay.id = "zipProgressOverlay";
  overlay.style.cssText = `position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);z-index:99998;`;
  overlay.innerHTML = `<div style="background:#fff;padding:20px;border-radius:10px;min-width:260px;text-align:center;">
    <div id="zipProgressText" style="font-weight:600;margin-bottom:8px;">Building ZIP... please wait</div>
    <div id="zipProgressCounter" style="font-size:13px;color:#555;"></div>
  </div>`;
  document.body.appendChild(overlay);
  return overlay;
}
function setProgressText(txt){ const el=document.getElementById("zipProgressText"); if(el) el.textContent = txt; }
function removeProgressOverlay(){ const el=document.getElementById("zipProgressOverlay"); if(el) el.remove(); }

/* -------------------------
   Event binding & init
------------------------- */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await showPinModal();
    rawData = await fetchShopsBalance();
    buildSummary(rawData);
    buildTeamLeaderDropdown(rawData);
    buildGroupDropdown(rawData);
    updateTeamDashboardLink();

    const listeners = [
      ["leaderFilter","change", () => { buildGroupDropdown(rawData, document.getElementById("leaderFilter").value); filterData(); }],
      ["groupFilter","change", filterData],
      ["searchInput","input", filterData],
      ["prevPage","click", () => { if (currentPage>1){ currentPage--; renderTable(); } }],
      ["nextPage","click", () => { if (currentPage < Math.ceil(filteredData.length/rowsPerPage)) { currentPage++; renderTable(); } }],
      ["exportBtn","click", exportCSV],
      ["downloadAllShopsBtn","click", downloadAllShops]
    ];
    listeners.forEach(([id,evt,fn])=>{
      const el=document.getElementById(id);
      if (el) el.addEventListener(evt,fn);
    });

    const params = new URLSearchParams(window.location.search);
    const leaderParam = (params.get("teamLeader") || "").toUpperCase();
    if (leaderParam) {
      const leaderSelect = document.getElementById("leaderFilter");
      if (leaderSelect) {
        leaderSelect.value = leaderParam;
        leaderSelect.disabled = true;
        buildGroupDropdown(rawData, leaderParam);
        filterData();
      }
    }

  } catch (err) {
    console.error("Init error:", err);
    alert("Failed to load dashboard: " + (err && err.message ? err.message : err));
  }
});
