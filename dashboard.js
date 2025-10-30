// Dashboard with Download Individual Summaries (ZIP of CSVs)
// Uses the same OpenSheet tabs as shop_dashboard.js to compute per-shop details.

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

/* ---------- fetch shop balance (main list) ---------- */
async function fetchShopsBalance(){
  const res = await fetch(OPENSHEET.SHOPS_BALANCE);
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.map(normalize);
}

/* ---------- init ---------- */
async function loadDashboard(){
  try{
    rawData = await fetchShopsBalance();
  } catch(e){
    console.error("Error fetching shops balance:", e);
    alert("Failed to load shop balance. Check network and sheet name.");
    return;
  }

  // build dropdowns
  buildTeamLeaderDropdown(rawData);
  buildGroupDropdown(rawData, "ALL");

  // build summary aggregated by shop
  buildSummary(rawData);
}

/* ---------- dropdowns ---------- */
function buildTeamLeaderDropdown(data){
  const dd = document.getElementById("leaderFilter");
  dd.innerHTML = '<option value="ALL">All Team Leaders</option>';
  const leaders = [...new Set(data.map(r=> (r["TEAM LEADER"]||"").trim().toUpperCase()))].filter(x=>x&&x!=="#N/A"&&x!=="N/A").sort();
  leaders.forEach(l=>{
    const opt=document.createElement("option"); opt.value=l; opt.textContent=l; dd.appendChild(opt);
  });
}

function buildGroupDropdown(data, selectedLeader="ALL"){
  const dd = document.getElementById("groupFilter");
  dd.innerHTML = '<option value="ALL">All Groups</option>';
  const groups = [...new Set(data.filter(r=> selectedLeader==="ALL" || (r["TEAM LEADER"]||"").toUpperCase()===selectedLeader).map(r=> (r["GROUP NAME"]||"").trim().toUpperCase()))].filter(x=>x&&x!=="#N/A"&&x!=="N/A").sort();
  groups.forEach(g=>{ const opt=document.createElement("option"); opt.value=g; opt.textContent=g; dd.appendChild(opt); });
}

/* ---------- build summary (aggregate main table) ---------- */
function buildSummary(data){
  const summary = {};
  data.forEach(r=>{
    const shop = (r["SHOP"]||r["SHOP NAME"]||"").trim();
    if(!shop) return;
    if(!summary[shop]) summary[shop] = Object.assign({}, ...HEADERS.map(h=> ({[h] : (h==="SHOP NAME"? shop : (h==="TEAM LEADER"? ((r["TEAM LEADER"]||"").trim().toUpperCase()) : (h==="GROUP NAME"? ((r["GROUP NAME"]||"").trim().toUpperCase()) : 0)))})));
    // accumulate numeric fields
    ["SECURITY DEPOSIT","BRING FORWARD BALANCE","TOTAL DEPOSIT","TOTAL WITHDRAWAL","INTERNAL TRANSFER IN","INTERNAL TRANSAFER OUT","SETTLEMENT","SPECIAL PAYMENT","ADJUSTMENT","DP COMM","WD COMM","ADD COMM"].forEach(key=>{
      summary[shop][key] = (summary[shop][key] || 0) + parseNumber(r[key]);
    });
    summary[shop]["RUNNING BALANCE"] = (summary[shop]["BRING FORWARD BALANCE"]||0) + (summary[shop]["TOTAL DEPOSIT"]||0) - (summary[shop]["TOTAL WITHDRAWAL"]||0) + (summary[shop]["INTERNAL TRANSFER IN"]||0) - (summary[shop]["INTERNAL TRANSAFER OUT"]||0) - (summary[shop]["SETTLEMENT"]||0) - (summary[shop]["SPECIAL PAYMENT"]||0) + (summary[shop]["ADJUSTMENT"]||0) - (summary[shop]["DP COMM"]||0) - (summary[shop]["WD COMM"]||0) - (summary[shop]["ADD COMM"]||0);
    summary[shop]["WALLET NUMBER"] = r["WALLET NUMBER"] || summary[shop]["WALLET NUMBER"];
  });
  cachedData = Object.values(summary);
  filteredData = cachedData;
  renderTable();
}

