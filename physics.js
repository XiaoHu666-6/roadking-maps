'use strict';

// ============ 道路常量 ============
var LANE_COUNT = 3;
var LANE_WIDTH = 3.75;
var ROAD_WIDTH = LANE_COUNT * LANE_WIDTH;
var RAIL_X = ROAD_WIDTH/2 + 0.6;
var MAX_HEIGHT = 28;
function laneX(i){ return (i - 1) * LANE_WIDTH; }

// ============ 道路曲线 ============
var BEND_AMP = 20, BEND_FREQ = 0.012;
var BEND_AMP2 = 12, BEND_FREQ2 = 0.005;
var HILL_AMP = 10, HILL_FREQ = 0.009;
var HILL_AMP2 = 6, HILL_FREQ2 = 0.0035;

var roadCurveEnabled = true;   // ★ 道路转弯开关，true=有弯道，false=直线
function offsetX(z){
    if(!roadCurveEnabled) return 0;
    return Math.sin(z * BEND_FREQ) * BEND_AMP + Math.sin(z * BEND_FREQ2 + 1) * BEND_AMP2;
}
function offsetY(z){ return Math.sin(z * HILL_FREQ) * HILL_AMP + Math.sin(z * HILL_FREQ2 + 0.5) * HILL_AMP2; }
function roadTangent(z){
    var d = 2.0;
    var dx = (offsetX(z + d) - offsetX(z - d)) / (2*d);
    var dy = (offsetY(z + d) - offsetY(z - d)) / (2*d);
    return new THREE.Vector3(dx, dy, 1).normalize();
}

// ============ 物理状态 ============
var carLocalX = 0;
var carSpeed = 0, carHeading = 0;
var carY = 0, carVy = 0, isAirborne = false, airborneRot = 0;
var steerInput = 0, steerKey = 0, steerSmooth = 0;
var currentGearIdx = 0;
var gearText = 'N';
var engineRPM = 800;
var isShifting = false, shiftTimer = 0;
var collisionCooldown = 0, ramCooldown = 0, ramActive = 0;
var handbrakeOn = false, handbrakeTimer = 0, driftAngle = 0, isDrifting = false;
var spinRemaining = 0, spinActive = false;
var timeOfDay = 22;
var trafficLevel = 5;

// ★ 氮气系统
var nitro = 0;              // 0~100
var nitroActive = false;    // 是否激活中

// ============ NPC 数据 ============
var NPC_COUNT = 16;
var npcCars = [];
var trucks = [];

