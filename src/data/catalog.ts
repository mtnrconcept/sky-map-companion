importstarsRawfrom"./stars.json";
importconstellationsRawfrom"./constellations.json";
importdsoRawfrom"./dso.json";

exportinterfaceStar{
/**ascensiondroiteendegrés*/
r:number;
/**déclinaisonendegrés*/
d:number;
/**magnitudeapparente*/
m:number;
/**nompropre*/
n:string;
/**lettredeBayer*/
b:string;
/**abréviationdelaconstellation*/
c:string;
/**indicedecouleurB-V*/
v:string;
}

exportinterfaceConstellationShape{
id:string;
n:string;
r:number;
d:number;
l:number[][][];
}

exporttypeDsoType=
|"gc"
|"oc"
|"pn"
|"snr"
|"sfr"
|"rn"
|"s"
|"e"
|"i"
|"pos"
|"g"
|"dn";

exporttypeInstrument=
|"oeil-nu"
|"jumelles"
|"petit-telescope"
|"telescope";

exportinterfaceDeepSkyObject{
id:string;
name:string;
designation:string;
type:DsoType;
mag:number|null;
size:number;
dim:string;
ra:number;
dec:number;
con:string;
instrument:Instrument;
description:string;
catalog:string;
}

exportconststars=starsRawasStar[];
exportconstconstellations=constellationsRawasConstellationShape[];
exportconstdeepSky=dsoRawasDeepSkyObject[];

exportconstconstellationNames:Record<string,string>=Object.fromEntries(
constellations.map((c)=>[c.id,c.n]),
);

exportconstTYPE_LABELS:Record<string,string>={
gc:"Amasglobulaire",
oc:"Amasouvert",
pn:"Nébuleuseplanétaire",
snr:"Rémanentdesupernova",
sfr:"Nébuleusediffuse",
rn:"Nébuleuseparréflexion",
s:"Galaxiespirale",
e:"Galaxieelliptique",
i:"Galaxieirrégulière",
g:"Galaxie",
pos:"Astérisme",
dn:"Nébuleuseobscure",
};

exportconstTYPE_FAMILY:Record<string,"nebuleuse"|"galaxie"|"amas">={
gc:"amas",
oc:"amas",
pos:"amas",
pn:"nebuleuse",
snr:"nebuleuse",
sfr:"nebuleuse",
rn:"nebuleuse",
dn:"nebuleuse",
s:"galaxie",
e:"galaxie",
i:"galaxie",
g:"galaxie",
};

exportconstINSTRUMENT_LABELS:Record<Instrument,string>={
"oeil-nu":"Àl'œilnu",
jumelles:"Auxjumelles",
"petit-telescope":"Petittélescope(100mm)",
telescope:"Télescope(200mm)",
};

exportconstdeepSkyById=newMap(deepSky.map((o)=>[o.id,o]));

/**Étoilesnommées,utiliséespourlarechercheetlesétiquettes.*/
exportconstnamedStars=stars.filter((s)=>s.n);

/**Couleurd'uneétoileàpartirdesonindiceB-V.*/
exportfunctionstarColor(bv:string):string{
constv=Number.parseFloat(bv);
if(!Number.isFinite(v))return"#f4f7ff";
if(v<-0.1)return"#a7c3ff";
if(v<0.2)return"#cbdcff";
if(v<0.5)return"#f2f4ff";
if(v<0.9)return"#fff4de";
if(v<1.4)return"#ffd9a8";
return"#ffb37a";
}