/* ---------- render table ---------- */
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
        const a=document.createElement("a"); a.textContent = r[h] + (r["WALLET NUMBER"]? ` (${r["WALLET NUMBER"]})` : "");
        a.href = `shop_dashboard.html?shopName=${encodeURIComponent(r[h])}`; a.target="_blank"; a.className="shop-link";
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
    const card=document.createElement("div"); card.className="total-card";
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

/* ---------- filtering ---------- */
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

/* ---------- CSV export (main list) ---------- */
function exportCSV(){
  try{
    const BOM = "\uFEFF";
    let csv = BOM + HEADERS.join(",") + "\r\n";
    filteredData.forEach(r=>{
      const row = HEADERS.map(h=>{
        let val = r[h] ?? "";
        if(typeof val==="number") val = val.toFixed(2);
        val = String(val).replace(/"/g,'""').replace(/\r?\n|\r/g,' ');
        return `"${val}"`;
      }).join(",");
      csv += row + "\r\n";
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.style.display="none"; a.href=url;
    a.download = filteredData.length === cachedData.length ? "All_Shops_Summary.csv" : "Filtered_Shops_Summary.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 500);
  } catch(e){ console.error(e); alert("CSV export failed"); }
}

/* ========== NEW: ZIP of detailed per-shop CSVs ========== */
/* This function fetches deposit/withdrawal/stlm/comm/shop_balance sheets once,
   then for each visible shop it builds the same per-date rows the shop_dashboard shows,
   making CSVs with BOM + CRLF and packing them to ZIP. */

async function downloadAllIndividualSummaries(){
  const shops = filteredData.length ? filteredData : cachedData;
  if(!shops.length){ alert("No shops to download"); return; }
  if(!confirm(`Download detailed summaries for ${shops.length} shop(s)? This may take a while.`)) return;

  // Fetch all required sheets once
  let depositData=[], withdrawalData=[], stlmData=[], commData=[], shopBalanceData=[];
  try {
    const [d,w,s,c, sb] = await Promise.all([
      fetch(OPENSHEET.DEPOSIT).then(r=>r.ok? r.json(): Promise.reject(r.status)),
      fetch(OPENSHEET.WITHDRAWAL).then(r=>r.ok? r.json(): Promise.reject(r.status)),
      fetch(OPENSHEET.STLM).then(r=>r.ok? r.json(): Promise.reject(r.status)),
      fetch(OPENSHEET.COMM).then(r=>r.ok? r.json(): Promise.reject(r.status)),
      fetch(OPENSHEET.SHOPS_BALANCE).then(r=>r.ok? r.json(): Promise.reject(r.status))
    ]);
    depositData = d; withdrawalData = w; stlmData = s; commData = c; shopBalanceData = sb;
  } catch(err){
    console.error("Failed to fetch sheets:", err);
    alert("Failed to fetch detailed sheets. Check network or sheet names.");
    return;
  }

  // Normalize helper (case-insensitive keys preserved as returned from sheet)
  const normKey = key => String(key||"").trim();

  // helper functions (mimic shop_dashboard.js logic)
  const normalizeShop = s => (String(s||"").trim().replace(/\s+/g," ").toUpperCase());
  const parseNum = n => parseNumber(n);

  function formatNumberForCsv(v){
    // keep same visual formatting as shop_dashboard: commas and 2 decimals
    return (typeof v === "number" ? v : parseNumber(v)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const zip = new JSZip();
  const btn = document.getElementById("downloadAllShopsBtn");
  const originalText = btn.textContent;
  btn.disabled = true; btn.textContent = "⏳ Preparing...";

  let count = 0;
  for(const shopRec of shops){
    const shopName = (shopRec["SHOP NAME"] || shopRec["SHOP"] || "").trim();
    if(!shopName){
      count++; btn.textContent = `⏳ ${count}/${shops.length}`; continue;
    }
    const normalizedShop = normalizeShop(shopName);

    // find shop balance row for B/F and security deposit and team leader
    const shopRow = (shopBalanceData || []).find(r => normalizeShop(r["SHOP"]) === normalizedShop);
    const bringForwardBalance = parseNum(shopRow ? (rTrim(shopRow[" BRING FORWARD BALANCE "]) || shopRow["BRING FORWARD BALANCE"]) : 0);
    const securityDeposit = parseNum(shopRow ? rTrim(shopRow["SECURITY DEPOSIT"]) : 0);
    const teamLeader = shopRow ? (rTrim(shopRow["TEAM LEADER"]) || "") : (shopRec["TEAM LEADER"] || "");

    // commission rates
    const shopCommRow = (commData || []).find(r => normalizeShop(r.SHOP) === normalizedShop);
    const dpCommRate = parseNum(shopCommRow?.["DP COMM"]);
    const wdCommRate = parseNum(shopCommRow?.["WD COMM"]);
    const addCommRate = parseNum(shopCommRow?.["ADD COMM"]);

    // get unique dates
    const depositDates = (depositData || []).filter(r => normalizeShop(r.SHOP) === normalizedShop).map(r=> r.DATE).filter(Boolean);
    const withdrawalDates = (withdrawalData || []).filter(r => normalizeShop(r.SHOP) === normalizedShop).map(r=> r.DATE).filter(Boolean);
    const stlmDates = (stlmData || []).filter(r => normalizeShop(r.SHOP) === normalizedShop).map(r=> r.DATE).filter(Boolean);
    const datesSet = new Set([...depositDates, ...withdrawalDates, ...stlmDates]);
    const sortedDates = Array.from(datesSet).filter(Boolean).sort((a,b)=> new Date(a) - new Date(b));

    // prepare runningBalance and totals
    let runningBalance = bringForwardBalance || 0;
    const totals = { depTotal:0, wdTotal:0, inAmt:0, outAmt:0, settlement:0, specialPay:0, adjustment:0, secDep:0, dpComm:0, wdComm:0, addComm:0 };

    // build CSV content - include header info like shop_dashboard
    const BOM = "\uFEFF";
    let csv = BOM;
    csv += `Shop Name,${escapeCsv(shopName)}\r\n`;
    csv += `Security Deposit,${escapeCsv(formatNumberForCsv(securityDeposit))}\r\n`;
    csv += `Bring Forward Balance,${escapeCsv(formatNumberForCsv(bringForwardBalance))}\r\n`;
    csv += `Team Leader,${escapeCsv(teamLeader)}\r\n\r\n`;

    const tableHeaders = ["DATE","DEPOSIT","WITHDRAWAL","IN","OUT","SETTLEMENT","SPECIAL PAYMENT","ADJUSTMENT","SEC DEPOSIT","DP COMM","WD COMM","ADD COMM","BALANCE"];
    csv += tableHeaders.join(",") + "\r\n";

    // include B/F row if bringForwardBalance exists (shop_dashboard includes a B/F row only if bringForwardBalance truthy)
    if(bringForwardBalance){
      csv += ['B/F Balance',
      formatNumberForCsv(0),
      formatNumberForCsv(0),
      formatNumberForCsv(0),
      formatNumberForCsv(0),
      formatNumberForCsv(0),
      formatNumberForCsv(0),
      formatNumberForCsv(0),
      formatNumberForCsv(securityDeposit),
      formatNumberForCsv(0),
      formatNumberForCsv(0),
      formatNumberForCsv(0),
      formatNumberForCsv(runningBalance)
      ].map(v=>`"${v}"`).join(",") + "\r\n";
    }

    // for each date compute row values (following shop_dashboard.js logic)
    for(const date of sortedDates){
      const depositsForDate = (depositData || []).filter(r => normalizeShop(r.SHOP) === normalizedShop && r.DATE === date);
      const withdrawalsForDate = (withdrawalData || []).filter(r => normalizeShop(r.SHOP) === normalizedShop && r.DATE === date);
      const stlmForDate = (stlmData || []).filter(r => normalizeShop(r.SHOP) === normalizedShop && r.DATE === date);

      const depTotalRow = depositsForDate.reduce((s,r)=> s + parseNum(r.AMOUNT), 0);
      const wdTotalRow = withdrawalsForDate.reduce((s,r)=> s + parseNum(r.AMOUNT), 0);

      const sumMode = (mode) => stlmForDate.filter(r => normalizeString(r.MODE) === mode).reduce((s,r)=> s + parseNum(r.AMOUNT), 0);
      const inAmtRow = sumMode("IN");
      const outAmtRow = sumMode("OUT");
      const settlementRow = sumMode("SETTLEMENT");
      const specialPayRow = sumMode("SPECIAL PAYMENT");
      const adjustmentRow = sumMode("ADJUSTMENT");
      const secDepRow = sumMode("SECURITY DEPOSIT");

      const dpCommRow = depTotalRow * (dpCommRate || 0) / 100;
      const wdCommRow = wdTotalRow * (wdCommRate || 0) / 100;
      const addCommRow = depTotalRow * (addCommRate || 0) / 100;

      runningBalance += depTotalRow - wdTotalRow + inAmtRow - outAmtRow - settlementRow - specialPayRow + adjustmentRow - dpCommRow - wdCommRow - addCommRow;

      totals.depTotal += depTotalRow;
      totals.wdTotal += wdTotalRow;
      totals.inAmt += inAmtRow;
      totals.outAmt += outAmtRow;
      totals.settlement += settlementRow;
      totals.specialPay += specialPayRow;
      totals.adjustment += adjustmentRow;
      totals.secDep += secDepRow;
      totals.dpComm += dpCommRow;
      totals.wdComm += wdCommRow;
      totals.addComm += addCommRow;

      const rowCells = [
        date,
        formatNumberForCsv(depTotalRow),
        formatNumberForCsv(wdTotalRow),
        formatNumberForCsv(inAmtRow),
        formatNumberForCsv(outAmtRow),
        formatNumberForCsv(settlementRow),
        formatNumberForCsv(specialPayRow),
        formatNumberForCsv(adjustmentRow),
        formatNumberForCsv(secDepRow),
        formatNumberForCsv(dpCommRow),
        formatNumberForCsv(wdCommRow),
        formatNumberForCsv(addCommRow),
        formatNumberForCsv(runningBalance)
      ];
      csv += rowCells.map(c => `"${c}"`).join(",") + "\r\n";
    }

    // append totals row
    const totalsCells = [
      "TOTAL",
      formatNumberForCsv(totals.depTotal),
      formatNumberForCsv(totals.wdTotal),
      formatNumberForCsv(totals.inAmt),
      formatNumberForCsv(totals.outAmt),
      formatNumberForCsv(totals.settlement),
      formatNumberForCsv(totals.specialPay),
      formatNumberForCsv(totals.adjustment),
      formatNumberForCsv(totals.secDep),
      formatNumberForCsv(totals.dpComm),
      formatNumberForCsv(totals.wdComm),
      formatNumberForCsv(totals.addComm),
      formatNumberForCsv(runningBalance)
    ];
    csv += totalsCells.map(c => `"${c}"`).join(",") + "\r\n";

    // Add to zip
    const safeName = shopName.replace(/[^\w\s-]/g, "_");
    zip.file(`${safeName}_summary.csv`, csv);

    count++; btn.textContent = `⏳ ${count}/${shops.length}`;
  } // end for shops

  // generate ZIP
  try{
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "shop_summaries.zip");
  } catch(e){
    console.error("ZIP generation error:", e);
    alert("Failed to generate ZIP file.");
  } finally {
    btn.disabled = false; btn.textContent = originalText;
  }

  // helper functions used above (scoped to this script)
  function rTrim(v){ return String(v||"").trim(); }
  function normalizeString(str){ return (str||"").trim().replace(/\s+/g," ").toUpperCase(); }
  function escapeCsv(s){ return String(s||"").replace(/"/g,'""'); }
}

/* ---------- simple helpers ---------- */
function rTrim(v){ return String(v||"").trim(); }
function normalizeString(str){ return (str||"").trim().replace(/\s+/g," ").toUpperCase(); }
function escapeCsv(s){ return String(s||"").replace(/"/g,'""'); }

/* ---------- event listeners & init ---------- */
document.addEventListener("DOMContentLoaded", () => {
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
  document.getElementById("prevPage").addEventListener("click", ()=>{ currentPage--; renderTable(); });
  document.getElementById("nextPage").addEventListener("click", ()=>{ currentPage++; renderTable(); });
  document.getElementById("resetBtn").addEventListener("click", ()=>{
    document.getElementById("leaderFilter").value="ALL";
    document.getElementById("groupFilter").value="ALL";
    document.getElementById("searchInput").value="";
    buildGroupDropdown(rawData,"ALL");
    filteredData = cachedData;
    currentPage = 1;
    renderTable();
  });

  document.getElementById("exportBtn").addEventListener("click", exportCSV);
  document.getElementById("downloadAllShopsBtn").addEventListener("click", downloadAllIndividualSummaries);

  // initial load
  loadDashboard();
});
