import { Directive, ElementRef, OnDestroy, OnInit } from '@angular/core';

@Directive({ selector: '[pulseParticlesBg]' })
export class ParticlesBgDirective implements OnInit, OnDestroy {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private animFrameId = 0;
  private ro?: ResizeObserver;
  private particles: Particle[] = [];

  constructor(private el: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'block',
      pointerEvents: 'none',
      zIndex: '1',
    });
    const host = this.el.nativeElement;
    if (getComputedStyle(host).position === 'static') {
      host.style.position = 'relative';
    }
    host.prepend(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.syncSize();

    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => { this.syncSize(); this.spawnParticles(); });
      this.ro.observe(this.canvas);
    }

    this.spawnParticles();
    this.animate();
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animFrameId);
    this.ro?.disconnect();
    this.canvas?.remove();
  }

  private syncSize(): void {
    const w = this.canvas.clientWidth || 800;
    const h = this.canvas.clientHeight || 400;
    this.canvas.width = w;
    this.canvas.height = h;
  }

  private spawnParticles(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.particles = Array.from({ length: 50 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      size: Math.random() * 2 + 0.5,
      alpha: Math.random() * 0.4 + 0.05,
    }));
  }

  private animate = (): void => {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = w;
      if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h;
      if (p.y > h) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(247, 172, 255, ${p.alpha})`;
      ctx.fill();
    }

    this.animFrameId = requestAnimationFrame(this.animate);
  };
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number; alpha: number;
}
