import*asReactfrom"react";
import*asTabsPrimitivefrom"@radix-ui/react-tabs";

import{cn}from"@/lib/utils";

constTabs=TabsPrimitive.Root;

constTabsList=React.forwardRef<
React.ElementRef<typeofTabsPrimitive.List>,
React.ComponentPropsWithoutRef<typeofTabsPrimitive.List>
>(({className,...props},ref)=>(
<TabsPrimitive.List
ref={ref}
className={cn(
"inline-flexh-9items-centerjustify-centerrounded-lgbg-mutedp-1text-muted-foreground",
className,
)}
{...props}
/>
));
TabsList.displayName=TabsPrimitive.List.displayName;

constTabsTrigger=React.forwardRef<
React.ElementRef<typeofTabsPrimitive.Trigger>,
React.ComponentPropsWithoutRef<typeofTabsPrimitive.Trigger>
>(({className,...props},ref)=>(
<TabsPrimitive.Trigger
ref={ref}
className={cn(
"inline-flexitems-centerjustify-centerwhitespace-nowraprounded-mdpx-3py-1text-smfont-mediumring-offset-backgroundcursor-pointertransition-allfocus-visible:outline-nonefocus-visible:ring-2focus-visible:ring-ringfocus-visible:ring-offset-2disabled:pointer-events-nonedisabled:opacity-50disabled:cursor-not-alloweddata-[state=active]:bg-backgrounddata-[state=active]:text-foregrounddata-[state=active]:shadow",
className,
)}
{...props}
/>
));
TabsTrigger.displayName=TabsPrimitive.Trigger.displayName;

constTabsContent=React.forwardRef<
React.ElementRef<typeofTabsPrimitive.Content>,
React.ComponentPropsWithoutRef<typeofTabsPrimitive.Content>
>(({className,...props},ref)=>(
<TabsPrimitive.Content
ref={ref}
className={cn(
"mt-2ring-offset-backgroundfocus-visible:outline-nonefocus-visible:ring-2focus-visible:ring-ringfocus-visible:ring-offset-2",
className,
)}
{...props}
/>
));
TabsContent.displayName=TabsPrimitive.Content.displayName;

export{Tabs,TabsList,TabsTrigger,TabsContent};
