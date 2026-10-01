'use strict';
var $ = function(id){ return document.getElementById(id); };

// ============ 全局状态 ============
var gameStarted = false, gamePaused = false;
var firstPerson = false;
var soundEnabled = true, musicEnabled = true, masterVolume = 0.55;
var keys = {w:false,s:false,a:false,d:false};
var mobileInput = {left:false,right:false,gas:false,brake:false};
var lightState = {headlight:false,leftTurn:false,rightTurn:false,hazard:false};
var turnBlinkTimer = 0, turnBlinkOn = false;
var camYaw = 0, camPitch = 0;
var touchStartX = 0, touchStartY = 0;
var isDraggingView = false;

var currentSceneMode = 'highway';
var gameMode = 'free';
var raceState = 'idle';
var raceDistance = 0;
var countdownValue = 5;
var countdownTimer = 0;
var playerDistance = 0;
var aiCars = [];
var raceStartTime = 0;
window.playerCatchupBoost = 1.0;
window.playerGapKm = 0;

// ============ 音频 ============
var audioCtx = null, engineNodes = null, evNodes = null;
var bgmMenu = null, bgmGame = null;
var bgmMenuProgress = 0, bgmGameProgress = 0;

function initAudio(){
    if(audioCtx){ if(audioCtx.state==='suspended') audioCtx.resume().catch(function(){}); return true; }
    try{ var AC = window.AudioContext||window.webkitAudioContext; if(!AC) return false; audioCtx = new AC(); return true; }catch(e){ return false; }
}
function startEngine(){
    if(!audioCtx || engineNodes) return;
    if(audioCtx.state!=='running'){ setTimeout(startEngine, 300); return; }
    var now = audioCtx.currentTime;
    var o1 = audioCtx.createOscillator(); o1.type='sawtooth'; o1.frequency.value=45;
    var o2 = audioCtx.createOscillator(); o2.type='square'; o2.frequency.value=22.5;
    var f = audioCtx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=400; f.Q.value=1.5;
    var g = audioCtx.createGain(); g.gain.value=0;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(audioCtx.destination);
    o1.start(now); o2.start(now);
    engineNodes = {o1:o1, o2:o2, filter:f, gain:g};
}
function startEV(){
    if(!audioCtx || evNodes) return;
    if(audioCtx.state!=='running'){ setTimeout(startEV, 300); return; }
    var now = audioCtx.currentTime;
    var o1 = audioCtx.createOscillator(); o1.type='sine'; o1.frequency.value=200;
    var o2 = audioCtx.createOscillator(); o2.type='triangle'; o2.frequency.value=400;
    var f = audioCtx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=800; f.Q.value=2;
    var g = audioCtx.createGain(); g.gain.value=0;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(audioCtx.destination);
    o1.start(now); o2.start(now);
    evNodes = {o1:o1, o2:o2, filter:f, gain:g};
}
function updateEngine(rpm, thr){
    if(!audioCtx || audioCtx.state!=='running') return;
    var now = audioCtx.currentTime;
    if(playerVehicle.isEV){
        if(evNodes){
            var spd = Math.abs(carSpeed);
            var f1 = 200 + spd * 8;
            evNodes.o1.frequency.setTargetAtTime(f1, now, 0.08);
            evNodes.o2.frequency.setTargetAtTime(f1 * 2, now, 0.08);
            evNodes.filter.frequency.setTargetAtTime(800 + spd * 12, now, 0.1);
            var vol = soundEnabled ? Math.min(0.14, masterVolume*(0.05 + spd/200 + thr*0.03)) : 0;
            evNodes.gain.gain.setTargetAtTime(vol, now, 0.1);
        }
        if(engineNodes) try{ engineNodes.gain.gain.setTargetAtTime(0, now, 0.1); }catch(e){}
    } else {
        if(engineNodes){
            var fr = 30 + rpm/60*4;
            engineNodes.o1.frequency.setTargetAtTime(fr, now, 0.05);
            engineNodes.o2.frequency.setTargetAtTime(fr*0.5, now, 0.05);
            engineNodes.filter.frequency.setTargetAtTime(300+rpm/12, now, 0.08);
            var vol2 = soundEnabled ? Math.min(0.20, masterVolume*(0.06 + rpm/30000 + thr*0.05)) : 0;
            engineNodes.gain.gain.setTargetAtTime(vol2, now, 0.1);
        }
        if(evNodes) try{ evNodes.gain.gain.setTargetAtTime(0, now, 0.1); }catch(e){}
    }
}
function stopAllEngine(){
    if(engineNodes && audioCtx) try{ engineNodes.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.15); }catch(e){}
    if(evNodes && audioCtx) try{ evNodes.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.15); }catch(e){}
}
function playBeep(){ if(!audioCtx||!soundEnabled||audioCtx.state!=='running') return; var now = audioCtx.currentTime; var o=audioCtx.createOscillator(); o.type='sine'; o.frequency.value=880; var g=audioCtx.createGain(); g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.12*masterVolume, now+0.02); g.gain.exponentialRampToValueAtTime(0.001, now+0.12); o.connect(g); g.connect(audioCtx.destination); o.start(now); o.stop(now+0.14); }
function playShiftSound(up){ if(!audioCtx||!soundEnabled||audioCtx.state!=='running') return; var now = audioCtx.currentTime; var o=audioCtx.createOscillator(); o.type='square'; o.frequency.setValueAtTime(up?400:600, now); o.frequency.exponentialRampToValueAtTime(up?250:900, now+0.08); var g=audioCtx.createGain(); g.gain.setValueAtTime(0.06*masterVolume, now); g.gain.exponentialRampToValueAtTime(0.001, now+0.1); o.connect(g); g.connect(audioCtx.destination); o.start(now); o.stop(now+0.12); }
function playHorn(){ if(!audioCtx||!soundEnabled||audioCtx.state!=='running') return; var now = audioCtx.currentTime; [440,554].forEach(function(fr){ var o=audioCtx.createOscillator(); o.type='sine'; o.frequency.value=fr; var g=audioCtx.createGain(); g.gain.setValueAtTime(0,now); g.gain.linearRampToValueAtTime(0.12*masterVolume, now+0.03); g.gain.setValueAtTime(0.12*masterVolume, now+0.3); g.gain.linearRampToValueAtTime(0, now+0.36); o.connect(g); g.connect(audioCtx.destination); o.start(now); o.stop(now+0.4); }); }
function playCrash(intensity){ if(!audioCtx||!soundEnabled||audioCtx.state!=='running') return; var now = audioCtx.currentTime; var b=audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate*0.3), audioCtx.sampleRate); var d=b.getChannelData(0); for(var i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length, 2.5); var s=audioCtx.createBufferSource(); s.buffer=b; var f=audioCtx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=250+intensity*120; var g=audioCtx.createGain(); g.gain.value=Math.min(0.5, masterVolume*(0.15+intensity*0.08)); s.connect(f); f.connect(g); g.connect(audioCtx.destination); s.start(now); }
function playTurnTick(){ if(!audioCtx||!soundEnabled||audioCtx.state!=='running') return; var now = audioCtx.currentTime; var o=audioCtx.createOscillator(); o.type='sine'; o.frequency.value=1200; var g=audioCtx.createGain(); g.gain.setValueAtTime(0.03*masterVolume, now); g.gain.exponentialRampToValueAtTime(0.001, now+0.06); o.connect(g); g.connect(audioCtx.destination); o.start(now); o.stop(now+0.08); }
function playNitroSound(){
    if(!audioCtx) initAudio();
    if(!audioCtx) return;
    if(audioCtx.state==='suspended'){ audioCtx.resume().catch(function(){}); }
    if(!soundEnabled) return;
    var now = audioCtx.currentTime + 0.01;
    var o = audioCtx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, now);
    o.frequency.exponentialRampToValueAtTime(1400, now + 0.6);
    o.frequency.exponentialRampToValueAtTime(280, now + 1.6);
    var f = audioCtx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(2500, now);
    f.frequency.exponentialRampToValueAtTime(6500, now + 0.6);
    f.frequency.exponentialRampToValueAtTime(800, now + 1.6);
    f.Q.value = 6;
    var g = audioCtx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.38 * masterVolume, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.6);
    o.connect(f); f.connect(g); g.connect(audioCtx.destination);
    o.start(now); o.stop(now + 1.6);
    var o2 = audioCtx.createOscillator(); o2.type = 'square';
    o2.frequency.setValueAtTime(80, now);
    o2.frequency.exponentialRampToValueAtTime(240, now + 0.6);
    var g2 = audioCtx.createGain();
    g2.gain.setValueAtTime(0, now);
    g2.gain.linearRampToValueAtTime(0.18 * masterVolume, now + 0.1);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 1.6);
    o2.connect(g2); g2.connect(audioCtx.destination);
    o2.start(now); o2.stop(now + 1.6);
    var b = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 1.2), audioCtx.sampleRate);
    var d = b.getChannelData(0);
    for(var i=0;i<d.length;i++) d[i] = (Math.random()*2-1) * Math.pow(1-i/d.length, 2.0);
    var s = audioCtx.createBufferSource(); s.buffer = b;
    var nf = audioCtx.createBiquadFilter(); nf.type='bandpass'; nf.frequency.value=2500; nf.Q.value=1;
    var ng = audioCtx.createGain(); ng.gain.value = 0.20 * masterVolume;
    s.connect(nf); nf.connect(ng); ng.connect(audioCtx.destination);
    s.start(now);
}

