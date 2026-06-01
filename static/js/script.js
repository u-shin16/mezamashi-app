// ===================================
// 1. グローバル変数・初期設定
// ===================================
const alarm = document.getElementById('alarmSound');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');

let currentMission = "";
let isAlarmActive = false;
let alarmInterval;
let currentFacingMode = "environment";
let alarmVolume = 0.8; 
let TARGET_ITEM = ""; 
let isSensorPermissionGranted = false;
let lastActiveScreen = "setup-screen";
let isTestMode = false;
let currentLang = 'ja';
let isHardMode = true; 

// ===================================
// 言語設定の初期化・適用（共通化）
// ===================================
function applyLanguageSettings() {
    const savedLang = localStorage.getItem('app_language');
    if (savedLang) currentLang = savedLang; 

    const langLabel = document.getElementById('lang-label-text');
    const langCheckbox = document.getElementById('lang-checkbox');
    const langToggleBtn = document.getElementById('lang-toggle');
            
    if (currentLang === 'ja') {
        if (langLabel) langLabel.innerText = '🇯🇵 日本語';
        if (langCheckbox) langCheckbox.checked = false;
        if (langToggleBtn) langToggleBtn.innerText = '🌐 English';
    } else {
        if (langLabel) langLabel.innerText = '🇺🇸 English';
        if (langCheckbox) langCheckbox.checked = true;
        if (langToggleBtn) langToggleBtn.innerText = '🌐 日本語';
    }

    const elements = document.querySelectorAll('.translatable');
    elements.forEach(el => {
        el.innerText = el.getAttribute(`data-${currentLang}`);
    });
}

// ===================================
// Wake Lock API (画面常時点灯) の設定
// ===================================
let wakeLock = null;

async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('✅ Wake Lock API: 画面の常時点灯が有効になりました');
            
            wakeLock.addEventListener('release', () => {
                console.log('💤 Wake Lock API: 常時点灯が解除されました');
            });
        } catch (err) {
            console.error('❌ Wake Lockエラー:', err.name, err.message);
        }
    } else {
        console.log('⚠️ このブラウザはWake Lock APIに対応していません');
    }
}

function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release().then(() => {
            wakeLock = null;
        });
    }
}

// ===================================
// 画面を暗くする処理（カウントダウン付き）
// ===================================
let deepSleepInterval; 
let timeUntilDark = 0; 

function enterDeepSleep() {
    const sleepScreen = document.getElementById('sleep-screen');
    if (sleepScreen) sleepScreen.classList.add('deep-sleep');
    const countdownEl = document.getElementById('dark-countdown');
    if (countdownEl) countdownEl.innerText = ""; 
}

function resetDeepSleepTimer(delayMs = 30000) {
    clearInterval(deepSleepInterval);
    const sleepScreen = document.getElementById('sleep-screen');
    if (sleepScreen) sleepScreen.classList.remove('deep-sleep');
    
    if (isAlarmActive) return;

    const countdownEl = document.getElementById('dark-countdown');
    timeUntilDark = Math.floor(delayMs / 1000); 

    updateCountdownText(countdownEl);

    deepSleepInterval = setInterval(() => {
        timeUntilDark--;
        if (timeUntilDark > 0) {
            updateCountdownText(countdownEl);
        } else {
            clearInterval(deepSleepInterval);
            enterDeepSleep();
        }
    }, 1000);
}

function updateCountdownText(el) {
    if (!el) return;
    if (currentLang === 'ja') {
        el.innerText = `あと ${timeUntilDark} 秒で画面が暗くなります`;
    } else {
        el.innerText = `Screen darkens in ${timeUntilDark}s`;
    }
}

document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        requestWakeLock();
    }
});

const itemDictionary = {
    "cup": "コップ", "cell phone": "スマートフォン", "toothbrush": "歯ブラシ",
    "book": "本", "bottle": "ペットボトル / 水筒", "remote": "リモコン",
    "mouse": "マウス", "keyboard": "キーボード", "laptop": "ノートパソコン",
    "chair": "椅子", "bed": "ベッド", "tv": "テレビ", "clock": "時計",
    "scissors": "はさみ", "apple": "りんご", "banana": "バナナ", "orange": "オレンジ",
    "bowl": "お椀 / ボウル", "sink": "洗面台 / シンク", "toilet": "トイレ",
    "person": "人", "potted plant": "観葉植物 / 鉢植え", "hair drier": "ドライヤー",
    "backpack": "リュックサック", "umbrella": "傘", "handbag": "ハンドバッグ",
    "tie": "ネクタイ", "suitcase": "スーツケース", "microwave": "電子レンジ",
    "oven": "オーブン", "toaster": "トースター", "refrigerator": "冷蔵庫",
    "vase": "花瓶", "fork": "フォーク", "spoon": "スプーン", "knife": "ナイフ"
};

function translateItem(itemName) {
    if (!itemName) return "";
    const key = itemName.toLowerCase();
    return itemDictionary[key] || itemName;
}

// ===================================
// DOMContentLoaded (初期化)
// ===================================
window.addEventListener('DOMContentLoaded', () => {
    try {
        initApp(); 

        // 🌟 読み込み時の設定初期化（ラジオボタン対応版）
        const savedTheme = localStorage.getItem('app_theme') || 'light';
        setTheme(savedTheme);
        const themeRadio = document.querySelector(`input[name="setting-theme"][value="${savedTheme}"]`);
        if(themeRadio) themeRadio.checked = true;

        const savedDiff = localStorage.getItem('app_difficulty') || 'hard';
        setDifficulty(savedDiff);
        const diffRadio = document.querySelector(`input[name="setting-diff"][value="${savedDiff}"]`);
        if(diffRadio) diffRadio.checked = true;

        const savedLang = localStorage.getItem('app_language') || 'ja';
        setLanguage(savedLang);
        const langRadio = document.querySelector(`input[name="setting-lang"][value="${savedLang}"]`);
        if(langRadio) langRadio.checked = true;

        // 🌟 アラーム音の復元と保存
        const savedSound = localStorage.getItem('app_alarm_sound') || 'alarm';
        const soundRadio = document.querySelector(`input[name="alarm-sound"][value="${savedSound}"]`);
        if(soundRadio) soundRadio.checked = true;

        document.querySelectorAll('input[name="alarm-sound"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                localStorage.setItem('app_alarm_sound', e.target.value);
                updateSummary();
                
                // 別の音を選んだ瞬間に、テスト再生中ならストップする
                if (typeof isPlayingTestVolume !== 'undefined' && isPlayingTestVolume) {
                    if (typeof stopTestVolume === 'function') {
                        stopTestVolume();
                    }
                }
            });
        });
        
        const missionRadios = document.querySelectorAll('input[name="mission"]');
        missionRadios.forEach(radio => {
            radio.addEventListener('change', updateSummary);
        });

        // サマリー初期化
        updateSummary();

        const sleepScreen = document.getElementById('sleep-screen');
        if (sleepScreen) {
            sleepScreen.addEventListener('click', () => {
                if (sleepScreen.classList.contains('deep-sleep')) {
                    resetDeepSleepTimer(10000); 
                }
            });
        }

    } catch (error) {
        console.error("裏側でエラーが起きています！詳細：", error);
    } finally {
        document.body.classList.remove('preload');
    }

    const volumeControl = document.getElementById('volume-control');
    if (volumeControl) {
        volumeControl.addEventListener('input', (e) => {
            alarmVolume = e.target.value / 100;
            const pct = e.target.value;
            document.getElementById('volume-pct').innerText = pct;
            
            const summaryVol = document.getElementById('summary-volume');
            if(summaryVol) summaryVol.innerText = pct;
            
            if (alarm) alarm.volume = alarmVolume;
        });
    }
});

