'use strict';

// ============ AI 随机名字池 ============
window.AI_NAMES = {
    // 形容词
    adj: ['狂野', '暴走', '极速', '暗夜', '闪电', '钢铁', '疾风', '烈焰', '雷霆', '幽灵',
          '传说', '无敌', '孤狼', '赤焰', '冰霜', '虚影', '狂飙', '星尘', '苍穹', '死神',
          '黑金', '银翼', '疾影', '雷霆', '风暴', '午夜', '赤红', '暗影', '王牌', '极限',
          '深渊', '龙息', '凤凰', '夜枭', '荒神', '血月', '玄武', '破晓', '红莲', '夜叉'],
    // 名词
    noun: ['赛车手', '车神', '车王', '飞车党', '狂徒', '猎手', '幽灵', '刺客', '骑士', '游侠',
           '老大', '黑帮', '霸主', '魔头', '玩家', '王者', '战神', '浪人', '侠客', '传说',
           '赛手', '冠军', '先锋', '教父', '枭雄', '大亨', '老炮', '车魔', '影卫', '龙裔'],
    // 绰号
    nick: ['零号', 'X', '死神', '暴君', '独狼', '凤凰', '双刀', '黑桃', '红心', '方块',
           '梅花', 'J', 'Q', 'K', 'A', '黑曼巴', '眼镜蛇', '毒蝎', '猛虎', '雄鹰'],
    // 编队
    team: ['车队', '俱乐部', '联盟', '战队', '帮', '会', '工作室', '社', '团', '组']
};

// 生成一个随机名字
window.AI_NAMES.random = function(){
    var a = window.AI_NAMES;
    var roll = Math.random();
    var name;
    if(roll < 0.4){
        // 形容词+名词：狂野赛车手
        name = a.adj[Math.floor(Math.random()*a.adj.length)] +
               a.noun[Math.floor(Math.random()*a.noun.length)];
    } else if(roll < 0.7){
        // 形容词+绰号：暗夜-X
        name = a.adj[Math.floor(Math.random()*a.adj.length)] + '-' +
               a.nick[Math.floor(Math.random()*a.nick.length)];
    } else if(roll < 0.85){
        // 绰号+名词：死神猎手
        name = a.nick[Math.floor(Math.random()*a.nick.length)] +
               a.noun[Math.floor(Math.random()*a.noun.length)];
    } else {
        // 形容词+名词+车队：烈焰车神车队
        name = a.adj[Math.floor(Math.random()*a.adj.length)] +
               a.noun[Math.floor(Math.random()*a.noun.length)] +
               a.team[Math.floor(Math.random()*a.team.length)];
    }
    // 加随机数字后缀（20% 概率）
    if(Math.random() < 0.2){
        name += Math.floor(Math.random() * 99);
    }
    return name;
};