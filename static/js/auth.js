// =====================================================
// 👤 アカウント機能（Firebase Authentication + Firestore）
// =====================================================

let _authReady = false;
let _auth = null;
let _db = null;
let currentUser = null;
let _allowLocalRecordMigration = false;

// script.js から Firestore インスタンスを取得するためのヘルパー
function getFirestoreDb() { return _db; }

// 初期化（Firebaseが設定済みのときだけ有効化）
function initAuth() {
    if (!window.FIREBASE_READY || typeof firebase === 'undefined') {
        _showAuthDisabled();
        return;
    }
    _auth = firebase.auth();
    _db = firebase.firestore();
    // 送信メール・確認画面の言語をアプリに合わせる（標準画面も日本語になる）
    _auth.languageCode = (typeof currentLang !== 'undefined' && currentLang === 'en') ? 'en' : 'ja';
    _authReady = true;

    // ログイン状態の監視
    _auth.onAuthStateChanged(async (user) => {
        const hadAuthUser = !!currentUser || !!localStorage.getItem(_AUTH_ACTIVE_UID_KEY);
        if (user && _shouldClearLocalRecordsForUser(user.uid)) {
            _clearLocalUserRecords();
        }
        if (!user) {
            if (hadAuthUser) {
                _clearLocalUserRecords();
                _clearLocalAlarmData();
            }
            localStorage.removeItem(_AUTH_ACTIVE_UID_KEY);
            _allowLocalRecordMigration = false;
        }

        currentUser = user;
        updateAccountUI(user);
        if (user) {
            localStorage.setItem(_AUTH_ACTIVE_UID_KEY, user.uid);
            await syncFromCloud(user.uid);
            await loadWakeStatsFromCloud();
            // UID別のAI利用状況をFirestoreから読み込む
            if (typeof refreshAiUsageForUser === 'function') {
                refreshAiUsageForUser(user.uid);
            }
        } else {
            // ログアウト時はAI利用状況のキャッシュをクリアして表示をリセット
            if (typeof clearAiUsageCache === 'function') {
                clearAiUsageCache();
            }
        }
    });
}

// Firebase未設定のときの案内表示
function _showAuthDisabled() {
    const note = document.getElementById('account-disabled-note');
    const out = document.getElementById('account-logged-out');
    const inn = document.getElementById('account-logged-in');
    if (note) note.classList.remove('hidden');
    if (out) out.classList.add('hidden');
    if (inn) inn.classList.add('hidden');
    const menuVal = document.getElementById('menu-val-account');
    if (menuVal) menuVal.textContent = (typeof currentLang !== 'undefined' && currentLang === 'en') ? 'Setup required' : '未設定';
}

// 「ログイン状態を維持する」に応じた永続化を設定
function _persistence() {
    const keep = document.getElementById('account-keep-login');
    const mode = (keep && keep.checked)
        ? firebase.auth.Auth.Persistence.LOCAL    // ブラウザを閉じても維持
        : firebase.auth.Auth.Persistence.SESSION; // タブを閉じると解除
    return _auth.setPersistence(mode);
}

// 送信メール（確認・パスワードリセット）の言語をUIに合わせる
function _setMailLang() {
    if (_auth) _auth.languageCode = (typeof currentLang !== 'undefined' && currentLang === 'en') ? 'en' : 'ja';
}

const _L = (ja, en) => (typeof currentLang !== 'undefined' && currentLang === 'en') ? en : ja;

