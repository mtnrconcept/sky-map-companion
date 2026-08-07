//Thisfileisautomaticallygenerated.Donotedititdirectly.
//Server-sideSupabaseclientwithservicerolekey-bypassesRLS.
//Usethisforadminoperationsinserverfunctionsandserverroutesonly.
//Foruser-authenticatedqueries(withRLS),usetheauthmiddlewareinstead.
import{createClient}from'@supabase/supabase-js';
importtype{Database}from'./types';

functionisNewSupabaseApiKey(value:string):boolean{
returnvalue.startsWith('sb_publishable_')||value.startsWith('sb_secret_');
}

functioncreateSupabaseFetch(supabaseKey:string):typeoffetch{
return(input,init)=>{
constheaders=newHeaders(
typeofRequest!=='undefined'&&inputinstanceofRequest?input.headers:undefined,
);

if(init?.headers){
newHeaders(init.headers).forEach((value,key)=>headers.set(key,value));
}

//NewSupabaseAPIkeysareopaquestrings,notbearerJWTs.
if(isNewSupabaseApiKey(supabaseKey)&&headers.get('Authorization')===`Bearer${supabaseKey}`){
headers.delete('Authorization');
}

headers.set('apikey',supabaseKey);
returnfetch(input,{...init,headers});
};
}

functioncreateSupabaseAdminClient(){
constSUPABASE_URL=process.env['SUPABASE_URL'];
constSUPABASE_SERVICE_ROLE_KEY=process.env['SUPABASE_SERVICE_ROLE_KEY'];

if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY){
constmissing=[
...(!SUPABASE_URL?['SUPABASE_URL']:[]),
...(!SUPABASE_SERVICE_ROLE_KEY?['SUPABASE_SERVICE_ROLE_KEY']:[]),
];
constmessage=`MissingSupabaseenvironmentvariable(s):${missing.join(',')}.ConnectSupabaseinLovableCloud.`;
console.error(`[Supabase]${message}`);
thrownewError(message);
}

returncreateClient<Database>(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{
global:{
fetch:createSupabaseFetch(SUPABASE_SERVICE_ROLE_KEY),
},
auth:{
storage:undefined,
persistSession:false,
autoRefreshToken:false,
}
});
}

let_supabaseAdmin:ReturnType<typeofcreateSupabaseAdminClient>|undefined;

//Server-sideSupabaseclientwithservicerole-bypassesRLS
//SECURITY:Onlyusethisfortrustedserver-sideoperations,neverexposetoclientcode
//Loadinsideserverhandlers:const{supabaseAdmin}=awaitimport("@/integrations/supabase/client.server");
//Top-levelimportissafeonlyinother.server.tsmodules-routefilesand*.functions.tsshiptotheclientbundle.
exportconstsupabaseAdmin=newProxy({}asReturnType<typeofcreateSupabaseAdminClient>,{
get(_,prop,receiver){
if(!_supabaseAdmin)_supabaseAdmin=createSupabaseAdminClient();
returnReflect.get(_supabaseAdmin,prop,receiver);
},
});
