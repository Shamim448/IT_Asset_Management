/* IT Asset Management - production frontend
   Configure API_URL with the deployed Apps Script /exec URL. */
const API_URL = "https://script.google.com/macros/s/AKfycbwxJjp9DgWfILBWIIIOVJlKal2OcOMYEv3MAHxUc-o8_T4iDO-OdTGMJaJ6ML6eX3o/exec"; // e.g. https://script.google.com/macros/s/XXXX/exec
const state = {token:localStorage.getItem("itam_token")||"", user:null, data:null, page:"dashboard", assetPage:1, repairPage:1, pageSize:15};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
function money(v){
  const n=Number(v)||0;
  return new Intl.NumberFormat(undefined,{minimumFractionDigits:n%1===0?0:2,maximumFractionDigits:2}).format(n);
}
function dateOnly(v){if(!v)return ""; const d=new Date(v); return isNaN(d)?String(v):d.toLocaleDateString();}
function slug(v){return String(v||"").toLowerCase().replace(/\s+/g,"-");}
function showLoading(on){$("#loading").classList.toggle("hidden",!on);}
function toast(msg,error=false){const x=document.createElement("div");x.className="toast"+(error?" error":"");x.textContent=msg;$("#toastRoot").appendChild(x);setTimeout(()=>x.remove(),3200);}
async function api(action,payload={}){
  if(!API_URL) return mockApi(action,payload);
  const r=await fetch(API_URL,{
    method:"POST",
    headers:{"Content-Type":"text/plain;charset=utf-8"},
    body:JSON.stringify({action,...payload}),
    redirect:"follow"
  });
  const text=await r.text();
  let j;
  try{j=JSON.parse(text)}catch(e){
    throw new Error("Apps Script returned a non-JSON response (HTTP "+r.status+"). Check Web App deployment/access settings.");
  }
  if(!r.ok) throw new Error(j.error||("HTTP "+r.status));
  if(!j.ok) throw new Error(j.error||"Request failed");
  return j;
}
async function call(action,payload={},busy=true){try{if(busy)showLoading(true);return await api(action,payload)}catch(e){toast(e.message||"Something went wrong",true);throw e}finally{if(busy)showLoading(false)}}

async function login(e){if(e)e.preventDefault();const email=$("#loginEmail").value.trim(),password=$("#loginPassword").value;if(!email||!password){toast("Email and password are required.",true);return false}try{const j=await call("login",{email,password});if(!j||!j.token)throw new Error("Login response did not contain a session token.");state.token=j.token;state.user=j.user;localStorage.setItem("itam_token",state.token);await loadData();enterApp()}catch(err){console.error(err);return false}return false;}
function enterApp(){ $("#loginView").classList.add("hidden");$("#appView").classList.remove("hidden");$("#userBadge").innerHTML=`<div style="padding:10px 12px"><strong style="display:block;color:#fff;font-size:11px">${esc(state.user.name)}</strong><span style="font-size:9px">${esc(state.user.role)} · ${esc(state.user.email)}</span></div>`; $$(".admin-only").forEach(x=>x.classList.toggle("hidden",state.user.role!=="Admin")); navigate("dashboard");}
async function loadData(){const j=await call("bootstrap",{token:state.token});state.data=j.data;state.user=j.user;}
function navigate(page){state.page=page;$$(".page").forEach(x=>x.classList.add("hidden"));$(`#page-${page}`).classList.remove("hidden");$$(".nav-item[data-page]").forEach(x=>x.classList.toggle("active",x.dataset.page===page));$("#pageTitle").textContent=page[0].toUpperCase()+page.slice(1);renderPage(page);}
function renderPage(page){if(!state.data)return; if(page==="dashboard")renderDashboard(); if(page==="assets")renderAssets(); if(page==="repairs")renderRepairs(); if(page==="warranty")renderWarranty(); if(page==="reports"){} if(page==="settings")renderSettings(); if(page==="audit")renderAudit();}
function assetType(a){return String(a.assetType||a.type||"").trim()} function assetDept(a){return String(a.department||"").trim()}
function norm(v){return String(v??"").trim().toLowerCase()}
function repairAssetType(r){
  const rid=String(r.assetId||r["Asset ID"]||r.id||"").trim();
  const a=state.data.assets.find(x=>String(x.assetId||x["Asset ID"]||x.id||"").trim()===rid);
  return String((a&&(a.assetType||a["Asset Type"]||a.type))||r.assetType||r["Asset Type"]||r.type||"Unassigned").trim()||"Unassigned";
}