// 新規登録（名前・メール・パスワード）
async function accountRegister() {
    if (!_authReady) return;
    const email = (document.getElementById('account-email').value || '').trim();
    const pass = document.getElementById('account-password').value || '';
    if (!email || !pass) {
        showAlert(_L('メールアドレスとパスワードを入力してください。', 'Please enter email and password.'));
        return;
    }
    try {
        _allowLocalRecordMigration = true;
        await _persistence();
        const cred = await _auth.createUserWithEmailAndPassword(email, pass);
        // 名前はメール認証の完了後に、アカウント画面で登録する
        await syncToCloud(); // 登録時に今のローカルデータをアップロード
        updateAccountUI(cred.user);
        // 確認メールを送信（成功・失敗で案内を分ける。失敗時はエラーを表示して原因を見えるようにする）
        try {
            _setMailLang();
            await cred.user.sendEmailVerification();
            showAlert(_L(
                `✅ 登録しました！\n${email} に確認メールを送りました。\nメール内のリンクを開いて認証を完了してください。\n※届かない場合は「迷惑メール」フォルダもご確認ください。`,
                `✅ Registered!\nA verification email was sent to ${email}.\nOpen the link in it to verify your address.\n* If you don't see it, please check your spam folder.`
            ));
        } catch (ve) {
            console.error('sendEmailVerification error:', ve);
            showAlert(_L(
                `✅ 登録は完了しました。\n⚠️ 確認メールの送信に失敗しました（${ve.code || ve.message}）。\nアカウント画面の「確認メールを再送する」からもう一度お試しください。`,
                `✅ Registered.\n⚠️ Failed to send the verification email (${ve.code || ve.message}).\nPlease try "Resend verification email" on the account screen.`
            ));
        }
    } catch (e) {
        _allowLocalRecordMigration = false;
        showAlert(_authErrorMsg(e));
    }
}

// ログイン
async function accountLogin() {
    if (!_authReady) return;
    const email = (document.getElementById('account-email').value || '').trim();
    const pass = document.getElementById('account-password').value || '';
    if (!email || !pass) {
        showAlert(_L('メールアドレスとパスワードを入力してください。', 'Please enter email and password.'));
        return;
    }
    try {
        _allowLocalRecordMigration = false;
        await _persistence();
        const cred = await _auth.signInWithEmailAndPassword(email, pass);
        // メールが未確認なら、ログインのたびに確認メールを送る
        if (cred.user && !cred.user.emailVerified) {
            _setMailLang();
            try {
                await cred.user.sendEmailVerification();
                showAlert(_L(
                    'ログインしました。\nメールアドレスがまだ未確認です。確認メールを送りましたので、メール内のリンクから認証してください。\n※届かない場合は迷惑メールフォルダもご確認ください。',
                    'Logged in.\nYour email is not verified yet. We sent a verification email — please verify via the link.\n* If you don\'t see it, check your spam folder.'
                ));
            } catch (ve) {
                console.error('sendEmailVerification error:', ve);
                showAlert(_L('ログインしました。（確認メールの送信に失敗しました。時間をおいて再度お試しください）', 'Logged in. (Failed to send verification email; please try again later.)'));
            }
        } else {
            showAlert(_L('✅ ログインしました！', '✅ Logged in!'));
        }
    } catch (e) {
        showAlert(_authErrorMsg(e));
    }
}

// Googleでログイン/登録
async function accountGoogleLogin() {
    if (!_authReady) return;
    try {
        _allowLocalRecordMigration = false;
        await _persistence();
        const provider = new firebase.auth.GoogleAuthProvider();
        await _auth.signInWithPopup(provider);
        showAlert(_L('✅ Googleでログインしました！', '✅ Logged in with Google!'));
    } catch (e) {
        showAlert(_authErrorMsg(e));
    }
}

// ログアウト
async function accountLogout() {
    if (!_authReady) return;
    const ok = await showConfirm(
        _L('ログアウトしますか？', 'Log out?'),
        _L('ログアウト', 'Log out'),
        _L('キャンセル', 'Cancel')
    );
    if (!ok) return;
    if (currentUser && _shouldClearLocalRecordsForUser(currentUser.uid)) {
        _clearLocalUserRecords({ render: false });
    } else {
        const localStats = _readLocalWakeStats();
        const localHistory = _readLocalMissionHistory();
        if (localStats && (localStats.lastWakeDate || localStats.totalSuccessCount || localStats.totalAlarmCount)) {
            await saveWakeSummaryToCloud(localStats);
        }
        if (localHistory.length) {
            await Promise.all(localHistory.map(item => saveMissionHistoryToCloud(item)));
        }
    }
    await syncToCloud();
    await _auth.signOut();
    _clearLocalUserRecords();
    _clearLocalAlarmData();
    localStorage.removeItem(_AUTH_ACTIVE_UID_KEY);
    showAlert(_L('ログアウトしました。', 'Logged out.'));
}

