(() => {
  'use strict';

  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const bossWallpaper = document.querySelector('#boss-wallpaper');
  const bossWallpaperCtx = bossWallpaper.getContext('2d');
  const bossArts = Array.from({length:5},(_,i)=>{const image=new Image();image.src=`assets/boss-floor-${i+1}.png`;return image;});
  const $ = s => document.querySelector(s);
  const ui = {
    start: $('#start-screen'), character: $('#character-screen'), upgrade: $('#upgrade-screen'), pause: $('#pause-screen'), gameover: $('#gameover-screen'),
    cards: $('#upgrade-cards'), floor: $('#wave-value'), room: $('#timer-value'), livesText: $('#hp-text'), lifePips: [...document.querySelectorAll('#life-pips i')],
    xp: $('#xp-fill'), xpText: $('#xp-text'), level: $('#level-value'), kills: $('#kills-value'), rooms: $('#credits-value'),
    banner: $('#wave-banner'), bossBar: $('#boss-bar'), bossFill: $('#boss-fill'), bossName: $('#boss-name'), bossIntro: $('#boss-intro'),
    characterIdent: $('#character-ident'), fps: $('#fps-value')
  };

  const TAU = Math.PI * 2;
  const ROOM_W = 820, ROOM_H = 520, DOOR = 120;
  const keys = new Set();
  const mouse = { x: 0, y: 0, down: false };
  const touchInput = { moveX:0, moveY:0, aimX:1, aimY:0, aiming:false };
  let W = 1280, H = 720, dpr = 1, last = performance.now(), viewScale = 1, viewX = 0, viewY = 0;
  let fpsFrames = 0, fpsClock = 0, audioCtx = null, soundOn = true, musicTimer = null, musicStep = 0;

  const floorLayouts = [
    [
      { gx:0, gy:0, type:'normal', start:true }, { gx:1, gy:0, type:'normal' }, { gx:2, gy:0, type:'reward' },
      { gx:1, gy:1, type:'normal' }, { gx:2, gy:1, type:'normal' }, { gx:3, gy:1, type:'boss' }
    ],
    [
      { gx:0, gy:1, type:'normal', start:true }, { gx:0, gy:0, type:'normal' }, { gx:1, gy:0, type:'reward' },
      { gx:0, gy:2, type:'normal' }, { gx:1, gy:2, type:'normal' }, { gx:2, gy:2, type:'normal' }, { gx:2, gy:1, type:'boss' }
    ],
    [
      { gx:1, gy:1, type:'normal', start:true }, { gx:0, gy:1, type:'normal' }, { gx:0, gy:0, type:'reward' },
      { gx:1, gy:0, type:'normal' }, { gx:2, gy:1, type:'normal' }, { gx:2, gy:2, type:'normal' },
      { gx:1, gy:2, type:'normal' }, { gx:3, gy:2, type:'boss' }
    ],
    [
      { gx:0, gy:0, type:'normal', start:true }, { gx:1, gy:0, type:'normal' }, { gx:2, gy:0, type:'normal' },
      { gx:0, gy:1, type:'reward' }, { gx:1, gy:1, type:'normal' }, { gx:2, gy:1, type:'normal' },
      { gx:1, gy:2, type:'normal' }, { gx:2, gy:2, type:'boss' }
    ],
    [
      { gx:2, gy:0, type:'normal', start:true }, { gx:1, gy:0, type:'normal' }, { gx:0, gy:0, type:'reward' },
      { gx:2, gy:1, type:'normal' }, { gx:1, gy:1, type:'normal' }, { gx:0, gy:1, type:'normal' },
      { gx:0, gy:2, type:'normal' }, { gx:1, gy:2, type:'normal' }, { gx:2, gy:2, type:'boss' }
    ]
  ];

  const roomNames = { normal:'普通房', reward:'奖励房', boss:'BOSS 房' };
  const bossProfiles = [
    { cn:'霓虹屠夫', en:'THE NEON BUTCHER', skill:'预警斩击 · 旋刃封路 · 猎犬释放' },
    { cn:'虚空执政官', en:'THE NULL ARCHON', skill:'收缩弹环 · 距离控制 · 守卫节点' },
    { cn:'熔炉暴君', en:'THE FORGE TYRANT', skill:'超载冲锋 · 熔岩地雷 · 重装增援' },
    { cn:'量子教宗', en:'THE QUANTUM PRELATE', skill:'相位传送 · 螺旋弹幕 · 镜像增殖' },
    { cn:'终焉收割者', en:'THE FINAL REAPER', skill:'死亡突进 · 交错镰线 · 收割军团' }
  ];
  const state = {
    mode:'menu', floor:0, rooms:[], current:null, bullets:[], enemyBullets:[], hazards:[], particles:[], texts:[], shockwaves:[],
    kills:0, totalTime:0, screenShake:0, flash:0, pendingLevels:0, transition:0, roomGrace:0, character:'pulse'
  };

  const player = {
    x:0, y:0, r:17, speed:255, lives:3, maxLives:3, xp:0, level:1, nextXp:8,
    damage:24, fireRate:4.2, bulletSpeed:690, projectileCount:1, pierce:0, armor:0, crit:.08,
    cooldown:0, invuln:0, aim:0, weapon:'脉冲手枪', color:'#39f6ff'
  };

  const characters = {
    pulse:{ weapon:'脉冲手枪', color:'#39f6ff', speed:255, damage:26, fireRate:4.2, projectileCount:1, pierce:0, crit:.08 },
    razor:{ weapon:'双持微冲', color:'#ff2f92', speed:290, damage:14, fireRate:7.2, projectileCount:2, pierce:0, crit:.12 },
    bastion:{ weapon:'磁轨重炮', color:'#f8ee55', speed:215, damage:62, fireRate:1.55, projectileCount:1, pierce:2, crit:.06 }
  };

  const upgrades = [
    { icon:'DMG', name:'超频弹头', desc:'武器伤害 +25%', tag:'DAMAGE +25%', apply:()=>player.damage*=1.25 },
    { icon:'RPM', name:'神经扳机', desc:'攻击速度 +22%', tag:'FIRE RATE +22%', apply:()=>player.fireRate*=1.22 },
    { icon:'SPD', name:'磁悬浮关节', desc:'移动速度 +15%', tag:'MOVE SPEED +15%', apply:()=>player.speed*=1.15 },
    { icon:'LIF', name:'备用神经', desc:'恢复 1 格生命（不会超过 3 格）', tag:'RESTORE +1 LIFE', apply:()=>player.lives=Math.min(player.maxLives,player.lives+1) },
    { icon:'ARC', name:'分裂协议', desc:'额外发射 1 枚弹丸，单发伤害略降', tag:'PROJECTILES +1', apply:()=>{player.projectileCount++;player.damage*=.9;} },
    { icon:'PEN', name:'相位穿透', desc:'子弹可额外穿透 1 个敌人', tag:'PIERCE +1', apply:()=>player.pierce++ },
    { icon:'VEL', name:'轨道加速器', desc:'弹速 +30%，伤害 +8%', tag:'BALLISTICS UP', apply:()=>{player.bulletSpeed*=1.3;player.damage*=1.08;} },
    { icon:'ARM', name:'冲击缓冲层', desc:'受击无敌时间延长 35%', tag:'I-FRAME +35%', apply:()=>player.armor+=.25 },
    { icon:'CRT', name:'红线瞄准镜', desc:'暴击率 +15%', tag:'CRIT +15%', apply:()=>player.crit+=.15 }
  ];

  const rewardUpgrades = [
    { icon:'RED', rarity:'EPIC', name:'红线反应堆', desc:'伤害 +45%，射速 +15%，但移动速度 -10%', tag:'DMG +45% · RPM +15% · SPD -10%', apply:()=>{player.damage*=1.45;player.fireRate*=1.15;player.speed*=.9;} },
    { icon:'TWN', rarity:'RARE', name:'双核枪机', desc:'额外发射 1 枚弹丸，但单发伤害 -18%', tag:'PROJECTILE +1 · DMG -18%', apply:()=>{player.projectileCount++;player.damage*=.82;} },
    { icon:'KIN', rarity:'RARE', name:'动能外骨骼', desc:'移动速度 +22%，射速 +12%，但伤害 -10%', tag:'SPD +22% · RPM +12% · DMG -10%', apply:()=>{player.speed*=1.22;player.fireRate*=1.12;player.damage*=.9;} },
    { icon:'SGE', rarity:'EPIC', name:'攻城框架', desc:'伤害 +65% 且穿透 +2，但射速 -30%、移速 -12%', tag:'DMG +65% · PEN +2 · RPM -30%', apply:()=>{player.damage*=1.65;player.pierce+=2;player.fireRate*=.7;player.speed*=.88;} },
    { icon:'GHO', rarity:'EPIC', name:'幽灵处理器', desc:'暴击率 +30%，移速 +15%，但基础伤害 -15%', tag:'CRIT +30% · SPD +15% · DMG -15%', apply:()=>{player.crit+=.3;player.speed*=1.15;player.damage*=.85;} },
    { icon:'TMP', rarity:'RARE', name:'时间缓冲器', desc:'受击无敌时间 +0.65 秒，但射速 -10%', tag:'I-FRAME +0.65S · RPM -10%', apply:()=>{player.armor+=.65;player.fireRate*=.9;} },
    { icon:'NAN', rarity:'STANDARD', name:'纳米储备舱', desc:'恢复全部生命，并永久获得 12% 伤害', tag:'FULL REPAIR · DMG +12%', apply:()=>{player.lives=player.maxLives;player.damage*=1.12;} },
    { icon:'CAS', rarity:'EPIC', name:'级联扳机', desc:'射速 +45%、弹速 +25%，但伤害 -25%', tag:'RPM +45% · VEL +25% · DMG -25%', apply:()=>{player.fireRate*=1.45;player.bulletSpeed*=1.25;player.damage*=.75;} },
    { icon:'PHA', rarity:'RARE', name:'相位校准镜', desc:'穿透 +2、暴击率 +18%，但移动速度 -8%', tag:'PEN +2 · CRIT +18% · SPD -8%', apply:()=>{player.pierce+=2;player.crit+=.18;player.speed*=.92;} }
  ];

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2); W = Math.max(320, r.width); H = Math.max(300, r.height);
    canvas.width = Math.floor(W*dpr); canvas.height = Math.floor(H*dpr); ctx.setTransform(dpr,0,0,dpr,0,0);
    bossWallpaper.width = Math.floor(W*dpr); bossWallpaper.height = Math.floor(H*dpr); bossWallpaperCtx.setTransform(dpr,0,0,dpr,0,0);
    if (!mouse.x) { mouse.x=W*.7; mouse.y=H*.5; }
  }

  function makeFloor(index) {
    return floorLayouts[index].map((r,i) => ({ ...r, id:i, x:r.gx*ROOM_W, y:r.gy*ROOM_H, visited:false, cleared:false, rewardTaken:false, enemies:[] }));
  }
  function roomAt(gx,gy) { return state.rooms.find(r=>r.gx===gx&&r.gy===gy); }
  function neighbors(room) {
    return [
      { dx:1,dy:0,side:'right',room:roomAt(room.gx+1,room.gy) }, { dx:-1,dy:0,side:'left',room:roomAt(room.gx-1,room.gy) },
      { dx:0,dy:1,side:'bottom',room:roomAt(room.gx,room.gy+1) }, { dx:0,dy:-1,side:'top',room:roomAt(room.gx,room.gy-1) }
    ].filter(n=>n.room);
  }

  function reset(characterId=state.character) {
    const build=characters[characterId]||characters.pulse;
    Object.assign(state,{ mode:'playing', floor:0, rooms:makeFloor(0), current:null, bullets:[], enemyBullets:[], hazards:[], particles:[], texts:[], shockwaves:[], kills:0, totalTime:0, screenShake:0, flash:0, pendingLevels:0, transition:0, roomGrace:0, character:characterId });
    Object.assign(player,{ x:0,y:0,r:17,speed:build.speed,lives:3,maxLives:3,xp:0,level:1,nextXp:8,damage:build.damage,fireRate:build.fireRate,bulletSpeed:690,projectileCount:build.projectileCount,pierce:build.pierce,armor:0,crit:build.crit,cooldown:0,invuln:0,aim:0,weapon:build.weapon,color:build.color });
    [ui.start,ui.character,ui.upgrade,ui.pause,ui.gameover].forEach(e=>e.classList.remove('visible'));
    startMusic();
    enterRoom(state.rooms.find(r=>r.start), true); updateUI(); beep(180,.08,'sawtooth',.04);
  }

  function enterRoom(room, initial=false) {
    state.current=room; room.visited=true; state.bullets=[]; state.enemyBullets=[]; state.hazards=[]; state.roomGrace=room.cleared||room.type==='reward'?0:1.6;
    if (initial) { player.x=room.x; player.y=room.y; }
    if (!room.cleared && !room.enemies.length) {
      if (room.type==='reward') { room.cleared=true; room.rewardTaken=true; setTimeout(()=>showUpgrades('奖励房：选择核心遗物',true),350); }
      else spawnRoom(room);
    }
    showRoomBanner(); updateUI();
  }

  function spawnRoom(room) {
    const count = room.type==='boss' ? 1 : 4 + state.floor*2 + room.id%3;
    if (room.type==='boss') {
      const hp=680+state.floor*520;
      const bossKind=state.floor%2,bossColors=['#ff2f92','#f8b84b','#ff7a20','#a56cff','#ff304d'],bossSides=[8,6,10,5,12];
      room.enemies.push({x:room.x,y:room.y-90,r:43,hp,maxHp:hp,speed:55+state.floor*3,damage:1,color:bossColors[state.floor],sides:bossSides[state.floor],type:'boss',bossKind,bossFloor:state.floor,xp:12+state.floor*3,hit:0,seed:1,shot:1.2,charge:2,skill:2.4,phase2:false,phaseInvuln:0});
      ui.bossBar.classList.remove('hidden'); showBossIntro();
      return;
    }
    for(let i=0;i<count;i++) {
      const roll=Math.random(); let type='drone',r=15,hp=38+state.floor*18,speed=78,damage=1,color='#ff2f92',xp=1;
      if(roll<.28){type='runner';r=11;hp=23+state.floor*10;speed=135;color='#f8ee55';}
      else if(roll>.82){type='tank';r=25;hp=105+state.floor*30;speed=48;color='#9d56ff';xp=3;}
      let x,y,tries=0;do{const edge=Math.floor(Math.random()*4);if(edge<2){x=room.x+(edge?1:-1)*(ROOM_W/2-75-Math.random()*45);y=room.y+(Math.random()-.5)*(ROOM_H-150);}else{x=room.x+(Math.random()-.5)*(ROOM_W-150);y=room.y+(edge===3?1:-1)*(ROOM_H/2-75-Math.random()*35);}tries++;}while(Math.hypot(x-player.x,y-player.y)<285&&tries<30);
      room.enemies.push({x,y,r,hp,maxHp:hp,speed,damage,color,type,xp,hit:0,seed:Math.random()*100,shot:1.3+Math.random()});
    }
  }

  function initAudio(){if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();audioCtx.resume();}
  function beep(freq,duration=.05,type='square',volume=.025){if(!soundOn||!audioCtx)return;const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.setValueAtTime(freq,audioCtx.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(40,freq*.72),audioCtx.currentTime+duration);g.gain.setValueAtTime(volume,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+duration);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+duration);}

  function musicTone(freq,duration,volume,type='sawtooth',slide=1){if(!soundOn||!audioCtx)return;const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.setValueAtTime(freq,audioCtx.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(35,freq*slide),audioCtx.currentTime+duration);g.gain.setValueAtTime(volume,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+duration);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+duration);}
  function musicTick(){
    if(!soundOn||!audioCtx||!['character','playing','paused','upgrade'].includes(state.mode))return;
    const absolute=musicStep++,step=absolute%16,bar=Math.floor(absolute/16)%4,floor=state.floor||0,boss=state.current?.type==='boss'&&!state.current.cleared;
    const roots=[55,61.74,49,58.27,46.25],root=roots[floor],floorMotifs=[[0,3,7,10,7,3,5,7],[0,7,10,12,10,7,3,5],[0,5,8,12,8,5,3,0],[0,3,8,11,8,15,11,8],[0,1,7,8,12,7,1,0]],bossMotifs=[[0,1,7,6,10,7,1,0],[0,6,7,13,12,7,6,1],[0,3,6,9,12,9,6,3],[0,1,8,7,13,8,1,0],[0,1,6,7,12,13,7,1]],motif=(boss?bossMotifs:floorMotifs)[floor];
    const kick=boss?[0,3,4,6,8,10,11,12,14]:[0,4,8,11,12];if(kick.includes(step))musicTone(step===0?122:104,.13,step===0?.04:.029,'sine',.33);
    if(step===4||step===12){musicTone(boss?205:188,.08,boss?.017:.013,'square',.46);musicTone(1250,.035,.004,'triangle',.68);}
    if(step%2===1)musicTone(boss&&step%4===3?3900:2850,.023,boss?.0048:.0031,'square',.76);if(step===7||boss&&step===15)musicTone(2100,.065,.0045,'square',.82);
    const bassSteps=boss?[0,2,3,6,8,9,11,14,15]:[0,3,6,8,10,13,14],bassIndex=bassSteps.indexOf(step);if(bassIndex>=0){const semitone=motif[(bassIndex+bar)%motif.length]%12;musicTone(root*Math.pow(2,semitone/12),step===15?.1:.2,boss?.016:.013,'sawtooth',boss?.86:.92);}
    if(step%2===0){const note=motif[(step/2+bar)%motif.length],freq=root*4*Math.pow(2,note/12);musicTone(freq,boss?.105:.088,boss?.0063:.0048,boss?'square':'triangle',1.012);}
    if(boss&&(step===6||step===14))musicTone(root*8*Math.pow(2,motif[bar+2]/12),.14,.005,'triangle',.74);if(step===15)musicTone(root*12,.075,.0038,'square',1.2);
  }
  function startMusic(){initAudio();if(!musicTimer){musicStep=0;musicTimer=setInterval(musicTick,114);}}

  function shoot(){
    const a=player.aim,count=player.projectileCount,spread=.12;
    for(let i=0;i<count;i++){const angle=a+(i-(count-1)/2)*spread;state.bullets.push({x:player.x+Math.cos(angle)*25,y:player.y+Math.sin(angle)*25,vx:Math.cos(angle)*player.bulletSpeed,vy:Math.sin(angle)*player.bulletSpeed,r:state.character==='bastion'?6:4,life:1.3,damage:player.damage,pierce:player.pierce,color:player.color,hit:new Set()});}
    burst(player.x+Math.cos(a)*27,player.y+Math.sin(a)*27,player.color,4,100);beep(state.character==='bastion'?250:440,.025,'square',.018);
  }
  function enemyShoot(e){const a=Math.atan2(player.y-e.y,player.x-e.x),count=e.type==='boss'?7:1;for(let i=0;i<count;i++){const q=a+(i-(count-1)/2)*(e.type==='boss'?.22:0),s=e.type==='boss'?250:205;state.enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(q)*s,vy:Math.sin(q)*s,r:e.type==='boss'?7:5,life:4,color:e.type==='boss'?e.color:'#ff2f92'});}}
  function radialBurst(e,count,speed,offset=0){for(let i=0;i<count;i++){const a=offset+i*TAU/count;state.enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,r:e.bossKind?7:6,life:4.5,color:e.color});}state.shockwaves.push({x:e.x,y:e.y,r:e.r,life:.45,color:e.color});state.screenShake=8;beep(105+e.bossFloor*18,.22,'sawtooth',.06);}
  function summonBossAdds(e){const counts=[4,4,2,5,5],count=counts[e.bossFloor];for(let i=0;i<count;i++){const a=i*TAU/count,radius=175+(i%2)*35,type=e.bossFloor===0?'runner':e.bossFloor===1?(i%2?'drone':'tank'):e.bossFloor===2?'tank':e.bossFloor===3?'drone':(i%2?'runner':'tank'),tank=type==='tank',drone=type==='drone';state.current.enemies.push({x:e.x+Math.cos(a)*radius,y:e.y+Math.sin(a)*radius,r:tank?22:drone?15:11,hp:tank?110:drone?48:36,maxHp:tank?110:drone?48:36,speed:tank?50:drone?78:138,damage:1,color:tank?'#9d56ff':drone?'#ff2f92':'#f8ee55',type,xp:tank?2:1,hit:0,seed:Math.random()*100,shot:1.4+Math.random()});}const names=['猎犬释放','守卫节点','重装增援','镜像增殖','收割军团'];floatText(e.x,e.y-e.r-20,names[e.bossFloor],e.color);}
  function addLineHazard(x,y,angle,length,width,delay,color){state.hazards.push({kind:'line',x,y,angle,length,width,life:delay,maxLife:delay,color});}
  function addCircleHazard(x,y,r,delay,color,mode='blast',count=14){state.hazards.push({kind:'circle',x,y,r,life:delay,maxLife:delay,color,mode,count});}
  function resolveHazard(h){
    if(h.kind==='line'){const dx=player.x-h.x,dy=player.y-h.y,localX=Math.cos(h.angle)*dx+Math.sin(h.angle)*dy,localY=-Math.sin(h.angle)*dx+Math.cos(h.angle)*dy;if(Math.abs(localX)<h.length/2&&Math.abs(localY)<h.width/2)hitPlayer();for(let i=0;i<12;i++){const q=(i/11-.5)*h.length;burst(h.x+Math.cos(h.angle)*q,h.y+Math.sin(h.angle)*q,h.color,2,80);}}
    else if(h.mode==='ringIn'){const gap=Math.floor(Math.random()*h.count);for(let i=0;i<h.count;i++){if(i===gap||i===(gap+1)%h.count)continue;const a=i*TAU/h.count,x=h.x+Math.cos(a)*h.r,y=h.y+Math.sin(a)*h.r;state.enemyBullets.push({x,y,vx:-Math.cos(a)*225,vy:-Math.sin(a)*225,r:6,life:3,color:h.color});}}
    else{if(Math.hypot(player.x-h.x,player.y-h.y)<h.r)hitPlayer();for(let i=0;i<h.count;i++){const a=i*TAU/h.count;state.enemyBullets.push({x:h.x,y:h.y,vx:Math.cos(a)*185,vy:Math.sin(a)*185,r:5,life:3,color:h.color});}burst(h.x,h.y,h.color,18,210);}
    state.screenShake=Math.max(state.screenShake,7);beep(95,.12,'sawtooth',.045);
  }
  function bossSkill(e){
    const f=e.bossFloor,base=Math.atan2(player.y-e.y,player.x-e.x),fast=e.phase2;
    if(f===0){const count=fast?6:4;for(let i=0;i<count;i++)addLineHazard(player.x+(Math.random()-.5)*90,player.y+(Math.random()-.5)*90,base+i*Math.PI/count,fast?390:330,fast?34:29,fast?.52:.76,'#ff2f92');}
    else if(f===1){addCircleHazard(player.x,player.y,fast?205:165,fast?.68:.92,'#f8b84b','ringIn',fast?22:16);}
    else if(f===2){e.charge=-.72;for(let i=0;i<(fast?4:2);i++)addCircleHazard(player.x+(Math.random()-.5)*230,player.y+(Math.random()-.5)*180,fast?54:46,fast?.72:1.02,'#ff7a20','blast',fast?10:8);}
    else if(f===3){const oldX=e.x,oldY=e.y;e.x=state.current.x+(Math.random()-.5)*(ROOM_W-190);e.y=state.current.y+(Math.random()-.5)*(ROOM_H-190);radialBurst(e,fast?20:14,fast?245:205,state.totalTime*.7);setTimeout(()=>{if(e.hp>0&&state.mode==='playing')radialBurst(e,fast?20:14,fast?225:185,state.totalTime*.7+.24);},320);state.shockwaves.push({x:oldX,y:oldY,r:28,life:.45,color:'#a56cff'});}
    else{const count=fast?5:3;for(let i=0;i<count;i++)addLineHazard(player.x,player.y,base+(i-(count-1)/2)*.5,430,fast?30:25,fast?.48:.7,'#ff304d');e.charge=-.62;}
  }
  function burst(x,y,color,count=8,speed=150){for(let i=0;i<count;i++){const a=Math.random()*TAU,s=speed*(.25+Math.random()*.75);state.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.2+Math.random()*.35,max:.55,color,size:1+Math.random()*3});}}
  function floatText(x,y,text,color='#fff',style='normal'){const crit=style==='crit',life=crit?1.3:.88;state.texts.push({x,y,text,color,life,maxLife:life,size:crit?26:18,crit});}

  function gainXp(v){player.xp+=v;while(player.xp>=player.nextXp){player.xp-=player.nextXp;player.level++;player.nextXp=Math.floor(7+player.level*4.2);state.pendingLevels++;}if(state.pendingLevels&&state.mode==='playing')showUpgrades('义体升级可用',false);}
  function showUpgrades(title,isReward=false){
    state.mode='upgrade';state.upgradeSource=isReward?'reward':'level';ui.upgrade.classList.remove('armed');ui.upgrade.classList.add('visible');$('#upgrade-title').textContent=title;ui.cards.innerHTML='';const cards=[],pool=isReward?rewardUpgrades:upgrades;
    [...pool].sort(()=>Math.random()-.5).slice(0,3).forEach((u,i)=>{const rarity=(u.rarity||'STANDARD').toLowerCase(),card=document.createElement('button');card.className=`upgrade-card ${rarity}`;card.disabled=true;card.innerHTML=`<span class="num">0${i+1}</span><span class="rarity">${u.rarity||'STANDARD'}</span><span class="icon">${u.icon}</span><h3>${u.name}</h3><p>${u.desc}</p><small>${u.tag}</small>`;card.onclick=()=>chooseUpgrade(u);ui.cards.appendChild(card);cards.push(card);});
    setTimeout(()=>{if(state.mode==='upgrade'){cards.forEach(card=>card.disabled=false);ui.upgrade.classList.add('armed');beep(560,.045,'sine',.018);}},500);
  }
  function chooseUpgrade(u){if(!ui.upgrade.classList.contains('armed'))return;u.apply();if(state.upgradeSource==='level'&&state.pendingLevels)state.pendingLevels--;ui.upgrade.classList.remove('visible','armed');state.mode='playing';beep(620,.15,'sine',.05);burst(player.x,player.y,'#39f6ff',28,230);if(state.pendingLevels)setTimeout(()=>showUpgrades('义体升级可用',false),150);updateUI();}

  function triggerBossPhase(e){e.phase2=true;e.phaseInvuln=2.2;e.hp=e.maxHp*.3;e.speed*=1.28;e.skill=1.1;e.charge=2;state.enemyBullets=[];state.hazards=[];summonBossAdds(e);state.screenShake=18;state.flash=.22;state.shockwaves.push({x:e.x,y:e.y,r:e.r,life:.8,color:'#f8ee55'});floatText(e.x,e.y-e.r-38,'FORM II // IMMUNE','#f8ee55');beep(48,.8,'sawtooth',.11);}
  function damageEnemy(e,amount,b){if(e.type==='boss'&&e.phaseInvuln>0){b.hit.add(e);b.pierce=0;burst(b.x,b.y,'#f8ee55',5,100);if(!e.immuneText||e.immuneText<=0){floatText(e.x,e.y-e.r,'IMMUNE','#f8ee55');e.immuneText=.18;}return;}const crit=Math.random()<player.crit;if(crit)amount*=2;if(e.type==='boss'&&!e.phase2&&e.hp-amount<=e.maxHp*.3){b.hit.add(e);b.pierce=0;triggerBossPhase(e);return;}e.hp-=amount;e.hit=.09;b.hit.add(e);burst(b.x,b.y,crit?'#f8ee55':'#39f6ff',crit?8:4,120);floatText(e.x,e.y-e.r,crit?`CRIT ${Math.round(amount)}`:Math.round(amount),crit?'#f8ee55':'#dffcff',crit?'crit':'normal');if(e.hp<=0)killEnemy(e);}
  function killEnemy(e){const room=state.current,idx=room.enemies.indexOf(e);if(idx>=0)room.enemies.splice(idx,1);if(e.type==='boss'){state.enemyBullets=[];state.hazards=[];ui.bossBar.classList.add('hidden');state.shockwaves.push({x:player.x,y:player.y,r:20,life:.65,color:'#39f6ff'});}state.kills++;gainXp(e.xp);burst(e.x,e.y,e.color,e.type==='boss'?40:14,e.type==='boss'?300:190);state.shockwaves.push({x:e.x,y:e.y,r:e.r,life:.35,color:e.color});state.screenShake=e.type==='boss'?16:5;if(!room.enemies.length){room.cleared=true;ui.bossBar.classList.add('hidden');showClearBanner();beep(150,.25,'sawtooth',.06);}else beep(150,.06,'sawtooth',.025);}
  function hitPlayer(){if(player.invuln>0)return;player.lives--;player.invuln=2+player.armor;state.screenShake=13;state.flash=.18;floatText(player.x,player.y-28,'LIFE -1 // 2s SHIELD','#ff2f92');burst(player.x,player.y,'#ff2f92',20,240);beep(75,.18,'sawtooth',.09);if(player.lives<=0)gameOver(false);updateUI();}

  function usePortal(){
    if(state.floor<floorLayouts.length-1){state.floor++;state.rooms=makeFloor(state.floor);const start=state.rooms.find(r=>r.start);player.x=start.x;player.y=start.y;enterRoom(start,true);state.transition=.5;beep(240+state.floor*35,.35,'sine',.06);}
    else gameOver(true);
  }
  function gameOver(win){state.mode='gameover';ui.gameover.classList.add('visible');const title=ui.gameover.querySelector('h1');title.textContent=win?'设施清除':'义体离线';title.style.color=win?'#39f6ff':'#ff2f92';$('#result-wave').textContent=state.floor+1;$('#result-kills').textContent=state.kills;const m=Math.floor(state.totalTime/60),s=Math.floor(state.totalTime%60);$('#result-time').textContent=`${m}:${String(s).padStart(2,'0')}`;beep(win?520:60,.7,win?'sine':'sawtooth',.1);}

  function movePlayer(dx,dy,dt){
    const room=state.current,halfW=ROOM_W/2-35,halfH=ROOM_H/2-35;let nx=player.x+dx*player.speed*dt,ny=player.y+dy*player.speed*dt;
    const localX=nx-room.x,localY=ny-room.y,open=room.cleared;
    const tryDoor=(gx,gy,side)=>{const next=roomAt(gx,gy);if(!next||!open)return false;if(side==='h'&&Math.abs(localY)<DOOR/2){player.x=next.x+(gx>room.gx?-halfW+8:halfW-8);player.y=next.y+localY;enterRoom(next);return true;}if(side==='v'&&Math.abs(localX)<DOOR/2){player.x=next.x+localX;player.y=next.y+(gy>room.gy?-halfH+8:halfH-8);enterRoom(next);return true;}return false;};
    if(localX>halfW){if(tryDoor(room.gx+1,room.gy,'h'))return;nx=room.x+halfW;}if(localX<-halfW){if(tryDoor(room.gx-1,room.gy,'h'))return;nx=room.x-halfW;}
    if(localY>halfH){if(tryDoor(room.gx,room.gy+1,'v'))return;ny=room.y+halfH;}if(localY<-halfH){if(tryDoor(room.gx,room.gy-1,'v'))return;ny=room.y-halfH;}
    player.x=nx;player.y=ny;
  }

  function update(dt){
    if(state.mode!=='playing')return;state.totalTime+=dt;state.transition=Math.max(0,state.transition-dt);state.roomGrace=Math.max(0,state.roomGrace-dt);player.cooldown-=dt;player.invuln=Math.max(0,player.invuln-dt);player.aim=touchInput.aiming?Math.atan2(touchInput.aimY,touchInput.aimX):Math.atan2(mouse.y-H/2,mouse.x-W/2);
    let dx=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+touchInput.moveX,dy=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+touchInput.moveY;if(dx||dy){const l=Math.hypot(dx,dy);movePlayer(dx/l,dy/l,dt);}
    if(mouse.down&&player.cooldown<=0){shoot();player.cooldown=1/player.fireRate;}

    for(const b of state.bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;for(const e of [...state.current.enemies]){if(!b.hit.has(e)&&Math.hypot(b.x-e.x,b.y-e.y)<b.r+e.r){damageEnemy(e,b.damage,b);if(b.pierce>0)b.pierce--;else{b.life=0;break;}}}}
    state.bullets=state.bullets.filter(b=>b.life>0);
    for(const b of state.enemyBullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(Math.hypot(b.x-player.x,b.y-player.y)<b.r+player.r){b.life=0;hitPlayer();}}
    state.enemyBullets=state.enemyBullets.filter(b=>b.life>0);
    for(const h of state.hazards){h.life-=dt;if(h.life<=0&&!h.fired){h.fired=true;resolveHazard(h);}}state.hazards=state.hazards.filter(h=>!h.fired);

    for(const e of state.current.enemies){if(e.immuneText>0)e.immuneText-=dt;if(state.roomGrace>0){e.hit=Math.max(0,e.hit-dt);continue;}if(e.type==='boss'&&e.phaseInvuln>0){e.phaseInvuln=Math.max(0,e.phaseInvuln-dt);e.hit=0;continue;}let a=Math.atan2(player.y-e.y,player.x-e.x);if(e.type==='runner')a+=Math.sin(state.totalTime*7+e.seed)*.28;let speed=e.speed;if(e.type==='boss'){
        const f=e.bossFloor,dist=Math.hypot(player.x-e.x,player.y-e.y),intervals=[2.35,2.9,2.65,2.45,2.15];e.skill-=dt;e.shot-=dt;if(e.skill<=0){bossSkill(e);e.skill=intervals[f]*(e.phase2?.7:1);}if((f===1||f===4)&&e.shot<=0){enemyShoot(e);e.shot=e.phase2?.68:1.18;}
        if(e.skill<.68)speed*=.08;
        if(f===0){speed*=.72;a+=Math.sin(state.totalTime*1.3)*.12;}
        else if(f===1){if(dist<225)a+=Math.PI;else if(dist<340)a+=Math.PI/2;speed*=.82;}
        else if(f===2){e.charge-=dt;if(e.charge<0){speed=e.phase2?245:205;if(e.charge<-1.08)e.charge=2.25;}}
        else if(f===3){if(dist<260)a+=Math.PI;else a+=Math.sin(state.totalTime*1.7)*.7;speed*=.88;}
        else{e.charge-=dt;a+=Math.sin(state.totalTime*2.2)*.24;if(e.charge<0){speed=e.phase2?285:235;if(e.charge<-1)e.charge=1.8;}}
      }else if(e.type==='drone'){e.shot-=dt;if(e.shot<=0&&Math.hypot(player.x-e.x,player.y-e.y)>180){enemyShoot(e);e.shot=2.1+Math.random();speed*=.25;}}
      e.x+=Math.cos(a)*speed*dt;e.y+=Math.sin(a)*speed*dt;e.hit=Math.max(0,e.hit-dt);if(Math.hypot(player.x-e.x,player.y-e.y)<player.r+e.r)hitPlayer();
      e.x=Math.max(state.current.x-ROOM_W/2+45,Math.min(state.current.x+ROOM_W/2-45,e.x));e.y=Math.max(state.current.y-ROOM_H/2+45,Math.min(state.current.y+ROOM_H/2-45,e.y));
    }
    if(state.current.type==='boss'&&state.current.cleared&&Math.hypot(player.x-state.current.x,player.y-state.current.y)<45)usePortal();
    for(const p of state.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.96;p.vy*=.96;p.life-=dt;}state.particles=state.particles.filter(p=>p.life>0);
    for(const t of state.texts){t.y-=(t.crit?24:38)*dt;t.life-=dt;}state.texts=state.texts.filter(t=>t.life>0);for(const s of state.shockwaves){s.r+=240*dt;s.life-=dt;}state.shockwaves=state.shockwaves.filter(s=>s.life>0);state.screenShake=Math.max(0,state.screenShake-35*dt);state.flash=Math.max(0,state.flash-dt);updateUI();
  }

  function prepareView(){const overview=state.current&&matchMedia('(pointer: coarse) and (orientation: landscape)').matches;viewScale=overview?Math.min(1,(W-20)/ROOM_W,(H-20)/ROOM_H):1;viewX=overview?state.current.x:player.x;viewY=overview?state.current.y:player.y;}
  const sx=x=>x-viewX+W/2, sy=y=>y-viewY+H/2;
  function polygon(x,y,r,n,rot=0){ctx.beginPath();for(let i=0;i<n;i++){const a=rot+i*TAU/n,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();}
  function drawWorld(){
    ctx.fillStyle='#030510';ctx.fillRect(0,0,W,H);if(!state.current){ctx.strokeStyle='rgba(57,246,255,.06)';for(let x=0;x<W;x+=52){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}for(let y=0;y<H;y+=52){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}return;}const room=state.current,cx=sx(room.x),cy=sy(room.y),left=cx-ROOM_W/2,top=cy-ROOM_H/2;
    ctx.fillStyle='#070b1b';ctx.fillRect(left,top,ROOM_W,ROOM_H);ctx.strokeStyle='rgba(57,246,255,.075)';ctx.lineWidth=1;for(let x=left;x<left+ROOM_W;x+=52){ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,top+ROOM_H);ctx.stroke();}for(let y=top;y<top+ROOM_H;y+=52){ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(left+ROOM_W,y);ctx.stroke();}
    const glow=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,360);glow.addColorStop(0,'rgba(20,90,120,.14)');glow.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
    ctx.strokeStyle=room.type==='boss'?'#ff2f92':room.type==='reward'?'#f8ee55':'#1d6b80';ctx.lineWidth=8;ctx.strokeRect(left,top,ROOM_W,ROOM_H);
    const locked=!room.cleared;for(const n of neighbors(room)){ctx.fillStyle=locked?'#ff2f92':'#39f6ff';ctx.shadowBlur=15;ctx.shadowColor=ctx.fillStyle;if(n.side==='left'||n.side==='right'){const x=n.side==='left'?left-5:left+ROOM_W-5;ctx.fillRect(x,cy-DOOR/2,10,DOOR);}else{const y=n.side==='top'?top-5:top+ROOM_H-5;ctx.fillRect(cx-DOOR/2,y,DOOR,10);}ctx.shadowBlur=0;}
    if(room.type==='boss'&&room.cleared){const pulse=26+Math.sin(state.totalTime*5)*6;ctx.strokeStyle='#f8ee55';ctx.lineWidth=4;ctx.shadowBlur=24;ctx.shadowColor='#f8ee55';ctx.beginPath();ctx.arc(cx,cy,pulse,0,TAU);ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle='#f8ee55';ctx.textAlign='center';ctx.font='700 10px Consolas';ctx.fillText(state.floor===0?'进入下一层':'完成任务',cx,cy-44);}
  }
  function drawPlayer(){
    const px=sx(player.x),py=sy(player.y);ctx.save();ctx.translate(px,py);ctx.rotate(player.aim);if(player.invuln>0&&Math.floor(player.invuln*18)%2===0)ctx.globalAlpha=.3;ctx.shadowBlur=22;ctx.shadowColor=player.color;ctx.fillStyle='#081827';ctx.strokeStyle=player.color;ctx.lineWidth=2;
    if(state.character==='razor'){polygon(0,0,player.r+1,4,Math.PI/4);ctx.fill();ctx.stroke();ctx.fillStyle=player.color;polygon(-13,-13,7,3);ctx.fill();polygon(-13,13,7,3);ctx.fill();ctx.fillRect(7,-8,27,5);ctx.fillRect(7,3,27,5);}
    else if(state.character==='bastion'){polygon(0,0,player.r+4,8,Math.PI/8);ctx.fill();ctx.stroke();ctx.fillStyle='rgba(248,238,85,.35)';ctx.fillRect(-15,-24,12,9);ctx.fillRect(-15,15,12,9);ctx.fillStyle=player.color;ctx.fillRect(7,-5,39,10);ctx.fillStyle='#fff';ctx.fillRect(37,-2,10,4);}
    else{polygon(0,0,player.r,6,Math.PI/6);ctx.fill();ctx.stroke();ctx.strokeStyle='rgba(57,246,255,.5)';ctx.beginPath();ctx.arc(0,0,player.r+5,-.7,.7);ctx.stroke();ctx.fillStyle=player.color;ctx.fillRect(7,-4,27,8);ctx.fillStyle='#fff';ctx.fillRect(25,-2,9,4);}
    ctx.rotate(-player.aim);ctx.shadowBlur=0;ctx.fillStyle=player.color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 10px Consolas';ctx.fillText(state.character==='pulse'?'P':state.character==='razor'?'R':'B',0,1);ctx.restore();
    if(state.roomGrace>0){ctx.strokeStyle=`rgba(57,246,255,${.25+state.roomGrace*.3})`;ctx.lineWidth=2;ctx.setLineDash([7,6]);ctx.beginPath();ctx.arc(px,py,48+Math.sin(state.totalTime*8)*3,0,TAU);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#39f6ff';ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.font='700 10px Consolas';ctx.fillText(`SAFE LINK ${state.roomGrace.toFixed(1)}s`,px,py-60);}
    else if(player.invuln>0){ctx.strokeStyle=`rgba(248,238,85,${.35+Math.min(1,player.invuln)*.45})`;ctx.lineWidth=3;ctx.shadowBlur=14;ctx.shadowColor='#f8ee55';ctx.beginPath();ctx.arc(px,py,34+Math.sin(state.totalTime*12)*3,0,TAU);ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle='#f8ee55';ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.font='900 9px Consolas';ctx.fillText(`INVULN ${player.invuln.toFixed(1)}s`,px,py-45);}
  }
  function drawEnemy(e){const x=sx(e.x),y=sy(e.y);ctx.save();ctx.translate(x,y);ctx.rotate(state.totalTime*(e.type==='runner'?3:.5)+e.seed);ctx.shadowBlur=e.type==='boss'?26:12;ctx.shadowColor=e.color;ctx.fillStyle=e.hit?'#fff':e.color;if(e.type==='runner'){polygon(0,0,e.r,3,Math.PI/2);ctx.fill();}else if(e.type==='tank'){polygon(0,0,e.r,6);ctx.globalAlpha=.75;ctx.fill();ctx.globalAlpha=1;ctx.fillStyle='#0a0d1b';polygon(0,0,e.r*.55,6);ctx.fill();}else if(e.type==='boss'){polygon(0,0,e.r,e.bossKind?6:8);ctx.globalAlpha=.75;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=e.bossKind?'#39f6ff':'#f8ee55';ctx.lineWidth=3;polygon(0,0,e.r*.72,e.bossKind?6:4,Math.PI/4);ctx.stroke();if(e.bossKind){for(let i=0;i<6;i++){ctx.rotate(TAU/6);ctx.fillStyle='#f8b84b';ctx.fillRect(e.r+4,-3,13,6);}}}else{ctx.globalAlpha=.75;polygon(0,0,e.r,4,Math.PI/4);ctx.fill();ctx.globalAlpha=1;ctx.fillStyle='#080b18';ctx.fillRect(-5,-5,10,10);}ctx.restore();if(e.type==='boss'){if(e.phase2){ctx.strokeStyle=`${e.color}88`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,e.r+12+Math.sin(state.totalTime*7)*4,0,TAU);ctx.stroke();}if(e.phaseInvuln>0){ctx.strokeStyle='#f8ee55';ctx.lineWidth=4;ctx.shadowBlur=22;ctx.shadowColor='#f8ee55';ctx.setLineDash([10,6]);ctx.beginPath();ctx.arc(x,y,e.r+25+Math.sin(state.totalTime*10)*5,0,TAU);ctx.stroke();ctx.setLineDash([]);ctx.shadowBlur=0;ctx.fillStyle='#f8ee55';ctx.textAlign='center';ctx.font='900 10px Consolas';ctx.fillText(`FORM SHIFT // ${e.phaseInvuln.toFixed(1)}s`,x,y-e.r-43);}else if(e.skill<.68){const p=Math.max(0,e.skill/.68);ctx.strokeStyle=e.bossKind?'#f8b84b':'#ff2f92';ctx.lineWidth=5;ctx.shadowBlur=15;ctx.shadowColor=ctx.strokeStyle;ctx.beginPath();ctx.arc(x,y,e.r+31,-Math.PI/2,-Math.PI/2+TAU*(1-p));ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle=ctx.strokeStyle;ctx.textAlign='center';ctx.font='900 9px Consolas';ctx.fillText('SKILL',x,y-e.r-42);}}else if(e.hp<e.maxHp){ctx.fillStyle='#02030a';ctx.fillRect(x-e.r,y-e.r-8,e.r*2,3);ctx.fillStyle=e.color;ctx.fillRect(x-e.r,y-e.r-8,e.r*2*Math.max(0,e.hp/e.maxHp),3);}}
  function drawMinimap(){if(!state.current)return;const scale=20,ox=W-125,oy=42;ctx.save();ctx.font='700 9px Consolas';ctx.textAlign='center';for(const r of state.rooms){const x=ox+r.gx*scale,y=oy+r.gy*scale;ctx.fillStyle=r===state.current?'#39f6ff':!r.visited?'#172234':r.type==='boss'?'#ff2f92':r.type==='reward'?'#f8ee55':r.cleared?'#426879':'#9f375f';ctx.fillRect(x-7,y-7,14,14);if(r===state.current){ctx.strokeStyle='#fff';ctx.strokeRect(x-9,y-9,18,18);}}ctx.fillStyle='#7192a5';ctx.fillText(`FLOOR ${state.floor+1} // MAP`,ox+25,oy-18);ctx.restore();}
  function drawHazard(h){const progress=1-h.life/h.maxLife,alpha=.1+progress*.38;ctx.save();ctx.translate(sx(h.x),sy(h.y));ctx.strokeStyle=h.color;ctx.fillStyle=h.color;ctx.shadowBlur=progress>0.7?18:7;ctx.shadowColor=h.color;if(h.kind==='line'){ctx.rotate(h.angle);ctx.globalAlpha=alpha;ctx.fillRect(-h.length/2,-h.width/2,h.length,h.width);ctx.globalAlpha=.7;ctx.lineWidth=2;ctx.setLineDash([12,8]);ctx.strokeRect(-h.length/2,-h.width/2,h.length,h.width);ctx.setLineDash([]);}else{ctx.globalAlpha=alpha;ctx.lineWidth=3+progress*3;ctx.beginPath();ctx.arc(0,0,h.r,0,TAU);ctx.stroke();ctx.globalAlpha=.08+progress*.12;ctx.beginPath();ctx.arc(0,0,h.r,0,TAU);ctx.fill();ctx.globalAlpha=.8;ctx.font='900 9px Consolas';ctx.textAlign='center';ctx.fillText(h.mode==='ringIn'?'CONVERGE':'BLAST',0,4);}ctx.restore();}
  function drawBossIdentity(e){const x=sx(e.x),y=sy(e.y),f=e.bossFloor,spin=state.totalTime*(e.phase2?2:1);ctx.save();ctx.translate(x,y);ctx.strokeStyle=e.color;ctx.fillStyle=e.color;ctx.lineWidth=2;ctx.shadowBlur=12;ctx.shadowColor=e.color;if(f===0){for(let i=0;i<4;i++){const a=spin+i*TAU/4;ctx.beginPath();ctx.arc(Math.cos(a)*58,Math.sin(a)*42,8,0,TAU);ctx.stroke();}}else if(f===1){for(let i=0;i<6;i++){const a=-spin*.45+i*TAU/6;polygonOn(ctx,Math.cos(a)*62,Math.sin(a)*45,5,6,a);ctx.fill();}}else if(f===2){ctx.fillRect(-66,-22,17,44);ctx.fillRect(49,-22,17,44);ctx.beginPath();ctx.arc(0,0,23+Math.sin(spin*3)*5,0,TAU);ctx.stroke();}else if(f===3){for(let i=0;i<5;i++){const a=spin*.35+i*TAU/5;polygonOn(ctx,Math.cos(a)*62,Math.sin(a)*48,7,4,Math.PI/4+a);ctx.stroke();}}else{ctx.beginPath();ctx.arc(-35,0,38,-1.2,1.2);ctx.arc(35,0,38,Math.PI-1.2,Math.PI+1.2);ctx.stroke();for(let i=0;i<8;i++){ctx.rotate(TAU/8);ctx.fillRect(50,-2,15,4);}}ctx.restore();}
  function renderBossWallpaper(t){
    if(!ui.bossIntro.classList.contains('visible'))return;const c=bossWallpaperCtx,art=bossArts[state.floor];c.clearRect(0,0,W,H);if(!art.complete||!art.naturalWidth)return;
    const iw=art.naturalWidth,ih=art.naturalHeight,cropH=Math.min(ih,iw/(W/H)),cropY=Math.max(0,(ih-cropH)*.3),breath=Math.sin(t*2.15),sway=Math.sin(t*.82),cx=W*.5,headY=H*.3;
    const drawArt=()=>c.drawImage(art,0,cropY,iw,cropH,0,0,W,H);
    c.save();c.filter='contrast(1.05) saturate(1.08)';drawArt();c.restore();
    c.save();c.beginPath();c.ellipse(cx,H*.6,W*.25,H*.36,0,0,TAU);c.clip();c.translate(cx,H*.82);c.scale(1+breath*.004,1+breath*.012);c.translate(-cx,-H*.82);drawArt();c.restore();
    c.save();c.beginPath();c.ellipse(cx,headY,W*.135,H*.17,0,0,TAU);c.clip();c.translate(sway*3,Math.sin(t*1.3)*1.5);drawArt();c.restore();
    const colors=['#ff2f92','#f8b84b','#ff7a20','#a56cff','#ff304d'],color=colors[state.floor],coreY=[.51,.48,.49,.46,.47][state.floor],pulse=.62+Math.sin(t*4.2)*.25;
    c.save();c.globalCompositeOperation='screen';let glow=c.createRadialGradient(cx,H*coreY,0,cx,H*coreY,70+breath*8);glow.addColorStop(0,color);glow.addColorStop(.18,`${color}bb`);glow.addColorStop(1,'transparent');c.globalAlpha=pulse;c.fillStyle=glow;c.fillRect(cx-100,H*coreY-100,200,200);
    const blinkPhase=t%4.1;if(blinkPhase>3.96){c.globalAlpha=.78;c.fillStyle='#02040b';c.fillRect(cx-W*.07,headY-3,W*.14,7);}
    c.globalAlpha=.75;c.strokeStyle=color;c.lineWidth=2;
    if(state.floor===0){for(let i=0;i<4;i++){const side=i%2?-1:1,x=cx+side*(W*.25+(i>1?60:0))+Math.sin(t*1.5+i)*8,y=H*(i>1?.7:.34)+Math.cos(t*1.2+i)*7;c.save();c.translate(x,y);c.rotate(t*(side)*1.8);c.beginPath();c.arc(0,0,22,0,TAU);c.stroke();for(let j=0;j<10;j++){c.rotate(TAU/10);c.fillRect(19,-2,9,4);}c.restore();}}
    else if(state.floor===1){for(let i=0;i<6;i++){const a=t*.38+i*TAU/6,r=W*.24,x=cx+Math.cos(a)*r,y=H*.47+Math.sin(a)*H*.24;c.fillStyle=color;polygonOn(c,x,y,7,6,a);c.fill();c.beginPath();c.moveTo(cx,H*coreY);c.lineTo(x,y);c.stroke();}}
    else if(state.floor===2){for(let i=0;i<34;i++){const seed=i*41.7,x=(Math.sin(seed)*.5+.5)*W,y=H-((t*(55+i%5*12)+seed*9)%H);c.globalAlpha=.2+(i%4)*.1;c.fillStyle=i%3?color:'#f8ee55';c.fillRect(x,y,2+(i%2)*2,7+i%5*3);}}
    else if(state.floor===3){for(let i=0;i<12;i++){const a=t*(i%2?.3:-.25)+i*TAU/12,r=95+(i%4)*36,x=cx+Math.cos(a)*r,y=H*.48+Math.sin(a)*r*.65;c.save();c.translate(x,y);c.rotate(a+t*.4);c.fillStyle=i%2?color:'#39f6ff';polygonOn(c,0,0,6+i%3*3,4,Math.PI/4);c.fill();c.restore();}}
    else{for(let i=0;i<8;i++){const a=-1.1+i*.31+Math.sin(t*.7+i)*.035,r=W*.28,x=cx+Math.cos(a)*r,y=H*.56+Math.sin(a)*r;c.save();c.translate(x,y);c.rotate(a+Math.PI/2+Math.sin(t+i)*.08);c.fillStyle=color;c.fillRect(-3,-28,6,56);c.restore();}}
    c.restore();
  }
  function polygonOn(target,x,y,r,n,rot=0){target.beginPath();for(let i=0;i<n;i++){const a=rot+i*TAU/n,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;i?target.lineTo(px,py):target.moveTo(px,py);}target.closePath();}
  function render(){
    prepareView();ctx.fillStyle='#030510';ctx.fillRect(0,0,W,H);ctx.save();if(state.screenShake)ctx.translate((Math.random()-.5)*state.screenShake,(Math.random()-.5)*state.screenShake);ctx.translate(W/2,H/2);ctx.scale(viewScale,viewScale);ctx.translate(-W/2,-H/2);drawWorld();
    if(state.current){
      for(const s of state.shockwaves){ctx.globalAlpha=Math.max(0,s.life/.35);ctx.strokeStyle=s.color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(sx(s.x),sy(s.y),s.r,0,TAU);ctx.stroke();}ctx.globalAlpha=1;for(const h of state.hazards)drawHazard(h);
      for(const b of state.bullets){ctx.strokeStyle=b.color;ctx.lineWidth=b.r>4?5:3;ctx.shadowBlur=10;ctx.shadowColor=b.color;ctx.beginPath();ctx.moveTo(sx(b.x),sy(b.y));ctx.lineTo(sx(b.x-b.vx*.018),sy(b.y-b.vy*.018));ctx.stroke();}
      for(const b of state.enemyBullets){ctx.fillStyle=b.color||'#ff2f92';ctx.shadowBlur=12;ctx.shadowColor=ctx.fillStyle;ctx.beginPath();ctx.arc(sx(b.x),sy(b.y),b.r,0,TAU);ctx.fill();}ctx.shadowBlur=0;
      for(const e of state.current.enemies){drawEnemy(e);if(e.type==='boss')drawBossIdentity(e);}drawPlayer();
      for(const p of state.particles){ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.fillRect(sx(p.x),sy(p.y),p.size,p.size);}ctx.globalAlpha=1;ctx.textAlign='center';ctx.textBaseline='middle';
      for(const t of state.texts){ctx.globalAlpha=Math.max(0,t.life/t.maxLife);ctx.fillStyle=t.color;ctx.font=`${t.crit?'900':'800'} ${t.size}px Consolas`;ctx.shadowBlur=t.crit?16:5;ctx.shadowColor=t.color;ctx.fillText(t.text,sx(t.x),sy(t.y));if(t.crit){ctx.globalAlpha*=.4;ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.strokeText(t.text,sx(t.x),sy(t.y));}}ctx.shadowBlur=0;ctx.globalAlpha=1;ctx.textBaseline='alphabetic';
    }
    ctx.restore();if(state.current)drawMinimap();if(state.flash){ctx.fillStyle=`rgba(255,47,146,${state.flash*.7})`;ctx.fillRect(0,0,W,H);}if(state.transition){ctx.fillStyle=`rgba(57,246,255,${state.transition})`;ctx.fillRect(0,0,W,H);}
  }

  function showBossIntro(){
    const floor=state.floor,room=state.current,profile=bossProfiles[floor];state.mode='bossintro';state.roomGrace=99;ui.bossIntro.className=`boss-intro floor-${floor%2+1} visible`;
    $('#boss-intro-name').textContent=profile.cn;$('#boss-intro-skill').textContent=profile.skill;
    beep(floor%2?72:58,.65,'sawtooth',.1);setTimeout(()=>beep(floor%2?220:130,.32,'square',.065),420);
    setTimeout(()=>{if(state.current===room&&state.mode==='bossintro'){ui.bossIntro.classList.remove('visible');state.mode='playing';state.roomGrace=1.6;showRoomBanner();}},4100);
  }
  function showRoomBanner(){ui.banner.querySelector('span').textContent=`FLOOR ${state.floor+1} // AREA LINKED`;ui.banner.querySelector('strong').textContent=roomNames[state.current.type];ui.banner.classList.remove('show');void ui.banner.offsetWidth;ui.banner.classList.add('show');}
  function showClearBanner(){ui.banner.querySelector('span').textContent='ACCESS GRANTED';ui.banner.querySelector('strong').textContent=state.current.type==='boss'?'传送点开启':'房间已清空';ui.banner.classList.remove('show');void ui.banner.offsetWidth;ui.banner.classList.add('show');}
  function updateUI(){
    if(!state.current)return;const charLabels={pulse:'PULSE // 脉冲手枪',razor:'RAZOR // 双持微冲',bastion:'BASTION // 磁轨重炮'};ui.characterIdent.textContent=charLabels[state.character];ui.characterIdent.style.color=player.color;ui.floor.textContent=String(state.floor+1).padStart(2,'0');ui.room.textContent=roomNames[state.current.type];ui.livesText.textContent='♥ '.repeat(player.lives).trim()||'OFFLINE';ui.lifePips.forEach((p,i)=>p.classList.toggle('lost',i>=player.lives));ui.xp.style.width=`${player.xp/player.nextXp*100}%`;ui.xpText.textContent=`${player.xp} / ${player.nextXp}`;ui.level.textContent=player.level;ui.kills.textContent=String(state.kills).padStart(3,'0');ui.rooms.textContent=`${state.rooms.filter(r=>r.cleared).length}/${state.rooms.length}`;
    const boss=state.current.enemies.find(e=>e.type==='boss');if(boss){const profile=bossProfiles[boss.bossFloor];ui.bossName.textContent=`威胁单位 // ${profile.en} // FORM ${boss.phase2?'II':'I'}`;ui.bossName.style.color=boss.color;ui.bossFill.style.width=`${Math.max(0,boss.hp/boss.maxHp*100)}%`;ui.bossFill.style.background=`linear-gradient(90deg,${boss.color},#fff)`;ui.bossFill.style.boxShadow=`0 0 18px ${boss.color}`;}
  }
  function togglePause(){if(state.mode==='playing'){state.mode='paused';ui.pause.classList.add('visible');}else if(state.mode==='paused'){state.mode='playing';ui.pause.classList.remove('visible');}}
  function openCharacterSelect(){state.mode='character';ui.start.classList.remove('visible');ui.gameover.classList.remove('visible');ui.character.classList.add('visible');initAudio();startMusic();}
  function loop(now){const dt=Math.min(.033,(now-last)/1000);last=now;update(dt);render();renderBossWallpaper(now/1000);fpsFrames++;fpsClock+=dt;if(fpsClock>.6){ui.fps.textContent=`${Math.round(fpsFrames/fpsClock)} FPS`;fpsFrames=0;fpsClock=0;}requestAnimationFrame(loop);}

  addEventListener('resize',resize);addEventListener('keydown',e=>{keys.add(e.code);if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if((e.code==='Enter'||e.code==='Space')&&state.mode==='menu')openCharacterSelect();if(e.code==='KeyR'&&state.mode==='gameover')openCharacterSelect();if((e.code==='KeyP'||e.code==='Escape')&&!['menu','character','upgrade','gameover'].includes(state.mode))togglePause();if(state.mode==='upgrade'&&['Digit1','Digit2','Digit3'].includes(e.code))ui.cards.children[Number(e.code.at(-1))-1]?.click();if(state.mode==='character'&&['Digit1','Digit2','Digit3'].includes(e.code))document.querySelectorAll('.character-card')[Number(e.code.at(-1))-1]?.click();});addEventListener('keyup',e=>keys.delete(e.code));
  canvas.addEventListener('mousemove',e=>{const r=canvas.getBoundingClientRect();mouse.x=(e.clientX-r.left)*W/r.width;mouse.y=(e.clientY-r.top)*H/r.height;});canvas.addEventListener('mousedown',e=>{if(e.button===0){mouse.down=true;initAudio();}});addEventListener('mouseup',e=>{if(e.button===0)mouse.down=false;});canvas.addEventListener('contextmenu',e=>e.preventDefault());
  function bindTouchPad(element,isAim){let pointer=null,baseX=0,baseY=0;const zone=element.parentElement,stick=element.querySelector('i');const place=(clientX,clientY)=>{const r=zone.getBoundingClientRect(),radius=element.offsetWidth/2,edge=10;baseX=Math.max(radius+edge,Math.min(r.width-radius-edge,clientX-r.left));baseY=Math.max(radius+edge,Math.min(r.height-radius-24,clientY-r.top));element.style.left=`${baseX-radius}px`;element.style.top=`${baseY-radius}px`;element.style.bottom='auto';};const update=e=>{let r=zone.getBoundingClientRect(),radius=element.offsetWidth/2,max=radius*.64,dx=e.clientX-(r.left+baseX),dy=e.clientY-(r.top+baseY),length=Math.hypot(dx,dy);if(length>max*1.35){const follow=length-max*1.05;place(r.left+baseX+dx/length*follow,r.top+baseY+dy/length*follow);r=zone.getBoundingClientRect();dx=e.clientX-(r.left+baseX);dy=e.clientY-(r.top+baseY);length=Math.hypot(dx,dy);}const strength=Math.min(1,length/max),x=length?dx/length*strength:0,y=length?dy/length*strength:0;stick.style.transform=`translate(${x*max}px,${y*max}px)`;if(isAim){if(strength>.14){touchInput.aimX=x;touchInput.aimY=y;touchInput.aiming=true;mouse.down=true;}else{mouse.down=false;}}else{touchInput.moveX=strength>.1?x:0;touchInput.moveY=strength>.1?y:0;}};zone.addEventListener('pointerdown',e=>{if(pointer!==null)return;pointer=e.pointerId;zone.setPointerCapture(pointer);place(e.clientX,e.clientY);element.classList.add('active');update(e);initAudio();e.preventDefault();});zone.addEventListener('pointermove',e=>{if(e.pointerId===pointer){update(e);e.preventDefault();}});const end=e=>{if(e.pointerId!==pointer)return;pointer=null;stick.style.transform='translate(0,0)';element.classList.remove('active');element.style.removeProperty('left');element.style.removeProperty('top');element.style.removeProperty('bottom');if(isAim){touchInput.aiming=false;mouse.down=false;}else{touchInput.moveX=0;touchInput.moveY=0;}e.preventDefault();};zone.addEventListener('pointerup',end);zone.addEventListener('pointercancel',end);}
  bindTouchPad($('#move-pad'),false);bindTouchPad($('#aim-pad'),true);
  async function enterMobileLandscape(){if(matchMedia('(pointer: coarse)').matches){try{if(!document.fullscreenElement&&document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen({navigationUI:'hide'});}catch{}try{if(screen.orientation?.lock)await screen.orientation.lock('landscape');}catch{}setTimeout(resize,120);}openCharacterSelect();}
  $('#start-button').onclick=enterMobileLandscape;$('#restart-button').onclick=enterMobileLandscape;$('#mobile-pause-button').onclick=togglePause;$('#resume-button').onclick=togglePause;document.querySelectorAll('.character-card').forEach(card=>card.onclick=()=>reset(card.dataset.character));$('#sound-button').onclick=e=>{soundOn=!soundOn;e.currentTarget.textContent=`SOUND: ${soundOn?'ON':'OFF'}`;if(soundOn){initAudio();startMusic();beep(440);}};$('#fullscreen-button').onclick=async()=>{try{if(!document.fullscreenElement){await document.documentElement.requestFullscreen();if(matchMedia('(pointer: coarse)').matches&&screen.orientation?.lock)await screen.orientation.lock('landscape');}else{if(screen.orientation?.unlock)screen.orientation.unlock();await document.exitFullscreen();}}catch{}};document.addEventListener('fullscreenchange',()=>{setTimeout(resize,80);$('#fullscreen-button').textContent=document.fullscreenElement?'EXIT FULL':'FULLSCREEN';});document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.mode==='playing')togglePause();});if('serviceWorker'in navigator&&location.protocol.startsWith('http'))addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));resize();requestAnimationFrame(loop);
})();