// ============ 物理主循环 ============
function updatePhysics(dt){
    var V = playerVehicle;
    var thr = (keys.w || mobileInput.gas) ? 1 : 0;
    var brakeOn = keys.s || mobileInput.brake;
    var maxSpeedMS = V.topSpeedKmh / 3.6;
    var speedRatio = Math.abs(carSpeed) / maxSpeedMS;

    // ★ 玩家后追：提升极速
    if(window.playerCatchupBoost) maxSpeedMS *= window.playerCatchupBoost;

    if(gearText === 'D' && !V.isEV && !(window.MANUAL && window.MANUAL.isOn())){
        var ratio = Math.abs(carSpeed) / maxSpeedMS;
        var hyst = 0.06;
        var newGear = currentGearIdx;
        var upperT = (currentGearIdx + 1) / V.gears + hyst;
        var lowerT = currentGearIdx / V.gears - hyst;
        if(ratio > upperT && currentGearIdx < V.gears - 1) newGear = currentGearIdx + 1;
        else if(ratio < lowerT && currentGearIdx > 0) newGear = currentGearIdx - 1;
        if(newGear !== currentGearIdx && !isShifting){
            var up = newGear > currentGearIdx;
            currentGearIdx = newGear;
            isShifting = true;
            shiftTimer = 0.35;
            playShiftSound(up);
        }
    }
    if(isShifting){ shiftTimer -= dt; if(shiftTimer <= 0) isShifting = false; }

    var accel = 0;
    var isManualMode = window.MANUAL && window.MANUAL.isOn();
    var manualRatio = V.gearRatios[Math.min(currentGearIdx, V.gearRatios.length-1)];
    var manualWheelRPM = Math.abs(carSpeed) / (2*Math.PI*V.wheelR) * 60;
    var manualRPM = manualWheelRPM * manualRatio * 2.5;
    var atRedline = isManualMode && manualRPM >= 8000;
    if(!isAirborne){
        if(gearText === 'D' && thr > 0 && !isShifting && !atRedline){
            var gearRatio = V.gearRatios[Math.min(currentGearIdx, V.gearRatios.length-1)];
            accel = gearRatio * V.accel;
            var gearMaxSpeed = maxSpeedMS * (currentGearIdx + 1) / V.gears;
            var sr = Math.min(1, Math.abs(carSpeed) / gearMaxSpeed);
            accel *= Math.max(0.15, 1 - sr*sr*0.85);
            // ★ 玩家后追：提升加速
            if(window.playerCatchupBoost) accel *= window.playerCatchupBoost;
        } else if(gearText === 'D' && isShifting){
            accel = 0.3;
        } else if(gearText === 'R' && thr > 0){
    accel = -V.accel * 0.6;
    // ★ 掉头翻转后，取消 12 m/s 倒车限速
    if(!(window.HANDBRAKE180 && window.HANDBRAKE180.isReversing && window.HANDBRAKE180.isReversing())){
        if(carSpeed < -12) accel = 0;
    }
} else if(thr === 0){
            accel = -Math.sign(carSpeed) * 2.0;
        }
    }
    if(brakeOn && !isAirborne){
        accel -= Math.sign(carSpeed) * V.brake;
        if(Math.abs(carSpeed) < 0.3){ carSpeed = 0; accel = 0; }
    }

    // ★ 氮气激活时，额外推力（地面）
    if(nitroActive && nitro > 0 && !isAirborne){
        accel += V.accel * 1.8;
        nitro -= 30 * dt;
        if(nitro <= 0){ nitro = 0; nitroActive = false; }
    }
    // ★ 氮气激活时，空中也加速
    if(nitroActive && nitro > 0 && isAirborne){
        carSpeed += V.accel * 1.2 * dt;
        nitro -= 30 * dt;
        if(nitro <= 0){ nitro = 0; nitroActive = false; }
    }

    if(handbrakeOn && Math.abs(carSpeed) > 3){
        if(!isDrifting){ isDrifting = true; driftAngle = carHeading; handbrakeTimer = 0; }
        handbrakeTimer += dt;
        carSpeed *= Math.pow(0.965, dt * 60);
        if(Math.abs(steerInput) > 0.2){
            var spinSpeed = 3.5;
            carHeading += steerInput * spinSpeed * dt * Math.sign(carSpeed);
            if(handbrakeTimer > 1.0 && handbrakeTimer < 1.1) showToast('🌀 180° 漂移！');
            if(handbrakeTimer > 2.0 && handbrakeTimer < 2.1) showToast('🌀 360° 漂移！');
        }
    } else if(!handbrakeOn){
        isDrifting = false;
    }

    if(ramActive > 0) accel += 12;

    if(!isAirborne){
        carSpeed += accel * dt;
        carSpeed -= 0.0008 * carSpeed * Math.abs(carSpeed) * dt;
        // ★ 氮气激活时最高速 ×1.35
        if(carSpeed > maxSpeedMS * (nitroActive ? 1.35 : 1)) carSpeed = maxSpeedMS * (nitroActive ? 1.35 : 1);
        var speedMS = Math.abs(carSpeed);
        steerSmooth += (steerInput - steerSmooth) * Math.min(1, dt * 6);
        var speedFactor = 1 / (1 + speedMS / 20);
var yawRate = steerSmooth * V.steerRate * speedFactor * Math.sign(carSpeed || 1) * Math.min(1, speedMS / 3);
// ★ 悬浮掉头期间：禁止转向改车头（由 HANDBRAKE180 接管）
if(!(window.HANDBRAKE180 && window.HANDBRAKE180.isActive && window.HANDBRAKE180.isActive())){
    carHeading += yawRate * dt;
}
        carLocalX -= steerSmooth * Math.abs(carSpeed) * 0.12 * dt;
        if(steeringMesh) steeringMesh.rotation.z = steerSmooth * 1.2;

        // ★ 氮气收集：极限速度（≥90% 极速）
        if(speedRatio > 0.9){
            nitro += 10 * dt;
        }
        nitro = Math.min(100, nitro);
    } else {
        var airSteer = steerInput * 1.2;
        carHeading += airSteer * dt;
        // ★ 氮气收集：飞车中
        nitro += 20 * dt;
        nitro = Math.min(100, nitro);
    }

    if(spinRemaining > 0){
        var spinStep = Math.min(spinRemaining, 4.0 * dt);
        carHeading += spinStep;
        spinRemaining -= spinStep;
        if(spinRemaining <= 0.01){ spinRemaining = 0; spinActive = false; var sb=document.getElementById('spinBtn'); if(sb) sb.classList.remove('on'); }
    }

    if(isAirborne){
        carVy -= 22 * dt;
        carY += carVy * dt;
        airborneRot = -carVy * 0.04;
        carSpeed += 3 * dt;
        if(carY > MAX_HEIGHT){ carY = MAX_HEIGHT; if(carVy > 0) carVy = 0; }
        if(carY <= 0){
            carY = 0; carVy = 0; isAirborne = false; airborneRot = 0;
            playCrash(2); triggerHitFlash(false); showToast('🛬 落地！');
        }
    }

    playerCar.rotation.y = carHeading;
    var slopeY = (offsetY(playerCar.position.z + 2) - offsetY(playerCar.position.z - 2)) / 4;
    playerCar.rotation.x = -Math.atan(slopeY) - airborneRot * 0.5;
if(window._tunnelWallRoll){
    playerCar.rotation.z = window._tunnelWallRoll;
} else {
    playerCar.rotation.z = 0;
}
    playerCar.position.y = offsetY(playerCar.position.z) + carY;

    var pushAngle = isDrifting ? driftAngle : carHeading;
// ★ 悬浮掉头期间：锁住移动方向（不撞墙）
if(window.HANDBRAKE180 && window.HANDBRAKE180.getLockHeading){
    var _lh = window.HANDBRAKE180.getLockHeading();
    if(_lh !== null && _lh !== undefined) pushAngle = _lh;
}
    var fx = -Math.sin(pushAngle), fz = -Math.cos(pushAngle);
    carLocalX += fx * carSpeed * dt;
    playerCar.position.z += fz * carSpeed * dt;

   var carHalfW = V.width/2, hitRail = false;
if(!window._tunnelNoClamp){
    if(carLocalX - carHalfW < -RAIL_X + 0.05){ carLocalX = -RAIL_X + 0.05 + carHalfW; hitRail = true; }
    if(carLocalX + carHalfW > RAIL_X - 0.05){ carLocalX = RAIL_X - 0.05 - carHalfW; hitRail = true; }
}
    if(hitRail){
        if(Math.abs(fx) > 0.3 && performance.now() - (playerCar._lastRailSound || 0) > 800){
            playerCar._lastRailSound = performance.now(); playCrash(0.8); triggerHitFlash(false);
        }
    }

    playerCar.position.x = offsetX(playerCar.position.z) + carLocalX;

    var tRPM;
    if(gearText === 'N'){ tRPM = 800 + (thr ? 1500 : 0); }
    else if(gearText === 'R'){ tRPM = 800 + Math.abs(carSpeed) * 60; if(thr) tRPM += 400; }
    else if(V.isEV){ tRPM = 800 + Math.abs(carSpeed) * 40; }
    else {
        var currentRatio = V.gearRatios[Math.min(currentGearIdx, V.gearRatios.length-1)];
        var wheelRPM = Math.abs(carSpeed) / (2*Math.PI*V.wheelR) * 60;
        tRPM = wheelRPM * currentRatio * 2.5;
        if(isManualMode){
            tRPM = Math.max(800, Math.min(9000, tRPM));
        } else {
            tRPM = Math.max(800, Math.min(7000, tRPM));
        }
        if(isShifting) tRPM *= 0.85;
        if(thr) tRPM += 300;
    }
    engineRPM += (tRPM - engineRPM) * Math.min(1, dt*6);

    if(ramCooldown > 0) ramCooldown -= dt;
    if(ramActive > 0) ramActive -= dt;
    // ★ 自动转向灯已移除（原逻辑已删除）

    var now = performance.now();
    if(now - lastDashDraw > 60 && dashTexture){ lastDashDraw = now; drawDash(Math.abs(carSpeed)*3.6, engineRPM); }

    if(window.MANUAL) window.MANUAL.update(dt);
    updateEngine(engineRPM, thr);
    playerCar.updateMatrixWorld(true);
    updateCamera(dt, Math.abs(carSpeed), 0);
}