// アカウント削除（テスト用：同じメールで再登録して確認メールを試せる）
async function accountDelete() {
    if (!_authReady || !currentUser) return;
    const ok = await showConfirm(
        _L('⚠️ アカウントを削除しますか？\nこの操作は取り消せません。保存した睡眠データや設定もすべて削除されます。',
           '⚠️ Delete your account?\nThis cannot be undone. Your saved sleep data and settings will be deleted.'),
        _L('削除する', 'Delete'),
        _L('キャンセル', 'Cancel')
    );
    if (!ok) return;
    const uid = currentUser.uid;
    try {
        try {
            await _db.collection('users').doc(uid).collection('wakeStats').doc('summary').delete();
        } catch (_) {}
        try { await _db.collection('users').doc(uid).delete(); } catch (_) {} // クラウドのデータも削除
        await currentUser.delete();
        _clearLocalUserRecords();
        _clearLocalAlarmData();
        localStorage.removeItem(_AUTH_ACTIVE_UID_KEY);
        updateAccountUI(null);
        showAlert(_L('アカウントを削除しました。同じメールアドレスで再登録できます。', 'Your account has been deleted. You can register again with the same email.'));
    } catch (e) {
        if (e && e.code === 'auth/requires-recent-login') {
            showAlert(_L('セキュリティのため、一度ログアウトして再度ログインしてから削除してください。',
                         'For security, please log out and log in again, then delete.'));
        } else {
            showAlert(_authErrorMsg(e));
        }
    }
}

// パスワードを忘れた → リセットメール送信
async function accountResetPassword() {
    if (!_authReady) return;
    const email = (document.getElementById('account-email').value || '').trim();
    if (!email) {
        showAlert(_L('先にメールアドレスを入力してから押してください。', 'Please enter your email first.'));
        return;
    }
    try {
        _setMailLang();
        await _auth.sendPasswordResetEmail(email);
        showAlert(_L(`📧 ${email} にパスワード変更メールを送信しました。\n※届かない場合は迷惑メールフォルダもご確認ください。`, `📧 A password reset email was sent to ${email}.\n* If you don't see it, please check your spam folder.`));
    } catch (e) {
        showAlert(_authErrorMsg(e));
    }
}

// 名前の変更
async function accountUpdateName() {
    if (!_authReady || !currentUser) return;
    const name = (document.getElementById('account-edit-name').value || '').trim();
    if (!name) {
        showAlert(_L('名前を入力してください。', 'Please enter a name.'));
        return;
    }
    try {
        await currentUser.updateProfile({ displayName: name });
        await syncToCloud();
        updateAccountUI(currentUser);
        showAlert(_L('✅ 名前を変更しました。', '✅ Name updated.'));
    } catch (e) {
        showAlert(_authErrorMsg(e));
    }
}

// 言語切替・初期化時にアカウントのメニュー表示を現在の状態で更新する
function refreshAccountLabel() {
    if (typeof updateAccountUI === 'function') updateAccountUI(currentUser);
}

// 確認メールの再送
async function accountResendVerification() {
    if (!_authReady || !currentUser) return;
    try {
        _setMailLang();
        await currentUser.sendEmailVerification();
        showAlert(_L('📧 確認メールを再送しました。迷惑メールフォルダもご確認ください。', '📧 Verification email resent. Please also check your spam folder.'));
    } catch (e) {
        showAlert(_authErrorMsg(e));
    }
}

// アカウント画面を開いたとき、最新の確認状態を取り直して表示を更新する
function refreshAccountUI() {
    if (_authReady && currentUser) {
        currentUser.reload()
            .then(() => updateAccountUI(_auth.currentUser))
            .catch(() => updateAccountUI(currentUser));
    } else {
        updateAccountUI(currentUser);
    }
}

