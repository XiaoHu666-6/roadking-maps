'use strict';

var scene, camera, renderer, clock;
var playerCar, extGroup, cockpitGroup, steeringMesh;
var playerLights = {headlight:null, headBulbs:[], tailBulbs:[], turnBulbs:{}};
var hemiLight, dirLight, ambLight;
var dashInst, postInst;
var lampPoleInst, lampArmInst, lampHeadInst, lampBulbInst, lampGlowInst;
var treeTrunkInst, treeLeafInst;
var signPoleInst, signBoardInst;
var npcBodyMesh, npcDetailMesh, npcTruckBodyMesh, npcTruckDetailMesh;
var _d = new THREE.Object3D();
var _camTarget = new THREE.Vector3();
var _tangent = new THREE.Vector3(), _zAxis = new THREE.Vector3(0,0,1), _sideVec = new THREE.Vector3(), _quat = new THREE.Quaternion();

var ROAD_SEG_LEN = 40, ROAD_SEG_GAP = 40, ROAD_SEG_COUNT = 80;
var roadSegs = [], grassSegsL = [], grassSegsR = [], curbSegsL = [], curbSegsR = [], railSegsL = [], railSegsR = [];
var DASH_SPACING = 16, DASH_COUNT = 80, POST_SPACING = 8, POST_PER_SIDE = 80;
var LAMP_SPACING = 45, LAMP_COUNT = 24, TREE_SPACING = 12, TREE_COUNT = 60, SIGN_SPACING = 200, SIGN_COUNT = 12;

