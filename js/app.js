/* IT Asset Management - production frontend
   Configure API_URL with the deployed Apps Script /exec URL. */
const API_URL = "https://script.google.com/macros/s/AKfycbxAfFmR---2rPR69-YT97xe6N4U9YCDKu2hD0N95wW96N1Dykx0J4jnTomCRUyX7abI/exec"; // e.g. https://script.google.com/macros/s/XXXX/exec
const state = {token:localStorage.getItem("itam_token")||"", user:null, data:null, page:"dashboard", assetPage:1, repairPage:1, pageSize:15};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
function money(v){
  const n=Number(v||0)||0;
  const fixed=n.toFixed(2);
  const clean=fixed.endsWith(".00")?fixed.slice(0,-3):fixed;
  return Number(clean.replace(/,/g,"")).toLocaleString(undefined,{minimumFractionDigits:clean.includes(".")?2:0,maximumFractionDigits:2});
}).format(Number(v)||0);}
function dateOnly(v){if(!v)return ""; const d=new Date(v); return isNaN(d)?String(v):d.toLocaleDateString();}
function slug(v){return String(v||"").toLowerCase().replace(/\s+/g,"-");}
function showLoading(on){$("#loading").classList.toggle("hidden",!on);}
function toast(msg,error=false){const x=document.createElement("div");x.className="toast"+(error?" error":"");x.textContent=msg;$("#toastRoot").appendChild(x);setTimeout(()=>x.remove(),3200);}
async function api(action,payload={}){
  if(!API_URL) return mockApi(action,payload);
  const r=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action,...payload})});
  const j=await r.json(); if(!j.ok) throw new Error(j.error||"Request failed"); return j;
}
async function call(action,payload={},busy=true){try{if(busy)showLoading(true);return await api(action,payload)}catch(e){toast(e.message||"Something went wrong",true);throw e}finally{if(busy)showLoading(false)}}

async function login(e){if(e)e.preventDefault();const email=$("#loginEmail").value.trim(),password=$("#loginPassword").value;if(!email||!password){toast("Email and password are required.",true);return false}try{const j=await call("login",{email,password});if(!j||!j.token)throw new Error("Login response did not contain a session token.");state.token=j.token;state.user=j.user;localStorage.setItem("itam_token",state.token);await loadData();enterApp()}catch(err){console.error(err);return false}return false;}
function enterApp(){ $("#loginView").classList.add("hidden");$("#appView").classList.remove("hidden");$("#userBadge").innerHTML=`<div style="padding:10px 12px"><strong style="display:block;color:#fff;font-size:11px">${esc(state.user.name)}</strong><span style="font-size:9px">${esc(state.user.role)} · ${esc(state.user.email)}</span></div>`; $$(".admin-only").forEach(x=>x.classList.toggle("hidden",state.user.role!=="Admin")); navigate("dashboard");}
async function loadData(){const j=await call("bootstrap",{token:state.token});state.data=j.data;state.user=j.user;}
function navigate(page){state.page=page;$$(".page").forEach(x=>x.classList.add("hidden"));$(`#page-${page}`).classList.remove("hidden");$$(".nav-item[data-page]").forEach(x=>x.classList.toggle("active",x.dataset.page===page));$("#pageTitle").textContent=page[0].toUpperCase()+page.slice(1);renderPage(page);}
function renderPage(page){if(!state.data)return; if(page==="dashboard")renderDashboard(); renderRepairTypeChartsV6(); if(page==="assets")renderAssets(); if(page==="repairs")renderRepairs(); if(page==="warranty")renderWarranty(); if(page==="reports"){} if(page==="settings")renderSettings(); if(page==="audit")renderAudit();}
function assetType(a){return String(a.assetType||a.type||"").trim()} function assetDept(a){return String(a.department||"").trim()}
function norm(v){return String(v??"").trim().toLowerCase()}
function repairAssetType(r){
  const assets=assetList_();
  const rid=String(r.assetId||r["Asset ID"]||r.id||"").trim();
  const a=assets.find(function(x){
    return String(x.assetId||x["Asset ID"]||x.id||"").trim()===rid;
  });
  return String(
    r.assetType || r["Asset Type"] || r.type ||
    (a && (a.assetType || a["Asset Type"] || a.type)) ||
    "Unassigned"
  ).trim() || "Unassigned";
}

document.addEventListener("DOMContentLoaded",()=>{
  $("#loginForm").addEventListener("submit",login);$("#logoutBtn").onclick=()=>{localStorage.removeItem("itam_token");location.reload()};
  $("#refreshBtn").onclick=async()=>{await loadData();renderPage(state.page);toast("Refreshed")};$("#mobileNav").onclick=()=>$(".sidebar").classList.toggle("open");
  $("#nav").onclick=e=>{const b=e.target.closest("[data-page]");if(b){navigate(b.dataset.page);$(".sidebar").classList.remove("open")}};
  document.body.addEventListener("click",e=>{const p=e.target.closest("[data-page]");if(p&&!e.target.closest("#nav"))navigate(p.dataset.page);const m=e.target.closest("[data-master]");if(m)masterAdd(m.dataset.master)});
  $("#addAssetBtn").onclick=addAsset;$("#addRepairBtn").onclick=addRepair;$("#addUserBtn").onclick=addUser;$("#importBtn").onclick=importFile;$("#fileInput").onchange=e=>e.target.files[0]&&handleImport(e.target.files[0]);
  ["assetSearch","assetTypeFilter","deptFilter","statusFilter"].forEach(id=>$("#"+id).addEventListener("input",()=>{state.assetPage=1;renderAssets()}));
  ["repairSearch","repairStatusFilter"].forEach(id=>$("#"+id).addEventListener("input",()=>{state.repairPage=1;renderRepairs()}));
  $("#exportAssets").onclick=()=>exportXlsx(state.data.assets,"ITAM_Assets");$("#exportRepairs").onclick=()=>exportXlsx(state.data.repairs,"ITAM_Repairs");$("#backupBtn").onclick=backup;
  $("#restoreBtn").onclick=()=>$("#fileInput").click();$("#printAssets").onclick=()=>printRows("IT Asset Inventory",state.data.assets);$("#printRepairs").onclick=()=>printRows("Repair Records",state.data.repairs);$("#printDashboard").onclick=()=>window.print();$("#dashboardExport").onclick=()=>exportXlsx(state.data.assets.map(a=>({...a})),"ITAM_Dashboard_Data");
  clock();
  if(state.token){loadData().then(enterApp).catch((err)=>{console.error(err);localStorage.removeItem("itam_token");state.token="";toast("Session expired. Please sign in again.",true)})}
});

function renderRepairTypeChartsV6(){
  const cr=completedRepairs();
  const count={};
  const cost={};
  cr.forEach(function(r){
    const t=repairAssetType(r);
    count[t]=(count[t]||0)+1;
    cost[t]=(cost[t]||0)+Number(r.repairCost||r["Repair Cost"]||r.cost||0)||0;
  });
  renderBars("#repairCountChart",Object.entries(count));
  renderBars("#repairCostChart",Object.entries(cost).sort(function(a,b){return b[1]-a[1]}),money);
  renderBars("#deptChart",counts("department",assetList_()));
  renderBars("#typeChart",counts("assetType",assetList_()));
}
