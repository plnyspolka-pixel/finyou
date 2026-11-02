const start=document.getElementById("start");
const status=document.getElementById("status");
async function call(type){
 try { return await chrome.runtime.sendMessage({type}); }
 catch(error){return {ok:false,error:error.message};}
}
start.addEventListener("click",async()=>{
 start.disabled=true;
 const r=await call("START");
 status.textContent=r.ok?"Rozpoczęto odczyt zakładek…":(r.error||"Błąd uruchomienia");
 if(!r.ok)start.disabled=false;
});
async function refresh(){
 const r=await call("STATUS");
 if(r?.message)status.textContent=r.message;
 if(r?.done||r?.error)start.disabled=false;
}
setInterval(refresh,1200);
refresh();