function completedRepairs(){
  return state.data.repairs.filter(r=>String(r.repairStatus||r.status||r["Repair Status"]||"").trim().toLowerCase()==="completed");
}
function counts(field,arr){
  const m={};
  arr.forEach(x=>{
    const k=(field==="assetType" && x.assetId)
      ? repairAssetType(x)
      : String(x[field]||"Unassigned").trim();
    const key=k||"Unassigned";
    m[key]=(m[key]||0)+1;
  });
  return Object.entries(m).sort((a,b)=>b[1]-a[1]);
}
function renderBars(el,rows,format=v=>v){
  const node=$(el);
  if(!node)return;
  if(!rows.length){node.innerHTML='<div class="empty">No data</div>';return;}
  const max=Math.max(1,...rows.map(x=>Number(x[1])||0));
  node.innerHTML=rows.map(([k,v])=>{
    const width=Math.round((Number(v)||0)/max*100);
    return `<div class="bar-row"><span>${esc(k)}</span><div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div><strong>${esc(format(v))}</strong></div>`;
  }).join("");
}
function warrantyDateValue(a){
  return a.warrantyExpiry||a["Warranty Expiry"]||a.warrantyDate||a["Warranty Date"]||"";
}
function warrantyLists(){
  const now=new Date(); now.setHours(0,0,0,0);
  const soon=new Date(now); soon.setDate(soon.getDate()+60);
  const expired=state.data.assets.filter(a=>{
    const d=new Date(warrantyDateValue(a)); return !isNaN(d.getTime())&&d<now;
  }).sort((a,b)=>new Date(warrantyDateValue(b))-new Date(warrantyDateValue(a)));
  const expiring=state.data.assets.filter(a=>{
    const d=new Date(warrantyDateValue(a)); return !isNaN(d.getTime())&&d>=now&&d<=soon;
  }).sort((a,b)=>new Date(warrantyDateValue(a))-new Date(warrantyDateValue(b)));
  return {expired,expiring};
}
function dashboardStats(){const assets=state.data.assets,reps=state.data.repairs,comp=completedRepairs(),now=new Date();const mc=comp.filter(r=>{const d=new Date(r.repairDate);return !isNaN(d)&&d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()});const yc=comp.filter(r=>{const d=new Date(r.repairDate);return !isNaN(d)&&d.getFullYear()===now.getFullYear()});const cost=comp.reduce((s,r)=>s+Number(r.repairCost||0),0);return{assets:assets.length,reps:reps.length,cost,month:mc.length,year:yc.length,monthCost:mc.reduce((s,r)=>s+Number(r.repairCost||0),0),yearCost:yc.reduce((s,r)=>s+Number(r.repairCost||0),0)}}
function renderDashboard(){
  const s=dashboardStats();
  $("#kpis").innerHTML=[
    ["Total Assets",s.assets,"Inventory"],
    ["Total Repair Records",s.reps,"All statuses"],
    ["Completed Repair Cost",money(s.cost),"Completed only"],
    ["This Month Repair Cost",money(s.monthCost),"Completed only"],
    ["This Year Repair Cost",money(s.yearCost),"Completed only"],
    ["Repairs This Month",s.month,"Completed"],
    ["Repairs This Year",s.year,"Completed"]
  ].map(x=>`<div class="kpi"><div class="label">${x[0]}</div><div class="value">${esc(x[1])}</div><div class="hint">${x[2]}</div></div>`).join("");

  renderBars("#deptChart",counts("department",state.data.assets));
  renderBars("#typeChart",counts("assetType",state.data.assets));

  const w=warrantyLists();
  $("#expiredTop").innerHTML=miniAssets(w.expired.slice(0,10),a=>dateOnly(a.warrantyExpiry),"expired");
  $("#staleRepairs").innerHTML=miniAssets(staleAssets().slice(0,10),a=>dateOnly(a.lastRepair),"last completed");

  const cr=completedRepairs();
  const repairCounts={}, repairCosts={};
  cr.forEach(r=>{
    const type=repairAssetType(r);
    repairCounts[type]=(repairCounts[type]||0)+1;
    repairCosts[type]=(repairCosts[type]||0)+Number(r.repairCost||r["Repair Cost"]||r.cost||0);
  });
  renderBars("#repairCountChart",Object.entries(repairCounts).sort((a,b)=>b[1]-a[1]));
  renderBars("#repairCostChart",Object.entries(repairCosts).sort((a,b)=>b[1]-a[1]),money);

  const cm={};
  state.data.repairs.forEach(r=>{if(r.assetId)cm[r.assetId]=(cm[r.assetId]||0)+1});
  const top=Object.entries(cm).sort((a,b)=>b[1]-a[1]).slice(0,10);
  $("#topAssets").innerHTML=top.length
    ? `<div class="table-wrap"><table><thead><tr><th>Asset ID</th><th>Asset</th><th>Repair Count</th></tr></thead><tbody>${top.map(([id,n])=>{const a=state.data.assets.find(x=>x.assetId===id)||{};return `<tr><td>${esc(id)}</td><td>${esc(a.brand||"")} ${esc(a.model||"")}</td><td><strong>${n}</strong></td></tr>`}).join("")}</tbody></table></div>`
    : `<div class="empty">No repair history</div>`;
}
function miniAssets(arr,right,label){return arr.length?`<div class="mini-list">${arr.map(a=>`<div class="mini-item"><span><strong>${esc(a.assetId)}</strong><br>${esc(assetType(a))} · ${esc(a.brand||"")} ${esc(a.model||"")}</span><span>${esc(right(a))}<br><small>${label}</small></span></div>`).join("")}</div>`:`<div class="empty">No records</div>`;}
function populateFilters(){const mt=(state.data.assetTypes||[]).map(x=>x.name||x).filter(Boolean),at=state.data.assets.map(assetType).filter(Boolean),md=(state.data.departments||[]).map(x=>x.name||x).filter(Boolean),ad=state.data.assets.map(assetDept).filter(Boolean);const ts=[...new Map([...mt,...at].map(x=>[norm(x),x])).values()].sort();const ds=[...new Map([...md,...ad].map(x=>[norm(x),x])).values()].sort();const oldT=$("#assetTypeFilter").value,oldD=$("#deptFilter").value;$("#assetTypeFilter").innerHTML='<option value="">All types</option>'+ts.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");$("#deptFilter").innerHTML='<option value="">All departments</option>'+ds.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");if(ts.some(x=>norm(x)===norm(oldT)))$("#assetTypeFilter").value=oldT;if(ds.some(x=>norm(x)===norm(oldD)))$("#deptFilter").value=oldD}
function renderAssets(){populateFilters();let arr=[...state.data.assets];const q=$("#assetSearch").value.toLowerCase(),tf=$("#assetTypeFilter").value,df=$("#deptFilter").value,sf=$("#statusFilter").value;arr=arr.filter(a=>!q||JSON.stringify(a).toLowerCase().includes(q)).filter(a=>!tf||norm(assetType(a))===norm(tf)).filter(a=>!df||norm(assetDept(a))===norm(df)).filter(a=>!sf||a.status===sf);const total=arr.length,pages=Math.max(1,Math.ceil(total/state.pageSize));state.assetPage=Math.min(state.assetPage,pages);const rows=arr.slice((state.assetPage-1)*state.pageSize,state.assetPage*state.pageSize);$("#assetsTable").innerHTML=tableAssets(rows,total);pager("#assetsPager",state.assetPage,pages,p=>{state.assetPage=p;renderAssets()})}
function tableAssets(rows,total){if(!rows.length)return `<div class="asset-total">Total Assets: <strong>0</strong></div><div class="empty">No assets found</div>`;return `<div class="asset-total">Total Assets: <strong>${total}</strong></div><div class="table-wrap"><table><thead><tr><th>Asset ID</th><th>Type</th><th>Project Name</th><th>Device Name</th><th>Brand / Model</th><th>Serial No.</th><th>Bill No</th><th>Supplier Name</th><th>Purchase Date</th><th>Purchase Amount</th><th>Last Repair Date</th><th>User</th><th>Department</th><th>Status</th><th>Warranty</th><th>Actions</th></tr></thead><tbody>${rows.map(a=>`<tr><td><strong>${esc(a.assetId)}</strong></td><td>${esc(assetType(a))}</td><td>${esc(a.projectName||"")}</td><td>${esc(a.deviceName||"")}</td><td>${esc(a.brand||"")} ${esc(a.model||"")}</td><td>${esc(a.serialNumber||a.serialNo||"")}</td><td>${esc(a.billNo||"")}</td><td>${esc(a.supplierName||"")}</td><td>${dateOnly(a.purchaseDate)}</td><td>${money(a.purchaseAmount)}</td><td>${dateOnly(a.lastRepairDate)}</td><td>${esc(a.user||"")}</td><td>${esc(assetDept(a))}</td><td><span class="tag ${slug(a.status)}">${esc(a.status)}</span></td><td>${dateOnly(a.warrantyExpiry)}</td><td><div class="row-actions"><button onclick="assetDetails('${esc(a.assetId)}')">View</button><button onclick="repairHistory('${esc(a.assetId)}')">Repairs</button><button onclick="changeStatus('${esc(a.assetId)}')">Status</button>${state.user.role==="Admin"?`<button onclick="editAsset('${esc(a.assetId)}')">Edit</button><button onclick="deleteAsset('${esc(a.assetId)}')">Delete</button>`:""}</div></td></tr>`).join("")}</tbody></table></div>`}
function renderRepairs(){let arr=[...state.data.repairs],q=$("#repairSearch").value.toLowerCase(),sf=$("#repairStatusFilter").value;arr=arr.filter(r=>!q||JSON.stringify(r).toLowerCase().includes(q)).filter(r=>!sf||r.repairStatus===sf);const pages=Math.max(1,Math.ceil(arr.length/state.pageSize));state.repairPage=Math.min(state.repairPage,pages);const rows=arr.slice((state.repairPage-1)*state.pageSize,state.repairPage*state.pageSize);$("#repairsTable").innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Asset</th><th>Problem</th><th>Vendor / Technician</th><th>Cost</th><th>Status</th><th>Return Date</th><th>Actions</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${dateOnly(r.repairDate)}</td><td><strong>${esc(r.assetId)}</strong></td><td>${esc(r.problem||"")}</td><td>${esc(r.vendor||"")}</td><td>${money(r.repairCost)}</td><td><span class="tag ${slug(r.repairStatus)}">${esc(r.repairStatus)}</span></td><td>${dateOnly(r.returnDate)}</td><td><div class="row-actions">${state.user.role==="Admin"?`<button onclick="editRepair('${esc(r.repairId)}')">Edit</button><button onclick="deleteRepair('${esc(r.repairId)}')">Delete</button>`:""}<button onclick="assetDetails('${esc(r.assetId)}')">Asset</button></div></td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No repair records</div>`;pager("#repairsPager",state.repairPage,pages,p=>{state.repairPage=p;renderRepairs()});}
function warrantyTable(rows,emptyText){
  if(!rows.length)return `<div class="empty">${esc(emptyText)}</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Asset ID</th><th>Asset Type</th><th>Brand / Model</th><th>User</th><th>Department</th><th>Warranty Expiry</th></tr></thead><tbody>`+
  rows.map(a=>`<tr><td><strong>${esc(a.assetId||"")}</strong></td><td>${esc(assetType(a)||"")}</td><td>${esc([a.brand||"",a.model||""].filter(Boolean).join(" / "))}</td><td>${esc(a.user||"")}</td><td>${esc(assetDept(a)||"")}</td><td>${esc(dateOnly(warrantyDateValue(a)))}</td></tr>`).join("")+
  `</tbody></table></div>`;
}
function renderWarranty(){
  const w=warrantyLists();
  const e=document.querySelector("#expiredAll"), x=document.querySelector("#expiringSoon");
  if(e)e.innerHTML=warrantyTable(w.expired.slice(0,10),"No expired warranty records");
  if(x)x.innerHTML=warrantyTable(w.expiring,"No warranty expiring within 60 days");
}

function renderSettings(){["Departments","AssetTypes","Brands"].forEach(n=>{const key=n[0].toLowerCase()+n.slice(1);const arr=state.data[key]||[];$("#master"+n).innerHTML=arr.length?arr.map(x=>`<div class="mini-item"><span>${esc(x.name||x)}</span><button class="row-actions" onclick="deleteMaster('${n}','${esc(x.id||x.name||x)}')">Delete</button></div>`).join(""):`<div class="empty">No records</div>`});$("#usersTable").innerHTML=`<div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>${state.data.users.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td>${esc(u.status)}</td><td><div class="row-actions"><button onclick="editUser('${esc(u.email)}')">Edit</button>${u.email!==state.user.email?`<button onclick="deleteUser('${esc(u.email)}')">Delete</button>`:""}</div></td></tr>`).join("")}</tbody></table></div>`;}
function renderAudit(){$("#auditTable").innerHTML=state.data.audit.length?`<div class="table-wrap"><table><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody>${state.data.audit.slice().reverse().map(a=>`<tr><td>${esc(a.timestamp)}</td><td>${esc(a.email)}</td><td>${esc(a.action)}</td><td>${esc(a.target)}</td><td>${esc(a.details)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No audit records</div>`;}

function modal(title,body,foot=""){const root=$("#modalRoot");root.innerHTML=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h3>${title}</h3><button class="close" onclick="closeModal()">×</button></div><div class="modal-body">${body}</div>${foot?`<div class="modal-foot">${foot}</div>`:""}</div></div>`;}
function closeModal(){$("#modalRoot").innerHTML="";}
function assetForm(a={}){const options=(arr,val)=>arr.map(x=>{const n=x.name||x;return `<option ${n===val?"selected":""}>${esc(n)}</option>`}).join("");return `<form id="assetForm"><div class="form-grid"><label>Asset Type<select name="assetType" required><option value="">Select</option>${options(state.data.assetTypes,a.assetType)}</select></label><label>Department<select name="department"><option value="">Select</option>${options(state.data.departments,a.department)}</select></label><label>Brand<select name="brand"><option value="">Select</option>${options(state.data.brands,a.brand)}</select></label><label>Model<input name="model" value="${esc(a.model)}"></label><label>Device Name<input name="deviceName" value="${esc(a.deviceName)}"></label><label>Project Name<input name="projectName" value="${esc(a.projectName)}"></label><label>Serial Number<input name="serialNumber" value="${esc(a.serialNumber||a.serialNo)}"></label><label>Bill No<input name="billNo" value="${esc(a.billNo)}"></label><label>Supplier Name<input name="supplierName" value="${esc(a.supplierName)}"></label><label>User<input name="user" value="${esc(a.user)}"></label><label>Purchase Date<input type="date" name="purchaseDate" value="${esc((a.purchaseDate||"").slice(0,10))}"></label><label>Purchase Amount<input type="number" min="0" step="0.01" name="purchaseAmount" value="${esc(a.purchaseAmount??"")}" placeholder="0.00"></label><label>Warranty Expiry<input type="date" name="warrantyExpiry" value="${esc((a.warrantyExpiry||"").slice(0,10))}"></label><label>Status<select name="status"><option ${a.status==="Active"||!a.status?"selected":""}>Active</option><option ${a.status==="Under Repair"?"selected":""}>Under Repair</option><option ${a.status==="Retired"?"selected":""}>Retired</option><option ${a.status==="Lost"?"selected":""}>Lost</option><option ${a.status==="Damaged"?"selected":""}>Damaged</option></select></label><label class="full-col">Location<input name="location" value="${esc(a.location)}"></label><label class="full-col">Remarks<textarea name="remarks" rows="3">${esc(a.remarks)}</textarea></label></div></form>`}
function addAsset(){modal("Add Asset",assetForm({}),`<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveAssetForm()">Save Asset</button>`)}
function editAsset(id){const a=state.data.assets.find(x=>x.assetId===id);modal("Edit Asset",assetForm(a),`<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveAssetForm('${esc(id)}')">Save Changes</button>`)}
async function saveAssetForm(id){const f=$("#assetForm"),o=Object.fromEntries(new FormData(f).entries());if(id)o.assetId=id;try{await call("saveAsset",{token:state.token,asset:o});closeModal();await loadData();renderPage(state.page);toast("Asset saved")}catch{}}
async function deleteAsset(id){if(!confirm(`Delete ${id}? The Asset ID will never be reused.`))return;try{await call("deleteAsset",{token:state.token,assetId:id});await loadData();renderAssets();toast("Asset deleted")}catch{}}
function assetDetails(id){const a=state.data.assets.find(x=>x.assetId===id),rs=state.data.repairs.filter(r=>r.assetId===id).sort((x,y)=>new Date(y.repairDate)-new Date(x.repairDate)),cost=rs.filter(r=>r.repairStatus==="Completed").reduce((s,r)=>s+Number(r.repairCost||0),0);modal(`Asset ${esc(id)}`,`<div class="details-grid">${Object.entries(a).filter(([k])=>!["id"].includes(k)).map(([k,v])=>`<div class="detail"><small>${esc(k)}</small><strong>${esc(k.toLowerCase().includes("date")||k==="warrantyExpiry"?dateOnly(v):v)}</strong></div>`).join("")}</div><div class="panel" style="margin-top:16px"><div class="panel-head"><h4>Repair History</h4><strong>Total Completed Cost: ${money(cost)}</strong></div>${rs.length?`<div class="mini-list">${rs.map(r=>`<div class="mini-item"><span><strong>${dateOnly(r.repairDate)} · ${esc(r.problem||"")}</strong><br>${esc(r.repairDetails||"")}</span><span>${money(r.repairCost)}<br><span class="tag ${slug(r.repairStatus)}">${esc(r.repairStatus)}</span></span></div>`).join("")}</div>`:`<div class="empty">No repair history</div>`}</div>`)}
function repairHistory(id){assetDetails(id)}
function repairForm(r={}){const opts=state.data.assets.map(a=>`<option value="${esc(a.assetId)}" ${a.assetId===r.assetId?"selected":""}>${esc(a.assetId)} — ${esc(assetType(a))} ${esc(a.brand||"")} ${esc(a.model||"")}</option>`).join("");return `<form id="repairForm"><div class="form-grid"><label>Asset<select name="assetId" required>${opts}</select></label><label>Repair Date<input type="date" name="repairDate" value="${esc((r.repairDate||new Date().toISOString()).slice(0,10))}"></label><label>Problem / Complaint<input name="problem" value="${esc(r.problem)}" required></label><label>Vendor / Technician<input name="vendor" value="${esc(r.vendor)}"></label><label>Repair Cost<input type="number" step="0.01" name="repairCost" value="${esc(r.repairCost||0)}"></label><label>Parts Replaced<input name="partsReplaced" value="${esc(r.partsReplaced)}"></label><label>Repair Status<select name="repairStatus"><option>Pending</option><option>In Progress</option><option>Completed</option><option>Returned</option></select></label><label>Return Date<input type="date" name="returnDate" value="${esc((r.returnDate||"").slice(0,10))}"></label><label class="full-col">Repair Details<textarea name="repairDetails" rows="3">${esc(r.repairDetails)}</textarea></label><label class="full-col">Remarks<textarea name="remarks" rows="3">${esc(r.remarks)}</textarea></label></div></form>`}
function addRepair(){modal("Add Repair",repairForm({repairStatus:"In Progress"}),`<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveRepairForm()">Save Repair</button>`);$("#repairForm select[name=repairStatus]").value="In Progress";}
function editRepair(id){const r=state.data.repairs.find(x=>x.repairId===id);modal("Edit Repair",repairForm(r),`<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveRepairForm('${esc(id)}')">Save Changes</button>`);$("#repairForm select[name=repairStatus]").value=r.repairStatus;}
async function saveRepairForm(id){const o=Object.fromEntries(new FormData($("#repairForm")).entries());if(id)o.repairId=id;if(o.repairStatus==="Completed"&&!o.returnDate){toast("Return Date is required for a Completed repair",true);return}try{await call("saveRepair",{token:state.token,repair:o});closeModal();await loadData();renderPage(state.page);toast("Repair saved")}catch{}}
async function deleteRepair(id){if(!confirm("Delete this repair record?"))return;try{await call("deleteRepair",{token:state.token,repairId:id});await loadData();renderRepairs();toast("Repair deleted")}catch{}}
async function changeStatus(id){const a=state.data.assets.find(x=>x.assetId===id);modal("Change Asset Status",`<form id="statusForm"><label>Status<select name="status"><option>Active</option><option>Under Repair</option><option>Retired</option><option>Lost</option><option>Damaged</option></select></label></form>`, `<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveStatus('${esc(id)}')">Update Status</button>`);$("#statusForm select").value=a.status;}
async function saveStatus(id){const status=$("#statusForm select").value;try{await call("setStatus",{token:state.token,assetId:id,status});closeModal();await loadData();renderPage("assets");toast("Status updated")}catch{}}
function masterAdd(type){modal(`Add ${type.slice(0,-1)}`,`<form id="masterForm"><label>Name<input name="name" required></label></form>`,`<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveMaster('${type}')">Save</button>`)}
async function saveMaster(type){const name=new FormData($("#masterForm")).get("name");try{await call("saveMaster",{token:state.token,type,name});closeModal();await loadData();renderSettings();toast("Saved")}catch{}}
async function deleteMaster(type,id){if(!confirm("Delete this master record?"))return;try{await call("deleteMaster",{token:state.token,type,id});await loadData();renderSettings();toast("Deleted")}catch{}}
function userForm(u={}){return `<form id="userForm"><div class="form-grid"><label>Name<input name="name" value="${esc(u.name)}" required></label><label>Email<input type="email" name="email" value="${esc(u.email)}" required></label><label>Role<select name="role"><option ${u.role==="Admin"?"selected":""}>Admin</option><option ${u.role==="Normal User"?"selected":""}>Normal User</option></select></label><label>Status<select name="status"><option>Active</option><option>Inactive</option></select></label><label class="full-col">Password ${u.email?"(leave blank to keep current)":""}<input type="password" name="password" ${u.email?"":"required"}></label></div></form>`}
function addUser(){modal("Add User",userForm({role:"Normal User",status:"Active"}),`<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveUserForm()">Save User</button>`)}
function editUser(email){const u=state.data.users.find(x=>x.email===email);modal("Edit User",userForm(u),`<button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveUserForm('${esc(email)}')">Save Changes</button>`)}
async function saveUserForm(oldEmail){const o=Object.fromEntries(new FormData($("#userForm")).entries());if(oldEmail)o.oldEmail=oldEmail;try{await call("saveUser",{token:state.token,user:o});closeModal();await loadData();renderSettings();toast("User saved")}catch{}}
async function deleteUser(email){if(!confirm(`Delete ${email}?`))return;try{await call("deleteUser",{token:state.token,email});await loadData();renderSettings();toast("User deleted")}catch{}}
async function backup(){const j=await call("backup",{token:state.token});download("itam-backup-"+new Date().toISOString().slice(0,10)+".json",JSON.stringify(j.backup,null,2),"application/json");toast("Backup downloaded")}
function download(name,data,type){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;a.click();URL.revokeObjectURL(a.href);}
function exportXlsx(rows,name){if(!window.XLSX){toast("Excel library could not load. Check internet connection.",true);return}const ws=XLSX.utils.json_to_sheet(rows);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Data");XLSX.writeFile(wb,name+".xlsx");}
function printRows(title,rows){const w=window.open("","_blank");w.document.write(`<html><head><title>${title}</title><style>body{font-family:Arial;padding:20px}h1{font-size:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px;font-size:10px;text-align:left}</style></head><body><h1>${title}</h1><table><thead><tr>${Object.keys(rows[0]||{}).map(k=>`<th>${esc(k)}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${Object.values(r).map(v=>`<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table><script>window.print()</script></body></html>`);w.document.close();}
function importFile(){ $("#fileInput").click(); }
async function handleImport(file){if(file.name.toLowerCase().endsWith(".json")){const backup=JSON.parse(await file.text());if(state.user.role!=="Admin"){toast("Only Admin can restore",true);return}if(!confirm("Restore this backup? This will replace current Assets and Repairs."))return;await call("restore",{token:state.token,backup});await loadData();renderPage("dashboard");toast("Backup restored");return}const data=await file.arrayBuffer();const wb=XLSX.read(data,{type:"array"}),ws=wb.Sheets[wb.SheetNames[0]],rows=XLSX.utils.sheet_to_json(ws,{defval:""});const j=await call("importAssets",{token:state.token,rows});await loadData();renderAssets();toast(`Import complete. Added ${j.added}; skipped ${j.skipped}.`);if(j.skippedIds?.length)alert("Skipped duplicate/registered Asset IDs:\\n"+j.skippedIds.join("\\n"));}
function clock(){const d=new Date();$("#clock").textContent=d.toLocaleString();}setInterval(clock,1000);

async function mockApi(action,payload){ // Offline demo mode only; data persists in localStorage.
  let db=JSON.parse(localStorage.getItem("itam_mock")||"null")||{assets:[],repairs:[],users:[{name:"Administrator",email:"admin@example.com",role:"Admin",status:"Active",password:"admin123"}],departments:[{id:"1",name:"IT"}],assetTypes:[{id:"1",name:"Laptop"},{id:"2",name:"Desktop"}],brands:[{id:"1",name:"Dell"},{id:"2",name:"HP"}],audit:[],ids:[]};
  const save=()=>localStorage.setItem("itam_mock",JSON.stringify(db));
  if(action==="login"){const u=db.users.find(x=>x.email.toLowerCase()===payload.email.toLowerCase()&&x.password===payload.password&&x.status==="Active");if(!u)throw new Error("Invalid credentials");return {ok:true,token:"mock-"+u.email,user:u};}
  if(action==="bootstrap"){const u=db.users.find(x=>x.email===payload.token.replace("mock-",""));if(!u)throw new Error("Session expired");return {ok:true,user:u,data:{assets:db.assets,repairs:db.repairs,users:db.users.map(({password,...x})=>x),departments:db.departments,assetTypes:db.assetTypes,brands:db.brands,audit:db.audit}};}
  if(action==="saveAsset"){if(payload.asset.assetId){const i=db.assets.findIndex(x=>x.assetId===payload.asset.assetId);if(i>=0)db.assets[i]={...db.assets[i],...payload.asset};}else{let n=db.assets.length+1;let id;do{id="IT-"+String(n++).padStart(4,"0")}while(db.assets.some(x=>x.assetId===id)||db.ids.includes(id));db.ids.push(id);db.assets.push({...payload.asset,assetId:id});}save();return {ok:true};}
  if(action==="deleteAsset"){db.ids.push(payload.assetId);db.assets=db.assets.filter(x=>x.assetId!==payload.assetId);save();return {ok:true};}
  if(action==="setStatus"){const a=db.assets.find(x=>x.assetId===payload.assetId);if(a)a.status=payload.status;save();return {ok:true};}
  if(action==="saveRepair"){const r=payload.repair;if(r.repairStatus==="Completed"&&!r.returnDate)throw new Error("Return Date required");if(!r.repairId){r.repairId="REP-"+Date.now();r.repairDate=r.repairDate||new Date().toISOString().slice(0,10)}const i=db.repairs.findIndex(x=>x.repairId===r.repairId);if(i>=0)db.repairs[i]=r;else db.repairs.push(r);const a=db.assets.find(x=>x.assetId===r.assetId);if(a)a.status=(r.repairStatus==="Completed"||r.repairStatus==="Returned")?"Active":(r.repairStatus==="In Progress"||r.repairStatus==="Pending"?"Under Repair":a.status);save();return {ok:true};}
  if(action==="deleteRepair"){db.repairs=db.repairs.filter(x=>x.repairId!==payload.repairId);save();return {ok:true};}
  if(action==="saveMaster"){const k=payload.type[0].toLowerCase()+payload.type.slice(1);db[k].push({id:String(Date.now()),name:payload.name});save();return {ok:true};}
  if(action==="deleteMaster"){const k=payload.type[0].toLowerCase()+payload.type.slice(1);db[k]=db[k].filter(x=>String(x.id)!==String(payload.id)&&String(x.name)!==String(payload.id));save();return {ok:true};}
  if(action==="saveUser"){const u=payload.user;if(payload.user.oldEmail){const i=db.users.findIndex(x=>x.email===payload.user.oldEmail);db.users[i]={...db.users[i],...u};delete db.users[i].oldEmail;}else db.users.push(u);save();return {ok:true};}
  if(action==="deleteUser"){db.users=db.users.filter(x=>x.email!==payload.email);save();return {ok:true};}
  if(action==="backup"){return {ok:true,backup:{version:"1.0",assets:db.assets,repairs:db.repairs,departments:db.departments,assetTypes:db.assetTypes,brands:db.brands,users:db.users}};}
  if(action==="importAssets"){let added=0,skipped=0,skippedIds=[];for(const row of payload.rows){let id=row["Asset ID"]||row.assetId||row["AssetID"]||"";if(!id){let n=db.assets.length+1;do{id="IT-"+String(n++).padStart(4,"0")}while(db.assets.some(x=>x.assetId===id)||db.ids.includes(id));}if(db.assets.some(x=>x.assetId===id)||db.ids.includes(id)){skipped++;skippedIds.push(id);continue}db.ids.push(id);db.assets.push({assetId:id,assetType:row["Asset Type"]||row.assetType,department:row.Department||row.department,brand:row.Brand||row.brand,model:row.Model||row.model,serialNumber:row["Serial Number"]||row.serialNumber||row["Serial No."]||row.serialNo,user:row.User||row.user,purchaseDate:row["Purchase Date"]||row.purchaseDate||"",purchaseAmount:row["Purchase Amount"]??row.purchaseAmount??row.Amount??row.amount??"",status:row.Status||"Active",warrantyExpiry:row["Warranty Expiry"]||row.warrantyExpiry});added++;}save();return {ok:true,added,skipped,skippedIds};}
  if(action==="restore"){db.assets=payload.backup.assets||[];db.repairs=payload.backup.repairs||[];save();return {ok:true};}
  throw new Error("Unsupported demo action");
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