function paintGeo(g, hex){
    var c = new THREE.Color(hex);
    var n = g.attributes.position.count;
    var arr = new Float32Array(n*3);
    for(var i=0;i<n;i++){ arr[i*3]=c.r; arr[i*3+1]=c.g; arr[i*3+2]=c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
}
function mergeGeos(list){
    var flat = list.map(function(g){ return g.index ? g.toNonIndexed() : g; });
    var total = 0;
    flat.forEach(function(g){ total += g.attributes.position.count; });
    var pos = new Float32Array(total*3);
    var nor = new Float32Array(total*3);
    var col = new Float32Array(total*3);
    var off = 0;
    flat.forEach(function(g){
        var n = g.attributes.position.count;
        pos.set(g.attributes.position.array, off*3);
        if(g.attributes.normal) nor.set(g.attributes.normal.array, off*3);
        if(g.attributes.color) col.set(g.attributes.color.array, off*3);
        off += n;
    });
    var m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    m.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return m;
}

// ============ 初始化 ============
function initScene(){
    scene = new THREE.Scene();
    var NIGHT_SKY = 0x0a1a3a;
    scene.background = new THREE.Color(NIGHT_SKY);
    scene.fog = new THREE.Fog(NIGHT_SKY, 80, 320);
    camera = new THREE.PerspectiveCamera(72, window.innerWidth/window.innerHeight, 0.05, 2000);
    scene.add(camera);
    renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    if(renderer.outputEncoding!==undefined) renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = false;
    document.body.appendChild(renderer.domElement);
    ambLight = new THREE.AmbientLight(0x334466, 0.7); scene.add(ambLight);
    hemiLight = new THREE.HemisphereLight(0x4466aa, 0x0a1020, 0.55); scene.add(hemiLight);
    dirLight = new THREE.DirectionalLight(0x6688bb, 0.4); dirLight.position.set(20, 60, -30); scene.add(dirLight);
    ensureMat();
    clock = new THREE.Clock();
    buildRoad();
    buildEnvironment();
    buildTrees();
    buildSigns();
    if(typeof buildCityScene === 'function') buildCityScene();
if(typeof buildTunnelScene === 'function') buildTunnelScene();
    buildPlayerCar();
    buildNPCs();
    window.addEventListener('resize', onResize);
}
function onResize(){
    if(!camera || !renderer) return;
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============ 道路 ============
function buildRoad(){
    var roadMat = new THREE.MeshStandardMaterial({color: 0x1a1a1e, roughness: 0.95});
    var grassMat = new THREE.MeshStandardMaterial({color: 0x1a3a1a, roughness: 1.0});
    var curbMat = new THREE.MeshStandardMaterial({color: 0x3a3a3a, roughness: 0.85});
    var railMat = new THREE.MeshStandardMaterial({color: 0x4466aa, roughness: 0.4, metalness: 0.75});
    var segGeo = new THREE.BoxGeometry(ROAD_WIDTH, 0.10, ROAD_SEG_LEN);
    var grassGeo = new THREE.BoxGeometry(60, 0.10, ROAD_SEG_LEN);
    var curbGeo = new THREE.BoxGeometry(2.5, 0.14, ROAD_SEG_LEN);
    var railGeo = new THREE.BoxGeometry(0.10, 0.30, ROAD_SEG_LEN);
    var edgeGeo = new THREE.BoxGeometry(0.15, 0.03, ROAD_SEG_LEN);
    var edgeMat = new THREE.MeshBasicMaterial({color: 0xdddddd});
    window._edgeSegsL = []; window._edgeSegsR = [];
    for (var i = 0; i < ROAD_SEG_COUNT; i++) {
        var road = new THREE.Mesh(segGeo, roadMat); scene.add(road); roadSegs.push(road);
        [-1,1].forEach(function(s){
            var g = new THREE.Mesh(grassGeo, grassMat); scene.add(g);
            if (s < 0) grassSegsL.push(g); else grassSegsR.push(g);
            var c = new THREE.Mesh(curbGeo, curbMat); scene.add(c);
            if (s < 0) curbSegsL.push(c); else curbSegsR.push(c);
            var r = new THREE.Mesh(railGeo, railMat); scene.add(r);
            if (s < 0) railSegsL.push(r); else railSegsR.push(r);
            var e = new THREE.Mesh(edgeGeo, edgeMat); scene.add(e);
            if (s < 0) window._edgeSegsL.push(e); else window._edgeSegsR.push(e);
        });
    }
    var dashGeo = new THREE.BoxGeometry(0.15, 0.02, 4);
    var dashMat = new THREE.MeshBasicMaterial({color: 0xffffff});
    dashInst = new THREE.InstancedMesh(dashGeo, dashMat, 2 * DASH_COUNT);
    dashInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    dashInst.frustumCulled = false; scene.add(dashInst);
    var postGeo = new THREE.BoxGeometry(0.10, 0.70, 0.10);
    var postMat = new THREE.MeshStandardMaterial({color: 0x556677, roughness: 0.5, metalness: 0.7});
    postInst = new THREE.InstancedMesh(postGeo, postMat, POST_PER_SIDE * 2);
    postInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    postInst.frustumCulled = false; scene.add(postInst);
}
function buildEnvironment(){
    var poleGeo = new THREE.CylinderGeometry(0.10, 0.14, 9, 8); poleGeo.translate(0, 4.5, 0);
    var poleMat = new THREE.MeshStandardMaterial({color: 0x333344, roughness: 0.5, metalness: 0.6});
    var armGeo = new THREE.BoxGeometry(2.2, 0.12, 0.12); armGeo.translate(-1.1, 0, 0);
    var headGeo = new THREE.BoxGeometry(0.7, 0.22, 0.35);
    var headMat = new THREE.MeshStandardMaterial({color: 0x2a2a35, roughness: 0.5, metalness: 0.6});
    var bulbGeo = new THREE.SphereGeometry(0.15, 8, 6);
    var bulbMat = new THREE.MeshBasicMaterial({color: 0xffcc44});
    lampPoleInst = new THREE.InstancedMesh(poleGeo, poleMat, LAMP_COUNT);
    lampArmInst = new THREE.InstancedMesh(armGeo, poleMat, LAMP_COUNT);
    lampHeadInst = new THREE.InstancedMesh(headGeo, headMat, LAMP_COUNT);
    lampBulbInst = new THREE.InstancedMesh(bulbGeo, bulbMat, LAMP_COUNT);
    [lampPoleInst, lampArmInst, lampHeadInst, lampBulbInst].forEach(function(m){ m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; scene.add(m); });
    var glowGeo = new THREE.SphereGeometry(0.55, 8, 6);
    var glowMat = new THREE.MeshBasicMaterial({color: 0xffaa22, transparent: true, opacity: 0.25});
    lampGlowInst = new THREE.InstancedMesh(glowGeo, glowMat, LAMP_COUNT);
    lampGlowInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    lampGlowInst.frustumCulled = false; scene.add(lampGlowInst);
}
function buildTrees(){
    var trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 3.0, 6); trunkGeo.translate(0, 1.5, 0);
    var trunkMat = new THREE.MeshStandardMaterial({color: 0x2a1f15, roughness: 0.95});
    treeTrunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, TREE_COUNT * 2);
    treeTrunkInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    treeTrunkInst.frustumCulled = false; scene.add(treeTrunkInst);
    var leafGeo = new THREE.ConeGeometry(1.6, 4.5, 6); leafGeo.translate(0, 4.0, 0);
    var leafMat = new THREE.MeshStandardMaterial({color: 0x0a2a10, roughness: 0.95});
    treeLeafInst = new THREE.InstancedMesh(leafGeo, leafMat, TREE_COUNT * 2);
    treeLeafInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    treeLeafInst.frustumCulled = false; scene.add(treeLeafInst);
}
function buildSigns(){
    var poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6); poleGeo.translate(0, 1.25, 0);
    var poleMat = new THREE.MeshStandardMaterial({color: 0x999999, roughness: 0.6, metalness: 0.5});
    signPoleInst = new THREE.InstancedMesh(poleGeo, poleMat, SIGN_COUNT);
    signPoleInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    signPoleInst.frustumCulled = false; scene.add(signPoleInst);
    var cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
    var cx = cv.getContext('2d');
    cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, 128, 128);
    cx.strokeStyle = '#ff0000'; cx.lineWidth = 14;
    cx.beginPath(); cx.arc(64, 64, 50, 0, Math.PI*2); cx.stroke();
    cx.fillStyle = '#000000'; cx.font = 'bold 42px sans-serif';
    cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('100', 64, 64);
    var tex = new THREE.CanvasTexture(cv);
    var boardGeo = new THREE.PlaneGeometry(0.9, 0.9);
    var boardMat = new THREE.MeshBasicMaterial({map: tex, side: THREE.DoubleSide});
    signBoardInst = new THREE.InstancedMesh(boardGeo, boardMat, SIGN_COUNT);
    signBoardInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    signBoardInst.frustumCulled = false; scene.add(signBoardInst);
}

