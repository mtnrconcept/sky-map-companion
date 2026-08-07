import{createStart,createCsrfMiddleware,createMiddleware}from"@tanstack/react-start";

import{renderErrorPage}from"./lib/error-page";
import{attachSupabaseAuth}from"@/integrations/supabase/auth-attacher";

consterrorMiddleware=createMiddleware().server(async({next})=>{
try{
returnawaitnext();
}catch(error){
if(error!=null&&typeoferror==="object"&&"statusCode"inerror){
throwerror;
}
console.error(error);
returnnewResponse(renderErrorPage(),{
status:500,
headers:{"content-type":"text/html;charset=utf-8"},
});
}
});

//Startinstallsthisautomaticallywhensrc/start.tsisabsent;definingthe
//fileoptsout,sore-additexplicitlytokeepserverfunctionsprotected
//fromcross-siterequests.
constcsrfMiddleware=createCsrfMiddleware({
filter:(ctx)=>ctx.handlerType==="serverFn",
});

exportconststartInstance=createStart(()=>({
functionMiddleware:[attachSupabaseAuth],
requestMiddleware:[errorMiddleware,csrfMiddleware],
}));
