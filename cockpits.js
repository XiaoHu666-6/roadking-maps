'use strict';
// ============ 各车型内饰构建 ============

function buildAllCockpits(V) {
    var I = V.interior;
    var bt = V.buildType;

    // 各车型核心参数
    var cfg = {
        fy: 0.55,            // 地板高度
        dashW: 1.78,         // 座舱宽度
        seatSpread: 0.45,    // 座椅间距
        roofOffset: 1.20,    // 车顶相对于地板的偏移
        pillarAngle: 0.55,   // A柱倾斜角度（弧度）
        pillarX: 0.75,       // A柱底部X坐标
        pillarY: 1.00,       // A柱底部Y坐标（相对地板）
        pillarZ: -0.55,      // A柱底部Z坐标
        pillarLen: 0.85,     // A柱长度
        windshieldAngle: -0.65 // 挡风玻璃倾斜角度
    };

    if (bt === 'truck') {
        cfg.fy = 1.10; cfg.dashW = 2.10; cfg.seatSpread = 0.55;
        cfg.roofOffset = 1.25;
        cfg.pillarAngle = 0.35;  // 卡车A柱更直立
        cfg.pillarX = 0.95; cfg.pillarY = 0.85; cfg.pillarZ = -0.75;
        cfg.pillarLen = 0.95; cfg.windshieldAngle = -0.45;
    } else if (bt === 'suv') {
        cfg.fy = 0.68; cfg.dashW = 1.86; cfg.seatSpread = 0.48;
        cfg.roofOffset = 1.22;
        cfg.pillarAngle = 0.45;  // SUV A柱中等倾斜
        cfg.pillarX = 0.80; cfg.pillarY = 0.95; cfg.pillarZ = -0.60;
        cfg.pillarLen = 0.88; cfg.windshieldAngle = -0.55;
    } else if (bt === 'hypercar') {
        cfg.fy = 0.45; cfg.dashW = 1.78; cfg.seatSpread = 0.45;
        cfg.roofOffset = 1.15;
        cfg.pillarAngle = 0.70;  // 超跑A柱大角度倾斜
        cfg.pillarX = 0.68; cfg.pillarY = 0.85; cfg.pillarZ = -0.50;
        cfg.pillarLen = 0.80; cfg.windshieldAngle = -0.80;
    } else if (bt === 'landjet' || bt === 'rocket') {
        cfg.fy = 0.50; cfg.dashW = 1.30; cfg.seatSpread = 0;
        cfg.roofOffset = 1.20;
        cfg.pillarAngle = 0.90;  // 飞机A柱几乎水平
        cfg.pillarX = 0.55; cfg.pillarY = 0.80; cfg.pillarZ = -0.45;
        cfg.pillarLen = 0.75; cfg.windshieldAngle = -1.10;
    }

    var parts = [];
    var I = V.interior;

    function box(w, h, d, x, y, z, hex) {
        var g = new THREE.BoxGeometry(w, h, d);
        g.translate(x, y, z);
        paintGeo(g, hex);
        parts.push(g);
    }

    // ---- 地板 ----
    box(cfg.dashW, 0.05, 1.8, 0, cfg.fy, 0.30, I.bg);

    // ---- 座椅 ----
    var seatXs = (cfg.seatSpread === 0) ? [0] : [-cfg.seatSpread, cfg.seatSpread];
    for (var si = 0; si < seatXs.length; si++) {
        var sx = seatXs[si];
        box(0.55, 0.14, 0.60, sx, cfg.fy + 0.10, 0.20, I.seat);
        box(0.55, 0.72, 0.14, sx, cfg.fy + 0.54, 0.52, I.seat);
        box(0.32, 0.16, 0.10, sx, cfg.fy + 1.00, 0.52, I.trim);
    }

    // ---- 仪表台 + 中控 + 侧板 ----
    box(cfg.dashW, 0.10, 0.42, 0, cfg.fy + 0.22, -0.72, I.trim);
    box(0.28, 0.18, 0.55, 0, cfg.fy + 0.14, -0.10, I.bg);
    box(0.06, 0.42, 1.4, -(cfg.dashW/2 - 0.05), cfg.fy + 0.35, 0.30, I.trim);
    box(0.06, 0.42, 1.4, (cfg.dashW/2 - 0.05), cfg.fy + 0.35, 0.30, I.trim);

    // ---- 车顶板 ----
    box(cfg.dashW, 0.05, 1.20, 0, cfg.fy + cfg.roofOffset, 0.55, I.bg);

    // ---- A柱（倾斜） ----
    [-1, 1].forEach(function(s) {
        var p = new THREE.BoxGeometry(0.06, cfg.pillarLen, 0.06);
        p.rotateZ(s * cfg.pillarAngle * 0.3); // 轻微向外倾斜
        p.rotateX(cfg.pillarAngle);            // 主要向前倾斜
        p.translate(s * cfg.pillarX, cfg.fy + cfg.pillarY, cfg.pillarZ);
        paintGeo(p, I.trim);
        parts.push(p);
    });

    // ---- 挡风玻璃（半透明，倾斜） ----
    var wsGeo = new THREE.PlaneGeometry(cfg.dashW * 0.9, cfg.pillarLen * 1.1);
    var wsMat = new THREE.MeshBasicMaterial({
        color: 0x88ccff, transparent: true, opacity: 0.12,
        side: THREE.DoubleSide, depthWrite: false
    });
    var wsMesh = new THREE.Mesh(wsGeo, wsMat);
    wsMesh.position.set(0, cfg.fy + cfg.pillarY + 0.15, cfg.pillarZ + 0.12);
    wsMesh.rotation.x = cfg.windshieldAngle;
    parts.push(wsMesh);

    // ---- 卡车卧铺 ----
    if (bt === 'truck') {
        box(cfg.dashW * 0.9, 0.08, 0.60, 0, cfg.fy + 0.03, 1.30, 0x8a1a1a);
    }

    // ---- 飞行器操纵杆 ----
    if (bt === 'landjet' || bt === 'rocket') {
        var stick = new THREE.CylinderGeometry(0.04, 0.04, 0.5, 10);
        stick.translate(0, cfg.fy + 0.35, -0.05);
        paintGeo(stick, 0x222222);
        parts.push(stick);
        var knob = new THREE.SphereGeometry(0.07, 10, 8);
        knob.translate(0, cfg.fy + 0.62, -0.05);
        paintGeo(knob, 0xcc2222);
        parts.push(knob);
    }

    // ---- 超电发光饰条 ----
    if (bt === 'hypercar') {
        box(0.03, 0.02, 1.50, -(cfg.dashW/2 - 0.05), cfg.fy + 0.45, 0.30, 0x00e5ff);
        box(0.03, 0.02, 1.50, (cfg.dashW/2 - 0.05), cfg.fy + 0.45, 0.30, 0x00e5ff);
    }

    // ---- 合并并生成仪表盘 ----
    var mesh = new THREE.Mesh(mergeGeos(parts), matCockpit);
    var dashGeo = new THREE.PlaneGeometry(cfg.dashW * 0.55, 0.20);
    var dashMat = new THREE.MeshBasicMaterial({ map: createDashTexture() });
    var dashMesh = new THREE.Mesh(dashGeo, dashMat);
    dashMesh.position.set(0, cfg.fy + 0.34, -0.62);
    dashMesh.rotation.x = cfg.windshieldAngle;
    mesh.add(dashMesh);

    return mesh;
}