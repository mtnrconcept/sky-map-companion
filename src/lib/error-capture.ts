//CapturestheoriginalErrorout-of-bandsoserver.tscanrecoverthestack
//whenh3hasalreadyswallowedthethrowintoageneric500Response.

letlastCapturedError:{error:unknown;at:number}|undefined;
constTTL_MS=5_000;

functionrecord(error:unknown){
lastCapturedError={error,at:Date.now()};
}

//h3'sHTTPErrorserializesto{"status":500,"unhandled":true,"message":"HTTPError"}—
//nostack,nocause—soaplainconsole.error(error)reachesthelogpipelinewith
//thefailuredetailstripped.ExpandError-likeargsintoastringthatkeepsthe
//message,stack,andthefullcausechain.
constCAUSE_DEPTH_LIMIT=5;
constDESCRIPTION_LENGTH_LIMIT=8_000;

exportfunctiondescribeError(error:unknown):string{
constparts:string[]=[];
letcurrent:unknown=error;
for(letdepth=0;depth<CAUSE_DEPTH_LIMIT&&current!=null;depth++){
if(!(currentinstanceofError)){
parts.push(typeofcurrent==="string"?current:safeStringify(current));
break;
}
constlabel=depth===0?"":"causedby:";
conststatus=describeStatus(current);
parts.push(`${label}${current.stack??`${current.name}:${current.message}`}${status}`);
current=current.cause;
}
returnparts.join("\n").slice(0,DESCRIPTION_LENGTH_LIMIT);
}

functiondescribeStatus(error:Error):string{
const{status,statusCode}=erroras{status?:unknown;statusCode?:unknown};
constvalue=status??statusCode;
returntypeofvalue==="number"?`(status${value})`:"";
}

functionsafeStringify(value:unknown):string{
try{
returnJSON.stringify(value)??String(value);
}catch{
returnString(value);
}
}

functionisErrorLike(value:unknown):valueisError{
returnvalueinstanceofError;
}

//Wrapconsole.errorsoerrorsloggedbyanylayer—includingh3'sinternal
//unhandled-errorlogging,whichthisfilecannothookdirectly—areboth
//recordedforconsumeLastCapturedErrorandexpandedbeforeserialization.
constoriginalConsoleError=console.error.bind(console);
console.error=(...args:unknown[])=>{
constexpanded=args.map((arg)=>{
if(!isErrorLike(arg))returnarg;
record(arg);
returndescribeError(arg);
});
originalConsoleError(...expanded);
};

if(typeofglobalThis.addEventListener==="function"){
globalThis.addEventListener("error",(event)=>record((eventasErrorEvent).error??event));
globalThis.addEventListener("unhandledrejection",(event)=>
record((eventasPromiseRejectionEvent).reason),
);
}

exportfunctionconsumeLastCapturedError():unknown{
if(!lastCapturedError)returnundefined;
if(Date.now()-lastCapturedError.at>TTL_MS){
lastCapturedError=undefined;
returnundefined;
}
const{error}=lastCapturedError;
lastCapturedError=undefined;
returnerror;
}
