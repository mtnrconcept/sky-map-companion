import{cn}from"@/lib/utils";

functionSkeleton({className,...props}:React.HTMLAttributes<HTMLDivElement>){
return<divclassName={cn("animate-pulserounded-mdbg-primary/10",className)}{...props}/>;
}

export{Skeleton};
