//Thisfileisauto-generatedbyLovable.Donotmodifyit.

import{createLovableAuth}from"@lovable.dev/cloud-auth-js";
import{supabase}from"../supabase/client";
constlovableAuth=createLovableAuth();

typeSignInOptions={
redirect_uri?:string;
extraParams?:Record<string,string>;
};

exportconstlovable={
auth:{
signInWithOAuth:async(provider:"google"|"apple"|"microsoft"|"lovable",opts?:SignInOptions)=>{
constresult=awaitlovableAuth.signInWithOAuth(provider,{
...opts,
extraParams:{
...opts?.extraParams,
},
});

if(result.redirected){
returnresult;
}

if(result.error){
returnresult;
}

try{
awaitsupabase.auth.setSession(result.tokens);
}catch(e){
return{error:einstanceofError?e:newError(String(e))};
}
returnresult;
},
},
};