// ============ 点击音效（仅主界面） ============
function playClickSound(){
    if(!audioCtx || !soundEnabled || audioCtx.state !== 'running') return;
    var now = audioCtx.currentTime;
    var o = audioCtx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(800, now);
    o.frequency.exponentialRampToValueAtTime(400, now + 0.06);
    var g = audioCtx.createGain();
    g.gain.setValueAtTime(0.05 * masterVolume, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(now); o.stop(now + 0.1);
}
var _lastClickTime = 0;
function handleGlobalClickSound(e){
    if(gameStarted) return;
    var t = e.target;
    if(t && t.closest && t.closest('button')){
        var n = Date.now();
        if(n - _lastClickTime < 100) return;
        _lastClickTime = n;
        if(!audioCtx) initAudio();
        if(audioCtx && audioCtx.state === 'suspended'){ audioCtx.resume().catch(function(){}); }
        setTimeout(playClickSound, 20);
    }
}
document.addEventListener('touchstart', handleGlobalClickSound, true);
document.addEventListener('mousedown', handleGlobalClickSound, true);

// ============ BGM ============
var MUSIC_TRACKS = [
    { name: '通缉丶小曲', file: 'manifest.mp3' },
    { name: '黑街',       file: 'blackstreet.mp3' },
    { name: '不配说爱我', file: 'bpsaw.mp3' }
];
var currentTrackIndex = 0;
function musicPath(){ return 'file:///android_asset/' + MUSIC_TRACKS[currentTrackIndex].file; }
function initMenuMusic(){ if(bgmMenu) return; bgmMenu = new Audio(); bgmMenu.src = musicPath(); bgmMenu.loop = true; bgmMenu.volume = masterVolume * 0.4; }
function initGameMusic(){ if(bgmGame) return; bgmGame = new Audio(); bgmGame.src = musicPath(); bgmGame.loop = true; bgmGame.volume = masterVolume * 0.4; }
function playMenuMusic(){ if(!musicEnabled) return; if(!bgmMenu) initMenuMusic(); if(bgmGame){ if(!bgmGame.paused) bgmGameProgress = bgmGame.currentTime; bgmGame.pause(); } if(bgmMenu){ if(bgmMenuProgress > 0 && bgmMenu.duration && bgmMenuProgress < bgmMenu.duration - 1){ try { bgmMenu.currentTime = bgmMenuProgress; } catch(e){} } var p = bgmMenu.play(); if(p && p.catch) p.catch(function(){}); } }
function playGameMusic(){ if(!musicEnabled) return; if(!bgmGame) initGameMusic(); if(bgmMenu){ if(!bgmMenu.paused) bgmMenuProgress = bgmMenu.currentTime; bgmMenu.pause(); } if(bgmGame){ if(bgmGameProgress > 0 && bgmGame.duration && bgmGameProgress < bgmGame.duration - 1){ try { bgmGame.currentTime = bgmGameProgress; } catch(e){} } var p = bgmGame.play(); if(p && p.catch) p.catch(function(){}); } }
function stopAllMusic(){ if(bgmMenu){ if(!bgmMenu.paused) bgmMenuProgress = bgmMenu.currentTime; bgmMenu.pause(); } if(bgmGame){ if(!bgmGame.paused) bgmGameProgress = bgmGame.currentTime; bgmGame.pause(); } }
function updateMusicVolume(){ var v = masterVolume * 0.4; if(bgmMenu) bgmMenu.volume = v; if(bgmGame) bgmGame.volume = v; }

function switchTrack(idx){
    var n = MUSIC_TRACKS.length;
    if(typeof idx !== 'number') idx = currentTrackIndex + 1;
    currentTrackIndex = ((idx % n) + n) % n;
    bgmMenuProgress = 0; bgmGameProgress = 0;
    var menuWasPlaying = bgmMenu && !bgmMenu.paused;
    if(bgmMenu){ bgmMenu.pause(); bgmMenu.src = musicPath(); try{ bgmMenu.currentTime = 0; }catch(e){} if(menuWasPlaying && musicEnabled){ var pm = bgmMenu.play(); if(pm && pm.catch) pm.catch(function(){}); } }
    var gameWasPlaying = bgmGame && !bgmGame.paused;
    if(bgmGame){ bgmGame.pause(); bgmGame.src = musicPath(); try{ bgmGame.currentTime = 0; }catch(e){} if(gameWasPlaying && musicEnabled){ var pg = bgmGame.play(); if(pg && pg.catch) pg.catch(function(){}); } }
    if(musicEnabled && !menuWasPlaying && !gameWasPlaying){ if(gameStarted) playGameMusic(); else playMenuMusic(); }
    updateTrackUI();
    saveSettings();
    if(typeof showToast === 'function') showToast('🎵 ' + MUSIC_TRACKS[currentTrackIndex].name);
}
function updateTrackUI(){
    var g = document.getElementById('trackGroup');
    if(!g) return;
    g.innerHTML = '';
    for(var i=0;i<MUSIC_TRACKS.length;i++){
        (function(i){
            var b = document.createElement('button');
            b.textContent = MUSIC_TRACKS[i].name;
            if(i === currentTrackIndex) b.className = 'active';
            b.addEventListener('click', function(e){ e.preventDefault(); if(typeof unlockAudio === 'function') unlockAudio(); switchTrack(i); });
            g.appendChild(b);
        })(i);
    }
}

// ============ 本地存储 ============
var STORAGE_KEY = 'pkw_settings_v1';
var _saveTimer = null;
function loadSettings(){
    try{
        var raw = localStorage.getItem(STORAGE_KEY);
        if(!raw) return;
        var s = JSON.parse(raw);
        if(typeof timeOfDay !== 'undefined' && typeof s.timeOfDay === 'number') timeOfDay = s.timeOfDay;
        if(typeof trafficLevel !== 'undefined' && typeof s.trafficLevel === 'number') trafficLevel = s.trafficLevel;
        if(typeof s.soundEnabled === 'boolean') soundEnabled = s.soundEnabled;
        if(typeof s.musicEnabled === 'boolean') musicEnabled = s.musicEnabled;
        if(typeof s.masterVolume === 'number') masterVolume = s.masterVolume;
        if(typeof s.currentTrackIndex === 'number') currentTrackIndex = s.currentTrackIndex;
        if(typeof s.currentVehicleType === 'string' && typeof VEHICLES !== 'undefined' && VEHICLES[s.currentVehicleType]){
            currentVehicleType = s.currentVehicleType;
            playerVehicle = VEHICLES[s.currentVehicleType];
        }
        if(typeof s.currentSceneMode === 'string') currentSceneMode = s.currentSceneMode;
        if(typeof s.firstPerson === 'boolean') firstPerson = s.firstPerson;
        if(typeof s.roadCurveEnabled === 'boolean' && typeof roadCurveEnabled !== 'undefined') roadCurveEnabled = s.roadCurveEnabled;
    }catch(e){ console.error('读取设置失败:', e); }
}
function saveSettings(){
    try{
        var s = {
            timeOfDay: timeOfDay,
            trafficLevel: trafficLevel,
            soundEnabled: soundEnabled,
            musicEnabled: musicEnabled,
            masterVolume: masterVolume,
            currentTrackIndex: currentTrackIndex,
            currentVehicleType: currentVehicleType,
            currentSceneMode: currentSceneMode,
                firstPerson: firstPerson,
    roadCurveEnabled: (typeof roadCurveEnabled !== 'undefined') ? roadCurveEnabled : true
};
        localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    }catch(e){ console.error('保存设置失败:', e); }
}
function saveSettingsDebounced(){
    if(_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(saveSettings, 300);
}
function applyLoadedSettingsToUI(){
    var ts = $('timeSlider'); if(ts) ts.value = timeOfDay;
    var tv = $('timeVal');
    if(tv){ var hh = Math.floor(timeOfDay)%24, mm = Math.floor((timeOfDay-Math.floor(timeOfDay))*60); tv.textContent = (hh<10?'0':'')+hh+':'+(mm<10?'0':'')+mm; }
    var trs = $('trafficSlider'); if(trs) trs.value = trafficLevel;
    var trv = $('trafficVal');
    if(trv){ var labels = ['无','极少','很少','少','偏少','中','偏多','多','很多','极多','爆满']; trv.textContent = labels[trafficLevel] || '中'; }
    var rcc = $('roadCurveCheck'); if(rcc && typeof roadCurveEnabled !== 'undefined') rcc.checked = roadCurveEnabled;
    var mc = $('musicCheck'); if(mc) mc.checked = musicEnabled;
    var vs = $('volumeSlider'); if(vs) vs.value = Math.round(masterVolume*100);
    var vv = $('volumeVal'); if(vv) vv.textContent = Math.round(masterVolume*100) + '%';
    if(currentSceneMode === 'city'){
    var si = $('sceneCityItem'); if(si) si.classList.add('active');
    var hi = $('sceneHighwayItem'); if(hi) hi.classList.remove('active');
    var ti = document.getElementById('sceneTunnelItem'); if(ti) ti.classList.remove('active');
} else if(currentSceneMode === 'tunnel'){
    var ti2 = document.getElementById('sceneTunnelItem'); if(ti2) ti2.classList.add('active');
    var hi3 = $('sceneHighwayItem'); if(hi3) hi3.classList.remove('active');
    var ci3 = $('sceneCityItem'); if(ci3) ci3.classList.remove('active');
} else {
    var hi2 = $('sceneHighwayItem'); if(hi2) hi2.classList.add('active');
    var ci2 = $('sceneCityItem'); if(ci2) ci2.classList.remove('active');
    var ti3 = document.getElementById('sceneTunnelItem'); if(ti3) ti3.classList.remove('active');
}
    if(typeof updateTrackUI === 'function') updateTrackUI();
    if(typeof buildVehicleList === 'function') buildVehicleList();
}

// ============ 后视镜 ============
var mirrorRenderer = null, mirrorCamera = null;
function initMirror(){
    var cv = $('mirrorCanvas');
    if(!cv) return;
    if(mirrorRenderer){
        try{ mirrorRenderer.setSize(400, 128, false); }catch(e){}
        return;
    }
    try{
        mirrorRenderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, alpha: false });
        mirrorRenderer.setPixelRatio(1);
        mirrorRenderer.setSize(400, 128, false);
        mirrorCamera = new THREE.PerspectiveCamera(80, 400/128, 0.1, 300);
    }catch(e){ console.error('initMirror 失败:', e.message); }
}
function renderMirror(){
    if(!mirrorRenderer || !playerCar || !scene || !mirrorCamera) return;
    if(!playerCar.position) return;
    try{
        var px = playerCar.position.x, py = playerCar.position.y, pz = playerCar.position.z;
        var backX = px + Math.sin(carHeading) * 1.5;
        var backZ = pz + Math.cos(carHeading) * 1.5;
        mirrorCamera.position.set(backX, py + 1.3, backZ);
        var lookX = px + Math.sin(carHeading) * 30;
        var lookZ = pz + Math.cos(carHeading) * 30;
        mirrorCamera.lookAt(lookX, py + 1.0, lookZ);
        mirrorRenderer.render(scene, mirrorCamera);
    }catch(e){}
}
// ★ 强制刷新后视镜显隐
function syncMirrorVisibility(){
    var rm = document.getElementById('rearviewMirror');
    if(!rm) return;
    if(gameStarted && !firstPerson){
        rm.style.display = 'block';
        if(!mirrorRenderer) initMirror();
    } else {
        rm.style.display = 'none';
    }
}

// ============ 转速表 ============
var tachCanvas = null, tachCtx = null;
function initTach(){ tachCanvas = document.getElementById('tachCanvas'); if(!tachCanvas) return; tachCtx = tachCanvas.getContext('2d'); }
function drawTach(speed, rpm){
    if(!tachCtx) return;
    var W = 240, H = 240, cx = 120, cy = 120, ctx = tachCtx;
    ctx.clearRect(0, 0, W, H);
    var outerR = 112, arcR = 92;
    ctx.beginPath(); ctx.arc(cx, cy, outerR, 0, Math.PI*2); ctx.fillStyle = 'rgba(0,10,30,.85)'; ctx.fill(); ctx.strokeStyle = 'rgba(100,150,255,.3)'; ctx.lineWidth = 2; ctx.stroke();
    var startAngle = Math.PI * 0.75, endAngle = Math.PI * 2.25, totalAngle = endAngle - startAngle;
    ctx.beginPath(); ctx.arc(cx, cy, arcR, startAngle, endAngle); ctx.strokeStyle = 'rgba(60,90,140,.8)'; ctx.lineWidth = 10; ctx.stroke();
    var maxRPM = 8000, ratio = Math.min(1, Math.max(0, rpm / maxRPM));
    var curAngle = startAngle + totalAngle * ratio;
    var isRed = rpm >= 6000;
    var grad = ctx.createLinearGradient(0, 0, W, H);
    if(isRed){ grad.addColorStop(0, '#ff2222'); grad.addColorStop(1, '#ff6600'); } else { grad.addColorStop(0, '#00ddff'); grad.addColorStop(1, '#0088ff'); }
    ctx.beginPath(); ctx.arc(cx, cy, arcR, startAngle, curAngle); ctx.strokeStyle = grad; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt';
    for(var i=1;i<=8;i++){
        var ang = startAngle + totalAngle * (i/8);
        var tickColor = (i >= 6) ? '#ff4444' : '#88aadd';
        var ox = cx + Math.cos(ang) * (arcR + 12), oy = cy + Math.sin(ang) * (arcR + 12);
        var ix = cx + Math.cos(ang) * (arcR + 4), iy = cy + Math.sin(ang) * (arcR + 4);
        ctx.beginPath(); ctx.moveTo(ix, iy); ctx.lineTo(ox, oy); ctx.strokeStyle = tickColor; ctx.lineWidth = 2; ctx.stroke();
        var nx = cx + Math.cos(ang) * (arcR - 14), ny = cy + Math.sin(ang) * (arcR - 14);
        ctx.fillStyle = tickColor; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(i, nx, ny);
    }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 42px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(Math.round(speed), cx, cy - 12);
    ctx.fillStyle = '#88aadd'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('km/h', cx, cy + 18);
    ctx.fillStyle = isRed ? '#ff6666' : '#88aadd'; ctx.font = 'bold 10px sans-serif'; ctx.fillText('1000 r/min', cx, cy + 40);
}

