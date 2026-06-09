// ===================================
// 1. グローバル変数・初期設定
// ===================================
const alarm = document.getElementById('alarmSound');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');

let currentMission = "";
let isAlarmActive = false;
let alarmInterval;
let alarmTargetTime = 0;       // アラームを鳴らす目標時刻（ミリ秒）。過ぎたら発動する
let currentFacingMode = "environment";
let alarmVolume = 0.8; 
let TARGET_ITEM = ""; 
let isSensorPermissionGranted = false;
let lastActiveScreen = "setup-screen";
let isTestMode = false;
let currentLang = 'ja';
let isHardMode = true;

// 🌟 睡眠ログ記録用
let isRealSleep = false;     // 本物の睡眠か（テスト・デバッグと区別するため）
let alarmFiredTime = 0;      // アラーム発動時刻（ミリ秒）
let currentWakeTime = "";    // 起床の設定時刻

// ===================================
// 言語設定の初期化・適用（共通化）
// ===================================
function applyLanguageSettings() {
    const savedLang = localStorage.getItem('app_language');
    if (savedLang) currentLang = savedLang; 
    document.documentElement.lang = currentLang === 'en' ? 'en' : 'ja';

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

    document.querySelectorAll('[data-placeholder-ja][data-placeholder-en]').forEach(el => {
        el.setAttribute('placeholder', el.getAttribute(`data-placeholder-${currentLang}`));
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
    if (document.visibilityState !== 'visible') return;

    if (wakeLock !== null) requestWakeLock();

    // 🌟 バックグラウンドでタイマーが止まっていても、睡眠待機中に画面へ復帰したら
    //    目標時刻を過ぎていないか確認し、過ぎていれば即アラームを鳴らす
    const sleepScreen = document.getElementById('sleep-screen');
    const isSleeping = sleepScreen && !sleepScreen.classList.contains('hidden');
    if (isSleeping && !isAlarmActive && alarmTargetTime && Date.now() >= alarmTargetTime) {
        if (alarmInterval) { clearInterval(alarmInterval); alarmInterval = null; }
        fireAlarm();
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

        // 🌅 星座の復元（前回選んだ星座を覚えておく）
        const savedZodiac = localStorage.getItem('app_zodiac');
        if (savedZodiac) {
            const zSel = document.getElementById('zodiac-select');
            if (zSel) zSel.value = savedZodiac;
        }

        document.querySelectorAll('input[name="alarm-sound"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                localStorage.setItem('app_alarm_sound', e.target.value);
                if (typeof cloudSyncIfLoggedIn === 'function') cloudSyncIfLoggedIn();
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

        // 🌤 天気を自動取得（位置情報が許可済みなら即表示、初回はブラウザが確認ダイアログを出す）
        setTimeout(initWeather, 400);

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
            const volPctEl = document.getElementById('volume-pct');
            if (volPctEl) volPctEl.innerText = pct;
            const summaryVol = document.getElementById('summary-volume');
            if (summaryVol) summaryVol.innerText = pct;
            if (alarm) alarm.volume = alarmVolume;
        });
    }

    // 🌟 ヒーローカードの時刻をalarm-time変更に同期
    const alarmTimeInput = document.getElementById('alarm-time');
    if (alarmTimeInput) {
        alarmTimeInput.addEventListener('change', (e) => syncHeroTime(e.target.value));
        alarmTimeInput.addEventListener('input',  (e) => syncHeroTime(e.target.value));
        // PC・スマホどちらでもピッカーを確実に開く（Chrome desktop 対応）
        alarmTimeInput.addEventListener('click', () => {
            if (typeof alarmTimeInput.showPicker === 'function') {
                try { alarmTimeInput.showPicker(); } catch (e) {}
            }
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
        // 🌟 ヒーローカードに現在時刻を反映
        syncHeroTime(timeInput.value);
    }

    const displayTarget = document.getElementById('display-target');
    if (displayTarget) {
        TARGET_ITEM = displayTarget.innerText.trim();
        displayTarget.innerText = translateItem(TARGET_ITEM);
    }
}

// ヒーローカードの時刻表示を同期する
function syncHeroTime(value) {
    const heroDisplay = document.getElementById('hero-time-display');
    if (heroDisplay) heroDisplay.innerText = value || '--:--';
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
        showAlert("時間を入力してください！⏰");
        return;
    }

    // 🌟 センサー許可はここでは求めない。
    //    カメラ許可がカメラミッション起動時に出るのと同様に、
    //    シェイクミッション起動時（startShakeMission）に許可を求める。

    if (alarm) {
        alarm.muted = true; // 🌟 iOSはvolume=0が無視されるため、mutedで確実に無音化（アンロック時の誤鳴り防止）
        try {
            await alarm.play();
            alarm.pause();
            alarm.currentTime = 0;
        } catch (e) {
            console.log("再生準備中...");
        }
        alarm.muted = false; // 本番のアラームは鳴らせるよう必ず戻す
    }

    const radios = document.getElementsByName('mission');
    for (let r of radios) { if (r.checked) currentMission = r.value; }

    currentWakeTime = timeInput;

    // 🌟 睡眠データを保存するか確認（1日1回・上書き可、アプリ内ダイアログ）
    const saveResult = await askToSaveSleepLog();
    // 「← アラーム画面に戻る」が選ばれたら、睡眠モードに入らずアラーム画面のまま
    if (saveResult === 'back') return;
    isRealSleep = saveResult;

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('sleep-screen').classList.remove('hidden');

    requestWakeLock();
    resetDeepSleepTimer(30000);

    // 🌟 目標時刻をミリ秒で確定（設定時刻が現在以前なら翌日に鳴らす）
    const [targetH, targetM] = timeInput.split(':').map(Number);
    const targetDate = new Date();
    targetDate.setHours(targetH, targetM, 0, 0);
    if (targetDate.getTime() <= Date.now()) {
        targetDate.setDate(targetDate.getDate() + 1);
    }
    alarmTargetTime = targetDate.getTime();

    alarmInterval = setInterval(() => {
        const sleepInfo = document.getElementById('sleep-info');
        if (sleepInfo) sleepInfo.innerText = `設定時間: ${timeInput}`;

        // 🌟 「ちょうどの分」一致ではなく「目標時刻を過ぎたか」で判定する。
        //    画面OFFやバックグラウンドでタイマーが間引かれても、過ぎていれば確実に鳴る。
        if (Date.now() >= alarmTargetTime) {
            clearInterval(alarmInterval);
            alarmInterval = null;
            fireAlarm();
        }
    }, 1000);
}

function fireAlarm() {
    isAlarmActive = true;
    alarmFiredTime = Date.now(); // 🌟 アラーム発動時刻を記録（目覚めにかかる時間の計測用）

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
        
        alarm.muted = false; // 🌟 アンロックでmuted化された状態を必ず解除して鳴らす
        alarm.volume = alarmVolume;
        alarm.loop = true;
        alarm.play().catch(e => console.log("再生エラー:", e));
    }
}

async function missionClear() {
    isAlarmActive = false;
    if (alarm) alarm.pause();
    
    if (isTestMode) {
        isTestMode = false;
        await showAlert("テストクリア！バッチリです👍");
        resetToSetup();
        return;
    }

    // 🌟 本物の睡眠ならログを記録（テスト・デバッグ発動は除外）
    if (isRealSleep) {
        const duration = Math.round((Date.now() - alarmFiredTime) / 1000);
        saveSleepLog(duration, true);
        isRealSleep = false;
    }

    await showAlert("完全勝利！おはようございます☀️");
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
                    showAlert("❌ センサーが拒否されました。設定から許可してください。");
                    return; 
                }
            } catch (error) {
                console.error("センサー許可エラー:", error);
                showAlert("⚠️ センサーを起動するには、画面を一度タップしてください。");
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
        showAlert("カメラエラー: " + err.name + " \n" + err.message);
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
let memoryReplayUsed = false;  // 各ラウンドで「もう一回見る」を使ったか（1ラウンド1回のみ）
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
    const replayBtn = document.getElementById('memory-replay-btn');
    if (replayBtn) replayBtn.disabled = true; // お題が光り終わるまでは押せない
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
    memoryReplayUsed = false; // 新しいお題になったら「もう一回見る」を再び1回使える
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
    const replayBtn = document.getElementById('memory-replay-btn');
    if (replayBtn) replayBtn.disabled = true; // 再生中は押せない（連打防止）

    // 🌟 問題が始まる瞬間に「正解！」などのメッセージを綺麗に消す
    document.getElementById('memory-feedback').innerText = '';

    const instructionEl = document.getElementById('memory-instruction');
    instructionEl.innerText = currentLang === 'ja' ? '👀 覚えろ！' : '👀 Watch!';
    instructionEl.style.color = '#3498db';

    let i = 0;
    const interval = setInterval(() => {
        if (!isAlarmActive && !isTestMode) { clearInterval(interval); return; }

        if (i >= memorySequence.length) {
            clearInterval(interval);
            isMemoryPlaying = false;
            instructionEl.innerText = currentLang === 'ja' ? '👉 同じ順にタップ！' : '👉 Your turn!';
            instructionEl.style.color = '#e67e22';
            if (replayBtn) replayBtn.disabled = memoryReplayUsed; // 未使用なら有効化（使用済みなら押せないまま）
            return;
        }
        flashMemoryButton(memorySequence[i]);
        i++;
    }, 800);
}

