(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  const hpEl = document.getElementById('hp');
  const scrapEl = document.getElementById('scrap');
  const levelEl = document.getElementById('level');
  const pauseBtn = document.getElementById('pauseBtn');
  const shopBtn = document.getElementById('shopBtn');
  const resetBtn = document.getElementById('resetBtn');
  const overlay = document.getElementById('overlay');
  const overlayContent = document.getElementById('overlayContent');
  const playerNameInput = document.getElementById('playerName');

  const W = canvas.width, H = canvas.height;

  const keys = {};
  let mouse = { x: W/2, y: H/2, down:false };

  window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
  window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
    mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
  });

  canvas.addEventListener('mousedown', () => mouse.down = true);
  canvas.addEventListener('mouseup', () => mouse.down = false);

  function rand(min,max){ return Math.random()*(max-min)+min; }
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
  function angleTo(a,b){ return Math.atan2(b.y-a.y, b.x-a.x); }

  const SAVE_KEY = 'nebula_save_v1';

  function saveState(state){
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  }
  function loadState(){
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || null; }
    catch(e){ return null; }
  }
  function resetSave(){
    localStorage.removeItem(SAVE_KEY);
    location.reload();
  }

  resetBtn.onclick = resetSave;

  const state = {
    running: true,
    paused: false,
    wave: 1,
    scrap: 0,
    player: null,
    bullets: [],
    enemies: [],
    particles: [],
    lastShot: 0,
    shopOpen: false,
  };

  /* ------------------------------ GAME OBJECTS ------------------------------ */

  class Player {
    constructor(x,y){
      this.x=x; this.y=y;
      this.vx=0; this.vy=0;
      this.radius=14;
      this.maxHp=100; this.hp=this.maxHp;
      this.speed=220;
      this.weapon = 'blaster';
      this.weaponLevel = 1;
    }
    update(dt){
      let ax=0, ay=0;
      if(keys['w']||keys['arrowup']) ay -= 1;
      if(keys['s']||keys['arrowdown']) ay += 1;
      if(keys['a']||keys['arrowleft']) ax -= 1;
      if(keys['d']||keys['arrowright']) ax += 1;

      if(ax || ay){
        const mag = Math.hypot(ax,ay);
        ax/=mag; ay/=mag;
        this.vx += ax * this.speed * dt;
        this.vy += ay * this.speed * dt;
      } else {
        this.vx *= (1 - Math.min(dt*8, 0.9));
        this.vy *= (1 - Math.min(dt*8, 0.9));
      }

      const sp = Math.hypot(this.vx, this.vy);
      if(sp > this.speed){
        this.vx = (this.vx/sp) * this.speed;
        this.vy = (this.vy/sp) * this.speed;
      }

      this.x += this.vx * dt;
      this.y += this.vy * dt;

      this.x = clamp(this.x, 20, W-20);
      this.y = clamp(this.y, 20, H-20);

      const now = performance.now();
      const rate = this.getFireRate();
      if(mouse.down && now - state.lastShot > rate){
        state.lastShot = now;
        this.fire();
      }
    }

    fire(){
      const ang = Math.atan2(mouse.y - this.y, mouse.x - this.x);
      const lvl = this.weaponLevel;

      if(this.weapon === 'blaster'){
        spawnBullet(this.x,this.y,ang,600+lvl*40,8,'player');

      } else if(this.weapon === 'rapid'){
        spawnBullet(this.x,this.y,ang,760,5,'player');

      } else if(this.weapon === 'shotgun'){
        const pellets = 5 + lvl;
        for(let i=0;i<pellets;i++){
          const a = ang + rand(-0.28,0.28);
          spawnBullet(this.x,this.y,a,520,6,'player');
        }

      } else if(this.weapon === 'spread'){
        const a1=ang-0.18, a2=ang, a3=ang+0.18;
        spawnBullet(this.x,this.y,a1,640,7,'player');
        spawnBullet(this.x,this.y,a2,640,7,'player');
        spawnBullet(this.x,this.y,a3,640,7,'player');
      }

      for(let i=0;i<6;i++){
        state.particles.push(
          new Particle(
            this.x + Math.cos(ang)*18,
            this.y + Math.sin(ang)*18,
            Math.cos(ang)*rand(40,180)+rand(-80,80),
            Math.sin(ang)*rand(40,180)+rand(-80,80),
            0.4+Math.random()*0.5,
            '#ffd89b'
          )
        );
      }
    }

    getFireRate(){
      if(this.weapon === 'rapid') return 80 - (this.weaponLevel*6);
      if(this.weapon === 'shotgun') return 500 - (this.weaponLevel*20);
      return 220 - (this.weaponLevel*8);
    }

    draw(){
      ctx.save();
      ctx.translate(this.x, this.y);

      const ang = Math.atan2(mouse.y - this.y, mouse.x - this.x);
      ctx.rotate(ang);

      ctx.beginPath();
      ctx.moveTo(18,0);
      ctx.lineTo(-12,10);
      ctx.lineTo(-6,0);
      ctx.lineTo(-12,-10);
      ctx.closePath();
      ctx.fillStyle='#cfefff';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(-2,0,5,0,Math.PI*2);
      ctx.fillStyle='#0b4060';
      ctx.fill();

      ctx.restore();
    }
  }

  class Bullet {
    constructor(x,y,ang,speed,radius,owner){
      this.x=x; this.y=y;
      this.vx=Math.cos(ang)*speed;
      this.vy=Math.sin(ang)*speed;
      this.radius=radius;
      this.owner=owner;
      this.life=2.5;
    }

    update(dt){
      this.x += this.vx*dt;
      this.y += this.vy*dt;
      this.life -= dt;
    }

    draw(){
      ctx.beginPath();
      ctx.arc(this.x,this.y,this.radius,0,Math.PI*2);
      ctx.fillStyle = (this.owner==='player') ? '#b6ffdb' : '#ffccd5';
      ctx.fill();
    }
  }

  class Enemy {
    constructor(x,y,type=0){
      this.x=x; this.y=y;
      this.vx=0; this.vy=0;
      this.type=type;
      this.radius = (type===2)?20:14;
      this.hp = (type===2)?120:30;
      this.speed = (type===2)?80:110;
      this.lastShot=0;
    }

    update(dt){
      const player = state.player;
      if(!player) return;

      const a = angleTo(this,player);

      if(this.type===0){
        this.vx += Math.cos(a)*this.speed*dt;
        this.vy += Math.sin(a)*this.speed*dt;
        this.vx*=0.92; this.vy*=0.92;

      } else if(this.type===1){
        const d = dist(this,player);
        if(d < 240){
          this.vx += Math.cos(a+Math.PI)*this.speed*dt*0.6;
          this.vy += Math.sin(a+Math.PI)*this.speed*dt*0.6;
        } else {
          this.vx += Math.cos(a)*this.speed*dt*0.2;
          this.vy += Math.sin(a)*this.speed*dt*0.2;
        }

        const now = performance.now();
        if(now - this.lastShot > 1200){
          this.lastShot = now;
          const ang = angleTo(this,player) + rand(-0.12,0.12);
          spawnBullet(this.x,this.y,ang,360,7,'enemy');
        }

      } else if(this.type===2){
        const d = dist(this,player);
        if(d>100){
          this.vx += Math.cos(a)*this.speed*dt*0.5;
          this.vy += Math.sin(a)*this.speed*dt*0.5;
        }
      }

      this.x += this.vx*dt;
      this.y += this.vy*dt;

      this.x=clamp(this.x,10,W-10);
      this.y=clamp(this.y,10,H-10);
    }

    draw(){
      ctx.save();
      ctx.translate(this.x,this.y);

      ctx.beginPath();
      ctx.arc(0,0,this.radius,0,Math.PI*2);
      let color = (this.type===0)?'#ff8b70' : (this.type===1)?'#ffd36b' : '#ff6fb1';
      ctx.fillStyle=color;
      ctx.fill();

      ctx.fillStyle='rgba(0,0,0,0.35)';
      ctx.fillRect(-20,-this.radius-10,40,6);

      ctx.fillStyle='#5ce6a2';
      const maxhp = (this.type===2)?120:30;
      const w = clamp(40*(this.hp/maxhp),0,40);
      ctx.fillRect(-20,-this.radius-10,w,6);

      ctx.restore();
    }
  }

  class Particle {
    constructor(x,y,vx,vy,life,color){
      this.x=x; this.y=y;
      this.vx=vx; this.vy=vy;
      this.life=life; this.maxLife=life;
      this.color=color;
    }
    update(dt){
      this.x+=this.vx*dt;
      this.y+=this.vy*dt;
      this.vx*=1-dt*0.6;
      this.vy*=1-dt*0.6;
      this.life-=dt;
    }
    draw(){
      const t = clamp(this.life/this.maxLife,0,1);
      ctx.globalAlpha=t;
      ctx.fillStyle=this.color;
      ctx.fillRect(this.x-1.5,this.y-1.5,3,3);
      ctx.globalAlpha=1;
    }
  }

  function spawnBullet(x,y,ang,speed,radius,owner){
    state.bullets.push(new Bullet(x,y,ang,speed,radius,owner));
  }

  /* ----------------------------------------------------------------------- */
  /* --------------------------- CLOUD FUNCTIONS ---------------------------- */
  /* ----------------------------------------------------------------------- */

  function saveHighScoreCloud(playerName, score) {
    const url = window.location.origin + "/save-score";
    console.log("Saving score...", playerName, score);

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: playerName, score: score })
    })
    .then(r => r.json())
    .then(r => {
      console.log("Cloud save response:", r);
    })
    .catch(err => {
      console.warn("Could not save score to cloud:", err);
    });
  }

  async function loadHighScores() {
    const url = window.location.origin + "/get-highscores";
    
    try {
      const res = await fetch(url);
      if (!res.ok) return "<p>Leaderboard unavailable</p>";
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return "<p>No scores yet</p>";

      let html = "<h3>Leaderboard</h3>";
      data.forEach((row, idx) => {
        html += `<p>${idx + 1}. ${row.name} — Wave ${row.score}</p>`;
      });
      return html;
    } catch (e) {
      return "<p>Leaderboard error</p>";
    }
  }

  /* ----------------------------------------------------------------------- */
  /* ------------------------------ GAME OVER ------------------------------- */
  /* ----------------------------------------------------------------------- */

  function gameOver(){
    state.running=false;
    overlay.classList.remove('hidden');

    overlayContent.innerHTML = `
      <h2>You Died</h2>
      <p>Wave: ${state.wave}</p>
      <p>Scrap: ${state.scrap}</p>
      <button class="button" id="restart">Restart (Keep Scrap)</button>
      <button class="button" id="restartFresh">Restart Fresh</button>
      <div id="leaderboardArea" style="margin-top:12px;"></div>
    `;

    // restart buttons
    document.getElementById('restart').onclick=()=> {
      overlay.classList.add('hidden');
      restart(false);
    };
    document.getElementById('restartFresh').onclick=()=> {
      overlay.classList.add('hidden');
      restart(true);
    };

    // SAVE SCORE TO CLOUD
    const playerName = (playerNameInput && playerNameInput.value.trim().length > 0)
      ? playerNameInput.value.trim()
      : "Player";

    saveHighScoreCloud(playerName, state.wave);

    // LOAD LEADERBOARD
    loadHighScores().then(html => {
      const area = document.getElementById("leaderboardArea");
      if (area) area.innerHTML = html;
    });
  }

  /* ----------------------------------------------------------------------- */
  /* ------------------------------ GAME LOOP ------------------------------- */
  /* ----------------------------------------------------------------------- */

  function spawnWave(wave){
    const count = 3 + Math.floor(wave*1.6);
    for(let i=0;i<count;i++){
      const angle = Math.random()*Math.PI*2;
      const distFromCenter = rand(160, Math.min(W,H)/2 - 30);
      const ex = W/2 + Math.cos(angle)*distFromCenter;
      const ey = H/2 + Math.sin(angle)*distFromCenter;

      let type=0;
      const r=Math.random();
      if(wave>4 && r<0.2) type=2;
      else if(wave>2 && r<0.35) type=1;

      state.enemies.push(new Enemy(ex,ey,type));
    }
  }

  let lastTime = performance.now();

  function tick(now){
    const dt = Math.min(0.05,(now-lastTime)/1000);
    lastTime=now;

    if(!state.paused && state.running){
      update(dt);
    }
    render();

    requestAnimationFrame(tick);
  }

  function update(dt){
    state.player.update(dt);

    for(let i=state.bullets.length-1;i>=0;i--){
      const b=state.bullets[i];
      b.update(dt);

      if(b.life<=0){
        state.bullets.splice(i,1);
        continue;
      }

      if(b.owner==='player'){
        for(let j=state.enemies.length-1;j>=0;j--){
          const e=state.enemies[j];
          if(dist(b,e) < b.radius + e.radius){
            e.hp -= 12 + state.player.weaponLevel*4;

            if(e.hp<=0){
              state.scrap += 4+Math.floor(Math.random()*6)+state.wave;
              state.enemies.splice(j,1);
            }

            state.bullets.splice(i,1);
            break;
          }
        }

      } else {
        if(dist(b,state.player) < b.radius + state.player.radius){
          state.player.hp -= 8;
          state.bullets.splice(i,1);

          if(state.player.hp<=0){
            gameOver();
            return;
          }
        }
      }
    }

    for(let i=state.enemies.length-1;i>=0;i--){
      const e=state.enemies[i];
      e.update(dt);

      if(dist(e,state.player) < e.radius + state.player.radius){
        state.player.hp -= 10*dt + 1;
        if(state.player.hp<=0){
          gameOver();
          return;
        }
      }
    }

    if(state.enemies.length===0){
      state.wave++;
      spawnWave(state.wave);
    }

    hpEl.textContent = `HP: ${Math.round(state.player.hp)}/${state.player.maxHp}`;
    scrapEl.textContent = `Scrap: ${state.scrap}`;
    levelEl.textContent = `Wave: ${state.wave}`;
  }

  function render(){
    ctx.clearRect(0,0,W,H);

    ctx.save();
    ctx.globalAlpha=0.06;
    for(let x=0;x<W;x+=24){
      ctx.beginPath();
      ctx.moveTo(x,0); ctx.lineTo(x,H);
      ctx.strokeStyle='#ffffff';
      ctx.stroke();
    }
    for(let y=0;y<H;y+=24){
      ctx.beginPath();
      ctx.moveTo(0,y); ctx.lineTo(W,y);
      ctx.strokeStyle='#ffffff';
      ctx.stroke();
    }
    ctx.restore();

    for(const p of state.particles) p.draw();
    for(const e of state.enemies) e.draw();
    for(const b of state.bullets) b.draw();
    state.player.draw();

    ctx.beginPath();
    ctx.arc(mouse.x,mouse.y,6,0,Math.PI*2);
    ctx.strokeStyle='#9be3ff';
    ctx.lineWidth=1.5;
    ctx.stroke();
  }

  /* ----------------------------------------------------------------------- */
  /* ------------------------------ RESTART --------------------------------- */
  /* ----------------------------------------------------------------------- */

  function restart(fresh){
    state.enemies.length=0;
    state.bullets.length=0;
    state.particles.length=0;

    state.player.x=W/2;
    state.player.y=H/2;
    state.player.vx=0;
    state.player.vy=0;

    if(fresh){
      state.wave=1;
      state.scrap=0;
      state.player.maxHp=100;
      state.player.hp=100;
      state.player.weaponLevel=1;
    } else {
      state.player.hp=state.player.maxHp;
    }

    state.running=true;
    spawnWave(state.wave);
  }

  function bootstrap(){
    state.player = new Player(W/2,H/2);
    spawnWave(state.wave);

    requestAnimationFrame(tick);
  }

  bootstrap();

})();
