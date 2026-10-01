'use strict';
// ============ 隧道壁驾驶 ============
// 车速 > 300 km/h → 按方向键 → 车沿隧道内壁跑（左右墙 + 顶部）
// carLocalX 由玩家控制，carY 由 carLocalX 推导（保证贴在半圆内壁上）
(function(){
    var SPEED_MIN = 300;
    var WALL_R = 11;               // 隧道半径
    var LATERAL_SPEED = 10;        // 按方向键时 carLocalX 变化速度（m/s）
    var WALL_ENTER_X = 3.5;        // carLocalX 超过此值才允许上墙

    var onWall = false;
    var dead = false;
    var deadOverlay = null;

    function isTunnel(){
        return typeof currentSceneMode !== 'undefined' && currentSceneMode === 'tunnel';
    }

    function showDeath(){
        if (dead) return;
        dead = true;
        if (!deadOverlay){
            deadOverlay = document.createElement('div');
            deadOverlay.id = 'tunnelDeadOverlay';
            deadOverlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;flex-direction:column;background:rgba(0,0,0,.92);backdrop-filter:blur(6px);';
            deadOverlay.innerHTML =
                '<div style="font-size:clamp(40px,12vh,110px);font-weight:900;color:#ff3344;letter-spacing:12px;text-shadow:0 0 40px rgba(255,50,50,.9);margin-bottom:20px;">你 无 了</div>' +
                '<div style="font-size:14px;color:#888;letter-spacing:4px;margin-bottom:36px;">车速不足 300 km/h，从隧道壁掉落</div>' +
                '<button id="tunnelRestartBtn" style="padding:14px 48px;border-radius:10px;border:none;background:linear-gradient(135deg,#22cc88,#008855);color:#fff;font-size:16px;font-weight:700;letter-spacing:6px;cursor:pointer;">重新开始</button>';
            document.body.appendChild(deadOverlay);
            document.getElementById('tunnelRestartBtn').addEventListener('click', restart);
        }
        deadOverlay.style.display = 'flex';
        if (typeof playCrash === 'function') playCrash(3);
        if (typeof stopAllEngine === 'function') stopAllEngine();
    }

    function restart(){
        dead = false;
        onWall = false;
        if (deadOverlay) deadOverlay.style.display = 'none';
        if (typeof carLocalX !== 'undefined') carLocalX = 0;
        if (typeof carHeading !== 'undefined') carHeading = 0;
        if (typeof carSpeed !== 'undefined') carSpeed = 0;
        if (typeof carY !== 'undefined') carY = 0;
        if (typeof carVy !== 'undefined') carVy = 0;
        if (typeof isAirborne !== 'undefined') isAirborne = false;
        if (typeof airborneRot !== 'undefined') airborneRot = 0;
        if (typeof playerCar !== 'undefined' && playerCar && playerCar.position){
            playerCar.position.set(
                (typeof offsetX === 'function') ? offsetX(0) : 0,
                (typeof offsetY === 'function') ? offsetY(0) : 0,
                0
            );
            playerCar.rotation.set(0, 0, 0);
        }
        window._tunnelOnWall = false;
        window._tunnelNoClamp = false;
        if (typeof startEngine === 'function') startEngine();
    }

    function update(dt){
        if (!isTunnel()){
            if (onWall){
                onWall = false;
                window._tunnelOnWall = false;
                window._tunnelNoClamp = false;
                if (typeof playerCar !== 'undefined' && playerCar) playerCar.rotation.z = 0;
            }
            return;
        }
        if (dead) return;

        var kmh = Math.abs(carSpeed) * 3.6;
        var speedOK = kmh > SPEED_MIN;

        if (onWall){
            // ===== 在墙上 =====
            if (!speedOK){
                showDeath();
                return;
            }

            // ★ 玩家方向键直接控制 carLocalX
            //  按右键 → carLocalX 增加（往右走）
            //  按左键 → carLocalX 减小（往左走）
            if (steerInput < -0.3){
                carLocalX += LATERAL_SPEED * dt;
            } else if (steerInput > 0.3){
                carLocalX -= LATERAL_SPEED * dt;
            }
            // 限制在 [-R, R]
            carLocalX = Math.max(-WALL_R * 0.99, Math.min(WALL_R * 0.99, carLocalX));

            // ★ 从 carLocalX 推导 carY（上半圆内壁）
            //  x² + (y-R)² = R²  →  y = R + sqrt(R² - x²)
            var dx = carLocalX / WALL_R;
            var dy = Math.sqrt(Math.max(0, 1 - dx * dx));
            carY = WALL_R + WALL_R * dy;   // carY ∈ [R, 2R]

            // ★ 车头固定朝前（-z 方向），不随方向键转
            carHeading = 0;

            // ★ 车身侧倾（贴合墙面）：carLocalX = R → 车翻转 90°
            if (typeof playerCar !== 'undefined' && playerCar){
                playerCar.rotation.z = -dx * Math.PI / 2;
            }

        } else {
            // ===== 地面开车，检查是否进入墙模式 =====
            if (speedOK && Math.abs(steerInput) > 0.3 && Math.abs(carLocalX) > WALL_ENTER_X){
                onWall = true;
                // 把 carLocalX 拉到"墙的中部"附近（避免从边缘开始）
                carLocalX = Math.sign(carLocalX) * WALL_R * 0.7;
                var dx2 = carLocalX / WALL_R;
                var dy2 = Math.sqrt(Math.max(0, 1 - dx2 * dx2));
                carY = WALL_R + WALL_R * dy2;
                window._tunnelOnWall = true;
                window._tunnelNoClamp = true;
                if (typeof showToast === 'function') showToast('🧗 隧道壁模式！');
            }
        }

        window._tunnelNoClamp = onWall;
    }

    window.TUNNELWALL = {
        update: update,
        isDead: function(){ return dead; },
        isOnWall: function(){ return onWall; },
        restart: restart,
        reset: function(){
            dead = false; onWall = false;
            if (deadOverlay) deadOverlay.style.display = 'none';
            window._tunnelOnWall = false;
            window._tunnelNoClamp = false;
            if (typeof playerCar !== 'undefined' && playerCar) playerCar.rotation.z = 0;
        }
    };
})();