var chessBoard = []
//游戏是否结束
var over = false

// 赢法数组
var winMethods = []

//人类方赢法统计数组
var humanChessCount = []
//计算机方赢法统计数组
var computerChessCount = []

for (var i = 0; i < 15; i++) {
    chessBoard[i] = []
    for(var j = 0; j < 15; j++) {
        chessBoard[i][j] = 0
    }
}

for (var i = 0; i < 15; i++) {
    winMethods[i] = []
    for(var j = 0; j < 15; j++) {
        winMethods[i][j] = []
    }
}

var count = 0 
for(var i = 0; i < 15; i++) {
    for(var j = 0; j<11; j++) {
        for(var k = 0; k < 5; k++) {
            winMethods[i][j+k][count] = true
        }
        count++
    }
}

for(var i = 0; i < 15; i++) {
    for(var j = 0; j<11; j++) {
        for(var k = 0; k < 5; k++) {
            winMethods[j+k][i][count] = true
        }
        count++
    }
}

for(var i = 0; i < 11; i++) {
    for(var j = 0; j<11; j++) {
        for(var k = 0; k < 5; k++) {
            winMethods[i+k][j+k][count] = true
        }
        count++
    }
}

for(var i = 0; i < 11; i++) {
    for(var j = 14; j>3; j--) {
        for(var k = 0; k < 5; k++) {
            winMethods[i+k][j-k][count] = true
        }
        count++
    }
}

for(var i = 0; i < count; i++) {
    humanChessCount[i] = 0
    computerChessCount[i] = 0
}

var me = true
var chess = document.getElementById('chess')
var context = chess.getContext('2d')

context.strokeStyle = '#838080'

//初始化
for(var i = 0; i < 15; i++) {
    context.moveTo(15 + i * 30, 15)
    context.lineTo(15 + i * 30, 435)
    context.stroke()
    context.moveTo(15, 15 + i * 30)
    context.lineTo(435, 15 + i * 30)
    context.stroke()
}

var oneStep = function (i, j, me) {
    context.beginPath()
    context.arc(15 + i * 30, 15 + j * 30, 13, 0, 2 * Math.PI)
    context.closePath()
    var gradient = context.createRadialGradient(15 + i * 30 + 2, 15 + j * 30 - 2, 15, 15 + i * 30 + 2, 15 + j * 30 - 2, 0)
    if (me) {
        gradient.addColorStop(0, '#0a0a0a')
        gradient.addColorStop(1, '#636766')
    } else {
        gradient.addColorStop(0, '#d1d1d1')
        gradient.addColorStop(1, '#f9f9f9')
    }
    context.fillStyle = gradient
    context.fill()
}

chess.onclick = function (e) {
    if (over || !me) {return}
    var x = e.offsetX
    var y = e.offsetY
    var i = Math.floor(x / 30)
    var j = Math.floor(y / 30)
    if (chessBoard[i][j] === 0) {
        oneStep(i, j, me)
        chessBoard[i][j] = 1 //1表示人类落子
        //判断有没有取胜
        for(var k = 0; k < count; k++) { //遍历572种赢法
            if (winMethods[i][j][k]) { //如果在当前落子属于572种赢法下的某一种情况
                humanChessCount[k]++ //人类方在第k赢法下落子+1
                computerChessCount[k] = -1 //计算机方则在该种情况下不可能胜利了，直接设置为-1（5为胜利）
                if (humanChessCount[k] == 5) {
                    window.alert('这该你赢吗')
                    over = true
                }
            }
        }

        if (!over) {
            me = !me
            computerAI()
        }
    }
}

