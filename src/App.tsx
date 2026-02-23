/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Skull, Play, RotateCcw, Info, Languages, Target, ShieldAlert, Zap, MousePointer2, AlertTriangle } from 'lucide-react';

// --- Types & Constants ---

type GameState = 'START' | 'PLAYING' | 'WON' | 'LOST' | 'ROUND_OVER';
type GameMode = 'CLASSIC' | 'ENDLESS';

interface Point {
  x: number;
  y: number;
}

interface Rocket {
  id: number;
  start: Point;
  end: Point;
  current: Point;
  speed: number;
  color: string;
}

interface Interceptor {
  id: number;
  start: Point;
  target: Point;
  current: Point;
  speed: number;
  turretIndex: number;
}

interface Explosion {
  id: number;
  pos: Point;
  radius: number;
  maxRadius: number;
  growing: boolean;
  alpha: number;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}

interface Warning {
  id: number;
  x: number;
  life: number;
}

interface Turret {
  x: number;
  y: number;
  ammo: number;
  maxAmmo: number;
  active: boolean;
}

interface City {
  x: number;
  y: number;
  active: boolean;
}

const WIN_SCORE = 1000;
const ROCKET_SCORE = 20;
const EXPLOSION_SPEED = 1.8;
const EXPLOSION_MAX_RADIUS = 75; // Increased for "1cm" feel (~150px diameter)
const INTERCEPTOR_SPEED = 9;
const ROCKET_BASE_SPEED = 1.2;

// --- Colors (Pink Theme) ---
const COLORS = {
  bg: '#ffe4f1', // Soft Pink Background
  ground: '#ffb6c1', // Light Pink Ground
  city: '#ff007f', // Bright Pink
  turret: '#9d00ff', // Vivid Purple
  rocket: '#d000ff', // Purple-Magenta for contrast on pink
  interceptor: '#00b7ff', // Blue for contrast
  explosionInner: '#ffffff',
  explosionMid: '#ff00ff',
  explosionOuter: '#9d00ff',
};

// --- Translations ---

const TRANSLATIONS = {
  en: {
    title: "Soo Nova Defense",
    start: "Engage Defense",
    win: "Mission Accomplished!",
    loss: "Defeat: All Turrets Destroyed",
    score: "Score",
    ammo: "Ammo",
    playAgain: "Try Again",
    rule1: "Rockets fall from the top of the screen. Watch the pink lines!",
    rule2: "Click to fire interceptors. They explode exactly where you click.",
    rule3: "Predict the path! Aim at where the rocket will be, not where it is.",
    rule4: "Watch the '!' warnings at the top for incoming threats.",
    round: "Wave",
    victory: "Victory!",
    gameOver: "Game Over",
    howToPlay: "How to Play",
    classicMode: "Classic Mode",
    endlessMode: "Endless Mode",
    highScore: "High Score",
    targetScore: "Target",
    endlessRule: "Ammo refills every 800 points. Survive as long as you can!",
  },
  zh: {
    title: "Soo新星防御",
    start: "启动防御系统",
    win: "任务完成！",
    loss: "失败：所有炮台已被摧毁",
    score: "得分",
    ammo: "弹药",
    playAgain: "再玩一次",
    rule1: "敌方火箭从屏幕顶部（上方）落下。注意观察粉色线条！",
    rule2: "点击屏幕发射拦截弹。导弹会在你点击的位置产生爆炸。",
    rule3: "预判瞄准！火箭在向下移动，请瞄准它们路径的前方。",
    rule4: "屏幕上方出现 '!' 警告时，表示该位置即将有火箭落下。",
    round: "波次",
    victory: "胜利！",
    gameOver: "游戏结束",
    howToPlay: "作战指南",
    classicMode: "经典模式",
    endlessMode: "无尽模式",
    highScore: "最高分",
    targetScore: "目标",
    endlessRule: "每获得800分，弹药将自动补满。挑战你的极限！",
  }
};