// ============ 道路更新 ============
function updateRoad(dt){
    if(!playerCar || !playerCar.position) return;
    var pz = playerCar.position.z;
    for (var i = 0; i < ROAD_SEG_COUNT; i++) {
        var z = pz + (i - ROAD_SEG_COUNT/2) * ROAD_SEG_GAP;
        var ox = offsetX(z), oy = offsetY(z);
        _tangent.copy(roadTangent(z));
        _quat.setFromUnitVectors(_zAxis, _tangent);
        _sideVec.set(1, 0, 0).applyQuaternion(_quat);
        _sideVec.y = 0; _sideVec.normalize();
        roadSegs[i].position.set(ox, oy, z); roadSegs[i].quaternion.copy(_quat);
        grassSegsL[i].position.set(ox - _sideVec.x * (ROAD_WIDTH/2 + 32), oy - 0.02, z - _sideVec.z * (ROAD_WIDTH/2 + 32)); grassSegsL[i].quaternion.copy(_quat);
        grassSegsR[i].position.set(ox + _sideVec.x * (ROAD_WIDTH/2 + 32), oy - 0.02, z + _sideVec.z * (ROAD_WIDTH/2 + 32)); grassSegsR[i].quaternion.copy(_quat);
        curbSegsL[i].position.set(ox - _sideVec.x * (ROAD_WIDTH/2 + 1.25), oy + 0.03, z - _sideVec.z * (ROAD_WIDTH/2 + 1.25)); curbSegsL[i].quaternion.copy(_quat);
        curbSegsR[i].position.set(ox + _sideVec.x * (ROAD_WIDTH/2 + 1.25), oy + 0.03, z + _sideVec.z * (ROAD_WIDTH/2 + 1.25)); curbSegsR[i].quaternion.copy(_quat);
        railSegsL[i].position.set(ox - _sideVec.x * RAIL_X, oy + 0.65, z - _sideVec.z * RAIL_X); railSegsL[i].quaternion.copy(_quat);
        railSegsR[i].position.set(ox + _sideVec.x * RAIL_X, oy + 0.65, z + _sideVec.z * RAIL_X); railSegsR[i].quaternion.copy(_quat);
        if (window._edgeSegsL) {
            window._edgeSegsL[i].position.set(ox - _sideVec.x * (ROAD_WIDTH/2 - 0.20), oy + 0.08, z - _sideVec.z * (ROAD_WIDTH/2 - 0.20)); window._edgeSegsL[i].quaternion.copy(_quat);
            window._edgeSegsR[i].position.set(ox + _sideVec.x * (ROAD_WIDTH/2 - 0.20), oy + 0.08, z + _sideVec.z * (ROAD_WIDTH/2 - 0.20)); window._edgeSegsR[i].quaternion.copy(_quat);
        }
    }
    var startZ = pz + 100;
    var off = ((startZ % DASH_SPACING) + DASH_SPACING) % DASH_SPACING;
    var idx = 0;
    for (var lane = 0; lane < 2; lane++) {
        var lx = laneX(lane) + LANE_WIDTH/2;
        for (var k=0;k<DASH_COUNT;k++) {
            var zz = startZ - off - k*DASH_SPACING - 3;
            var oxx = offsetX(zz), oyy = offsetY(zz);
            var t = roadTangent(zz); _quat.setFromUnitVectors(_zAxis, t);
            var sv = _sideVec.set(1, 0, 0).applyQuaternion(_quat); sv.y = 0; sv.normalize();
            _d.position.set(oxx + sv.x * lx, oyy + 0.08, zz + sv.z * lx); _d.quaternion.copy(_quat); _d.scale.set(1,1,1); _d.updateMatrix();
            dashInst.setMatrixAt(idx++, _d.matrix);
        }
    }
    dashInst.instanceMatrix.needsUpdate = true;
    var pStart = pz + 100, pOff = ((pStart % POST_SPACING) + POST_SPACING) % POST_SPACING, pIdx = 0;
    for (var s = -1; s <= 1; s += 2) {
        for (var k2=0;k2<POST_PER_SIDE;k2++) {
            var pz2 = pStart - pOff - k2*POST_SPACING;
            var pox = offsetX(pz2), poy = offsetY(pz2);
            var pt = roadTangent(pz2); _quat.setFromUnitVectors(_zAxis, pt);
            var psv = _sideVec.set(1, 0, 0).applyQuaternion(_quat); psv.y = 0; psv.normalize();
            _d.position.set(pox + psv.x * (s * RAIL_X), poy + 0.28, pz2 + psv.z * (s * RAIL_X)); _d.quaternion.copy(_quat); _d.scale.set(1,1,1); _d.updateMatrix();
            postInst.setMatrixAt(pIdx++, _d.matrix);
        }
    }
    postInst.instanceMatrix.needsUpdate = true;

    var lampBaseZ = pz + 80;
    var lampBaseSlot = Math.floor(lampBaseZ / LAMP_SPACING);
    var lampIdx = 0;
    for (var li=0; li<LAMP_COUNT; li++) {
        var lslot = lampBaseSlot - li;
        var lz = lslot * LAMP_SPACING;
        var side = ((((lslot % 2) + 2) % 2) === 0) ? 1 : -1;
        var lx = side * (RAIL_X + 3.5);
        var lox = offsetX(lz), loy = offsetY(lz);
        var lt = roadTangent(lz); _quat.setFromUnitVectors(_zAxis, lt);
        var lsv = _sideVec.set(1, 0, 0).applyQuaternion(_quat); lsv.y = 0; lsv.normalize();
        var lxw = lox + lsv.x * lx, lyw = loy + lsv.y * lx, lzw = lz + lsv.z * lx;
        _d.position.set(lxw, lyw, lzw); _d.quaternion.copy(_quat); _d.scale.set(1,1,1); _d.updateMatrix(); lampPoleInst.setMatrixAt(lampIdx, _d.matrix);
        _d.position.set(lxw, lyw + 8.85, lzw); _d.quaternion.copy(_quat); _d.updateMatrix(); lampArmInst.setMatrixAt(lampIdx, _d.matrix);
        var armOffset = _sideVec.set(-side * 2.2, 0, 0).applyQuaternion(_quat);
        _d.position.set(lxw + armOffset.x, lyw + 8.75, lzw + armOffset.z); _d.quaternion.copy(_quat); _d.updateMatrix(); lampHeadInst.setMatrixAt(lampIdx, _d.matrix);
        _d.position.set(lxw + armOffset.x, lyw + 8.60, lzw + armOffset.z); _d.updateMatrix(); lampBulbInst.setMatrixAt(lampIdx, _d.matrix);
        lampGlowInst.setMatrixAt(lampIdx, _d.matrix);
        lampIdx++;
    }
    lampPoleInst.instanceMatrix.needsUpdate = true;
    lampArmInst.instanceMatrix.needsUpdate = true;
    lampHeadInst.instanceMatrix.needsUpdate = true;
    lampBulbInst.instanceMatrix.needsUpdate = true;
    lampGlowInst.instanceMatrix.needsUpdate = true;

    var treeBaseZ = pz + 200;
    var treeBaseSlot = Math.floor(treeBaseZ / TREE_SPACING);
    var tIdx = 0;
    for (var s2 = -1; s2 <= 1; s2 += 2) {
        for (var ti=0; ti<TREE_COUNT; ti++) {
            var slot = treeBaseSlot - ti;
            var seed = ((slot % TREE_COUNT) + TREE_COUNT) % TREE_COUNT;
            var h1 = Math.sin(seed * 12.9898) * 43758.5453; var rx = h1 - Math.floor(h1);
            var h2 = Math.sin(seed * 78.233) * 43758.5453; var rz = h2 - Math.floor(h2);
            var h3 = Math.sin(seed * 45.17) * 43758.5453; var sr = h3 - Math.floor(h3);
            var scale = 0.7 + sr * 0.6;
            var tz = slot * TREE_SPACING - rz * 8;
            var tx = s2 * (RAIL_X + 8 + rx * 8);
            var tox = offsetX(tz), toy = offsetY(tz);
            var tt = roadTangent(tz); _quat.setFromUnitVectors(_zAxis, tt);
            var tsv = _sideVec.set(1, 0, 0).applyQuaternion(_quat); tsv.y = 0; tsv.normalize();
            _d.position.set(tox + tsv.x * tx, toy + tsv.y * tx, tz + tsv.z * tx);
            _d.quaternion.setFromEuler(new THREE.Euler(0, seed * 0.5, 0));
            _d.scale.set(scale, scale, scale); _d.updateMatrix();
            treeTrunkInst.setMatrixAt(tIdx, _d.matrix);
            treeLeafInst.setMatrixAt(tIdx, _d.matrix);
            tIdx++;
        }
    }
    treeTrunkInst.instanceMatrix.needsUpdate = true;
    treeLeafInst.instanceMatrix.needsUpdate = true;

    var signStart = pz + 150;
    for (var si=0; si<SIGN_COUNT; si++) {
        var sz = signStart - si * SIGN_SPACING;
        var sideS = (si % 2 === 0) ? 1 : -1;
        var sx = sideS * (RAIL_X + 2.5);
        var sox = offsetX(sz), soy = offsetY(sz);
        var st = roadTangent(sz); _quat.setFromUnitVectors(_zAxis, st);
        var ssv = _sideVec.set(1, 0, 0).applyQuaternion(_quat); ssv.y = 0; ssv.normalize();
        var sxw = sox + ssv.x * sx, syw = soy + ssv.y * sx, szw = sz + ssv.z * sx;
        _d.position.set(sxw, syw, szw); _d.quaternion.copy(_quat); _d.scale.set(1,1,1); _d.updateMatrix(); signPoleInst.setMatrixAt(si, _d.matrix);
        var signYaw = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sideS > 0 ? -Math.PI/2 : Math.PI/2, 0));
        _d.position.set(sxw, syw + 1.7, szw); _d.quaternion.copy(_quat).multiply(signYaw); _d.updateMatrix(); signBoardInst.setMatrixAt(si, _d.matrix);
    }
    signPoleInst.instanceMatrix.needsUpdate = true;
    signBoardInst.instanceMatrix.needsUpdate = true;
    if(typeof currentSceneMode !== 'undefined' && currentSceneMode === 'city' && typeof updateCityScene === 'function') updateCityScene();
