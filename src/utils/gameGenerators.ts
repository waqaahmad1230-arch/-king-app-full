import { KingEngineSource } from './KingEngine';

export const generateUniqueFlappyHtml = (config: any) => {
  return `
    <html>
      <head>
        <style>
          body { margin:0; overflow:hidden; }
          #c { display:block; margin:auto; }
        </style>
      </head>
      <body>
        <canvas id="c" width="320" height="240"></canvas>
        <script>
          ${KingEngineSource}
          const c = document.getElementById('c');
          const config = ${JSON.stringify(config)};
          const engine = new KingEngine(c, config);
          engine.start();
        </script>
      </body>
    </html>
  `;
};
