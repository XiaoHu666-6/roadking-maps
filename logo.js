'use strict';
// ============ 主界面公告加载器 ============
(function(){
    function $(id){ return document.getElementById(id); }

    function loadAnnouncement(){
        var xhr = new XMLHttpRequest();
        xhr.open('GET', 'js/readme.txt', true);
        xhr.onreadystatechange = function(){
            if(xhr.readyState === 4){
                var text = '';
                if(xhr.status === 200 || xhr.status === 0){
                    text = xhr.responseText || '';
                } else {
                    text = '【公告加载失败】\n\n请检查 readme.txt 是否存在。';
                }
                showAnnounce(text.trim() || '暂无公告');
            }
        };
        try{ xhr.send(); }catch(e){ showAnnounce('【公告加载失败】'); }
    }

    function showAnnounce(text){
        var body = $('announceBody');
        if(body) body.textContent = text;
        var modal = $('announceModal');
        if(modal) modal.classList.add('on');
    }

    function closeAnnounce(){
        var modal = $('announceModal');
        if(modal) modal.classList.remove('on');
    }

    window.ANNOUNCE = {
        load: loadAnnouncement,
        show: showAnnounce,
        close: closeAnnounce
    };

    // 页面加载后自动弹出公告
    window.addEventListener('load', function(){
        var okBtn = $('announceOk');
        if(okBtn) okBtn.addEventListener('click', closeAnnounce);

        var modal = $('announceModal');
        if(modal){
            // 点击遮罩空白处也关闭
            modal.addEventListener('click', function(e){
                if(e.target === modal) closeAnnounce();
            });
        }
        // 延迟一点，等主界面准备好
        setTimeout(loadAnnouncement, 500);
    });
})();