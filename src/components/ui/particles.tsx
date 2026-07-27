"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ParticlesProps {
  className?: string;
  quantity?: number;
  staticity?: number;
  ease?: number;
  size?: number;
  refresh?: boolean;
  color?: string;
  vx?: number;
  vy?: number;
}

function hexToRgb(hex: string): number[] {
  hex = hex.replace("#", "");
  if (hex.length === 3)
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

type Circle = {
  x: number;
  y: number;
  translateX: number;
  translateY: number;
  size: number;
  alpha: number;
  targetAlpha: number;
  dx: number;
  dy: number;
  magnetism: number;
};

export const Particles: React.FC<ParticlesProps> = ({
  className = "",
  quantity = 100,
  staticity = 50,
  ease = 50,
  size = 0.5,
  refresh = false,
  color = "#ffffff",
  vx = 0,
  vy = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const circles = useRef<Circle[]>([]);
  const mouse = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const mouseTarget = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const canvasSize = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const rafID = useRef<number | null>(null);
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio : 1;
  const [rgb] = useState<number[]>(() => hexToRgb(color));

  useEffect(() => {
    if (canvasRef.current) ctxRef.current = canvasRef.current.getContext("2d");
    init();
    window.addEventListener("resize", init);
    const handleMove = (e: MouseEvent) => {
      if (!canvasContainerRef.current) return;
      const r = canvasContainerRef.current.getBoundingClientRect();
      mouseTarget.current.x = e.clientX - r.left - r.width / 2;
      mouseTarget.current.y = e.clientY - r.top - r.height / 2;
    };
    window.addEventListener("mousemove", handleMove);
    return () => {
      window.removeEventListener("resize", init);
      window.removeEventListener("mousemove", handleMove);
      if (rafID.current != null) cancelAnimationFrame(rafID.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color]);

  useEffect(() => {
    init(); /* eslint-disable-next-line */
  }, [refresh]);

  const resize = () => {
    if (!canvasContainerRef.current || !canvasRef.current || !ctxRef.current) return;
    const c = canvasContainerRef.current;
    canvasSize.current.w = c.offsetWidth;
    canvasSize.current.h = c.offsetHeight;
    canvasRef.current.width = c.offsetWidth * dpr;
    canvasRef.current.height = c.offsetHeight * dpr;
    canvasRef.current.style.width = c.offsetWidth + "px";
    canvasRef.current.style.height = c.offsetHeight + "px";
    ctxRef.current.scale(dpr, dpr);
  };

  const createCircle = (): Circle => {
    const x = Math.floor(Math.random() * canvasSize.current.w);
    const y = Math.floor(Math.random() * canvasSize.current.h);
    return {
      x,
      y,
      translateX: 0,
      translateY: 0,
      size: Math.floor(Math.random() * 2) + size,
      alpha: 0,
      targetAlpha: parseFloat((Math.random() * 0.6 + 0.1).toFixed(1)),
      dx: (Math.random() - 0.5) * 0.1,
      dy: (Math.random() - 0.5) * 0.1,
      magnetism: 0.1 + Math.random() * 4,
    };
  };

  const drawCircle = (c: Circle, update = false) => {
    if (!ctxRef.current) return;
    const { x, y, translateX, translateY, size: s, alpha } = c;
    ctxRef.current.translate(translateX, translateY);
    ctxRef.current.beginPath();
    ctxRef.current.arc(x, y, s, 0, 2 * Math.PI);
    ctxRef.current.fillStyle = `rgba(${rgb.join(",")},${alpha})`;
    ctxRef.current.fill();
    ctxRef.current.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!update) circles.current.push(c);
  };

  const init = () => {
    if (!ctxRef.current) return;
    resize();
    circles.current = [];
    ctxRef.current.clearRect(0, 0, canvasSize.current.w, canvasSize.current.h);
    for (let i = 0; i < quantity; i++) drawCircle(createCircle());
    if (rafID.current == null) animate();
  };

  const animate = () => {
    if (!ctxRef.current) return;
    ctxRef.current.clearRect(0, 0, canvasSize.current.w, canvasSize.current.h);
    mouse.current.x += (mouseTarget.current.x - mouse.current.x) / ease;
    mouse.current.y += (mouseTarget.current.y - mouse.current.y) / ease;
    circles.current.forEach((c, i) => {
      const edge = [
        c.x + c.translateX,
        canvasSize.current.w - c.x - c.translateX,
        c.y + c.translateY,
        canvasSize.current.h - c.y - c.translateY,
      ];
      const closest = Math.min(...edge);
      const a = parseFloat((closest / 20).toFixed(2));
      if (a > 1) c.alpha += 0.02;
      else c.alpha = c.targetAlpha * a;
      c.x += c.dx + vx;
      c.y += c.dy + vy;
      c.translateX += (mouse.current.x / (staticity / c.magnetism) - c.translateX) / ease;
      c.translateY += (mouse.current.y / (staticity / c.magnetism) - c.translateY) / ease;
      drawCircle(c, true);
      if (
        c.x < -c.size ||
        c.x > canvasSize.current.w + c.size ||
        c.y < -c.size ||
        c.y > canvasSize.current.h + c.size
      ) {
        circles.current.splice(i, 1);
        drawCircle(createCircle());
      }
    });
    rafID.current = requestAnimationFrame(animate);
  };

  return (
    <div
      ref={canvasContainerRef}
      className={cn("pointer-events-none", className)}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} />
    </div>
  );
};