function initApp() {
    const timeInput = document.getElementById('alarm-time');
    if (timeInput) {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        timeInput.value = `${hours}:${minutes}`;
    }

    const displayTarget = document.getElementById('display-target');
    if (displayTarget) {
        TARGET_ITEM = displayTarget.innerText.trim();
        displayTarget.innerText = translateItem(TARGET_ITEM);
    }
}

// ===================================
// ミッションUI管理 (重複除去用)
// ===================================
function hideAllMissions() {
    const missions = [
        'mission-math', 'mission-shake', 'mission-kamera', 
        'mission-stroop', 'mission-odd-one', 'mission-memory', 'mission-target'
    ];
    missions.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
}

function startSelectedMission(missionId) {
    if (missionId === 'watosa' || missionId === 'sekitosyou') {
        document.getElementById('mission-math').classList.remove('hidden');
        startMathMission();
    } else if (missionId === 'shake') {
        document.getElementById('mission-shake').classList.remove('hidden');
        startShakeMission();
    } else if (missionId === 'kamera') {
        document.getElementById('mission-kamera').classList.remove('hidden');
        startCameraMission();
    } else if (missionId === 'stroop') {
        document.getElementById('mission-stroop').classList.remove('hidden');
        startStroopMission(); 
    } else if (missionId === 'odd_one') { 
        document.getElementById('mission-odd-one').classList.remove('hidden');
        startOddOneMission();
    } else if (missionId === 'memory') { 
        document.getElementById('mission-memory').classList.remove('hidden');
        startMemoryMission();
    } else if (missionId === 'target') { 
        document.getElementById('mission-target').classList.remove('hidden');
        startTargetMission();
    }
}

// ===================================
// 2. メインロジック (アラーム・画面制御)
// ===================================
async function startSleep() {
    const timeInput = document.getElementById('alarm-time').value;
    if (!timeInput) {
        alert("時間を入力してください！⏰");
        return;
    }

    if (!isSensorPermissionGranted && typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
            const response = await DeviceMotionEvent.requestPermission();
            if (response === 'granted') {
                isSensorPermissionGranted = true;
            } else {
                alert("センサーが拒否されました。");
                return; 
            }
        } catch (e) {
            console.error("センサーリクエスト失敗:", e);
        }
    }

    if (alarm) {
        alarm.volume = 0;
        try {
            await alarm.play();
            alarm.pause();
            alarm.currentTime = 0;
        } catch (e) {
            console.log("再生準備中...");
        }
    }

    const radios = document.getElementsByName('mission');
    for (let r of radios) { if (r.checked) currentMission = r.value; }

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('sleep-screen').classList.remove('hidden');
    
    requestWakeLock();
    resetDeepSleepTimer(30000);

    alarmInterval = setInterval(() => {
        const checkNow = new Date();
        const checkTime = `${String(checkNow.getHours()).padStart(2, '0')}:${String(checkNow.getMinutes()).padStart(2, '0')}`;
        const sleepInfo = document.getElementById('sleep-info');
        if (sleepInfo) sleepInfo.innerText = `設定時間: ${timeInput}`;

        if (checkTime === timeInput) {
            clearInterval(alarmInterval);
            fireAlarm();
        }
    }, 1000);
}

function fireAlarm() {
    isAlarmActive = true;

    releaseWakeLock();
    clearInterval(deepSleepInterval);
    const sleepScreen = document.getElementById('sleep-screen');
    if (sleepScreen) sleepScreen.classList.remove('deep-sleep');
    
    document.getElementById('setup-screen').classList.add('hidden');
    if (sleepScreen) sleepScreen.classList.add('hidden');
    document.getElementById('puzzle-screen').classList.remove('hidden');
    
    hideAllMissions();

    if (currentMission !== 'kamera') playAlarmSound();

    startSelectedMission(currentMission);
}

function playAlarmSound() {
    if (!isAlarmActive || isTestMode) return; 
    
    if (alarm) {
        const checkedSound = document.querySelector('input[name="alarm-sound"]:checked');
        const currentSound = checkedSound ? checkedSound.value : 'alarm';
        alarm.src = `static/${currentSound}.mp3`; 
        
        alarm.volume = alarmVolume;
        alarm.loop = true;
        alarm.play().catch(e => console.log("再生エラー:", e));
    }
}

function missionClear() {
    isAlarmActive = false;
    if (alarm) alarm.pause();
    
    if (isTestMode) {
        alert("テストクリア！バッチリです👍");
        isTestMode = false; 
        resetToSetup();
        return; 
    }

    alert("完全勝利！おはようございます☀️");
    resetToSetup();
}

function resetToSetup() {
    document.getElementById('puzzle-screen').classList.add('hidden');
    const sleepScreen = document.getElementById('sleep-screen');
    if (sleepScreen) sleepScreen.classList.add('hidden');
    document.getElementById('help-screen').classList.add('hidden');
    hideAllMissions();
    document.getElementById('setup-screen').classList.remove('hidden');

    const debugBtn = document.getElementById('debug-back-btn');
    if (debugBtn) debugBtn.classList.add('hidden');

    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null;
    }
    if (typeof mathTimer !== 'undefined') clearInterval(mathTimer);
    window.removeEventListener('devicemotion', handleMotion, true);
    if (typeof targetMoveInterval !== 'undefined') clearInterval(targetMoveInterval);

    shakeScore = 0;
    mathStreak = 0;
    oddOneScore = 0; 
    isAlarmActive = false;
    initApp();
}

function missionFailed() {
    document.body.classList.add('wrong-flash');
    setTimeout(() => document.body.classList.remove('wrong-flash'), 150);
}

// ===================================
// 3. 各ミッション処理
// ===================================
/* --- 計算ミッション --- */
let mathStreak = 0, mathTimeLeft = 0, mathCorrectAns = 0, mathTimer;

function startMathMission() {
    mathStreak = 0;
    const targetStreak = isHardMode ? 3 : 1;
    document.getElementById('math-status').innerText = `連続正解: ${mathStreak} / ${targetStreak}`;
    
    generateMath();
    if(mathTimer) clearInterval(mathTimer);
    mathTimer = setInterval(() => {
        if (!isAlarmActive) return;
        mathTimeLeft--;
        document.getElementById('math-time').innerText = mathTimeLeft;
        if (mathTimeLeft <= 0) {
            mathStreak = 0;
            updateMathUI("❌ 時間切れ！最初から！", "red");
            generateMath();
            missionFailed();
        }
    }, 1000);
}

