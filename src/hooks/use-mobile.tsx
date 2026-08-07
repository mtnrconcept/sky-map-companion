import*asReactfrom"react";

constMOBILE_BREAKPOINT=768;

exportfunctionuseIsMobile(){
const[isMobile,setIsMobile]=React.useState<boolean|undefined>(undefined);

React.useEffect(()=>{
constmql=window.matchMedia(`(max-width:${MOBILE_BREAKPOINT-1}px)`);
constonChange=()=>{
setIsMobile(window.innerWidth<MOBILE_BREAKPOINT);
};
mql.addEventListener("change",onChange);
setIsMobile(window.innerWidth<MOBILE_BREAKPOINT);
return()=>mql.removeEventListener("change",onChange);
},[]);

return!!isMobile;
}