// 「ログイン / 新規登録」の切り替え
function setAccountMode(mode) {
    const isReg = (mode === 'register');
    const note = document.getElementById('account-register-note');
    const loginBtn = document.getElementById('account-submit-login');
    const regBtn = document.getElementById('account-submit-register');
    if (note) note.classList.toggle('hidden', !isReg);
    if (loginBtn) loginBtn.classList.toggle('hidden', isReg);
    if (regBtn) regBtn.classList.toggle('hidden', !isReg);
    document.querySelectorAll('.account-tab').forEach(t => t.classList.remove('active'));
    const tab = document.getElementById(isReg ? 'account-tab-register' : 'account-tab-login');
    if (tab) tab.classList.add('active');
}

// ログイン状態に応じてUIを切り替え
function updateAccountUI(user) {
    const loggedOut = document.getElementById('account-logged-out');
    const loggedIn = document.getElementById('account-logged-in');
    const menuVal = document.getElementById('menu-val-account');
    if (!loggedOut || !loggedIn) return;

    if (user) {
        loggedOut.classList.add('hidden');
        loggedIn.classList.remove('hidden');
        const nameEl = document.getElementById('account-display-name');
        const emailEl = document.getElementById('account-display-email');
        const editName = document.getElementById('account-edit-name');
        const accountStatusText = user.emailVerified
            ? (user.email || '')
            : _L('メール認証を行ってください', 'Please verify your email');
        if (nameEl) nameEl.textContent = user.displayName || _L('（名前未設定）', '(no name)');
        if (emailEl) emailEl.textContent = accountStatusText;
        if (editName) editName.value = user.displayName || '';
        if (menuVal) menuVal.textContent = user.emailVerified
            ? (user.displayName || user.email || _L('ログイン中', 'Logged in'))
            : accountStatusText;
        // メール確認の状態で画面を切り替える（未確認＝認証画面 / 確認済み＝名前登録画面）
        const verifiedBadge = document.getElementById('account-verified-badge');
        const unverifiedView = document.getElementById('account-unverified-view');
        const verifiedView = document.getElementById('account-verified-view');
        if (verifiedBadge) verifiedBadge.classList.toggle('hidden', !user.emailVerified);
        if (unverifiedView) unverifiedView.classList.toggle('hidden', !!user.emailVerified);
        if (verifiedView) verifiedView.classList.toggle('hidden', !user.emailVerified);
    } else {
        loggedOut.classList.remove('hidden');
        loggedIn.classList.add('hidden');
        if (menuVal) menuVal.textContent = _L('ログインしていません', 'Not logged in');
        // ログアウト・削除後はログイン／新規登録の入力欄をクリアする
        const emailEl = document.getElementById('account-email');
        const passEl = document.getElementById('account-password');
        if (emailEl) emailEl.value = '';
        if (passEl) passEl.value = '';
    }
}

// Firebaseエラーを分かりやすいメッセージに
function _authErrorMsg(e) {
    const code = (e && e.code) ? e.code : '';
    const ja = {
        'auth/email-already-in-use': 'このメールアドレスは既に登録されています。',
        'auth/invalid-email': 'メールアドレスの形式が正しくありません。',
        'auth/weak-password': 'パスワードは6文字以上にしてください。',
        'auth/user-not-found': 'アカウントが見つかりません。',
        'auth/wrong-password': 'パスワードが違います。',
        'auth/invalid-credential': 'メールアドレスまたはパスワードが違います。',
        'auth/too-many-requests': '試行回数が多すぎます。しばらくしてからお試しください。',
        'auth/popup-closed-by-user': 'ログインがキャンセルされました。',
        'auth/popup-blocked': 'ポップアップがブロックされました。ブラウザの設定を確認してください。',
        'auth/network-request-failed': 'ネットワークエラーです。通信環境を確認してください。',
        'auth/operation-not-allowed': 'このログイン方法は有効化されていません（開発者向け：Firebaseで有効化してください）。',
    };
    if (currentLang === 'ja') return '⚠️ ' + (ja[code] || ('エラー: ' + (e.message || code)));
    return '⚠️ ' + (e.message || code);
}

