import{createFileRoute}from"@tanstack/react-router";
import{analyzeImage}from"@/lib/vision-analysis.server";

exportconstRoute=createFileRoute("/api/vision/analyze")({
server:{
handlers:{
POST:async({request})=>{
constheaders={"Content-Type":"application/json"};
try{
constbody=awaitrequest.json();
const{imageUrl}=bodyas{imageUrl?:string};

if(!imageUrl){
returnnewResponse(JSON.stringify({error:"imageUrlrequis"}),{
status:400,
headers,
});
}

constresult=awaitanalyzeImage(imageUrl);
returnnewResponse(JSON.stringify(result),{status:200,headers});
}catch(err){
console.error("[vision/analyze]",err);
returnnewResponse(JSON.stringify({error:"Erreurd'analyse"}),{
status:500,
headers,
});
}
},
},
},
});
