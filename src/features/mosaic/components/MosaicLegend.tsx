export function MosaicLegend() {
  const items = [
    ["border-slate-500", "Zone non couverte"],
    ["border-cyan-400 bg-cyan-400/20", "Contribution validée"],
    ["border-amber-400 bg-amber-400/20", "Cellule sélectionnée"],
    ["border-violet-400 bg-violet-400/20", "Attribution contestée"],
  ];
  return (
    <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
      {items.map(([style, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={`size-3 rounded-sm border ${style}`} aria-hidden="true" />
          {label}
        </span>
      ))}
    </div>
  );
}
