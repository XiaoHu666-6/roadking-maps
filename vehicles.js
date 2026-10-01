'use strict';

// ============ 车型配置数据 ============
var VEHICLES = {
    sedan: { name:'轿车', emoji:'🚗', color:0xb8893d, desc:'驾考宝典经典车型', mass:1400, horsepower:200, topSpeedKmh:200, handling:0.85, accel:10, brake:12, steerRate:0.85, length:4.4, width:1.85, wheelR:0.32, wZF:-1.30, wZR:1.30, buildType:'car', interior:{ bg:0x1a1a1e, trim:0x2a2a30, seat:0x2a1a1a }, isEV:false, gears:5, gearRatios:[3.2, 2, 1.8, 1.0, 0.75] },
    sports: { name:'跑车', emoji:'🏎️', color:0xff6600, desc:'低趴流线跑车', mass:1200, horsepower:520, topSpeedKmh:320, handling:0.98, accel:11, brake:14, steerRate:1.1, length:4.5, width:1.95, wheelR:0.30, wZF:-1.35, wZR:1.35, buildType:'sports', interior:{ bg:0x1a0a08, trim:0x4a1810, seat:0x2a0808 }, isEV:false, gears:6, gearRatios:[3.0, 2.0, 1.5, 1.15, 0.9, 0.7] },
    suv: { name:'SUV', emoji:'🚙', color:0x1e88e5, desc:'高视野 SUV', mass:2000, horsepower:310, topSpeedKmh:230, handling:0.70, accel:6, brake:11, steerRate:0.75, length:4.85, width:1.98, wheelR:0.40, wZF:-1.5, wZR:1.5, buildType:'suv', interior:{ bg:0x1e1810, trim:0x503020, seat:0x2e1e10 }, isEV:false, gears:6, gearRatios:[2.6, 1.7, 1.25, 0.95, 0.75, 0.6] },
    truck: { name:'特技卡车', emoji:'🚛', color:0x2e7d32, desc:'尾部带跳板', mass:4000, horsepower:400, topSpeedKmh:160, handling:0.55, accel:4, brake:9, steerRate:0.65, length:7.2, width:2.3, wheelR:0.55, wZF:-2.4, wZR:1.6, buildType:'truck', interior:{ bg:0x1a1a18, trim:0x404040, seat:0x222218 }, isEV:false, gears:6, gearRatios:[4, 3, 1.6, 1.2, 0.9, 0.7] },
    hypercar: { name:'超跑电车', emoji:'⚡', color:0x00e5ff, desc:'纯电超跑 · 500km/h · 3020 匹', mass:1800, horsepower:3020, topSpeedKmh:500, handling:1.0, accel:16, brake:18, steerRate:1.3, length:4.6, width:2.0, wheelR:0.34, wZF:-1.4, wZR:1.4, buildType:'hypercar', interior:{ bg:0x0a0a1a, trim:0x00e5ff, seat:0x111a30 }, isEV:true, gears:1, gearRatios:[1.0] },
    landjet: { name:'陆地飞行器', emoji:'🚀', color:0xff00aa, desc:'V12 油车 · 800km/h · 8000 匹 · 12 档', mass:900, horsepower:8000, topSpeedKmh:800, handling:1.25, accel:22, brake:22, steerRate:1.5, length:5.0, width:2.1, wheelR:0.36, wZF:-1.5, wZR:1.5, buildType:'landjet', interior:{ bg:0x1a0010, trim:0xff00aa, seat:0x330018 }, isEV:false, gears:12, gearRatios:[3.80, 3.20, 2.70, 2.30, 2.00, 1.75, 1.55, 1.35, 1.20, 1.05, 0.90, 0.75] },
    rocket: { name:'火箭汽车', emoji:'🛸', color:0xff2200, desc:'火箭汽车 · ∞km/h · 114514 匹', mass:500, horsepower:114514, topSpeedKmh:114514, handling:1.3, accel:500, brake:30, steerRate:1.6, length:6.0, width:2.4, wheelR:0.4, wZF:-1.8, wZR:1.8, buildType:'rocket', interior:{ bg:0x0a0a0a, trim:0xff2200, seat:0x220000 }, isEV:true, gears:1, gearRatios:[1.0] }
};

var currentVehicleType = 'sedan';
var playerVehicle = VEHICLES.sedan;

// ============ 车辆几何 ============
var carGeoCache = {};

