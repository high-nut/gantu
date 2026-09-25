
let currentTrackIndex = -1;
let isPlaying = false;

// 从 localStorage 加载用户设置
function loadUserSettings() {
    const savedData = JSON.parse(localStorage.getItem('musicPlayerData')) || {};
    if (savedData.musicFiles && Array.isArray(savedData.musicFiles)) {
        // 合并用户设置与默认数据
        musicFiles.forEach(track => {
            const savedTrack = savedData.musicFiles.find(t => t.name === track.name);
            if (savedTrack) {
                track.liked = savedTrack.liked || false;
                track.disliked = savedTrack.disliked || false;
            }
        });
    }
}


// 保存用户设置到 localStorage
function saveUserSettings() {
    const dataToSave = {
        musicFiles: musicFiles.map(track => ({
            name: track.name,
            path: track.path,
            liked: track.liked,
            disliked: track.disliked
        }))
    };
    localStorage.setItem('musicPlayerData', JSON.stringify(dataToSave));
}

// 初始化音乐列表
function initMusicList() {
    const musicList = document.getElementById('musicList');
    musicList.innerHTML = '';
    musicFiles.forEach((track, index) => {
        const item = document.createElement('div');
        item.className = 'music-item';
        item.innerHTML = `
            <span>${track.name}</span>
            <div class="like-dislike-buttons">
                <button onclick="toggleLike(${index})">${track.liked ? '取消喜欢' : '喜欢'}</button>
                <button onclick="toggleDislike(${index})">${track.disliked ? '取消不喜欢' : '不喜欢'}</button>
            </div>
            <div class="order-buttons">
                <button onclick="moveToTop(${index})">置顶</button>
                <button onclick="moveUp(${index})">上移</button>
                <button onclick="moveDown(${index})">下移</button>
            </div>
        `;
        item.addEventListener('click', () => loadAndPlayTrack(index));
        musicList.appendChild(item);
    });
    saveUserSettings();
}

// 切换喜欢状态
function toggleLike(index) {
    musicFiles[index].liked = !musicFiles[index].liked;
    musicFiles[index].disliked = false; // 取消不喜欢
    initMusicList();
}

// 切换不喜欢状态
function toggleDislike(index) {
    musicFiles[index].disliked = !musicFiles[index].disliked;
    musicFiles[index].liked = false; // 取消喜欢
    initMusicList();
}

// 调整顺序功能
function moveToTop(index) {
    const [movedItem] = musicFiles.splice(index, 1);
    musicFiles.unshift(movedItem);
    initMusicList();
}

function moveUp(index) {
    if (index > 0) {
        [musicFiles[index], musicFiles[index - 1]] = [musicFiles[index - 1], musicFiles[index]];
        initMusicList();
    }
}

function moveDown(index) {
    if (index < musicFiles.length - 1) {
        [musicFiles[index], musicFiles[index + 1]] = [musicFiles[index + 1], musicFiles[index]];
        initMusicList();
    }
}

// 过滤显示逻辑
document.getElementById('showLikedOnly').addEventListener('click', () => {
    const filtered = musicFiles.filter(track => track.liked);
    renderFilteredTracks(filtered);
});

document.getElementById('hideDisliked').addEventListener('click', () => {
    const filtered = musicFiles.filter(track => !track.disliked);
    renderFilteredTracks(filtered);
});

// 新增：绑定“全部显示”按钮事件
document.getElementById('showAll').addEventListener('click', () => {
    renderFilteredTracks(musicFiles);
});


function renderFilteredTracks(tracks) {
    const musicList = document.getElementById('musicList');
    musicList.innerHTML = '';

    if (tracks.length === 0) {
        const emptyItem = document.createElement('div');
        emptyItem.className = 'music-item';
        emptyItem.textContent = '暂无符合条件的歌曲';
        musicList.appendChild(emptyItem);
        return;
    }

    tracks.forEach((track, index) => {
        const item = document.createElement('div');
        item.className = 'music-item';
        item.textContent = track.name;
        item.addEventListener('click', () => loadAndPlayTrack(index));
        musicList.appendChild(item);
    });
}


// 初始化加载
loadUserSettings();
initMusicList();

// 绑定事件监听器
document.getElementById('nextBtn').addEventListener('click', playNextTrack);
document.getElementById('prevBtn').addEventListener('click', playPrevTrack);