// =====================================================
// ☁️ データ同期（睡眠データ＋設定）
// =====================================================
const _SYNC_KEYS = ['sleep_logs', 'app_theme', 'app_language', 'app_alarms', 'app_zodiac'];
const _AUTH_ACTIVE_UID_KEY = 'app_auth_active_uid';
const _LOCAL_RECORD_OWNER_KEY = 'wakeStats_localOwnerUid';
const _LOCAL_USER_RECORD_KEYS = [
    'sleep_logs',
    'wakeStats_summary',
    'wake_stats',
    'wakeStats_missionHistory',
    'wakeStats_countedAlarmSessions',
    'wakeStats_successSessions'
];
let _applyingCloud = false; // クラウド反映中の二重同期を防ぐフラグ

function _hasLocalUserRecords() {
    return _LOCAL_USER_RECORD_KEYS.some(key => {
        const value = localStorage.getItem(key);
        return value !== null && value !== '' && value !== '[]' && value !== '{}';
    });
}

function _shouldClearLocalRecordsForUser(uid) {
    if (!uid) return false;
    const ownerUid = localStorage.getItem(_LOCAL_RECORD_OWNER_KEY) || '';
    if (ownerUid && ownerUid !== uid) return true;
    return !ownerUid && _hasLocalUserRecords() && !_allowLocalRecordMigration;
}

function _clearLocalUserRecords(options = {}) {
    _LOCAL_USER_RECORD_KEYS.forEach(key => localStorage.removeItem(key));
    localStorage.removeItem(_LOCAL_RECORD_OWNER_KEY);
    if (options.render === false) return;
    if (typeof renderWakeRecordWidgets === 'function') renderWakeRecordWidgets();
}

function _clearLocalAlarmData(options = {}) {
    localStorage.setItem('app_alarms', '[]');
    if (typeof appAlarms !== 'undefined') appAlarms = [];
    if (typeof editingAlarmDraft !== 'undefined') editingAlarmDraft = null;
    if (typeof lastFiredAlarmKey !== 'undefined') lastFiredAlarmKey = '';
    if (options.render === false) return;
    if (typeof renderAlarmList === 'function') renderAlarmList();
    if (typeof updateSleepNextAlarmInfo === 'function') updateSleepNextAlarmInfo();
}

function markLocalWakeRecordsOwner(uid = currentUser && currentUser.uid) {
    if (uid) localStorage.setItem(_LOCAL_RECORD_OWNER_KEY, uid);
}

