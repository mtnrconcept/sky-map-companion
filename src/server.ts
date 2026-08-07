import"./lib/error-capture";

import{consumeLastCapturedError}from"./lib/error-capture";
import{renderErrorPage}from"./lib/error-page";

typeServerEntry={
fetch:(request:Request,env:unknown,ctx:unknown)=>Promise<Response>|Response;
};

letserverEntryPromise:Promise<ServerEntry>|undefined;

asyncfunctiongetServerEntry():Promise<ServerEntry>{
if(!serverEntryPromise){
serverEntryPromise=import("@tanstack/react-start/server-entry").then(
(m)=>(m.default??m)asServerEntry,
);
}
returnserverEntryPromise;
}

//h3swallowsin-handlerthrowsintoanormal500Responsewithbody
//{"unhandled":true,"message":"HTTPError"}—try/catchaloneneverfiresforthose.
asyncfunctionnormalizeCatastrophicSsrResponse(response:Response):Promise<Response>{
if(response.status<500)returnresponse;
constcontentType=response.headers.get("content-type")??"";
if(!contentType.includes("application/json"))returnresponse;

constbody=awaitresponse.clone().text();
if(!isH3SwallowedErrorBody(body))returnresponse;

console.error(consumeLastCapturedError()??newError(`h3swallowedSSRerror:${body}`));
returnnewResponse(renderErrorPage(),{
status:500,
headers:{"content-type":"text/html;charset=utf-8"},
});
}

functionisH3SwallowedErrorBody(body:string):boolean{
try{
constpayload=JSON.parse(body)as{unhandled?:unknown;message?:unknown};
returnpayload.unhandled===true&&payload.message==="HTTPError";
}catch{
returnfalse;
}
}

exportdefault{
asyncfetch(request:Request,env:unknown,ctx:unknown){
try{
consthandler=awaitgetServerEntry();
constresponse=awaithandler.fetch(request,env,ctx);
returnawaitnormalizeCatastrophicSsrResponse(response);
}catch(error){
console.error(error);
returnnewResponse(renderErrorPage(),{
status:500,
headers:{"content-type":"text/html;charset=utf-8"},
});
}
},
};
