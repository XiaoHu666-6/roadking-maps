'use strict';
// ============ 手刹 180° 掉头（升起-旋转-落下） ============
(function(){
    var TRIGGER_KMH = 100;
    var HOLD_MS = 200;
    var DURATION_UP = 0.25;      // 升起时长
    var DURATION_ROTATE = 0.6;   // 旋转时长
    var DURATION_DOWN = 0.35;    // 落下时长
    var FLY_HEIGHT = 0.9;        // 悬浮高度（米）

    var _active = false;
    var _timer = 0;
    var _startHeading = 0;
    var _lockHeading = 0;
    var _reversed = false;
    var _holdTimer = null;
    var _pressed = false;

    function isReversing(){ return _reversed; }
    function isActive(){ return _active; }
    function getLockHeading(){ return _active ? _lockHeading : null; }

    function canTrigger(){
        if(typeof gameStarted === 'undefined' || !gameStarted) return false;
        if(typeof gamePaused !== 'undefined' && gamePaused) return false;
        if(typeof isAirborne !== 'undefined' && isAirborne) return false;
        if(_active) return false;
        if(typeof carSpeed === 'undefined') return false;
        if(Math.abs(carSpeed) * 3.6 < TRIGGER_KMH) return false;
        return true;
    }

    function trigger(){
        if(_active) return;
        _active = true;
        _timer = 0;
        _startHeading = carHeading;
        _lockHeading = carHeading;

        // 档位切换
        if(typeof gearText !== 'undefined' && typeof selectGear === 'function'){
            if(gearText === 'R'){ selectGear('D'); _reversed = false; }
            else { selectGear('R'); _reversed = true; }
        }

        if(typeof playCrash === 'function') playCrash(1.2);
        if(typeof triggerHitFlash === 'function') triggerHitFlash(false);
        if(typeof showToast === 'function') showToast('🔄 悬浮掉头！');
        if(typeof console !== 'undefined') console.log('🔄 悬浮掉头 @ ' + Math.round(Math.abs(carSpeed)*3.6) + ' km/h');
    }

    function update(dt){
        if(!_active) return;
        _timer += dt;
        var t = _timer;
        var tUpEnd = DURATION_UP;
        var tRotateEnd = DURATION_UP + DURATION_ROTATE;
        var tTotal = tRotateEnd + DURATION_DOWN;

        if(t < tUpEnd){
            // ===== 阶段 1：升起（车头不动）=====
            var p = t / DURATION_UP;
            if(typeof carY !== 'undefined') carY = FLY_HEIGHT * p;
            carHeading = _startHeading;
        } else if(t < tRotateEnd){
            // ===== 阶段 2：旋转（高度保持）=====
            if(typeof carY !== 'undefined') carY = FLY_HEIGHT;
            var p2 = (t - tUpEnd) / DURATION_ROTATE;
            // smoothstep 缓动
            var et = p2 * p2 * (3 - 2 * p2);
            carHeading = _startHeading + Math.PI * et;
        } else if(t < tTotal){
            // ===== 阶段 3：落下（车头已对准反向）=====
            if(typeof carY !== 'undefined') carY = FLY_HEIGHT * (1 - (t - tRotateEnd) / DURATION_DOWN);
            carHeading = _startHeading + Math.PI;
        } else {
            // ===== 完成 =====
            _active = false;
            if(typeof carY !== 'undefined') carY = 0;
            carHeading = _startHeading + Math.PI;
            while(carHeading > Math.PI) carHeading -= 2 * Math.PI;
            while(carHeading < -Math.PI) carHeading += 2 * Math.PI;
            // 速度符号翻转（大小不变）
            if(typeof carSpeed !== 'undefined' && carSpeed !== 0){
                carSpeed = -carSpeed;
            }
            if(typeof isDrifting !== 'undefined') isDrifting = false;
        }
    }

    function init(){
        var btn = document.getElementById('handbrakeBtn');
        if(!btn) return;

        function onDown(e){
            if(!canTrigger()) return;
            e.stopImmediatePropagation();
            e.preventDefault();
            _pressed = true;
            _holdTimer = setTimeout(function(){
                _holdTimer = null;
                if(_pressed) trigger();
            }, HOLD_MS);
        }
        function onUp(e){
            _pressed = false;
            if(_holdTimer){
                clearTimeout(_holdTimer);
                _holdTimer = null;
                try{ e.stopImmediatePropagation(); e.preventDefault(); }catch(_){}
            }
        }

        btn.addEventListener('touchstart', onDown, true);
        btn.addEventListener('touchend', onUp, true);
        btn.addEventListener('touchcancel', onUp);
        btn.addEventListener('mousedown', onDown, true);
        btn.addEventListener('mouseup', onUp, true);
    }

    window.HANDBRAKE180 = {
        init: init,
        update: update,
        isReversing: isReversing,
        isActive: isActive,
        canTrigger: canTrigger,
        getLockHeading: getLockHeading
    };
})();