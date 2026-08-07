import{useEffect,useState}from"react";
importtype{User}from"@supabase/supabase-js";
import{supabase}from"@/integrations/supabase/client";

exportfunctionuseAuth(){
const[user,setUser]=useState<User|null>(null);
const[loading,setLoading]=useState(true);

useEffect(()=>{
const{data}=supabase.auth.onAuthStateChange((_e,session)=>{
setUser(session?.user??null);
setLoading(false);
});
supabase.auth.getSession().then(({data:s})=>{
setUser(s.session?.user??null);
setLoading(false);
});
return()=>data.subscription.unsubscribe();
},[]);

return{user,loading};
}