// ============ 相机 ============
function updateCamera(dt, speedMS, _vRight, instant){
    if(!playerCar || !camera) return;
    if(firstPerson){
        if(!playerVehicle || !playerVehicle.buildType){ firstPerson = false; }
    }
    if(firstPerson){
        var V = playerVehicle;
        var bt = V.buildType;
        var floorY = 0.55;
        if(bt === 'truck') floorY = 1.10;
        else if(bt === 'suv') floorY = 0.68;
        else if(bt === 'hypercar') floorY = 0.45;
        else if(bt === 'landjet' || bt === 'rocket') floorY = 0.50;

        var camX = -V.width * 0.22;
        var camY = floorY + 0.95;
        var camZ = 0.25;
        if(bt === 'landjet' || bt === 'rocket') camX = 0;

        var camLocal = new THREE.Vector3(camX, camY, camZ);
        playerCar.localToWorld(camLocal);
        camera.position.copy(camLocal);

        var e = new THREE.Euler(
            playerCar.rotation.x + camPitch - 0.05,
            playerCar.rotation.y + camYaw,
            playerCar.rotation.z,
            'YXZ'
        );
        camera.quaternion.setFromEuler(e);
        if(steeringMesh) steeringMesh.rotation.z = steerSmooth * 1.2;
    } else {
        var lerpK = instant ? 1 : Math.min(1, dt * 20);
        var backDist = 9.5, camH = 5.5 + carY * 0.6;
        var yaw = carHeading + camYaw;
        var fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        var camLocalX = carLocalX - fx*backDist, camLocalZ = playerCar.position.z - fz*backDist;
        var worldCamX = offsetX(camLocalZ) + camLocalX, worldCamY = offsetY(camLocalZ) + camH + camPitch * 5;
        _camTarget.set(worldCamX, worldCamY, camLocalZ);
        if(instant) camera.position.copy(_camTarget);
        else camera.position.lerp(_camTarget, lerpK);
        var lx = playerCar.position.x + fx*6, lz = playerCar.position.z + fz*6, ly = playerCar.position.y + 0.5 + camPitch * 3;
        var m = new THREE.Matrix4();
        m.lookAt(camera.position, new THREE.Vector3(lx, ly, lz), new THREE.Vector3(0,1,0));
        var q2 = new THREE.Quaternion().setFromRotationMatrix(m);
        if(instant) camera.quaternion.copy(q2);
        else camera.quaternion.slerp(q2, lerpK);
    }
    var _fovBase = firstPerson ? ((typeof playerVehicle !== 'undefined' && playerVehicle.buildType === 'truck') ? 82 : 72) : 68;
    var tf = _fovBase + Math.min(14, speedMS*0.18);
    if(Math.abs(camera.fov - tf) > 0.05){ camera.fov += (tf - camera.fov) * Math.min(1, dt*5); camera.updateProjectionMatrix(); }
}

// ============ 灯光 ============
function toggleHeadlight(force){ lightState.headlight = (force !== undefined) ? force : !lightState.headlight; if(playerLights.headlight) playerLights.headlight.intensity = lightState.headlight ? 2.2 : 0; playerLights.headBulbs.forEach(function(b){ b.material.color.setHex(lightState.headlight ? 0xfff8dd : 0x554433); }); if($('lHeadlight')) $('lHeadlight').classList.toggle('on', lightState.headlight); }
function toggleLeftTurn(){ lightState.leftTurn = !lightState.leftTurn; if(lightState.leftTurn) lightState.rightTurn = false; if($('lLeftTurn')) $('lLeftTurn').classList.toggle('on', lightState.leftTurn); if($('lRightTurn')) $('lRightTurn').classList.remove('on'); }
function toggleRightTurn(){ lightState.rightTurn = !lightState.rightTurn; if(lightState.rightTurn) lightState.leftTurn = false; if($('lRightTurn')) $('lRightTurn').classList.toggle('on', lightState.rightTurn); if($('lLeftTurn')) $('lLeftTurn').classList.remove('on'); }
function toggleHazard(){ lightState.hazard = !lightState.hazard; if($('lHazard')) $('lHazard').classList.toggle('on', lightState.hazard); }
// ★ 闪灯：远光灯快速闪两下
var _flashTimer = null;
function flashHeadlight(){
    if(!playerLights || !playerLights.headlight) return;
    var origIntensity = lightState.headlight ? 2.2 : 0;
    var origColor = lightState.headlight ? 0xfff8dd : 0x554433;
    function on(){
        try{
            playerLights.headlight.intensity = 5.0;
            playerLights.headBulbs.forEach(function(b){ b.material.color.setHex(0xffffff); });
        }catch(e){}
    }
    function off(){
        try{
            playerLights.headlight.intensity = origIntensity;
            playerLights.headBulbs.forEach(function(b){ b.material.color.setHex(origColor); });
        }catch(e){}
    }
    if(_flashTimer){ clearTimeout(_flashTimer); }
    // 闪两下
    on();
    setTimeout(off, 90);
    setTimeout(on, 160);
    setTimeout(off, 250);
    if(typeof playClickSound === 'function') playClickSound();
}
function updateLights(dt){ turnBlinkTimer += dt; if(turnBlinkTimer >= 0.4){ turnBlinkTimer = 0; turnBlinkOn = !turnBlinkOn; if(lightState.leftTurn || lightState.rightTurn || lightState.hazard) playTurnTick(); } var braking = keys.s || mobileInput.brake; playerLights.tailBulbs.forEach(function(b){ b.material.color.setHex(braking ? 0xff3333 : 0x661111); }); var lOn = turnBlinkOn && (lightState.leftTurn || lightState.hazard), rOn = turnBlinkOn && (lightState.rightTurn || lightState.hazard), t = playerLights.turnBulbs; if(t.fl){ t.fl.material.color.setHex(lOn ? 0xffaa22 : 0x332200); t.rl.material.color.setHex(lOn ? 0xffaa22 : 0x332200); t.fr.material.color.setHex(rOn ? 0xffaa22 : 0x332200); t.rr.material.color.setHex(rOn ? 0xffaa22 : 0x332200); } }

// ============ UI ============
function updateGearUI(){ var disp = gearText; if(gearText === 'D' && !playerVehicle.isEV) disp = 'D' + (currentGearIdx + 1); if($('gearText')) $('gearText').textContent = disp; if($('gearDisplayMain')) $('gearDisplayMain').textContent = disp; if($('rpmText')) $('rpmText').textContent = Math.round(engineRPM); if($('gearD')) $('gearD').classList.toggle('on', gearText === 'D'); if($('gearN')) $('gearN').classList.toggle('on', gearText === 'N'); if($('gearR')) $('gearR').classList.toggle('on', gearText === 'R'); var over = engineRPM > 6500; if($('gearText')) $('gearText').classList.toggle('over', over); if($('gearDisplayMain')) $('gearDisplayMain').classList.toggle('over', over); }
function selectGear(g){ gearText = g; currentGearIdx = 0; isShifting = false; updateGearUI(); playBeep(); }
function updateTimeOfDay(dt){ if($('timeSlider') && !$('timeSlider')._dragging) $('timeSlider').value = timeOfDay; var hh = Math.floor(timeOfDay) % 24, mm = Math.floor((timeOfDay - Math.floor(timeOfDay)) * 60), ts = (hh<10?'0':'') + hh + ':' + (mm<10?'0':'') + mm; if($('timeVal')) $('timeVal').textContent = ts; if($('clockText')) $('clockText').textContent = ts; var t = timeOfDay, nightFactor = 1; if(t > 26 || t < 5) nightFactor = 1; else if(t > 24) nightFactor = 1 - (t-24)/2; else nightFactor = Math.min(1, (t-18)/2); var skyR = 0.04 + (1-nightFactor)*0.5, skyG = 0.09 + (1-nightFactor)*0.6, skyB = 0.22 + (1-nightFactor)*0.7, skyCol = new THREE.Color(skyR, skyG, skyB); scene.background = skyCol; scene.fog.color.copy(skyCol); if(ambLight) ambLight.intensity = 0.4 + (1-nightFactor)*0.5; if(hemiLight) hemiLight.intensity = 0.35 + (1-nightFactor)*0.5; if(dirLight) dirLight.intensity = 0.25 + (1-nightFactor)*0.7; }
function showToast(text){ var el = $('memeToast'); if(!el) return; el.textContent = text; el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(function(){ el.classList.remove('show'); }, 2000); }
function triggerHitFlash(isRam){ var a = isRam ? 0.25 : 0.12, f = $('hitFlash'); if(!f) return; f.style.background = 'rgba(255,200,0,'+a+')'; setTimeout(function(){ f.style.background = 'rgba(255,200,0,0)'; }, 120); }
function activateRam(){ if(ramCooldown > 0) return; ramActive = 0.6; ramCooldown = 5.0; triggerHitFlash(true); var quotes = isAirborne ? ['💥 空中冲撞！', '💥 飞车撞击！'] : ['💥 公路之王在此！', '💥 谁挡撞谁！', '💥 泥头车警告！', '💥 速度与激情！']; showToast(quotes[Math.floor(Math.random() * quotes.length)]); var btn = $('skillBtn'); if(btn){ btn.classList.add('cooling'); setTimeout(function(){ btn.classList.remove('cooling'); }, 5000); } }
function handleSpinClick(){ if(window.TRICK) window.TRICK.trigger(); }
function unlockAudio(){ if(!audioCtx) initAudio(); if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(function(){}); setTimeout(function(){ if(audioCtx && audioCtx.state === 'running' && gameStarted){ if(playerVehicle.isEV){ if(!evNodes) startEV(); } else { if(!engineNodes) startEngine(); } } }, 100); }
function bindPress(el, onDown, onUp){ if(!el) return; var active = false; function down(e){ e.preventDefault(); e.stopPropagation(); if(active) return; active = true; el.classList.add('pressed'); unlockAudio(); onDown(); } function up(e){ if(!active) return; active = false; el.classList.remove('pressed'); if(onUp) onUp(); } el.addEventListener('touchstart', down, {passive:false}); el.addEventListener('touchend', up); el.addEventListener('touchcancel', up); el.addEventListener('mousedown', down); el.addEventListener('mouseup', up); el.addEventListener('mouseleave', up); }
function bindTap(el, action){ if(!el) return; el.addEventListener('touchstart', function(e){ e.preventDefault(); e.stopPropagation(); unlockAudio(); action(); }, {passive:false}); el.addEventListener('click', function(e){ e.preventDefault(); unlockAudio(); action(); }); }
function toggleView(){ firstPerson = !firstPerson; camYaw = 0; camPitch = 0; applyViewMode(); if(playerCar) playerCar.updateMatrixWorld(true); updateCamera(0.016, 0, 0, true); saveSettings(); syncMirrorVisibility(); }