if(typeof currentSceneMode !== 'undefined' && currentSceneMode === 'tunnel' && typeof updateTunnelScene === 'function') updateTunnelScene();
}

// ============ 玩家车 ============
function buildPlayerCar(){
    if(playerCar){
        scene.remove(playerCar);
        while(playerCar.children.length > 0) playerCar.remove(playerCar.children[0]);
        playerCar = null;
    }
    ensureMat();
    playerCar = new THREE.Group();
    playerCar.rotation.order = 'YXZ';
    scene.add(playerCar);

    var geos = getCarGeo(currentVehicleType);
    var V = playerVehicle;

    extGroup = new THREE.Group(); playerCar.add(extGroup);
    if(geos.bodyGeo) extGroup.add(new THREE.Mesh(geos.bodyGeo, new THREE.MeshStandardMaterial({ vertexColors: true, color: V.color, roughness: 0.35, metalness: 0.65 })));
    if(geos.detailGeo) extGroup.add(new THREE.Mesh(geos.detailGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.45 })));
    if(geos.glassGeo) extGroup.add(new THREE.Mesh(geos.glassGeo, new THREE.MeshStandardMaterial({ color: 0x0a1a2a, transparent: true, opacity: 0.6, roughness: 0.1, metalness: 0.8, side: THREE.DoubleSide })));

    cockpitGroup = buildCockpit(V); playerCar.add(cockpitGroup);

    // 方向盘按车型位置
    var bt2 = V.buildType;
    var sY = (bt2 === 'truck') ? 1.55 : (bt2 === 'suv') ? 1.10 : 0.95;
    var sX = (bt2 === 'landjet' || bt2 === 'rocket') ? 0 : -0.42;
    var tilt = new THREE.Group();
