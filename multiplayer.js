'use strict';
// ============ 联机功能丶测试 ============
window.MULTIPLAYER = (function(){
    var MAX_PLAYERS = 4;
    var MP_VERSION = '1.0.0';

    var isHost = false;
    var inRoom = false;
    var roomId = null;
    var peer = null;
    var hostConn = null;
    var connections = [];
    var myName = '玩家';
    var myPeerId = null;

    var settings = { scene: 'highway', speedLimit: 0, npcEnabled: true, collisionEnabled: true };

    var remoteCars = {};
    var chatLog = [];
    var unreadChat = 0;
    var syncTimer = 0;
    var SYNC_INTERVAL = 1 / 10;
    var peerReady = false;
    var joinSeq = 0;
    var latency = 0;
    var pingTimer = 0;
    var lastPingSent = 0;
    var latencySamples = [];
    var _hudRefreshTimer = 0;
    var _loadingTimer = null;
    var _lastJoinArgs = null;   // 用于重试
    var _lastCreateArgs = null;

    function $(id){ return document.getElementById(id); }
    function toast(t){ if(typeof showToast === 'function') showToast(t); }
    function genRoomId(){ var s=''; for(var i=0;i<5;i++) s += Math.floor(Math.random()*10); return s; }
    function now(){ return Date.now(); }
    function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

    // ---------- 加载遮罩 ----------
    function ensureLoadingDom(){
        if($('mpLoadingOverlay')) return;
        var ov = document.createElement('div');
        ov.id = 'mpLoadingOverlay';
        ov.style.cssText = 'position:fixed;inset:0;z-index:99999;display:none;' +
            'align-items:center;justify-content:center;flex-direction:column;' +
            'background:rgba(0,5,15,.92);backdrop-filter:blur(8px);' +
            'color:#fff;font-size:15px;letter-spacing:2px;' +
            'padding:20px;text-align:center;';
        ov.innerHTML =
            '<div id="mpLoadingSpinner" style="' +
                'width:60px;height:60px;border-radius:50%;' +
                'border:5px solid rgba(100,180,255,.2);' +
                'border-top-color:#44aaff;' +
                'animation:mpSpin 1s linear infinite;' +
                'margin-bottom:20px;"></div>' +
            '<div id="mpLoadingText" style="font-size:16px;color:#88ccff;margin-bottom:10px;font-weight:700">正在连接...</div>' +
            '<div id="mpLoadingHint" style="font-size:12px;color:#6688aa;max-width:80vw;line-height:1.7">请稍候，不要关闭游戏</div>' +
            '<button id="mpLoadingCancel" style="' +
                'margin-top:24px;padding:10px 28px;border-radius:8px;' +
                'background:rgba(255,80,80,.25);border:1px solid rgba(255,100,100,.5);' +
                'color:#ff8888;font-size:13px;cursor:pointer;display:none;' +
            '">取消</button>' +
            '<style>@keyframes mpSpin{to{transform:rotate(360deg)}}</style>';
        document.body.appendChild(ov);

        // 取消按钮
        var cancelBtn = ov.querySelector('#mpLoadingCancel');
        if(cancelBtn){
            cancelBtn.addEventListener('click', function(){
                hideLoading();
                leaveRoom(true);
            });
        }
    }
    function showLoading(text, hint, showCancel){
        ensureLoadingDom();
        var ov = $('mpLoadingOverlay');
        if(!ov) return;
        var txt = $('mpLoadingText');
        var hnt = $('mpLoadingHint');
        var cnl = $('mpLoadingCancel');
        if(txt) txt.textContent = text || '正在连接...';
        if(hnt) hnt.textContent = hint || '请稍候，不要关闭游戏';
        if(cnl) cnl.style.display = showCancel ? 'inline-block' : 'none';
        ov.style.display = 'flex';
        // 15 秒超时提示
        if(_loadingTimer) clearTimeout(_loadingTimer);
        _loadingTimer = setTimeout(function(){
            if($('mpLoadingOverlay') && $('mpLoadingOverlay').style.display === 'flex'){
                var hnt2 = $('mpLoadingHint');
                if(hnt2) hnt2.innerHTML = '⚠️ 连接超时，请检查网络<br>可以点击下方按钮重新尝试或取消';
                var cnl2 = $('mpLoadingCancel');
                if(cnl2) cnl2.style.display = 'inline-block';
            }
        }, 15000);
    }
    function hideLoading(){
        if(_loadingTimer){ clearTimeout(_loadingTimer); _loadingTimer = null; }
        var ov = $('mpLoadingOverlay');
        if(ov) ov.style.display = 'none';
    }
    function updateLoading(text, hint){
        var txt = $('mpLoadingText');
        var hnt = $('mpLoadingHint');
        if(txt && text) txt.textContent = text;
        if(hnt && hint) hnt.textContent = hint;
    }

    function showOnlineScreen(id){
        ['startScreen','matchConfirm','matchMaking','vehicleSelect','raceResult','sceneSelect','onlineScreen']
            .forEach(function(s){
                var el = $(s);
                if(el) el.style.display = (s === id) ? 'flex' : 'none';
            });
    }
    function getPeerOptions(){
        return {
            debug: 1,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' },
                    // 免费 TURN 中继（解决 4G/5G 流量 NAT 打不通）
                    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
                    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
                    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
                ]
            }
        };
    }

    // ---------- 远程车 ----------
    function makeNameSprite(name, isHostCar, isSelf){
        try {
            var canvas = document.createElement('canvas');
            canvas.width = 512; canvas.height = 128;
            var ctx = canvas.getContext('2d');
            var borderColor = isSelf ? '#ffcc44' : (isHostCar ? '#ff4488' : '#44aaff');
            ctx.fillStyle = 'rgba(0,0,0,0.72)';
            ctx.fillRect(8, 30, 496, 68);
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 5;
            ctx.strokeRect(8, 30, 496, 68);
            ctx.font = 'bold 46px sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.shadowColor = borderColor; ctx.shadowBlur = 22;
            ctx.fillStyle = isSelf ? '#ffe066' : '#ffffff';
            var prefix = isHostCar ? '👑 ' : '';
            ctx.fillText(prefix + name, 256, 66);
            ctx.shadowBlur = 0;
            var texture = new THREE.CanvasTexture(canvas);
            texture.minFilter = THREE.LinearFilter;
            var mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
            var sprite = new THREE.Sprite(mat);
            sprite.scale.set(5.4, 1.35, 1);
            sprite.position.set(0, 3.8, 0);
            sprite.renderOrder = 999;
            return sprite;
        } catch(e){ return null; }
    }
    function createRemoteCar(peerId, name, vehType, isHostCar){
        if(typeof scene === 'undefined' || !scene) return null;
        if(typeof buildAICarMesh !== 'function') return null;
        var hash = 0;
        for(var i=0;i<peerId.length;i++) hash = (hash*31 + peerId.charCodeAt(i)) >>> 0;
        var color = new THREE.Color().setHSL((hash % 360) / 360, 0.75, 0.55).getHex();
        var group = buildAICarMesh(vehType || 'sedan', color);
        scene.add(group);
        var sprite = makeNameSprite(name || '玩家', isHostCar, false);
        if(sprite) group.add(sprite);
        return group;
    }
    function rebuildRemoteCar(peerId, vehType, name, isHostCar){
        var rc = remoteCars[peerId];
        if(!rc) return;
        var old = rc.group;
        var x = rc.x, z = rc.z, h = rc.heading, y = rc.y;
        if(old && typeof scene !== 'undefined' && scene) scene.remove(old);
        var group = createRemoteCar(peerId, name, vehType, isHostCar);
        rc.group = group;
        rc.vehicle = vehType;
        rc.name = name;
        if(group){
            var ox = (typeof offsetX === 'function') ? offsetX(z) : 0;
            var oy = (typeof offsetY === 'function') ? offsetY(z) : 0;
            group.position.set(ox + x, oy + y, z);
            group.rotation.y = h;
        }
    }
    function updateRemoteCar(peerId, data, isHostCar){
        if(typeof scene === 'undefined' || !scene) return;
        var rc = remoteCars[peerId];
        if(!rc){
            rc = remoteCars[peerId] = {
                group: createRemoteCar(peerId, data.n || '玩家', data.v || 'sedan', isHostCar),
                x:0, z:0, heading:0, y:0, name: data.n || '玩家', vehicle: data.v || 'sedan'
            };
            if(!rc.group){ delete remoteCars[peerId]; return; }
        }
        if(data.v && data.v !== rc.vehicle){
            rebuildRemoteCar(peerId, data.v, rc.name, isHostCar);
            rc = remoteCars[peerId];
            if(!rc || !rc.group) return;
        }
        rc.x = data.x || 0;
        rc.z = data.z || 0;
        rc.heading = data.h || 0;
        rc.y = data.y || 0;
        var ox = (typeof offsetX === 'function') ? offsetX(rc.z) : 0;
        var oy = (typeof offsetY === 'function') ? offsetY(rc.z) : 0;
        rc.group.position.set(ox + rc.x, oy + rc.y, rc.z);
        rc.group.rotation.y = rc.heading;
        var slopeY = (typeof offsetY === 'function') ? (offsetY(rc.z+2) - offsetY(rc.z-2)) / 4 : 0;
        rc.group.rotation.x = -Math.atan(slopeY);
    }
    function removeRemoteCar(peerId){
        var rc = remoteCars[peerId];
        if(!rc) return;
        if(rc.group && typeof scene !== 'undefined' && scene) scene.remove(rc.group);
        delete remoteCars[peerId];
    }
    function clearAllRemoteCars(){
        Object.keys(remoteCars).forEach(removeRemoteCar);
        remoteCars = {};
    }

    // ★ 重建自己车（保留状态）
    function rebuildMyCarKeepState(){
        if(typeof buildPlayerCar !== 'function') return;

        var sX = (typeof carLocalX !== 'undefined') ? carLocalX : 0;
        var sZ = (typeof playerCar !== 'undefined' && playerCar && playerCar.position) ? playerCar.position.z : 0;
        var sH = (typeof carHeading !== 'undefined') ? carHeading : 0;
        var sSpd = (typeof carSpeed !== 'undefined') ? carSpeed : 0;
        var sY = (typeof carY !== 'undefined') ? carY : 0;
        var sVy = (typeof carVy !== 'undefined') ? carVy : 0;
        var sAir = (typeof isAirborne !== 'undefined') ? isAirborne : false;
        var sGear = (typeof gearText !== 'undefined') ? gearText : 'N';
        var sGearIdx = (typeof currentGearIdx !== 'undefined') ? currentGearIdx : 0;
        var sDrift = (typeof isDrifting !== 'undefined') ? isDrifting : false;

        try { buildPlayerCar(); } catch(e){ console.error('buildPlayerCar err:', e); return; }

        if(typeof carLocalX !== 'undefined') carLocalX = sX;
        if(typeof carHeading !== 'undefined') carHeading = sH;
        if(typeof carSpeed !== 'undefined') carSpeed = sSpd;
        if(typeof carY !== 'undefined') carY = sY;
        if(typeof carVy !== 'undefined') carVy = sVy;
        if(typeof isAirborne !== 'undefined') isAirborne = sAir;
        if(typeof gearText !== 'undefined') gearText = sGear;
        if(typeof currentGearIdx !== 'undefined') currentGearIdx = sGearIdx;
        if(typeof isDrifting !== 'undefined') isDrifting = sDrift;

        if(typeof playerCar !== 'undefined' && playerCar && typeof offsetX === 'function'){
            var worldX = offsetX(sZ) + sX;
            var worldY = offsetY(sZ) + sY;
            playerCar.position.set(worldX, worldY, sZ);
            playerCar.rotation.y = sH;
            playerCar.visible = true;
            if(typeof updateCamera === 'function'){ try{ updateCamera(0.016, Math.abs(sSpd), 0, true); }catch(e){} }
        }
        if(typeof updateGearUI === 'function'){ try{ updateGearUI(); }catch(e){} }
    }

    // ---------- 聊天 ----------
    function appendChat(from, text, self){
        chatLog.push({ from: from, text: text, ts: now(), self: !!self });
        if(chatLog.length > 100) chatLog.shift();
        renderChat();
    }
    function renderChat(){
        var box = $('mpChatMessages'); if(!box) return;
        var html = '';
        for(var i=Math.max(0, chatLog.length-50); i<chatLog.length; i++){
            var m = chatLog[i];
            html += '<div class="mpChatMsg' + (m.self ? ' self' : '') + '">' +
                    '<span class="mpChatFrom">' + esc(m.self ? '我' : m.from) + ':</span> ' +
                    esc(m.text) + '</div>';
        }
        box.innerHTML = html;
        box.scrollTop = box.scrollHeight;
    }
    function sendChat(text){
        if(!text || !inRoom) return;
        appendChat(myName, text, true);
        if(isHost) broadcast({ t:'chat', from: myName, text: text });
        else sendToHost({ t:'chat', from: myName, text: text });
    }

    // ---------- 收发 ----------
    function broadcast(msg){
        if(!isHost) return;
        for(var i=0;i<connections.length;i++){
            try{ if(connections[i].conn && connections[i].conn.open) connections[i].conn.send(msg); }catch(e){}
        }
    }
    function broadcastExcept(exceptConn, msg){
        if(!isHost) return;
        for(var i=0;i<connections.length;i++){
            var c = connections[i];
            if(c.conn === exceptConn) continue;
            try{ if(c.conn && c.conn.open) c.conn.send(msg); }catch(e){}
        }
    }
    function sendToHost(msg){
        if(isHost || !hostConn || !hostConn.open) return;
        try{ hostConn.send(msg); }catch(e){}
    }
    function findConnId(conn){
        for(var i=0;i<connections.length;i++) if(connections[i].conn === conn) return connections[i].id;
        return null;
    }
    function connName(conn){
        for(var i=0;i<connections.length;i++) if(connections[i].conn === conn) return connections[i].name;
        return null;
    }
    function findConn(conn){
        for(var i=0;i<connections.length;i++) if(connections[i].conn === conn) return connections[i];
        return null;
    }

    // ---------- 延迟 ----------
    function pushLatencySample(ms){
        latencySamples.push(ms);
        if(latencySamples.length > 5) latencySamples.shift();
        var sum = 0;
        for(var i=0;i<latencySamples.length;i++) sum += latencySamples[i];
        latency = Math.round(sum / latencySamples.length);
        updateLatencyHud();
    }
    function updateLatencyHud(){
        var el = $('mpRoomPing'); if(!el) return;
        if(isHost && latency === 0){
            el.innerHTML = '📶 延迟 <span style="color:#88aadd;font-weight:700">—</span>';
            return;
        }
        var color = latency < 60 ? '#44ff88' : (latency < 150 ? '#ffcc44' : '#ff6666');
        el.innerHTML = '📶 延迟 <span style="color:' + color + ';font-weight:700">' + latency + '</span> ms';
    }
    function doPing(){
        var t = now();
        lastPingSent = t;
        if(isHost) broadcast({ t:'ping', ts: t });
        else sendToHost({ t:'ping', ts: t });
    }
    function onPong(ts){
        if(!lastPingSent) return;
        var rtt = now() - lastPingSent;
        if(rtt >= 0 && rtt < 5000) pushLatencySample(rtt);
    }

    // ---------- 房间设置 ----------
    function applyHostSettings(){
        if(typeof currentSceneMode !== 'undefined'){
            currentSceneMode = settings.scene;
            if(typeof applySceneMode === 'function') applySceneMode();
        }
        if(!settings.npcEnabled){
            if(window._mpSavedTraffic === undefined && typeof trafficLevel !== 'undefined') window._mpSavedTraffic = trafficLevel;
            if(typeof trafficLevel !== 'undefined') trafficLevel = 0;
        } else if(window._mpSavedTraffic !== undefined){
            if(typeof trafficLevel !== 'undefined') trafficLevel = window._mpSavedTraffic;
            window._mpSavedTraffic = undefined;
        }
        var ts = $('trafficSlider');
        if(ts){ ts.disabled = true; ts.style.opacity = '0.4'; }
    }
    function restoreHostSettings(){
        var ts = $('trafficSlider');
        if(ts){ ts.disabled = false; ts.style.opacity = ''; }
        if(window._mpSavedTraffic !== undefined && typeof trafficLevel !== 'undefined'){
            trafficLevel = window._mpSavedTraffic; window._mpSavedTraffic = undefined;
        }
    }

    // ---------- 房主：创建房间 ----------
    function createRoom(opt){
        if(!window.Peer){ toast('❌ 联机库未加载'); return; }
        _lastCreateArgs = opt;
        myName = (opt && opt.name) || myName;
        isHost = true;
        roomId = (opt && opt.roomId) || genRoomId();
        settings.scene = (opt && opt.scene) || 'highway';
        settings.speedLimit = (opt && opt.speedLimit) || 0;
        settings.npcEnabled = (opt && opt.npcEnabled !== false);
        settings.collisionEnabled = (opt && opt.collisionEnabled !== false);

        // ★ 显示遮罩
        showLoading('正在创建房间...', '房间号：' + roomId + '\n请稍候', true);

        // ★ 先彻底销毁旧 peer，等 800ms 再创建新的（防止 unavailable-id）
        if(peer){
            try{ peer.destroy(); }catch(e){}
            peer = null;
            setTimeout(doCreateRoom, 800);
        } else {
            doCreateRoom();
        }
    }

    function doCreateRoom(){
        updateLoading('正在创建房间...', '房间号：' + roomId + '\n等待 Peer 服务器响应');
        peer = new window.Peer('pkw-' + roomId, getPeerOptions());

        // 10 秒超时
        var _timeout = setTimeout(function(){
            if(!peerReady){
                updateLoading('⚠️ 创建房间超时', '请检查网络后重试');
                var cnl = $('mpLoadingCancel');
                if(cnl) cnl.style.display = 'inline-block';
            }
        }, 10000);

        peer.on('open', function(){
            clearTimeout(_timeout);
            peerReady = true; inRoom = true;
            if(typeof currentSceneMode !== 'undefined') currentSceneMode = settings.scene;
            if(typeof applySceneMode === 'function') applySceneMode();
            if(!settings.npcEnabled){
                if(window._mpSavedTraffic === undefined && typeof trafficLevel !== 'undefined') window._mpSavedTraffic = trafficLevel;
                if(typeof trafficLevel !== 'undefined') trafficLevel = 0;
            }
            var ts = $('trafficSlider');
            if(ts){ ts.disabled = true; ts.style.opacity = '0.4'; }

            hideLoading();
            toast('🏠 房间已创建：' + roomId);
            enterRoomUI();
            doPing();
        });
        peer.on('connection', function(conn){
            if(connections.length >= MAX_PLAYERS - 1){
                try{
                    conn.on('open', function(){
                        try{ conn.send({ t:'roomFull', max: MAX_PLAYERS }); }catch(e){}
                        setTimeout(function(){ try{ conn.close(); }catch(e){} }, 400);
                    });
                }catch(e){}
                return;
            }
            conn.on('data', function(data){ handleDataFromClient(conn, data); });
            conn.on('close', function(){
                var id = findConnId(conn);
                if(id){
                    var n = connName(conn);
                    broadcast({ t:'leave', id: id, name: n });
                    removeRemoteCar(id);
                    for(var i=0;i<connections.length;i++){ if(connections[i].conn === conn){ connections.splice(i,1); break; } }
                    appendChat('系统', (n || '玩家') + ' 离开了房间', false);
                    toast('👋 ' + (n || '玩家') + ' 离开');
                    updateRoomHud();
                }
            });
            conn.on('error', function(){});
        });
        peer.on('error', function(err){
            clearTimeout(_timeout);
            console.error('Peer error:', err);
            var t = err && err.type ? err.type : '未知';
            hideLoading();
            if(t === 'unavailable-id'){
                toast('❌ 房间号被占用，请换一个房间号');
            } else if(t === 'network' || t === 'server-error'){
                toast('❌ 网络错误，请检查网络后重试');
            } else {
                toast('❌ 联机错误：' + t);
            }
        });
    }

    function handleDataFromClient(conn, data){
        if(!data || !data.t) return;
        if(data.t === 'hello'){
            var id = 'p' + (++joinSeq);
            var name = (data.name || '玩家').substring(0, 16);

            if(data.ver !== MP_VERSION){
                try{ conn.send({ t:'versionMismatch', required: MP_VERSION, yours: data.ver || '未知' }); }catch(e){}
                setTimeout(function(){ try{ conn.close(); }catch(e){} }, 600);
                toast('⚠️ 拒绝版本不匹配的玩家加入');
                return;
            }

            var myZ = (typeof playerCar !== 'undefined' && playerCar && playerCar.position) ? playerCar.position.z : 0;
            var myX = (typeof carLocalX !== 'undefined') ? carLocalX : 0;
            var myH = (typeof carHeading !== 'undefined') ? carHeading : 0;

            connections.push({
                id: id, conn: conn, name: name, vehicle: data.v || 'sedan',
                x: myX, z: myZ, h: myH, y: 0
            });

            updateRemoteCar(id, { x: myX, z: myZ, h: myH, y: 0, v: data.v || 'sedan', n: name }, false);

            var others = [];
            for(var k in remoteCars){
                if(k === id) continue;
                others.push({ id:k, name: remoteCars[k].name, x: remoteCars[k].x, z: remoteCars[k].z, h: remoteCars[k].heading, y: remoteCars[k].y, v: remoteCars[k].vehicle });
            }
            conn.send({ t:'welcome', id: id, settings: settings, host: myName, players: others, hostVehicle: (typeof currentVehicleType !== 'undefined' ? currentVehicleType : 'sedan'), hostX: myX, hostZ: myZ, hostH: myH, ver: MP_VERSION });
            broadcastExcept(conn, { t:'join', id: id, name: name, v: (data.v || 'sedan') });
            appendChat('系统', name + ' 加入了房间', false);
            toast('👥 ' + name + ' 加入');
            updateRoomHud();
            return;
        }
        if(data.t === 'state'){
            var sid = findConnId(conn); if(!sid) return;
            var vType = data.v || 'sedan';
            var c = findConn(conn);
            if(c){
                c.x = data.x; c.z = data.z; c.h = data.h; c.y = data.y;
                c.vehicle = vType;
            }
            updateRemoteCar(sid, { x:data.x, z:data.z, h:data.h, y:data.y, v:vType, n: connName(conn) }, false);
            broadcastExcept(conn, { t:'state', id: sid, x: data.x, z: data.z, h: data.h, y: data.y, v: vType, n: connName(conn) });
            return;
        }
        if(data.t === 'changeVehicle'){
            var cid = findConnId(conn); if(!cid) return;
            var newV = data.v || 'sedan';
            var c2 = findConn(conn);
            if(c2) c2.vehicle = newV;
            rebuildRemoteCar(cid, newV, connName(conn), false);
            broadcastExcept(conn, { t:'changeVehicle', id: cid, v: newV, n: connName(conn) });
            return;
        }
        if(data.t === 'chat'){
            var from = connName(conn) || '玩家';
            broadcastExcept(conn, { t:'chat', from: from, text: data.text });
            appendChat(from, data.text, false);
            var p = $('mpChatPanel');
            if(p && !p.classList.contains('on')){ unreadChat++; updateChatBadge(); }
            return;
        }
        if(data.t === 'bye'){
            var bid = findConnId(conn);
            if(bid){ removeRemoteCar(bid); broadcastExcept(conn, { t:'leave', id: bid }); }
            return;
        }
        if(data.t === 'ping'){ try{ conn.send({ t:'pong', ts: data.ts }); }catch(e){} return; }
        if(data.t === 'pong'){ onPong(data.ts); return; }
    }

    // ---------- 玩家：加入房间 ----------
    function joinRoom(rId, name){
        if(!window.Peer){ toast('❌ 联机库未加载'); return; }
        _lastJoinArgs = { rId: rId, name: name };
        myName = name || myName;
        isHost = false;
        roomId = String(rId || '').trim();
        if(!roomId){ toast('请输入房间号'); return; }

        // ★ 显示遮罩
        showLoading('正在加入房间...', '房间号：' + roomId + '\n正在连接房主', true);

        // ★ 先销毁旧 peer，800ms 后重连
        if(peer){
            try{ peer.destroy(); }catch(e){}
            peer = null;
            setTimeout(doJoinRoom, 800);
        } else {
            doJoinRoom();
        }
    }

    function doJoinRoom(){
        updateLoading('正在加入房间...', '房间号：' + roomId + '\n正在寻找房主');
        peer = new window.Peer(getPeerOptions());

        // 12 秒超时
        var _timeout = setTimeout(function(){
            if(!peerReady){
                updateLoading('⚠️ 加入房间超时', '可能原因：\n· 房间号错误\n· 房主已退出\n· 网络不通\n\n可以重试或取消');
                var cnl = $('mpLoadingCancel');
                if(cnl) cnl.style.display = 'inline-block';
            }
        }, 12000);

        peer.on('open', function(id){
            myPeerId = id;
            updateLoading('正在加入房间...', '已连接 Peer 服务器\n正在连接房主');
            hostConn = peer.connect('pkw-' + roomId, { reliable: false });

            // 连接房主超时
            var _hostTimeout = setTimeout(function(){
                if(!peerReady){
                    updateLoading('⚠️ 无法连接房主', '房主可能已退出\n\n可以重试或取消');
                    var cnl = $('mpLoadingCancel');
                    if(cnl) cnl.style.display = 'inline-block';
                    clearTimeout(_timeout);
                }
            }, 8000);

            hostConn.on('open', function(){
                clearTimeout(_timeout);
                clearTimeout(_hostTimeout);
                peerReady = true; inRoom = true;
                var myV = (typeof currentVehicleType !== 'undefined') ? currentVehicleType : 'sedan';
                hostConn.send({ t:'hello', name: myName, v: myV, ver: MP_VERSION });
                updateLoading('已连接，正在同步房间...', '请稍候');
                // 稍等一下等 welcome 消息
                setTimeout(function(){
                    if(inRoom){
                        hideLoading();
                        enterRoomUI();
                        toast('✅ 已加入房间 ' + roomId);
                        doPing();
                    }
                }, 500);
            });
            hostConn.on('data', function(data){ handleDataFromHost(data); });
            hostConn.on('close', function(){
                clearTimeout(_timeout);
                clearTimeout(_hostTimeout);
                hideLoading();
                if(inRoom){ toast('❌ 房主退出了房间，房间已解散'); leaveRoom(false); }
            });
            hostConn.on('error', function(){
                clearTimeout(_timeout);
                clearTimeout(_hostTimeout);
                hideLoading();
                toast('❌ 连接错误');
                if(inRoom) leaveRoom(false);
            });
        });
        peer.on('error', function(err){
            clearTimeout(_timeout);
            console.error('Peer error:', err);
            var t = err && err.type ? err.type : '未知';
            hideLoading();
            if(t === 'peer-unavailable') toast('❌ 找不到该房间，请检查房间号');
            else if(t === 'network' || t === 'server-error') toast('❌ 网络错误，请检查网络');
            else toast('❌ 联机错误：' + t);
        });
    }

    function handleDataFromHost(data){
        if(!data || !data.t) return;
        if(data.t === 'roomFull'){
            hideLoading();
            toast('❌ 房间已满（最多 ' + (data.max || MAX_PLAYERS) + ' 人）');
            leaveRoom(true); return;
        }
        if(data.t === 'versionMismatch'){
            hideLoading();
            alert('⚠️ 版本不匹配\n\n房主版本：' + data.required + '\n你的版本：' + data.yours + '\n\n请升级到房主最新版本后再加入');
            toast('❌ 版本过低，请升级');
            leaveRoom(true); return;
        }
        if(data.t === 'welcome'){
            if(data.settings){
                settings.scene = data.settings.scene;
                settings.speedLimit = data.settings.speedLimit;
                settings.npcEnabled = data.settings.npcEnabled;
                settings.collisionEnabled = data.settings.collisionEnabled;
                applyHostSettings();
            }
            if(data.hostVehicle){
                var hx = (typeof data.hostX === 'number') ? data.hostX : 0;
                var hz = (typeof data.hostZ === 'number') ? data.hostZ : 0;
                var hh = (typeof data.hostH === 'number') ? data.hostH : 0;
                updateRemoteCar('host', { x:hx, z:hz, h:hh, y:0, v:data.hostVehicle, n: data.host || '房主' }, true);
            }
            if(data.players && data.players.length){
                for(var i=0;i<data.players.length;i++){
                    var p = data.players[i];
                    updateRemoteCar(p.id, { x:p.x, z:p.z, h:p.h, y:p.y, n:p.name, v:p.v || 'sedan' }, false);
                }
            }
            appendChat('系统', '已加入房间，房主：' + (data.host || '房主'), false);
            hideLoading();
            updateRoomHud();
            return;
        }
        if(data.t === 'join'){ appendChat('系统', (data.name || '玩家') + ' 加入了房间', false); updateRoomHud(); return; }
        if(data.t === 'leave'){
            var nm = remoteCars[data.id] ? remoteCars[data.id].name : (data.name || '玩家');
            removeRemoteCar(data.id);
            appendChat('系统', nm + ' 离开了房间', false);
            updateRoomHud(); return;
        }
        if(data.t === 'state'){
            if(data.id === 'host') updateRemoteCar('host', { x:data.x, z:data.z, h:data.h, y:data.y, n:data.n || '房主', v:data.v }, true);
            else updateRemoteCar(data.id, { x:data.x, z:data.z, h:data.h, y:data.y, n:data.n, v:data.v }, false);
            return;
        }
        if(data.t === 'changeVehicle'){
            var isHostCar = (data.id === 'host');
            rebuildRemoteCar(data.id, data.v, data.n || (isHostCar ? '房主' : '玩家'), isHostCar);
            return;
        }
        if(data.t === 'chat'){
            appendChat(data.from || '玩家', data.text, false);
            var p = $('mpChatPanel');
            if(p && !p.classList.contains('on')){ unreadChat++; updateChatBadge(); }
            return;
        }
        if(data.t === 'settings'){
            if(data.settings){
                settings.scene = data.settings.scene;
                settings.speedLimit = data.settings.speedLimit;
                settings.npcEnabled = data.settings.npcEnabled;
                settings.collisionEnabled = data.settings.collisionEnabled;
                applyHostSettings();
                toast('⚙ 房主更新了房间设置');
            }
            return;
        }
        if(data.t === 'close'){ hideLoading(); toast('❌ 房主退出了房间，房间已解散'); leaveRoom(false); return; }
        if(data.t === 'ping'){ sendToHost({ t:'pong', ts: data.ts }); return; }
        if(data.t === 'pong'){ onPong(data.ts); return; }
    }

    // ---------- 房间 UI ----------
    function enterRoomUI(){
        showOnlineScreen(null);
        if($('gameContainer')) $('gameContainer').classList.remove('on');
        if($('mpRoomHud')) $('mpRoomHud').style.display = 'block';
        if($('mpChatToggle')) $('mpChatToggle').style.display = 'flex';
        if($('mpLeaveBtn')) $('mpLeaveBtn').style.display = 'block';
        if($('mpRoomSettingsBtn')) $('mpRoomSettingsBtn').style.display = isHost ? 'block' : 'none';
        updateRoomHud();
        updateLatencyHud();
        if($('vehicleSelect')){
            $('vehicleSelect').style.display = 'flex';
            if(typeof initPreview === 'function'){ try{ initPreview(); }catch(e){} }
            if(typeof buildVehicleList === 'function'){ try{ buildVehicleList(); }catch(e){} }
            if(typeof selectVehicle === 'function' && typeof currentVehicleType !== 'undefined'){
                try{ selectVehicle(currentVehicleType); }catch(e){}
            }
        }
    }

    function updateRoomHud(){
        var idEl = $('mpRoomIdText'); if(idEl) idEl.textContent = roomId || '-----';
        var roleEl = $('mpRoomRole'); if(roleEl) roleEl.textContent = isHost ? '👑 房主' : '玩家';
        var listEl = $('mpRoomPlayers');
        if(!listEl) return;

        var myZ = (typeof playerCar !== 'undefined' && playerCar && playerCar.position) ? playerCar.position.z : 0;

        function fmtDist(remoteZ){
            var d = Math.abs(remoteZ - myZ);
            if(d < 1000) return Math.round(d) + 'm';
            return (d/1000).toFixed(2) + 'km';
        }

        var count = 1 + (isHost ? connections.length : Object.keys(remoteCars).filter(function(k){ return k !== 'host'; }).length);
        var html = '<div class="mpPlayerRow"><span class="mpDot me"></span>' + (isHost ? '👑 ' : '') + esc(myName) + ' (我)</div>';

        if(isHost){
            for(var i=0; i<connections.length; i++){
                var conn = connections[i];
                var distStr = (typeof conn.z === 'number') ? fmtDist(conn.z) : '';
                html += '<div class="mpPlayerRow"><span class="mpDot"></span>' + esc(conn.name)
                     + (distStr ? '<span class="mpPlayerDist">' + distStr + '</span>' : '')
                     + '</div>';
            }
        } else {
            for(var k in remoteCars){
                var rc2 = remoteCars[k];
                var nm = rc2.name || (k === 'host' ? '房主' : '玩家');
                var icon = (k === 'host') ? '👑 ' : '';
                var distStr2 = (typeof rc2.z === 'number') ? fmtDist(rc2.z) : '';
                html += '<div class="mpPlayerRow"><span class="mpDot' + (k === 'host' ? ' host' : '') + '"></span>' + icon + esc(nm)
                     + (distStr2 ? '<span class="mpPlayerDist">' + distStr2 + '</span>' : '')
                     + '</div>';
            }
        }
        html += '<div class="mpPlayerRow" style="opacity:.6;font-size:10px;margin-top:2px">👥 ' + count + ' / ' + MAX_PLAYERS + '</div>';
        listEl.innerHTML = html;
    }

    function updateChatBadge(){
        var b = $('mpChatBadge'); if(!b) return;
        if(unreadChat > 0){ b.style.display = 'inline-block'; b.textContent = unreadChat > 99 ? '99+' : unreadChat; }
        else b.style.display = 'none';
    }

    // ---------- 离开 ----------
    function leaveRoom(showHome){
        var wasHost = isHost;
        hideLoading();
        try{ if(isHost) broadcast({ t:'close' }); else sendToHost({ t:'bye' }); }catch(e){}
        clearAllRemoteCars();
        if(peer){ try{ peer.destroy(); }catch(e){} peer = null; }
        hostConn = null; connections = [];
        peerReady = false; inRoom = false; isHost = false;
        roomId = null;
        latency = 0; latencySamples = [];
        restoreHostSettings();
        if($('mpRoomHud')) $('mpRoomHud').style.display = 'none';
        if($('mpChatToggle')) $('mpChatToggle').style.display = 'none';
        if($('mpChatPanel')) $('mpChatPanel').classList.remove('on');
        if($('mpLeaveBtn')) $('mpLeaveBtn').style.display = 'none';
        if($('mpSwitchCarBtn')) $('mpSwitchCarBtn').style.display = 'none';
        if($('mpRoomSettingsBtn')) $('mpRoomSettingsBtn').style.display = 'none';
        if($('mpRoomSettingsPanel')) $('mpRoomSettingsPanel').classList.remove('on');
        unreadChat = 0; updateChatBadge();
        chatLog = [];
        if(showHome !== false && typeof resetToHome === 'function') resetToHome();
        if(wasHost) toast('🏠 房间已关闭');
    }

    // ---------- 每帧 tick ----------
    function tick(dt){
        if(!inRoom || !peerReady) return;

        if(settings.speedLimit > 0 && typeof carSpeed !== 'undefined'){
            var maxMS = settings.speedLimit / 3.6;
            if(carSpeed > maxMS) carSpeed = maxMS;
        }

        pingTimer += dt;
        if(pingTimer >= 2){ pingTimer = 0; doPing(); }

        _hudRefreshTimer += dt;
        if(_hudRefreshTimer >= 0.5){ _hudRefreshTimer = 0; updateRoomHud(); }

        syncTimer += dt;
        if(syncTimer < SYNC_INTERVAL) return;
        syncTimer = 0;

        var x = (typeof carLocalX !== 'undefined') ? carLocalX : 0;
        var z = (typeof playerCar !== 'undefined' && playerCar && playerCar.position) ? playerCar.position.z : 0;
        var h = (typeof carHeading !== 'undefined') ? carHeading : 0;
        var y = (typeof carY !== 'undefined') ? carY : 0;
        var v = (typeof currentVehicleType !== 'undefined') ? currentVehicleType : 'sedan';
        var msg = { t:'state', id: isHost ? 'host' : 'me', x:x, z:z, h:h, y:y, v:v, n: myName };

        if(isHost) broadcast(msg);
        else sendToHost(msg);
    }

    function updateMyVehicle(type){
        if(!inRoom) return;
        if(isHost) broadcast({ t:'changeVehicle', id: 'host', v: type, n: myName });
        else sendToHost({ t:'changeVehicle', v: type, n: myName });
    }

    function checkRemoteCollision(){
        if(!settings.collisionEnabled) return null;
        if(!inRoom) return null;
        if(typeof playerCar === 'undefined' || !playerCar || !playerCar.position) return null;
        var myZ = playerCar.position.z;
        var myX = (typeof carLocalX !== 'undefined') ? carLocalX : 0;
        var myHalfW = (typeof playerVehicle !== 'undefined' && playerVehicle) ? playerVehicle.width/2 : 1;
        var myHalfL = (typeof playerVehicle !== 'undefined' && playerVehicle) ? playerVehicle.length/2 : 2;
        for(var k in remoteCars){
            var rc = remoteCars[k];
            if(Math.abs(rc.z - myZ) < myHalfL*2 && Math.abs(rc.x - myX) < myHalfW*2) return { id: k, z: rc.z, x: rc.x };
        }
        return null;
    }

    function onGameStart(){
        if($('mpSwitchCarBtn')) $('mpSwitchCarBtn').style.display = inRoom ? 'flex' : 'none';
        if($('mpChatToggle')) $('mpChatToggle').style.display = inRoom ? 'flex' : 'none';
        if($('mpLeaveBtn')) $('mpLeaveBtn').style.display = inRoom ? 'block' : 'none';
        if($('mpRoomSettingsBtn')) $('mpRoomSettingsBtn').style.display = (inRoom && isHost) ? 'block' : 'none';
        updateRoomHud();
    }

    function openSwitchCarPanel(){
        if(!inRoom){ toast('❌ 不在房间内'); return; }
        showOnlineScreen(null);
        if($('gameContainer')) $('gameContainer').classList.remove('on');
        if(typeof gamePaused !== 'undefined') gamePaused = true;
        if($('vehicleSelect')){
            $('vehicleSelect').style.display = 'flex';
            if(typeof initPreview === 'function'){ try{ initPreview(); }catch(e){} }
            if(typeof buildVehicleList === 'function'){ try{ buildVehicleList(); }catch(e){} }
            if(typeof selectVehicle === 'function' && typeof currentVehicleType !== 'undefined'){
                try{ selectVehicle(currentVehicleType); }catch(e){}
            }
        }
    }

    // ---------- 初始化 ----------
    function init(){
        ensureLoadingDom();

        var ob = $('onlineBtn');
        if(ob) ob.addEventListener('click', function(){
            if(typeof unlockAudio === 'function') unlockAudio();
            showOnlineScreen('onlineScreen');
        });
        var backBtn = $('onlineBackBtn');
        if(backBtn) backBtn.addEventListener('click', function(){
            showOnlineScreen('startScreen');
            if(typeof playMenuMusic === 'function') playMenuMusic();
        });
        var crBtn = $('createRoomBtn');
        if(crBtn) crBtn.addEventListener('click', function(){
            if($('createRoomPanel')) $('createRoomPanel').style.display = 'block';
            if($('joinRoomPanel')) $('joinRoomPanel').style.display = 'none';
        });
        var jrBtn = $('joinRoomBtn');
        if(jrBtn) jrBtn.addEventListener('click', function(){
            if($('joinRoomPanel')) $('joinRoomPanel').style.display = 'block';
            if($('createRoomPanel')) $('createRoomPanel').style.display = 'none';
        });
        var ccBtn = $('confirmCreateRoom');
        if(ccBtn) ccBtn.addEventListener('click', function(){
            var n = $('mpNameInput') ? $('mpNameInput').value.trim() : '';
            if(!n) n = '房主';
            var rId = $('mpRoomIdInput') ? $('mpRoomIdInput').value.trim() : '';
            if(!rId) rId = genRoomId();
            if(!/^\d{3,8}$/.test(rId)){ toast('房间号需 3-8 位数字'); return; }
            var sc = $('mpSceneSel') ? $('mpSceneSel').value : 'highway';
            var sl = $('mpSpeedLimit') ? Number($('mpSpeedLimit').value) : 0;
            var npc = $('mpNpcCheck') ? $('mpNpcCheck').checked : true;
            var col = $('mpCollisionCheck') ? $('mpCollisionCheck').checked : true;
            createRoom({ roomId: rId, name: n, scene: sc, speedLimit: sl, npcEnabled: npc, collisionEnabled: col });
        });
        var cjBtn = $('confirmJoinRoom');
        if(cjBtn) cjBtn.addEventListener('click', function(){
            var n = $('mpNameInput2') ? $('mpNameInput2').value.trim() : '';
            if(!n) n = '玩家';
            var rId = $('mpJoinRoomInput') ? $('mpJoinRoomInput').value.trim() : '';
            if(!rId){ toast('请输入房间号'); return; }
            joinRoom(rId, n);
        });
        var leaveBtn = $('mpLeaveBtn');
        if(leaveBtn) leaveBtn.addEventListener('click', function(){
            var msg = isHost
                ? '确定退出房间吗？\n（你是房主，退出后房间将关闭，所有玩家会被踢出）'
                : '确定退出房间吗？';
            if(confirm(msg)){ if(isHost) toast('🏠 房间已关闭'); leaveRoom(true); }
        });
        var swBtn = $('mpSwitchCarBtn');
        if(swBtn) swBtn.addEventListener('click', function(){ openSwitchCarPanel(); });

        // 游戏内房主房间设置
        var rsBtn = $('mpRoomSettingsBtn');
        if(rsBtn){
            rsBtn.addEventListener('click', function(){
                if(!isHost || !inRoom) return;
                if($('mpSceneSel2')) $('mpSceneSel2').value = settings.scene;
                if($('mpSpeedLimit2')){
                    $('mpSpeedLimit2').value = settings.speedLimit;
                    if($('mpSpeedLimitVal2')) $('mpSpeedLimitVal2').textContent = settings.speedLimit > 0 ? (settings.speedLimit + ' km/h') : '不限速';
                }
                if($('mpNpcCheck2')) $('mpNpcCheck2').checked = settings.npcEnabled;
                if($('mpCollisionCheck2')) $('mpCollisionCheck2').checked = settings.collisionEnabled;
                if($('mpRoomSettingsPanel')) $('mpRoomSettingsPanel').classList.add('on');
            });
        }
        var rsClose = $('mpSetClose');
        if(rsClose) rsClose.addEventListener('click', function(){ if($('mpRoomSettingsPanel')) $('mpRoomSettingsPanel').classList.remove('on'); });

        var s2 = $('mpSceneSel2');
        if(s2) s2.addEventListener('change', function(){
            if(!isHost || !inRoom) return;
            settings.scene = s2.value;
            broadcast({ t:'settings', settings: settings });
            applyHostSettings();
            if(typeof showToast === 'function') showToast('⚙ 场景已切换');
        });
        var sl2 = $('mpSpeedLimit2');
        if(sl2){
            sl2.addEventListener('input', function(){
                var v = Number(sl2.value);
                if($('mpSpeedLimitVal2')) $('mpSpeedLimitVal2').textContent = v > 0 ? (v + ' km/h') : '不限速';
            });
            sl2.addEventListener('change', function(){
                if(!isHost || !inRoom) return;
                settings.speedLimit = Number(sl2.value);
                broadcast({ t:'settings', settings: settings });
                applyHostSettings();
                if(typeof showToast === 'function') showToast('⚙ 限速已更新');
            });
        }
        var npc2 = $('mpNpcCheck2');
        if(npc2) npc2.addEventListener('change', function(){
            if(!isHost || !inRoom) return;
            settings.npcEnabled = npc2.checked;
            broadcast({ t:'settings', settings: settings });
            applyHostSettings();
            if(typeof showToast === 'function') showToast(npc2.checked ? '⚙ 已启用 NPC' : '⚙ 已关闭 NPC');
        });
        var col2 = $('mpCollisionCheck2');
        if(col2) col2.addEventListener('change', function(){
            if(!isHost || !inRoom) return;
            settings.collisionEnabled = col2.checked;
            broadcast({ t:'settings', settings: settings });
            applyHostSettings();
            if(typeof showToast === 'function') showToast(col2.checked ? '⚙ 已开启碰撞' : '⚙ 已关闭碰撞');
        });

        // 房子按钮拦截
        var homeBtn = $('homeBtn');
        if(homeBtn) homeBtn.addEventListener('click', function(ev){
            if(!inRoom) return;
            ev.stopImmediatePropagation(); ev.preventDefault();
            var msg = isHost ? '你正在联机房间中（房主）\n退出后房间将关闭\n\n确定退出房间吗？' : '你正在联机房间中\n退出后当前游戏将回到主界面\n\n确定退出房间吗？';
            if(confirm(msg)){ if(isHost) toast('🏠 房间已关闭'); leaveRoom(true); }
        }, true);
        var bthb = $('backToHomeBtn');
        if(bthb) bthb.addEventListener('click', function(ev){
            if(!inRoom) return;
            ev.stopImmediatePropagation(); ev.preventDefault();
            var msg = isHost ? '你正在联机房间中（房主）\n退出后房间将关闭\n\n确定退出吗？' : '你正在联机房间中\n确定退出到主界面吗？';
            if(confirm(msg)){
                var sp = $('settingsPanel'); if(sp) sp.classList.remove('on');
                var po = $('pauseOverlay'); if(po) po.classList.remove('on');
                if(typeof gamePaused !== 'undefined') gamePaused = false;
                if(isHost) toast('🏠 房间已关闭');
                leaveRoom(true);
            }
        }, true);

        // 换车面板：返回 → 重建自己车
        var mpBack = $('backToStart');
        if(mpBack) mpBack.addEventListener('click', function(ev){
            if(inRoom && typeof gameStarted !== 'undefined' && gameStarted && $('gameContainer') && !$('gameContainer').classList.contains('on')){
                ev.stopImmediatePropagation(); ev.preventDefault();
                rebuildMyCarKeepState();
                updateMyVehicle((typeof currentVehicleType !== 'undefined') ? currentVehicleType : 'sedan');
                $('vehicleSelect').style.display = 'none';
                $('gameContainer').classList.add('on');
                if(typeof gamePaused !== 'undefined') gamePaused = false;
            }
        }, true);

        // 换车面板：出发 → 重建自己车
        var cv = $('confirmVehicle');
        if(cv) cv.addEventListener('click', function(ev){
            if(inRoom && typeof gameStarted !== 'undefined' && gameStarted && $('gameContainer') && !$('gameContainer').classList.contains('on')){
                ev.stopImmediatePropagation(); ev.preventDefault();
                rebuildMyCarKeepState();
                updateMyVehicle((typeof currentVehicleType !== 'undefined') ? currentVehicleType : 'sedan');
                $('vehicleSelect').style.display = 'none';
                $('gameContainer').classList.add('on');
                if(typeof gamePaused !== 'undefined') gamePaused = false;
            }
        }, true);

        // 聊天
        var chatToggle = $('mpChatToggle');
        if(chatToggle) chatToggle.addEventListener('click', function(){
            var p = $('mpChatPanel'); if(!p) return;
            p.classList.toggle('on');
            if(p.classList.contains('on')){
                unreadChat = 0; updateChatBadge();
                setTimeout(function(){ var i = $('mpChatInput'); if(i) i.focus(); }, 120);
            }
        });
        var chatSend = $('mpChatSend');
        if(chatSend) chatSend.addEventListener('click', function(){
            var inp = $('mpChatInput'); if(!inp) return;
            var t = inp.value.trim(); if(!t) return;
            sendChat(t); inp.value = '';
        });
        var chatInput = $('mpChatInput');
        if(chatInput) chatInput.addEventListener('keydown', function(e){
            if(e.key === 'Enter'){ e.preventDefault(); var s = $('mpChatSend'); if(s) s.click(); }
        });

        // 创建面板设置项
        ['mpSceneSel','mpSpeedLimit','mpNpcCheck','mpCollisionCheck'].forEach(function(id){
            var el = $(id);
            if(!el) return;
            el.addEventListener('change', function(){
                if(!isHost || !inRoom) return;
                settings.scene = $('mpSceneSel') ? $('mpSceneSel').value : settings.scene;
                settings.speedLimit = $('mpSpeedLimit') ? Number($('mpSpeedLimit').value) : settings.speedLimit;
                settings.npcEnabled = $('mpNpcCheck') ? $('mpNpcCheck').checked : settings.npcEnabled;
                settings.collisionEnabled = $('mpCollisionCheck') ? $('mpCollisionCheck').checked : settings.collisionEnabled;
                broadcast({ t:'settings', settings: settings });
                applyHostSettings();
            });
        });
        var sp = $('mpSpeedLimit');
        if(sp) sp.addEventListener('input', function(){
            var v = Number(sp.value);
            var valEl = $('mpSpeedLimitVal');
            if(valEl) valEl.textContent = v > 0 ? (v + ' km/h') : '不限速';
        });
    }

    return {
        init: init,
        tick: tick,
        leaveRoom: leaveRoom,
        onGameStart: onGameStart,
        updateMyVehicle: updateMyVehicle,
        isInRoom: function(){ return inRoom; },
        isHost: function(){ return isHost; },
        getRoomId: function(){ return roomId; },
        getSettings: function(){ return settings; },
        getVersion: function(){ return MP_VERSION; },
        checkRemoteCollision: checkRemoteCollision
    };
})();