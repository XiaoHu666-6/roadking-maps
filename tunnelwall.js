'use strict';
// ============ 隧道壁驾驶 ============
(function(){
    var SPEED_MIN = 300;
    var WALL_R = 11;
    var THETA_SPEED = 1.6;
    var WALL_ENTER_X = 3.5;

    var onWall = false;
    var theta = 0;
    var entered = false;    // 已经爬到一定高度（防止刚进入就退出）
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
        entered = false;
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
                entered = false;
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

            // ★ 关键修复：theta 变化方向跟"车往哪边爬"一致
            // 按右键（steerInput < 0）→ 车往右移 → theta 增加
            // 按左键（steerInput > 0）→ 车往左移 → theta 减小
            if (steerInput < -0.3){
                theta += THETA_SPEED * dt;
            } else if (steerInput > 0.3){
                theta -= THETA_SPEED * dt;
            }

            // 归一化到 0 ~ 2π
            while (theta < 0) theta += Math.PI * 2;
            while (theta >= Math.PI * 2) theta -= Math.PI * 2;

            // 圆弧位置：theta=0 地面中心，π/2 右墙，π 顶部，3π/2 左墙
            carLocalX = WALL_R * Math.sin(theta);
            carY = WALL_R * (1 - Math.cos(theta));

            // 车头固定朝前方（不随方向键转向）
            carHeading = 0;

            // 车身侧倾（贴合墙面）
            if (typeof playerCar !== 'undefined' && playerCar){
                playerCar.rotation.z = -theta;
            }

            // 已经爬到一定高度 → 允许退出
            if (theta > 0.3 && theta < Math.PI * 2 - 0.3){
                entered = true;
            }

            // 回到地面附近 → 退出墙模式
            if (entered && theta < 0.15){
                onWall = false;
                entered = false;
                theta = 0;
                carLocalX = 0;
                carY = 0;
                window._tunnelOnWall = false;
                window._tunnelNoClamp = false;
                if (typeof playerCar !== 'undefined' && playerCar) playerCar.rotation.z = 0;
                if (typeof showToast === 'function') showToast('✅ 安全落地');
            }
        } else {
            // ===== 不在墙上，检查是否进入 =====
            if (speedOK && Math.abs(steerInput) > 0.3 && Math.abs(carLocalX) > WALL_ENTER_X){
                onWall = true;
                entered = false;

                // ★ 关键修复：从当前 carLocalX 对应的角度开始，不跳变
                var sinVal = Math.max(-1, Math.min(1, carLocalX / WALL_R));
                theta = Math.asin(sinVal);
                if (carLocalX < 0) theta = Math.PI * 2 - Math.abs(theta);  // 左半边
                // 右半边保持 asin 结果（0 ~ π/2）

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
            dead = false; onWall = false; entered = false; theta = 0;
            if (deadOverlay) deadOverlay.style.display = 'none';
            window._tunnelOnWall = false;
            window._tunnelNoClamp = false;
            if (typeof playerCar !== 'undefined' && playerCar) playerCar.rotation.z = 0;
        }
    };
})();