// ============ 车辆预览 ============
var pScene, pCamera, pRenderer, pCar;
var previewRotY = 0.6, previewDragging = false, previewLastX = 0, previewInited = false;
function initPreview(){
    if(previewInited) return;
    previewInited = true;
    pScene = new THREE.Scene();
    var w = $('vPreviewWrap').clientWidth || 400, h = $('vPreviewWrap').clientHeight || 300;
    pCamera = new THREE.PerspectiveCamera(38, w/h, 0.1, 100);
    pCamera.position.set(5.5, 3.2, 5.5); pCamera.lookAt(0, 0.9, 0);
    pRenderer = new THREE.WebGLRenderer({canvas: $('vPreviewCanvas'), antialias: true, alpha: true});
    pRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    pRenderer.setSize(w, h, false);
    if(pRenderer.outputEncoding !== undefined) pRenderer.outputEncoding = THREE.sRGBEncoding;
    pScene.add(new THREE.HemisphereLight(0xaaccff, 0x334466, 1.0));
    var d1 = new THREE.DirectionalLight(0xffffff, 1.0); d1.position.set(5, 8, 5); pScene.add(d1);
    var d2 = new THREE.DirectionalLight(0x6688bb, 0.5); d2.position.set(-5, 4, -5); pScene.add(d2);
    var disc = new THREE.Mesh(new THREE.CircleGeometry(4, 40), new THREE.MeshStandardMaterial({color: 0x0a1525, roughness: 0.9}));
    disc.rotation.x = -Math.PI/2; disc.position.y = -0.01; pScene.add(disc);
    $('vPreviewWrap').addEventListener('pointerdown', function(e){ previewDragging = true; previewLastX = e.clientX; try{ $('vPreviewWrap').setPointerCapture(e.pointerId); }catch(_){} });
    $('vPreviewWrap').addEventListener('pointermove', function(e){ if(!previewDragging) return; previewRotY += (e.clientX - previewLastX) * 0.01; previewLastX = e.clientX; });
    $('vPreviewWrap').addEventListener('pointerup', function(){ previewDragging = false; });
    $('vPreviewWrap').addEventListener('pointercancel', function(){ previewDragging = false; });
    (function loop(){ requestAnimationFrame(loop); if(!previewDragging) previewRotY += 0.004; if(pCar) pCar.rotation.y = previewRotY; try{ pRenderer.render(pScene, pCamera); }catch(_){} })();
}
function showPreviewVehicle(type){
    if(!pScene) return;
    if(pCar) pScene.remove(pCar);
    var V = VEHICLES[type], geos = getCarGeo(type);
    pCar = new THREE.Group();
    pCar.add(new THREE.Mesh(geos.bodyGeo, new THREE.MeshStandardMaterial({ vertexColors: true, color: V.color, roughness: 0.3, metalness: 0.7 })));
    pCar.add(new THREE.Mesh(geos.detailGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.45 })));
    pCar.add(new THREE.Mesh(geos.glassGeo, new THREE.MeshStandardMaterial({ color: 0x1a2c3a, transparent: true, opacity: 0.55, roughness: 0.08, metalness: 0.9, side: THREE.DoubleSide })));
    pScene.add(pCar);
}
function buildVehicleList(){
    $('vList').innerHTML = '';
    Object.keys(VEHICLES).forEach(function(key){
        var V = VEHICLES[key], el = document.createElement('div');
        el.className = 'vItem' + (key === currentVehicleType ? ' active' : '');
        el.setAttribute('data-key', key);
        el.innerHTML = '<div class="vEmoji">' + V.emoji + '</div><div class="vName">' + V.name + '</div>';
        el.addEventListener('click', function(){ selectVehicle(key); });
        $('vList').appendChild(el);
    });
}
function selectVehicle(type){
    currentVehicleType = type;
    playerVehicle = VEHICLES[type];
    var items = document.querySelectorAll('.vItem');
    for(var i=0;i<items.length;i++){ items[i].classList.toggle('active', items[i].getAttribute('data-key') === type); }
    updateStatsPanel(); showPreviewVehicle(type);
    saveSettings();
    if(window.MULTIPLAYER && window.MULTIPLAYER.isInRoom && window.MULTIPLAYER.isInRoom()){
        try{ window.MULTIPLAYER.updateMyVehicle(type); }catch(e){}
    }
}
function updateStatsPanel(){
    var V = playerVehicle;
    $('vName').textContent = V.emoji + ' ' + V.name;
    $('vDesc').textContent = V.desc;
    function pct(v, min, max){ return Math.max(4, Math.min(100, ((v-min)/(max-min))*100)); }
    $('sPower').style.width = pct(V.horsepower, 100, 50000) + '%'; $('tPower').textContent = V.horsepower + ' hp';
    $('sMass').style.width = pct(V.mass, 500, 6000) + '%'; $('tMass').textContent = V.mass + ' kg';
    $('sSpeed').style.width = pct(V.topSpeedKmh, 140, 5000) + '%'; $('tSpeed').textContent = V.topSpeedKmh + ' km/h';
    $('sHandling').style.width = (V.handling*100) + '%'; $('tHandling').textContent = Math.round(V.handling*100) + '%';
    $('sLen').style.width = pct(V.length, 3, 8) + '%'; $('tLen').textContent = V.length + ' m';
}
function updateVisibility(){
    if($('mobileSteer')) $('mobileSteer').classList.toggle('on', gameStarted);
    if($('mobilePedals')) $('mobilePedals').classList.toggle('on', gameStarted);
    if($('gearPanel')) $('gearPanel').classList.toggle('on', gameStarted);
    if($('rightPanel')) $('rightPanel').classList.toggle('on', gameStarted);
    if($('spinBtn')) $('spinBtn').style.display = gameStarted ? 'flex' : 'none';
    if($('nitroBtn')) $('nitroBtn').style.display = gameStarted ? 'flex' : 'none';
    if($('nitroBar')) $('nitroBar').style.display = gameStarted ? 'block' : 'none';
    if($('tachCanvas')) $('tachCanvas').style.display = gameStarted ? 'block' : 'none';
    if($('leaderboard')) $('leaderboard').style.display = (gameStarted && gameMode === 'race') ? 'block' : 'none';
    if($('raceProgress')) $('raceProgress').style.display = (gameStarted && gameMode === 'race') ? 'block' : 'none';
    if(gameStarted){
        if($('lightPanel')) $('lightPanel').classList.add('on');
        if($('topBar')) $('topBar').style.display = 'flex';
    }
    syncMirrorVisibility();
}

// ============ 场景切换 ============
function applySceneMode(){
    if(!scene) return;
    if(currentSceneMode === 'city'){
        scene.background = new THREE.Color(0x1a0a2a);
        scene.fog.color.setHex(0x1a0a2a);
        scene.fog.near = 60; scene.fog.far = 320;
        if(typeof treeTrunkInst !== 'undefined' && treeTrunkInst) treeTrunkInst.visible = false;
        if(typeof treeLeafInst !== 'undefined' && treeLeafInst) treeLeafInst.visible = false;
        if(typeof signPoleInst !== 'undefined' && signPoleInst) signPoleInst.visible = false;
        if(typeof signBoardInst !== 'undefined' && signBoardInst) signBoardInst.visible = false;
        if(typeof setCityVisible === 'function') setCityVisible(true);
        if(typeof setTunnelVisible === 'function') setTunnelVisible(false);
    } else if(currentSceneMode === 'tunnel'){
        scene.background = new THREE.Color(0x05050a);
        scene.fog.color.setHex(0x05050a);
        scene.fog.near = 15; scene.fog.far = 160;
        if(typeof setCityVisible === 'function') setCityVisible(false);
        if(typeof setTunnelVisible === 'function') setTunnelVisible(true);
    } else {
        scene.background = new THREE.Color(0x0a1a3a);
        scene.fog.color.setHex(0x0a1a3a);
        scene.fog.near = 80; scene.fog.far = 320;
        if(typeof treeTrunkInst !== 'undefined' && treeTrunkInst) treeTrunkInst.visible = true;
        if(typeof treeLeafInst !== 'undefined' && treeLeafInst) treeLeafInst.visible = true;
        if(typeof signPoleInst !== 'undefined' && signPoleInst) signPoleInst.visible = true;
        if(typeof signBoardInst !== 'undefined' && signBoardInst) signBoardInst.visible = true;
        if(typeof setCityVisible === 'function') setCityVisible(false);
        if(typeof setTunnelVisible === 'function') setTunnelVisible(false);
    }
}

// ============ 竞技模式 ============
function showScreen(id){
    ['startScreen','matchConfirm','matchMaking','vehicleSelect','raceResult','sceneSelect','onlineScreen'].forEach(function(s){
        var el = $(s);
        if(el) el.style.display = (s === id) ? 'flex' : 'none';
    });
}
function raceModeStart(){ unlockAudio(); gameMode = 'race'; showScreen('matchConfirm'); }
function matchConfirmYes(){
    showScreen('matchMaking');
    var hint = $('matchHint'); var cnt = 0;
    var iv = setInterval(function(){
        cnt++;
        if(cnt === 1 && hint) hint.textContent = '正在寻找对手 .';
        if(cnt === 2 && hint) hint.textContent = '正在寻找对手 . .';
        if(cnt === 3 && hint) hint.textContent = '正在寻找对手 . . .';
        if(cnt >= 4){
            clearInterval(iv);
            if(hint) hint.textContent = '匹配完成！';
            setTimeout(function(){ showScreen('vehicleSelect'); initPreview(); buildVehicleList(); selectVehicle(currentVehicleType); }, 600);
        }
    }, 500);
}
function matchConfirmNo(){ gameMode = 'free'; showScreen('startScreen'); }