function generateMath() {
    let num1 = Math.floor(Math.random() * 90) + 10;
    let num2 = Math.floor(Math.random() * 90) + 10;
    let qText = "";

    if (currentMission === 'watosa') {
        mathTimeLeft = 25;
        if (Math.random() < 0.5) { mathCorrectAns = num1 + num2; qText = `${num1} + ${num2}`; }
        else { if(num1 < num2) [num1, num2] = [num2, num1]; mathCorrectAns = num1 - num2; qText = `${num1} - ${num2}`; }
    } else {
        mathTimeLeft = 60;
        num2 = Math.floor(Math.random() * 8) + 2;
        if (Math.random() < 0.5) { mathCorrectAns = num1 * num2; qText = `${num1} × ${num2}`; }
        else { mathCorrectAns = Math.floor(num1 / num2); qText = `${num1} ÷ ${num2}(商)`; }
    }
    document.getElementById('math-q').innerText = qText;
    document.getElementById('math-input').value = "";
    document.getElementById('math-input').focus();
    
    const targetStreak = isHardMode ? 3 : 1;
    document.getElementById('math-status').innerText = `連続正解: ${mathStreak} / ${targetStreak}`;
}

function checkMath() {
    if (!isAlarmActive) return;
    const ans = parseInt(document.getElementById('math-input').value);
    
    const targetStreak = isHardMode ? 3 : 1;
    
    if (ans === mathCorrectAns) {
        mathStreak++;
        if (mathStreak >= targetStreak) { 
            clearInterval(mathTimer); 
            missionClear(); 
        } else { 
            updateMathUI(`⭕️ あと ${targetStreak - mathStreak} 問`, "green"); 
            generateMath(); 
        }
    } else {
        mathStreak = 0;
        updateMathUI("❌ 不正解！リセット！", "red");
        generateMath();
        missionFailed();
    }
    document.getElementById('math-status').innerText = `連続正解: ${mathStreak} / ${targetStreak}`;
}

function updateMathUI(msg, color) {
    const fb = document.getElementById('math-feedback');
    if (fb) { fb.innerText = msg; fb.style.color = color; }
}

/* --- シェイクミッション --- */
let shakeScore = 0;
let powerDisplayTimer;

async function startShakeMission() {
    shakeScore = 0;
    updateShakeUI();

    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        if (!isSensorPermissionGranted) {
            try {
                const response = await DeviceMotionEvent.requestPermission();
                if (response === 'granted') {
                    isSensorPermissionGranted = true;
                } else {
                    alert("❌ センサーが拒否されました。設定から許可してください。");
                    return; 
                }
            } catch (error) {
                console.error("センサー許可エラー:", error);
                alert("⚠️ センサーを起動するには、画面を一度タップしてください。");
                return;
            }
        }
    }

    window.removeEventListener('devicemotion', handleMotion, true);
    window.addEventListener('devicemotion', handleMotion, true);

    const shakeInterval = setInterval(() => {
        if (!isAlarmActive || currentMission !== 'shake') {
            clearInterval(shakeInterval);
            window.removeEventListener('devicemotion', handleMotion, true);
            return;
        }
        if (shakeScore > 0) {
            shakeScore -= 50; 
            updateShakeUI();
        }
    }, 100);
}

function handleMotion(e) {
    if (!isAlarmActive || currentMission !== 'shake') return;
    let acc = e.accelerationIncludingGravity;
    if (!acc) return;
    
    let diff = Math.abs(acc.x || 0) + Math.abs(acc.y || 0) + Math.abs(acc.z || 0);
    
    if (diff > 15) {
        let power = diff - 10;
        shakeScore += power * 20;
    }

    const targetScore = isHardMode ? 150000 : 75000;

    if (shakeScore >= targetScore) {
        window.removeEventListener('devicemotion', handleMotion, true);
        missionClear();
    }
    
    updateShakeUI(diff);
}

function updateShakeUI(currentDiff = 0) {
    const targetScore = isHardMode ? 150000 : 75000;

    const bar = document.getElementById('shake-bar');
    if (bar) { 
        bar.max = targetScore; 
        bar.value = shakeScore; 
    }

    const pctText = document.getElementById('shake-pct');
    if (!pctText) return;

    let currentPct = Math.min(100, Math.max(0, Math.floor((shakeScore / targetScore) * 100)));

    if (currentDiff > 0) {
        pctText.innerText = currentPct + "% (検知パワー: " + Math.floor(currentDiff) + ")";
        clearTimeout(powerDisplayTimer);
        powerDisplayTimer = setTimeout(() => {
            if (isAlarmActive && currentMission === 'shake') {
                pctText.innerText = currentPct + "%";
            }
        }, 500);
    } else {
        if (pctText.innerText !== "") {
            pctText.innerText = pctText.innerText.replace(/^[\d]+%/, currentPct + "%");
        } else {
            pctText.innerText = currentPct + "%";
        }
    }
}

/* --- カメラミッション --- */
function startCameraMission() { openCamera(currentFacingMode); }

function openCamera(mode) {
    if (video && video.srcObject) { 
        video.srcObject.getTracks().forEach(t => t.stop()); 
    }
    
    navigator.mediaDevices.getUserMedia({ video: { facingMode: mode } })
    .then(stream => {
        if (video) {
            video.srcObject = stream;
            video.play();
        }
    })
    .catch(err => {
        alert("カメラエラー: " + err.name + " \n" + err.message);
        console.error("Camera access error:", err);
    });
}

/* --- ストループ（色当て）ミッション --- */
let stroopCorrectCount = 0;
let stroopCorrectId = '';
let currentStroopType = 'color'; 
let currentStroopWord = null;
let currentStroopText = null;

const stroopColors = [
    { id: 'red', ja: 'あか', en: 'Red', hex: '#e74c3c' },
    { id: 'blue', ja: 'あお', en: 'Blue', hex: '#3498db' },
    { id: 'green', ja: 'みどり', en: 'Green', hex: '#2ecc71' },
    { id: 'yellow', ja: 'きいろ', en: 'Yellow', hex: '#f1c40f' },
    { id: 'orange', ja: 'オレンジ', en: 'Orange', hex: '#e67e22' }, 
    { id: 'purple', ja: 'むらさき', en: 'Purple', hex: '#9b59b6' },
    { id: 'pink', ja: 'ピンク', en: 'Pink', hex: '#ec407a' },
    { id: 'brown', ja: 'ちゃいろ', en: 'Brown', hex: '#8d6e63' },
    { id: 'lightblue', ja: 'みずいろ', en: 'Light Blue', hex: '#26c6da' },
    { id: 'lime', ja: 'きみどり', en: 'Lime Green', hex: '#9ccc65' }
];

