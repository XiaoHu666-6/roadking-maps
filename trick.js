'use strict';

// ============ 桶滚特技（独立系统，自己驱动旋转） ============
window.TRICK = (function(){
    var active = false;
    var startTime = 0;
    var duration = 1200;   // 毫秒，一圈 1.2 秒

    function trigger(){
        // 只在空中且未激活时可触发
        if(typeof isAirborne === 'undefined' || !isAirborne){
            if(typeof showToast === 'function') showToast('✈️ 空中才能桶滚！');
            return;
        }
        if(active) return;
        active = true;
        startTime = performance.now();
        if(typeof showToast === 'function') showToast('🔄 桶滚特技！');
        var sb = document.getElementById('spinBtn');
        if(sb) sb.classList.add('on');
        if(typeof playCrash === 'function') playCrash(0.4);
    }

    // 每帧由 main.js 的 animate 调用，让车辆绕纵轴旋转
    function tick(){
        if(!active || !playerCar) return;
        var t = (performance.now() - startTime) / duration;
        if(t >= 1){
            active = false;
            playerCar.rotation.z = 0;
            var sb = document.getElementById('spinBtn');
            if(sb) sb.classList.remove('on');
            return;
        }
        playerCar.rotation.z = t * Math.PI * 2;
    }

    function reset(){
        active = false;
        startTime = 0;
        if(typeof playerCar !== 'undefined' && playerCar) playerCar.rotation.z = 0;
        var sb = document.getElementById('spinBtn');
        if(sb) sb.classList.remove('on');
    }

    return {
        trigger: trigger,
        tick: tick,
        reset: reset,
        isActive: function(){ return active; }
    };
})();