tilt.position.set(sX, sY, -0.45);
tilt.rotation.x = 0.45;
    steeringMesh = buildSteeringWheel();
    tilt.add(steeringMesh);
    playerCar.add(tilt);

    buildPlayerLights(V);

    carLocalX = laneX(1);
    playerCar.position.set(offsetX(0) + carLocalX, offsetY(0), 0);
    playerCar.rotation.y = 0;
    carHeading = 0; carSpeed = 0; carY = 0; carVy = 0; isAirborne = false;
    currentGearIdx = 0; gearText = 'N'; engineRPM = 800;
    isDrifting = false; driftAngle = 0; spinRemaining = 0; spinActive = false;

    applyViewMode();
    playerCar.updateMatrixWorld(true);
    // ★ updateCamera 用 try-catch 保护
    try{
        if(typeof updateCamera === 'function') updateCamera(0.016, 0, 0, true);
    }catch(e){
        console.error('buildPlayerCar 里 updateCamera 出错:', e.message);
    }
    if(typeof updateGearUI === 'function') updateGearUI();
    var hudName = document.getElementById('hudCarName');
    if(hudName) hudName.textContent = V.emoji + ' ' + V.name;
}

function buildPlayerLights(V){
    playerLights = {headlight:null, headBulbs:[], tailBulbs:[], turnBulbs:{}};
    var halfW = V.width/2;
    var headlight = new THREE.SpotLight(0xfff4d5, 2.2, 70, Math.PI*0.32, 0.55, 1.3);
    headlight.position.set(0, 0.85, -1.8); headlight.target.position.set(0, 0.1, -22);
    playerCar.add(headlight); playerCar.add(headlight.target); playerLights.headlight = headlight;
    var hbm = new THREE.MeshBasicMaterial({color: 0xfff8dd}); var hbg = new THREE.SphereGeometry(0.14, 8, 6);
    [-0.55, 0.55].forEach(function(x){ var b = new THREE.Mesh(hbg, hbm.clone()); b.position.set(x, 0.68, -V.length/2 - 0.04); playerCar.add(b); playerLights.headBulbs.push(b); });
    var tbm = new THREE.MeshBasicMaterial({color: 0x661111}); var tbg = new THREE.SphereGeometry(0.12, 8, 6);
    [-0.60, 0.60].forEach(function(x){ var b = new THREE.Mesh(tbg, tbm.clone()); b.position.set(x, 0.72, V.length/2 + 0.04); playerCar.add(b); playerLights.tailBulbs.push(b); });
    var turnMat = new THREE.MeshBasicMaterial({color: 0x332200}); var turnGeo = new THREE.SphereGeometry(0.09, 8, 6);
    playerLights.turnBulbs = { fl:new THREE.Mesh(turnGeo, turnMat.clone()), fr:new THREE.Mesh(turnGeo, turnMat.clone()), rl:new THREE.Mesh(turnGeo, turnMat.clone()), rr:new THREE.Mesh(turnGeo, turnMat.clone()) };
    var L = V.length;
    playerLights.turnBulbs.fl.position.set(-halfW+0.05, 0.72, -L/2 + 0.02);
    playerLights.turnBulbs.fr.position.set(halfW-0.05, 0.72, -L/2 + 0.02);
    playerLights.turnBulbs.rl.position.set(-halfW+0.05, 0.75, L/2 - 0.02);
    playerLights.turnBulbs.rr.position.set(halfW-0.05, 0.75, L/2 - 0.02);
    Object.keys(playerLights.turnBulbs).forEach(function(k){ playerCar.add(playerLights.turnBulbs[k]); });
}