function startStroopMission() {
    stroopCorrectCount = 0;
    document.getElementById('stroop-feedback').innerText = '';
    updateStroopStatusText();
    nextStroopQuestion();
}

function updateStroopStatusText() {
    const targetScore = isHardMode ? 5 : 2; 
    const statusEl = document.getElementById('stroop-status');
    if (currentLang === 'ja') {
        statusEl.innerText = `連続正解: ${stroopCorrectCount} / ${targetScore}`;
    } else {
        statusEl.innerText = `Correct: ${stroopCorrectCount} / ${targetScore}`;
    }
}

function nextStroopQuestion() {
    currentStroopWord = stroopColors[Math.floor(Math.random() * stroopColors.length)];
    currentStroopText = stroopColors[Math.floor(Math.random() * stroopColors.length)];
    currentStroopType = Math.random() < 0.5 ? 'color' : 'meaning';
    renderStroopQuestion();
}

function renderStroopQuestion() {
    if (!currentStroopWord || !currentStroopText) return;

    const instructionEl = document.getElementById('stroop-instruction');
    let correctAnswerObj;
    if (currentStroopType === 'color') {
        stroopCorrectId = currentStroopText.id; 
        correctAnswerObj = currentStroopText;
        instructionEl.innerText = currentLang === 'ja' ? '⚠️「文字の色」を答えろ！' : "⚠️ Select the 'TEXT COLOR'!";
        instructionEl.style.color = ''; 
    } else {
        stroopCorrectId = currentStroopWord.id; 
        correctAnswerObj = currentStroopWord;
        instructionEl.innerText = currentLang === 'ja' ? '📝「文字の意味」を答えろ！' : "📝 Select the 'WORD MEANING'!";
        instructionEl.style.color = ''; 
    }
    
    const qEl = document.getElementById('stroop-q');
    qEl.innerText = currentLang === 'ja' ? currentStroopWord.ja : currentStroopWord.en;
    qEl.style.setProperty('color', currentStroopText.hex, 'important');
    
    let options = [correctAnswerObj];
    let dummyColors = stroopColors.filter(color => color.id !== stroopCorrectId);
    dummyColors.sort(() => Math.random() - 0.5); 
    options.push(dummyColors[0], dummyColors[1], dummyColors[2]);
    options.sort(() => Math.random() - 0.5); 

    const answersDiv = document.getElementById('stroop-answers');
    answersDiv.innerHTML = ''; 
    answersDiv.style.display = 'grid';
    answersDiv.style.gridTemplateColumns = '1fr 1fr'; 
    answersDiv.style.gap = '12px'; 
    
    options.forEach(color => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.innerText = currentLang === 'ja' ? color.ja : color.en;
        btn.className = 'btn-sub';
        btn.style.margin = '0';
        btn.style.padding = '10px 5px';
        btn.style.width = '100%';
        btn.style.fontSize = '16px'; 
        btn.style.fontWeight = '900'; 
        btn.style.backgroundColor = color.hex;
        btn.style.color = '#ffffff';
        btn.style.border = 'none'; 
        btn.style.borderRadius = '8px'; 
        btn.onclick = () => checkStroopAnswer(color.id);
        answersDiv.appendChild(btn);
    });
}

function checkStroopAnswer(chosenId) {
    const feedbackEl = document.getElementById('stroop-feedback');
    const targetScore = isHardMode ? 5 : 2; 

    if (chosenId === stroopCorrectId) {
        stroopCorrectCount++;
        feedbackEl.innerText = currentLang === 'ja' ? '⭕️ 正解！' : '⭕️ Correct!';
        feedbackEl.style.color = '#2ecc71';
        updateStroopStatusText();
        
        if (stroopCorrectCount >= targetScore) {
            feedbackEl.innerText = currentLang === 'ja' ? '🎉 クリア！音を止めます' : '🎉 Cleared!';
            setTimeout(missionClear, 800); 
        } else {
            setTimeout(nextStroopQuestion, 100);
        }
    } else {
        stroopCorrectCount = 0;
        feedbackEl.style.color = '#e74c3c';
        if (currentStroopType === 'color') {
            feedbackEl.innerText = currentLang === 'ja' ? '❌ 不正解！「色」を見て！' : "❌ Wrong! Look at the COLOR!";
        } else {
            feedbackEl.innerText = currentLang === 'ja' ? '❌ 不正解！「意味」を読んで！' : "❌ Wrong! Read the WORD!";
        }
        updateStroopStatusText();
        setTimeout(nextStroopQuestion, 150);
    }
}

/* --- ニセモノ探しミッション --- */
const oddOnePairs = [
    ['大', '太'], ['白', '百'], ['壁', '璧'], ['己', '已'], ['犬', '太'],
    ['輪', '輸'], ['持', '特'], ['緑', '縁'], ['鳥', '烏'], ['右', '石'],
    ['間', '問'], ['買', '売'], ['柿', '枠'], ['微', '徴'], ['縦', '従'],
    ['未', '末'], ['土', '士'], ['王', '玉'], ['千', '干'], ['刃', '丸'],
    ['由', '申'], ['甲', '由'], ['午', '牛'], ['万', '方'], ['天', '夭'],
    ['少', '歩'], ['日', '曰'], ['太', '犬'], ['木', '本'], ['札', '乱'],
    ['崇', '祟'], ['栗', '粟'], ['網', '綱'], ['治', '冶'], ['職', '織'],
    ['師', '帥'], ['孤', '狐'], ['刺', '剌'], ['貪', '貧'], ['盲', '育'],
    ['酒', '洒'], ['偏', '遍'], ['若', '苦'], ['毎', '毒'], ['感', '惑'],
    ['怒', '努'], ['恋', '変'], ['役', '投'], ['暖', '緩'], ['競', '覚'],
    ['高', '亮'], ['室', '客'], ['坊', '妨'], ['糖', '唐'], ['導', '道'],
    ['既', '即'], ['概', '慨'], ['斑', '班'], ['歴', '暦'], ['免', '兎'],
    ['換', '喚'], ['衰', '衷'], ['遣', '遺'], ['溝', '構'], ['講', '構']
];

let oddOneCorrectIndex = 0; 
let oddOneScore = 0;        

function startOddOneMission() {
    oddOneScore = 0;
    document.getElementById('odd-one-feedback').innerText = '';
    updateOddOneStatusText();
    generateOddOneQuestion();
}

function updateOddOneStatusText() {
    const targetScore = isHardMode ? 5 : 2; 
    const statusEl = document.getElementById('odd-one-status');
    if (currentLang === 'ja') {
        statusEl.innerText = `連続正解: ${oddOneScore} / ${targetScore}`;
    } else {
        statusEl.innerText = `Correct: ${oddOneScore} / ${targetScore}`;
    }
}