// 🌟 「もう一回見る」：今出題されているお題（memorySequence）をもう一度光らせる
function replayMemorySequence() {
    if (!isAlarmActive && !isTestMode) return;
    if (isMemoryPlaying) return;                          // 再生中は無視
    if (memoryReplayUsed) return;                         // このお題ではもう使った（1回のみ）
    if (!memorySequence || memorySequence.length === 0) return;

    memoryReplayUsed = true;                              // 使用済みにする（次のお題まで押せない）
    memoryPlayerSequence = [];                            // 入力途中ならリセットして最初から
    playMemorySequence();                                 // 同じお題をもう一度再生
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

    isRealSleep = false; // 🌟 デバッグ発動なので記録対象から外す

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
        showAlert("✅ カメラへのアクセスが許可されました！");
        stream.getTracks().forEach(track => track.stop());
    } catch (error) {
        console.error("カメラ許可エラー:", error);
        showAlert("❌ カメラが許可されませんでした。設定を確認してください。\nエラー: " + error.name);
    }
}

function requestSensorPermission() {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    isSensorPermissionGranted = true;
                    showAlert("✅ センサーが有効になりました！");
                } else {
                    showAlert("❌ センサーの使用が拒否されました。設定から許可してください。");
                }
            })
            .catch(error => {
                console.error("センサー許可エラー:", error);
                showAlert("❌ センサーの許可に失敗しました。");
            });
    } else {
        isSensorPermissionGranted = true; 
        showAlert("✅ この端末は設定不要でセンサーが有効です！");
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
    isRealSleep = false; // 🌟 睡眠を中止したので記録対象から外す

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
        document.documentElement.style.backgroundColor = '#121212';
    } else {
        document.documentElement.style.backgroundColor = '';
    }
});

// ===================================
// ナビゲーション切り替え処理
// ===================================
function switchView(viewName, element) {
    // 画面を切り替えるときは朝メッセージの音声読み上げを止める
    if ('speechSynthesis' in window) speechSynthesis.cancel();

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

    // 天気詳細ページを開いていたら閉じる
    const weatherScreen = document.getElementById('weather-screen');
    if (weatherScreen) weatherScreen.classList.add('hidden');

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
            alarm.muted = false; // 🌟 アンロックでmuted化されていても音量確認は鳴らす
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
        // アカウント画面を開いたら最新のログイン・メール確認状態を反映
        if (subId === 'account' && typeof refreshAccountUI === 'function') refreshAccountUI();
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
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (mode === 'dark') {
        document.body.classList.add('dark-mode');
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.style.backgroundColor = '#121212';
        if (themeMeta) themeMeta.setAttribute('content', '#121212');
        localStorage.setItem('app_theme', 'dark');
        // 👇 言語によって文字を変える
        const text = (currentLang === 'en') ? '🌙 Dark' : '🌙 ダーク';
        document.getElementById('menu-val-theme').innerText = text;
    } else {
        document.body.classList.remove('dark-mode');
        document.documentElement.setAttribute('data-theme', 'light');
        document.documentElement.style.backgroundColor = '#ffffff';
        if (themeMeta) themeMeta.setAttribute('content', '#ffffff');
        localStorage.setItem('app_theme', 'light');
        // 👇 言語によって文字を変える
        const text = (currentLang === 'en') ? '☀️ Light' : '☀️ ライト';
        document.getElementById('menu-val-theme').innerText = text;
    }
    if (typeof cloudSyncIfLoggedIn === 'function') cloudSyncIfLoggedIn();
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
    if (typeof cloudSyncIfLoggedIn === 'function') cloudSyncIfLoggedIn(); 
}