function applyViewMode(){
    if(!extGroup || !cockpitGroup) return;
    extGroup.visible = !firstPerson;
    cockpitGroup.visible = firstPerson;
    var tp=document.getElementById('viewTPBtn'), fp=document.getElementById('viewFPBtn');
    if(tp) tp.classList.toggle('active', !firstPerson);
    if(fp) fp.classList.toggle('active', firstPerson);
}

// ============ 仪表 ============
var dashCanvas, dashCtx, dashTexture, lastDashDraw = 0;
function createDashTexture(){
    dashCanvas = document.createElement('canvas'); dashCanvas.width = 512; dashCanvas.height = 256;
    dashCtx = dashCanvas.getContext('2d');
    dashTexture = new THREE.CanvasTexture(dashCanvas);
    dashTexture.needsUpdate = true;
    if(typeof drawDash === 'function') drawDash(0, 800);
    return dashTexture;
}
function drawDash(speed, rpm){
    if(!dashCtx) return;
    var W = 512, H = 256, ctx = dashCtx;
    ctx.fillStyle = '#0a0e18'; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle = '#223355'; ctx.lineWidth = 4; ctx.strokeRect(2,2,W-4,H-4);
    drawGauge(ctx, 128, 128, 90, speed, 0, 260, 'km/h', '#4488ff');
    drawGauge(ctx, 384, 128, 90, rpm/1000, 0, 8, 'x1000 r/min', '#ff5533');
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 46px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(speed), 256, 108);
    ctx.fillStyle = '#6699cc'; ctx.font = 'bold 16px sans-serif'; ctx.fillText('km/h', 256, 148);
    if(dashTexture) dashTexture.needsUpdate = true;
}
function drawGauge(ctx, cx, cy, r, value, minV, maxV, label, color){
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.strokeStyle = '#1a2540'; ctx.lineWidth = 10; ctx.stroke();
    var startAngle = Math.PI * 0.75, endAngle = Math.PI * 2.25, totalAngle = endAngle - startAngle;
    var ratio = Math.max(0, Math.min(1, (value - minV) / (maxV - minV)));
    ctx.beginPath(); ctx.arc(cx, cy, r, startAngle, endAngle); ctx.strokeStyle = '#0a1520'; ctx.lineWidth = 14; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r, startAngle, startAngle + totalAngle * ratio); ctx.strokeStyle = color; ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.stroke();
    ctx.lineCap = 'butt';
    for(var i=0;i<=8;i++){
        var ang = startAngle + (totalAngle / 8) * i;
        ctx.strokeStyle = '#556688'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(ang)*(r-22), cy + Math.sin(ang)*(r-22)); ctx.lineTo(cx + Math.cos(ang)*(r-12), cy + Math.sin(ang)*(r-12)); ctx.stroke();
        ctx.fillStyle = '#8899bb'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        var nv = minV + ((maxV-minV)/8)*i;
        ctx.fillText(Math.round(nv), cx + Math.cos(ang)*(r-34), cy + Math.sin(ang)*(r-34));
    }
    ctx.fillStyle = '#aabbdd'; ctx.font = 'bold 12px sans-serif'; ctx.fillText(label, cx, cy + r - 30);
}

