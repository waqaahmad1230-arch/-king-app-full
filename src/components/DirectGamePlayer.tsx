import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, RotateCcw, Volume2, VolumeX, Trophy, Play, Sparkles, Shield, Flame } from 'lucide-react';
import { GameItem } from './GamesView';

interface DirectGamePlayerProps {
  game: GameItem;
  onClose: () => void;
}

// Simple Web Audio API sound generator for retro game SFX
class SoundFX {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  constructor() {
    // Lazy initialize on first user action
  }

  private init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  playLaser() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    } catch {}
  }

  playExplosion() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(120, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.3);
    } catch {}
  }

  playCoin() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, this.ctx.currentTime);
      osc.frequency.setValueAtTime(1318.51, this.ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.25);
    } catch {}
  }

  playJump() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(450, this.ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    } catch {}
  }
}

const sfx = new SoundFX();

export default function DirectGamePlayer({ game, onClose }: DirectGamePlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem(`king_highscore_${game.id}`);
    return saved ? parseInt(saved, 10) : 0;
  });
  const [gameOver, setGameOver] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [gamePaused, setGamePaused] = useState(false);
  const [earnedCoins, setEarnedCoins] = useState(0);

  // Identify which game style to run based on title / id / category
  const titleLower = (game.title || '').toLowerCase();
  const isRacing = titleLower.includes('racing') || titleLower.includes('velocity') || titleLower.includes('gt') || titleLower.includes('drift');
  const isRunner = titleLower.includes('fantasy') || titleLower.includes('rpg') || titleLower.includes('shadow') || titleLower.includes('runner') || titleLower.includes('samurai');

  // Input states
  const leftPressedRef = useRef(false);
  const rightPressedRef = useRef(false);
  const actionPressedRef = useRef(false);
  const touchPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    sfx.enabled = !isMuted;
  }, [isMuted]);

  // Main Game Loop Engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let currentScore = 0;
    let lives = 3;
    let isFinished = false;

    // Set canvas dimensions
    const width = 360;
    const height = 540;
    canvas.width = width;
    canvas.height = height;

    // Common particles system
    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      color: string;
      alpha: number;
      life: number;
    }
    const particles: Particle[] = [];
    const spawnExplosion = (x: number, y: number, color = '#f59e0b', count = 15) => {
      sfx.playExplosion();
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4 + 1;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: Math.random() * 3 + 1,
          color,
          alpha: 1,
          life: 0.95,
        });
      }
    };

    // ---------------------------------------------
    // GAME 1 & 4: SHOOTER (Cyber Arena & Pixel Galaxy)
    // ---------------------------------------------
    let shooterPlayer = {
      x: width / 2,
      y: height - 60,
      width: 32,
      height: 32,
      speed: 6,
      shootCooldown: 0,
    };
    interface Bullet {
      x: number;
      y: number;
      vy: number;
      color: string;
    }
    let bullets: Bullet[] = [];
    interface Enemy {
      x: number;
      y: number;
      width: number;
      height: number;
      vx: number;
      vy: number;
      hp: number;
      maxHp: number;
      color: string;
      scoreVal: number;
    }
    let enemies: Enemy[] = [];
    interface CoinItem {
      x: number;
      y: number;
      vy: number;
      radius: number;
    }
    let coins: CoinItem[] = [];

    // ---------------------------------------------
    // GAME 2: RACING (Neon Velocity GT)
    // ---------------------------------------------
    let racerCar = {
      x: width / 2 - 16,
      y: height - 100,
      width: 34,
      height: 56,
      speedX: 5,
    };
    interface TrafficCar {
      x: number;
      y: number;
      width: number;
      height: number;
      speedY: number;
      color: string;
    }
    let traffic: TrafficCar[] = [];
    let roadStripeOffset = 0;

    // ---------------------------------------------
    // GAME 3: RUNNER / SLASH (Shadow Fantasy RPG)
    // ---------------------------------------------
    let runnerHero = {
      x: 60,
      y: height - 120,
      width: 30,
      height: 44,
      vy: 0,
      gravity: 0.7,
      jumpForce: -12,
      isGrounded: true,
      slashing: 0,
    };
    const groundY = height - 100;
    interface Hazard {
      x: number;
      y: number;
      width: number;
      height: number;
      speed: number;
      type: 'spike' | 'monster';
    }
    let hazards: Hazard[] = [];

    let frameCount = 0;

    // Game loop
    const loop = () => {
      frameCount++;

      if (!isFinished && !gamePaused) {
        // Update particles
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.alpha *= p.life;
          if (p.alpha <= 0.05) {
            particles.splice(i, 1);
          }
        }

        // ==========================================
        // 1. RACING MODE
        // ==========================================
        if (isRacing) {
          roadStripeOffset = (roadStripeOffset + 6) % 40;
          currentScore += 1;
          setScore(currentScore);

          // Steer
          if (leftPressedRef.current) racerCar.x -= racerCar.speedX;
          if (rightPressedRef.current) racerCar.x += racerCar.speedX;
          if (touchPosRef.current) {
            racerCar.x += (touchPosRef.current.x - (racerCar.x + racerCar.width / 2)) * 0.15;
          }

          // Clamping to road bounds
          if (racerCar.x < 30) racerCar.x = 30;
          if (racerCar.x > width - 30 - racerCar.width) racerCar.x = width - 30 - racerCar.width;

          // Spawn traffic
          if (frameCount % 60 === 0) {
            const lane = Math.floor(Math.random() * 3);
            const laneX = 45 + lane * 95;
            const colors = ['#ef4444', '#3b82f6', '#eab308', '#a855f7'];
            traffic.push({
              x: laneX,
              y: -70,
              width: 32,
              height: 52,
              speedY: Math.random() * 2 + 3,
              color: colors[Math.floor(Math.random() * colors.length)],
            });
          }

          // Spawn road coins
          if (frameCount % 90 === 0) {
            const lane = Math.floor(Math.random() * 3);
            coins.push({
              x: 55 + lane * 95,
              y: -20,
              vy: 4,
              radius: 9,
            });
          }

          // Update coins
          for (let i = coins.length - 1; i >= 0; i--) {
            const c = coins[i];
            c.y += c.vy;
            // Collision with racer
            const dist = Math.hypot(c.x - (racerCar.x + racerCar.width / 2), c.y - (racerCar.y + racerCar.height / 2));
            if (dist < 26) {
              sfx.playCoin();
              currentScore += 50;
              setScore(currentScore);
              setEarnedCoins((prev) => prev + 1);
              coins.splice(i, 1);
              continue;
            }
            if (c.y > height + 20) coins.splice(i, 1);
          }

          // Update traffic
          for (let i = traffic.length - 1; i >= 0; i--) {
            const car = traffic[i];
            car.y += car.speedY;

            // Collision check
            if (
              racerCar.x < car.x + car.width &&
              racerCar.x + racerCar.width > car.x &&
              racerCar.y < car.y + car.height &&
              racerCar.y + racerCar.height > car.y
            ) {
              spawnExplosion(racerCar.x + racerCar.width / 2, racerCar.y + racerCar.height / 2, '#ef4444', 25);
              isFinished = true;
              setGameOver(true);
              break;
            }

            if (car.y > height + 80) {
              traffic.splice(i, 1);
            }
          }
        }

        // ==========================================
        // 2. RUNNER MODE
        // ==========================================
        else if (isRunner) {
          currentScore += 1;
          setScore(currentScore);

          // Jump physics
          if (actionPressedRef.current && runnerHero.isGrounded) {
            sfx.playJump();
            runnerHero.vy = runnerHero.jumpForce;
            runnerHero.isGrounded = false;
          }

          runnerHero.vy += runnerHero.gravity;
          runnerHero.y += runnerHero.vy;

          if (runnerHero.y >= groundY - runnerHero.height) {
            runnerHero.y = groundY - runnerHero.height;
            runnerHero.vy = 0;
            runnerHero.isGrounded = true;
          }

          if (runnerHero.slashing > 0) runnerHero.slashing--;

          // Slash action
          if ((rightPressedRef.current || leftPressedRef.current) && runnerHero.slashing === 0) {
            runnerHero.slashing = 15;
            sfx.playLaser();
          }

          // Spawn hazards
          if (frameCount % 100 === 0) {
            const isMonster = Math.random() > 0.4;
            hazards.push({
              x: width + 20,
              y: isMonster ? groundY - 45 : groundY - 25,
              width: isMonster ? 30 : 25,
              height: isMonster ? 45 : 25,
              speed: 4.5,
              type: isMonster ? 'monster' : 'spike',
            });
          }

          // Spawn runner coins
          if (frameCount % 70 === 0) {
            coins.push({
              x: width + 20,
              y: groundY - 60 - Math.random() * 40,
              vy: 0,
              radius: 9,
            });
          }

          // Update coins
          for (let i = coins.length - 1; i >= 0; i--) {
            const c = coins[i];
            c.x -= 4.5;
            const dist = Math.hypot(c.x - (runnerHero.x + runnerHero.width / 2), c.y - (runnerHero.y + runnerHero.height / 2));
            if (dist < 26) {
              sfx.playCoin();
              currentScore += 50;
              setScore(currentScore);
              setEarnedCoins((prev) => prev + 1);
              coins.splice(i, 1);
              continue;
            }
            if (c.x < -20) coins.splice(i, 1);
          }

          // Update hazards
          for (let i = hazards.length - 1; i >= 0; i--) {
            const h = hazards[i];
            h.x -= h.speed;

            // Attack check on monster
            if (runnerHero.slashing > 0 && h.type === 'monster') {
              if (
                runnerHero.x + runnerHero.width + 25 > h.x &&
                runnerHero.x < h.x + h.width &&
                runnerHero.y < h.y + h.height &&
                runnerHero.y + runnerHero.height > h.y
              ) {
                spawnExplosion(h.x + h.width / 2, h.y + h.height / 2, '#a855f7', 18);
                currentScore += 100;
                setScore(currentScore);
                hazards.splice(i, 1);
                continue;
              }
            }

            // Player hit check
            if (
              runnerHero.x < h.x + h.width &&
              runnerHero.x + runnerHero.width > h.x &&
              runnerHero.y < h.y + h.height &&
              runnerHero.y + runnerHero.height > h.y
            ) {
              spawnExplosion(runnerHero.x + 15, runnerHero.y + 20, '#ef4444', 25);
              isFinished = true;
              setGameOver(true);
              break;
            }

            if (h.x < -50) hazards.splice(i, 1);
          }
        }

        // ==========================================
        // 3. SHOOTER MODE (Cyber Arena 2077 & Pixel Galaxy)
        // ==========================================
        else {
          // Player movement
          if (leftPressedRef.current) shooterPlayer.x -= shooterPlayer.speed;
          if (rightPressedRef.current) shooterPlayer.x += shooterPlayer.speed;
          if (touchPosRef.current) {
            shooterPlayer.x += (touchPosRef.current.x - shooterPlayer.x) * 0.18;
          }

          if (shooterPlayer.x < 20) shooterPlayer.x = 20;
          if (shooterPlayer.x > width - 20) shooterPlayer.x = width - 20;

          // Auto-shooting or manual shooting
          shooterPlayer.shootCooldown--;
          if (shooterPlayer.shootCooldown <= 0) {
            shooterPlayer.shootCooldown = 12;
            sfx.playLaser();
            bullets.push({
              x: shooterPlayer.x - 7,
              y: shooterPlayer.y - 12,
              vy: -9,
              color: '#38bdf8',
            });
            bullets.push({
              x: shooterPlayer.x + 7,
              y: shooterPlayer.y - 12,
              vy: -9,
              color: '#38bdf8',
            });
          }

          // Update bullets
          for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.y += b.vy;
            if (b.y < -10) {
              bullets.splice(i, 1);
            }
          }

          // Spawn enemies
          if (frameCount % 45 === 0) {
            const eWidth = 28;
            enemies.push({
              x: Math.random() * (width - 60) + 30,
              y: -30,
              width: eWidth,
              height: eWidth,
              vx: (Math.random() - 0.5) * 1.5,
              vy: Math.random() * 1.5 + 2,
              hp: 2,
              maxHp: 2,
              color: frameCount % 90 === 0 ? '#ef4444' : '#a855f7',
              scoreVal: 25,
            });
          }

          // Update enemies
          for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            e.x += e.vx;
            e.y += e.vy;

            // Bounce on borders
            if (e.x < 15 || e.x > width - 15 - e.width) e.vx = -e.vx;

            // Bullet collision
            for (let j = bullets.length - 1; j >= 0; j--) {
              const b = bullets[j];
              if (
                b.x > e.x &&
                b.x < e.x + e.width &&
                b.y > e.y &&
                b.y < e.y + e.height
              ) {
                bullets.splice(j, 1);
                e.hp--;
                spawnExplosion(b.x, b.y, '#38bdf8', 4);
                if (e.hp <= 0) {
                  spawnExplosion(e.x + e.width / 2, e.y + e.height / 2, e.color, 16);
                  currentScore += e.scoreVal;
                  setScore(currentScore);
                  // Chance to spawn coin
                  if (Math.random() > 0.4) {
                    coins.push({
                      x: e.x + e.width / 2,
                      y: e.y + e.height / 2,
                      vy: 2.5,
                      radius: 8,
                    });
                  }
                  enemies.splice(i, 1);
                  break;
                }
              }
            }

            // Player collision
            if (
              !isFinished &&
              Math.hypot(shooterPlayer.x - (e.x + e.width / 2), shooterPlayer.y - (e.y + e.height / 2)) < 26
            ) {
              spawnExplosion(shooterPlayer.x, shooterPlayer.y, '#f59e0b', 30);
              isFinished = true;
              setGameOver(true);
              break;
            }

            // Off screen
            if (e.y > height + 30) {
              enemies.splice(i, 1);
            }
          }

          // Update coins
          for (let i = coins.length - 1; i >= 0; i--) {
            const c = coins[i];
            c.y += c.vy;
            if (Math.hypot(shooterPlayer.x - c.x, shooterPlayer.y - c.y) < 26) {
              sfx.playCoin();
              currentScore += 50;
              setScore(currentScore);
              setEarnedCoins((prev) => prev + 1);
              coins.splice(i, 1);
              continue;
            }
            if (c.y > height + 20) coins.splice(i, 1);
          }
        }
      }

      // ==========================================
      // RENDERING (Dark Cyber Neon Graphics)
      // ==========================================
      ctx.fillStyle = '#050a16';
      ctx.fillRect(0, 0, width, height);

      // Stars/grid background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      for (let i = 0; i < 25; i++) {
        const starY = (i * 27 + frameCount * 1.2) % height;
        const starX = (i * 47) % width;
        ctx.fillRect(starX, starY, 1.5, 1.5);
      }

      // Render Particles
      for (const p of particles) {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Render Coins
      for (const c of coins) {
        ctx.save();
        ctx.fillStyle = '#f59e0b';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', c.x, c.y);
        ctx.restore();
      }

      // ------------------------------------------
      // Render Specific Game
      // ------------------------------------------
      if (isRacing) {
        // Draw Highway road
        ctx.fillStyle = '#090f1d';
        ctx.fillRect(25, 0, width - 50, height);
        // Road borders
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#22c55e';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(25, 0);
        ctx.lineTo(25, height);
        ctx.moveTo(width - 25, 0);
        ctx.lineTo(width - 25, height);
        ctx.stroke();

        // Road dashed stripes
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 2;
        ctx.setLineDash([16, 20]);
        ctx.lineDashOffset = -roadStripeOffset;
        ctx.beginPath();
        ctx.moveTo(width / 3 + 10, 0);
        ctx.lineTo(width / 3 + 10, height);
        ctx.moveTo((width / 3) * 2 - 10, 0);
        ctx.lineTo((width / 3) * 2 - 10, height);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;

        // Draw Traffic cars
        for (const car of traffic) {
          ctx.save();
          ctx.fillStyle = car.color;
          ctx.shadowColor = car.color;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.roundRect(car.x, car.y, car.width, car.height, 6);
          ctx.fill();
          // Windshield
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(car.x + 4, car.y + 12, car.width - 8, 10);
          // Headlights
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(car.x + 3, car.y + car.height - 4, 6, 3);
          ctx.fillRect(car.x + car.width - 9, car.y + car.height - 4, 6, 3);
          ctx.restore();
        }

        // Draw Player Racer Car
        ctx.save();
        ctx.fillStyle = '#10b981';
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.roundRect(racerCar.x, racerCar.y, racerCar.width, racerCar.height, 8);
        ctx.fill();
        // Roof & windshield
        ctx.fillStyle = '#022c22';
        ctx.fillRect(racerCar.x + 5, racerCar.y + 14, racerCar.width - 10, 18);
        // Headlights
        ctx.fillStyle = '#a7f3d0';
        ctx.fillRect(racerCar.x + 4, racerCar.y + 2, 7, 4);
        ctx.fillRect(racerCar.x + racerCar.width - 11, racerCar.y + 2, 7, 4);
        // Exhaust flames
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(racerCar.x + 8, racerCar.y + racerCar.height, 4, Math.random() * 6 + 4);
        ctx.fillRect(racerCar.x + racerCar.width - 12, racerCar.y + racerCar.height, 4, Math.random() * 6 + 4);
        ctx.restore();
      }

      else if (isRunner) {
        // Draw Ground
        ctx.fillStyle = '#1e1b4b';
        ctx.fillRect(0, groundY, width, height - groundY);
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#818cf8';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(0, groundY);
        ctx.lineTo(width, groundY);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Draw Hazards
        for (const h of hazards) {
          ctx.save();
          if (h.type === 'spike') {
            ctx.fillStyle = '#ef4444';
            ctx.shadowColor = '#ef4444';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.moveTo(h.x, groundY);
            ctx.lineTo(h.x + h.width / 2, groundY - h.height);
            ctx.lineTo(h.x + h.width, groundY);
            ctx.closePath();
            ctx.fill();
          } else {
            // Monster
            ctx.fillStyle = '#a855f7';
            ctx.shadowColor = '#a855f7';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.roundRect(h.x, h.y, h.width, h.height, 8);
            ctx.fill();
            // Glowing eyes
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(h.x + 5, h.y + 10, 5, 4);
            ctx.fillRect(h.x + h.width - 10, h.y + 10, 5, 4);
          }
          ctx.restore();
        }

        // Draw Ninja Hero
        ctx.save();
        ctx.fillStyle = '#6366f1';
        ctx.shadowColor = '#818cf8';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.roundRect(runnerHero.x, runnerHero.y, runnerHero.width, runnerHero.height, 6);
        ctx.fill();
        // Headband
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(runnerHero.x, runnerHero.y + 8, runnerHero.width, 5);
        ctx.fillRect(runnerHero.x - 8, runnerHero.y + 9, 8, 3);
        // Sword slash effect
        if (runnerHero.slashing > 0) {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 4;
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 15;
          ctx.beginPath();
          ctx.arc(runnerHero.x + runnerHero.width + 10, runnerHero.y + 20, 24, -Math.PI / 3, Math.PI / 3);
          ctx.stroke();
        }
        ctx.restore();
      }

      else {
        // SHOOTER MODE
        // Draw Bullets
        for (const b of bullets) {
          ctx.save();
          ctx.fillStyle = b.color;
          ctx.shadowColor = b.color;
          ctx.shadowBlur = 10;
          ctx.fillRect(b.x - 2, b.y, 4, 12);
          ctx.restore();
        }

        // Draw Enemies
        for (const e of enemies) {
          ctx.save();
          ctx.fillStyle = e.color;
          ctx.shadowColor = e.color;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.moveTo(e.x + e.width / 2, e.y + e.height);
          ctx.lineTo(e.x, e.y);
          ctx.lineTo(e.x + e.width, e.y);
          ctx.closePath();
          ctx.fill();
          // Core
          ctx.fillStyle = '#fef08a';
          ctx.beginPath();
          ctx.arc(e.x + e.width / 2, e.y + e.height / 2, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Draw Player Fighter Ship
        ctx.save();
        ctx.fillStyle = '#06b6d4';
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.moveTo(shooterPlayer.x, shooterPlayer.y - 18);
        ctx.lineTo(shooterPlayer.x - 16, shooterPlayer.y + 14);
        ctx.lineTo(shooterPlayer.x, shooterPlayer.y + 8);
        ctx.lineTo(shooterPlayer.x + 16, shooterPlayer.y + 14);
        ctx.closePath();
        ctx.fill();
        // Thruster glow
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.arc(shooterPlayer.x, shooterPlayer.y + 12, Math.random() * 3 + 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (!isFinished) {
        animationFrameId = requestAnimationFrame(loop);
      }
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [game.id, isRacing, isRunner, gamePaused]);

  // Handle Score Updates and High Scores
  useEffect(() => {
    if (gameOver) {
      if (score > highScore) {
        setHighScore(score);
        localStorage.setItem(`king_highscore_${game.id}`, score.toString());
      }
    }
  }, [gameOver, score, highScore, game.id]);

  // Restart Handler
  const handleRestart = () => {
    setGameOver(false);
    setScore(0);
    setGamePaused(false);
  };

  // Touch Controller Listeners
  const handleTouchStartCanvas = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.touches[0];
    touchPosRef.current = {
      x: ((touch.clientX - rect.left) / rect.width) * 360,
      y: ((touch.clientY - rect.top) / rect.height) * 540,
    };
  };

  const handleTouchMoveCanvas = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.touches[0];
    touchPosRef.current = {
      x: ((touch.clientX - rect.left) / rect.width) * 360,
      y: ((touch.clientY - rect.top) / rect.height) * 540,
    };
  };

  const handleTouchEndCanvas = () => {
    touchPosRef.current = null;
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#040812] flex flex-col text-white animate-in fade-in duration-150 select-none overflow-hidden">
      
      {/* 1. TOP GAMEPLAY HEADER */}
      <div className="bg-[#070d1a] border-b border-purple-500/40 p-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition flex items-center gap-1 text-xs font-bold cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
          </button>
          <div>
            <h3 className="text-xs sm:text-sm font-black text-white truncate max-w-[150px] sm:max-w-[200px]">
              {game.title}
            </h3>
            <span className="text-[10px] text-purple-400 font-mono">
              Direct Gameplay • 60 FPS
            </span>
          </div>
        </div>

        {/* Score & Controls */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs font-black text-emerald-400 font-mono">
              SCORE: {score}
            </div>
            <div className="text-[9px] text-slate-400 font-mono">
              BEST: {highScore}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsMuted(!isMuted)}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>

          <button
            type="button"
            onClick={handleRestart}
            className="p-1.5 rounded-lg bg-purple-600/30 hover:bg-purple-600 border border-purple-500/40 text-purple-300 hover:text-white transition cursor-pointer"
            title="Restart Game"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. GAME CANVAS VIEWPORT */}
      <div className="flex-1 relative flex items-center justify-center p-2 bg-gradient-to-b from-[#050914] via-[#04070d] to-black">
        <canvas
          ref={canvasRef}
          onTouchStart={handleTouchStartCanvas}
          onTouchMove={handleTouchMoveCanvas}
          onTouchEnd={handleTouchEndCanvas}
          className="rounded-2xl border-2 border-purple-500/50 shadow-[0_0_25px_rgba(168,85,247,0.3)] bg-[#050a16] max-h-[75vh] w-auto aspect-[360/540] touch-none cursor-crosshair"
        />

        {/* GAME OVER MODAL OVERLAY */}
        {gameOver && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-40 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-full max-w-xs bg-[#0b1220] border-2 border-red-500/60 rounded-3xl p-5 text-center space-y-4 shadow-2xl shadow-red-950/60">
              <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 mx-auto text-2xl font-black">
                💥
              </div>

              <div>
                <h4 className="text-xl font-black text-white tracking-wider">GAME OVER</h4>
                <p className="text-xs text-slate-400 mt-0.5">Nice effort, player!</p>
              </div>

              <div className="bg-[#050a16] border border-slate-800 rounded-2xl p-3 flex justify-around items-center">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-mono">Final Score</span>
                  <p className="text-lg font-black text-emerald-400 font-mono">{score}</p>
                </div>
                <div className="w-px h-8 bg-slate-800" />
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-mono">Coins Earned</span>
                  <p className="text-lg font-black text-yellow-400 font-mono">+{earnedCoins}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Exit to Games
                </button>
                <button
                  type="button"
                  onClick={handleRestart}
                  className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-black rounded-xl shadow-lg shadow-purple-600/40 transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Play Again
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. MOBILE ON-SCREEN TOUCH CONTROLS (Ergonomic thumb layout) */}
      <div className="bg-[#070c17] border-t border-slate-800/90 p-3 pb-6 flex items-center justify-between max-w-md mx-auto w-full">
        {/* Left / Right Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onPointerDown={() => (leftPressedRef.current = true)}
            onPointerUp={() => (leftPressedRef.current = false)}
            onPointerLeave={() => (leftPressedRef.current = false)}
            className="w-14 h-14 rounded-2xl bg-slate-800/90 active:bg-purple-600 border border-slate-700 active:border-purple-400 flex items-center justify-center text-xl font-black text-slate-200 active:text-white shadow transition active:scale-95 touch-none select-none"
          >
            ◀
          </button>
          <button
            type="button"
            onPointerDown={() => (rightPressedRef.current = true)}
            onPointerUp={() => (rightPressedRef.current = false)}
            onPointerLeave={() => (rightPressedRef.current = false)}
            className="w-14 h-14 rounded-2xl bg-slate-800/90 active:bg-purple-600 border border-slate-700 active:border-purple-400 flex items-center justify-center text-xl font-black text-slate-200 active:text-white shadow transition active:scale-95 touch-none select-none"
          >
            ▶
          </button>
        </div>

        {/* Center Helper Text */}
        <div className="text-center px-1">
          <p className="text-[10px] text-purple-300 font-bold uppercase tracking-wider">
            {isRunner ? 'JUMP & SLASH' : isRacing ? 'STEER OR DRAG' : 'DRAG OR BUTTONS'}
          </p>
          <span className="text-[8px] text-slate-500">Touch screen directly</span>
        </div>

        {/* Action Button (Jump / Fire / Boost) */}
        <div>
          <button
            type="button"
            onPointerDown={() => (actionPressedRef.current = true)}
            onPointerUp={() => (actionPressedRef.current = false)}
            onPointerLeave={() => (actionPressedRef.current = false)}
            className={`w-14 h-14 rounded-2xl ${
              isRunner
                ? 'bg-gradient-to-tr from-indigo-600 to-purple-600 active:from-indigo-500 active:to-purple-500'
                : isRacing
                ? 'bg-gradient-to-tr from-emerald-600 to-teal-500 active:from-emerald-500 active:to-teal-400'
                : 'bg-gradient-to-tr from-cyan-600 to-blue-600 active:from-cyan-500 active:to-blue-500'
            } border border-white/20 flex flex-col items-center justify-center shadow-lg transition active:scale-90 touch-none select-none`}
          >
            <span className="text-xs font-black text-white">
              {isRunner ? 'JUMP' : isRacing ? 'NITRO' : 'FIRE'}
            </span>
            <span className="text-[9px] text-white/80">⚡</span>
          </button>
        </div>
      </div>

    </div>
  );
}
