import*asReactfrom"react";
import{cva,typeVariantProps}from"class-variance-authority";

import{cn}from"@/lib/utils";

constalertVariants=cva(
"relativew-fullrounded-lgborderpx-4py-3text-sm[&>svg+div]:translate-y-[-3px][&>svg]:absolute[&>svg]:left-4[&>svg]:top-4[&>svg]:text-foreground[&>svg~*]:pl-7",
{
variants:{
variant:{
default:"bg-backgroundtext-foreground",
destructive:
"border-destructive/50text-destructivedark:border-destructive[&>svg]:text-destructive",
},
},
defaultVariants:{
variant:"default",
},
},
);

constAlert=React.forwardRef<
HTMLDivElement,
React.HTMLAttributes<HTMLDivElement>&VariantProps<typeofalertVariants>
>(({className,variant,...props},ref)=>(
<divref={ref}role="alert"className={cn(alertVariants({variant}),className)}{...props}/>
));
Alert.displayName="Alert";

constAlertTitle=React.forwardRef<HTMLParagraphElement,React.HTMLAttributes<HTMLHeadingElement>>(
({className,...props},ref)=>(
<h5
ref={ref}
className={cn("mb-1font-mediumleading-nonetracking-tight",className)}
{...props}
/>
),
);
AlertTitle.displayName="AlertTitle";

constAlertDescription=React.forwardRef<
HTMLParagraphElement,
React.HTMLAttributes<HTMLParagraphElement>
>(({className,...props},ref)=>(
<divref={ref}className={cn("text-sm[&_p]:leading-relaxed",className)}{...props}/>
));
AlertDescription.displayName="AlertDescription";

export{Alert,AlertTitle,AlertDescription};