var matCockpit = null;
function ensureMat(){
    if(!matCockpit) matCockpit = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.25, side: THREE.DoubleSide });
}

// ============ 座舱 ============
function buildCockpit(V){
    ensureMat();
    var parts = [];
    var I = V.interior || { bg: 0x1a1a1e, trim: 0x2a2a30, seat: 0x2a1a1a };
    var bt = V.buildType;

    var fy = 0.55, dashW = 1.78, seatSpread = 0.45, roofOffset = 1.20;

    if(bt === 'truck'){ fy = 1.10; dashW = 2.10; seatSpread = 0.55; roofOffset = 1.25; }
    else if(bt === 'suv'){ fy = 0.68; dashW = 1.86; seatSpread = 0.48; roofOffset = 1.22; }
    else if(bt === 'hypercar'){ fy = 0.45; dashW = 1.78; seatSpread = 0.45; roofOffset = 1.15; }
    else if(bt === 'landjet' || bt === 'rocket'){ fy = 0.50; dashW = 1.30; seatSpread = 0; roofOffset = 1.20; }

    function box(w, h, d, x, y, z, hex){
        var g = new THREE.BoxGeometry(w, h, d);
        g.translate(x, y, z);
        paintGeo(g, hex);
        parts.push(g);
    }

    box(dashW, 0.05, 1.8, 0, fy, 0.30, I.bg);

    var seatXs = (seatSpread === 0) ? [0] : [-seatSpread, seatSpread];
for(var si = 0; si < seatXs.length; si++){
    var sx = seatXs[si];
    box(0.55, 0.14, 0.60, sx, fy + 0.10, 0.45, I.seat);
    box(0.55, 0.72, 0.14, sx, fy + 0.54, 0.77, I.seat);
    box(0.32, 0.16, 0.10, sx, fy + 1.00, 0.77, I.trim);
}

    box(dashW, 0.10, 0.42, 0, fy + 0.22, -0.72, I.trim);
    box(0.28, 0.18, 0.55, 0, fy + 0.14, -0.10, I.bg);
    box(0.06, 0.42, 1.4, -(dashW/2 - 0.05), fy + 0.35, 0.30, I.trim);
    box(0.06, 0.42, 1.4, (dashW/2 - 0.05), fy + 0.35, 0.30, I.trim);

    // 车顶
    box(dashW, 0.05, 1.20, 0, fy + roofOffset, 0.55, I.bg);

    // A 柱（斜的）
    [-1, 1].forEach(function(s){
        var p = new THREE.BoxGeometry(0.06, 0.85, 0.06);
        p.rotateX(0.55);
        p.translate(s * (dashW/2 - 0.15), fy + 0.95, -0.55);
        paintGeo(p, I.trim);
        parts.push(p);
    });

    if(bt === 'truck'){
        box(dashW * 0.9, 0.08, 0.60, 0, fy + 0.03, 1.30, 0x8a1a1a);
    }
    if(bt === 'landjet' || bt === 'rocket'){
        var stick = new THREE.CylinderGeometry(0.04, 0.04, 0.5, 10);
        stick.translate(0, fy + 0.35, -0.05);
        paintGeo(stick, 0x222222);
        parts.push(stick);
        var knob = new THREE.SphereGeometry(0.07, 10, 8);
        knob.translate(0, fy + 0.62, -0.05);
        paintGeo(knob, 0xcc2222);
        parts.push(knob);
    }
    if(bt === 'hypercar'){
        box(0.03, 0.02, 1.50, -(dashW/2 - 0.05), fy + 0.45, 0.30, 0x00e5ff);
        box(0.03, 0.02, 1.50, (dashW/2 - 0.05), fy + 0.45, 0.30, 0x00e5ff);
    }

    var mesh = new THREE.Mesh(mergeGeos(parts), matCockpit);
    var dashGeo = new THREE.PlaneGeometry(dashW * 0.55, 0.20);
    var dashMat = new THREE.MeshBasicMaterial({ map: createDashTexture() });
    var dashMesh = new THREE.Mesh(dashGeo, dashMat);
    dashMesh.position.set(0, fy + 0.34, -0.62);
    dashMesh.rotation.x = -0.65;
    mesh.add(dashMesh);

    return mesh;
}