// 言語の変更（ここに他を更新する処理を追加）
function setLanguage(lang) {
    const previousLang = currentLang;
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

    if (previousLang !== lang && _lastWeather) {
        clearWeatherCache();
        initWeather();
    }
    // アカウントのメニュー表示を現在の言語・ログイン状態で更新（translatableの上書き対策）
    if (typeof refreshAccountLabel === 'function') refreshAccountLabel();
    if (typeof cloudSyncIfLoggedIn === 'function') cloudSyncIfLoggedIn();
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
        body: JSON.stringify({ target: selectedTarget, tone: selectedTone, situation: customSituation, lang: currentLang })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === "success") {
            excuseText.innerText = data.excuse;
            actionBtns.classList.remove('hidden'); // 成功したらボタンを表示！
        } else {
            excuseText.innerText = (currentLang === 'ja' ? "エラー：" : "Error: ") + data.excuse;
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


// ===================================
// 🌟 睡眠ログの記録（localStorage）
// ===================================

// アプリ内の確認ダイアログ（Promiseでtrue/falseを返す）
function showConfirm(message, okLabel, cancelLabel, backLabel) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const textEl = document.getElementById('confirm-modal-text');
        const okBtn = document.getElementById('confirm-modal-ok');
        const cancelBtn = document.getElementById('confirm-modal-cancel');
        const backBtn = document.getElementById('confirm-modal-back');

        // モーダル要素が無ければ標準confirmにフォールバック
        if (!modal || !textEl || !okBtn || !cancelBtn) {
            resolve(window.confirm(message));
            return;
        }

        textEl.innerText = message;
        okBtn.innerText = okLabel || 'OK';
        cancelBtn.innerText = cancelLabel || (currentLang === 'ja' ? 'キャンセル' : 'Cancel');
        cancelBtn.style.display = ''; // showAlertで隠れていた場合に戻す

        // 第3の選択肢「戻る」（backLabel指定時のみ表示）
        if (backBtn) {
            if (backLabel) {
                backBtn.innerText = backLabel;
                backBtn.classList.remove('hidden');
            } else {
                backBtn.classList.add('hidden');
            }
        }

        modal.classList.remove('hidden');

        const close = (result) => {
            modal.classList.add('hidden');
            okBtn.onclick = null;
            cancelBtn.onclick = null;
            if (backBtn) { backBtn.onclick = null; backBtn.classList.add('hidden'); }
            resolve(result);
        };
        okBtn.onclick = () => close(true);
        cancelBtn.onclick = () => close(false);
        if (backBtn) backBtn.onclick = () => close('back');
    });
}

// アプリ内の通知ダイアログ（OKボタンのみ・alertの代替）
function showAlert(message, okLabel) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const textEl = document.getElementById('confirm-modal-text');
        const okBtn = document.getElementById('confirm-modal-ok');
        const cancelBtn = document.getElementById('confirm-modal-cancel');

        // モーダル要素が無ければ標準alertにフォールバック
        if (!modal || !textEl || !okBtn || !cancelBtn) {
            window.alert(message);
            resolve();
            return;
        }

        textEl.innerText = message;
        okBtn.innerText = okLabel || 'OK';
        cancelBtn.style.display = 'none'; // 通知ではキャンセル不要
        const backBtn = document.getElementById('confirm-modal-back');
        if (backBtn) backBtn.classList.add('hidden'); // 通知では戻るも不要
        modal.classList.remove('hidden');

        const close = () => {
            modal.classList.add('hidden');
            okBtn.onclick = null;
            resolve();
        };
        okBtn.onclick = close;
    });
}

// 睡眠データを保存するか確認する（1日1回・上書き可）
async function askToSaveSleepLog() {
    let logs = [];
    try { logs = JSON.parse(localStorage.getItem('sleep_logs') || '[]'); } catch (e) { logs = []; }

    // 今日の日付（YYYY-MM-DD）
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const backLabel = currentLang === 'ja' ? '← アラーム画面に戻る' : '← Back to alarm';

    // 今日すでに記録済みなら「上書きするか」を確認
    const alreadyToday = logs.some(l => (l.date || '').startsWith(today));
    if (alreadyToday) {
        return await showConfirm(
            currentLang === 'ja'
                ? "📊 今日の睡眠データはすでに記録済みです。\n新しいデータで上書きしますか？\n（古い記録は消え、最新の1件に置き換わります）"
                : "📊 Today's data is already recorded.\nOverwrite with the new data?\n(The old record will be replaced)",
            currentLang === 'ja' ? '上書きする' : 'Overwrite',
            currentLang === 'ja' ? '上書きしない' : "Don't overwrite",
            backLabel
        );
    }

    // まだ記録が無いとき → 保存するか確認（OKで記録、キャンセルで記録せずアラームのみ使用）
    return await showConfirm(
        currentLang === 'ja'
            ? "この睡眠データを保存しますか？\n※1日1回のみ保存・分析できます"
            : "Save this sleep data?\n*Data can be saved/analyzed only once per day",
        currentLang === 'ja' ? '保存する' : 'Save',
        currentLang === 'ja' ? 'キャンセル' : 'Cancel',
        backLabel
    );
}

