import https from "https";
const URL = "https://techmarket-api-container.braveforest-a222ef2c.brazilsouth.azurecontainerapps.io/hot";
const CONC = 100, DURATION = 180;
function hit(){ return new Promise(r=>https.get(URL,()=>r()).on("error",()=>r())); }
(async()=>{ const end=Date.now()+DURATION*1000;
  await Promise.all(Array.from({length:CONC}, async()=>{ while(Date.now()<end) await hit(); }));
  console.log("done");
})();
