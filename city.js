'use strict';

// ============ 城市高架场景 ============
var cityBuildingsInst = null;
var cityGroundInst = null;
var cityPillarInst = null;
var cityWindowsInst = null;
var cityInited = false;
var cityBuildingsData = [];
var cityWindowsData = [];
var CITY_BUILDING_COUNT = 120;
var CITY_PILLAR_COUNT = 40;
var CITY_WINDOWS_COUNT = 900;

function buildCityScene(){
    if(cityInited) return;
    cityInited = true;

    // 地面（比路面低 8 米，制造高架感）
    var groundGeo = new THREE.BoxGeometry(300, 0.2, 80);
    var groundMat = new THREE.MeshStandardMaterial({ color: 0x0a0a14, roughness: 0.95 });
    cityGroundInst = new THREE.InstancedMesh(groundGeo, groundMat, 30);
    cityGroundInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    cityGroundInst.frustumCulled = false;
    cityGroundInst.visible = false;
    scene.add(cityGroundInst);

    // 桥墩（在路面下方支撑高架）
    var pillarGeo = new THREE.BoxGeometry(3.0, 8, 3.0);
    var pillarMat = new THREE.MeshStandardMaterial({ color: 0x2a2a35, roughness: 0.9 });
    cityPillarInst = new THREE.InstancedMesh(pillarGeo, pillarMat, CITY_PILLAR_COUNT);
    cityPillarInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    cityPillarInst.frustumCulled = false;
    cityPillarInst.visible = false;
    scene.add(cityPillarInst);

    // 建筑
    var bGeo = new THREE.BoxGeometry(1, 1, 1);
    var bMat = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.7, metalness: 0.3 });
    cityBuildingsInst = new THREE.InstancedMesh(bGeo, bMat, CITY_BUILDING_COUNT);
    cityBuildingsInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    cityBuildingsInst.frustumCulled = false;
    cityBuildingsInst.visible = false;
    scene.add(cityBuildingsInst);

    // 窗户灯光（发光小方块）
    var winGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    var winMat = new THREE.MeshBasicMaterial({ color: 0xffdd88 });
    cityWindowsInst = new THREE.InstancedMesh(winGeo, winMat, CITY_WINDOWS_COUNT);
    cityWindowsInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    cityWindowsInst.frustumCulled = false;
    cityWindowsInst.visible = false;
    scene.add(cityWindowsInst);

    // 生成建筑数据（离道路更近）
    for(var i=0;i<CITY_BUILDING_COUNT;i++){
        var side = (i % 2 === 0) ? -1 : 1;
        var w = 8 + Math.random() * 12;
        var h = 20 + Math.random() * 65;
        var d = 8 + Math.random() * 12;
        cityBuildingsData.push({
            z: (Math.floor(i/2) / (CITY_BUILDING_COUNT/2)) * 3600 - 1800 + Math.random()*25,
            x: side * (18 + Math.random() * 22 + w/2),   // ★ 从 70 改成 18，靠近道路
            w: w, h: h, d: d,
            color: new THREE.Color().setHSL(0.58 + Math.random() * 0.15, 0.4, 0.12 + Math.random() * 0.15)
        });
    }
    for(var j=0;j<CITY_BUILDING_COUNT;j++){
        cityBuildingsInst.setColorAt(j, cityBuildingsData[j].color);
    }
    if(cityBuildingsInst.instanceColor) cityBuildingsInst.instanceColor.needsUpdate = true;

    // 生成窗户（每个建筑 5-10 个）
    for(var wi=0; wi<CITY_WINDOWS_COUNT; wi++){
        var bi = Math.floor(Math.random() * CITY_BUILDING_COUNT);
        var b = cityBuildingsData[bi];
        var face = Math.random();
        var wx, wz;
        if(face < 0.6){
            // 朝向道路的一面（左/右侧）
            wx = b.x + (b.x > 0 ? -1 : 1) * (b.w/2 + 0.25);
            wz = b.z + (Math.random() - 0.5) * (b.d - 1.5);
        } else {
            // 前/后面
            wx = b.x + (Math.random() - 0.5) * (b.w - 1.5);
            wz = b.z + (Math.random() < 0.5 ? -1 : 1) * (b.d/2 + 0.25);
        }
        var wy = 2 + Math.random() * (b.h - 3);
        cityWindowsData.push({ x: wx, y: wy, z: wz, hue: Math.random() });
    }
    // 给窗户随机颜色（暖黄/冷蓝/粉）
    for(var wj=0; wj<CITY_WINDOWS_COUNT; wj++){
        var wd = cityWindowsData[wj];
        var c = new THREE.Color();
        if(wd.hue < 0.6) c.setHex(0xffdd88);
        else if(wd.hue < 0.85) c.setHex(0x88ddff);
        else c.setHex(0xff88aa);
        cityWindowsInst.setColorAt(wj, c);
    }
    if(cityWindowsInst.instanceColor) cityWindowsInst.instanceColor.needsUpdate = true;
}

