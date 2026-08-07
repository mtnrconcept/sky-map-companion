import{useMutation,useQuery,useQueryClient}from"@tanstack/react-query";
import{supabase}from"@/integrations/supabase/client";
import{useAuth}from"./useAuth";

exportfunctionuseFavorites(){
const{user}=useAuth();
constqueryClient=useQueryClient();

constquery=useQuery({
queryKey:["favorites",user?.id??null],
enabled:!!user,
queryFn:async()=>{
const{data,error}=awaitsupabase
.from("favorites")
.select("id,object_id,created_at")
.order("created_at",{ascending:false});
if(error)throwerror;
returndata;
},
});

constids=newSet((query.data??[]).map((f)=>f.object_id));

consttoggle=useMutation({
mutationFn:async(objectId:string)=>{
if(!user)thrownewError("Connexionrequise");
if(ids.has(objectId)){
const{error}=awaitsupabase
.from("favorites")
.delete()
.eq("object_id",objectId)
.eq("user_id",user.id);
if(error)throwerror;
return"removed"asconst;
}
const{error}=awaitsupabase
.from("favorites")
.insert({object_id:objectId,user_id:user.id});
if(error)throwerror;
return"added"asconst;
},
onSuccess:()=>
queryClient.invalidateQueries({queryKey:["favorites"]}),
});

return{
user,
favorites:query.data??[],
isFavorite:(id:string)=>ids.has(id),
toggle,
loading:query.isLoading,
};
}
