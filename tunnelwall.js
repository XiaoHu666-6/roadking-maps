'use strict';
// ============ 隧道壁驾驶 ============
// 车速 > 300，靠近隧道壁 → 沿内壁跑（左右墙 + 顶部）
// 车头朝向沿圆周切线，车身贴壁
(function(){
    var SPEED_MIN = 300;
    var WALL_R = 11;
    var PHI_SPEED = 1.6;          // 圆周角速度 rad/s
    var WALL_ENTER_X = 4.5;       // |carLocalX| 超过此值才允许上墙

    var onWall = false;
    var phi = Math.PI / 2;        // 圆周角：0=右墙, π/2=顶部, π=左墙
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
        phi = Math.PI / 2;
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

            // ★ 按左键（steerInput > 0）→ phi 增加 → 往左墙方向
            //   按右键（steerInput < 0）→ phi 减小 → 往右墙方向
            //   但 phi 限制在 [0, π]（只在右墙到左墙之间）
            if (steerInput > 0.3){
                phi += PHI_SPEED * dt;
            } else if (steerInput < -0.3){
                phi -= PHI_SPEED * dt;
            }
            phi = Math.max(0, Math.min(Math.PI, phi));

            // ★ 位置：圆周参数化
            carLocalX = WALL_R * Math.cos(phi);
            carY = WALL_R + WALL_R * Math.sin(phi);

            // ★ 车头朝向切线方向：切线 = (-sin φ, cos φ)
            //   用 rotation.x（pitch）表示"车头抬起/俯冲"
            //   phi=0 (右墙) → 车头朝上 → pitch = -π/2
            //   phi=π/2 (顶部) → 车头朝前 → pitch = 0
            //   phi=π (左墙) → 车头朝下 → pitch = π/2
            var pitch = phi - Math.PI / 2;
            // 车身侧倾（贴壁）
            var roll = phi - Math.PI / 2;
            if (typeof playerCar !== 'undefined' && playerCar){
                playerCar.rotation.x = pitch;
                playerCar.rotation.z = roll;
            }
            // 车头 yaw 保持 -z 方向
            if (typeof carHeading !== 'undefined') carHeading = 0;

        } else {
            // ===== 地面开车，检查是否进入墙模式 =====
            // 恢复车身姿态
            if (typeof playerCar !== 'undefined' && playerCar){
                playerCar.rotation.z = 0;
            }

            if (speedOK && Math.abs(steerInput) > 0.3 && Math.abs(carLocalX) > WALL_ENTER_X){
                onWall = true;
                // ★ 根据 carLocalX 反推 phi
                //   carLocalX > 0（右墙）：phi = acos(carLocalX / R) ∈ [0, π/2]
                //   carLocalX < 0（左墙）：phi = acos(carLocalX / R) ∈ [π/2, π]
                var xr = Math.max(-0.99, Math.min(0.99, carLocalX / WALL_R));
                phi = Math.acos(xr);
                // 如果玩家按右键进入，phi 应更靠近 0；按左键进入，更靠近 π
                // acos 已经处理了这个逻辑（carLocalX > 0 → phi 靠近 0）

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
            dead = false; onWall = false; phi = Math.PI / 2;
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