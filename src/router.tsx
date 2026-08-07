import{QueryClient}from"@tanstack/react-query";
import{createRouter}from"@tanstack/react-router";
import{routeTree}from"./routeTree.gen";

exportconstgetRouter=()=>{
constqueryClient=newQueryClient();

constrouter=createRouter({
routeTree,
context:{queryClient},
scrollRestoration:true,
defaultPreloadStaleTime:0,
});

returnrouter;
};