// ============ AI ============
var AI_CONFIGS = [
    { name: '闪电', color: 0xff3333, lane: -1 },
    { name: '黑鲨', color: 0x3333ff, lane: 1 }
];
function buildAICarMesh(type, color){
    var geos = getCarGeo(type);
    var group = new THREE.Group();
    group.add(new THREE.Mesh(geos.bodyGeo, new THREE.MeshStandardMaterial({ vertexColors: true, color: color, roughness: 0.35, metalness: 0.65 })));
    group.add(new THREE.Mesh(geos.detailGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.45 })));
    group.add(new THREE.Mesh(geos.glassGeo, new THREE.MeshStandardMaterial({ color: 0x0a1a2a, transparent: true, opacity: 0.6, roughness: 0.1, metalness: 0.8, side: THREE.DoubleSide })));
    return group;
}
function spawnAICars(){
    for(var i=0;i<aiCars.length;i++){ if(aiCars[i].mesh) scene.remove(aiCars[i].mesh); }
    aiCars = [];
    for(var k=0;k<AI_CONFIGS.length;k++){
        var cfg = AI_CONFIGS[k];
        var mesh = buildAICarMesh(currentVehicleType, cfg.color);
        var initX = laneX(cfg.lane + 1);
        var initZ = 0;
        var initOX = offsetX(initZ), initOY = offsetY(initZ);
        mesh.position.set(initOX + initX, initOY, initZ);
        scene.add(mesh);
        var aiName = cfg.name;
        if(window.AI_NAMES && typeof window.AI_NAMES.random === 'function'){ aiName = window.AI_NAMES.random(); }
        var newAI = {
            name: aiName, color: cfg.color, mesh: mesh,
            x: initX, z: initZ, heading: 0, speed: 0,
            targetLane: cfg.lane + 1, vehicle: playerVehicle,
            distance: 0, finishTime: 0, finished: false,
            changeCooldown: 0,
            nitro: 0, nitroActive: false, nitroTimer: 0,
            ramCooldown: 0, ramActive: 0,
            isAirborne: false, carY: 0, carVy: 0, airborneRot: 0,
            collisionCooldown: 0, label: null
        };
        aiCars.push(newAI);
        try {
            var canvas = document.createElement('canvas');
            canvas.width = 512; canvas.height = 128;
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(8, 30, 496, 68);
            ctx.strokeStyle = '#44ff88'; ctx.lineWidth = 4;
            ctx.strokeRect(8, 30, 496, 68);
            ctx.font = 'bold 44px sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.shadowColor = '#44ff88'; ctx.shadowBlur = 18;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(aiName, 256, 66);
            ctx.shadowBlur = 0;
            var texture = new THREE.CanvasTexture(canvas);
            texture.minFilter = THREE.LinearFilter;
            var mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
            var sprite = new THREE.Sprite(mat);
            sprite.scale.set(4.5, 1.1, 1); sprite.position.set(0, 3.5, 0); sprite.renderOrder = 999;
            mesh.add(sprite); newAI.label = sprite;
        } catch(e){ console.error('标签创建失败:', e); }
    }
}
function updateAICars(dt){
    if(!playerCar) return;
    for(var i=0;i<aiCars.length;i++){
        var ai = aiCars[i];
        if(ai.finished) continue;
        var V = ai.vehicle;
        var playerWorldZ = playerCar.position.z;
        var gap = ai.z - playerWorldZ;
        var catchupBoost = 0;
        if(gap > 0){ catchupBoost = Math.min(0.15, gap / 1000 * 0.05); }
        else { catchupBoost = Math.max(-0.05, gap / 1000 * 0.03); }
        var maxSpeedMS = V.topSpeedKmh / 3.6 * (0.92 + Math.random() * 0.06) * (1 + catchupBoost);
        var thr = 1;
        var obsZ = 999;
        for(var n=0;n<npcCars.length;n++){ var nc = npcCars[n]; var dz = nc.z - ai.z; if(dz > 0 && dz < 40 && Math.abs(nc.x - ai.x) < 2.4){ if(dz < obsZ) obsZ = dz; } }
        for(var t=0;t<trucks.length;t++){ var tc = trucks[t]; var tdz = tc.z - ai.z; if(tdz > 0 && tdz < 45 && Math.abs(tc.x - ai.x) < 3.0){ if(tdz < obsZ) obsZ = tdz; } }
        var pdz = playerCar.position.z - ai.z;
        if(pdz > 0 && pdz < 35 && Math.abs(carLocalX - ai.x) < 2.4){ if(pdz < obsZ) obsZ = pdz; }
        ai.ramCooldown -= dt;
        if(ai.ramActive > 0) ai.ramActive -= dt;
        if(obsZ < 12 && obsZ > 0 && ai.ramCooldown <= 0 && !ai.isAirborne){ ai.ramActive = 0.6; ai.ramCooldown = 5.0; }
        ai.nitroTimer -= dt;
        var clearAhead = obsZ > 50;
        var nearMaxSpeed = ai.speed > maxSpeedMS * 0.85;
        if(clearAhead && nearMaxSpeed && !ai.isAirborne){ ai.nitro += 25 * dt; }
        ai.nitro = Math.min(100, ai.nitro);
        if(ai.nitro >= 100 && !ai.nitroActive && ai.nitroTimer <= 0 && clearAhead && !ai.isAirborne){ ai.nitroActive = true; ai.nitroTimer = 2.5; }
        if(ai.nitroActive){ ai.nitro -= 40 * dt; if(ai.nitro <= 0){ ai.nitro = 0; ai.nitroActive = false; } }
        if(obsZ < 25){
            if(obsZ < 12 && !ai.ramActive) thr = 0.15;
            else if(obsZ < 18) thr = 0.5;
            ai.changeCooldown -= dt;
            if(ai.changeCooldown <= 0){
                var leftFree = true, rightFree = true;
                var leftX = ai.x - LANE_WIDTH, rightX = ai.x + LANE_WIDTH;
                if(leftX < -RAIL_X + V.width) leftFree = false;
                if(rightX > RAIL_X - V.width) rightFree = false;
                var checkList = npcCars.concat(trucks.map(function(x){return {z:x.z, x:x.x};}));
                for(var c2=0;c2<checkList.length;c2++){
                    var o = checkList[c2];
                    if(Math.abs(o.x - leftX) < 2 && Math.abs(o.z - ai.z) < 22) leftFree = false;
                    if(Math.abs(o.x - rightX) < 2 && Math.abs(o.z - ai.z) < 22) rightFree = false;
                }
                var newLane = ai.targetLane;
                if(leftFree && !rightFree) newLane = Math.max(0, ai.targetLane - 1);
                else if(rightFree && !leftFree) newLane = Math.min(LANE_COUNT-1, ai.targetLane + 1);
                else if(leftFree && rightFree) newLane = (Math.random() < 0.5) ? Math.max(0, ai.targetLane-1) : Math.min(LANE_COUNT-1, ai.targetLane+1);
                ai.targetLane = newLane;
                ai.changeCooldown = 0.8 + Math.random() * 0.6;
            }
        }
        if(gameMode === 'race'){
            var pDist2 = playerCar.position.z - ai.z;
            if(Math.abs(pDist2) < 18 && Math.abs(carLocalX - ai.x) < 3.2){
                if(pDist2 < 0 && pDist2 > -18 && Math.random() < 0.6){
                    var playerLane = Math.round(carLocalX / LANE_WIDTH) + 1;
                    var playerLaneIdx = Math.max(0, Math.min(LANE_COUNT-1, playerLane-1));
                    if(Math.abs(playerLaneIdx - ai.targetLane) === 1){ ai.targetLane = playerLaneIdx; }
                }
            }
        }
        var targetX = laneX(ai.targetLane);
        var steer = (targetX - ai.x) * 0.4;
        steer = Math.max(-1, Math.min(1, steer));
        ai.heading = ai.heading * 0.9 + (-steer * 0.3) * 0.1;
        var maxSpeedBase = V.topSpeedKmh / 3.6;
        var maxSpeedLimit = ai.nitroActive ? maxSpeedBase * 1.35 : maxSpeedMS;
        if(!ai.isAirborne){
            if(thr > 0){
                var gearIdx = Math.min(V.gears - 1, Math.floor(ai.speed / maxSpeedBase * V.gears));
                var gearRatio = V.gearRatios[Math.min(gearIdx, V.gearRatios.length-1)];
                var gearMaxSpeed = maxSpeedBase * (gearIdx + 1) / V.gears;
                var sr = Math.min(1, ai.speed / gearMaxSpeed);
                var accelRate = gearRatio * V.accel * Math.max(0.15, 1 - sr*sr*0.85);
                accelRate *= (1 + Math.max(0, catchupBoost) * 1.5);
                if(ai.ramActive > 0) accelRate += 12;
                if(ai.nitroActive) accelRate += V.accel * 1.5;
                ai.speed += accelRate * thr * dt;
            } else { ai.speed -= V.brake * 0.5 * dt; }
            ai.speed -= 0.0008 * ai.speed * Math.abs(ai.speed) * dt;
            if(ai.speed > maxSpeedLimit) ai.speed = maxSpeedLimit;
            if(ai.speed < 0) ai.speed = 0;
        } else {
            ai.speed += 3 * dt;
            if(ai.speed > maxSpeedLimit) ai.speed = maxSpeedLimit;
        }
        ai.z += -ai.speed * dt;
        ai.x += (targetX - ai.x) * Math.min(1, dt * 1.5);
        var aiHalfW = V.width / 2;
        ai.x = Math.max(-RAIL_X + aiHalfW, Math.min(RAIL_X - aiHalfW, ai.x));
        if(!ai.isAirborne && ai.speed > 8){
            var pzWorld = playerCar.position.z;
            for(var ti=0; ti<trucks.length; ti++){
                var tt = trucks[ti];
                var truckWorldZ = pzWorld + tt.z;
                var tdz2 = ai.z - truckWorldZ;
                var tdx2 = Math.abs(tt.x - ai.x);
                if(tdz2 > 0 && tdz2 < 8 && tdx2 < 2.5){
                    ai.isAirborne = true;
                    ai.carVy = Math.min(22, ai.speed * 0.6);
                    ai.carY = 0; ai.airborneRot = 0;
                    ai.speed *= 1.1; break;
                }
            }
        }
        if(ai.isAirborne){
            ai.carVy -= 22 * dt;
            ai.carY += ai.carVy * dt;
            ai.airborneRot = -ai.carVy * 0.04;
            if(ai.carY > 28){ ai.carY = 28; if(ai.carVy > 0) ai.carVy = 0; }
            if(ai.carY <= 0){ ai.carY = 0; ai.carVy = 0; ai.isAirborne = false; ai.airborneRot = 0; }
        }
        ai.collisionCooldown -= dt;
        if(!ai.isAirborne && ai.collisionCooldown <= 0){
            var pzWorld2 = playerCar.position.z;
            for(var n2 = 0; n2 < npcCars.length; n2++){
                var nc2 = npcCars[n2];
                var ncWorldZ = pzWorld2 + nc2.z;
                var ndz = Math.abs(ncWorldZ - ai.z);
                var ndx = Math.abs(nc2.x - ai.x);
                if(ndx < V.width && ndz < V.length){ ai.speed *= 0.75; ai.collisionCooldown = 1.2; break; }
            }
        }
        if(!ai.isAirborne){
            var dxp = Math.abs(ai.x - carLocalX);
            var dzWorld = Math.abs(playerCar.position.z - ai.z);
            if(dxp < V.width && dzWorld < V.length){
                if(collisionCooldown <= 0){ carSpeed *= (ai.ramActive > 0) ? 0.7 : 0.85; collisionCooldown = 0.6; playCrash(1); }
            }
        }
        var ox = offsetX(ai.z), oy = offsetY(ai.z);
        ai.mesh.position.set(ox + ai.x, oy + (ai.carY || 0), ai.z);
        ai.mesh.rotation.y = ai.heading;
        var slopeY = (offsetY(ai.z + 2) - offsetY(ai.z - 2)) / 4;
        ai.mesh.rotation.x = -Math.atan(slopeY) - (ai.airborneRot || 0) * 0.5;
        ai.distance = Math.max(0, -ai.z) / 1000;
        if(ai.distance >= raceDistance && !ai.finished){ ai.finished = true; ai.finishTime = performance.now(); }
    }
}

