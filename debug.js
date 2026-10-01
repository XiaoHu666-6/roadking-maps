'use strict';
// ============ 全局调试面板 v6 ============
// 总开关（debugEnabled）· 面板展开/折叠（panelExpanded）· 拖动 · 可滑动 · 可选中
(function(){
    var MAX_OK = 80;
    var MAX_ERR = 80;
    var okLogs = [];
    var errLogs = [];

    var debugEnabled = true;    // ★ 总开关（设置里的 checkbox 控制）
    var panelExpanded = true;   // ★ 面板展开/折叠（面板上的 ✖ / 🐛 控制）

    var STORAGE_ENABLED = 'pkw_debug_enabled';
    var STORAGE_EXPANDED = 'pkw_debug_expanded';
    var STORAGE_POS = 'pkw_debug_pos';

    var posX = 6, posY = 6;

    // ---------- 读取存储 ----------
    try{
        var se = localStorage.getItem(STORAGE_ENABLED);
        if(se === '0') debugEnabled = false;
        else if(se === '1') debugEnabled = true;

        var sx = localStorage.getItem(STORAGE_EXPANDED);
        if(sx === '0') panelExpanded = false;
        else if(sx === '1') panelExpanded = true;

        var p = localStorage.getItem(STORAGE_POS);
        if(p){
            var pp = JSON.parse(p);
            if(typeof pp.x === 'number') posX = pp.x;
            if(typeof pp.y === 'number') posY = pp.y;
        }
    }catch(e){}

    function saveEnabled(){ try{ localStorage.setItem(STORAGE_ENABLED, debugEnabled ? '1' : '0'); }catch(e){} }
    function saveExpanded(){ try{ localStorage.setItem(STORAGE_EXPANDED, panelExpanded ? '1' : '0'); }catch(e){} }
    function savePos(){ try{ localStorage.setItem(STORAGE_POS, JSON.stringify({x:posX, y:posY})); }catch(e){} }

    // ---------- 创建 DOM ----------
    function ensureDom(){
        if(document.getElementById('debugRoot')) return;

        // 主面板
        var root = document.createElement('div');
        root.id = 'debugRoot';
        root.style.cssText = 'position:fixed;z-index:2147483647;' +
            'width:min(92vw,420px);max-height:46vh;' +
            'background:rgba(0,0,0,.9);border:2px solid #44ff88;' +
            'border-radius:10px;padding:0;' +
            'font-family:monospace;font-size:11px;line-height:1.5;' +
            'box-shadow:0 6px 24px rgba(0,0,0,.9);' +
            'display:none;flex-direction:column;overflow:hidden;' +
            'box-sizing:border-box;' +
            'left:' + posX + 'px;top:' + posY + 'px;';
        document.body.appendChild(root);

        // 标题栏（可拖动）
        var head = document.createElement('div');
        head.id = 'debugHead';
        head.style.cssText = 'display:flex;align-items:center;gap:6px;' +
            'padding:8px 10px;' +
            'background:linear-gradient(90deg,rgba(68,255,136,.3),rgba(0,0,0,0));' +
            'border-bottom:1px solid rgba(68,255,136,.3);flex-shrink:0;' +
            'cursor:move;user-select:none;touch-action:none;';
        head.innerHTML = '<span style="color:#ffffff;font-weight:bold;font-size:12px;flex:1;pointer-events:none">🐛 调试</span>';
        root.appendChild(head);

        var expBtn = document.createElement('button');
        expBtn.textContent = '📤';
        expBtn.style.cssText = btnStyle('rgba(100,180,255,.3)','rgba(100,180,255,.6)','#88ccff');
        expBtn.addEventListener('click', function(e){ e.stopPropagation(); exportLogs(); });
        head.appendChild(expBtn);

        var clearBtn = document.createElement('button');
        clearBtn.textContent = '🗑';
        clearBtn.style.cssText = btnStyle('rgba(255,180,60,.3)','rgba(255,180,60,.6)','#ffcc44');
        clearBtn.addEventListener('click', function(e){ e.stopPropagation(); okLogs=[]; errLogs=[]; render(); });
        head.appendChild(clearBtn);

        var miniBtn = document.createElement('button');
        miniBtn.textContent = '—';
        miniBtn.style.cssText = btnStyle('rgba(255,60,60,.3)','rgba(255,100,100,.6)','#ff8888');
        miniBtn.addEventListener('click', function(e){
            e.stopPropagation();
            panelExpanded = false;   // ★ 只是折叠，不关闭总开关
            saveExpanded(); render();
        });
        head.appendChild(miniBtn);

        // 内容区
        var body = document.createElement('div');
        body.id = 'debugBody';
        body.style.cssText = 'flex:1;overflow-y:auto;padding:6px 8px;' +
            '-webkit-overflow-scrolling:touch;' +
            'touch-action:pan-y;' +
            'overscroll-behavior:contain;' +
            'user-select:text;-webkit-user-select:text;' +
            'box-sizing:border-box;';
        root.appendChild(body);

        // 悬浮球
        var mini = document.createElement('button');
        mini.id = 'debugMini';
        mini.textContent = '🐛';
        mini.style.cssText = 'position:fixed;z-index:2147483647;' +
            'width:44px;height:44px;border-radius:50%;' +
            'background:rgba(0,0,0,.85);border:2px solid #44ff88;' +
            'color:#44ff88;font-size:20px;cursor:move;' +
            'display:none;align-items:center;justify-content:center;' +
            'padding:0;outline:none;line-height:1;' +
            'touch-action:none;user-select:none;' +
            'left:' + posX + 'px;top:' + posY + 'px;';
        mini.addEventListener('click', function(e){
            if(mini._dragged) return;
            panelExpanded = true;    // ★ 展开面板
            saveExpanded(); render();
        });
        document.body.appendChild(mini);

        makeDraggable(head, root, false);
        makeDraggable(mini, null, true);
    }

    function btnStyle(bg, br, color){
        return 'width:30px;height:30px;border-radius:6px;' +
               'background:'+bg+';border:1px solid '+br+';' +
               'color:'+color+';font-size:14px;cursor:pointer;' +
               'padding:0;outline:none;touch-action:none;';
    }

    function makeDraggable(dragEl, targetEl, isMini){
        var sx=0, sy=0, ox=0, oy=0, dragging=false, moved=false;
        function start(e){
            if(e.target.closest && e.target.closest('button') && e.target !== dragEl) return;
            dragging = true; moved = false;
            var t = e.touches ? e.touches[0] : e;
            sx = t.clientX; sy = t.clientY;
            ox = posX; oy = posY;
            if(isMini) dragEl._dragged = false;
        }
        function move(e){
            if(!dragging) return;
            e.preventDefault();
            var t = e.touches ? e.touches[0] : e;
            var dx = t.clientX - sx, dy = t.clientY - sy;
            if(Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
            posX = Math.max(0, Math.min(window.innerWidth - 60, ox + dx));
            posY = Math.max(0, Math.min(window.innerHeight - 60, oy + dy));
            applyPos();
        }
        function end(){
            if(!dragging) return;
            dragging = false;
            if(moved){ savePos(); if(isMini) dragEl._dragged = true; }
        }
        dragEl.addEventListener('touchstart', start, {passive:false});
        dragEl.addEventListener('touchmove', move, {passive:false});
        dragEl.addEventListener('touchend', end);
        dragEl.addEventListener('touchcancel', end);
        dragEl.addEventListener('mousedown', start);
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', end);
    }

    function applyPos(){
        var root = document.getElementById('debugRoot');
        var mini = document.getElementById('debugMini');
        if(root){ root.style.left = posX + 'px'; root.style.top = posY + 'px'; }
        if(mini){ mini.style.left = posX + 'px'; mini.style.top = posY + 'px'; }
    }

    function esc(s){
        return String(s).replace(/[&<>"']/g, function(c){
            return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
        });
    }
    function ts(){
        var t = new Date();
        return ('0'+t.getHours()).slice(-2) + ':' +
               ('0'+t.getMinutes()).slice(-2) + ':' +
               ('0'+t.getSeconds()).slice(-2);
    }

    // ---------- 渲染 ----------
    function render(){
        var root = document.getElementById('debugRoot');
        var mini = document.getElementById('debugMini');
        var body = document.getElementById('debugBody');
        if(!root || !body) return;

        // ★ 总开关关闭 → 面板和悬浮球都隐藏
        if(!debugEnabled){
            root.style.display = 'none';
            if(mini) mini.style.display = 'none';
            return;
        }

        // ★ 总开关开启
        if(!panelExpanded){
            root.style.display = 'none';
            if(mini) mini.style.display = 'flex';
            return;
        }

        // ★ 面板展开
        root.style.display = 'flex';
        if(mini) mini.style.display = 'none';

        var html = '';
        html += '<div style="color:#44ff88;font-weight:bold;font-size:12px;' +
                'margin:4px 0;padding:4px 0;border-bottom:1px solid rgba(68,255,136,.4)">' +
                '✅ 成功 (' + okLogs.length + ')</div>';
        if(okLogs.length === 0){
            html += '<div style="color:#666;padding:2px 0;font-size:10px">— 暂无 —</div>';
        } else {
            var s1 = Math.max(0, okLogs.length - 30);
            for(var i = s1; i < okLogs.length; i++){
                html += '<div style="color:#88ffaa;padding:2px 0;font-size:10px;' +
                        'word-break:break-all;user-select:text;-webkit-user-select:text;' +
                        'white-space:pre-wrap;">' +
                        okLogs[i].ts + ' ' + esc(okLogs[i].text) + '</div>';
            }
        }

        html += '<div style="color:#ff5555;font-weight:bold;font-size:12px;' +
                'margin:10px 0 4px 0;padding:4px 0;border-bottom:1px solid rgba(255,85,85,.4)">' +
                '❌ 失败 (' + errLogs.length + ')</div>';
        if(errLogs.length === 0){
            html += '<div style="color:#666;padding:2px 0;font-size:10px">— 暂无 —</div>';
        } else {
            var s2 = Math.max(0, errLogs.length - 30);
            for(var j = s2; j < errLogs.length; j++){
                html += '<div style="color:#ff8888;padding:2px 0;font-size:10px;' +
                        'word-break:break-all;user-select:text;-webkit-user-select:text;' +
                        'white-space:pre-wrap;">' +
                        errLogs[j].ts + ' ' + esc(errLogs[j].text) + '</div>';
            }
        }

        body.innerHTML = html;
    }

    function pushOk(text){
        okLogs.push({ text: text, ts: ts() });
        if(okLogs.length > MAX_OK) okLogs.shift();
        render();
    }
    function pushErr(text){
        errLogs.push({ text: text, ts: ts() });
        if(errLogs.length > MAX_ERR) errLogs.shift();
        render();
    }

    function buildExportText(){
        var lines = [];
        lines.push('========= 公路之王 调试日志 =========');
        lines.push('导出时间: ' + new Date().toLocaleString());
        lines.push('UA: ' + navigator.userAgent);
        lines.push('');
        lines.push('---------- ✅ 成功 (' + okLogs.length + ') ----------');
        for(var i=0;i<okLogs.length;i++) lines.push('[' + okLogs[i].ts + '] ' + okLogs[i].text);
        lines.push('');
        lines.push('---------- ❌ 失败 (' + errLogs.length + ') ----------');
        for(var j=0;j<errLogs.length;j++) lines.push('[' + errLogs[j].ts + '] ' + errLogs[j].text);
        lines.push('');
        lines.push('========= 日志结束 =========');
        return lines.join('\n');
    }

    function exportLogs(){
        var text = buildExportText();
        try{
            if(navigator.clipboard && navigator.clipboard.writeText){
                navigator.clipboard.writeText(text).then(function(){
                    if(window.showToast) showToast('📋 日志已复制到剪贴板');
                    else alert('日志已复制到剪贴板');
                }).catch(function(){ fallbackExport(text); });
                return;
            }
        }catch(e){}
        fallbackExport(text);
    }

    function fallbackExport(text){
        try{
            var modal = document.createElement('div');
            modal.style.cssText = 'position:fixed;inset:0;z-index:2147483647;' +
                'background:rgba(0,0,0,.85);display:flex;align-items:center;' +
                'justify-content:center;padding:20px;box-sizing:border-box;touch-action:pan-y;';
            var box = document.createElement('div');
            box.style.cssText = 'width:min(90vw,560px);max-height:80vh;' +
                'background:#0a0f1a;border:2px solid #44ff88;border-radius:10px;' +
                'padding:14px;display:flex;flex-direction:column;gap:10px;box-sizing:border-box;';
            var title = document.createElement('div');
            title.textContent = '📤 调试日志（长按复制）';
            title.style.cssText = 'color:#44ff88;font-weight:bold;font-size:14px;';
            box.appendChild(title);
            var ta = document.createElement('textarea');
            ta.value = text; ta.readOnly = true;
            ta.style.cssText = 'flex:1;min-height:220px;background:#000;color:#44ff88;' +
                'border:1px solid rgba(68,255,136,.3);border-radius:6px;padding:8px;' +
                'font-family:monospace;font-size:11px;resize:none;outline:none;' +
                '-webkit-user-select:text;user-select:text;box-sizing:border-box;' +
                'touch-action:pan-y;';
            box.appendChild(ta);
            var closeBtn = document.createElement('button');
            closeBtn.textContent = '关闭';
            closeBtn.style.cssText = 'padding:10px;border-radius:6px;border:none;' +
                'background:linear-gradient(135deg,#22cc88,#008855);color:#fff;' +
                'font-size:13px;font-weight:bold;cursor:pointer;';
            closeBtn.addEventListener('click', function(){ document.body.removeChild(modal); });
            box.appendChild(closeBtn);
            modal.appendChild(box);
            document.body.appendChild(modal);
            setTimeout(function(){ ta.focus(); ta.select(); }, 100);
        }catch(e){ alert('导出失败: ' + e.message); }
    }

    // ---------- 拦截 console ----------
    var orig = {};
    ['log','warn','error','info'].forEach(function(lv){
        orig[lv] = console[lv];
        console[lv] = function(){
            try{ orig[lv].apply(console, arguments); }catch(e){}
            var text = '';
            for(var i=0;i<arguments.length;i++){
                try{
                    if(arguments[i] instanceof Error) text += arguments[i].message;
                    else if(typeof arguments[i] === 'object') text += JSON.stringify(arguments[i]);
                    else text += String(arguments[i]);
                }catch(e){ text += '[obj]'; }
                if(i < arguments.length-1) text += ' ';
            }
            if(lv === 'error') pushErr(text);
            else if(lv === 'warn') pushErr('⚠ ' + text);
            else pushOk(text);
        };
    });

    window.addEventListener('error', function(e){
    var fn = e.filename ? e.filename.split('/').pop() : '?';
    var stack = '';
    if(e.error && e.error.stack){
        // 只取前 3 行堆栈
        var lines = e.error.stack.split('\n');
        for(var i = 0; i < Math.min(3, lines.length); i++){
            stack += '\n' + lines[i].trim();
        }
    }
    pushErr('JS错误: ' + (e.message || '') + ' @' + fn + ':' + (e.lineno || 0) + stack);
});
    window.addEventListener('unhandledrejection', function(e){
        var m = e.reason && e.reason.message ? e.reason.message : String(e.reason);
        pushErr('Promise: ' + m);
    });

    // ---------- 对外接口 ----------
    var _onStateChange = null;
    function notifyStateChange(){
        if(typeof _onStateChange === 'function'){
            try{ _onStateChange(debugEnabled); }catch(e){}
        }
    }

    window.DEBUG = {
        ok: pushOk,
        err: pushErr,
        // ★ 总开关
        enable: function(){
            debugEnabled = true; saveEnabled();
            if(!panelExpanded) panelExpanded = true;   // 打开时自动展开
            saveExpanded();
            render(); notifyStateChange();
        },
        disable: function(){
            debugEnabled = false; saveEnabled();
            render(); notifyStateChange();
        },
        toggle: function(){
            if(debugEnabled) this.disable(); else this.enable();
        },
        isEnabled: function(){ return debugEnabled; },

        // 面板展开/折叠（面板上的 ✖ / 🐛）
        expand: function(){ panelExpanded = true; saveExpanded(); render(); },
        collapse: function(){ panelExpanded = false; saveExpanded(); render(); },

        clear: function(){ okLogs = []; errLogs = []; render(); },
        export: exportLogs,
        onStateChange: function(cb){ _onStateChange = cb; if(cb) cb(debugEnabled); }
    };

    // ---------- 初始化 ----------
    function init(){
        ensureDom();
        render();
        pushOk('debug.js 加载成功');
        pushOk('上次状态: ' + (debugEnabled ? (panelExpanded ? '展开' : '折叠') : '关闭'));
        notifyStateChange();
    }
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
    setTimeout(function(){
        if(!document.getElementById('debugRoot')){
            ensureDom();
            pushOk('延迟初始化成功');
            render();
        }
    }, 500);
})();