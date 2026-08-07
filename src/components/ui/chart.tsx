import*asReactfrom"react";
import*asRechartsPrimitivefrom"recharts";

import{cn}from"@/lib/utils";

//Format:{THEME_NAME:CSS_SELECTOR}
constTHEMES={light:"",dark:".dark"}asconst;

exporttypeChartConfig={
[kinstring]:{
label?:React.ReactNode;
icon?:React.ComponentType;
}&(
|{color?:string;theme?:never}
|{color?:never;theme:Record<keyoftypeofTHEMES,string>}
);
};

typeChartContextProps={
config:ChartConfig;
};

constChartContext=React.createContext<ChartContextProps|null>(null);

functionuseChart(){
constcontext=React.useContext(ChartContext);

if(!context){
thrownewError("useChartmustbeusedwithina<ChartContainer/>");
}

returncontext;
}

constChartContainer=React.forwardRef<
HTMLDivElement,
React.ComponentProps<"div">&{
config:ChartConfig;
children:React.ComponentProps<typeofRechartsPrimitive.ResponsiveContainer>["children"];
}
>(({id,className,children,config,...props},ref)=>{
constuniqueId=React.useId();
constchartId=`chart-${id||uniqueId.replace(/:/g,"")}`;

return(
<ChartContext.Providervalue={{config}}>
<div
data-chart={chartId}
ref={ref}
className={cn(
"flexaspect-videojustify-centertext-xs[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground[&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border[&_.recharts-dot[stroke='#fff']]:stroke-transparent[&_.recharts-layer]:outline-none[&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border[&_.recharts-radial-bar-background-sector]:fill-muted[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted[&_.recharts-reference-line_[stroke='#ccc']]:stroke-border[&_.recharts-sector[stroke='#fff']]:stroke-transparent[&_.recharts-sector]:outline-none[&_.recharts-surface]:outline-none",
className,
)}
{...props}
>
<ChartStyleid={chartId}config={config}/>
<RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
</div>
</ChartContext.Provider>
);
});
ChartContainer.displayName="Chart";

constChartStyle=({id,config}:{id:string;config:ChartConfig})=>{
constcolorConfig=Object.entries(config).filter(([,config])=>config.theme||config.color);

if(!colorConfig.length){
returnnull;
}

return(
<style
dangerouslySetInnerHTML={{
__html:Object.entries(THEMES)
.map(
([theme,prefix])=>`
${prefix}[data-chart=${id}]{
${colorConfig
.map(([key,itemConfig])=>{
constcolor=itemConfig.theme?.[themeaskeyoftypeofitemConfig.theme]||itemConfig.color;
returncolor?`--color-${key}:${color};`:null;
})
.join("\n")}
}
`,
)
.join("\n"),
}}
/>
);
};

constChartTooltip=RechartsPrimitive.Tooltip;

