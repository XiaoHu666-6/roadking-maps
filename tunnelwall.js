'use strict';
// ============ 隧道壁驾驶 ============
// 车速 > 300 → 按方向键 → 车沿隧道内壁跑（贴圆柱面）
// carLocalX = R·sin(θ)，carY = R - R·cos(θ)（θ 是圆周角）
(function(){
    var SPEED_MIN = 300;
    var WALL_R = 11;
    var THETA_SPEED = 1.6;
    var WALL_ENTER_X = 4.0;

    var onWall = false;
    var theta = 0;
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
            if (!speedOK){
                showDeath();
                return;
            }

            // 按右键 → theta 增加（右墙→顶部）；按左键 → theta 减小（左墙→顶部）
            if (steerInput < -0.3){
                theta += THETA_SPEED * dt;
            } else if (steerInput > 0.3){
                theta -= THETA_SPEED * dt;
            }

            // ★ 位置：贴着半径 R 的圆柱面
            carLocalX = WALL_R * Math.sin(theta);
            carY = WALL_R - WALL_R * Math.cos(theta);

            // ★ 车头始终朝前，不改 carHeading
            if (typeof carHeading !== 'undefined') carHeading = 0;

            // ★ 车身翻滚，贴合墙面
            if (typeof playerCar !== 'undefined' && playerCar){
                playerCar.rotation.x = 0;
                playerCar.rotation.z = -theta;
            }

        } else {
            // 地面上 → 恢复姿态
            if (typeof playerCar !== 'undefined' && playerCar){
                playerCar.rotation.z = 0;
            }

            // 靠近隧道壁 + 速度 > 300 + 按方向键 → 进入墙模式
            if (speedOK && Math.abs(steerInput) > 0.3 && Math.abs(carLocalX) > WALL_ENTER_X){
                onWall = true;
                var xr = Math.max(-0.99, Math.min(0.99, carLocalX / WALL_R));
                theta = Math.asin(xr);
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
            if (typeof playerCar !== 'undefined' && playerCar){
                playerCar.rotation.z = 0;
                playerCar.rotation.x = 0;
            }
        }
    };
})();