function saveSleepLog(duration, success) {
    const missionNames = {
        'watosa': '加減算', 'sekitosyou': '乗除算', 'shake': 'シェイク',
        'kamera': 'AIカメラ', 'stroop': '色当て', 'odd_one': 'ニセモノ探し',
        'memory': '瞬間記憶', 'target': '動く的当て'
    };
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const log = {
        date: `${todayStr} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
        day_of_week: days[now.getDay()],
        wake_time: currentWakeTime,
        duration: duration,
        mission: missionNames[currentMission] || currentMission,
        success: success
    };

    let logs = [];
    try {
        logs = JSON.parse(localStorage.getItem('sleep_logs') || '[]');
    } catch (e) {
        logs = [];
    }

    // 🌟 今日の既存記録を除外してから追加（上書き＝1日1件を保証）
    logs = logs.filter(l => !(l.date || '').startsWith(todayStr));
    logs.push(log);

    // 直近100件のみ保持（容量対策）
    if (logs.length > 100) logs = logs.slice(-100);

    localStorage.setItem('sleep_logs', JSON.stringify(logs));
    if (typeof cloudSyncIfLoggedIn === 'function') cloudSyncIfLoggedIn();
}

// ===================================
// 🌟 診断レポート（グラフ＋サマリー＋AI）
// ===================================
let durationChart = null;
let currentReportPeriod = 'week'; // レポートの表示期間（week / month / year）

// 秒数を「○分○秒」形式に整形
function formatDuration(sec) {
    sec = Math.round(sec);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (currentLang === 'ja') return m > 0 ? `${m}分${s}秒` : `${s}秒`;
    return m > 0 ? `${m}m${s}s` : `${s}s`;
}

async function generateReport() {
    const content = document.getElementById('report-content');
    const emptyMsg = document.getElementById('report-empty-msg');
    const reportArea = document.getElementById('report-result');

    // localStorageから起床ログを取得
    let logs = [];
    try {
        logs = JSON.parse(localStorage.getItem('sleep_logs') || '[]');
    } catch (e) {
        logs = [];
    }

    // データが無いとき
    if (logs.length === 0) {
        if (content) content.classList.add('hidden');
        if (emptyMsg) {
            emptyMsg.classList.remove('hidden');
            emptyMsg.innerText = (currentLang === 'ja')
                ? "まだ起床データがありません。アラームをクリアすると記録されます！"
                : "No wake-up data yet. Clear an alarm to start recording!";
        }
        return;
    }

    // 結果エリアを表示
    if (emptyMsg) emptyMsg.classList.add('hidden');
    if (content) content.classList.remove('hidden');

    // 📊 サマリー数字とグラフを描画（選択中の期間で。AIを待たずに即表示）
    renderReportView();

    // 🤖 AIアドバイスを取得
    reportArea.innerText = (currentLang === 'ja') ? "AIが分析中..." : "AI is analyzing...";
    try {
        const response = await fetch('/generate_report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ logs: logs, lang: currentLang })
        });
        const data = await response.json();
        reportArea.innerText = data.report;
    } catch (error) {
        reportArea.innerText = (currentLang === 'ja')
            ? "エラー：レポートの生成に失敗しました。"
            : "Error: Failed to generate report.";
    }
}

// 📊 サマリー数字（平均・最速・記録日数）を描画
function renderReportStats(logs) {
    const statsEl = document.getElementById('report-stats');
    if (!statsEl) return;

    const durations = logs.map(l => Number(l.duration)).filter(d => !isNaN(d));
    const lbl = (currentLang === 'ja')
        ? { avg: '平均の目覚め', best: '最速記録', count: '記録日数' }
        : { avg: 'Average', best: 'Best', count: 'Days' };

    const avg = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
    const best = durations.length > 0 ? Math.min(...durations) : null;
    const count = logs.length;

    const avgText = avg === null ? '--' : formatDuration(avg);
    const bestText = best === null ? '--' : formatDuration(best);
    const countText = (currentLang === 'ja') ? `${count}日` : `${count}`;

    statsEl.innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${avgText}</div>
            <div class="stat-label">${lbl.avg}</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${bestText}</div>
            <div class="stat-label">${lbl.best}</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${countText}</div>
            <div class="stat-label">${lbl.count}</div>
        </div>
    `;
}

// 📈 目覚め時間の推移グラフ（直近7件）を描画
function renderDurationChart(logs, period = 'week') {
    const canvas = document.getElementById('duration-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    let labels = [];
    let data = [];

    if (period === 'year') {
        // 年間：直近12ヶ月の「月別平均（秒）」を集計
        const monthsEn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const buckets = {}; // "YYYY-MM" -> { sum, count }
        logs.forEach(l => {
            const key = (l.date || '').slice(0, 7); // YYYY-MM
            const dur = Number(l.duration);
            if (!key || isNaN(dur)) return;
            if (!buckets[key]) buckets[key] = { sum: 0, count: 0 };
            buckets[key].sum += dur;
            buckets[key].count++;
        });
        const now = new Date();
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const b = buckets[key];
            labels.push(currentLang === 'ja' ? `${d.getMonth() + 1}月` : monthsEn[d.getMonth()]);
            data.push(b ? Math.round(b.sum / b.count) : 0);
        }
    } else {
        // 週間（直近7件）／月間（直近31件）：日別
        const n = (period === 'month') ? 31 : 7;
        const recent = logs.slice(-n);
        labels = recent.map(l => (l.date || '').slice(5, 10)); // MM-DD
        data = recent.map(l => Number(l.duration) || 0);
    }

    const isDark = document.body.classList.contains('dark-mode');
    const tickColor = isDark ? '#ccc' : '#555';
    const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';

    const datasetLabel = (period === 'year')
        ? (currentLang === 'ja' ? '月平均（秒）' : 'Monthly avg (s)')
        : (currentLang === 'ja' ? '目覚め時間（秒）' : 'Wake time (s)');

    // 前回のグラフが残っていれば破棄（重複描画を防ぐ）
    if (durationChart) durationChart.destroy();

    durationChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: datasetLabel,
                data: data,
                backgroundColor: '#5c9dd5',
                borderRadius: 6,
                maxBarThickness: 40
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: tickColor },
                    grid: { color: gridColor },
                    title: { display: true, text: (currentLang === 'ja') ? '秒' : 'sec', color: tickColor }
                },
                x: {
                    ticks: { color: tickColor, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
                    grid: { display: false }
                }
            }
        }
    });
}

// 指定期間のログだけ抽出（week/monthは直近件数、yearは直近365日）
function filterLogsByPeriod(logs, period) {
    if (period === 'week') return logs.slice(-7);
    if (period === 'month') return logs.slice(-31);

    let days = 7;
    if (period === 'year') days = 365;

    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - (days - 1));

    return logs.filter(l => {
        const ds = (l.date || '').slice(0, 10);
        if (!ds) return false;
        const d = new Date(ds + 'T00:00:00');
        return !isNaN(d) && d >= cutoff;
    });
}

// 選択中の期間でサマリー・グラフを再描画（AIアドバイスは再取得しない）
function renderReportView() {
    let logs = [];
    try {
        logs = JSON.parse(localStorage.getItem('sleep_logs') || '[]');
    } catch (e) {
        logs = [];
    }
    const filtered = filterLogsByPeriod(logs, currentReportPeriod);
    renderReportStats(filtered);
    renderDurationChart(filtered, currentReportPeriod);
}

