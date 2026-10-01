'use strict';
// ============ 撞车系统 ============
(function(){
    var TRIGGER_KMH = 300;
    var _lastT = 0;

    // ---------- 音效（路径写死）----------
    var BOOM_URL = 'file:///android_asset/boom.mp3';
    var _boomPool = [];
    var _boomIdx = 0;
    var BOOM_POOL_SIZE = 4;

    function initBoomPool(){
        if(_boomPool.length) return;
        for(var i = 0; i < BOOM_POOL_SIZE; i++){
            try{
                var a = new Audio(BOOM_URL);
                a.preload = 'auto';
                _boomPool.push(a);
            }catch(e){}
        }
    }
    function playBoomSound(){
        initBoomPool();
        if(!_boomPool.length) return;
        var a = _boomPool[_boomIdx];
        _boomIdx = (_boomIdx + 1) % _boomPool.length;
        try{
            var vol = 0.75 * (typeof masterVolume !== 'undefined' ? masterVolume : 0.55);
            a.volume = Math.max(0, Math.min(1, vol));
            a.currentTime = 0;
            var p = a.play();
            if(p && p.catch) p.catch(function(){});
        }catch(e){}
    }

    // ---------- 工具 ----------
    function respawnFar(c){
        c.z = -(300 + Math.random() * 300);
        c.lane = Math.floor(Math.random() * LANE_COUNT);
        c.targetLane = c.lane;
        c.x = (typeof laneX === 'function') ? laneX(c.lane) : 0;
        c.baseSpeed = 12 + Math.random() * 22;
        c.nextChange = 4 + Math.random() * 8;
        c._flyY = 0; c._flyVy = 0; c._flyVx = 0; c._flyVz = 0; c._flyRot = 0; c._flyActive = false;
        c._pushActive = false; c._pushVx = 0; c._pushTimer = 0;
    }

    // ---------- 物理更新 ----------
    function updatePhysics(){
        if(typeof npcCars === 'undefined' || !npcCars) return;
        var now = performance.now();
        var dt = _lastT ? Math.min(0.05, (now - _lastT) / 1000) : 0.016;
        _lastT = now;

        for(var i = 0; i < npcCars.length; i++){
            var c = npcCars[i];

            // 撞飞状态
            if(c._flyActive){
                c._flyVy -= 24 * dt;
                c._flyY += c._flyVy * dt;
                c._flyRot = (c._flyRot || 0) + (c._flyRotSpeed || 9) * dt;
                if(c._flyVx) c.x += c._flyVx * dt;
                if(c._flyVz) c.z += c._flyVz * dt;

                var lim = (typeof RAIL_X !== 'undefined' ? RAIL_X : 6) - 1;
                if(c.x < -lim){ c.x = -lim; c._flyVx = Math.abs(c._flyVx) * 0.5; }
                if(c.x > lim){ c.x = lim; c._flyVx = -Math.abs(c._flyVx) * 0.5; }

                if(c._flyY <= 0){ respawnFar(c); }
                continue;
            }

            // 低速被撞开
            if(c._pushActive){
                c._pushTimer -= dt;
                c.x += c._pushVx * dt;
                var lim2 = (typeof RAIL_X !== 'undefined' ? RAIL_X : 6) - 1;
                if(c.x < -lim2){ c.x = -lim2; c._pushVx = 0; }
                if(c.x > lim2){ c.x = lim2; c._pushVx = 0; }

                if(c._pushTimer <= 0){
                    c._pushActive = false;
                    c._pushVx = 0;
                    if(typeof LANE_COUNT !== 'undefined' && typeof laneX === 'function'){
                        var closest = 0, minD = 9999;
                        for(var L = 0; L < LANE_COUNT; L++){
                            var lx = laneX(L);
                            var d = Math.abs(lx - c.x);
                            if(d < minD){ minD = d; closest = L; }
                        }
                        c.lane = closest;
                        c.targetLane = closest;
                    }
                }
            }
        }
    }

    // ---------- 撞击反应 ----------
    function flyNormal(c){
        c._flyActive = true;
        c._flyY = 0.01;
        c._flyVy = 14 + Math.random() * 5;
        c._flyVx = (Math.random() - 0.5) * 10;
        c._flyVz = -25 - Math.random() * 15;
        c._flyRot = 0;
        c._flyRotSpeed = 8 + Math.random() * 4;
    }
    function flyTruck(c){
        c._flyActive = true;
        c._flyY = 0.01;
        c._flyVy = 22 + Math.random() * 8;
        c._flyVx = (c.x < carLocalX ? -1 : 1) * (18 + Math.random() * 10);
        c._flyVz = -40 - Math.random() * 20;
        c._flyRot = 0;
        c._flyRotSpeed = 16 + Math.random() * 8;
    }
    function pushAside(c){
        var dir = (c.x < carLocalX) ? -1 : 1;
        c._pushActive = true;
        c._pushTimer = 0.55;
        c._pushVx = dir * (14 + Math.random() * 4);
        c.baseSpeed *= 0.35;
        if(c.baseSpeed < 4) c.baseSpeed = 4;
        c._lastHitTime = performance.now();
    }

    // ---------- 碰撞检测 ----------
    function checkCollision(){
        try{
            if(typeof gameStarted === 'undefined' || !gameStarted) return;
            if(typeof gamePaused !== 'undefined' && gamePaused) return;
            if(typeof playerCar === 'undefined' || !playerCar) return;
            if(typeof npcCars === 'undefined' || !npcCars || !npcCars.length) return;
            if(typeof playerVehicle === 'undefined' || !playerVehicle) return;
            if(typeof isAirborne !== 'undefined' && isAirborne) return;

            var isTruck = (typeof currentVehicleType !== 'undefined' && currentVehicleType === 'truck');

            var myHalfW = playerVehicle.width / 2;
            var myHalfL = playerVehicle.length / 2;
            var npcHalfW = 1.85 / 2;
            var npcHalfL = 4.4 / 2;
            var overlapX = myHalfW + npcHalfW;
            var overlapZ = myHalfL + npcHalfL;

            for(var i = 0; i < npcCars.length; i++){
                var c = npcCars[i];
                if(typeof c.z !== 'number') continue;
                if(c._flyActive) continue;
                if(c._pushActive) continue;
                if(c._lastHitTime && performance.now() - c._lastHitTime < 600) continue;

                var dz = Math.abs(c.z);
                var dx = Math.abs(c.x - carLocalX);

                if(dx < overlapX && dz < overlapZ){
                    var kmh = Math.abs(carSpeed) * 3.6;

                    // 卡车：猛撞飞
                    if(isTruck){
                        flyTruck(c);
                        playBoomSound();
                        if(typeof playCrash === 'function') playCrash(3);
                        if(typeof triggerHitFlash === 'function') triggerHitFlash(true);
                        if(typeof showToast === 'function') showToast('🚛 卡车把 NPC 撞飞了！');
                        if(typeof console !== 'undefined') console.log('🚛 卡车撞飞 NPC #' + i + ' @ ' + Math.round(kmh) + ' km/h');
                        break;
                    }

                    // 非卡车 > 300：撞飞
                    if(kmh > TRIGGER_KMH){
                        flyNormal(c);
                        playBoomSound();
                        if(typeof playCrash === 'function') playCrash(2.5);
                        if(typeof triggerHitFlash === 'function') triggerHitFlash(true);
                        if(typeof showToast === 'function') showToast('💥 NPC 被撞飞了！');
                        if(typeof console !== 'undefined') console.log('💥 撞飞 NPC #' + i + ' @ ' + Math.round(kmh) + ' km/h');
                    } else {
                        // 非卡车 ≤ 300：不飞，只减速让路
                        pushAside(c);
                        if(typeof playCrash === 'function') playCrash(1.8);
                        if(typeof triggerHitFlash === 'function') triggerHitFlash(false);
                        var q = ['💢 别挡道！', '💢 谁让你加塞的！', '💢 公路之王在此！', '💢 驾考宝典白学了？'];
                        if(typeof showToast === 'function') showToast(q[Math.floor(Math.random() * q.length)]);
                        if(typeof console !== 'undefined') console.log('💢 撞开 NPC #' + i + ' @ ' + Math.round(kmh) + ' km/h');
                    }
                    break;
                }
            }
        }catch(e){}
    }

    (function loop(){
        requestAnimationFrame(loop);
        updatePhysics();
        checkCollision();
    })();

    window.SPEEDCRASH = {
        update: checkCollision,
        setTrigger: function(v){ TRIGGER_KMH = v; },
        getTrigger: function(){ return TRIGGER_KMH; }
    };
})();