// ============ 倒计时 ============
function startCountdown(){
    raceState = 'countdown'; countdownValue = 5; countdownTimer = 0;
    var cd = $('countdown'); var num = $('countdownNum');
    if(cd) cd.style.display = 'flex';
    if(num){ num.textContent = countdownValue; num.style.animation = 'none'; void num.offsetWidth; num.style.animation = 'cdPulse 0.9s ease-out'; }
}
function updateCountdown(dt){
    if(raceState !== 'countdown') return;
    countdownTimer += dt;
    if(countdownTimer >= 1){
        countdownTimer -= 1; countdownValue--;
        if(countdownValue <= 0){
            raceState = 'racing';
            $('countdown').style.display = 'none';
            raceStartTime = performance.now();
            spawnAICars();
            showToast('🏁 出发！');
        } else {
            var num = $('countdownNum');
            if(num){ num.textContent = countdownValue; num.style.animation = 'none'; void num.offsetWidth; num.style.animation = 'cdPulse 0.9s ease-out'; }
        }
    }
}

// ============ 排行榜 ============
function updateLeaderboard(){
    var el = $('lbContent'); if(!el) return;
    var list = [];
    list.push({ name: '🚗 你', dist: playerDistance, me: true, finished: playerDistance >= raceDistance });
    for(var i=0;i<aiCars.length;i++){ list.push({ name: '🤖 ' + aiCars[i].name, dist: aiCars[i].distance, me: false, finished: aiCars[i].finished }); }
    list.sort(function(a,b){ return b.dist - a.dist; });
    var html = '';
    for(var k=0;k<list.length;k++){
        var cls = 'lbRow' + (list[k].me ? ' me' : '');
        var suffix = list[k].finished ? ' ✓' : '';
        html += '<div class="' + cls + '"><span class="lbName">' + list[k].name + '</span><span class="lbDist">' + list[k].dist.toFixed(2) + 'km' + suffix + '</span></div>';
    }
    el.innerHTML = html;
}
function updateRaceProgress(){
    if(!$('raceProgressFill')) return;
    var pct = Math.min(100, (playerDistance / raceDistance) * 100);
    $('raceProgressFill').style.width = pct + '%';
    if($('raceProgressText')) $('raceProgressText').textContent = playerDistance.toFixed(2) + ' / ' + raceDistance.toFixed(1) + ' km';
}

// ============ 比赛结束 ============
function endRace(){
    if(raceState === 'finished') return;
    raceState = 'finished'; gamePaused = true;
    var list = [];
    list.push({ name: '🚗 你', dist: playerDistance, me: true });
    for(var i=0;i<aiCars.length;i++){ list.push({ name: '🤖 ' + aiCars[i].name, dist: aiCars[i].distance, me: false }); }
    list.sort(function(a,b){ return b.dist - a.dist; });
    var html = '';
    for(var k=0;k<list.length;k++){
        var cls = 'rrRow' + (list[k].me ? ' me' : '');
        var medal = ['🥇','🥈','🥉'][k] || '';
        html += '<div class="' + cls + '"><span>' + medal + ' ' + list[k].name + '</span><span>' + list[k].dist.toFixed(2) + ' km</span></div>';
    }
    $('resultList').innerHTML = html;
    var title = $('resultTitle');
    var myRank = list.findIndex(function(x){return x.me;}) + 1;
    if(myRank === 1) title.textContent = '🏆 恭喜获胜！';
    else title.textContent = '🏁 比赛结束 · 第' + myRank + '名';
    showScreen('raceResult');
    $('gameContainer').classList.remove('on');
    if(window.HOME_STATS){
    window.HOME_STATS.addDistance(playerDistance);
    window.HOME_STATS.addRace();
}
    stopAllEngine();
}

// ============ 返回主菜单 ============
function resetToHome(){
    gameStarted = false; gamePaused = false;
    if(window.HOME_STATS && gameMode === 'free'){
    window.HOME_STATS.addDistance(playerDistance);
}
    stopAllEngine();
    if(playerCar) playerCar.visible = false;
    for(var i=0;i<aiCars.length;i++){ if(aiCars[i].mesh) scene.remove(aiCars[i].mesh); }
    aiCars = [];
    carLocalX = 0; carSpeed = 0; carHeading = 0; carY = 0; carVy = 0;
    isAirborne = false; airborneRot = 0;
    steerInput = 0; steerKey = 0; steerSmooth = 0;
    gearText = 'N'; currentGearIdx = 0; engineRPM = 800; isShifting = false; shiftTimer = 0;
    handbrakeOn = false; handbrakeTimer = 0; isDrifting = false; driftAngle = 0;
    spinRemaining = 0; spinActive = false;
    ramActive = 0; ramCooldown = 0; collisionCooldown = 0;
    nitro = 0; nitroActive = false;
    playerDistance = 0; raceDistance = 0; raceState = 'idle'; gameMode = 'free';
    window.playerCatchupBoost = 1.0; window.playerGapKm = 0;
    lightState.headlight = false; lightState.leftTurn = false; lightState.rightTurn = false; lightState.hazard = false;
    if(playerLights.headlight) playerLights.headlight.intensity = 0;
    if(playerLights.headBulbs) playerLights.headBulbs.forEach(function(b){ b.material.color.setHex(0x554433); });
    if(playerLights.tailBulbs) playerLights.tailBulbs.forEach(function(b){ b.material.color.setHex(0x661111); });
    if($('lHeadlight')) $('lHeadlight').classList.remove('on');
    if($('lHazard')) $('lHazard').classList.remove('on');
    if($('lLeftTurn')) $('lLeftTurn').classList.remove('on');
    if($('lRightTurn')) $('lRightTurn').classList.remove('on');
    if($('handbrakeBtn')) $('handbrakeBtn').classList.remove('on');
    if($('spinBtn')) $('spinBtn').classList.remove('on');
    if($('skillBtn')) $('skillBtn').classList.remove('cooling');
    if($('nitroBtn')) $('nitroBtn').classList.remove('ready');
    if($('nitroFill')) $('nitroFill').style.width = '0%';
    if($('raceProgressFill')) $('raceProgressFill').style.width = '0%';
    keys.w = keys.s = keys.a = keys.d = false;
    mobileInput.left = mobileInput.right = mobileInput.gas = mobileInput.brake = false;
    if($('lbContent')) $('lbContent').innerHTML = '';
    if($('resultList')) $('resultList').innerHTML = '';
    if(window.MANUAL) window.MANUAL.reset();
    if(window.TRICK && window.TRICK.reset) window.TRICK.reset();
if(window.TUNNELWALL && window.TUNNELWALL.reset) window.TUNNELWALL.reset();
    $('gameContainer').classList.remove('on');
    $('topBar').style.display = 'none';
    $('lightPanel').classList.remove('on'); $('rightPanel').classList.remove('on');
    $('gearPanel').classList.remove('on'); $('mobileSteer').classList.remove('on');
    $('mobilePedals').classList.remove('on');
    $('rearviewMirror').style.display = 'none';
    $('nitroBar').style.display = 'none';
    $('raceProgress').style.display = 'none';
    $('leaderboard').style.display = 'none';
    $('spinBtn').style.display = 'none';
    $('nitroBtn').style.display = 'none';
    $('tachCanvas').style.display = 'none';
    $('countdown').style.display = 'none';
    showScreen('startScreen');
    playMenuMusic();
    if(window.HOME_MENU && window.HOME_MENU.start) window.HOME_MENU.start();
}

// ============ 主循环 ============
function animate(){
    requestAnimationFrame(animate);
    if(!renderer) return;
    var dt = Math.min(0.05, clock.getDelta());

    if(gameStarted && playerCar && !gamePaused){
        if(raceState === 'countdown'){
            steerInput = 0; steerKey = 0;
            mobileInput.left = mobileInput.right = false;
            mobileInput.gas = mobileInput.brake = false;
            keys.w = keys.s = keys.a = keys.d = false;
            carSpeed = 0;
            updateCountdown(dt);
        } else {
            if(steerKey !== 0) steerInput = steerKey;
            else if(mobileInput.left && !mobileInput.right) steerInput = 1;
            else if(mobileInput.right && !mobileInput.left) steerInput = -1;
            else steerInput = 0;
        }
        try {
            var targetBoost = 1.0;
            if(gameMode === 'race' && raceState === 'racing' && aiCars.length > 0){
                var maxAIDist = 0;
                for(var ai=0; ai<aiCars.length; ai++){ if(aiCars[ai].distance > maxAIDist) maxAIDist = aiCars[ai].distance; }
                var gapKm = maxAIDist - playerDistance;
                window.playerGapKm = gapKm;
                if(gapKm > 0.05){ targetBoost = 1 + Math.min(0.60, gapKm * 0.40); }
            } else {
                window.playerGapKm = 0;
            }
            if(window.playerCatchupBoost === undefined) window.playerCatchupBoost = 1.0;
            var boostDiff = targetBoost - window.playerCatchupBoost;
            if(boostDiff > 0) window.playerCatchupBoost += Math.min(boostDiff, 1.5 * dt);
            else window.playerCatchupBoost += Math.max(boostDiff, -0.8 * dt);

            if(window.HANDBRAKE180 && window.HANDBRAKE180.update) window.HANDBRAKE180.update(dt);
if(window.TUNNELWALL && window.TUNNELWALL.update) window.TUNNELWALL.update(dt);
updatePhysics(dt);
if(window.MULTIPLAYER && window.MULTIPLAYER.tick) window.MULTIPLAYER.tick(dt);
if(window.SPEEDCRASH && window.SPEEDCRASH.update) window.SPEEDCRASH.update();
if(window.TRICK) window.TRICK.tick();
updateNPCs(dt);
            updateRoad(dt);
            updateLights(dt);
            updateTimeOfDay(dt);
            if(gameMode === 'race'){
                if(raceState === 'racing'){
                    playerDistance = Math.max(playerDistance, Math.max(0, -playerCar.position.z) / 1000);
                    if(aiCars.length > 0){ updateAICars(dt); updateLeaderboard(); }
                    updateRaceProgress();
                    if(playerDistance >= raceDistance){ endRace(); }
                    else if(aiCars.length > 0){
                        var allDone = true;
                        for(var i=0;i<aiCars.length;i++){ if(!aiCars[i].finished){ allDone = false; break; } }
                        if(allDone) endRace();
                    }
                }
            } else {
                playerDistance = Math.max(0, -playerCar.position.z) / 1000;
            }
        } catch(err){ console.error('帧错误:', err); }
        if($('nitroFill')) $('nitroFill').style.width = Math.min(100, nitro) + '%';
        if($('nitroBtn')){
            if(nitro >= 100 && !nitroActive) $('nitroBtn').classList.add('ready');
            else $('nitroBtn').classList.remove('ready');
        }
        var kmh = Math.abs(carSpeed) * 3.6;
        if(window.HOME_STATS && gameStarted) window.HOME_STATS.setTopSpeed(kmh);
        updateGearUI();
        drawTach(kmh, engineRPM);

        var _ch = $('catchupHint');
        if(_ch){
            if(gameMode === 'race' && raceState === 'racing' && window.playerCatchupBoost > 1.02){
                var _pct2 = Math.round((window.playerCatchupBoost - 1) * 100);
                var _gapM2 = Math.round((window.playerGapKm || 0) * 1000);
                _ch.textContent = '⚡ 后追 +' + _pct2 + '%  落后 ' + Math.max(0, _gapM2) + 'm';
                _ch.classList.add('show');
            } else {
                _ch.classList.remove('show');
            }
        }
    }

    if(gameStarted){
        try {
            // ★ 每帧强制同步后视镜显隐
            syncMirrorVisibility();
            renderer.render(scene, camera);
            if(!gamePaused && !firstPerson) renderMirror();
        } catch(err){}
    }
}