function getCarGeo(type){
    if(carGeoCache[type]) return carGeoCache[type];
    var V = VEHICLES[type];
    var geo = buildVehicleGeo(V);
    carGeoCache[type] = geo;
    return geo;
}

function buildVehicleGeo(V){
    var W = V.width, halfW = W/2, L = V.length, wR = V.wheelR;
    var frontZ = -L/2, rearZ = L/2;
    var bt = V.buildType;
    var profs = {
        car:     [[2.10,0.22],[2.15,0.55],[1.90,0.78],[0.65,0.84],[-0.20,1.30],[-0.90,1.32],[-1.40,0.98],[-1.85,0.86],[-2.10,0.72],[-2.15,0.50],[-2.10,0.22]],
        sports:  [[2.20,0.18],[2.32,0.42],[2.05,0.58],[0.85,0.66],[-0.35,1.10],[-1.00,1.12],[-1.55,0.86],[-2.05,0.78],[-2.25,0.52],[-2.28,0.30],[-2.20,0.18]],
        suv:     [[2.35,0.32],[2.42,0.62],[2.25,0.90],[0.85,1.00],[-0.10,1.75],[-1.25,1.82],[-1.85,1.62],[-2.25,1.20],[-2.42,1.00],[-2.48,0.62],[-2.35,0.32]],
        hypercar:[[2.30,0.12],[2.42,0.35],[2.15,0.55],[1.00,0.55],[-0.15,0.95],[-0.85,1.05],[-1.55,0.88],[-2.15,0.80],[-2.32,0.55],[-2.35,0.28],[-2.30,0.12]]
    };
    var bodyGeo, detailGeo, glassGeo;
    
// ★ 轿车：方正三厢（桑塔纳风格）
if(bt === 'car'){
    var BC = [];
    function bxC(w,h,d,x,y,z,hex){ var g = new THREE.BoxGeometry(w,h,d); g.translate(x,y,z); paintGeo(g,hex); BC.push(g); }
    bxC(W, 0.62, L, 0, 0.53, 0, 0xffffff);
    bxC(W-0.10, 0.08, 1.25, 0, 0.84, -L/2 + 0.75, 0xffffff);
    bxC(W-0.10, 0.08, 1.10, 0, 0.86, L/2 - 0.65, 0xffffff);
    bxC(W-0.22, 0.52, 2.30, 0, 1.10, 0.10, 0xffffff);
    bxC(W-0.32, 0.06, 2.20, 0, 1.37, 0.10, 0xffffff);
    bxC(W-0.20, 0.04, 0.08, 0, 0.92, -1.05, 0x222222);
    bxC(W+0.04, 0.22, 0.12, 0, 0.40, -L/2 - 0.02, 0x1b1b1b);
    bxC(W+0.04, 0.22, 0.12, 0, 0.40, L/2 + 0.02, 0x1b1b1b);
    bodyGeo = mergeGeos(BC);

    var DC = [];
    [[-halfW+0.05, V.wZF],[halfW-0.05, V.wZF],[-halfW+0.05, V.wZR],[halfW-0.05, V.wZR]].forEach(function(p){
        var x = p[0], z = p[1];
        var wg = new THREE.CylinderGeometry(wR, wR, 0.22, 16); wg.rotateZ(Math.PI/2); wg.translate(x, wR, z);
        paintGeo(wg, 0x111111); DC.push(wg);
        var hg = new THREE.CylinderGeometry(wR*0.65, wR*0.65, 0.24, 12); hg.rotateZ(Math.PI/2); hg.translate(x, wR, z);
        paintGeo(hg, 0xffffff); DC.push(hg);
    });
    [-0.55, 0.55].forEach(function(x){
        var hl = new THREE.BoxGeometry(0.42, 0.16, 0.08); hl.translate(x, 0.68, frontZ - 0.04);
        paintGeo(hl, 0xfff8dd); DC.push(hl);
        var tn = new THREE.BoxGeometry(0.12, 0.14, 0.08);
        tn.translate(x + (x > 0 ? 0.28 : -0.28), 0.68, frontZ - 0.04);
        paintGeo(tn, 0xffcc22); DC.push(tn);
    });
    [-0.60, 0.60].forEach(function(x){
        var tl = new THREE.BoxGeometry(0.44, 0.16, 0.08); tl.translate(x, 0.72, rearZ + 0.04);
        paintGeo(tl, 0xff2222); DC.push(tl);
    });
    [-1,1].forEach(function(s){
        var mr = new THREE.SphereGeometry(0.13, 10, 8);
        mr.scale(1, 0.75, 0.55);
        mr.translate(s*(halfW+0.14), 1.02, -0.60);
        paintGeo(mr, 0x161616); DC.push(mr);
        var arm = new THREE.BoxGeometry(0.12, 0.04, 0.05);
        arm.translate(s*(halfW+0.05), 1.02, -0.60);
        paintGeo(arm, 0x161616); DC.push(arm);
    });
    detailGeo = mergeGeos(DC);

    var GC = [];
    var wf = new THREE.BoxGeometry(W-0.30, 0.72, 0.05);
    wf.rotateX(-0.52); wf.translate(0, 1.12, -0.60);
    paintGeo(wf, 0xffffff); GC.push(wf);
    var rw = new THREE.BoxGeometry(W-0.32, 0.65, 0.05);
    rw.rotateX(0.52); rw.translate(0, 1.14, 1.00);
    paintGeo(rw, 0xffffff); GC.push(rw);
    [-1,1].forEach(function(s){
        var sw1 = new THREE.BoxGeometry(0.04, 0.36, 0.62);
        sw1.translate(s*(halfW+0.01), 1.12, -0.20);
        paintGeo(sw1, 0xffffff); GC.push(sw1);
        var sw2 = new THREE.BoxGeometry(0.04, 0.34, 0.58);
        sw2.translate(s*(halfW+0.01), 1.12, 0.65);
        paintGeo(sw2, 0xffffff); GC.push(sw2);
    });
    glassGeo = mergeGeos(GC);
    return {bodyGeo:bodyGeo, detailGeo:detailGeo, glassGeo:glassGeo};
}

    // ★ 陆地飞行器
    if(bt === 'landjet'){
        var B = [];
        function bx(w,h,d,x,y,z,hex){ var g = new THREE.BoxGeometry(w,h,d); g.translate(x,y,z); paintGeo(g,hex); B.push(g); }
        bx(W, 0.35, L, 0, 0.35, 0, 0xffffff);
        var nose = new THREE.CylinderGeometry(0.05, 0.35, 1.6, 8);
        nose.rotateX(Math.PI/2); nose.translate(0, 0.35, frontZ + 0.2);
        paintGeo(nose, 0xffffff); B.push(nose);
        bx(W*0.6, 0.35, 1.3, 0, 0.72, -0.3, 0xffffff);
        bx(W*0.45, 0.22, 0.9, 0, 0.98, -0.35, 0xffffff);
        [-1,1].forEach(function(s){
            var wing = new THREE.BoxGeometry(0.7, 0.06, 1.4);
            wing.translate(s*(halfW + 0.3), 0.35, 0.4);
            paintGeo(wing, 0xdddddd); B.push(wing);
            var wingTip = new THREE.BoxGeometry(0.35, 0.04, 0.9);
            wingTip.translate(s*(halfW + 0.65), 0.35, 0.55);
            paintGeo(wingTip, 0xbbbbbb); B.push(wingTip);
        });
        var tailFin = new THREE.BoxGeometry(0.08, 0.85, 1.1);
        tailFin.translate(0, 0.95, rearZ - 0.5);
        paintGeo(tailFin, 0xffffff); B.push(tailFin);
        var tailH = new THREE.BoxGeometry(W*1.1, 0.06, 0.45);
        tailH.translate(0, 1.32, rearZ - 0.5);
        paintGeo(tailH, 0xdddddd); B.push(tailH);
        bx(W*0.85, 0.32, 1.3, 0, 0.55, rearZ - 1.0, 0xeeeeee);
        bodyGeo = mergeGeos(B);

        var D = [];
        [[-halfW+0.05, V.wZF],[halfW-0.05, V.wZF],[-halfW+0.05, V.wZR],[halfW-0.05, V.wZR]].forEach(function(p){
            var x = p[0], z = p[1];
            var w = new THREE.CylinderGeometry(wR, wR, 0.22, 16); w.rotateZ(Math.PI/2); w.translate(x, wR, z);
            paintGeo(w, 0x111111); D.push(w);
            var h = new THREE.CylinderGeometry(wR*0.6, wR*0.6, 0.24, 12); h.rotateZ(Math.PI/2); h.translate(x, wR, z);
            paintGeo(h, 0xbbbbbb); D.push(h);
        });
        [-0.4, 0.4].forEach(function(x){
            var nz = new THREE.CylinderGeometry(0.22, 0.28, 0.35, 12);
            nz.rotateX(Math.PI/2); nz.translate(x, 0.55, rearZ + 0.05);
            paintGeo(nz, 0x222222); D.push(nz);
            var inner = new THREE.CylinderGeometry(0.14, 0.14, 0.36, 10);
            inner.rotateX(Math.PI/2); inner.translate(x, 0.55, rearZ + 0.06);
            paintGeo(inner, 0xff00aa); D.push(inner);
        });
        [-0.6, 0.6].forEach(function(x){
            var hl = new THREE.BoxGeometry(0.5, 0.08, 0.06); hl.translate(x, 0.45, frontZ + 0.05);
            paintGeo(hl, 0xfff8dd); D.push(hl);
        });
        [-0.65, 0.65].forEach(function(x){
            var tl = new THREE.BoxGeometry(0.55, 0.06, 0.06); tl.translate(x, 0.72, rearZ - 0.02);
            paintGeo(tl, 0xff2222); D.push(tl);
        });
        [-1,1].forEach(function(s){
            var vent = new THREE.BoxGeometry(0.08, 0.12, 0.6);
            vent.translate(s*(halfW - 0.02), 0.5, 0.2);
            paintGeo(vent, 0x111111); D.push(vent);
        });
        detailGeo = mergeGeos(D);

        var G = [];
        var glassTop = new THREE.BoxGeometry(W*0.42, 0.04, 0.85);
        glassTop.translate(0, 1.1, -0.35);
        paintGeo(glassTop, 0xffffff); G.push(glassTop);
        glassGeo = mergeGeos(G);
        return {bodyGeo:bodyGeo, detailGeo:detailGeo, glassGeo:glassGeo};
    }

    // ★ 火箭汽车
    if(bt === 'rocket'){
        var BR = [];
        var mainBody = new THREE.CylinderGeometry(0.55, 0.55, 4.0, 16);
        mainBody.rotateX(Math.PI/2);
        mainBody.translate(0, 0.65, 0.3);
        paintGeo(mainBody, 0xffffff); BR.push(mainBody);
        var noseR = new THREE.CylinderGeometry(0.02, 0.55, 1.8, 16);
        noseR.rotateX(Math.PI/2);
        noseR.translate(0, 0.65, frontZ + 0.9);
        paintGeo(noseR, 0xffffff); BR.push(noseR);
        var tailFlare = new THREE.CylinderGeometry(0.55, 0.7, 0.6, 16);
        tailFlare.rotateX(Math.PI/2);
        tailFlare.translate(0, 0.65, rearZ - 0.3);
        paintGeo(tailFlare, 0xdddddd); BR.push(tailFlare);
        var chassis = new THREE.BoxGeometry(W-0.4, 0.2, L-0.8);
        chassis.translate(0, 0.35, 0);
        paintGeo(chassis, 0x222222); BR.push(chassis);
        [-1,1].forEach(function(s){
            var wing = new THREE.BoxGeometry(0.5, 0.08, 1.4);
            wing.translate(s*(halfW + 0.05), 0.65, rearZ - 1.0);
            paintGeo(wing, 0xdddddd); BR.push(wing);
            var wingTip = new THREE.BoxGeometry(0.35, 0.06, 0.7);
            wingTip.translate(s*(halfW + 0.35), 0.65, rearZ - 1.0);
            paintGeo(wingTip, 0xff2222); BR.push(wingTip);
        });
        var topFin = new THREE.BoxGeometry(0.08, 0.6, 1.4);
        topFin.translate(0, 1.25, rearZ - 1.0);
        paintGeo(topFin, 0xdddddd); BR.push(topFin);
        var cockpit = new THREE.BoxGeometry(0.7, 0.35, 1.0);
        cockpit.translate(0, 1.05, frontZ + 1.5);
        paintGeo(cockpit, 0xffffff); BR.push(cockpit);
        bodyGeo = mergeGeos(BR);

        var DR = [];
        [-0.5, 0, 0.5].forEach(function(x){
            var nozzle = new THREE.CylinderGeometry(0.22, 0.26, 0.4, 12);
            nozzle.rotateX(Math.PI/2);
            nozzle.translate(x, 0.65, rearZ + 0.1);
            paintGeo(nozzle, 0x333333); DR.push(nozzle);
            var inner = new THREE.CylinderGeometry(0.15, 0.15, 0.42, 10);
            inner.rotateX(Math.PI/2);
            inner.translate(x, 0.65, rearZ + 0.11);
            paintGeo(inner, 0xff4400); DR.push(inner);
        });
        [[-halfW+0.1, V.wZF],[halfW-0.1, V.wZF],[-halfW+0.1, V.wZR],[halfW-0.1, V.wZR]].forEach(function(p){
            var x = p[0], z = p[1];
            var w = new THREE.CylinderGeometry(wR, wR, 0.22, 16); w.rotateZ(Math.PI/2); w.translate(x, wR, z);
            paintGeo(w, 0x111111); DR.push(w);
            var h = new THREE.CylinderGeometry(wR*0.6, wR*0.6, 0.24, 12); h.rotateZ(Math.PI/2); h.translate(x, wR, z);
            paintGeo(h, 0xbbbbbb); DR.push(h);
        });
        [-0.3, 0.3].forEach(function(x){
            var hl = new THREE.BoxGeometry(0.3, 0.1, 0.08);
            hl.translate(x, 0.55, frontZ + 0.05);
            paintGeo(hl, 0xfff8dd); DR.push(hl);
        });
        [-1,1].forEach(function(s){
            var stripe = new THREE.BoxGeometry(0.05, 0.15, 3.5);
            stripe.translate(s*(halfW-0.1), 0.9, 0);
            paintGeo(stripe, 0xff2222); DR.push(stripe);
        });
        detailGeo = mergeGeos(DR);

        var GR = [];
        var cg = new THREE.BoxGeometry(0.5, 0.25, 0.85);
        cg.translate(0, 1.22, frontZ + 1.5);
        paintGeo(cg, 0xffffff); GR.push(cg);
        glassGeo = mergeGeos(GR);
        return {bodyGeo:bodyGeo, detailGeo:detailGeo, glassGeo:glassGeo};
    }

    // 卡车
    if(bt === 'truck'){
        var B2 = [];
        function bx2(w,h,d,x,y,z,hex){ var g = new THREE.BoxGeometry(w,h,d); g.translate(x,y,z); paintGeo(g,hex); B2.push(g); }
        bx2(W, 2.0, 2.2, 0, 1.6, -2.2, 0xffffff);
        bx2(W-0.10, 0.5, 1.4, 0, 2.80, -2.3, 0xffffff);
        bx2(W+0.10, 2.6, 4.6, 0, 1.9, 1.2, 0xf0f0f0);
        bx2(W+0.14, 0.08, 4.66, 0, 3.24, 1.2, 0xd8d8d8);
        bx2(W-0.30, 0.20, L-0.4, 0, 0.62, 0, 0x2a2a2a);
        bx2(W+0.14, 0.6, 0.16, 0, 1.10, -L/2+0.08, 0x1a1a1a);
        var ramp = new THREE.BoxGeometry(W-0.20, 0.12, 3.4);
        ramp.rotateX(-0.32); ramp.translate(0, 0.65, L/2 + 1.5);
        paintGeo(ramp, 0x333333); B2.push(ramp);
        var ramp2 = new THREE.BoxGeometry(W-0.20, 0.10, 1.2);
        ramp2.rotateX(-0.32); ramp2.translate(0, 1.20, L/2 + 0.2);
        paintGeo(ramp2, 0x444444); B2.push(ramp2);
        bx2(0.10, 0.5, 0.10, -W/2+0.2, 0.40, L/2+0.1, 0x222222);
        bx2(0.10, 0.5, 0.10, W/2-0.2, 0.40, L/2+0.1, 0x222222);
        [-W/2+0.35, W/2-0.35].forEach(function(x){ bx2(0.38, 0.24, 0.10, x, 1.20, -L/2+0.02, 0xfff8dd); });
        [-W/2+0.20, W/2-0.20].forEach(function(x){ bx2(0.22, 0.55, 0.08, x, 1.30, L/2-0.04, 0xff2222); });
        bodyGeo = mergeGeos(B2);
        var D2 = [];
        [[-halfW+0.05,-2.4],[halfW-0.05,-2.4],[-halfW+0.05,1.6],[halfW-0.05,1.6],[-halfW+0.05,2.65],[halfW-0.05,2.65]].forEach(function(p){
            var x = p[0], z = p[1];
            var w = new THREE.CylinderGeometry(wR, wR, 0.30, 16); w.rotateZ(Math.PI/2); w.translate(x, wR, z);
            paintGeo(w, 0x111111); D2.push(w);
            var h = new THREE.CylinderGeometry(wR*0.55, wR*0.55, 0.32, 12); h.rotateZ(Math.PI/2); h.translate(x, wR, z);
            paintGeo(h, 0xbbbbbb); D2.push(h);
        });
        detailGeo = mergeGeos(D2);
        var G2 = [];
        var wf = new THREE.BoxGeometry(W-0.20, 1.0, 0.05); wf.translate(0, 2.20, -L/2+2.15);
        paintGeo(wf, 0xffffff); G2.push(wf);
        glassGeo = mergeGeos(G2);
    } else {
        // 普通车型
        var prof = profs[bt] || profs.car;
        var shape = new THREE.Shape();
        shape.moveTo(prof[0][0], prof[0][1]);
        for(var i=1;i<prof.length;i++) shape.lineTo(prof[i][0], prof[i][1]);
        shape.closePath();
        bodyGeo = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.05, bevelSegments: 2, curveSegments: 1 });
        bodyGeo.translate(0, 0, -W/2); bodyGeo.rotateY(Math.PI/2); bodyGeo.computeVertexNormals();
        paintGeo(bodyGeo, 0xffffff);
        var D3 = [];
        [[-halfW+0.05, V.wZF],[halfW-0.05, V.wZF],[-halfW+0.05, V.wZR],[halfW-0.05, V.wZR]].forEach(function(p){
            var x = p[0], z = p[1];
            var w = new THREE.CylinderGeometry(wR, wR, 0.22, 16); w.rotateZ(Math.PI/2); w.translate(x, wR, z);
            paintGeo(w, 0x111111); D3.push(w);
            var h = new THREE.CylinderGeometry(wR*0.6, wR*0.6, 0.24, 12); h.rotateZ(Math.PI/2); h.translate(x, wR, z);
            paintGeo(h, 0xbbbbbb); D3.push(h);
        });
        [-1,1].forEach(function(sgn){
            var z = sgn*L/2;
            var b = new THREE.BoxGeometry(W+0.05, 0.22, 0.10);
            b.translate(0, 0.40, z + sgn*0.02);
            paintGeo(b, 0x1b1b1b); D3.push(b);
        });
        [-0.55, 0.55].forEach(function(x){
            var hl = new THREE.BoxGeometry(0.42, 0.16, 0.08); hl.translate(x, 0.68, frontZ - 0.04);
            paintGeo(hl, 0xfff8dd); D3.push(hl);
        });
        [-0.60, 0.60].forEach(function(x){
            var tl = new THREE.BoxGeometry(0.40, 0.14, 0.08); tl.translate(x, 0.72, rearZ + 0.04);
            paintGeo(tl, 0xff2222); D3.push(tl);
        });
        [-1,1].forEach(function(s){
            var m = new THREE.BoxGeometry(0.15, 0.10, 0.24); m.translate(s*(halfW+0.15), 1.00, -0.60);
            paintGeo(m, 0x161616); D3.push(m);
            var arm = new THREE.BoxGeometry(0.14, 0.05, 0.06); arm.translate(s*(halfW+0.05), 1.00, -0.58);
            paintGeo(arm, 0x161616); D3.push(arm);
        });
        detailGeo = mergeGeos(D3);
        var G3 = [];
        var wf2 = new THREE.BoxGeometry(W-0.32, 0.70, 0.05); wf2.rotateX(-0.62); wf2.translate(0, 1.02, -0.42);
        paintGeo(wf2, 0xffffff); G3.push(wf2);
        var rw2 = new THREE.BoxGeometry(W-0.36, 0.58, 0.05); rw2.rotateX(0.55); rw2.translate(0, 1.06, 1.05);
        paintGeo(rw2, 0xffffff); G3.push(rw2);
        [-1,1].forEach(function(s){
            var sw = new THREE.BoxGeometry(0.04, 0.32, 0.66); sw.translate(s*(halfW+0.01), 1.02, 0.15);
            paintGeo(sw, 0xffffff); G3.push(sw);
        });
        glassGeo = mergeGeos(G3);
    }
    return {bodyGeo:bodyGeo, detailGeo:detailGeo, glassGeo:glassGeo};
}