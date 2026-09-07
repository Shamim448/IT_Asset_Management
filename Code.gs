/*******************************************************
 IT Asset Management System - Google Apps Script backend
 Database: Google Sheets
 Security: server-side role enforcement + salted SHA-256
 Recommended deployment: Execute as Me, restricted to your
 Google Workspace/domain when possible.
*******************************************************/
const CONFIG = {
  SPREADSHEET_ID: "PASTE_GOOGLE_SHEET_ID_HERE",
  SESSION_HOURS: 8,
  SHEETS: ["Assets","Repairs","Users","Departments","AssetTypes","Brands","IDRegistry","Sessions","AuditLog"]
};
const HEADERS = {
  Assets:["assetId","assetType","department","brand","model","serialNumber","user","purchaseDate","purchaseAmount","warrantyExpiry","status","location","remarks","createdAt","updatedAt"],
  Repairs:["repairId","assetId","repairDate","problem","repairDetails","vendor","repairCost","partsReplaced","repairStatus","returnDate","remarks","createdAt","updatedAt"],
  Users:["email","name","role","status","salt","passwordHash","createdAt","updatedAt"],
  Departments:["id","name"], AssetTypes:["id","name"], Brands:["id","name"],
  IDRegistry:["assetId","registeredAt","reason"],
  Sessions:["token","email","expiresAt"],
  AuditLog:["timestamp","email","action","target","details"]
};

function ss_(){ return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID); }
function sh_(name){ const s=ss_().getSheetByName(name); if(!s) throw new Error("Missing sheet: "+name); return s; }
function now_(){ return new Date(); }
function iso_(d){ return Utilities.formatDate(new Date(d), Session.getScriptTimeZone() || "Asia/Dhaka","yyyy-MM-dd'T'HH:mm:ss"); }
function setup(){
  const ss=ss_();
  // v4: migrate Assets header to include Purchase Amount.
  const assetSheet=ss.getSheetByName("Assets"); if(assetSheet){ HEADERS.Assets.forEach(function(h,i){ assetSheet.getRange(1,i+1).setValue(h); }); }
  CONFIG.SHEETS.forEach(n=>{
    let s=ss.getSheetByName(n); if(!s) s=ss.insertSheet(n);
    if(s.getLastRow()===0) s.appendRow(HEADERS[n]);
    else if(s.getRange(1,1,1,HEADERS[n].length).getValues()[0].join("|")!==HEADERS[n].join("|")) s.getRange(1,1,1,HEADERS[n].length).setValues([HEADERS[n]]);
    s.setFrozenRows(1);
  });
  const u=read_("Users");
  if(!u.length) addUserInternal_({email:"admin@example.com",name:"Administrator",role:"Admin",status:"Active",password:"admin123"});
  if(!read_("Departments").length) writeRows_("Departments",[{id:Utilities.getUuid(),name:"IT"}]);
  if(!read_("AssetTypes").length) writeRows_("AssetTypes",[{id:Utilities.getUuid(),name:"Laptop"},{id:Utilities.getUuid(),name:"Desktop"}]);
  if(!read_("Brands").length) writeRows_("Brands",[{id:Utilities.getUuid(),name:"Dell"},{id:Utilities.getUuid(),name:"HP"}]);
  return "Setup complete. Change the demo admin password immediately.";
}

function getLastCompletedRepairDate_(assetId, repairs) {
  let latest = "";
  (repairs || []).forEach(function(r) {
    if (String(r.assetId || r['Asset ID'] || '').trim() !== String(assetId || '').trim()) return;
    const status = String(r.status || r['Repair Status'] || '').trim().toLowerCase();
    if (status !== 'completed') return;
    const d = r.repairDate || r['Repair Date'] || "";
    if (d && (!latest || new Date(d) > new Date(latest))) latest = d;
  });
  return latest;
}

function doGet(){ return json_({ok:true,service:"ITAM API",version:"1.0"}); }
function doPost(e){
  try{ const p=JSON.parse(e.postData.contents||"{}"); return json_(dispatch_(p)); }
  catch(err){ return json_({ok:false,error:err.message||String(err)}); }
}
function json_(x){ return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON); }