// 期間タブ（週間／月間／年間）の切り替え
function setReportPeriod(period, btn) {
    currentReportPeriod = period;
    document.querySelectorAll('.report-period-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderReportView();
}

// ===================================
// 🌤 天気ウィジェット（Open-Meteo / 無料・APIキー不要）
// ===================================
const WMO_CODES = {
    0:  { ja: '快晴',           en: 'Clear sky',           icon: '☀️'  },
    1:  { ja: '晴れ',           en: 'Mainly clear',        icon: '🌤️' },
    2:  { ja: '部分曇り',       en: 'Partly cloudy',       icon: '⛅'  },
    3:  { ja: '曇り',           en: 'Overcast',            icon: '☁️'  },
    45: { ja: '霧',             en: 'Fog',                 icon: '🌫️' },
    48: { ja: '霧',             en: 'Icy fog',             icon: '🌫️' },
    51: { ja: '小雨',           en: 'Light drizzle',       icon: '🌦️' },
    53: { ja: '霧雨',           en: 'Drizzle',             icon: '🌧️' },
    55: { ja: '強い霧雨',       en: 'Dense drizzle',       icon: '🌧️' },
    61: { ja: '小雨',           en: 'Light rain',          icon: '🌧️' },
    63: { ja: '雨',             en: 'Moderate rain',       icon: '🌧️' },
    65: { ja: '大雨',           en: 'Heavy rain',          icon: '🌧️' },
    71: { ja: '小雪',           en: 'Light snow',          icon: '🌨️' },
    73: { ja: '雪',             en: 'Snow',                icon: '❄️'  },
    75: { ja: '大雪',           en: 'Heavy snow',          icon: '❄️'  },
    77: { ja: 'みぞれ',         en: 'Snow grains',         icon: '🌨️' },
    80: { ja: 'にわか雨',       en: 'Rain showers',        icon: '🌦️' },
    81: { ja: '強いにわか雨',   en: 'Heavy showers',       icon: '🌧️' },
    82: { ja: '激しいにわか雨', en: 'Violent showers',     icon: '⛈️' },
    85: { ja: 'にわか雪',       en: 'Snow showers',        icon: '🌨️' },
    86: { ja: '強いにわか雪',   en: 'Heavy snow showers',  icon: '❄️'  },
    95: { ja: '雷雨',           en: 'Thunderstorm',        icon: '⛈️' },
    96: { ja: '雷雨（ひょう）', en: 'Thunderstorm w/ hail',icon: '⛈️' },
    99: { ja: '激しい雷雨',     en: 'Thunderstorm',        icon: '⛈️' },
};

// 最後に取得した天気データ（詳細ページの描画に使うため保持）
let _lastWeather = null;
let _selectedDayIdx = -1; // 詳細ページで選択中の日（daily配列のindex）

async function initWeather() {
    // ローディング表示
    const loadEl    = document.getElementById('weather-state-loading');
    const errEl     = document.getElementById('weather-state-error');
    const contentEl = document.getElementById('weather-state-content');
    if (!loadEl) return;

    loadEl.classList.remove('hidden');
    errEl.classList.add('hidden');
    contentEl.classList.add('hidden');

    // ① 30分以内のキャッシュがあれば再利用
    try {
        const cached = JSON.parse(localStorage.getItem('weather_cache') || 'null');
        if (cached && cached.v === 3 && cached.lang === currentLang && (Date.now() - cached.ts) < 30 * 60 * 1000) {
            _renderWeatherData(cached.weather, cached.city);
            return;
        }
    } catch (_) {}

    // ② 位置情報を取得（PCはGPSが無く失敗しやすいので、失敗時はIP測位へフォールバック）
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                _fetchWeatherByCoords(
                    pos.coords.latitude.toFixed(4),
                    pos.coords.longitude.toFixed(4),
                    null
                );
            },
            () => {
                // 位置情報が拒否／失敗 → IPベースの大まかな位置で取得（PCでも天気が出る）
                _fetchWeatherByIP();
            },
            { timeout: 8000, maximumAge: 300000 }
        );
    } else {
        _fetchWeatherByIP();
    }
}

// IPアドレスから大まかな位置を取得して天気を出す（geolocationフォールバック）
async function _fetchWeatherByIP() {
    const providers = [
        'https://ipapi.co/json/',
        'https://ipwho.is/'
    ];
    for (const url of providers) {
        try {
            const d = await fetch(url).then(r => r.json());
            if (d && d.latitude && d.longitude) {
                _fetchWeatherByCoords(d.latitude, d.longitude, null);
                return;
            }
        } catch (_) { /* 次のプロバイダを試す */ }
    }
    _showWeatherError(currentLang === 'ja' ? '位置情報を取得できませんでした' : 'Could not get location');
}

