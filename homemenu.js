'use strict';
// ============ 主界面增强 ============
(function(){
    var STORAGE_KEY = 'pkw_player_stats';
    var stats = { distance: 0, topSpeed: 0, races: 0, plays: 0 };
    var clockTimer = null;
    var particleRAF = null;

    function $(id){ return document.getElementById(id); }
    function loadStats(){
        try{
            var raw = localStorage.getItem(STORAGE_KEY);
            if(raw){ var s = JSON.parse(raw); if(s && typeof s === 'object'){ stats = Object.assign(stats, s); } }
        }catch(e){}
    }
    function saveStats(){
        try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(stats)); }catch(e){}
    }
    // 对外暴露给 main.js 更新
    window.HOME_STATS = {
        addDistance: function(km){ stats.distance += km; saveStats(); renderStats(); },
        setTopSpeed: function(kmh){ if(kmh > stats.topSpeed){ stats.topSpeed = kmh; saveStats(); renderStats(); } },
        addRace: function(){ stats.races++; saveStats(); renderStats(); },
        addPlay: function(){ stats.plays++; saveStats(); renderStats(); },
        getStats: function(){ return stats; }
    };

    function renderStats(){
        var d = $('statDistance'), s = $('statSpeed'), r = $('statRaces');
        if(d) d.textContent = stats.distance >= 1000 ? (stats.distance/1000).toFixed(1) + 'k' : Math.round(stats.distance);
        if(s) s.textContent = Math.round(stats.topSpeed);
        if(r) r.textContent = stats.races;
    }

    // ---------- 时钟 ----------
    function updateClock(){
        var now = new Date();
        var hh = ('0'+now.getHours()).slice(-2);
        var mm = ('0'+now.getMinutes()).slice(-2);
        var c = $('homeClock'); if(c) c.textContent = hh + ':' + mm;
        var y = now.getFullYear();
        var m = ('0'+(now.getMonth()+1)).slice(-2);
        var d = ('0'+now.getDate()).slice(-2);
        var wd = ['日','一','二','三','四','五','六'][now.getDay()];
        var dt = $('homeDate'); if(dt) dt.textContent = y + '/' + m + '/' + d + ' 周' + wd;
    }

    // ---------- 粒子 ----------
    function initParticles(){
        var cv = $('homeParticles');
        if(!cv) return;
        var ctx = cv.getContext('2d');
        var W = 0, H = 0, particles = [];
        function resize(){
            W = cv.width = cv.clientWidth || window.innerWidth;
            H = cv.height = cv.clientHeight || window.innerHeight;
        }
        function createParticles(n){
            particles = [];
            for(var i=0;i<n;i++){
                particles.push({
                    x: Math.random()*W,
                    y: Math.random()*H,
                    vx: (Math.random()-0.5)*0.15,
                    vy: -0.1 - Math.random()*0.25,
                    r: 0.5 + Math.random()*1.5,
                    a: 0.2 + Math.random()*0.6
                });
            }
        }
        function draw(){
            particleRAF = requestAnimationFrame(draw);
            ctx.clearRect(0,0,W,H);
            for(var i=0;i<particles.length;i++){
                var p = particles[i];
                p.x += p.vx; p.y += p.vy;
                if(p.y < -5){ p.y = H + 5; p.x = Math.random()*W; }
                if(p.x < -5) p.x = W + 5;
                if(p.x > W + 5) p.x = -5;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
                ctx.fillStyle = 'rgba(150,200,255,' + p.a + ')';
                ctx.fill();
            }
        }
        resize(); createParticles(60); draw();
        window.addEventListener('resize', function(){ resize(); createParticles(60); });
    }
    function stopParticles(){
        if(particleRAF){ cancelAnimationFrame(particleRAF); particleRAF = null; }
    }

    // ---------- 3D 车展示 ----------
    var hcScene, hcCam, hcRenderer, hcCar, hcRAF, hcRot = 0;
    function init3DCar(){
        var cv = $('homeCarCanvas');
        if(!cv || typeof THREE === 'undefined') return;
        var w = cv.clientWidth || 320, h = cv.clientHeight || 320;
        cv.width = w; cv.height = h;

        hcScene = new THREE.Scene();
hcCam = new THREE.PerspectiveCamera(30, w/h, 0.1, 100);
hcCam.position.set(6.5, 2.6, 6.5);      // 拉远摄像机
hcCam.lookAt(0, 0.75, 0);               // 视线对准车身中部

        hcRenderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
        hcRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        hcRenderer.setSize(w, h, false);
        if(hcRenderer.outputEncoding !== undefined) hcRenderer.outputEncoding = THREE.sRGBEncoding;

        hcScene.add(new THREE.HemisphereLight(0xaaccff, 0x334466, 1.1));
        var d1 = new THREE.DirectionalLight(0xffffff, 1.2); d1.position.set(5, 8, 5); hcScene.add(d1);
        var d2 = new THREE.DirectionalLight(0x6688bb, 0.6); d2.position.set(-5, 4, -5); hcScene.add(d2);

        // 地面光晕
        var disc = new THREE.Mesh(
            new THREE.CircleGeometry(3, 40),
            new THREE.MeshBasicMaterial({ color: 0x2288ff, transparent: true, opacity: 0.15 })
        );
        disc.rotation.x = -Math.PI/2; disc.position.y = -0.02;
        hcScene.add(disc);

        buildCarModel();

        (function loop(){
            hcRAF = requestAnimationFrame(loop);
            hcRot += 0.005;
            if(hcCar){ hcCar.rotation.y = hcRot; hcCar.position.y = Math.sin(hcRot*2)*0.03; }
            try{ hcRenderer.render(hcScene, hcCam); }catch(e){}
        })();
    }
    function buildCarModel(){
        if(!hcScene) return;
        if(hcCar){ hcScene.remove(hcCar); hcCar = null; }
        if(typeof getCarGeo !== 'function' || typeof currentVehicleType === 'undefined') return;
        var V = (typeof VEHICLES !== 'undefined') ? VEHICLES[currentVehicleType] : null;
        if(!V) return;
        var geos = getCarGeo(currentVehicleType);
        hcCar = new THREE.Group();
        hcCar.add(new THREE.Mesh(geos.bodyGeo, new THREE.MeshStandardMaterial({ vertexColors:true, color:V.color, roughness:0.35, metalness:0.7 })));
        hcCar.add(new THREE.Mesh(geos.detailGeo, new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.55, metalness:0.45 })));
        hcCar.add(new THREE.Mesh(geos.glassGeo, new THREE.MeshStandardMaterial({ color:0x1a2c3a, transparent:true, opacity:0.6, roughness:0.1, metalness:0.9, side:THREE.DoubleSide })));
        hcScene.add(hcCar);
    }
    window.HOME_3DCAR = { rebuild: buildCarModel };
    function stop3DCar(){
        if(hcRAF){ cancelAnimationFrame(hcRAF); hcRAF = null; }
    }

    // ---------- 显示控制 ----------
    function start(){
        loadStats(); renderStats();
        updateClock();
        if(clockTimer) clearInterval(clockTimer);
        clockTimer = setInterval(updateClock, 10000);
        initParticles();
        // 延迟一点让 THREE 准备好
        setTimeout(init3DCar, 400);
    }
    function stop(){
        if(clockTimer){ clearInterval(clockTimer); clockTimer = null; }
        stopParticles();
        stop3DCar();
    }

    window.HOME_MENU = { start: start, stop: stop, rebuildCar: buildCarModel };

    // 页面加载后自动启动
    window.addEventListener('load', function(){
        setTimeout(start, 600);
    });
})();