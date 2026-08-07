//Thisfileisautomaticallygenerated.Donotedititdirectly.
import{createMiddleware}from'@tanstack/react-start'
import{supabase}from'./client'

//Mustberegisteredasaglobal`functionMiddleware`in`src/start.ts`;otherwise
//thebrowserneverattachesthebearertokentoserverFnRPCs.
exportconstattachSupabaseAuth=createMiddleware({type:'function'}).client(
async({next})=>{
const{data}=awaitsupabase.auth.getSession()
consttoken=data.session?.access_token
returnnext({
headers:token?{Authorization:`Bearer${token}`}:{},
})
},
)
