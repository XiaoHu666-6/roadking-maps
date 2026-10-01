'use strict';
// ============ 隧道场景 ============
var tunnelWallInst = null;
var tunnelLightInst = null;
var tunnelGlowInst = null;
var tunnelInited = false;
var _tD = null;

var TUNNEL_RADIUS = 11;
var TUNNEL_SEG_LEN = 30;       // 每段长 30m
var TUNNEL_SPACING = 20;        // 段间距 20m（重叠 10m）
var TUNNEL_COUNT = 40;          // 40 段 = 覆盖 800m

function buildTunnelScene(){
    if(tunnelInited) return;
    tunnelInited = true;
    _tD = new THREE.Object3D();

    var wallGeo = new THREE.CylinderGeometry(
        TUNNEL_RADIUS, TUNNEL_RADIUS, TUNNEL_SEG_LEN,
        32, 1, true, 0, Math.PI * 2
    );
    wallGeo.rotateX(Math.PI / 2);

    var wallMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a20, roughness: 0.92, metalness: 0.12, side: THREE.BackSide
    });

    tunnelWallInst = new THREE.InstancedMesh(wallGeo, wallMat, TUNNEL_COUNT);
    tunnelWallInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    tunnelWallInst.frustumCulled = false;
    tunnelWallInst.visible = false;
    scene.add(tunnelWallInst);

    var lightGeo = new THREE.BoxGeometry(0.9, 0.15, 0.5);
    var lightMat = new THREE.MeshBasicMaterial({ color: 0xfffbe0 });
    tunnelLightInst = new THREE.InstancedMesh(lightGeo, lightMat, TUNNEL_COUNT);
    tunnelLightInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    tunnelLightInst.frustumCulled = false;
    tunnelLightInst.visible = false;
    scene.add(tunnelLightInst);

    var glowGeo = new THREE.SphereGeometry(1.2, 8, 6);
    var glowMat = new THREE.MeshBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0.25, depthWrite: false });
    tunnelGlowInst = new THREE.InstancedMesh(glowGeo, glowMat, TUNNEL_COUNT);
    tunnelGlowInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    tunnelGlowInst.frustumCulled = false;
    tunnelGlowInst.visible = false;
    scene.add(tunnelGlowInst);
}

function updateTunnelScene(){
    if(!tunnelWallInst) return;
    if(typeof playerCar === 'undefined' || !playerCar || !playerCar.position) return;

    var pz = playerCar.position.z;

    for(var i = 0; i < TUNNEL_COUNT; i++){
        var rz = pz - (i - 5) * TUNNEL_SPACING;
        var rox = (typeof offsetX === 'function') ? offsetX(rz) : 0;
        var roy = (typeof offsetY === 'function') ? offsetY(rz) : 0;
        var tangent = (typeof roadTangent === 'function') ? roadTangent(rz) : new THREE.Vector3(0, 0, 1);
        var yaw = Math.atan2(tangent.x, tangent.z);
        var pitch = Math.asin(Math.max(-1, Math.min(1, -tangent.y)));

        // 隧道壁段（每段跟自己的道路方向）
        _tD.position.set(rox, roy, rz);
        _tD.rotation.set(pitch, yaw, 0, 'YXZ');
        _tD.scale.set(1, 1, 1);
        _tD.updateMatrix();
        tunnelWallInst.setMatrixAt(i, _tD.matrix);

        // 顶灯
        _tD.position.set(rox, roy + TUNNEL_RADIUS - 0.4, rz);
        _tD.updateMatrix();
        tunnelLightInst.setMatrixAt(i, _tD.matrix);

        // 辉光
        _tD.position.set(rox, roy + TUNNEL_RADIUS - 0.55, rz);
        _tD.updateMatrix();
        tunnelGlowInst.setMatrixAt(i, _tD.matrix);
    }

    tunnelWallInst.instanceMatrix.needsUpdate = true;
    tunnelLightInst.instanceMatrix.needsUpdate = true;
    tunnelGlowInst.instanceMatrix.needsUpdate = true;
}

function setTunnelVisible(show){
    if(tunnelWallInst) tunnelWallInst.visible = show;
    if(tunnelLightInst) tunnelLightInst.visible = show;
    if(tunnelGlowInst) tunnelGlowInst.visible = show;
    if(typeof grassSegsL !== 'undefined' && grassSegsL.length){
        for(var i=0;i<grassSegsL.length;i++) grassSegsL[i].visible = !show;
        for(var i=0;i<grassSegsR.length;i++) grassSegsR[i].visible = !show;
    }
    if(typeof curbSegsL !== 'undefined' && curbSegsL.length){
        for(var i=0;i<curbSegsL.length;i++) curbSegsL[i].visible = !show;
        for(var i=0;i<curbSegsR.length;i++) curbSegsR[i].visible = !show;
    }
    if(typeof railSegsL !== 'undefined' && railSegsL.length){
        for(var i=0;i<railSegsL.length;i++) railSegsL[i].visible = !show;
        for(var i=0;i<railSegsR.length;i++) railSegsR[i].visible = !show;
    }
    if(typeof treeTrunkInst !== 'undefined' && treeTrunkInst) treeTrunkInst.visible = !show;
    if(typeof treeLeafInst !== 'undefined' && treeLeafInst) treeLeafInst.visible = !show;
    if(typeof lampPoleInst !== 'undefined' && lampPoleInst) lampPoleInst.visible = !show;
    if(typeof lampArmInst !== 'undefined' && lampArmInst) lampArmInst.visible = !show;
    if(typeof lampHeadInst !== 'undefined' && lampHeadInst) lampHeadInst.visible = !show;
    if(typeof lampBulbInst !== 'undefined' && lampBulbInst) lampBulbInst.visible = !show;
    if(typeof lampGlowInst !== 'undefined' && lampGlowInst) lampGlowInst.visible = !show;
    if(typeof signPoleInst !== 'undefined' && signPoleInst) signPoleInst.visible = !show;
    if(typeof signBoardInst !== 'undefined' && signBoardInst) signBoardInst.visible = !show;
}