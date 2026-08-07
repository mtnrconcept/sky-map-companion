import{
createContext,
useCallback,
useContext,
useEffect,
useMemo,
useRef,
useState,
typeReactNode,
}from"react";

exportinterfaceObservingLocation{
name:string;
latitude:number;
longitude:number;
}

exportconstDEFAULT_LOCATION:ObservingLocation={
name:"Paris",
latitude:48.8566,
longitude:2.3522,
};

interfaceSkyState{
location:ObservingLocation;
setLocation:(l:ObservingLocation)=>void;
geolocate:()=>void;
geoStatus:"idle"|"pending"|"denied"|"ok";
date:Date;
offsetMinutes:number;
setOffsetMinutes:(m:number)=>void;
live:boolean;
resetToNow:()=>void;
nightMode:boolean;
toggleNightMode:()=>void;
selected:string|null;
select:(id:string|null)=>void;
target:string|null;
setTarget:(id:string|null)=>void;
showLines:boolean;
toggleLines:()=>void;
showLabels:boolean;
toggleLabels:()=>void;
}

constSkyContext=createContext<SkyState|null>(null);

constSTORAGE_KEY="carte-du-ciel:prefs";

interfaceStoredPrefs{
location?:ObservingLocation;
nightMode?:boolean;
showLines?:boolean;
showLabels?:boolean;
}

functionreadPrefs():StoredPrefs{
if(typeofwindow==="undefined")return{};
try{
returnJSON.parse(window.localStorage.getItem(STORAGE_KEY)??"{}");
}catch{
return{};
}
}

exportfunctionSkyProvider({children}:{children:ReactNode}){
const[location,setLocationState]=
useState<ObservingLocation>(DEFAULT_LOCATION);
const[nightMode,setNightMode]=useState(false);
const[showLines,setShowLines]=useState(true);
const[showLabels,setShowLabels]=useState(true);
const[offsetMinutes,setOffsetMinutes]=useState(0);
const[now,setNow]=useState(()=>newDate());
const[selected,setSelected]=useState<string|null>(null);
const[target,setTarget]=useState<string|null>(null);
const[geoStatus,setGeoStatus]=useState<
"idle"|"pending"|"denied"|"ok"
>("idle");
consthydrated=useRef(false);

useEffect(()=>{
constp=readPrefs();
if(p.location)setLocationState(p.location);
if(p.nightMode!==undefined)setNightMode(p.nightMode);
if(p.showLines!==undefined)setShowLines(p.showLines);
if(p.showLabels!==undefined)setShowLabels(p.showLabels);
hydrated.current=true;
},[]);

useEffect(()=>{
if(!hydrated.current)return;
window.localStorage.setItem(
STORAGE_KEY,
JSON.stringify({location,nightMode,showLines,showLabels}),
);
},[location,nightMode,showLines,showLabels]);

useEffect(()=>{
constt=window.setInterval(()=>setNow(newDate()),15000);
return()=>window.clearInterval(t);
},[]);

useEffect(()=>{
document.documentElement.classList.toggle("night",nightMode);
},[nightMode]);

constgeolocate=useCallback(()=>{
if(typeofnavigator==="undefined"||!navigator.geolocation){
setGeoStatus("denied");
return;
}
setGeoStatus("pending");
navigator.geolocation.getCurrentPosition(
(p)=>{
setLocationState({
name:"Maposition",
latitude:Number(p.coords.latitude.toFixed(4)),
longitude:Number(p.coords.longitude.toFixed(4)),
});
setGeoStatus("ok");
},
()=>setGeoStatus("denied"),
{enableHighAccuracy:false,timeout:10000,maximumAge:600000},
);
},[]);

constdate=useMemo(
()=>newDate(now.getTime()+offsetMinutes*60000),
[now,offsetMinutes],
);

constvalue:SkyState={
location,
setLocation:setLocationState,
geolocate,
geoStatus,
date,
offsetMinutes,
setOffsetMinutes,
live:offsetMinutes===0,
resetToNow:()=>setOffsetMinutes(0),
nightMode,
toggleNightMode:()=>setNightMode((v)=>!v),
selected,
select:setSelected,
target,
setTarget,
showLines,
toggleLines:()=>setShowLines((v)=>!v),
showLabels,
toggleLabels:()=>setShowLabels((v)=>!v),
};

return<SkyContext.Providervalue={value}>{children}</SkyContext.Provider>;
}

exportfunctionuseSky():SkyState{
constctx=useContext(SkyContext);
if(!ctx)thrownewError("useSkydoitêtreutilisédansSkyProvider");
returnctx;
}