// ============ 事件绑定 ============
document.addEventListener('keydown', function(e){
    if(raceState === 'countdown') return;
    var k = e.key.toLowerCase();
    if(k==='w'||k==='arrowup'){ keys.w=true; e.preventDefault(); }
    if(k==='s'||k==='arrowdown'){ keys.s=true; e.preventDefault(); }
    if(k==='a'||k==='arrowleft'){ keys.a=true; steerKey=1; e.preventDefault(); }
    if(k==='d'||k==='arrowright'){ keys.d=true; steerKey=-1; e.preventDefault(); }
    if(k==='c') toggleView();
    if(k==='h'){ unlockAudio(); playHorn(); }
    if(k==='l') toggleHeadlight();
    if(k==='q') toggleLeftTurn();
    if(k==='e') toggleRightTurn();
    if(k==='f') toggleHazard();
    if(k==='r') handleSpinClick();
    if(k==='n'){ if(nitro >= 100 && !nitroActive){ nitroActive = true; showToast('🚀 氮气加速！'); playNitroSound(); } }
    if(k===' '){ e.preventDefault(); if(gameStarted) handbrakeOn = true; }
});
document.addEventListener('keyup', function(e){
    var k = e.key.toLowerCase();
    if(k==='w'||k==='arrowup') keys.w=false;
    if(k==='s'||k==='arrowdown') keys.s=false;
    if(k==='a'||k==='arrowleft'){ keys.a=false; steerKey=keys.d?-1:0; }
    if(k==='d'||k==='arrowright'){ keys.d=false; steerKey=keys.a?1:0; }
    if(k===' ') handbrakeOn = false;
});

document.addEventListener('touchstart', function(e){
    if (e.target.closest('button')) return;
    var sp = document.getElementById('settingsPanel');
    if (sp && sp.classList.contains('on')) return;
    if (e.target.closest('#settingsPanel, .screen, #debugRoot, #announceModal')) return;
    isDraggingView = true;
    touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY;
}, {passive: false});
document.addEventListener('touchmove', function(e){
    if (!isDraggingView) return;
    e.preventDefault();
    var dx = e.touches[0].clientX - touchStartX;
    var dy = e.touches[0].clientY - touchStartY;
    camYaw -= dx * 0.005; camPitch -= dy * 0.005;
    // ★ camPitch 最小值 -0.05：防止相机沉到车底盘
    camPitch = Math.max(-0.05, Math.min(0.8, camPitch));
    // ★ camYaw 不限制左右（自然可绕一圈）
    if(camYaw > Math.PI) camYaw -= Math.PI * 2;
    if(camYaw < -Math.PI) camYaw += Math.PI * 2;
    touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY;
}, {passive: false});
document.addEventListener('touchend', function(){ isDraggingView = false; });
document.addEventListener('mousedown', function(e){
    if (e.target.closest('button')) return;
    var sp = document.getElementById('settingsPanel');
    if (sp && sp.classList.contains('on')) return;
    if (e.target.closest('#settingsPanel, .screen, #debugRoot, #announceModal')) return;
    isDraggingView = true; touchStartX = e.clientX; touchStartY = e.clientY;
});
document.addEventListener('mousemove', function(e){
    if (!isDraggingView) return;
    var dx = e.clientX - touchStartX, dy = e.clientY - touchStartY;
    camYaw -= dx * 0.005; camPitch -= dy * 0.005;
    camPitch = Math.max(-0.05, Math.min(0.8, camPitch));
    if(camYaw > Math.PI) camYaw -= Math.PI * 2;
    if(camYaw < -Math.PI) camYaw += Math.PI * 2;
    touchStartX = e.clientX; touchStartY = e.clientY;
});
document.addEventListener('mouseup', function(){ isDraggingView = false; });

bindPress($('mLeft'), function(){ mobileInput.left=true; }, function(){ mobileInput.left=false; });
bindPress($('mRight'), function(){ mobileInput.right=true; }, function(){ mobileInput.right=false; });
bindPress($('mGas'), function(){ mobileInput.gas=true; }, function(){ mobileInput.gas=false; });
bindPress($('mBrake'), function(){ mobileInput.brake=true; }, function(){ mobileInput.brake=false; });
bindTap($('gearD'), function(){ selectGear('D'); });
bindTap($('gearN'), function(){ selectGear('N'); });
bindTap($('gearR'), function(){ selectGear('R'); });
bindTap($('mToggle'), function(){ if(window.MANUAL) window.MANUAL.toggle(); });
bindTap($('mUp'), function(){ if(window.MANUAL) window.MANUAL.upShift(); });
bindTap($('mDown'), function(){ if(window.MANUAL) window.MANUAL.downShift(); });
bindTap($('lHeadlight'), toggleHeadlight);
bindTap($('lLeftTurn'), toggleLeftTurn);
bindTap($('lRightTurn'), toggleRightTurn);
bindTap($('lHazard'), toggleHazard);
bindTap($('lHorn'), function(){
    if(!gameStarted) return;
    if(typeof playHorn === 'function') playHorn();
});
bindTap($('lFlash'), function(){
    if(!gameStarted) return;
    flashHeadlight();
});
bindTap($('skillBtn'), function(){ if(gameStarted) activateRam(); });
bindTap($('spinBtn'), function(){ if(gameStarted) handleSpinClick(); });
bindTap($('viewBtn'), toggleView);
bindTap($('viewTPBtn'), function(){ if(firstPerson){ firstPerson=false; camYaw=0; camPitch=0; applyViewMode(); if(playerCar) playerCar.updateMatrixWorld(true); updateCamera(0.016,0,0,true); saveSettings(); syncMirrorVisibility(); }});
bindTap($('viewFPBtn'), function(){ if(!firstPerson){ firstPerson=true; camYaw=0; camPitch=0; applyViewMode(); if(playerCar) playerCar.updateMatrixWorld(true); updateCamera(0.016,0,0,true); saveSettings(); syncMirrorVisibility(); }});
bindTap($('nitroBtn'), function(){
    if(!gameStarted || raceState === 'countdown') return;
    if(nitro >= 100 && !nitroActive){ nitroActive = true; showToast('🚀 氮气加速！'); playNitroSound(); }
    else if(nitro < 100){ showToast('⚡ 氮气 ' + Math.floor(nitro) + '%'); }
});

(function(){
    var hb = $('handbrakeBtn');
    if(!hb) return;
    function down(e){ e.preventDefault(); e.stopPropagation(); handbrakeOn=true; hb.classList.add('on'); unlockAudio(); }
    function up(e){ handbrakeOn=false; hb.classList.remove('on'); }
    hb.addEventListener('touchstart', down, {passive:false});
    hb.addEventListener('touchend', up);
    hb.addEventListener('touchcancel', up);
    hb.addEventListener('mousedown', down);
    hb.addEventListener('mouseup', up);
    hb.addEventListener('mouseleave', up);
})();

function bindSet(el, ev, fn){ if(el) el.addEventListener(ev, fn); }
bindSet($('timeSlider'), 'input', function(){ $('timeSlider')._dragging = true; timeOfDay = Number($('timeSlider').value); updateTimeOfDay(0); saveSettingsDebounced(); });
if($('timeSlider')) $('timeSlider').addEventListener('pointerup', function(){ $('timeSlider')._dragging = false; });
bindSet($('trafficSlider'), 'input', function(){ trafficLevel = Number($('trafficSlider').value); var labels = ['无','极少','很少','少','偏少','中','偏多','多','很多','极多','爆满']; if($('trafficVal')) $('trafficVal').textContent = labels[trafficLevel] || '中'; saveSettingsDebounced(); });
bindSet($('roadCurveCheck'), 'change', function(){
    if(typeof roadCurveEnabled !== 'undefined') roadCurveEnabled = $('roadCurveCheck').checked;
    saveSettings();
    if(typeof showToast === 'function') showToast(roadCurveEnabled ? '🛣️ 弯道模式' : '➡️ 直线模式');
});
bindSet($('soundCheck'), 'change', function(){ soundEnabled = $('soundCheck').checked; if(!soundEnabled) stopAllEngine(); saveSettings(); });
bindSet($('musicCheck'), 'change', function(){ musicEnabled = $('musicCheck').checked; if(musicEnabled){ if(gameStarted) playGameMusic(); else playMenuMusic(); } else stopAllMusic(); saveSettings(); });
bindSet($('volumeSlider'), 'input', function(){ masterVolume = Number($('volumeSlider').value)/100; $('volumeVal').textContent = $('volumeSlider').value + '%'; updateMusicVolume(); saveSettingsDebounced(); });

function refreshDebugPanel(){
    var el = document.getElementById('debugPanel');
    if(!el) return;
    if(window.DEBUG && window.DEBUG.refresh) window.DEBUG.refresh();
}
function openSettings(){ refreshDebugPanel(); unlockAudio(); $('settingsPanel').classList.add('on'); $('pauseOverlay').classList.add('on'); gamePaused = true; if(bgmMenu) bgmMenu.volume = masterVolume * 0.12; if(bgmGame) bgmGame.volume = masterVolume * 0.12; }
function closeSettings(){ $('settingsPanel').classList.remove('on'); $('pauseOverlay').classList.remove('on'); gamePaused = false; updateMusicVolume(); }
$('settingBtn').addEventListener('click', openSettings);
$('openSettingFromStart').addEventListener('click', openSettings);
$('closeSettingBtn').addEventListener('click', closeSettings);
$('closeSettingBtn2').addEventListener('click', closeSettings);
$('resetSettingsBtn').addEventListener('click', function(){
    timeOfDay = 22; $('timeSlider').value = 22;
    trafficLevel = 5; $('trafficSlider').value = 5; $('trafficVal').textContent = '中';
    soundEnabled = true; $('soundCheck').checked = true;
    masterVolume = 0.55; $('volumeSlider').value = 55; $('volumeVal').textContent = '55%';
    updateTimeOfDay(0);
    switchTrack(0);
});
$('muteBtn').addEventListener('click', function(){
    soundEnabled = !soundEnabled;
    $('soundCheck').checked = soundEnabled;
    $('muteBtn').textContent = soundEnabled ? '🔊' : '🔇';
    if(!soundEnabled) stopAllEngine(); else unlockAudio();
    saveSettings();
});
(function(){
    var mb = $('musicBtn');
    if(mb) mb.addEventListener('click', function(){ unlockAudio(); switchTrack(); });
})();
$('homeBtn').addEventListener('click', resetToHome);
$('backToHomeBtn').addEventListener('click', function(){ closeSettings(); resetToHome(); });
$('exitRaceBtn').addEventListener('click', resetToHome);

