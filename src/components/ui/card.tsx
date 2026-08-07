import*asReactfrom"react";

import{cn}from"@/lib/utils";

constCard=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLDivElement>>(
({className,...props},ref)=>(
<div
ref={ref}
className={cn("rounded-xlborderbg-cardtext-card-foregroundshadow",className)}
{...props}
/>
),
);
Card.displayName="Card";

constCardHeader=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLDivElement>>(
({className,...props},ref)=>(
<divref={ref}className={cn("flexflex-colspace-y-1.5p-6",className)}{...props}/>
),
);
CardHeader.displayName="CardHeader";

constCardTitle=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLDivElement>>(
({className,...props},ref)=>(
<div
ref={ref}
className={cn("font-semiboldleading-nonetracking-tight",className)}
{...props}
/>
),
);
CardTitle.displayName="CardTitle";

constCardDescription=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLDivElement>>(
({className,...props},ref)=>(
<divref={ref}className={cn("text-smtext-muted-foreground",className)}{...props}/>
),
);
CardDescription.displayName="CardDescription";

constCardContent=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLDivElement>>(
({className,...props},ref)=>(
<divref={ref}className={cn("p-6pt-0",className)}{...props}/>
),
);
CardContent.displayName="CardContent";

constCardFooter=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLDivElement>>(
({className,...props},ref)=>(
<divref={ref}className={cn("flexitems-centerp-6pt-0",className)}{...props}/>
),
);
CardFooter.displayName="CardFooter";

export{Card,CardHeader,CardFooter,CardTitle,CardDescription,CardContent};
