// KingEngine - Modular 2D Game Runtime
export const KingEngineSource = `
  class KingEngine {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.config = config;
      this.running = false;
      this.y = 120;
      this.v = 0;
      
      this.canvas.onclick = () => this.v = -parseInt(this.config.jump || 5);
    }

    start() {
      this.running = true;
      this.loop();
    }

    loop() {
      if (!this.running) return;
      this.update();
      this.draw();
      requestAnimationFrame(() => this.loop());
    }

    update() {
      this.v += 0.2;
      this.y += this.v;
      if (this.y > this.canvas.height) this.y = 120;
    }

    draw() {
      this.ctx.fillStyle = this.config.bgColor;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      
      // Render based on map/pipe style
      this.ctx.fillStyle = this.config.pipeStyle === 'steel' ? '#64748B' : '#22C55E';
      this.ctx.fillRect(200, 0, 40, 100);
      
      this.ctx.fillStyle = 'yellow';
      this.ctx.font = '30px serif';
      this.ctx.fillText(this.config.playerEmoji || '🐦', 50, this.y);
    }
  }
`;