// 緯度経度から天気（現在＋7日間）を取得して描画する
async function _fetchWeatherByCoords(lat, lon, cityName) {
    try {
        const weatherPromise = fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
            `&current=temperature_2m,weather_code` +
            `&hourly=temperature_2m,precipitation_probability,precipitation,weather_code` +
            `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code` +
            `&timezone=auto&past_days=3&forecast_days=7`
        ).then(r => r.json());

        // 市区町村名が未取得なら逆ジオコーディング
        const cityPromise = cityName
            ? Promise.resolve(cityName)
            : fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=${currentLang}`)
                .then(r => r.json())
                .then(d => d.city || d.locality || d.principalSubdivision || '')
                .catch(() => '');

        const [weatherData, city] = await Promise.all([weatherPromise, cityPromise]);

        localStorage.setItem('weather_cache', JSON.stringify({
            weather: weatherData, city: city, lang: currentLang, ts: Date.now(), v: 3
        }));
        _renderWeatherData(weatherData, city);
    } catch (_) {
        _showWeatherError(currentLang === 'ja' ? '天気の取得に失敗しました' : 'Failed to fetch weather');
    }
}

function _renderWeatherData(data, cityName) {
    const loadEl    = document.getElementById('weather-state-loading');
    const contentEl = document.getElementById('weather-state-content');
    if (!loadEl || !contentEl) return;

    _lastWeather = { data, city: cityName }; // 詳細ページ用に保持

    const cur   = data.current;
    const daily = data.daily;
    const code  = cur.weather_code;
    const w     = WMO_CODES[code] || { ja: '不明', en: 'Unknown', icon: '🌡️' };

    const tempNow  = Math.round(cur.temperature_2m);
    const todayIdx = _findTodayIndex(daily);
    const tempMax  = Math.round(daily.temperature_2m_max[todayIdx]);
    const tempMin  = Math.round(daily.temperature_2m_min[todayIdx]);
    const precip   = (daily.precipitation_sum[todayIdx] ?? 0).toFixed(1);
    const pop      = daily.precipitation_probability_max?.[todayIdx] ?? '--';

    const now     = new Date();
    const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    document.getElementById('weather-icon').textContent      = w.icon;
    document.getElementById('weather-cond').textContent      = currentLang === 'ja' ? w.ja : w.en;
    document.getElementById('weather-temp').textContent      = `${tempNow}°C`;
    document.getElementById('weather-range').textContent     = `${tempMin}〜${tempMax}°`;
    document.getElementById('weather-pop').textContent       = `☔ ${pop}%`;
    document.getElementById('weather-precip').textContent    = `💧 ${precip}mm`;
    document.getElementById('weather-updated').textContent   = `🕐 ${timeStr}`;

    const cityEl = document.getElementById('weather-city');
    if (cityName) {
        cityEl.textContent = `📍 ${cityName}`;
        cityEl.classList.remove('hidden');
    } else {
        cityEl.classList.add('hidden');
    }

    // 🌤 詳細ページ（hero＋週間予報）も最新データで埋めておく
    _fillWeatherDetail();

    loadEl.classList.add('hidden');
    contentEl.classList.remove('hidden');
}

// 詳細ページ全体（現在天気＋指標＋1時間ごと＋日別）を最新データで描画
function _fillWeatherDetail() {
    if (!_lastWeather) return;
    const daily = _lastWeather.data.daily;
    const todayIdx = _findTodayIndex(daily);

    // 週間予報を先に描画 → 今日を選択
    // （hero・サマリー・1時間ごとの描画は selectWeatherDay 側に集約。スクロールはしない）
    _renderWeeklyForecast(daily, 'weather-week-detail');
    selectWeatherDay(todayIdx, false);
}

// daily配列の中で「今日」に当たるindexを返す（past_days対応）
function _findTodayIndex(daily) {
    if (!daily || !daily.time) return 0;
    const todayStr = new Date().toDateString();
    for (let i = 0; i < daily.time.length; i++) {
        if (new Date(daily.time[i] + 'T00:00:00').toDateString() === todayStr) return i;
    }
    return Math.min(3, daily.time.length - 1);
}

// 日別の行を選択 → その日の1時間ごと予報＋サマリーを表示
function selectWeatherDay(idx, scrollToTop = true) {
    if (!_lastWeather) return;
    const daily = _lastWeather.data.daily;
    if (!daily || idx < 0 || idx >= daily.time.length) return;
    _selectedDayIdx = idx;

    const daysJa = ['日','月','火','水','木','金','土'];
    const daysEn = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const dateStr = daily.time[idx];
    const d = new Date(dateStr + 'T00:00:00');
    const isToday = d.toDateString() === new Date().toDateString();
    const dow = (currentLang === 'ja' ? daysJa : daysEn)[d.getDay()];
    const prefix = isToday ? (currentLang === 'ja' ? '今日 ' : 'Today ') : '';
    const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    const dateLabel = `${prefix}${d.getMonth() + 1}/${d.getDate()}(${dow})`;
    setText('wd-sel-date', dateLabel);

    // その日のサマリー
    const w    = WMO_CODES[daily.weather_code[idx]] || { ja: '', en: '', icon: '🌡️' };
    const max  = Math.round(daily.temperature_2m_max[idx]);
    const min  = Math.round(daily.temperature_2m_min[idx]);
    const pop  = daily.precipitation_probability_max?.[idx] ?? 0;
    const cond = currentLang === 'ja' ? w.ja : w.en;
    setText('wd-sel-summary', `${w.icon} ${cond} ・ ${min}〜${max}° ・ ☔${pop}%`);

    // 🌟 上部のヒーロー表示も、選択した曜日と連動させる
    const cur = _lastWeather.data.current;
    const heroCode = isToday ? cur.weather_code : daily.weather_code[idx];
    const heroW = WMO_CODES[heroCode] || { ja: '不明', en: 'Unknown', icon: '🌡️' };
    const heroTemp = isToday ? Math.round(cur.temperature_2m) : max;
    setText('wd-hero-date',   dateLabel);
    setText('wd-hero-icon',   heroW.icon);
    setText('wd-hero-temp',   `${heroTemp}°`);
    setText('wd-hero-cond',   currentLang === 'ja' ? heroW.ja : heroW.en);
    setText('wd-hero-city',   _lastWeather.city ? `📍 ${_lastWeather.city}` : '');
    setText('wd-hero-range',  `${min}〜${max}°`);
    setText('wd-hero-pop',    `${pop}%`);
    setText('wd-hero-precip', `${(daily.precipitation_sum[idx] ?? 0).toFixed(1)}mm`);
    if (isToday) {
        const _now = new Date();
        const _t = `${String(_now.getHours()).padStart(2,'0')}:${String(_now.getMinutes()).padStart(2,'0')}`;
        setText('wd-hero-updated', currentLang === 'ja' ? `🕐 ${_t} 更新` : `🕐 Updated ${_t}`);
    } else {
        setText('wd-hero-updated', '');
    }

    // 行ハイライト
    document.querySelectorAll('#weather-week-detail .week-row').forEach(r => {
        r.classList.toggle('week-selected', Number(r.dataset.index) === idx);
    });

    // 1時間ごとを描画
    _renderHourly(dateStr, isToday);

    // 🌟 曜日をタップしたら画面を一番上に戻し、更新された予報を見せる
    if (scrollToTop) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// 指定日の1時間ごとカードを生成
function _renderHourly(dateStr, isToday) {
    const scrollEl = document.getElementById('wd-hourly-scroll');
    if (!scrollEl || !_lastWeather) return;
    const H = _lastWeather.data.hourly;
    if (!H || !H.time) { scrollEl.innerHTML = ''; return; }

    const nowHour = new Date().getHours();
    let html = '';
    for (let i = 0; i < H.time.length; i++) {
        if (H.time[i].slice(0, 10) !== dateStr) continue;
        const hh   = parseInt(H.time[i].slice(11, 13), 10);
        const w    = WMO_CODES[H.weather_code[i]] || { icon: '🌡️' };
        const temp = Math.round(H.temperature_2m[i]);
        const pop  = H.precipitation_probability?.[i] ?? 0;
        const isNow = isToday && hh === nowHour;
        const timeLabel = isNow
            ? (currentLang === 'ja' ? '今' : 'Now')
            : (currentLang === 'ja' ? `${hh}時` : `${hh}:00`);
        html += `
            <div class="wd-hour${isNow ? ' wd-hour-now' : ''}" onclick="showHourDetail(${i})">
                <div class="wd-hour-time">${timeLabel}</div>
                <div class="wd-hour-icon">${w.icon}</div>
                <div class="wd-hour-temp">${temp}°</div>
                <div class="wd-hour-pop">☔${pop}%</div>
            </div>`;
    }
    scrollEl.innerHTML = html;

    // 今日は現在時刻のカードが見える位置へ、それ以外は先頭へ
    const nowCard = scrollEl.querySelector('.wd-hour-now');
    scrollEl.scrollLeft = nowCard ? Math.max(0, nowCard.offsetLeft - scrollEl.offsetLeft - 8) : 0;
}

// 時刻ごとの詳細をモーダルで表示（1時間ごとカードのタップで呼ばれる）
function showHourDetail(i) {
    if (!_lastWeather) return;
    const H = _lastWeather.data.hourly;
    if (!H || !H.time || !H.time[i]) return;

    const daysJa = ['日','月','火','水','木','金','土'];
    const daysEn = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const t   = H.time[i];
    const d   = new Date(t);
    const hh  = parseInt(t.slice(11, 13), 10);
    const dow = (currentLang === 'ja' ? daysJa : daysEn)[d.getDay()];
    const w   = WMO_CODES[H.weather_code[i]] || { ja: '不明', en: 'Unknown', icon: '🌡️' };
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };

    set('hd-time', currentLang === 'ja'
        ? `${d.getMonth() + 1}/${d.getDate()}(${dow}) ${hh}時`
        : `${d.getMonth() + 1}/${d.getDate()}(${dow}) ${hh}:00`);
    set('hd-icon', w.icon);
    set('hd-cond', currentLang === 'ja' ? w.ja : w.en);
    set('hd-temp',   `${Math.round(H.temperature_2m[i])}°`);
    set('hd-pop',    `${H.precipitation_probability?.[i] ?? 0}%`);
    set('hd-precip', `${(H.precipitation?.[i] ?? 0).toFixed(1)}mm`);

    document.getElementById('hour-detail-modal').classList.remove('hidden');
}

function closeHourDetail() {
    const m = document.getElementById('hour-detail-modal');
    if (m) m.classList.add('hidden');
}

// 天気詳細ページを開く
function showWeatherDetail() {
    if (!_lastWeather) return; // データ未取得時は何もしない
    _fillWeatherDetail();
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('weather-screen').classList.remove('hidden');
    if (typeof applyLanguageSettings === 'function') applyLanguageSettings();
    window.scrollTo(0, 0);

    // hidden解除後にDOMレイアウトが確定してからスクロール位置を再計算
    requestAnimationFrame(() => {
        const scrollEl = document.getElementById('wd-hourly-scroll');
        if (!scrollEl) return;
        const nowCard = scrollEl.querySelector('.wd-hour-now');
        scrollEl.scrollLeft = nowCard ? Math.max(0, nowCard.offsetLeft - scrollEl.offsetLeft - 8) : 0;
    });
}

// 天気詳細ページを閉じてアラーム画面へ戻る
function hideWeatherDetail() {
    document.getElementById('weather-screen').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
}

// 週間予報（7日分）の行を生成（targetId で描画先を指定）
function _renderWeeklyForecast(daily, targetId) {
    const weekEl = document.getElementById(targetId || 'weather-week-detail');
    if (!weekEl || !daily || !daily.time) return;

    const daysJa = ['日','月','火','水','木','金','土'];
    const daysEn = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const todayStart = new Date(new Date().toDateString()); // 今日の0時
    let html = '';

    // 見出し行（最高/最低などの表示名）
    const L = currentLang === 'ja'
        ? { rain: '降水', high: '最高', low: '最低' }
        : { rain: 'Rain', high: 'High', low: 'Low' };
    html += `
        <div class="week-head-row">
            <span></span><span></span>
            <span class="week-head-cell">${L.rain}</span>
            <span class="week-temp"><span class="week-head-cell">${L.high}</span><span class="week-head-cell">${L.low}</span></span>
        </div>`;

    for (let i = 0; i < daily.time.length; i++) {
        const d     = new Date(daily.time[i] + 'T00:00:00');
        const wc    = daily.weather_code[i];
        const w     = WMO_CODES[wc] || { icon: '🌡️' };
        const max   = Math.round(daily.temperature_2m_max[i]);
        const min   = Math.round(daily.temperature_2m_min[i]);
        const pop   = daily.precipitation_probability_max?.[i] ?? 0;

        const isToday   = (d.getTime() === todayStart.getTime());
        const isPast    = (d < todayStart);
        const dow       = (currentLang === 'ja' ? daysJa : daysEn)[d.getDay()];
        const label     = isToday ? (currentLang === 'ja' ? '今日' : 'Today') : dow;
        const dateStr   = `${d.getMonth() + 1}/${d.getDate()}`;
        const isWeekend = (d.getDay() === 0 || d.getDay() === 6);

        const cls = ['week-row',
            isToday ? 'week-today' : '',
            isPast ? 'week-past' : '',
            (i === _selectedDayIdx) ? 'week-selected' : ''
        ].filter(Boolean).join(' ');

        html += `
            <div class="${cls}" data-index="${i}" onclick="selectWeatherDay(${i})">
                <span class="week-day${isWeekend ? ' week-weekend' : ''}">${label}<span class="week-date">${dateStr}</span></span>
                <span class="week-icon">${w.icon}</span>
                <span class="week-pop">☔ ${pop}%</span>
                <span class="week-temp"><span class="week-max">${max}°</span><span class="week-min">${min}°</span></span>
            </div>`;
    }
    weekEl.innerHTML = html;
}

function _showWeatherError(msg) {
    const loadEl = document.getElementById('weather-state-loading');
    const errEl  = document.getElementById('weather-state-error');
    if (!loadEl || !errEl) return;
    document.getElementById('weather-err-msg').textContent = `⚠️ ${msg}`;
    loadEl.classList.add('hidden');
    errEl.classList.remove('hidden');
}

function clearWeatherCache() {
    localStorage.removeItem('weather_cache');
    _lastWeather = null;
}

// ===================================
// 🌟 コピー・LINE共有機能
// ===================================
function copyExcuse() {
    const excuseText = document.getElementById('excuse-text').innerText;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(excuseText).then(() => {
            showAlert(currentLang === 'ja' ? '📋 コピーしました！' : '📋 Copied!');
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
    showAlert(currentLang === 'ja' ? '📋 コピーしました！' : '📋 Copied!');
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

// ===================================
// 🌅 今日のはじまり（AIモーニング：今日はどんな日・服装・星座占い）
// ===================================
function saveZodiac() {
    const sel = document.getElementById('zodiac-select');
    if (sel) localStorage.setItem('app_zodiac', sel.value);
    if (typeof cloudSyncIfLoggedIn === 'function') cloudSyncIfLoggedIn();
}

function getMorningWeatherFromTodayWeather() {
    if (!_lastWeather || !_lastWeather.data || !_lastWeather.data.current || !_lastWeather.data.daily) {
        return null;
    }

    const d   = _lastWeather.data;
    const idx = _findTodayIndex(d.daily);
    const w   = WMO_CODES[d.current.weather_code] || {};
    return {
        temp: Math.round(d.current.temperature_2m),
        max:  Math.round(d.daily.temperature_2m_max[idx]),
        min:  Math.round(d.daily.temperature_2m_min[idx]),
        cond: currentLang === 'ja' ? (w.ja || '') : (w.en || ''),
        pop:  d.daily.precipitation_probability_max?.[idx] ?? '?'
    };
}

function getMorningWeatherCacheKey(weather) {
    if (!weather) return '';
    return [weather.cond, weather.temp, weather.max, weather.min, weather.pop].join('|');
}

async function waitForTodayWeather(timeoutMs = 30000) {
    let weather = getMorningWeatherFromTodayWeather();
    if (weather) return weather;

    const loadEl = document.getElementById('weather-state-loading');
    if (!loadEl || loadEl.classList.contains('hidden')) {
        initWeather();
    }

    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        await new Promise(resolve => setTimeout(resolve, 250));
        weather = getMorningWeatherFromTodayWeather();
        if (weather) return weather;
    }

    return getMorningWeatherFromTodayWeather();
}

async function generateMorning() {
    const resultBox  = document.getElementById('morning-result-box');
    const resultText = document.getElementById('morning-text');
    const btn        = document.querySelector('button[onclick="generateMorning()"]');
    const speakBtn   = document.getElementById('morning-speak-btn');
    const signSel    = document.getElementById('zodiac-select');
    const sign       = signSel ? signSel.value : 'aries';

    if ('speechSynthesis' in window) speechSynthesis.cancel();

    // 📌 今日の日付（0時を過ぎると変わる＝翌日は自動で作り直す）
    const now = new Date();
    const pad = x => String(x).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    if (speakBtn) speakBtn.classList.add('hidden');
    if (resultBox) resultBox.classList.remove('hidden');
    if (resultText) resultText.innerText = (currentLang === 'ja') ? '🌤 今日の天気を取得しています...' : "🌤 Loading today's weather...";
    if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }

    try {
        const weather = await waitForTodayWeather();
        if (!weather) {
            if (resultText) {
                resultText.innerText = currentLang === 'ja'
                    ? '今日の天気を取得できませんでした。今日の天気を更新してからもう一度お試しください。'
                    : "Today's weather could not be loaded. Please refresh the weather and try again.";
            }
            return;
        }

        const weatherKey = getMorningWeatherCacheKey(weather);

        // 同じ日・同じ星座・同じ言語・同じ天気なら、保存済みの内容をそのまま表示する
        try {
            const cached = JSON.parse(localStorage.getItem('morning_cache') || 'null');
            if (
                cached && cached.v === 14 &&
                cached.date === today &&
                cached.sign === sign &&
                cached.lang === currentLang &&
                cached.weatherKey === weatherKey &&
                cached.message
            ) {
                if (resultText) resultText.innerText = cached.message;
                if (speakBtn) { speakBtn.classList.remove('hidden'); updateMorningSpeakBtn(false); }
                return;
            }
        } catch (_) {}

        if (resultText) resultText.innerText = (currentLang === 'ja') ? '☕ 占っています...' : '☕ Reading...';

        const res = await fetch('/generate_morning', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sign, weather, lang: currentLang })
        });
        const data = await res.json();
        if (resultText) resultText.innerText = data.message;
        if (data.status === 'success') {
            // 📌 その日の結果を保存（同じ日・同じ星座なら何度開いても同じ内容になる）
            try {
                localStorage.setItem('morning_cache', JSON.stringify({
                    v: 14,
                    date: today,
                    sign: sign,
                    lang: currentLang,
                    weatherKey: weatherKey,
                    message: data.message
                }));
            } catch (_) {}
            if (speakBtn) { speakBtn.classList.remove('hidden'); updateMorningSpeakBtn(false); }
        }
    } catch (e) {
        console.error('morning error:', e);
        if (resultText) resultText.innerText = (currentLang === 'ja') ? '通信エラーが発生しました。もう一度お試しください。' : 'Connection error. Please try again.';
    } finally {
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    }
}

// 🔊 朝メッセージの音声読み上げ（再生/停止トグル）
function updateMorningSpeakBtn(speaking) {
    const btn = document.getElementById('morning-speak-btn');
    if (!btn) return;
    btn.innerText = speaking
        ? (currentLang === 'ja' ? '⏹ 停止' : '⏹ Stop')
        : (currentLang === 'ja' ? '🔊 読み上げ' : '🔊 Read aloud');
}

function toggleSpeakMorning() {
    if (!('speechSynthesis' in window)) {
        showAlert(currentLang === 'ja' ? 'この端末は音声読み上げに対応していません。' : 'Speech is not supported on this device.');
        return;
    }
    // 読み上げ中なら停止
    if (speechSynthesis.speaking || speechSynthesis.pending) {
        speechSynthesis.cancel();
        updateMorningSpeakBtn(false);
        return;
    }
    const textEl = document.getElementById('morning-text');
    const text = textEl ? textEl.innerText.trim() : '';
    if (!text) return;

    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang  = currentLang === 'ja' ? 'ja-JP' : 'en-US';
    u.rate  = 1.0;
    u.pitch = 1.0;
    u.onend   = () => updateMorningSpeakBtn(false);
    u.onerror = () => updateMorningSpeakBtn(false);
    speechSynthesis.speak(u);
    updateMorningSpeakBtn(true);
}
