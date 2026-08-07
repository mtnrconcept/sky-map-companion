import{createFileRoute,Outlet}from"@tanstack/react-router";

exportconstRoute=createFileRoute("/ressources")({
component:()=><Outlet/>,
});