function generateOddOneQuestion() {
    const gridDiv = document.getElementById('odd-one-grid');
    gridDiv.innerHTML = '';

    const randomPair = oddOnePairs[Math.floor(Math.random() * oddOnePairs.length)];
    const normalChar = randomPair[0];
    const oddChar = randomPair[1];
    oddOneCorrectIndex = Math.floor(Math.random() * 25);

    for (let i = 0; i < 25; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'odd-one-btn';
        btn.innerText = (i === oddOneCorrectIndex) ? oddChar : normalChar;
        btn.onclick = () => checkOddOneAnswer(i);
        gridDiv.appendChild(btn);
    }
}

function checkOddOneAnswer(selectedIndex) {
    const feedbackEl = document.getElementById('odd-one-feedback');
    const targetScore = isHardMode ? 5 : 2; 

    if (selectedIndex === oddOneCorrectIndex) {
        oddOneScore++;
        feedbackEl.innerText = currentLang === 'ja' ? '⭕️ 正解！' : '⭕️ Correct!';
        feedbackEl.style.color = '#2ecc71';
        updateOddOneStatusText();

        if (oddOneScore >= targetScore) {
            feedbackEl.innerText = currentLang === 'ja' ? '🎉 クリア！音を止めます' : '🎉 Cleared!';
            setTimeout(missionClear, 800); 
        } else {
            setTimeout(generateOddOneQuestion, 150);
        }
    } else {
        oddOneScore = 0;
        feedbackEl.innerText = currentLang === 'ja' ? '❌ 間違い！リセット！' : "❌ Wrong! Reset!";
        feedbackEl.style.color = '#e74c3c';
        updateOddOneStatusText();
        missionFailed(); 
        setTimeout(generateOddOneQuestion, 150);
    }
}

/* --- 瞬間記憶ミッション --- */
let memorySequence = [];       
let memoryPlayerSequence = []; 
let memoryLevel = 1;
let isMemoryPlaying = false;   

const memoryColors = [
    { id: 'red',       hex: '#ff4757' }, 
    { id: 'blue',      hex: '#1e90ff' }, 
    { id: 'green',     hex: '#2ed573' }, 
    { id: 'yellow',    hex: '#ffa502' }, 
    { id: 'orange',    hex: '#ff7f50' }, 
    { id: 'purple',    hex: '#a29bfe' }  
];

function startMemoryMission() {
    memoryLevel = 1;
    memorySequence = [];
    document.getElementById('memory-feedback').innerText = '';
    updateMemoryUI();
    
    initMemoryGrid();
    
    setTimeout(nextMemoryRound, 1000); 
}

function initMemoryGrid() {
    const grid = document.getElementById('memory-grid');
    grid.innerHTML = '';
    for (let i = 0; i < memoryColors.length; i++) {
        const btn = document.createElement('button');
        btn.className = `memory-btn`;
        btn.type = 'button';
        btn.onclick = () => handleMemoryClick(i);
        btn.style.backgroundColor = memoryColors[i].hex;
        btn.style.color = memoryColors[i].hex; 
        grid.appendChild(btn);
    }
}

function nextMemoryRound() {
    memoryPlayerSequence = []; 
    memorySequence = []; 
    
    // 🌟 レベルと同じ数だけ光るように変更（Lv1なら1回、Lv2なら2回...）
    const sequenceLength = memoryLevel;
    for (let i = 0; i < sequenceLength; i++) {
        memorySequence.push(Math.floor(Math.random() * memoryColors.length));
    }
    
    updateMemoryUI();
    playMemorySequence();
}

function playMemorySequence() {
    isMemoryPlaying = true; 
    
    // 🌟 問題が始まる瞬間に「正解！」などのメッセージを綺麗に消す
    document.getElementById('memory-feedback').innerText = ''; 
    
    const instructionEl = document.getElementById('memory-instruction');
    instructionEl.innerText = currentLang === 'ja' ? '👀 覚えろ！' : '👀 Watch!';
    instructionEl.style.color = '#3498db';

    let i = 0;
    const interval = setInterval(() => {
        if (!isAlarmActive) { clearInterval(interval); return; }

        if (i >= memorySequence.length) {
            clearInterval(interval);
            isMemoryPlaying = false; 
            instructionEl.innerText = currentLang === 'ja' ? '👉 同じ順にタップ！' : '👉 Your turn!';
            instructionEl.style.color = '#e67e22';
            return;
        }
        flashMemoryButton(memorySequence[i]);
        i++;
    }, 800); 
}

function flashMemoryButton(index) {
    const btns = document.querySelectorAll('.memory-btn');
    if (!btns[index]) return;
    const btn = btns[index];
    btn.classList.remove('flash');
    void btn.offsetWidth;
    btn.classList.add('flash');
}

function handleMemoryClick(index) {
    if (!isAlarmActive && !isTestMode) return;
    if (isMemoryPlaying) return; 

    flashMemoryButton(index);
    memoryPlayerSequence.push(index);

    const currentIndex = memoryPlayerSequence.length - 1;
    const feedbackEl = document.getElementById('memory-feedback');
    const targetMaxLevel = isHardMode ? 5 : 3; 

    if (memoryPlayerSequence[currentIndex] !== memorySequence[currentIndex]) {
        feedbackEl.innerText = currentLang === 'ja' ? '❌ 間違い！最初から！' : '❌ Wrong! Reset!';
        feedbackEl.style.color = '#e74c3c';
        missionFailed();
        memoryLevel = 1;
        memorySequence = [];
        isMemoryPlaying = true; 
        setTimeout(nextMemoryRound, 1500);
        return;
    }

    if (memoryPlayerSequence.length === memorySequence.length) {
        // 🌟 正解した瞬間に次のタップをブロック（連打防止）
        isMemoryPlaying = true; 
        
        if (memoryLevel >= targetMaxLevel) {
            // 🌟 クリア時の文字も0.4秒遅らせて表示する
            setTimeout(() => {
                feedbackEl.innerText = currentLang === 'ja' ? '🎉 クリア！音を止めます' : '🎉 Cleared!';
                feedbackEl.style.color = '#2ecc71';
            }, 400);
            
            setTimeout(missionClear, 1200);
        } else {
            memoryLevel++;
            
            // 🌟 「正解！」の文字を0.4秒遅らせて表示する
            setTimeout(() => {
                feedbackEl.innerText = currentLang === 'ja' ? '⭕️ 正解！次へ...' : '⭕️ Correct! Next...';
                feedbackEl.style.color = '#2ecc71';
            }, 400);
            
            // その後、次のラウンドを開始
            setTimeout(nextMemoryRound, 1500);
        }
    }
}

function updateMemoryUI() {
    const targetMaxLevel = isHardMode ? 5 : 3; 
    const statusEl = document.getElementById('memory-status');
    if (currentLang === 'ja') {
        statusEl.innerText = `レベル: ${memoryLevel} / ${targetMaxLevel}`;
    } else {
        statusEl.innerText = `Level: ${memoryLevel} / ${targetMaxLevel}`;
    }
}

/* --- 的当てミッション --- */
let targetHits = 0;
let targetMoveInterval;

