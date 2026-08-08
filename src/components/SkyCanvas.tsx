import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { constellations, stars, deepSky, starColor, TYPE_FAMILY } from "@/data/catalog";
import {
  DEG,
  RAD,
  equatorialToHorizontal,
  localSiderealTime,
  obliquity,
  dayNumber,
} from "@/lib/astro";
import { solarSystemObjects } from "@/lib/sky-objects";
import { useSky } from "@/lib/sky-store";

interface Hit {
  key: string;
  x: number;
  y: number;
  r: number;
}

interface View {
  az: number;
  alt: number;
  fov: number;
}

const MIN_FOV = 4;
const MAX_FOV = 150;

function dirFromAltAz(alt: number, az: number) {
  const ca = Math.cos(alt * DEG);
  return [ca * Math.sin(az * DEG), ca * Math.cos(az * DEG), Math.sin(alt * DEG)];
}

export function SkyCanvas({ compass }: { compass: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const { date, location, select, selected, target, setTarget, showLines, showLabels } = useSky();
  const [view, setView] = useState<View>({ az: 180, alt: 35, fov: 100 });
  const hitsRef = useRef<Hit[]>([]);
  const viewRef = useRef(view);
  viewRef.current = view;
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  const lst = useMemo(
    () => localSiderealTime(date, location.longitude),
    [date, location.longitude],
  );

  // Cible demandée depuis une autre page : on centre la vue dessus.
  useEffect(() => {
    if (!target) return;
    const all = [
      ...deepSky.map((o) => ({ key: `dso:${o.id}`, ra: o.ra, dec: o.dec })),
      ...solarSystemObjects(date).map((o) => ({
        key: o.key,
        ra: o.ra,
        dec: o.dec,
      })),
    ];
    const found = all.find((o) => o.key === target);
    if (found) {
      const h = equatorialToHorizontal({ ra: found.ra, dec: found.dec }, lst, location.latitude);
      setView((v) => ({ az: h.az, alt: h.alt, fov: Math.min(v.fov, 40) }));
      select(target);
    }
    setTarget(null);
  }, [target, date, lst, location.latitude, select, setTarget]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Boussole : orientation de l'appareil
  useEffect(() => {
    if (!compass) return;
    const handler = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
      const heading =
        typeof e.webkitCompassHeading === "number"
          ? e.webkitCompassHeading
          : e.alpha != null
            ? 360 - e.alpha
            : null;
      if (heading == null) return;
      const beta = e.beta ?? 0;
      setView((v) => ({
        ...v,
        az: (heading + 360) % 360,
        alt: Math.max(-20, Math.min(89, beta - 90 + 90 - (90 - beta) * 0 + (beta - 90))),
      }));
    };
    window.addEventListener("deviceorientation", handler as EventListener, true);
    return () => window.removeEventListener("deviceorientation", handler as EventListener, true);
  }, [compass]);

  const projector = useCallback((v: View, w: number, h: number) => {
    const a = v.alt * DEG;
    const A = v.az * DEG;
    const c = [Math.cos(a) * Math.sin(A), Math.cos(a) * Math.cos(A), Math.sin(a)];
    const right = [Math.cos(A), -Math.sin(A), 0];
    const up = [-Math.sin(a) * Math.sin(A), -Math.sin(a) * Math.cos(A), Math.cos(a)];
    const scale = h / 2 / (2 * Math.tan((v.fov * DEG) / 4));
    const cx = w / 2;
    const cy = h / 2;
    return {
      project(dir: number[]) {
        const X = dir[0]! * right[0]! + dir[1]! * right[1]! + dir[2]! * right[2]!;
        const Y = dir[0]! * up[0]! + dir[1]! * up[1]! + dir[2]! * up[2]!;
        const Z = dir[0]! * c[0]! + dir[1]! * c[1]! + dir[2]! * c[2]!;
        if (Z < -0.6) return null;
        const k = 2 / (1 + Z);
        return [cx + X * k * scale, cy - Y * k * scale] as const;
      },
      unproject(px: number, py: number) {
        const X = (px - cx) / scale;
        const Y = -(py - cy) / scale;
        const r = Math.hypot(X, Y);
        const theta = 2 * Math.atan(r / 2);
        if (r === 0) return c;
        const st = Math.sin(theta) / r;
        const ct = Math.cos(theta);
        return [
          ct * c[0]! + st * (X * right[0]! + Y * up[0]!),
          ct * c[1]! + st * (X * right[1]! + Y * up[1]!),
          ct * c[2]! + st * (X * right[2]! + Y * up[2]!),
        ];
      },
    };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w, h } = size;
    if (w === 0 || h === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const v = viewRef.current;
    const { project } = projector(v, w, h);
    const hits: Hit[] = [];
    const lat = location.latitude;

    const sun = solarSystemObjects(date).find((o) => o.key === "sun")!;
    const sunAlt = equatorialToHorizontal({ ra: sun.ra, dec: sun.dec }, lst, lat).alt;
    const dayFactor = Math.max(0, Math.min(1, (sunAlt + 12) / 18));

    // Fond du ciel
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    if (dayFactor > 0.6) {
      grad.addColorStop(0, "#2f6ea8");
      grad.addColorStop(1, "#9dc6e3");
    } else if (dayFactor > 0.05) {
      grad.addColorStop(0, "#0b1734");
      grad.addColorStop(1, "#6b4a63");
    } else {
      grad.addColorStop(0, "#03060f");
      grad.addColorStop(1, "#0a1226");
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const starAlpha = 1 - dayFactor;
    const eq2dir = (ra: number, dec: number) => {
      const hz = equatorialToHorizontal({ ra, dec }, lst, lat);
      return { dir: dirFromAltAz(hz.alt, hz.az), alt: hz.alt, az: hz.az };
    };

    // Écliptique
    ctx.strokeStyle = "rgba(255,196,120,0.25)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    const ecl = obliquity(dayNumber(date));
    let started = false;
    for (let l = 0; l <= 360; l += 2) {
      const ra =
        (Math.atan2(Math.cos(ecl * DEG) * Math.sin(l * DEG), Math.cos(l * DEG)) * RAD + 360) % 360;
      const dec = Math.asin(Math.sin(ecl * DEG) * Math.sin(l * DEG)) * RAD;
      const p = project(eq2dir(ra, dec).dir);
      if (!p) {
        started = false;
        continue;
      }
      if (!started) {
        ctx.moveTo(p[0], p[1]);
        started = true;
      } else ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Lignes de constellation
    if (showLines && starAlpha > 0.15) {
      ctx.strokeStyle = `rgba(122,164,255,${0.32 * starAlpha})`;
      ctx.lineWidth = 1;
      for (const c of constellations) {
        ctx.beginPath();
        for (const seg of c.l) {
          let begun = false;
          for (const [ra, dec] of seg) {
            const p = project(eq2dir(ra!, dec!).dir);
            if (!p) {
              begun = false;
              continue;
            }
            if (!begun) {
              ctx.moveTo(p[0], p[1]);
              begun = true;
            } else ctx.lineTo(p[0], p[1]);
          }
        }
        ctx.stroke();
      }
      if (showLabels) {
        ctx.fillStyle = `rgba(150,180,240,${0.5 * starAlpha})`;
        ctx.font = "500 11px 'IBM Plex Mono', monospace";
        ctx.textAlign = "center";
        for (const c of constellations) {
          const p = project(eq2dir(c.r, c.d).dir);
          if (p) ctx.fillText(c.n.toUpperCase(), p[0], p[1]);
        }
      }
    }

    // Étoiles
    const limitMag = v.fov > 80 ? 5.0 : v.fov > 40 ? 5.4 : 5.6;
    const sizeScale = Math.max(0.8, Math.min(2.6, 70 / v.fov));
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i]!;
      if (s.m > limitMag) continue;
      const { dir, alt } = eq2dir(s.r, s.d);
      if (alt < -2) continue;
      const p = project(dir);
      if (!p) continue;
      if (p[0] < -20 || p[0] > w + 20 || p[1] < -20 || p[1] > h + 20) continue;
      const radius = Math.max(0.5, (6.2 - s.m) * 0.42 * sizeScale);
      ctx.globalAlpha = starAlpha * Math.min(1, (6.4 - s.m) / 2.2);
      ctx.fillStyle = starColor(s.v);
      ctx.beginPath();
      ctx.arc(p[0], p[1], radius, 0, Math.PI * 2);
      ctx.fill();
      if (radius > 2.4) {
        ctx.globalAlpha = starAlpha * 0.25;
        ctx.beginPath();
        ctx.arc(p[0], p[1], radius * 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (radius > 1.6) hits.push({ key: `star:${i}`, x: p[0], y: p[1], r: 10 });
      if (showLabels && s.n && s.m < 2.2 && v.fov < 130) {
        ctx.globalAlpha = starAlpha * 0.8;
        ctx.fillStyle = "rgba(226,235,255,0.85)";
        ctx.font = "500 11px 'IBM Plex Sans', sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(s.n, p[0] + radius + 4, p[1] + 3);
      }
    }
    ctx.globalAlpha = 1;

    // Objets du ciel profond
    for (const o of deepSky) {
      const { dir, alt } = eq2dir(o.ra, o.dec);
      if (alt < -2) continue;
      const p = project(dir);
      if (!p) continue;
      if (p[0] < -30 || p[0] > w + 30 || p[1] < -30 || p[1] > h + 30) continue;
      const family = TYPE_FAMILY[o.type] ?? "nebuleuse";
      const isSel = selected === `dso:${o.id}`;
      const rr = Math.max(4, Math.min(26, ((o.size || 8) / 60) * (h / v.fov) * 0.9));
      ctx.globalAlpha = starAlpha * 0.95;
      ctx.lineWidth = isSel ? 2 : 1.2;
      ctx.strokeStyle = isSel
        ? "#ffc76b"
        : family === "galaxie"
          ? "rgba(196,150,255,0.85)"
          : family === "amas"
            ? "rgba(255,236,168,0.85)"
            : "rgba(120,230,206,0.85)";
      ctx.beginPath();
      if (family === "galaxie") {
        ctx.ellipse(p[0], p[1], rr, rr * 0.55, 0.5, 0, Math.PI * 2);
      } else if (family === "amas") {
        ctx.arc(p[0], p[1], rr, 0, Math.PI * 2);
        ctx.setLineDash([3, 3]);
      } else {
        ctx.rect(p[0] - rr, p[1] - rr * 0.8, rr * 2, rr * 1.6);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      if (showLabels && (v.fov < 60 || (o.mag ?? 12) < 6)) {
        ctx.fillStyle = isSel ? "#ffc76b" : "rgba(210,224,255,0.75)";
        ctx.font = "500 10px 'IBM Plex Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText(o.id, p[0], p[1] - rr - 5);
      }
      hits.push({ key: `dso:${o.id}`, x: p[0], y: p[1], r: Math.max(14, rr) });
    }
    ctx.globalAlpha = 1;

    // Système solaire
    for (const o of solarSystemObjects(date)) {
      const { dir, alt } = eq2dir(o.ra, o.dec);
      if (alt < -3) continue;
      const p = project(dir);
      if (!p) continue;
      const isSel = selected === o.key;
      let rr = 4;
      let color = "#ffe9b0";
      if (o.kind === "sun") {
        rr = Math.max(10, (16 / v.fov) * h * 0.05);
        color = "#ffd873";
      } else if (o.kind === "moon") {
        rr = Math.max(8, (0.52 / v.fov) * h * 0.9);
        color = "#e8ecf5";
      } else {
        rr = Math.max(3.5, 7 - (o.mag ?? 3));
        color = "#ffd0a0";
      }
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = o.kind === "sun" ? 40 : 12;
      ctx.beginPath();
      ctx.arc(p[0], p[1], rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (isSel) {
        ctx.strokeStyle = "#ffc76b";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p[0], p[1], rr + 6, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (showLabels) {
        ctx.fillStyle = "rgba(255,236,200,0.9)";
        ctx.font = "600 11px 'IBM Plex Sans', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(o.name, p[0], p[1] + rr + 14);
      }
      hits.push({ key: o.key, x: p[0], y: p[1], r: Math.max(16, rr + 6) });
    }

    // Horizon et sol
    ctx.beginPath();
    let horizonStarted = false;
    const horizonPts: (readonly [number, number])[] = [];
    for (let az = 0; az <= 360; az += 2) {
      const p = project(dirFromAltAz(0, az));
      if (!p) {
        horizonStarted = false;
        continue;
      }
      horizonPts.push(p);
      if (!horizonStarted) {
        ctx.moveTo(p[0], p[1]);
        horizonStarted = true;
      } else ctx.lineTo(p[0], p[1]);
    }
    ctx.strokeStyle = "rgba(140,170,220,0.55)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Voile du sol : on assombrit tout ce qui est sous l'horizon
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    for (let az = 0; az <= 360; az += 2) {
      const p = project(dirFromAltAz(-0.1, az));
      if (!p) continue;
    }
    ctx.restore();
    for (let az = 0; az < 360; az += 90) {
      const p = project(dirFromAltAz(1.5, az));
      if (!p) continue;
      ctx.fillStyle = "rgba(160,190,235,0.85)";
      ctx.font = "600 13px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(["N", "E", "S", "O"][az / 90]!, p[0], p[1]);
    }

    // Zénith
    const zen = project(dirFromAltAz(90, 0));
    if (zen) {
      ctx.strokeStyle = "rgba(140,170,220,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(zen[0] - 7, zen[1]);
      ctx.lineTo(zen[0] + 7, zen[1]);
      ctx.moveTo(zen[0], zen[1] - 7);
      ctx.lineTo(zen[0], zen[1] + 7);
      ctx.stroke();
    }

    hitsRef.current = hits;
  }, [size, date, lst, location.latitude, selected, showLines, showLabels, projector]);

  useEffect(() => {
    const id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [draw, view]);

  // Zoom molette / pincement (listener non passif)
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const v = viewRef.current;
      const next = Math.max(MIN_FOV, Math.min(MAX_FOV, v.fov * Math.exp(dy * 0.0015)));
      if (next === v.fov) return;
      const rect = el.getBoundingClientRect();
      const { unproject } = projector(v, rect.width, rect.height);
      const dir = unproject(e.clientX - rect.left, e.clientY - rect.top);
      const cursorAlt = Math.asin(Math.max(-1, Math.min(1, dir[2]!))) * RAD;
      const cursorAz = (Math.atan2(dir[0]!, dir[1]!) * RAD + 360) % 360;
      const k = 1 - next / v.fov;
      const dAz = ((cursorAz - v.az + 540) % 360) - 180;
      setView({
        fov: next,
        az: (v.az + dAz * k + 360) % 360,
        alt: Math.max(-30, Math.min(89, v.alt + (cursorAlt - v.alt) * k)),
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [projector]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (compass) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    d.x = e.clientX;
    d.y = e.clientY;
    setView((v) => {
      const perPx = v.fov / size.h;
      return {
        ...v,
        az: (v.az - dx * perPx + 360) % 360,
        alt: Math.max(-30, Math.min(89, v.alt + dy * perPx)),
      };
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.moved) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best: Hit | null = null;
    let bestDist = Infinity;
    for (const hit of hitsRef.current) {
      const dist = Math.hypot(hit.x - x, hit.y - y);
      if (dist < hit.r && dist < bestDist) {
        best = hit;
        bestDist = dist;
      }
    }
    select(best ? best.key : null);
  };

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (dragRef.current = null)}
      />
      <div className="pointer-events-none absolute bottom-3 left-3 font-mono text-[11px] uppercase tracking-widest text-foreground/40">
        {Math.round(view.az)}° az · {Math.round(view.alt)}° h · champ {Math.round(view.fov)}°
      </div>
    </div>
  );
}
