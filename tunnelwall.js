'use strict';
// ============ 隧道壁驾驶 ============
// 车速 > 300 km/h 时，可以在隧道壁上行驶（左右墙 + 顶部）
// 车速 < 300 km/h 时，从壁上掉落 → 全屏"你无了"
(function(){
    var SPEED_KMH_MIN = 300;
    var WALL_START_X = 7.0;         // 进入墙上模式的 carLocalX
    var TOP_X = 13.0;               // 视为顶部的 carLocalX
    var WALL_MAX_Y = 7.5;           // 墙上最大高度

    var _onWall = false;
    var _dead = false;
    var _deadOverlay = null;

    function isTunnel(){
        return typeof currentSceneMode !== 'undefined' && currentSceneMode === 'tunnel';
    }

    function ensureDeadOverlay(){
        if(_deadOverlay) return;
        var ov = document.createElement('div');
        ov.id = 'deadOverlay';
        ov.style.cssText = 'position:fixed;inset:0;z-index:99999;display:none;' +
            'align-items:center;justify-content:center;flex-direction:column;' +
            'background:rgba(0,0,0,.92);backdrop-filter:blur(8px);';
        ov.innerHTML =
            '<div style="font-size:clamp(40px,12vh,120px);font-weight:900;color:#ff3344;' +
            'letter-spacing:12px;text-shadow:0 0 40px rgba(255,50,50,.9),0 0 80px rgba(255,50,50,.5);' +
            'margin-bottom:20px;animation:deadPulse 1.5s ease-in-out infinite alternate;">你 无 了</div>' +
            '<div style="font-size:14px;color:#888;letter-spacing:4px;margin-bottom:36px">' +
            '车速不足 300 km/h，从隧道壁掉落</div>' +
            '<button id="deadRestartBtn" style="padding:14px 48px;border-radius:10px;border:none;' +
            'background:linear-gradient(135deg,#22cc88,#008855);color:#fff;font-size:16px;font-weight:700;' +
            'letter-spacing:6px;cursor:pointer;box-shadow:0 8px 24px rgba(40,200,120,.5);">重新开始</button>' +
            '<style>@keyframes deadPulse{0%{transform:scale(1)}100%{transform:scale(1.08)}}</style>';
        document.body.appendChild(ov);

        var btn = ov.querySelector('#deadRestartBtn');
        if(btn) btn.addEventListener('click', restart);
    }

    function showDead(){
        if(_dead) return;
        _dead = true;
        ensureDeadOverlay();
        var ov = document.getElementById('deadOverlay');
        if(ov) ov.style.display = 'flex';
        if(typeof playCrash === 'function') playCrash(3);
        if(typeof stopAllEngine === 'function') stopAllEngine();
    }

    function restart(){
        _dead = false;
        _onWall = false;
        var ov = document.getElementById('deadOverlay');
        if(ov) ov.style.display = 'none';

        if(typeof carLocalX !== 'undefined') carLocalX = 0;
        if(typeof carHeading !== 'undefined') carHeading = 0;
        if(typeof carSpeed !== 'undefined') carSpeed = 0;
        if(typeof carY !== 'undefined') carY = 0;
        if(typeof carVy !== 'undefined') carVy = 0;
        if(typeof isAirborne !== 'undefined') isAirborne = false;
        if(typeof airborneRot !== 'undefined') airborneRot = 0;

        if(typeof playerCar !== 'undefined' && playerCar && playerCar.position){
            playerCar.position.set(
                (typeof offsetX === 'function') ? offsetX(0) : 0,
                (typeof offsetY === 'function') ? offsetY(0) : 0,
                0
            );
            playerCar.rotation.y = 0;
            playerCar.rotation.x = 0;
            playerCar.rotation.z = 0;
        }

        window._tunnelNoClamp = false;
        window._tunnelWallY = 0;
        window._tunnelOnWall = false;
        window._tunnelWallRoll = 0;

        if(typeof startEngine === 'function') startEngine();
    }

    function update(dt){
        if(!isTunnel()){
            window._tunnelNoClamp = false;
            window._tunnelWallY = 0;
            window._tunnelOnWall = false;
            window._tunnelWallRoll = 0;
            return;
        }
        if(_dead) return;
        if(typeof playerCar === 'undefined' || !playerCar) return;
        if(typeof carSpeed === 'undefined') return;

        var kmh = Math.abs(carSpeed) * 3.6;
        var fastEnough = kmh > SPEED_KMH_MIN;

        window._tunnelNoClamp = fastEnough;

        var absX = Math.abs(carLocalX);

        if(fastEnough && absX > WALL_START_X){
            // ★ 墙上模式
            _onWall = true;
            window._tunnelOnWall = true;
            var t = Math.min(1, (absX - WALL_START_X) / (TOP_X - WALL_START_X));
            var wallY = t * WALL_MAX_Y;
            window._tunnelWallY = wallY;
            window._tunnelWallRoll = (carLocalX > 0 ? -1 : 1) * t * 1.2;

            // 覆盖 physics 的腾空状态
            if(typeof carY !== 'undefined') carY = wallY;
            if(typeof carVy !== 'undefined') carVy = 0;
            if(typeof isAirborne !== 'undefined') isAirborne = false;
        } else {
            if(_onWall && !fastEnough){
                // 从墙上掉下来
                showDead();
                return;
            }
            _onWall = false;
            window._tunnelOnWall = false;
            window._tunnelWallY = 0;
            window._tunnelWallRoll = 0;
        }
    }

    window.TUNNELWALL = {
        update: update,
        isDead: function(){ return _dead; },
        restart: restart,
        reset: restart
    };
})();