function startTargetMission() {
    targetHits = 0;
    updateTargetStatus();
    
    const targetGoal = isHardMode ? 10 : 5; 
    const instEl = document.getElementById('target-instruction');
    if (instEl) {
        instEl.innerText = currentLang === 'ja' ? `👇 逃げる的を${targetGoal}回撃て！` : `👇 Tap ${targetGoal} times!`;
    }
    
    setTimeout(moveTargetRandomly, 100);
    
    if (targetMoveInterval) clearInterval(targetMoveInterval);
    targetMoveInterval = setInterval(() => {
        if (isAlarmActive || isTestMode) {
            moveTargetRandomly();
        } else {
            clearInterval(targetMoveInterval);
        }
    }, 1200);
}

function moveTargetRandomly() {
    const area = document.getElementById('target-area');
    const target = document.getElementById('moving-target');
    if (!area || !target) return;
    if (area.clientWidth === 0) return;

    const margin = 80; 
    const maxX = area.clientWidth - margin;
    const maxY = area.clientHeight - margin;
    const randomX = Math.floor(Math.random() * Math.max(0, maxX)) + 40; 
    const randomY = Math.floor(Math.random() * Math.max(0, maxY)) + 40;

    target.style.left = `${randomX}px`;
    target.style.top = `${randomY}px`;
}

function hitTarget(event) {
    if (!isAlarmActive && !isTestMode) return;
    if (event) event.stopPropagation(); 
    
    targetHits++;
    updateTargetStatus();
    
    const targetGoal = isHardMode ? 10 : 5; 

    if (targetHits >= targetGoal) {
        if (targetMoveInterval) clearInterval(targetMoveInterval);
        const instEl = document.getElementById('target-instruction');
        if (instEl) {
            instEl.innerText = currentLang === 'ja' ? '🎉 クリア！音を止めます' : '🎉 Cleared!';
        }
        setTimeout(missionClear, 800);
    } else {
        moveTargetRandomly();
        if (targetMoveInterval) clearInterval(targetMoveInterval);
        const nextSpeed = Math.max(500, 1200 - (targetHits * 60)); 
        targetMoveInterval = setInterval(moveTargetRandomly, nextSpeed);
    }
}

function missTarget(event) {
    if (!isAlarmActive && !isTestMode) return;
    if (event && event.target.id === 'moving-target') return;

    if (targetHits > 0) {
        targetHits--;
    }
    updateTargetStatus();

    const area = document.getElementById('target-area');
    if (area) {
        area.style.backgroundColor = '#ff6b81';
        setTimeout(() => {
            area.style.backgroundColor = ''; 
        }, 150);
    }
}

function updateTargetStatus() {
    const targetGoal = isHardMode ? 10 : 5; 
    const statusEl = document.getElementById('target-status');
    if (!statusEl) return; 
    if (currentLang === 'ja') {
        statusEl.innerText = `撃破数: ${targetHits} / ${targetGoal}`;
    } else {
        statusEl.innerText = `Hits: ${targetHits} / ${targetGoal}`;
    }
}

// ===================================
// 4. UI操作・ユーティリティ
// ===================================
function testMission(missionType) {
    isTestMode = true;
    isAlarmActive = true; 
    currentMission = missionType;

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('help-screen').classList.add('hidden');
    const sleepScreen = document.getElementById('sleep-screen');
    if (sleepScreen) sleepScreen.classList.add('hidden');
    document.getElementById('puzzle-screen').classList.remove('hidden');

    hideAllMissions();
    document.getElementById('test-back-btn').classList.remove('hidden');
    
    startSelectedMission(currentMission);
}

function cancelTest() {
    isTestMode = false;
    isAlarmActive = false;
    currentMission = null;

    document.getElementById('puzzle-screen').classList.add('hidden');
    document.getElementById('test-back-btn').classList.add('hidden');
    document.getElementById('help-screen').classList.remove('hidden');
    document.getElementById('setup-screen').classList.add('hidden');

    hideAllMissions();

    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
}

function testAlarm() {
    const radios = document.getElementsByName('mission');
    for (let r of radios) { if (r.checked) currentMission = r.value; }
    if (!currentMission) currentMission = "watosa";

    document.getElementById('debug-back-btn').classList.remove('hidden');
    fireAlarm();
}

function showHelp() {
    if (!document.getElementById('tutorial-screen').classList.contains('hidden')) {
        lastActiveScreen = 'tutorial-screen';
    } else {
        lastActiveScreen = 'setup-screen';
    }
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('tutorial-screen').classList.add('hidden');
    document.getElementById('help-screen').classList.remove('hidden');
}

function hideHelp() {
    document.getElementById('help-screen').classList.add('hidden');
    document.getElementById(lastActiveScreen).classList.remove('hidden');
}

function showTutorial() {
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('tutorial-screen').classList.remove('hidden');
}

function hideTutorial() {
    document.getElementById('tutorial-screen').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
}

function closeToSetup() {
    document.getElementById('help-screen').classList.add('hidden');
    document.getElementById('tutorial-screen').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
}

async function requestCameraPermission() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' } 
        });
        alert("✅ カメラへのアクセスが許可されました！");
        stream.getTracks().forEach(track => track.stop());
    } catch (error) {
        console.error("カメラ許可エラー:", error);
        alert("❌ カメラが許可されませんでした。設定を確認してください。\nエラー: " + error.name);
    }
}

function requestSensorPermission() {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    isSensorPermissionGranted = true;
                    alert("✅ センサーが有効になりました！");
                } else {
                    alert("❌ センサーの使用が拒否されました。設定から許可してください。");
                }
            })
            .catch(error => {
                console.error("センサー許可エラー:", error);
                alert("❌ センサーの許可に失敗しました。");
            });
    } else {
        isSensorPermissionGranted = true; 
        alert("✅ この端末は設定不要でセンサーが有効です！");
    }
}

function switchCamera() {
    currentFacingMode = (currentFacingMode === "environment") ? "user" : "environment";
    openCamera(currentFacingMode);
}

function changeTarget() {
    fetch('/get_target')
        .then(response => response.json())
        .then(data => {
            TARGET_ITEM = data.target; 
            document.getElementById('display-target').innerText = translateItem(TARGET_ITEM); 
        });
}

function checkCamera() {
    const btn = document.querySelector('button[onclick="checkCamera()"]');
    btn.disabled = true;
    btn.style.opacity = "0.5"; 

    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const imageData = canvas.toDataURL('image/jpeg');
    const statusText = document.getElementById('camera-status');
    statusText.innerText = "判定中...";

    fetch('/check_camera', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === "success" && data.detected.includes(TARGET_ITEM)) {
            statusText.innerText = "⭕️ 正解！";
            setTimeout(missionClear, 1000);
        } else {
            const detectedJP = data.detected.map(item => translateItem(item));
            statusText.innerText = "❌ 映っていません (" + detectedJP.join(', ') + ")";
            missionFailed();
            
            btn.disabled = false;
            btn.style.opacity = "1";
        }
    })
    .catch(err => {
        console.error(err);
        statusText.innerText = "⚠️ エラーが発生しました";
        btn.disabled = false;
        btn.style.opacity = "1";
    });
}