var computerAI = function () {
    var humanScore = [] // 某个空白位置点上，人类在各种赢法下的汇总分数
    var computerScore = [] // 某个空白位置点上，计算机在各种赢法下的汇总分数
    var max = -Infinity
    var u = 0, v = 0 // 计算机下一步落子坐标

    // 初始化得分数组
    for (var i = 0; i < 15; i++) {
        humanScore[i] = []
        computerScore[i] = []
        for (var j = 0; j < 15; j++) {
            humanScore[i][j] = 0
            computerScore[i][j] = 0
        }
    }

    // 遍历每一个空白点，计算其得分
    for (var i = 0; i < 15; i++) {
        for (var j = 0; j < 15; j++) {
            if (chessBoard[i][j] === 0) {
                // 评估人类得分（防守）
                humanScore[i][j] += evaluatePosition(i, j, 1, humanChessCount, computerChessCount)
                // 评估计算机得分（进攻）
                computerScore[i][j] += evaluatePosition(i, j, 2, computerChessCount, humanChessCount)

                // 综合判断优先级，进攻优先
                if (computerScore[i][j] > max) {
                    max = computerScore[i][j]
                    u = i
                    v = j
                } else if (computerScore[i][j] === max) {
                    if (humanScore[i][j] > humanScore[u][v]) {
                        u = i
                        v = j
                    }
                }

                // 如果防守得分更高，则优先防守
                if (humanScore[i][j] > max) {
                    max = humanScore[i][j]
                    u = i
                    v = j
                }
            }
        }
    }

    // 在最佳位置落子
    oneStep(u, v, false)
    chessBoard[u][v] = 2 // 2 表示计算机落子

    // 更新赢法统计
    for (var k = 0; k < count; k++) {
        if (winMethods[u][v][k]) {
            computerChessCount[k]++
            humanChessCount[k] = -1 // 该赢法对人类无效
            if (computerChessCount[k] == 5) {
                window.alert('菜就多练')
                over = true
            }
        }
    }

    // 切换到人类玩家
    if (!over) {
        me = !me
    }
}

function evaluatePosition(i, j, player, playerChessCount, opponentChessCount) {
    let score = 0;

    for (var k = 0; k < count; k++) {
        if (winMethods[i][j][k]) {
            let playerCount = playerChessCount[k];
            let opponentCount = opponentChessCount[k];

            if (player === 2) { // 计算机玩家
                // 计算机进攻得分
                if (playerCount === 4) {
                    score += 100000; // 优先完成五子连珠
                } else if (playerCount === 3) {
                    score += opponentCount === 0 ? 8000 : 200; // 优先活三，其次半活三
                } else if (playerCount === 2) {
                    score += opponentCount === 0 ? 500 : 100; // 优先活二
                } else if (playerCount === 1) {
                    score += 50;
                }

                // 防守对方得分
                if (opponentCount === 4) {
                    score += 80000; // 防守对方四连
                } else if (opponentCount === 3) {
                    score += 8000; // 防守对方活三
                } else if (opponentCount === 2) {
                    score += 300; // 防守对方活二
                }
            } else if (player === 1) { // 人类玩家
                // 人类进攻得分
                if (playerCount === 4) {
                    score += 80000; // 防守对方四连
                } else if (playerCount === 3) {
                    score += opponentCount === 0 ? 8000 : 200; // 防守对方活三
                } else if (playerCount === 2) {
                    score += opponentCount === 0 ? 500 : 100; // 防守对方活二
                } else if (playerCount === 1) {
                    score += 50;
                }

                // 计算机防守得分
                if (opponentCount === 4) {
                    score += 100000; // 优先完成五子连珠
                } else if (opponentCount === 3) {
                    score += 8000; // 优先活三，其次半活三
                } else if (opponentCount === 2) {
                    score += 500; // 优先活二
                } else if (opponentCount === 1) {
                    score += 50;
                }
            }
        }
    }

    // 增加交叉点权重
    for (var k = 0; k < count; k++) {
        if (winMethods[i][j][k]) {
            score += 10; // 每个交叉点的额外加分
        }
    }

    return score;
}

// 重置棋盘的函数
function resetBoard() {
    // 清空棋盘
    context.strokeStyle = '#838080'
    context.clearRect(0, 0, chess.width, chess.height);
    context.beginPath(); // 开始一个新的路径
    // 重新绘制棋盘网格
    for(var i = 0; i < 15; i++) {
        context.moveTo(15 + i * 30, 15)
        context.lineTo(15 + i * 30, 435)
        context.stroke()
        context.moveTo(15, 15 + i * 30)
        context.lineTo(435, 15 + i * 30)
        context.stroke()
    }
    context.stroke()
    // 重置棋盘状态
    for (var i = 0; i < 15; i++) {
        for(var j = 0; j < 15; j++) {
            chessBoard[i][j] = 0
        }
    }
    // 重置赢法统计数组
    for (var i = 0; i < count; i++) {
        humanChessCount[i] = 0
        computerChessCount[i] = 0
    }
    // 重置游戏状态
    over = false
    me = true
}

// 添加按钮点击事件
document.getElementById('resetButton').addEventListener('click', resetBoard);