function updateCityScene(){
    if(!cityBuildingsInst || !playerCar) return;
    var pz = playerCar.position.z;
    var cycle = 3600;

    // 建筑
    for(var bi=0; bi<CITY_BUILDING_COUNT; bi++){
        var b = cityBuildingsData[bi];
        var rel = (b.z - pz) % cycle;
        if(rel > cycle/2) rel -= cycle;
        if(rel < -cycle/2) rel += cycle;
        var bz = pz + rel;
        var ox = offsetX(bz), oy = offsetY(bz);
        _d.position.set(ox + b.x, oy - 8 + b.h/2, bz);
        _d.rotation.set(0,0,0);
        _d.scale.set(b.w, b.h, b.d);
        _d.updateMatrix();
        cityBuildingsInst.setMatrixAt(bi, _d.matrix);
    }
    cityBuildingsInst.instanceMatrix.needsUpdate = true;

    // 窗户
    for(var wi=0; wi<CITY_WINDOWS_COUNT; wi++){
        var wd = cityWindowsData[wi];
        var rel2 = (wd.z - pz) % cycle;
        if(rel2 > cycle/2) rel2 -= cycle;
        if(rel2 < -cycle/2) rel2 += cycle;
        var wz = pz + rel2;
        var wox = offsetX(wz), woy = offsetY(wz);
        _d.position.set(wox + wd.x, woy - 8 + wd.y, wz);
        _d.rotation.set(0,0,0);
        _d.scale.set(1,1,1);
        _d.updateMatrix();
        cityWindowsInst.setMatrixAt(wi, _d.matrix);
    }
    cityWindowsInst.instanceMatrix.needsUpdate = true;

    // 桥墩（沿道路中心线每 40 米一个，路面下方 4 米）
    for(var pi=0; pi<CITY_PILLAR_COUNT; pi++){
        var pz2 = pz + (pi - CITY_PILLAR_COUNT/2) * 40;
        var pox = offsetX(pz2), poy = offsetY(pz2);
        _d.position.set(pox, poy - 4, pz2);
        _d.rotation.set(0,0,0);
        _d.scale.set(1,1,1);
        _d.updateMatrix();
        cityPillarInst.setMatrixAt(pi, _d.matrix);
    }
    cityPillarInst.instanceMatrix.needsUpdate = true;

    // 地面（低 8 米）
    for(var gi=0; gi<30; gi++){
        var gz = pz + (gi - 15) * 60;
        var gox = offsetX(gz), goy = offsetY(gz);
        _d.position.set(gox, goy - 8, gz);
        _d.rotation.set(0,0,0); _d.scale.set(1,1,1); _d.updateMatrix();
        cityGroundInst.setMatrixAt(gi, _d.matrix);
    }
    cityGroundInst.instanceMatrix.needsUpdate = true;
}

function setCityVisible(show){
    if(cityBuildingsInst) cityBuildingsInst.visible = show;
    if(cityGroundInst) cityGroundInst.visible = show;
    if(cityPillarInst) cityPillarInst.visible = show;
    if(cityWindowsInst) cityWindowsInst.visible = show;

    // ★ 城市模式下隐藏草地和路缘（制造高架感）
    if(typeof grassSegsL !== 'undefined' && grassSegsL.length){
        for(var i=0;i<grassSegsL.length;i++) grassSegsL[i].visible = !show;
        for(var i=0;i<grassSegsR.length;i++) grassSegsR[i].visible = !show;
    }
    if(typeof curbSegsL !== 'undefined' && curbSegsL.length){
        for(var i=0;i<curbSegsL.length;i++) curbSegsL[i].visible = !show;
        for(var i=0;i<curbSegsR.length;i++) curbSegsR[i].visible = !show;
    }
}