function dispatch_(p){
  switch(p.action){
    case "login": return login_(p);
    case "bootstrap": return bootstrap_(auth_(p.token));
    case "saveAsset": return saveAsset_(auth_(p.token),p.asset);
    case "deleteAsset": return admin_(p.token,()=>deleteAsset_(auth_(p.token),p.assetId));
    case "setStatus": return setStatus_(auth_(p.token),p.assetId,p.status);
    case "saveRepair": return saveRepair_(auth_(p.token),p.repair);
    case "deleteRepair": return admin_(p.token,()=>deleteRepair_(auth_(p.token),p.repairId));
    case "saveMaster": return admin_(p.token,()=>saveMaster_(auth_(p.token),p.type,p.name));
    case "deleteMaster": return admin_(p.token,()=>deleteMaster_(auth_(p.token),p.type,p.id));
    case "saveUser": return admin_(p.token,()=>saveUser_(auth_(p.token),p.user));
    case "deleteUser": return admin_(p.token,()=>deleteUser_(auth_(p.token),p.email));
    case "backup": return backup_(auth_(p.token));
    case "restore": return admin_(p.token,()=>restore_(auth_(p.token),p.backup));
    case "importAssets": return importAssets_(auth_(p.token),p.rows||[]);
    default: throw new Error("Unsupported action");
  }
}
function read_(name){
  const s=sh_(name), v=s.getDataRange().getValues(); if(v.length<2)return [];
  const h=v[0]; return v.slice(1).filter(r=>r.some(x=>x!=="")).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]])));
}
function writeRows_(name,rows){
  if(!rows.length)return;
  const s=sh_(name),h=HEADERS[name];s.getRange(s.getLastRow()+1,1,rows.length,h.length).setValues(rows.map(o=>h.map(k=>o[k]??"")));
}
function appendObj_(name,o){writeRows_(name,[o]);}
function rewrite_(name,rows){
  const s=sh_(name),h=HEADERS[name]; if(s.getLastRow()>1)s.getRange(2,1,s.getLastRow()-1,h.length).clearContent();
  if(rows.length)s.getRange(2,1,rows.length,h.length).setValues(rows.map(o=>h.map(k=>o[k]??"")));
}
function hash_(password,salt){
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(salt)+"|"+String(password), Utilities.Charset.UTF_8);
  return bytes.map(b=>(b<0?b+256:b).toString(16).padStart(2,"0")).join("");
}
function addUserInternal_(u){
  const salt=Utilities.getUuid(); appendObj_("Users",{email:String(u.email).toLowerCase(),name:u.name,role:u.role,status:u.status,salt,passwordHash:hash_(u.password,salt),createdAt:iso_(now_()),updatedAt:iso_(now_())});
}
function login_(p){
  const email=String(p.email||"").trim().toLowerCase(), u=read_("Users").find(x=>String(x.email).toLowerCase()===email);
  if(!u||u.status!=="Active"||hash_(p.password||"",u.salt)!==u.passwordHash)throw new Error("Invalid credentials");
  const token=Utilities.getUuid()+"-"+Utilities.getUuid(), exp=new Date(Date.now()+CONFIG.SESSION_HOURS*3600000);
  appendObj_("Sessions",{token,email,expiresAt:iso_(exp)}); audit_(email,"LOGIN",email,"Successful login");
  return {ok:true,token,user:publicUser_(u)};
}
function auth_(token){
  if(!token)throw new Error("Authentication required");
  const s=read_("Sessions").find(x=>x.token===token);
  if(!s||new Date(s.expiresAt)<now_())throw new Error("Session expired. Please sign in again.");
  const u=read_("Users").find(x=>String(x.email).toLowerCase()===String(s.email).toLowerCase());
  if(!u||u.status!=="Active")throw new Error("User is inactive.");
  return u;
}
function admin_(token,fn){const u=auth_(token);if(u.role!=="Admin")throw new Error("Admin permission required.");return fn();}
function publicUser_(u){return {email:u.email,name:u.name,role:u.role,status:u.status};}
function bootstrap_(u){
  const repairs=read_("Repairs");
  const assets=read_("Assets").map(function(a){ return {...a,lastRepairDate:getLastCompletedRepairDate_(a.assetId,repairs)}; });
  return {ok:true,user:publicUser_(u),data:{assets:assets,repairs:repairs,users:read_("Users").map(publicUser_),departments:read_("Departments"),assetTypes:read_("AssetTypes"),brands:read_("Brands"),audit:u.role==="Admin"?read_("AuditLog"):[]}};
}
function nextAssetId_(){
  const reg=read_("IDRegistry").map(x=>String(x.assetId)), used=read_("Assets").map(x=>String(x.assetId));let max=0;
  [...reg,...used].forEach(id=>{const m=id.match(/^IT-(\d+)$/i);if(m)max=Math.max(max,Number(m[1]));});
  let n=max+1,id;do{id="IT-"+String(n++).padStart(4,"0")}while(reg.includes(id)||used.includes(id));return id;
}
function registerId_(id,reason){appendObj_("IDRegistry",{assetId:id,registeredAt:iso_(now_()),reason});}
function saveAsset_(u,a){
  if(!a||!a.assetType)throw new Error("Asset Type is required.");
  const rows=read_("Assets"), editing=!!a.assetId, old=editing?rows.find(x=>x.assetId===a.assetId):null;
  if(editing&&u.role!=="Admin")throw new Error("Only Admin can edit assets.");
  if(!editing){a.assetId=nextAssetId_();registerId_(a.assetId,"Created");}
  const o={...a,updatedAt:iso_(now_())}; if(!editing)o.createdAt=iso_(now_());
  if(old){const i=rows.findIndex(x=>x.assetId===a.assetId);rows[i]={...old,...o};rewrite_("Assets",rows);}
  else appendObj_("Assets",o);
  if((o.status==="Under Repair")&&(!old||old.status!=="Under Repair")) autoRepair_(u,o);
  audit_(u.email,editing?"EDIT_ASSET":"ADD_ASSET",a.assetId,editing?"Asset updated":"Asset created");
  return {ok:true,assetId:a.assetId};
}
function autoRepair_(u,a){
  const r={repairId:"REP-"+Utilities.getUuid(),assetId:a.assetId,repairDate:iso_(now_()).slice(0,10),problem:"Asset moved to Under Repair",repairDetails:"Auto-created from Asset Status change.",vendor:"",repairCost:0,partsReplaced:"",repairStatus:"In Progress",returnDate:"",remarks:"Automatically created.",createdAt:iso_(now_()),updatedAt:iso_(now_())};
  appendObj_("Repairs",r);audit_(u.email,"AUTO_REPAIR",a.assetId,"Repair record auto-created because asset status became Under Repair");
}
function deleteAsset_(u,id){
  const rows=read_("Assets"),i=rows.findIndex(x=>x.assetId===id);if(i<0)throw new Error("Asset not found.");
  rows.splice(i,1);rewrite_("Assets",rows);audit_(u.email,"DELETE_ASSET",id,"Asset deleted; ID remains permanently registered");return {ok:true};
}
function setStatus_(u,id,status){
  const allowed=["Active","Under Repair","Retired","Lost","Damaged"];if(!allowed.includes(status))throw new Error("Invalid status.");
  const a=read_("Assets").find(x=>x.assetId===id);if(!a)throw new Error("Asset not found.");
  if(status==="Under Repair"&&a.status!=="Under Repair")autoRepair_(u,a);
  const rows=read_("Assets");const i=rows.findIndex(x=>x.assetId===id);rows[i]={...a,status,updatedAt:iso_(now_())};rewrite_("Assets",rows);audit_(u.email,"STATUS_CHANGE",id,"Status changed to "+status);return {ok:true};
}
function saveRepair_(u,r){
  if(u.role!=="Admin"&&r.repairId)throw new Error("Normal Users cannot edit repair records.");
  if(["Completed","Returned"].includes(r.repairStatus)&&!r.returnDate)throw new Error("Return Date is required for Completed/Returned repairs.");
  const rows=read_("Repairs"), editing=!!r.repairId, old=editing?rows.find(x=>x.repairId===r.repairId):null;
  if(editing&&!old)throw new Error("Repair record not found.");
  if(editing&&old.repairStatus==="Completed"&&u.role!=="Admin")throw new Error("Only Admin can edit completed repairs.");
  if(!editing)r.repairId="REP-"+Utilities.getUuid();
  r.updatedAt=iso_(now_());if(!editing){r.createdAt=iso_(now_());r.repairDate=r.repairDate||iso_(now_()).slice(0,10);r.repairStatus=r.repairStatus||"In Progress";}
  if(old){const i=rows.findIndex(x=>x.repairId===r.repairId);rows[i]={...old,...r};rewrite_("Repairs",rows);}else appendObj_("Repairs",r);
  const arows=read_("Assets"),i=arows.findIndex(x=>x.assetId===r.assetId);if(i>=0){let st=arows[i].status;if(["Completed","Returned"].includes(r.repairStatus))st="Active";else if(["Pending","In Progress"].includes(r.repairStatus))st="Under Repair";arows[i].status=st;arows[i].updatedAt=iso_(now_());rewrite_("Assets",arows);}
  audit_(u.email,editing?"EDIT_REPAIR":"ADD_REPAIR",r.repairId,"Repair saved: "+r.repairStatus);return {ok:true,repairId:r.repairId};
}
function deleteRepair_(u,id){const rows=read_("Repairs"),i=rows.findIndex(x=>x.repairId===id);if(i<0)throw new Error("Repair not found.");rows.splice(i,1);rewrite_("Repairs",rows);audit_(u.email,"DELETE_REPAIR",id,"Repair deleted");return {ok:true};}
function saveMaster_(u,type,name){if(!HEADERS[type]||!["Departments","AssetTypes","Brands"].includes(type))throw new Error("Invalid master type.");name=String(name||"").trim();if(!name)throw new Error("Name required.");const rows=read_(type);if(rows.some(x=>String(x.name).toLowerCase()===name.toLowerCase()))throw new Error("Already exists.");appendObj_(type,{id:Utilities.getUuid(),name});audit_(u.email,"ADD_MASTER",type,name);return {ok:true};}
function deleteMaster_(u,type,id){const rows=read_(type),i=rows.findIndex(x=>String(x.id)===String(id)||String(x.name)===String(id));if(i<0)throw new Error("Record not found.");rows.splice(i,1);rewrite_(type,rows);audit_(u.email,"DELETE_MASTER",type,String(id));return {ok:true};}
function saveUser_(u,p){const oldEmail=p.oldEmail?String(p.oldEmail).toLowerCase():"", email=String(p.email||"").trim().toLowerCase();if(!email)throw new Error("Email required.");const rows=read_("Users");let i=oldEmail?rows.findIndex(x=>String(x.email).toLowerCase()===oldEmail):-1;if(i<0){if(rows.some(x=>String(x.email).toLowerCase()===email))throw new Error("User already exists.");if(!p.password)throw new Error("Password required.");addUserInternal_({email,name:p.name,role:p.role,status:p.status,password:p.password});audit_(u.email,"ADD_USER",email,"User created");return {ok:true};}const cur=rows[i];const salt=p.password?Utilities.getUuid():cur.salt;rows[i]={...cur,email,name:p.name,role:p.role,status:p.status,salt,passwordHash:p.password?hash_(p.password,salt):cur.passwordHash,updatedAt:iso_(now_())};rewrite_("Users",rows);audit_(u.email,"EDIT_USER",email,"User updated");return {ok:true};}
function deleteUser_(u,email){if(String(email).toLowerCase()===String(u.email).toLowerCase())throw new Error("You cannot delete your own account.");const rows=read_("Users").filter(x=>String(x.email).toLowerCase()!==String(email).toLowerCase());rewrite_("Users",rows);audit_(u.email,"DELETE_USER",email,"User deleted");return {ok:true};}
function backup_(u){audit_(u.email,"BACKUP","","Backup downloaded");return {ok:true,backup:{version:"1.0",createdAt:iso_(now_()),assets:read_("Assets"),repairs:read_("Repairs"),departments:read_("Departments"),assetTypes:read_("AssetTypes"),brands:read_("Brands"),users:read_("Users").map(publicUser_)}};}
function restore_(u,b){if(!b||!Array.isArray(b.assets)||!Array.isArray(b.repairs))throw new Error("Invalid backup.");rewrite_("Assets",b.assets);rewrite_("Repairs",b.repairs);if(Array.isArray(b.departments))rewrite_("Departments",b.departments);if(Array.isArray(b.assetTypes))rewrite_("AssetTypes",b.assetTypes);if(Array.isArray(b.brands))rewrite_("Brands",b.brands);b.assets.forEach(a=>{if(!read_("IDRegistry").some(x=>x.assetId===a.assetId))registerId_(a.assetId,"Restored");});audit_(u.email,"RESTORE","","Backup restored");return {ok:true};}
function importAssets_(u,rows){
  const canImport=u.role==="Admin";if(!canImport)throw new Error("Only Admin can import Excel.");
  const existing=new Set(read_("Assets").map(x=>String(x.assetId))), reg=new Set(read_("IDRegistry").map(x=>String(x.assetId))), added=[], skippedIds=[];
  rows.forEach(r=>{
    let id=String(r["Asset ID"]||r.assetId||r.AssetID||"").trim();
    if(!id)id=nextAssetId_();
    if(existing.has(id)||reg.has(id)){skippedIds.push(id);return;}
    const a={assetId:id,assetType:r["Asset Type"]||r.assetType||"",department:r.Department||r.department||"",brand:r.Brand||r.brand||"",model:r.Model||r.model||"",serialNumber:r["Serial Number"]||r.serialNumber||"",user:r.User||r.user||"",purchaseDate:r["Purchase Date","Purchase Amount"]||r.purchaseDate||"",warrantyExpiry:r["Warranty Expiry"]||r.warrantyExpiry||"",status:r.Status||"Active",location:r.Location||r.location||"",remarks:r.Remarks||r.remarks||"",createdAt:iso_(now_()),updatedAt:iso_(now_())};
    if(!a.assetType)return;added.push(a);existing.add(id);reg.add(id);
  });
  writeRows_("Assets",added);added.forEach(a=>registerId_(a.assetId,"Imported"));audit_(u.email,"IMPORT_ASSETS","","Imported "+added.length+" assets; skipped "+skippedIds.length);
  return {ok:true,added:added.length,skipped:skippedIds.length,skippedIds};
}
function audit_(email,action,target,details){appendObj_("AuditLog",{timestamp:iso_(now_()),email,action,target,details});}
