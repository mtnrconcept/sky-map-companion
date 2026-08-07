import*asReactfrom"react";

import{cn}from"@/lib/utils";

constTextarea=React.forwardRef<HTMLTextAreaElement,React.ComponentProps<"textarea">>(
({className,...props},ref)=>{
return(
<textarea
className={cn(
"flexmin-h-[60px]w-fullrounded-mdborderborder-inputbg-transparentpx-3py-2text-baseshadow-smplaceholder:text-muted-foregroundfocus-visible:outline-nonefocus-visible:ring-1focus-visible:ring-ringdisabled:cursor-not-alloweddisabled:opacity-50md:text-sm",
className,
)}
ref={ref}
{...props}
/>
);
},
);
Textarea.displayName="Textarea";

export{Textarea};
