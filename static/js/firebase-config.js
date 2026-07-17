// =====================================================
// 🔥 Firebase 設定
// -----------------------------------------------------
// Firebaseコンソール（https://console.firebase.google.com/）で
//   ① プロジェクトを作成
//   ② 「ウェブアプリ(</>)」を追加
//   ③ 表示される firebaseConfig の値を、下の YOUR_... に貼り付け
//   ④ 「Authentication」→ ログイン方法で「メール/パスワード」と「Google」を有効化
//   ⑤ 「Firestore Database」を作成（本番モード可。ルールは下記READMEを参照）
// を行ってください。設定が済むまでアカウント機能は自動的に無効化されます。
// =====================================================
const defaultFirebaseAuthDomain = "web-app-95c34.firebaseapp.com";
const useCurrentFirebaseAuthDomain =
  window.location.protocol === "https:" &&
  !["localhost", "127.0.0.1"].includes(window.location.hostname) &&
  !window.location.hostname.endsWith(".firebaseapp.com");

const firebaseConfig = {
  apiKey: "AIzaSyDJDJ0Y2HhKawl-ktzO97Rh6OfbmGN7Gak",
  authDomain: useCurrentFirebaseAuthDomain ? window.location.host : defaultFirebaseAuthDomain,
  projectId: "web-app-95c34",
  storageBucket: "web-app-95c34.firebasestorage.app",
  messagingSenderId: "829380325015",
  appId: "1:829380325015:web:1e6bd8e28e9482ba6083d2",
  measurementId: "G-ESC7RR81BX"
};

// プレースホルダのままなら「未設定」とみなす
window.FIREBASE_READY = !!(firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY");

if (window.FIREBASE_READY && typeof firebase !== 'undefined') {
    try {
        firebase.initializeApp(firebaseConfig);
    } catch (e) {
        console.error("Firebase初期化エラー:", e);
        window.FIREBASE_READY = false;
    }
}