export default function App() {
  const [lang, setLang] = useState<'en' | 'zh'>('zh');
  const t = TRANSLATIONS[lang];

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [gameState, setGameState] = useState<GameState>('START');
  const [gameMode, setGameMode] = useState<GameMode>('CLASSIC');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('soo_nova_high_score');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [round, setRound] = useState(1);
  const [shake, setShake] = useState(0);
  const hasRefilledAt500 = useRef(false);
  const lastRefillScore = useRef(0);
  
  // Game Objects Refs
  const rocketsRef = useRef<Rocket[]>([]);
  const interceptorsRef = useRef<Interceptor[]>([]);
  const explosionsRef = useRef<Explosion[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const warningsRef = useRef<Warning[]>([]);
  const turretsRef = useRef<Turret[]>([
    { x: 0, y: 0, ammo: 20, maxAmmo: 20, active: true },
    { x: 0, y: 0, ammo: 40, maxAmmo: 40, active: true },
    { x: 0, y: 0, ammo: 20, maxAmmo: 20, active: true },
  ]);
  const citiesRef = useRef<City[]>([]);
  const nextRocketTimeRef = useRef<number>(0);

  const initLayout = useCallback((width: number, height: number) => {
    const groundY = height - 40;
    turretsRef.current = [
      { x: 60, y: groundY, ammo: 20, maxAmmo: 20, active: true },
      { x: width / 2, y: groundY, ammo: 40, maxAmmo: 40, active: true },
      { x: width - 60, y: groundY, ammo: 20, maxAmmo: 20, active: true },
    ];
    const cityPositions = [
      width * 0.18, width * 0.28, width * 0.38,
      width * 0.62, width * 0.72, width * 0.82
    ];
    citiesRef.current = cityPositions.map(x => ({ x, y: groundY, active: true }));
  }, []);

  const createParticles = (x: number, y: number, color: string, count: number) => {
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        id: Math.random(),
        x, y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        life: 1,
        color,
        size: Math.random() * 4 + 1
      });
    }
  };

  const addFloatingText = (x: number, y: number, text: string, color: string) => {
    floatingTextsRef.current.push({
      id: Math.random(),
      x, y, text, life: 1, color
    });
  };

  const triggerShake = (amount: number) => {
    setShake(amount);
  };

  const startGame = (mode: GameMode) => {
    setScore(0);
    setRound(1);
    setGameMode(mode);
    hasRefilledAt500.current = false;
    lastRefillScore.current = 0;
    rocketsRef.current = [];
    interceptorsRef.current = [];
    explosionsRef.current = [];
    particlesRef.current = [];
    floatingTextsRef.current = [];
    warningsRef.current = [];
    
    if (containerRef.current) {
      const { clientWidth, clientHeight } = containerRef.current;
      initLayout(clientWidth, clientHeight);
    }
    setGameState('PLAYING');
  };

  const spawnRocket = (width: number) => {
    const startX = Math.random() * width;
    const targets = [...citiesRef.current.filter(c => c.active), ...turretsRef.current.filter(t => t.active)];
    if (targets.length === 0) return;
    const target = targets[Math.floor(Math.random() * targets.length)];
    
    // Add warning before spawning
    warningsRef.current.push({
      id: Math.random(),
      x: startX,
      life: 1.0
    });

    rocketsRef.current.push({
      id: Math.random(),
      start: { x: startX, y: 0 },
      end: { x: target.x, y: target.y },
      current: { x: startX, y: 0 },
      speed: ROCKET_BASE_SPEED + (round * 0.15),
      color: COLORS.rocket
    });
  };

  const handleCanvasClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (gameState !== 'PLAYING') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    let bestTurretIndex = -1;
    let minDist = Infinity;
    turretsRef.current.forEach((turret, index) => {
      if (turret.active && turret.ammo > 0) {
        const dist = Math.sqrt(Math.pow(turret.x - x, 2) + Math.pow(turret.y - y, 2));
        if (dist < minDist) {
          minDist = dist;
          bestTurretIndex = index;
        }
      }
    });

    if (bestTurretIndex !== -1) {
      const turret = turretsRef.current[bestTurretIndex];
      turret.ammo--;
      interceptorsRef.current.push({
        id: Math.random(),
        start: { x: turret.x, y: turret.y },
        target: { x, y },
        current: { x: turret.x, y: turret.y },
        speed: INTERCEPTOR_SPEED,
        turretIndex: bestTurretIndex
      });
    }
  };

  const update = (time: number) => {
    if (gameState !== 'PLAYING') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = canvas;

    if (shake > 0) setShake(s => Math.max(0, s - 0.5));

    if (time > nextRocketTimeRef.current) {
      spawnRocket(width);
      nextRocketTimeRef.current = time + Math.max(400, 2000 - (round * 150));
    }

    rocketsRef.current = rocketsRef.current.filter(rocket => {
      const dx = rocket.end.x - rocket.start.x;
      const dy = rocket.end.y - rocket.start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      rocket.current.x += (dx / dist) * rocket.speed;
      rocket.current.y += (dy / dist) * rocket.speed;

      if (rocket.current.y >= rocket.end.y) {
        explosionsRef.current.push({
          id: Math.random(), pos: { ...rocket.current }, radius: 2, maxRadius: 55, growing: true, alpha: 1
        });
        createParticles(rocket.current.x, rocket.current.y, COLORS.rocket, 20);
        triggerShake(12);

        citiesRef.current.forEach(city => {
          if (city.active && Math.abs(city.x - rocket.current.x) < 25) city.active = false;
        });
        turretsRef.current.forEach(turret => {
          if (turret.active && Math.abs(turret.x - rocket.current.x) < 25) turret.active = false;
        });
        return false;
      }
      return true;
    });

    interceptorsRef.current = interceptorsRef.current.filter(inter => {
      const dx = inter.target.x - inter.start.x;
      const dy = inter.target.y - inter.start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      inter.current.x += (dx / dist) * inter.speed;
      inter.current.y += (dy / dist) * inter.speed;

      if (inter.current.y <= inter.target.y) {
        explosionsRef.current.push({
          id: Math.random(), pos: { ...inter.target }, radius: 2, maxRadius: EXPLOSION_MAX_RADIUS, growing: true, alpha: 1
        });
        return false;
      }
      return true;
    });

    explosionsRef.current = explosionsRef.current.filter(exp => {
      if (exp.growing) {
        exp.radius += EXPLOSION_SPEED;
        if (exp.radius >= exp.maxRadius) exp.growing = false;
      } else {
        exp.radius -= EXPLOSION_SPEED * 0.4;
        exp.alpha -= 0.02;
      }

      rocketsRef.current = rocketsRef.current.filter(rocket => {
        const dx = rocket.current.x - exp.pos.x;
        const dy = rocket.current.y - exp.pos.y;
        if (Math.sqrt(dx * dx + dy * dy) < exp.radius) {
          setScore(s => s + ROCKET_SCORE);
          addFloatingText(rocket.current.x, rocket.current.y, `+${ROCKET_SCORE}`, COLORS.city);
          createParticles(rocket.current.x, rocket.current.y, '#fff', 10);
          explosionsRef.current.push({
            id: Math.random(), pos: { ...rocket.current }, radius: 2, maxRadius: EXPLOSION_MAX_RADIUS, growing: true, alpha: 1
          });
          return false;
        }
        return true;
      });
      return exp.radius > 0 && exp.alpha > 0;
    });

    particlesRef.current = particlesRef.current.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.02;
      return p.life > 0;
    });

    floatingTextsRef.current = floatingTextsRef.current.filter(t => {
      t.y -= 1;
      t.life -= 0.02;
      return t.life > 0;
    });

    warningsRef.current = warningsRef.current.filter(w => {
      w.life -= 0.02;
      return w.life > 0;
    });

    // Ammo refill at 500 points (Universe transition)
    if (score >= 500 && !hasRefilledAt500.current) {
      turretsRef.current.forEach(t => {
        if (t.active) {
          t.ammo = t.maxAmmo;
          addFloatingText(t.x, t.y - 40, "AMMO REFILLED!", COLORS.turret);
        }
      });
      addFloatingText(width / 2, height / 2, "UNIVERSE MODE ACTIVATED!", "#ff007f");
      hasRefilledAt500.current = true;
      triggerShake(10);
    }

    // Endless Mode Refill every 800 points
    if (gameMode === 'ENDLESS' && score > 0 && score % 800 === 0 && score !== lastRefillScore.current) {
      turretsRef.current.forEach(t => {
        if (t.active) {
          t.ammo = t.maxAmmo;
          addFloatingText(t.x, t.y - 40, "800PT REFILL!", COLORS.turret);
        }
      });
      lastRefillScore.current = score;
      triggerShake(8);
    }

    if (gameMode === 'CLASSIC' && score >= WIN_SCORE) {
      setGameState('WON');
    } else if (turretsRef.current.every(t => !t.active)) {
      if (score > highScore) {
        setHighScore(score);
        localStorage.setItem('soo_nova_high_score', score.toString());
      }
      setGameState('LOST');
    }

    if (rocketsRef.current.length === 0 && turretsRef.current.every(t => t.ammo === 0) && interceptorsRef.current.length === 0) {
      turretsRef.current.forEach(t => { if (t.active) t.ammo = t.maxAmmo; });
      setRound(r => r + 1);
    }
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvas;

    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    if (score < 500) {
      // Simple Pink Background for Early Game
      ctx.fillStyle = '#ffe4f1';
      ctx.fillRect(0, 0, width, height);
      
      // Subtle grid for "tech" feel
      ctx.strokeStyle = 'rgba(255, 0, 127, 0.05)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 50) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = 0; y < height; y += 50) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
    } else {
      // Pink Vast Universe Background for Late Game
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#1a0514'); // Deep dark space
      bgGrad.addColorStop(0.5, '#4a0e2e'); // Nebula pink-purple
      bgGrad.addColorStop(1, '#1a0514');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Nebula Glows
      const nebulaGrad = ctx.createRadialGradient(width * 0.7, height * 0.3, 0, width * 0.7, height * 0.3, 300);
      nebulaGrad.addColorStop(0, 'rgba(255, 0, 127, 0.15)');
      nebulaGrad.addColorStop(1, 'rgba(255, 0, 127, 0)');
      ctx.fillStyle = nebulaGrad;
      ctx.fillRect(0, 0, width, height);

      // Stars
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 150; i++) {
        const x = (Math.sin(i * 123.45) * 0.5 + 0.5) * width;
        const y = (Math.cos(i * 678.90) * 0.5 + 0.5) * height;
        const size = (Math.sin(i + Date.now() * 0.001) * 0.5 + 0.5) * 1.5 + 0.5;
        ctx.globalAlpha = (Math.sin(i + Date.now() * 0.002) * 0.3 + 0.7);
        ctx.fillRect(x, y, size, size);
      }
      ctx.globalAlpha = 1;
    }

    // Ground
    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0, height - 40, width, 40);

    // Warnings
    warningsRef.current.forEach(w => {
      ctx.fillStyle = `rgba(255, 0, 255, ${w.life})`;
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', w.x, 30);
      
      ctx.strokeStyle = `rgba(255, 0, 255, ${w.life * 0.3})`;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(w.x, 40);
      ctx.lineTo(w.x, height);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Cities
    citiesRef.current.forEach(city => {
      if (city.active) {
        ctx.fillStyle = COLORS.city;
        ctx.fillRect(city.x - 12, city.y - 18, 24, 18);
        ctx.fillStyle = '#fff';
        ctx.fillRect(city.x - 8, city.y - 14, 4, 4);
        ctx.fillRect(city.x + 4, city.y - 14, 4, 4);
        // Glow
        ctx.shadowBlur = 10;
        ctx.shadowColor = COLORS.city;
        ctx.strokeRect(city.x - 12, city.y - 18, 24, 18);
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = '#222';
        ctx.fillRect(city.x - 12, city.y - 4, 24, 4);
      }
    });

    // Turrets
    turretsRef.current.forEach(turret => {
      if (turret.active) {
        ctx.fillStyle = COLORS.turret;
        ctx.beginPath();
        ctx.arc(turret.x, turret.y, 18, Math.PI, 0);
        ctx.fill();
        ctx.strokeStyle = COLORS.turret;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(turret.x, turret.y - 8);
        ctx.lineTo(turret.x, turret.y - 25);
        ctx.stroke();

        // Ammo Dots
        const dotSize = 3;
        const dotsPerRow = 10;
        for (let i = 0; i < turret.ammo; i++) {
          const row = Math.floor(i / dotsPerRow);
          const col = i % dotsPerRow;
          ctx.fillStyle = COLORS.turret;
          ctx.fillRect(turret.x - (dotsPerRow * dotSize) / 2 + col * (dotSize + 2), turret.y + 10 + row * (dotSize + 2), dotSize, dotSize);
        }
      } else {
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.arc(turret.x, turret.y, 12, Math.PI, 0);
        ctx.fill();
      }
    });

    // Rockets
    rocketsRef.current.forEach(rocket => {
      ctx.strokeStyle = `rgba(255, 0, 255, 0.5)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rocket.start.x, rocket.start.y);
      ctx.lineTo(rocket.current.x, rocket.current.y);
      ctx.stroke();
      
      ctx.fillStyle = COLORS.rocket;
      ctx.shadowBlur = 15;
      ctx.shadowColor = COLORS.rocket;
      ctx.beginPath();
      ctx.arc(rocket.current.x, rocket.current.y, 7, 0, Math.PI * 2); // Doubled from 3.5 to 7
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Interceptors
    interceptorsRef.current.forEach(inter => {
      ctx.strokeStyle = COLORS.interceptor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(inter.start.x, inter.start.y);
      ctx.lineTo(inter.current.x, inter.current.y);
      ctx.stroke();
      
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      const s = 6;
      ctx.beginPath();
      ctx.moveTo(inter.target.x - s, inter.target.y - s); ctx.lineTo(inter.target.x + s, inter.target.y + s);
      ctx.moveTo(inter.target.x + s, inter.target.y - s); ctx.lineTo(inter.target.x - s, inter.target.y + s);
      ctx.stroke();
    });

    // Particles
    particlesRef.current.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    });
    ctx.globalAlpha = 1;

    // Explosions
    explosionsRef.current.forEach(exp => {
      const grad = ctx.createRadialGradient(exp.pos.x, exp.pos.y, 0, exp.pos.x, exp.pos.y, exp.radius);
      grad.addColorStop(0, `rgba(255, 255, 255, ${exp.alpha})`);
      grad.addColorStop(0.3, `rgba(255, 0, 255, ${exp.alpha})`);
      grad.addColorStop(0.7, `rgba(157, 0, 255, ${exp.alpha * 0.6})`);
      grad.addColorStop(1, `rgba(0, 0, 0, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(exp.pos.x, exp.pos.y, exp.radius, 0, Math.PI * 2);
      ctx.fill();
    });

    // Floating Text
    floatingTextsRef.current.forEach(t => {
      ctx.fillStyle = t.color;
      ctx.globalAlpha = t.life;
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t.text, t.x, t.y);
    });
    ctx.globalAlpha = 1;

    ctx.restore();
  }, [gameState, score, shake]);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        canvasRef.current.width = clientWidth;
        canvasRef.current.height = clientHeight;
        if (gameState === 'START') initLayout(clientWidth, clientHeight);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    let animId: number;
    const loop = (time: number) => {
      update(time);
      draw();
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
    };
  }, [gameState, initLayout, draw]);

  return (
    <div className="fixed inset-0 bg-[#1a0514] text-white font-sans overflow-hidden select-none touch-none">
      {/* HUD */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-10 pointer-events-none">
        <div className="flex flex-col gap-1">
          <div className="text-3xl font-black tracking-tighter flex items-center gap-2">
            <span className="text-pink-500">SOO</span>
            <span className="text-purple-400">NOVA</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-2 py-0.5 bg-pink-500/20 border border-pink-500/30 rounded text-[10px] font-bold text-pink-400 uppercase tracking-widest">
              {t.round} {round}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="text-4xl font-mono font-black text-pink-400 drop-shadow-[0_0_10px_rgba(255,0,127,0.5)]">
            {score.toString().padStart(5, '0')}
          </div>
          <div className="text-[10px] font-bold opacity-60 uppercase tracking-widest text-pink-200">
            {gameMode === 'CLASSIC' ? `${t.targetScore} / ${WIN_SCORE}` : `${t.highScore} / ${highScore}`}
          </div>
        </div>
      </div>

      {/* Language Toggle */}
      <button 
        onClick={() => setLang(l => l === 'en' ? 'zh' : 'en')}
        className="absolute bottom-6 right-6 z-20 p-3 bg-white/5 hover:bg-white/10 rounded-full backdrop-blur-xl border border-white/10 transition-all pointer-events-auto"
      >
        <Languages size={24} className="text-pink-400" />
      </button>

      {/* Game Canvas */}
      <div ref={containerRef} className="w-full h-full relative cursor-crosshair">
        <canvas
          ref={canvasRef}
          onMouseDown={handleCanvasClick}
          onTouchStart={handleCanvasClick}
          className="block w-full h-full"
        />
      </div>

      {/* Overlays */}
      <AnimatePresence>
        {gameState !== 'PLAYING' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-center justify-center bg-[#0f0514]/90 backdrop-blur-md p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-2xl w-full bg-zinc-950 border border-pink-500/10 rounded-[2.5rem] p-10 shadow-2xl text-center relative overflow-hidden"
            >
              {/* Background Glow */}
              <div className="absolute -top-24 -left-24 w-64 h-64 bg-pink-600/20 blur-[100px] rounded-full" />
              <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-purple-600/20 blur-[100px] rounded-full" />

              {gameState === 'START' && (
                <div className="relative z-10">
                  <h1 className="text-5xl font-black mb-2 tracking-tighter italic text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-500">
                    {t.title}
                  </h1>
                  <div className="h-1 w-24 bg-pink-600 mx-auto mb-8 rounded-full" />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 text-left">
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex gap-4 items-start">
                      <div className="p-2 bg-pink-500/20 rounded-lg text-pink-400"><ShieldAlert size={20} /></div>
                      <div>
                        <div className="font-bold text-sm mb-1 text-white">{lang === 'zh' ? '防御目标' : 'Objective'}</div>
                        <div className="text-xs text-zinc-400 leading-relaxed">{t.rule1}</div>
                      </div>
                    </div>
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex gap-4 items-start">
                      <div className="p-2 bg-purple-500/20 rounded-lg text-purple-400"><MousePointer2 size={20} /></div>
                      <div>
                        <div className="font-bold text-sm mb-1 text-white">{lang === 'zh' ? '操作方式' : 'Controls'}</div>
                        <div className="text-xs text-zinc-400 leading-relaxed">{t.rule2}</div>
                      </div>
                    </div>
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex gap-4 items-start">
                      <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400"><Target size={20} /></div>
                      <div>
                        <div className="font-bold text-sm mb-1 text-white">{lang === 'zh' ? '核心技巧' : 'Pro Tip'}</div>
                        <div className="text-xs text-zinc-400 leading-relaxed">{t.rule3}</div>
                      </div>
                    </div>
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex gap-4 items-start">
                      <div className="p-2 bg-pink-500/20 rounded-lg text-pink-400"><AlertTriangle size={20} /></div>
                      <div>
                        <div className="font-bold text-sm mb-1 text-white">{lang === 'zh' ? '无尽挑战' : 'Endless Challenge'}</div>
                        <div className="text-xs text-zinc-400 leading-relaxed">{t.endlessRule}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    <button
                      onClick={() => startGame('CLASSIC')}
                      className="flex-1 py-5 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-xl transition-all flex items-center justify-center gap-3 group shadow-lg shadow-pink-900/40"
                    >
                      <Play fill="currentColor" size={24} />
                      {t.classicMode}
                    </button>
                    <button
                      onClick={() => startGame('ENDLESS')}
                      className="flex-1 py-5 bg-gradient-to-r from-purple-600 to-purple-500 text-white rounded-2xl font-black text-xl transition-all flex items-center justify-center gap-3 group shadow-lg shadow-purple-900/40"
                    >
                      <Zap fill="currentColor" size={24} />
                      {t.endlessMode}
                    </button>
                  </div>
                </div>
              )}

              {gameState === 'WON' && (
                <div className="relative z-10">
                  <div className="w-24 h-24 bg-pink-500/20 rounded-full flex items-center justify-center mx-auto mb-8 border border-pink-500/30">
                    <Trophy className="text-pink-500" size={48} />
                  </div>
                  <h2 className="text-4xl font-black mb-2 text-pink-400 tracking-tight italic">{t.victory}</h2>
                  <p className="text-zinc-400 mb-8">{t.win}</p>
                  <div className="text-7xl font-mono font-black mb-10 text-white tracking-tighter">{score}</div>
                  <button
                    onClick={() => setGameState('START')}
                    className="w-full py-5 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white rounded-2xl font-black text-xl transition-all flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(219,39,119,0.4)]"
                  >
                    <RotateCcw size={24} />
                    {t.playAgain}
                  </button>
                </div>
              )}

              {gameState === 'LOST' && (
                <div className="relative z-10">
                  <div className="w-24 h-24 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-8 border border-red-500/30">
                    <Skull className="text-red-500" size={48} />
                  </div>
                  <h2 className="text-4xl font-black mb-2 text-red-400 tracking-tight italic">{t.gameOver}</h2>
                  <p className="text-zinc-400 mb-4">{t.loss}</p>
                  <div className="flex justify-center gap-8 mb-8">
                    <div>
                      <div className="text-[10px] font-bold opacity-50 uppercase tracking-widest mb-1">{t.score}</div>
                      <div className="text-4xl font-mono font-black text-white">{score}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold opacity-50 uppercase tracking-widest mb-1">{t.highScore}</div>
                      <div className="text-4xl font-mono font-black text-pink-400">{highScore}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setGameState('START')}
                    className="w-full py-5 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white rounded-2xl font-black text-xl transition-all flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(219,39,119,0.4)]"
                  >
                    <RotateCcw size={24} />
                    {t.playAgain}
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