function cancelSleep() {
    if (typeof alarmInterval !== 'undefined') {
        clearInterval(alarmInterval); 
    }
    const sleepScreen = document.getElementById('sleep-screen');
    if (sleepScreen) sleepScreen.classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
    isAlarmActive = false;

    releaseWakeLock();
    clearInterval(deepSleepInterval);
    if (sleepScreen) sleepScreen.classList.remove('deep-sleep');
}

function cancelDebugAlarm() {
    if (alarm) {
        alarm.pause();
        alarm.currentTime = 0;
    }
    document.getElementById('debug-back-btn').classList.add('hidden');
    resetToSetup();
}



function selectRandomMission() {
    const missions = Array.from(document.querySelectorAll('input[name="mission"]'));
    const checkedMission = document.querySelector('input[name="mission"]:checked');
    const availableMissions = missions.filter(m => m !== checkedMission);
    
    const randomIndex = Math.floor(Math.random() * availableMissions.length);
    availableMissions[randomIndex].checked = true;
    
    if (typeof updateSummary === 'function') {
        updateSummary();
    }
    
    const btn = document.querySelector('button[onclick="selectRandomMission()"]');
    if (btn) {
        btn.style.transform = 'scale(0.9)';
        setTimeout(() => {
            btn.style.transform = 'scale(1)';
        }, 150);
    }
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const currentTheme = localStorage.getItem('app_theme');
    if (document.body.classList.contains('dark-mode') || currentTheme === 'dark') {
        document.documentElement.style.backgroundColor = '#1a1a1a';
    } else {
        document.documentElement.style.backgroundColor = '';
    }
});

// ===================================
// ナビゲーション切り替え処理
// ===================================
function switchView(viewName, element) {
    const sleepScreen = document.getElementById('sleep-screen');
    const puzzleScreen = document.getElementById('puzzle-screen');
    
    // 睡眠中やミッション中はメニュー切り替えを無効化
    if (sleepScreen && !sleepScreen.classList.contains('hidden')) return;
    if (puzzleScreen && !puzzleScreen.classList.contains('hidden')) return;

    // 画面を切り替える時にテスト再生中なら強制ストップ
    if (typeof isPlayingTestVolume !== 'undefined' && isPlayingTestVolume) {
        if (typeof stopTestVolume === 'function') {
            stopTestVolume();
        }
    }

    const helpScreen = document.getElementById('help-screen');
    const tutorialScreen = document.getElementById('tutorial-screen');
    const setupScreen = document.getElementById('setup-screen');
    
    if (helpScreen && tutorialScreen && setupScreen) {
        helpScreen.classList.add('hidden');
        tutorialScreen.classList.add('hidden');
        setupScreen.classList.remove('hidden');
    }

    // 🌟 追加：設定メニューが開かれた時は、必ず「メインのリスト」にリセットする
    if (viewName === 'settings') {
        if (typeof closeSettingSub === 'function') {
            closeSettingSub();
        }
    }

    document.querySelectorAll('.view-section').forEach(el => {
        el.classList.add('hidden-view');
        el.classList.remove('active');
    });
    
    const targetView = document.getElementById('view-' + viewName);
    if (targetView) {
        targetView.classList.remove('hidden-view');
        targetView.classList.add('active');
    }
    
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('active');
    });
    if (element) {
        element.classList.add('active');
    }

    if (typeof updateSummary === 'function') {
        updateSummary();
    }
}

function updateSummary() {
    const checkedRadio = document.querySelector('input[name="mission"]:checked');
    if (checkedRadio) {
        const label = checkedRadio.closest('label');
        const symbol = label.querySelector('.mission-symbol').innerText.replace(/\n/g, '').trim();
        const textName = label.querySelector('.translatable').innerText;
        
        const modeText = isHardMode ? "🔥Hard" : "🔰Easy";
        
        const summaryMission = document.getElementById('summary-mission');
        if(summaryMission) summaryMission.innerText = `${symbol} ${textName}`;
        
        const diffSpan = document.getElementById('summary-difficulty');
        if (diffSpan) diffSpan.innerText = modeText;
    }

    const checkedSound = document.querySelector('input[name="alarm-sound"]:checked');
    if (checkedSound) {
        const soundNameText = checkedSound.nextElementSibling.nextElementSibling.innerText;
        const summarySoundSpan = document.getElementById('summary-sound-name');
        if (summarySoundSpan) summarySoundSpan.innerText = soundNameText;
    }
}



function applyDifficultySettings() {
    console.log("現在の難易度:", isHardMode ? "Hard" : "Easy");
    if (typeof updateSummary === 'function') {
        updateSummary();
    }
}

// ===================================
// 🌟 音量確認（テスト再生）処理 🌟
// ===================================
let isPlayingTestVolume = false;
let volumeTestTimeout; // 🌟 30秒タイマー用の変数

// 🌟 音を停止してボタンを元の「🔈 確認」に戻す関数
function stopTestVolume() {
    const btn = document.getElementById('test-volume-btn');
    if (alarm) {
        alarm.pause();
        alarm.currentTime = 0;
    }
    isPlayingTestVolume = false;
    clearTimeout(volumeTestTimeout); // 途中で止めたらタイマーも解除
    
    if (btn) {
        btn.innerText = '🔈 確認';
        btn.style.backgroundColor = '#1e3a5f';
    }
}

// 🌟 「🔈 確認」ボタンを押したときの処理
function testVolume() {
    if (isPlayingTestVolume) {
        // すでに鳴っている途中で押されたらストップ
        stopTestVolume();
    } else {
        // これからテスト再生する時の処理
        const checkedSound = document.querySelector('input[name="alarm-sound"]:checked');
        const currentSound = checkedSound ? checkedSound.value : 'alarm';
        
        if (alarm) {
            alarm.src = `static/${currentSound}.mp3`;
            alarm.volume = alarmVolume;
            alarm.loop = true; // 🌟 30秒間は途切れないように無限ループさせる
            
            const btn = document.getElementById('test-volume-btn');
            alarm.play().catch(e => console.log("再生エラー:", e));
            isPlayingTestVolume = true;
            
            if (btn) {
                btn.innerText = '⏹️ 停止';
                btn.style.backgroundColor = 'red';
            }

            // 🌟 30秒 (30000ミリ秒) 経ったら自動でストップ関数を呼ぶ
            volumeTestTimeout = setTimeout(() => {
                if (isPlayingTestVolume) {
                    stopTestVolume();
                }
            }, 15000);
        }
    }
}

// 🌟 ホームボタン用の関数（ヘッダー用）
function goToAlarmHome() {
    const alarmNavItem = document.querySelectorAll('.nav-item')[0];
    if (typeof switchView === 'function') {
        switchView('alarm', alarmNavItem);
    }
}

// ===================================
// 🌟 新しい設定画面の処理
// ===================================

