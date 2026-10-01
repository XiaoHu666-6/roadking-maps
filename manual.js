'use strict';

// ============ 手动档模式 ============
window.MANUAL = (function(){
    var enabled = false;
    var overRevDecel = 0;   // 过度降档时的强制减速强度

    function isOn(){ return enabled; }

    function toggle(){
        enabled = !enabled;
        var btn = document.getElementById('mToggle');
        if(btn){
            btn.textContent = enabled ? 'M' : 'A';
            btn.classList.toggle('on', enabled);
        }
        if(typeof showToast === 'function') showToast(enabled ? '🕹 手动档模式' : '🤖 自动档模式');
    }

    function upShift(){
        if(!enabled) return;
        if(typeof gearText === 'undefined' || gearText !== 'D') return;
        if(typeof isShifting === 'undefined' || isShifting) return;
        var V = playerVehicle;
        if(currentGearIdx < V.gears - 1){
            currentGearIdx++;
            isShifting = true;
            shiftTimer = 0.25;
            if(typeof playShiftSound === 'function') playShiftSound(true);
        }
    }

    function downShift(){
    if(!enabled) return;
    if(typeof gearText === 'undefined' || gearText !== 'D') return;
    if(typeof isShifting === 'undefined' || isShifting) return;
    var V = playerVehicle;
    if(currentGearIdx <= 0) return;

    // 预判降档后的转速
    var newGearIdx = currentGearIdx - 1;
    var newRatio = V.gearRatios[newGearIdx];
    var wheelRPM = Math.abs(carSpeed) / (2 * Math.PI * V.wheelR) * 60;
    var predictedRPM = wheelRPM * newRatio * 2.5;

    // 执行降档
    currentGearIdx = newGearIdx;
    isShifting = true;
    shiftTimer = 0.25;
    if(typeof playShiftSound === 'function') playShiftSound(false);

    // ★ 只提示，不减速
    if(predictedRPM > 8000){
        if(typeof showToast === 'function') showToast('🔥 转速过高！');
    }
}

    function update(dt){
    // 已无减速逻辑，保留空函数防止调用报错
}

    function reset(){
        enabled = false;
        overRevDecel = 0;
        var btn = document.getElementById('mToggle');
        if(btn){ btn.textContent = 'A'; btn.classList.remove('on'); }
    }

    return { toggle: toggle, isOn: isOn, upShift: upShift, downShift: downShift, update: update, reset: reset };
})();