// ============ NPC 逻辑 ============
function makeNPC(z){
    var lane = Math.floor(Math.random()*LANE_COUNT);
    return { x: laneX(lane), z: z, lane: lane, targetLane: lane, baseSpeed: 12 + Math.random()*22, nextChange: 3 + Math.random()*7, aggressive: Math.random() < 0.35 };
}
function respawnNPC(car, z){
    var lane = Math.floor(Math.random()*LANE_COUNT);
    car.lane = lane; car.targetLane = lane;
    car.x = laneX(lane); car.z = z;
    car.baseSpeed = 12 + Math.random()*22;
    car.nextChange = 3 + Math.random()*7;
    car.aggressive = Math.random() < 0.35;
}

function updateNPCs(dt){
    if(!playerCar) return;
    var pz = playerCar.position.z;
    var playerLane = Math.round(carLocalX / LANE_WIDTH + 1);
    var activeCount = Math.round(trafficLevel * NPC_COUNT / 10);

    var V = playerVehicle;
    var playerHalfW = V.width / 2;
    var playerHalfL = V.length / 2;
    var NPC_SEDAN_HALF_W = 1.85 / 2;
    var NPC_SEDAN_HALF_L = 4.4 / 2;

    for(var i=0; i<NPC_COUNT; i++){
        var c = npcCars[i];
        if(i >= activeCount){
            _d.position.set(0, -100, 0); _d.rotation.set(0,0,0); _d.scale.set(0,0,0); _d.updateMatrix();
            npcBodyMesh.setMatrixAt(i, _d.matrix); npcDetailMesh.setMatrixAt(i, _d.matrix);
            continue;
        }
        // ★ 撞飞期间跳过常规 z 更新（由 speedcrash.js 接管）
if(!c._flyActive){
    c.z += (carSpeed - c.baseSpeed) * Math.cos(carHeading) * dt;
}

        if(c.aggressive && Math.abs(c.z) < 30 && c.z < -3){
            var target = playerLane;
            if(target >= 0 && target < LANE_COUNT && target !== c.targetLane) c.targetLane = target;
        }
        if(c.targetLane !== c.lane){
            var tx = laneX(c.targetLane);
            c.x += (tx - c.x) * Math.min(1, dt*2.5);
            if(Math.abs(c.x - tx) < 0.06){ c.x = tx; c.lane = c.targetLane; }
        }
        c.nextChange -= dt;
        if(c.nextChange <= 0 && c.targetLane === c.lane){
            if(Math.random() < 0.3){
                var d = Math.random() < 0.5 ? -1 : 1;
                var nl = c.lane + d;
                if(nl >= 0 && nl < LANE_COUNT) c.targetLane = nl;
            }
            c.nextChange = 4 + Math.random()*8;
        }
        if(c.z > 150) respawnNPC(c, -(250 + Math.random()*200));

        // ★ NPC 碰撞：只标记冷却，减速/提示/撞飞由 speedcrash.js 处理
        if(collisionCooldown <= 0 && !isAirborne){
            var dz = Math.abs(c.z), dx = Math.abs(c.x - carLocalX);
            var overlapX = playerHalfW + NPC_SEDAN_HALF_W;
            var overlapZ = playerHalfL + NPC_SEDAN_HALF_L;
            if(dx < overlapX && dz < overlapZ){
                collisionCooldown = 1.2;
            }
        }
        // ★ NPC 渲染：支持撞飞（_flyY / _flyRot）
        var npcWorldZ = pz + c.z;
        var npcOX = offsetX(npcWorldZ), npcOY = offsetY(npcWorldZ);
        _d.position.set(npcOX + c.x, npcOY + (c._flyY || 0), npcWorldZ);
        _d.rotation.set((c._flyRot || 0) * 0.5, 0, 0);
        _d.scale.set(1,1,1); _d.updateMatrix();
        npcBodyMesh.setMatrixAt(i, _d.matrix);
        npcDetailMesh.setMatrixAt(i, _d.matrix);
    }
    npcBodyMesh.instanceMatrix.needsUpdate = true;
    npcDetailMesh.instanceMatrix.needsUpdate = true;

    var NPC_TRUCK_HALF_W = 2.3 / 2;
    var NPC_TRUCK_HALF_L = 7.2 / 2;
    for(var t=0; t<4; t++){
        var tc = trucks[t];
        tc.z += (carSpeed - tc.baseSpeed) * Math.cos(carHeading) * dt;
        if(tc.targetLane !== tc.lane){
            var ttx = laneX(tc.targetLane);
            tc.x += (ttx - tc.x) * Math.min(1, dt*2);
            if(Math.abs(tc.x - ttx) < 0.1) tc.lane = tc.targetLane;
        }
        tc.nextChange -= dt;
        if(tc.nextChange <= 0){
            var td = Math.random() < 0.5 ? -1 : 1;
            var tnl = tc.lane + td;
            if(tnl >= 0 && tnl < LANE_COUNT) tc.targetLane = tnl;
            tc.nextChange = 8 + Math.random()*10;
        }
        if(tc.z > 150){
            tc.z = -(300 + Math.random()*300);
            tc.lane = Math.floor(Math.random()*LANE_COUNT);
            tc.targetLane = tc.lane;
            tc.x = laneX(tc.lane);
        }
        // ★ 卡车跳板：必须正向行驶才能触发起飞（逆行不飞）
        if(collisionCooldown <= 0 && !isAirborne){
            var tdz = Math.abs(tc.z), tdx = Math.abs(tc.x - carLocalX);
            var overlapTX = playerHalfW + NPC_TRUCK_HALF_W;
            var overlapTZ = playerHalfL + NPC_TRUCK_HALF_L;
            // ★ 玩家必须朝 -z 方向前进（正向），才触发跳板
            var fzDir = -Math.cos(carHeading);
            var movingForward = fzDir < -0.5 && carSpeed > 8;
            if(tdx < overlapTX && tdz < overlapTZ && movingForward){
                carVy = Math.min(22, carSpeed * 0.6);
                isAirborne = true; airborneRot = 0;
                carSpeed *= 1.1; // 起飞瞬间提速
                playCrash(2.5); triggerHitFlash(true); showToast('🛹 跳板起飞！');
                collisionCooldown = 1.2;
            }
        }
        var tcWorldZ = pz + tc.z;
        var tcOX = offsetX(tcWorldZ), tcOY = offsetY(tcWorldZ);
        _d.position.set(tcOX + tc.x, tcOY, tcWorldZ);
        _d.rotation.set(0,0,0); _d.scale.set(1,1,1); _d.updateMatrix();
        npcTruckBodyMesh.setMatrixAt(t, _d.matrix);
        npcTruckDetailMesh.setMatrixAt(t, _d.matrix);
    }
    npcTruckBodyMesh.instanceMatrix.needsUpdate = true;
    npcTruckDetailMesh.instanceMatrix.needsUpdate = true;
    if(collisionCooldown > 0) collisionCooldown -= dt;
}