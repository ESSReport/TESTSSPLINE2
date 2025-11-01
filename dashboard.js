// Dashboard with Download Individual Summaries (ZIP of CSVs)

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

async function fetchShopsBalance(){
  const res = await fetch(OPENSHEET.SHOPS_BALANCE);
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.map(normalize);
}

async function loadDashboard(){
  try{
    rawData = await fetchShopsBalance();
  } catch(e){
    console.error("Error fetching shops balance:", e);
    alert("Failed to load shop balance. Check network and sheet name.");
    return;
  }

  buildTeamLeaderDropdown(rawData);
  buildGroupDropdown(rawData, "ALL");
  buildSummary(rawData);

  /* ✅ Automatically filter if ?teamLeader= is in the URL */
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
      (summary[shop]["TOTAL DEPOSIT"]||0) -
      (summary[shop]["TOTAL WITHDRAWAL"]||0) +
      (summary[shop]["INTERNAL TRANSFER IN"]||0) -
      (summary[shop]["INTERNAL TRANSAFER OUT"]||0) -
      (summary[shop]["SETTLEMENT"]||0) -
      (summary[shop]["SPECIAL PAYMENT"]||0) +
      (summary[shop]["ADJUSTMENT"]||0) -
      (summary[shop]["DP COMM"]||0) -
      (summary[shop]["WD COMM"]||0) -
      (summary[shop]["ADD COMM"]||0);
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
    document.getElementById("leaderFilter").disabled = false;
    document.getElementById("leaderFilter").value="ALL";
    document.getElementById("groupFilter").value="ALL";
    document.getElementById("searchInput").value="";
    buildGroupDropdown(rawData,"ALL");
    filteredData = cachedData;
    currentPage = 1;
    renderTable();
  });

  document.getElementById("exportBtn").addEventListener("click", ()=>console.log("Export CSV clicked"));
  document.getElementById("downloadAllShopsBtn").addEventListener("click", ()=>console.log("Download summaries clicked"));

  loadDashboard();
});
