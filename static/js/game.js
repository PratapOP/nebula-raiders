(() => {
  /* ------------------------------ DOM ------------------------------ */
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  const hpEl = document.getElementById('hp');
  const scrapEl = document.getElementById('scrap');
  const levelEl = document.getElementById('level');
  const pauseBtn = document.getElementById('pauseBtn');
  const shopBtn = document.getElementById('shopBtn');
  const resetBtn = document.getElementById('resetBtn');
  const leaderboardBtn = document.getElementById('leaderboardBtn');
  const overlay = document.getElementById('overlay');
  const overlayContent = document.getElementById('overlayContent');
  const playerNameInput = document.getElementById('playerName');

  canvas.width = 960;
  canvas.height = 600;
  const W = canvas.width, H = canvas.height;

  /* ------------------------------ Input ------------------------------ */
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

  /* ------------------------------ Util ------------------------------ */
  function rand(min,max){ return Math.random()*(max-min)+min; }
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
  function angleTo(a,b){ return Math.atan2(b.y-a.y, b.x-a.x); }

  const SAVE_KEY = 'nebula_save_v2';

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

  /* ------------------------------ Game State ------------------------------ */
  const state = {
    running:true, paused:false, wave:1, scrap:0,
    player:null, bullets:[], enemies:[], particles:[], lastShot:0, shopOpen:false
  };

  /* ------------------------------ Entities ------------------------------ */
  class Player {
    constructor(x,y){
      this.x=x; this.y=y; this.vx=0; this.vy=0; this.radius=16;
      this.maxHp=130; this.hp=this.maxHp; this.speed=260;
      this.weapon='blaster'; this.weaponLevel=1;
    }
    update(dt){
      let ax=0, ay=0;
      if(keys['w']||keys['arrowup']) ay -= 1;
      if(keys['s']||keys['arrowdown']) ay += 1;
      if(keys['a']||keys['arrowleft']) ax -= 1;
      if(keys['d']||keys['arrowright']) ax += 1;

      if(ax||ay){
        const m = Math.hypot(ax,ay);
        ax/=m; ay/=m;
        this.vx += ax*this.speed*dt;
        this.vy += ay*this.speed*dt;
      } else {
        this.vx *= (1 - Math.min(dt*7, 0.9));
        this.vy *= (1 - Math.min(dt*7, 0.9));
      }

      const sp = Math.hypot(this.vx,this.vy);
      if(sp > this.speed){ this.vx=(this.vx/sp)*this.speed; this.vy=(this.vy/sp)*this.speed; }

      this.x += this.vx*dt; this.y += this.vy*dt;
      this.x = clamp(this.x, 24, W-24); this.y = clamp(this.y, 24, H-24);

      const now = performance.now();
      const rate = this.getFireRate();
      if(mouse.down && now - state.lastShot > rate){ state.lastShot = now; this.fire(); }
    }
    fire(){
      const ang = Math.atan2(mouse.y - this.y, mouse.x - this.x);
      const lvl = this.weaponLevel;
      if(this.weapon==='blaster'){
        spawnBullet(this.x,this.y,ang,700+lvl*40,7,'player');
      } else if(this.weapon==='rapid'){
        spawnBullet(this.x,this.y,ang,860,5,'player');
      } else if(this.weapon==='shotgun'){
        const pellets = 4 + lvl;
        for(let i=0;i<pellets;i++){
          const a = ang + rand(-0.26,0.26);
          spawnBullet(this.x,this.y,a,520,6,'player');
        }
      } else if(this.weapon==='spread'){
        for(let s=-1;s<=1;s++){
          spawnBullet(this.x,this.y,ang + s*0.22,640,6,'player');
        }
      }

      // muzzle particles
      for(let i=0;i<8;i++){
        state.particles.push(new Particle(
          this.x + Math.cos(ang)*18,
          this.y + Math.sin(ang)*18,
          Math.cos(ang)*rand(40,240)+rand(-120,120),
          Math.sin(ang)*rand(40,240)+rand(-120,120),
          0.45+Math.random()*0.6,
          '#ffd89b'
        ));
      }
    }
    getFireRate(){ if(this.weapon==='rapid') return 70 - this.weaponLevel*5; if(this.weapon==='shotgun') return 480 - this.weaponLevel*18; return 200 - this.weaponLevel*8; }
    draw(){
      ctx.save();
      ctx.translate(this.x,this.y);
      const ang = Math.atan2(mouse.y - this.y, mouse.x - this.x);
      ctx.rotate(ang);

      // ship body
      ctx.beginPath();
      ctx.moveTo(18,0); ctx.quadraticCurveTo(-4,12,-12,6); ctx.quadraticCurveTo(-6,0,-12,-6); ctx.quadraticCurveTo(-4,-12,18,0);
      ctx.fillStyle='#cfefff'; ctx.fill();
      // cockpit
      ctx.beginPath(); ctx.arc(2,0,5,0,Math.PI*2); ctx.fillStyle='#0b4060'; ctx.fill();
      ctx.restore();
    }
  }

  class Bullet {
    constructor(x,y,ang,speed,radius,owner){
      this.x=x; this.y=y; this.vx=Math.cos(ang)*speed; this.vy=Math.sin(ang)*speed;
      this.radius=radius; this.owner=owner; this.life=2.2;
    }
    update(dt){ this.x+=this.vx*dt; this.y+=this.vy*dt; this.life-=dt; }
    draw(){
      ctx.beginPath(); ctx.arc(this.x,this.y,this.radius,0,Math.PI*2);
      ctx.fillStyle = (this.owner==='player') ? '#b6ffdb' : '#ffccd5'; ctx.fill();
    }
  }

  class Enemy {
    constructor(x,y,type=0){
      this.x=x; this.y=y; this.vx=0; this.vy=0; this.type=type;
      this.radius = (type===2)?26:16;
      this.hp = (type===2)?220:40;
      this.speed = (type===2)?70:120; this.lastShot=0;
    }
    update(dt){
      const p = state.player;
      if(!p) return;
      const a = angleTo(this,p);
      // behavior by type
      if(this.type===0){
        this.vx += Math.cos(a)*this.speed*dt*0.8; this.vy += Math.sin(a)*this.speed*dt*0.8;
        this.vx *= 0.9; this.vy *= 0.9;
      } else if(this.type===1){
        const d = dist(this,p);
        if(d < 240){ this.vx += Math.cos(a+Math.PI)*this.speed*dt*0.7; this.vy += Math.sin(a+Math.PI)*this.speed*dt*0.7; }
        else { this.vx += Math.cos(a)*this.speed*dt*0.25; this.vy += Math.sin(a)*this.speed*dt*0.25; }
        const now = performance.now();
        if(now - this.lastShot > 1200){
          this.lastShot = now;
          spawnBullet(this.x,this.y, a + rand(-0.12,0.12), 360, 7, 'enemy');
        }
      } else {
        const d = dist(this,p); if(d>120){ this.vx += Math.cos(a)*this.speed*dt*0.5; this.vy += Math.sin(a)*this.speed*dt*0.5; }
        this.vx *= 0.92; this.vy *= 0.92;
      }
      this.x += this.vx*dt; this.y += this.vy*dt;
      this.x = clamp(this.x, 12, W-12); this.y = clamp(this.y, 12, H-12);
    }
    draw(){
      ctx.save(); ctx.translate(this.x,this.y);
      // body
      ctx.beginPath();
      ctx.moveTo(0,-this.radius);
      ctx.quadraticCurveTo(this.radius*1.1, -this.radius*0.3, this.radius, 0);
      ctx.quadraticCurveTo(this.radius*0.8, this.radius*0.7, 0, this.radius);
      ctx.quadraticCurveTo(-this.radius*0.8, this.radius*0.7, -this.radius, 0);
      ctx.quadraticCurveTo(-this.radius*1.1, -this.radius*0.3, 0, -this.radius);
      let color = (this.type===0)?'#ff8b70' : (this.type===1)?'#ffd36b' : '#ff6fb1';
      ctx.fillStyle=color; ctx.fill();
      // fins
      ctx.fillStyle='rgba(0,0,0,0.18)';
      ctx.fillRect(-this.radius*0.35, -6, this.radius*0.7, 4);
      // hp bar
      ctx.fillStyle='rgba(0,0,0,0.45)'; ctx.fillRect(-30, -this.radius-12, 60, 8);
      ctx.fillStyle='#5ce6a2'; const maxhp = (this.type===2)?220:40; const w = clamp(60*(this.hp/maxhp),0,60);
      ctx.fillRect(-30, -this.radius-12, w, 8);
      ctx.restore();
    }
  }

  class Particle {
    constructor(x,y,vx,vy,life,color){
      this.x=x; this.y=y; this.vx=vx; this.vy=vy; this.life=life; this.maxLife=life; this.color=color;
    }
    update(dt){ this.x+=this.vx*dt; this.y+=this.vy*dt; this.vx*=1-dt*0.6; this.vy*=1-dt*0.6; this.life-=dt; }
    draw(){ const t = clamp(this.life/this.maxLife,0,1); ctx.globalAlpha=t; ctx.fillStyle=this.color; ctx.fillRect(this.x-1.5,this.y-1.5,3,3); ctx.globalAlpha=1 }
  }

  function spawnBullet(x,y,ang,speed,radius,owner){ state.bullets.push(new Bullet(x,y,ang,speed,radius,owner)); }

  /* ------------------------------ Spawn / Waves ------------------------------ */
  function spawnWave(wave){
    const count = 3 + Math.floor(wave*1.6);
    for(let i=0;i<count;i++){
      const angle = Math.random()*Math.PI*2;
      const distFromCenter = rand(160, Math.min(W,H)/2 - 30);
      const ex = W/2 + Math.cos(angle)*distFromCenter;
      const ey = H/2 + Math.sin(angle)*distFromCenter;
      let type=0; const r = Math.random();
      if(wave>6 && r<0.18) type=2; else if(wave>3 && r<0.36) type=1;
      const e = new Enemy(ex,ey,type);
      state.enemies.push(e);
    }
    // background particles
    for(let i=0;i<40;i++){
      state.particles.push(new Particle(rand(0,W), rand(0,H), rand(-6,6), rand(-6,6), rand(1.2,3.2), 'rgba(255,255,255,0.03)'))
    }
  }

  /* ------------------------------ Cloud (Leaderboard) ------------------------------ */
  function saveHighScoreCloud(playerName, score){
    const url = window.location.origin + "/save-score";
    fetch(url, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({name:playerName, score:score}) } )
      .then(r=>r.json()).then(d=> console.log("Cloud save:", d)).catch(e=> console.warn("Cloud save fail", e));
  }

  async function loadHighScores(){
    const url = window.location.origin + "/get-highscores";
    try{
      const res = await fetch(url);
      if(!res.ok) return [];
      const data = await res.json();
      return data;
    } catch(e){ return []; }
  }

  /* ------------------------------ Overlay Helpers ------------------------------ */
  function openShop(){
    state.paused = true; state.shopOpen = true;
    overlay.classList.remove('hidden');
    const html = `
      <h2>Interstellar Shop</h2>
      <p>Spend scrap to upgrade! (icons: 🚀 weapon, ❤️ health, 🛠 hull)</p>
      <div class="shop-grid">
        <div class="shop-item">
          <div class="icon">❤️</div>
          <div>+30 Max HP</div>
          <div style="color:var(--muted)">Cost: 25</div>
          <button id="buy_hp">Buy</button>
        </div>
        <div class="shop-item">
          <div class="icon">🚀</div>
          <div>Upgrade Weapon</div>
          <div style="color:var(--muted)">Cost: 40</div>
          <button id="buy_wpn">Upgrade</button>
        </div>
        <div class="shop-item">
          <div class="icon">🛠</div>
          <div>Heal +40 HP</div>
          <div style="color:var(--muted)">Cost: 18</div>
          <button id="buy_heal">Heal</button>
        </div>
      </div>
      <div style="margin-top:12px">Scrap: <strong id="shopScrap">${state.scrap}</strong></div>
      <div style="margin-top:12px"><button id="shopClose" class="small-btn">Continue</button></div>
      `;
    overlayContent.innerHTML = html;

    document.getElementById('buy_hp').onclick = () => {
      if(state.scrap >= 25){ state.scrap -= 25; state.player.maxHp += 30; state.player.hp += 30; updateUI(); openShop(); }
    };
    document.getElementById('buy_wpn').onclick = () => {
      if(state.scrap >= 40){ state.scrap -= 40; state.player.weaponLevel++; updateUI(); openShop(); }
    };
    document.getElementById('buy_heal').onclick = () => {
      if(state.scrap >= 18){ state.scrap -= 18; state.player.hp = clamp(state.player.hp+40, 0, state.player.maxHp); updateUI(); openShop(); }
    };
    document.getElementById('shopClose').onclick = () => { overlay.classList.add('hidden'); state.shopOpen=false; state.paused=false; };
  }

  async function openLeaderboard(){
    state.paused=true; overlay.classList.remove('hidden');
    overlayContent.innerHTML = `<h2>Leaderboard</h2><p>Fetching...</p>`;
    const data = await loadHighScores();
    if(!data || data.length===0){ overlayContent.innerHTML = `<h2>Leaderboard</h2><p>No scores yet</p><div style="margin-top:10px"><button id="lbClose" class="small-btn">Close</button></div>`; document.getElementById('lbClose').onclick = ()=>{overlay.classList.add('hidden'); state.paused=false}; return; }
    let html = `<h2>Leaderboard</h2><div class="leaderboard-list">`;
    data.forEach((r, idx)=> html += `<p>${idx+1}. <strong>${r.name}</strong> — Wave ${r.score}</p>`);
    html += `</div><div style="margin-top:12px"><button id="lbClose" class="small-btn">Close</button></div>`;
    overlayContent.innerHTML = html;
    document.getElementById('lbClose').onclick = ()=>{overlay.classList.add('hidden'); state.paused=false};
  }

  /* ------------------------------ Game Over ------------------------------ */
  function gameOver(){
    state.running=false;
    overlay.classList.remove('hidden');
    overlayContent.innerHTML = `
      <h2>You Died</h2>
      <p>Wave: ${state.wave}</p>
      <p>Scrap: ${state.scrap}</p>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:10px">
        <button id="restart" class="small-btn">Restart (Keep Scrap)</button>
        <button id="restartFresh" class="small-btn">Restart Fresh</button>
      </div>
      <div id="leaderboardArea" style="margin-top:14px"></div>
    `;
    document.getElementById('restart').onclick = ()=>{ overlay.classList.add('hidden'); restart(false) };
    document.getElementById('restartFresh').onclick = ()=>{ overlay.classList.add('hidden'); restart(true) };

    const name = (playerNameInput && playerNameInput.value.trim().length>0) ? playerNameInput.value.trim() : "Player";
    saveHighScoreCloud(name, state.wave);
    // load and show leaderboard
    loadHighScores().then(list=>{
      const area = document.getElementById('leaderboardArea');
      if(!area) return;
      if(!list || list.length===0){ area.innerHTML = "<p>No scores yet</p>"; return; }
      let html = "<h3 style='color:var(--accent)'>Top Scores</h3>";
      html += '<div class="leaderboard-list">';
      list.forEach((r,idx)=> html += `<p>${idx+1}. <strong>${r.name}</strong> — Wave ${r.score}</p>`);
      html += '</div>';
      area.innerHTML = html;
    });
  }

  /* ------------------------------ Game Loop ------------------------------ */
  function update(dt){
    state.player.update(dt);

    // bullets
    for(let i=state.bullets.length-1;i>=0;i--){
      const b = state.bullets[i]; b.update(dt);
      if(b.life <= 0){ state.bullets.splice(i,1); continue; }
      if(b.owner === 'player'){
        for(let j=state.enemies.length-1;j>=0;j--){
          const e = state.enemies[j];
          if(dist(b,e) < b.radius + e.radius){
            e.hp -= 10 + state.player.weaponLevel*6;
            // hit particles
            for(let k=0;k<8;k++) state.particles.push(new Particle(b.x, b.y, rand(-200,200), rand(-200,200), 0.5+Math.random()*0.6, '#ffb3b3'));
            if(e.hp <= 0){
              state.scrap += 4 + Math.floor(Math.random()*6) + state.wave;
              // death particles
              for(let k=0;k<20;k++) state.particles.push(new Particle(e.x, e.y, rand(-220,220), rand(-220,220), 0.8, '#ffd36b'));
              state.enemies.splice(j,1);
            }
            state.bullets.splice(i,1);
            break;
          }
        }
      } else {
        if(dist(b, state.player) < b.radius + state.player.radius){
          state.player.hp -= 10;
          state.bullets.splice(i,1);
          if(state.player.hp <= 0){ gameOver(); return; }
        }
      }
    }

    // enemies movement & collisions
    for(let i=state.enemies.length-1;i>=0;i--){
      const e = state.enemies[i];
      e.update(dt);
      if(dist(e, state.player) < e.radius + state.player.radius){
        state.player.hp -= 18*dt + 1;
        if(state.player.hp <= 0){ gameOver(); return; }
      }
    }

    // particles
    for(let i=state.particles.length-1;i>=0;i--){ const p=state.particles[i]; p.update(dt); if(p.life<=0) state.particles.splice(i,1); }

    // next wave
    if(state.enemies.length === 0){
      state.wave++;
      spawnWave(state.wave);
    }

    // UI
    hpEl.textContent = `HP: ${Math.max(0, Math.round(state.player.hp))}/${state.player.maxHp}`;
    scrapEl.textContent = `Scrap: ${state.scrap}`;
    levelEl.textContent = `Wave: ${state.wave}`;
  }

  function render(){
    ctx.clearRect(0,0,W,H);

    // subtle grid background
    ctx.save(); ctx.globalAlpha = 0.06; ctx.strokeStyle = '#ffffff';
    for(let x=0;x<W;x+=28){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for(let y=0;y<H;y+=28){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    ctx.restore();

    // particles, enemies, bullets, player
    state.particles.forEach(p=>p.draw());
    state.enemies.forEach(e=>e.draw());
    state.bullets.forEach(b=>b.draw());
    state.player.draw();

    // mouse aim cursor
    ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 6, 0, Math.PI*2); ctx.strokeStyle='#9be3ff'; ctx.lineWidth=1.6; ctx.stroke();
  }

  /* ------------------------------ Restart ------------------------------ */
  function restart(fresh){
    state.enemies = []; state.bullets = []; state.particles = [];
    state.player.x = W/2; state.player.y = H/2; state.player.vx=0; state.player.vy=0;
    if(fresh){ state.wave = 1; state.scrap = 0; state.player.maxHp = 130; state.player.hp = state.player.maxHp; state.player.weaponLevel = 1; }
    else state.player.hp = state.player.maxHp;
    state.running = true; state.paused = false;
    spawnWave(state.wave);
    overlay.classList.add('hidden');
  }

  /* ------------------------------ Initialization ------------------------------ */
  let lastTime = performance.now();
  function tick(now){
    const dt = Math.min(0.05, (now - lastTime)/1000); lastTime = now;
    if(!state.paused && state.running) update(dt);
    render(); requestAnimationFrame(tick);
  }

  function bootstrap(){
    state.player = new Player(W/2, H/2);
    // try load saved state
    const saved = loadState();
    if(saved){
      state.wave = saved.wave || state.wave; state.scrap = saved.scrap || state.scrap;
      state.player.maxHp = saved.player?.maxHp || state.player.maxHp; state.player.hp = saved.player?.hp || state.player.hp;
      state.player.weapon = saved.player?.weapon || state.player.weapon; state.player.weaponLevel = saved.player?.weaponLevel || state.player.weaponLevel;
    }
    spawnWave(state.wave);
    lastTime = performance.now();
    requestAnimationFrame(tick);
  }

  /* ------------------------------ Save loop ------------------------------ */
  setInterval(()=> {
    const s = { wave: state.wave, scrap: state.scrap, player: { maxHp: state.player.maxHp, hp: state.player.hp, weapon: state.player.weapon, weaponLevel: state.player.weaponLevel } };
    saveState(s);
  }, 6000);

  /* ------------------------------ UI handlers ------------------------------ */
  pauseBtn.onclick = ()=> { state.paused = !state.paused; pauseBtn.textContent = state.paused ? "Resume" : "Pause"; };
  shopBtn.onclick = openShop;
  leaderboardBtn.onclick = openLeaderboard;

  /* ------------------------------ Network utilities for manual testing ------------------------------ */
  window.__TEST_SAVE = (n, s) => saveHighScoreCloud(n || "Manual", s || 1);
  window.__TEST_FETCH = () => loadHighScores().then(d => console.log(d));

  /* ------------------------------ Final bootstrap ------------------------------ */
  bootstrap();

})();