$('toVehicleSelect').addEventListener('click', function(){
    unlockAudio(); gameMode = 'free'; showScreen('vehicleSelect');
    setTimeout(function(){ initPreview(); buildVehicleList(); selectVehicle(currentVehicleType); }, 40);
});
$('raceModeBtn').addEventListener('click', raceModeStart);
$('matchYes').addEventListener('click', matchConfirmYes);
$('matchNo').addEventListener('click', matchConfirmNo);
$('backToStart').addEventListener('click', function(){ showScreen('startScreen'); playMenuMusic(); });

$('sceneSelectBtn').addEventListener('click', function(){ unlockAudio(); showScreen('sceneSelect'); });
$('sceneHighwayBtn').addEventListener('click', function(){ currentSceneMode = 'highway'; $('sceneHighwayItem').classList.add('active'); $('sceneCityItem').classList.remove('active'); var t=document.getElementById('sceneTunnelItem'); if(t)t.classList.remove('active'); saveSettings(); });
$('sceneCityBtn').addEventListener('click', function(){ currentSceneMode = 'city'; $('sceneCityItem').classList.add('active'); $('sceneHighwayItem').classList.remove('active'); var t=document.getElementById('sceneTunnelItem'); if(t)t.classList.remove('active'); saveSettings(); });
$('sceneTunnelBtn').addEventListener('click', function(){ currentSceneMode = 'tunnel'; var t=document.getElementById('sceneTunnelItem'); if(t)t.classList.add('active'); $('sceneHighwayItem').classList.remove('active'); $('sceneCityItem').classList.remove('active'); saveSettings(); });
$('sceneConfirmBtn').addEventListener('click', function(){ showScreen('startScreen'); playMenuMusic(); });
$('sceneBackBtn').addEventListener('click', function(){ showScreen('startScreen'); playMenuMusic(); });

$('confirmVehicle').addEventListener('click', function(){
    unlockAudio();
    showScreen(null);
    $('gameContainer').classList.add('on');
    gameStarted = true; gamePaused = false;
    try{ buildPlayerCar(); }catch(err){ console.error('buildPlayerCar 失败: ' + err.message, '\n' + (err.stack || '')); showToast('⚠️ 加载失败'); return; }
    if(playerCar) playerCar.visible = true;
    initMirror(); initTach();
    playerDistance = 0;
    nitro = 0; nitroActive = false;
    updateVisibility();
    updateTimeOfDay(0);
    applySceneMode();
    playGameMusic();

    if(window.MULTIPLAYER && window.MULTIPLAYER.onGameStart) window.MULTIPLAYER.onGameStart();

    if(gameMode === 'race'){
        raceDistance = 10 + Math.random() * 20;
        showToast('🏁 本局比赛 ' + raceDistance.toFixed(1) + ' 公里');
        updateRaceProgress();
        setTimeout(startCountdown, 400);
    } else {
        setTimeout(function(){ if(playerVehicle.isEV) startEV(); else startEngine(); }, 200);
        setTimeout(function(){ showToast('🌃 ' + playerVehicle.name + ' · 出发！'); }, 400);
    }
});

// ============ 调试开关绑定 ============
(function(){
    function bind(){
        var chk = document.getElementById('debugEnableCheck');
        if(chk && !chk._bound){
            chk._bound = true;
            chk.addEventListener('change', function(){
                if(!window.DEBUG) return;
                if(chk.checked){ if(window.DEBUG.enable) window.DEBUG.enable(); else if(window.DEBUG.on) window.DEBUG.on(); }
                else { if(window.DEBUG.disable) window.DEBUG.disable(); else if(window.DEBUG.off) window.DEBUG.off(); }
            });
            if(window.DEBUG && window.DEBUG.onStateChange){
                window.DEBUG.onStateChange(function(isOn){ chk.checked = !!isOn; });
            }
        }
        var expBtn = document.getElementById('debugExportBtn');
        if(expBtn && !expBtn._bound){
            expBtn._bound = true;
            expBtn.addEventListener('click', function(){
                if(window.DEBUG && window.DEBUG.export) window.DEBUG.export();
                else if(typeof showToast === 'function') showToast('⚠️ 调试模块未加载');
            });
        }
        var clrBtn = document.getElementById('debugClearBtn2');
        if(clrBtn && !clrBtn._bound){
            clrBtn._bound = true;
            clrBtn.addEventListener('click', function(){
                if(window.DEBUG && window.DEBUG.clear) window.DEBUG.clear();
                if(typeof showToast === 'function') showToast('🗑 日志已清空');
            });
        }
    }
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
})();

// ============ 启动地图检测 + 引导 ============
function showMapGuide(loadingEl, count, preview, onDownload, onSkip){
    loadingEl.innerHTML =
        '<div style="text-align:center;padding:20px">' +
            '<div style="font-size:52px;margin-bottom:10px">📥</div>' +
            '<div style="font-size:22px;color:#ffcc44;letter-spacing:5px;font-weight:900;margin-bottom:16px">检测到地图文件缺失</div>' +
            '<div style="font-size:13px;color:#aaccee;line-height:2;max-width:80vw;margin-bottom:6px">游戏需要外部地图目录，用于存放可修改的场景文件</div>' +
            '<div style="font-size:12px;color:#44ffaa;background:rgba(0,60,30,.4);padding:8px 16px;border-radius:8px;margin:14px 0;font-family:monospace">/storage/emulated/0/jkbdmaps/</div>' +
            '<div style="font-size:12px;color:#88aadd;line-height:1.9;max-width:80vw;margin-bottom:8px">缺少 <b style="color:#ff8888">' + count + '</b> 个文件：<br><span style="color:#ffaa66;font-size:11px">' + preview + '</span></div>' +
            '<div style="font-size:11px;color:#6688aa;margin:14px 0 22px 0;max-width:80vw">💡 下载后可直接编辑地图，无需重装</div>' +
            '<div>' +
                '<button id="mapGuideYes" style="padding:14px 40px;margin:5px;border-radius:10px;border:none;background:linear-gradient(135deg,#22cc88,#008855);color:#fff;font-size:15px;font-weight:700;letter-spacing:3px;cursor:pointer">✅ 立即下载</button>' +
                '<button id="mapGuideNo" style="padding:14px 40px;margin:5px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#aaccee;font-size:15px;letter-spacing:3px;cursor:pointer">跳过</button>' +
            '</div>' +
        '</div>';
    document.getElementById('mapGuideYes').addEventListener('click', onDownload);
    document.getElementById('mapGuideNo').addEventListener('click', onSkip);
}

window.addEventListener('load', function(){
    var loadingEl = document.getElementById('loading');
    var originalHTML = loadingEl.innerHTML;
// ★ 临时诊断：1.5 秒后输出到 debug 面板
setTimeout(function(){
    function P(level, msg){
        if (window.DEBUG && window.DEBUG[level]) window.DEBUG[level](msg);
        else console.log(msg);
    }
    P('ok', '=== 地图诊断 ===');
    P('ok', 'AndroidMap 类型: ' + (typeof AndroidMap));
    if (typeof AndroidMap === 'undefined'){
        P('err', '❌ AndroidMap 未定义！Java 接口没注册上');
        P('err', '=== 诊断结束 ===');
        return;
    }
    if (typeof AndroidMap.checkMaps !== 'function'){
        P('err', '❌ checkMaps 方法不存在');
        P('err', '=== 诊断结束 ===');
        return;
    }
    try {
        var _r = AndroidMap.checkMaps();
        P('ok', 'checkMaps 返回: ' + _r);
        if (_r === 'OK') P('warn', '⚠️ 返回 OK（认为地图齐全，不弹引导）');
        else if (_r.indexOf('MISSING') === 0) P('ok', '✅ 返回 MISSING（应该弹引导）');
        else P('warn', '⚠️ 返回其他值：' + _r);
    } catch(e){
        P('err', '❌ checkMaps 出错: ' + e.message);
    }
    P('ok', '=== 诊断结束 ===');
}, 1500);

    if (typeof THREE === 'undefined'){
        loadingEl.innerHTML = '<div>⚠️ 3D 引擎加载失败</div>';
        return;
    }

    function startGame(){
        try {
            loadSettings();
            if(window.MULTIPLAYER && window.MULTIPLAYER.init) window.MULTIPLAYER.init();
            initScene(); initTach(); animate(); updateTimeOfDay(0);
            applyLoadedSettingsToUI();
            syncMirrorVisibility();
            setTimeout(function(){
                loadingEl.style.display = 'none';
                showScreen('startScreen');
                updateTrackUI();
                playMenuMusic();
                console.log('✅ 游戏启动成功');
            }, 300);
        } catch(err){
            console.error('启动失败:', err);
            loadingEl.innerHTML = '<div>⚠️ 启动失败</div><div style="font-size:12px">' + err.message + '</div>';
        }
    }

    if (typeof AndroidMap === 'undefined' || !AndroidMap.checkMaps){
        startGame(); return;
        console.log('[地图] AndroidMap 类型:', typeof AndroidMap);
try {
    var _test = AndroidMap.checkMaps();
    console.log('[地图] checkMaps 返回:', _test);
} catch(e){
    console.log('[地图] 出错:', e);
}
    }

    var result;
    try { result = AndroidMap.checkMaps(); }
    catch(e){ startGame(); return; }

    if (!result || result === 'OK' || result.indexOf('MISSING') !== 0){
        startGame(); return;
    }

    var missingStr = result.substring(8);
    var list = (missingStr === 'all') ? [] : missingStr.split(',').filter(function(x){ return x; });
    var preview = (missingStr === 'all')
        ? '首次运行，需要下载全部地图文件'
        : (list.slice(0, 6).join('、') + (list.length > 6 ? ' 等' : ''));
    var count = (missingStr === 'all') ? '全部' : list.length;

    showMapGuide(loadingEl, count, preview, function(){
        loadingEl.innerHTML = '<div style="font-size:18px;color:#88ccff;letter-spacing:3px">📥 正在下载地图...</div>';
        setTimeout(function(){
            var r;
            try { r = AndroidMap.downloadMaps(); }
            catch(e){ r = '❌ ' + e.message; }
            var ok = r && r.indexOf('✅') === 0;
            loadingEl.innerHTML =
                '<div style="font-size:52px;margin-bottom:16px">' + (ok ? '✅' : '❌') + '</div>' +
                '<div style="font-size:20px;color:' + (ok ? '#44ff88' : '#ff8888') + ';letter-spacing:4px;margin-bottom:20px">' +
                    (ok ? '下载完成' : '下载失败') +
                '</div>' +
                '<div style="font-size:12px;color:#88aadd;white-space:pre-line;text-align:center;max-width:80vw;line-height:1.9">' +
                    String(r).replace(/</g,'&lt;') +
                '</div>';
            setTimeout(startGame, ok ? 1200 : 2200);
        }, 150);
    }, function(){
        loadingEl.innerHTML = originalHTML;
        startGame();
    });
});