// ローカル → クラウド
async function syncToCloud() {
    if (!_authReady || !currentUser) return;
    const data = {};
    _SYNC_KEYS.forEach(k => {
        const v = localStorage.getItem(k);
        if (v !== null) data[k] = v;
    });
    try {
        await _db.collection('users').doc(currentUser.uid).set({
            displayName: currentUser.displayName || '',
            data: data,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (e) {
        console.error('syncToCloud error:', e);
    }
}

// クラウド → ローカル（ログイン時に呼ぶ）
async function syncFromCloud(uid) {
    if (!_authReady) return;
    try {
        const doc = await _db.collection('users').doc(uid).get();
        if (doc.exists && doc.data() && doc.data().data) {
            const cloud = doc.data().data;
            _SYNC_KEYS.forEach(k => {
                if (cloud[k] !== undefined && cloud[k] !== null) {
                    localStorage.setItem(k, cloud[k]);
                }
            });
            _applyLoadedSettings();
        } else {
            // クラウドに無ければ、今のローカルデータをアップロード
            await syncToCloud();
        }
    } catch (e) {
        console.error('syncFromCloud error:', e);
    }
}

// 読み込んだ設定を画面に反映
function _applyLoadedSettings() {
    _applyingCloud = true;
    try {
        const theme = localStorage.getItem('app_theme') || 'light';
        if (typeof setTheme === 'function') setTheme(theme);
        const lang = localStorage.getItem('app_language') || 'ja';
        if (typeof setLanguage === 'function') setLanguage(lang);

        const themeRadio = document.querySelector(`input[name="setting-theme"][value="${theme}"]`);
        if (themeRadio) themeRadio.checked = true;
        const langRadio = document.querySelector(`input[name="setting-lang"][value="${lang}"]`);
        if (langRadio) langRadio.checked = true;
        const zSel = document.getElementById('zodiac-select');
        const z = localStorage.getItem('app_zodiac');
        if (zSel && z) zSel.value = z;

        // 🌟 クラウドから復元したアラーム一覧を再描画
        if (typeof loadAlarms === 'function') loadAlarms();
        if (typeof renderAlarmList === 'function') renderAlarmList();
    } catch (e) {
        console.error('applyLoadedSettings error:', e);
    }
    _applyingCloud = false;
}

// 設定や睡眠データが変わったときに呼ぶ（ログイン中だけクラウド保存）
function cloudSyncIfLoggedIn() {
    if (_applyingCloud) return; // クラウド反映中は保存しない（ループ防止）
    if (_authReady && currentUser) {
        syncToCloud();
    }
}

// =====================================================
// 🌅 起床記録の同期：users/{uid}/wakeStats/summary + missionHistory
// =====================================================
function _readLocalWakeStats() {
    try {
        return JSON.parse(localStorage.getItem('wakeStats_summary') || 'null') || {};
    } catch (e) {
        try {
            return JSON.parse(localStorage.getItem('wake_stats') || 'null') || {};
        } catch (_) {
            return {};
        }
    }
}

const _WAKE_MISSION_TYPES = ['watosa', 'sekitosyou', 'shake', 'kamera', 'stroop', 'odd_one', 'memory', 'target'];

function _normalizeMissionCounts(counts) {
    const source = counts && typeof counts === 'object' ? counts : {};
    return _WAKE_MISSION_TYPES.reduce((result, missionType) => {
        const value = Number(source[missionType] || 0);
        result[missionType] = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
        return result;
    }, {});
}

function _mergeMissionCounts(...countSets) {
    const merged = _normalizeMissionCounts({});
    countSets.forEach(counts => {
        const normalized = _normalizeMissionCounts(counts);
        _WAKE_MISSION_TYPES.forEach(missionType => {
            merged[missionType] = Math.max(merged[missionType], normalized[missionType]);
        });
    });
    return merged;
}

function _countMissionsFromHistory(history) {
    const counts = _normalizeMissionCounts({});
    (Array.isArray(history) ? history : []).forEach(item => {
        if (!item || item.success === false || !Object.prototype.hasOwnProperty.call(counts, item.missionType)) return;
        counts[item.missionType] += 1;
    });
    return counts;
}

function _wakeDateStr(date) {
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function _isWakeStreakActive(lastWakeDate) {
    if (!lastWakeDate) return false;
    const today = _wakeDateStr(new Date());
    const yesterday = _wakeDateStr(new Date(Date.now() - 86400000));
    return lastWakeDate === today || lastWakeDate === yesterday;
}

function _normalizeWakeStats(stats) {
    const source = stats || {};
    const normalized = {
        currentStreak: Number(source.currentStreak || 0),
        bestStreak: Number(source.bestStreak || 0),
        totalAlarmCount: Number(source.totalAlarmCount || 0),
        lastWakeDate: source.lastWakeDate || '',
        totalSuccessCount: Number(source.totalSuccessCount || 0),
        successRate: Number(source.successRate || 0),
        missionCounts: _normalizeMissionCounts(source.missionCounts)
    };
    normalized.totalAlarmCount = Math.max(normalized.totalAlarmCount, normalized.totalSuccessCount);
    if (!_isWakeStreakActive(normalized.lastWakeDate)) normalized.currentStreak = 0;
    normalized.successRate = normalized.totalAlarmCount > 0
        ? Math.round((normalized.totalSuccessCount / normalized.totalAlarmCount) * 100)
        : 0;
    return normalized;
}

function _readLocalMissionHistory() {
    try {
        const history = JSON.parse(localStorage.getItem('wakeStats_missionHistory') || '[]');
        return Array.isArray(history) ? history : [];
    } catch (e) {
        return [];
    }
}

function _writeLocalWakeRecords(summary, history) {
    if (summary) {
        localStorage.setItem('wakeStats_summary', JSON.stringify(_normalizeWakeStats(summary)));
        localStorage.setItem('wake_stats', JSON.stringify(_normalizeWakeStats(summary)));
    }
    if (Array.isArray(history)) {
        localStorage.setItem('wakeStats_missionHistory', JSON.stringify(history.slice(0, 50)));
    }
    markLocalWakeRecordsOwner();
}

async function saveWakeSummaryToCloud(stats) {
    if (!_authReady || !currentUser || !_db) return;
    const clean = _normalizeWakeStats(stats);
    try {
        await _db.collection('users').doc(currentUser.uid)
            .collection('wakeStats').doc('summary').set({
                currentStreak: clean.currentStreak,
                bestStreak: clean.bestStreak,
                totalAlarmCount: clean.totalAlarmCount,
                lastWakeDate: clean.lastWakeDate,
                totalSuccessCount: clean.totalSuccessCount,
                successRate: clean.successRate,
                missionCounts: clean.missionCounts,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
    } catch (e) {
        console.error('saveWakeSummaryToCloud error:', e);
    }
}

async function saveWakeStatsToCloud(stats) {
    return saveWakeSummaryToCloud(stats);
}

async function saveMissionHistoryToCloud(entry) {
    if (!_authReady || !currentUser || !_db || !entry) return;
    const historyId = entry.historyId || entry.alarmId || `history_${Date.now()}`;
    try {
        await _db.collection('users').doc(currentUser.uid)
            .collection('missionHistory').doc(historyId).set({
                ...entry,
                historyId,
                createdAtMs: Number(entry.createdAtMs || Date.now()),
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
    } catch (e) {
        console.error('saveMissionHistoryToCloud error:', e);
    }
}

async function loadWakeStatsFromCloud() {
    if (!_authReady || !currentUser || !_db) return;
    try {
        const userRef = _db.collection('users').doc(currentUser.uid);
        const summaryRef = userRef.collection('wakeStats').doc('summary');
        const snap = await summaryRef.get();
        const ownerUid = localStorage.getItem(_LOCAL_RECORD_OWNER_KEY) || '';
        const canUseLocalRecords = _allowLocalRecordMigration || ownerUid === currentUser.uid;
        const local = canUseLocalRecords ? _normalizeWakeStats(_readLocalWakeStats()) : _normalizeWakeStats({});
        let summary = local;

        if (!snap.exists) {
            if (local.lastWakeDate) await saveWakeStatsToCloud(local);
        } else {
            const cloud = _normalizeWakeStats(snap.data());
            if (
                local.lastWakeDate &&
                (local.totalSuccessCount > cloud.totalSuccessCount || local.totalAlarmCount > cloud.totalAlarmCount)
            ) {
                summary = local;
                await saveWakeSummaryToCloud(local);
            } else {
                summary = cloud;
            }
            summary.missionCounts = _mergeMissionCounts(local.missionCounts, cloud.missionCounts);
        }

        const cloudHistorySnap = await userRef.collection('missionHistory')
            .orderBy('createdAtMs', 'desc')
            .limit(50)
            .get();
        const merged = new Map();
        if (canUseLocalRecords) {
            _readLocalMissionHistory().forEach(item => {
                if (item && (item.historyId || item.alarmId)) merged.set(item.historyId || item.alarmId, item);
            });
        }
        cloudHistorySnap.forEach(doc => {
            const data = doc.data() || {};
            merged.set(data.historyId || data.alarmId || doc.id, { historyId: doc.id, ...data });
        });
        const history = Array.from(merged.values())
            .sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0))
            .slice(0, 50);

        summary.missionCounts = _mergeMissionCounts(
            summary.missionCounts,
            _countMissionsFromHistory(history)
        );

        _writeLocalWakeRecords(summary, history);
        await saveWakeSummaryToCloud(summary);
        history.forEach(item => saveMissionHistoryToCloud(item));
        _allowLocalRecordMigration = false;
        if (typeof renderWakeRecordWidgets === 'function') renderWakeRecordWidgets();
    } catch (e) {
        _allowLocalRecordMigration = false;
        console.error('loadWakeStatsFromCloud error:', e);
    }
}

// 起動時に初期化
window.addEventListener('DOMContentLoaded', initAuth);