function buildSteeringWheel(){
    ensureMat();
    var group = new THREE.Group();
    var leatherMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.7, metalness: 0.1 });
    var metalMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.3, metalness: 0.8 });
    var centerMat = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.5, metalness: 0.4 });
    var logoMat = new THREE.MeshBasicMaterial({ color: 0xcc1111 });
    var rimR = 0.17, rimT = 0.025;
    var rim = new THREE.Mesh(new THREE.TorusGeometry(rimR, rimT, 12, 32), leatherMat); group.add(rim);
    var trimRing = new THREE.Mesh(new THREE.TorusGeometry(rimR - 0.02, 0.005, 8, 32), metalMat); group.add(trimRing);
    var centerHub = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.07, 0.04, 16), centerMat);
    centerHub.rotation.x = Math.PI / 2; centerHub.position.z = 0.01; group.add(centerHub);
    var logo = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.01), logoMat); logo.position.set(0, 0, 0.035); group.add(logo);
    var spokeMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.6, metalness: 0.3 });
    var spokeL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.018, 0.012), spokeMat); spokeL.position.set(-0.065, 0, 0); group.add(spokeL);
    var spokeR = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.018, 0.012), spokeMat); spokeR.position.set(0.065, 0, 0); group.add(spokeR);
    var spokeB = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.09, 0.012), spokeMat); spokeB.position.set(0, -0.075, 0); group.add(spokeB);
    return group;
}

// ============ NPC ============
function buildNPCs(){
    var sedanGeos = getCarGeo('sedan');
    npcBodyMesh = new THREE.InstancedMesh(sedanGeos.bodyGeo, new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.35, metalness: 0.6 }), NPC_COUNT);
    npcBodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); npcBodyMesh.frustumCulled = false; scene.add(npcBodyMesh);
    npcDetailMesh = new THREE.InstancedMesh(sedanGeos.detailGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.45 }), NPC_COUNT);
    npcDetailMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); npcDetailMesh.frustumCulled = false; scene.add(npcDetailMesh);
    var truckGeos = getCarGeo('truck');
    npcTruckBodyMesh = new THREE.InstancedMesh(truckGeos.bodyGeo, new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x555555, roughness: 0.4, metalness: 0.6 }), 4);
    npcTruckBodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); npcTruckBodyMesh.frustumCulled = false; scene.add(npcTruckBodyMesh);
    npcTruckDetailMesh = new THREE.InstancedMesh(truckGeos.detailGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.45 }), 4);
    npcTruckDetailMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); npcTruckDetailMesh.frustumCulled = false; scene.add(npcTruckDetailMesh);
    var palette = [0x2c7be5, 0x2ecc71, 0xf5a623, 0x9b59b6, 0x66ccff, 0xe74c3c, 0xecf0f1, 0x34495e];
    for(var i=0; i<NPC_COUNT; i++){
        var car = makeNPC(-(60 + Math.random()*400));
        npcCars.push(car);
        npcBodyMesh.setColorAt(i, new THREE.Color(palette[Math.floor(Math.random()*palette.length)]));
    }
    if(npcBodyMesh.instanceColor) npcBodyMesh.instanceColor.needsUpdate = true;
    for(var t=0; t<4; t++){
        var tc = {
            x: laneX(Math.floor(Math.random()*LANE_COUNT)),
            z: -(200 + t*180 + Math.random()*100),
            lane: Math.floor(Math.random()*LANE_COUNT),
            targetLane: 0,
            baseSpeed: 10 + Math.random()*8,
            nextChange: 5 + Math.random()*10
        };
        tc.targetLane = tc.lane;
        trucks.push(tc);
    }
}
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