// サブページ（新しいページ）を開く処理
function openSettingSub(subId) {
    // 既存の表示切り替え処理
    document.getElementById('settings-main').classList.add('hidden');
    document.querySelectorAll('.settings-sub-page').forEach(el => el.classList.add('hidden'));
    
    const target = document.getElementById('settings-sub-' + subId);
    if(target) {
        target.classList.remove('hidden');
        
        // 【重要】ここで翻訳関数を呼ぶことで、開いた瞬間に言語が適用されます
        if (typeof applyLanguageSettings === 'function') {
            applyLanguageSettings();
        }
    }
}

// サブページからメインに戻る処理
function closeSettingSub() {
    // 全てのサブページを隠す
    document.querySelectorAll('.settings-sub-page').forEach(el => el.classList.add('hidden'));
    
    // 🌟 メインの設定リストを再表示
    document.getElementById('settings-main').classList.remove('hidden');
}

// ===================================
// 🌟 新しい設定画面の処理
// ===================================

// (openSettingSub と closeSettingSub はそのままなので省略)

// テーマの変更
function setTheme(mode) {
    if (mode === 'dark') {
        document.body.classList.add('dark-mode');
        localStorage.setItem('app_theme', 'dark');
        // 👇 言語によって文字を変える
        const text = (currentLang === 'en') ? '🌙 Dark' : '🌙 ダーク';
        document.getElementById('menu-val-theme').innerText = text;
    } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('app_theme', 'light');
        // 👇 言語によって文字を変える
        const text = (currentLang === 'en') ? '☀️ Light' : '☀️ ライト';
        document.getElementById('menu-val-theme').innerText = text;
    }
}

// 難易度の変更
function setDifficulty(mode) {
    console.log("難易度変更が呼び出されました:", mode); // 👈 これで動いているか確認
    
    isHardMode = (mode === 'hard');
    localStorage.setItem('app_difficulty', mode);
    
    // 👇 言語によって文字を変える（UIの表示ラベルを更新）
    const diffLabel = document.getElementById('menu-val-diff');
    if (diffLabel) {
        if (isHardMode) {
            diffLabel.innerText = (currentLang === 'en') ? '🔥 Hard' : '🔥 Hard ';
        } else {
            diffLabel.innerText = (currentLang === 'en') ? '🔰 Easy' : '🔰 Easy ';
        }
    }

    // 両方のラジオボタンを同期
    const settingRadios = document.querySelectorAll(`input[name="setting-diff"][value="${mode}"]`);
    const missionRadios = document.querySelectorAll(`input[name="mission-diff"][value="${mode}"]`);
    
    settingRadios.forEach(r => r.checked = true);
    missionRadios.forEach(r => r.checked = true);

    applyDifficultySettings(); 
}

// 言語の変更（ここに他を更新する処理を追加）
function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('app_language', currentLang);
    document.getElementById('menu-val-lang').innerText = (lang === 'ja') ? '🇯🇵 日本語' : '🇺🇸 English';
    applyLanguageSettings();
    
    // 👇 追加：言語を変えた瞬間に、テーマと難易度のサマリーも再翻訳する
    const currentTheme = localStorage.getItem('app_theme') || 'light';
    setTheme(currentTheme); 
    
    const currentDiff = localStorage.getItem('app_difficulty') || 'hard';
    setDifficulty(currentDiff);
    
    // 画面切り替え時に問題の言語も即座に更新する
    if (currentMission === 'stroop' && typeof renderStroopQuestion === 'function') renderStroopQuestion();
    if (currentMission === 'odd_one' && typeof updateOddOneStatusText === 'function') updateOddOneStatusText();
    if (currentMission === 'target' && typeof updateTargetStatus === 'function') updateTargetStatus();
}

// ===================================
// 🌟 フィードバック機能
// ===================================
function openFeedback() {
    // ユーザー指定のGoogleフォームURL
    const formUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSeL1KsWeQ-v5-m7s1EgkadXuIrmQ9AnjU2jbAh09VuuccDEUg/viewform?usp=header';
    // 新しいタブでフォームを開く
    window.open(formUrl, '_blank');
}

// ===================================
// 🌟 AI言い訳生成機能
// ===================================
function generateExcuse() {
    const resultBox = document.getElementById('excuse-result-box');
    const excuseText = document.getElementById('excuse-text');
    const btn = document.querySelector('button[onclick="generateExcuse()"]');
    const actionBtns = document.getElementById('excuse-actions');
    
    // 選ばれた「相手」と「文体」と「状況」を取得
    const targetRadio = document.querySelector('input[name="ai-target"]:checked');
    const selectedTarget = targetRadio ? targetRadio.value : 'boss';

    const toneRadio = document.querySelector('input[name="ai-tone"]:checked');
    const selectedTone = toneRadio ? toneRadio.value : 'simple';

    const situationInput = document.getElementById('custom-situation');
    const customSituation = situationInput ? situationInput.value.trim() : '';

    // UIを「生成中」の状態にする
    resultBox.classList.remove('hidden');
    actionBtns.classList.add('hidden');
    excuseText.innerText = (currentLang === 'ja') ? "言い訳を練り上げています..." : "Thinking of an excuse...";
    btn.disabled = true;
    btn.style.opacity = "0.5";

    // Flaskのバックエンドにリクエストを送信
    fetch('/generate_excuse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: selectedTarget, tone: selectedTone, situation: customSituation })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === "success") {
            excuseText.innerText = data.excuse;
            actionBtns.classList.remove('hidden'); // 成功したらボタンを表示！
        } else {
            excuseText.innerText = "エラー：" + data.excuse;
        }
    })
    .catch(error => {
        console.error("通信エラー:", error);
        excuseText.innerText = (currentLang === 'ja') ? "通信エラーが発生しました。急いで謝りましょう。" : "Connection error. Just apologize sincerely.";
    })
    .finally(() => {
        btn.disabled = false;
        btn.style.opacity = "1";
    });
}


    // 診断レポートを取得する関数
async function generateReport() {
    const reportArea = document.getElementById('report-result');
    reportArea.innerText = "AIが分析中...";

    try {
        const response = await fetch('/generate_report');
        const data = await response.json();
        reportArea.innerText = data.report;
    } catch (error) {
        reportArea.innerText = "エラー：レポートの生成に失敗しました。";
    }
}

// ===================================
// 🌟 コピー・LINE共有機能
// ===================================
function copyExcuse() {
    const excuseText = document.getElementById('excuse-text').innerText;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(excuseText).then(() => {
            alert('📋 コピーしました！');
        }).catch(() => {
            fallbackCopy(excuseText);
        });
    } else {
        fallbackCopy(excuseText);
    }
}

function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    alert('📋 コピーしました！');
}

function shareLine() {
    const excuseText = document.getElementById('excuse-text').innerText;
    const lineUrl = `https://line.me/R/msg/text/?${encodeURIComponent(excuseText)}`;

    // noreferrerを指定してリファラ（アプリURL）がLINEに渡らないようにする
    const a = document.createElement('a');
    a.href = lineUrl;
    a.target = '_blank';
    a.rel = 'noreferrer noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}