constChartTooltipContent=React.forwardRef<
HTMLDivElement,
React.ComponentProps<typeofRechartsPrimitive.Tooltip>&
React.ComponentProps<"div">&{
hideLabel?:boolean;
hideIndicator?:boolean;
indicator?:"line"|"dot"|"dashed";
nameKey?:string;
labelKey?:string;
}
>(
(
{
active,
payload,
className,
indicator="dot",
hideLabel=false,
hideIndicator=false,
label,
labelFormatter,
labelClassName,
formatter,
color,
nameKey,
labelKey,
},
ref,
)=>{
const{config}=useChart();

consttooltipLabel=React.useMemo(()=>{
if(hideLabel||!payload?.length){
returnnull;
}

const[item]=payload;
constkey=`${labelKey||item?.dataKey||item?.name||"value"}`;
constitemConfig=getPayloadConfigFromPayload(config,item,key);
constvalue=
!labelKey&&typeoflabel==="string"
?config[labelaskeyoftypeofconfig]?.label||label
:itemConfig?.label;

if(labelFormatter){
return(
<divclassName={cn("font-medium",labelClassName)}>{labelFormatter(value,payload)}</div>
);
}

if(!value){
returnnull;
}

return<divclassName={cn("font-medium",labelClassName)}>{value}</div>;
},[label,labelFormatter,payload,hideLabel,labelClassName,config,labelKey]);

if(!active||!payload?.length){
returnnull;
}

constnestLabel=payload.length===1&&indicator!=="dot";

return(
<div
ref={ref}
className={cn(
"gridmin-w-[8rem]items-startgap-1.5rounded-lgborderborder-border/50bg-backgroundpx-2.5py-1.5text-xsshadow-xl",
className,
)}
>
{!nestLabel?tooltipLabel:null}
<divclassName="gridgap-1.5">
{payload
.filter((item)=>item.type!=="none")
.map((item,index)=>{
constkey=`${nameKey||item.name||item.dataKey||"value"}`;
constitemConfig=getPayloadConfigFromPayload(config,item,key);
constindicatorColor=color||item.payload.fill||item.color;

return(
<div
key={item.dataKey}
className={cn(
"flexw-fullflex-wrapitems-stretchgap-2[&>svg]:h-2.5[&>svg]:w-2.5[&>svg]:text-muted-foreground",
indicator==="dot"&&"items-center",
)}
>
{formatter&&item?.value!==undefined&&item.name?(
formatter(item.value,item.name,item,index,item.payload)
):(
<>
{itemConfig?.icon?(
<itemConfig.icon/>
):(
!hideIndicator&&(
<div
className={cn(
"shrink-0rounded-[2px]border-(--color-border)bg-(--color-bg)",
{
"h-2.5w-2.5":indicator==="dot",
"w-1":indicator==="line",
"w-0border-[1.5px]border-dashedbg-transparent":
indicator==="dashed",
"my-0.5":nestLabel&&indicator==="dashed",
},
)}
style={
{
"--color-bg":indicatorColor,
"--color-border":indicatorColor,
}asReact.CSSProperties
}
/>
)
)}
<div
className={cn(
"flexflex-1justify-betweenleading-none",
nestLabel?"items-end":"items-center",
)}
>
<divclassName="gridgap-1.5">
{nestLabel?tooltipLabel:null}
<spanclassName="text-muted-foreground">
{itemConfig?.label||item.name}
</span>
</div>
{item.value&&(
<spanclassName="font-monofont-mediumtabular-numstext-foreground">
{item.value.toLocaleString()}
</span>
)}
</div>
</>
)}
</div>
);
})}
</div>
</div>
);
},
);
ChartTooltipContent.displayName="ChartTooltip";

constChartLegend=RechartsPrimitive.Legend;

constChartLegendContent=React.forwardRef<
HTMLDivElement,
React.ComponentProps<"div">&
Pick<RechartsPrimitive.LegendProps,"payload"|"verticalAlign">&{
hideIcon?:boolean;
nameKey?:string;
}
>(({className,hideIcon=false,payload,verticalAlign="bottom",nameKey},ref)=>{
const{config}=useChart();

if(!payload?.length){
returnnull;
}

return(
<div
ref={ref}
className={cn(
"flexitems-centerjustify-centergap-4",
verticalAlign==="top"?"pb-3":"pt-3",
className,
)}
>
{payload
.filter((item)=>item.type!=="none")
.map((item)=>{
constkey=`${nameKey||item.dataKey||"value"}`;
constitemConfig=getPayloadConfigFromPayload(config,item,key);

return(
<div
key={item.value}
className={cn(
"flexitems-centergap-1.5[&>svg]:h-3[&>svg]:w-3[&>svg]:text-muted-foreground",
)}
>
{itemConfig?.icon&&!hideIcon?(
<itemConfig.icon/>
):(
<div
className="h-2w-2shrink-0rounded-[2px]"
style={{
backgroundColor:item.color,
}}
/>
)}
{itemConfig?.label}
</div>
);
})}
</div>
);
});
ChartLegendContent.displayName="ChartLegend";

//Helpertoextractitemconfigfromapayload.
functiongetPayloadConfigFromPayload(config:ChartConfig,payload:unknown,key:string){
if(typeofpayload!=="object"||payload===null){
returnundefined;
}

constpayloadPayload=
"payload"inpayload&&typeofpayload.payload==="object"&&payload.payload!==null
?payload.payload
:undefined;

letconfigLabelKey:string=key;

if(keyinpayload&&typeofpayload[keyaskeyoftypeofpayload]==="string"){
configLabelKey=payload[keyaskeyoftypeofpayload]asstring;
}elseif(
payloadPayload&&
keyinpayloadPayload&&
typeofpayloadPayload[keyaskeyoftypeofpayloadPayload]==="string"
){
configLabelKey=payloadPayload[keyaskeyoftypeofpayloadPayload]asstring;
}

returnconfigLabelKeyinconfig?config[configLabelKey]:config[keyaskeyoftypeofconfig];
}

export{
ChartContainer,
ChartTooltip,
ChartTooltipContent,
ChartLegend,
ChartLegendContent,
ChartStyle,
};
