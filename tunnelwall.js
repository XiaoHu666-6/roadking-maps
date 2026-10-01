'use strict';
// ============ 隧道壁驾驶 ============
// 车速 > 300 km/h，按左右方向键 → 沿隧道内壁转圈
// 到顶部后继续按 → 从另一侧下来
// 车速 < 300 km/h → 从墙上掉落 → "你无了"
(function(){
    var SPEED_MIN = 300;         // 最低车速
    var WALL_R = 11;             // 隧道内壁半径（跟 tunnel.js 一致）
    var THETA_SPEED = 1.8;       // 转圈角速度（弧度/秒）
    var WALL_ENTER_X = 3.5;      // carLocalX 超过这个值才允许上墙

    var onWall = false;
    var theta = 0;               // 0=底部  π/2=右侧  π=顶部  -π/2=左侧
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
        theta = 0;
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
                theta = 0;
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

            // 玩家转向 → theta 变化
            if (steerInput > 0.3) theta += THETA_SPEED * dt;
            else if (steerInput < -0.3) theta -= THETA_SPEED * dt;

            // 归一化到 -π 到 π
            while (theta > Math.PI) theta -= 2 * Math.PI;
            while (theta < -Math.PI) theta += 2 * Math.PI;

            // 车在半径 R 的圆弧上：
            //   theta = 0    → carLocalX=0,      carY=0       （地面中心）
            //   theta = π/2  → carLocalX=R,      carY=R       （右侧墙）
            //   theta = π    → carLocalX=0,      carY=2R      （顶部）
            //   theta = -π/2 → carLocalX=-R,     carY=R       （左侧墙）
            carLocalX = WALL_R * Math.sin(theta);
            carY = WALL_R * (1 - Math.cos(theta));

            // 车身侧倾（贴合墙面）
            if (typeof playerCar !== 'undefined' && playerCar){
                playerCar.rotation.z = -theta * 0.6;
            }

            // 车头朝向：跟随切线（沿墙前后）
            // 保持 carHeading 不变即可（车始终朝 -z 方向跑）

            // 回到地面 → 退出墙模式
            if (Math.abs(theta) < 0.2){
                onWall = false;
                theta = 0;
                carLocalX = 0;
                carY = 0;
                window._tunnelOnWall = false;
                window._tunnelNoClamp = false;
                if (typeof playerCar !== 'undefined' && playerCar) playerCar.rotation.z = 0;
                if (typeof showToast === 'function') showToast('✅ 安全落地');
            }
        } else {
            // ===== 不在墙上 =====
            if (speedOK && Math.abs(steerInput) > 0.3 && Math.abs(carLocalX) > WALL_ENTER_X){
                // 进入墙模式
                onWall = true;
                theta = Math.sign(carLocalX) * 0.3;
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
            dead = false; onWall = false; theta = 0;
            if (deadOverlay) deadOverlay.style.display = 'none';
            window._tunnelOnWall = false;
            window._tunnelNoClamp = false;
            if (typeof playerCar !== 'undefined' && playerCar) playerCar.rotation.z = 0;
        }
    };
})();