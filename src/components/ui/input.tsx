import*asReactfrom"react";

import{cn}from"@/lib/utils";

constInput=React.forwardRef<HTMLInputElement,React.ComponentProps<"input">>(
({className,type,...props},ref)=>{
return(
<input
type={type}
className={cn(
"flexh-9w-fullrounded-mdborderborder-inputbg-transparentpx-3py-1text-baseshadow-smtransition-colorsfile:border-0file:bg-transparentfile:text-smfile:font-mediumfile:text-foregroundplaceholder:text-muted-foregroundfocus-visible:outline-nonefocus-visible:ring-1focus-visible:ring-ringdisabled:cursor-not-alloweddisabled:opacity-50md:text-sm",
className,
)}
ref={ref}
{...props}
/>
);
},
);
Input.displayName="Input";

export{Input};
