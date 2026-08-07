import*asReactfrom"react";
import{OTPInput,OTPInputContext}from"input-otp";
import{Minus}from"lucide-react";

import{cn}from"@/lib/utils";

constInputOTP=React.forwardRef<
React.ElementRef<typeofOTPInput>,
React.ComponentPropsWithoutRef<typeofOTPInput>
>(({className,containerClassName,...props},ref)=>(
<OTPInput
ref={ref}
containerClassName={cn(
"flexitems-centergap-2has-[:disabled]:opacity-50",
containerClassName,
)}
className={cn("disabled:cursor-not-allowed",className)}
{...props}
/>
));
InputOTP.displayName="InputOTP";

constInputOTPGroup=React.forwardRef<
React.ElementRef<"div">,
React.ComponentPropsWithoutRef<"div">
>(({className,...props},ref)=>(
<divref={ref}className={cn("flexitems-center",className)}{...props}/>
));
InputOTPGroup.displayName="InputOTPGroup";

constInputOTPSlot=React.forwardRef<
React.ElementRef<"div">,
React.ComponentPropsWithoutRef<"div">&{index:number}
>(({index,className,...props},ref)=>{
constinputOTPContext=React.useContext(OTPInputContext);
const{char,hasFakeCaret,isActive}=inputOTPContext.slots[index]??{
char:null,
hasFakeCaret:false,
isActive:false,
};

return(
<div
ref={ref}
className={cn(
"relativeflexh-9w-9items-centerjustify-centerborder-yborder-rborder-inputtext-smshadow-smtransition-allfirst:rounded-l-mdfirst:border-llast:rounded-r-md",
isActive&&"z-10ring-1ring-ring",
className,
)}
{...props}
>
{char}
{hasFakeCaret&&(
<divclassName="pointer-events-noneabsoluteinset-0flexitems-centerjustify-center">
<divclassName="h-4w-pxanimate-caret-blinkbg-foregroundduration-1000"/>
</div>
)}
</div>
);
});
InputOTPSlot.displayName="InputOTPSlot";

constInputOTPSeparator=React.forwardRef<
React.ElementRef<"div">,
React.ComponentPropsWithoutRef<"div">
>(({...props},ref)=>(
<divref={ref}role="separator"{...props}>
<Minus/>
</div>
));
InputOTPSeparator.displayName="InputOTPSeparator";

export{InputOTP,InputOTPGroup,InputOTPSlot,InputOTPSeparator};
