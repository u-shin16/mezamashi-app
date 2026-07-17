from flask import Flask, Response, jsonify, make_response, render_template, request, send_from_directory
import base64
import numpy as np
import cv2
import random
import os
from google import genai
from google.genai import types as genai_types
from ultralytics import YOLO
from dotenv import load_dotenv
from datetime import datetime, timezone, timedelta

# 日本標準時（サーバがUTCでも「今日」を日本時間で判定するため）
JST = timezone(timedelta(hours=9))
import json
import urllib.request
import urllib.parse
import urllib.error
import ssl
import re
import math
from xml.sax.saxutils import escape as xml_escape
load_dotenv()

# 1. アプリケーションの初期化
app = Flask(__name__)

# AdSense審査中はデモ広告を非表示にする。審査通過後は True に戻すだけで再有効化できる。
ADSENSE_DEMO_ENABLED = False

MISSION_NAME_TRANSLATIONS = {
    'watosa': {'ja': '加減算', 'en': 'addition/subtraction math'},
    'sekitosyou': {'ja': '乗除算', 'en': 'multiplication/division math'},
    'shake': {'ja': 'シェイク', 'en': 'shake mission'},
    'kamera': {'ja': 'AIカメラ', 'en': 'AI camera mission'},
    'stroop': {'ja': '色当て', 'en': 'color match mission'},
    'odd_one': {'ja': 'ニセモノ探し', 'en': 'odd-one-out mission'},
    'memory': {'ja': '瞬間記憶', 'en': 'memory mission'},
    'target': {'ja': '動く的当て', 'en': 'moving target mission'},
    '加減算': {'ja': '加減算', 'en': 'addition/subtraction math'},
    '乗除算': {'ja': '乗除算', 'en': 'multiplication/division math'},
    'シェイク': {'ja': 'シェイク', 'en': 'shake mission'},
    'AIカメラ': {'ja': 'AIカメラ', 'en': 'AI camera mission'},
    '色当て': {'ja': '色当て', 'en': 'color match mission'},
    'ニセモノ探し': {'ja': 'ニセモノ探し', 'en': 'odd-one-out mission'},
    '瞬間記憶': {'ja': '瞬間記憶', 'en': 'memory mission'},
    '動く的当て': {'ja': '動く的当て', 'en': 'moving target mission'},
}


def _localize_sleep_logs(logs, lang):
    localized = []
    for log in logs:
        item = dict(log)
        mission = str(item.get('mission', ''))
        item['mission'] = MISSION_NAME_TRANSLATIONS.get(mission, {}).get(lang, mission)
        localized.append(item)
    return localized


@app.route('/generate_report', methods=['POST'])
def generate_report():
    lang = 'ja'
    try:
        # フロント(localStorage)から送られてきた起床ログを受け取る
        data = request.get_json() or {}
        logs = data.get('logs', [])
        lang = data.get('lang', 'ja')
        if lang not in ('ja', 'en'):
            lang = 'ja'

        if not logs:
            msg = "まだデータがありません。明日から頑張りましょう！" if lang == 'ja' else "No data yet. Let's start tomorrow!"
            return jsonify({"status": "success", "report": msg})

        analyzed_logs = _localize_sleep_logs(logs, lang)

        if lang == 'ja':
            prompt = f"""あなたは生活習慣アドバイザーです。以下の起床ログを分析し、必ず下記の4つの見出しをすべて含めて出力してください。各項目は2〜3文でしっかり書いてください。合計300〜600文字程度の充実した内容にしてください。自然な日本語のみで出力すること。

【データの見方】
- duration: アラームが鳴ってから起床（ミッションクリア）までの秒数。短いほど良い。
- success: trueならミッションクリア、falseなら未クリア
- wake_time: 起床設定時刻
- mission: 使用したミッションの種類
- day_of_week: 曜日

【ユーザーの起床ログ】
{analyzed_logs}

【出力フォーマット（このとおりに出力すること）】
📊 今週の傾向
（ログ全体の傾向を2〜3文で詳しく）

✅ よかった点
（できていたことを2〜3文で具体的に）

🔧 改善ポイント
（改善できそうな点を2〜3文で具体的に）

🌱 来週へのアドバイス
（具体的な行動提案を2〜3文で詳しく）"""
        else:
            prompt = f"""You are a lifestyle habit coach. Analyze the wake-up logs below and output ALL FOUR sections with their headers. Write 2-3 sentences per section with enough detail. Aim for 150-300 words total. Output natural English only.

[How to read the data]
- duration: seconds from alarm to mission clear. Shorter = better.
- success: true = mission cleared, false = not cleared
- wake_time: target wake-up time
- mission: mission type used
- day_of_week: weekday

[Wake-up logs]
{analyzed_logs}

[Output format — follow exactly]
📊 Weekly trend
(2-3 sentences on overall pattern in detail)

✅ What went well
(2-3 sentences on specific positives)

🔧 Areas to improve
(2-3 sentences on specific things to work on)

🌱 Advice for next week
(2-3 sentences of concrete, actionable advice)"""

        report_text = generate_with_gemini(prompt, temperature=0.7, max_tokens=1000)
        return jsonify({"status": "success", "report": report_text})

    except Exception as e:
        app.logger.exception("generate_report エラー")
        msg = "レポートの生成に失敗しました（エラー）。" if lang == 'ja' else "Failed to generate the report."
        return jsonify({"status": "error", "report": msg, "error": str(e)}), 500
        
# ==========================================
# Gemini APIの設定
# ==========================================
_use_vertex = os.environ.get("USE_VERTEX_AI", "false").lower() == "true"
_GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-lite")

if _use_vertex:
    _gcp_project  = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
    _gcp_location = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
    _gemini_client = genai.Client(vertexai=True, project=_gcp_project, location=_gcp_location)
    app.logger.info("✅ Gemini: Vertex AI モード (project=%s, location=%s, model=%s)",
                    _gcp_project, _gcp_location, _GEMINI_MODEL)
else:
    _gemini_api_key = os.environ.get("GEMINI_API_KEY", "")
    if not _gemini_api_key:
        app.logger.warning("⚠️ GEMINI_API_KEY が設定されていません")
    else:
        app.logger.info("✅ Gemini: Developer API モード (key=%d chars, model=%s)",
                        len(_gemini_api_key), _GEMINI_MODEL)
    _gemini_client = genai.Client(api_key=_gemini_api_key) if _gemini_api_key else None


def generate_with_gemini(prompt, system_prompt=None, temperature=0.8, max_tokens=900):
    """Gemini で文章を生成する共通関数。USE_VERTEX_AI に応じてバックエンドを切り替える。"""
    if _gemini_client is None:
        raise RuntimeError("Gemini クライアントが初期化されていません（API キーまたは Vertex AI 設定を確認してください）")

    # thinking_budget=0 でシンキングを無効化する。
    # gemini-2.5-flash はデフォルトで AUTOMATIC モードのシンキングを行い、
    # そのトークンが max_output_tokens を消費するため可視テキストが極端に短くなる。
    try:
        thinking_cfg = genai_types.ThinkingConfig(thinking_budget=0)
    except Exception:
        thinking_cfg = None

    config = genai_types.GenerateContentConfig(
        system_instruction=system_prompt,
        temperature=temperature,
        max_output_tokens=max_tokens,
        thinking_config=thinking_cfg,
    )
    app.logger.info(
        "generate_with_gemini 開始: model=%s max_tokens=%d temperature=%.2f thinking_budget=0",
        _GEMINI_MODEL, max_tokens, temperature,
    )
    response = _gemini_client.models.generate_content(
        model=_GEMINI_MODEL,
        contents=prompt,
        config=config,
    )
    text = response.text.strip()

    # 診断ログ: finish_reason / トークン内訳
    try:
        finish = response.candidates[0].finish_reason if response.candidates else "?"
        usage  = response.usage_metadata
        out_tok    = getattr(usage, 'candidates_token_count', '?') or '?'
        think_tok  = getattr(usage, 'thoughts_token_count', 0) or 0
        app.logger.info(
            "AI生成完了: finish=%s out_tokens=%s think_tokens=%d chars=%d",
            finish, out_tok, think_tok, len(text),
        )
    except Exception:
        app.logger.info("AI生成文字数: %d", len(text))

    return text

# 2. iOS Safari対策: ルートパスでのfavicon返却設定
@app.route('/favicon.ico')
def favicon():
    return send_from_directory(
        os.path.join(app.root_path, 'static'),
        'favicon.ico', 
        mimetype='image/vnd.microsoft.icon'
    )

# 3. AIモデルの読み込み
model = YOLO('yolov8n.pt') 

ITEMS = ['cup', 'bottle', 'toothbrush', 'spoon', 'fork', 'chair', 'apple', 'banana', 'remote', 'book', 'scissors', 'clock', 'umbrella', 'backpack', 'keyboard']

SITE_URL = "https://hayo.webtool-labs.com"
FIREBASE_AUTH_DOMAIN = "web-app-95c34.firebaseapp.com"
PUBLIC_SITEMAP_PAGES = [
    {"path": "/", "template": "landing.html", "priority": "1.0"},
    {"path": "/app", "template": "index.html", "priority": "0.9"},
    {"path": "/ai-alarm", "template": "ai_alarm.html", "priority": "0.8"},
    {"path": "/mission-alarm", "template": "mission_alarm.html", "priority": "0.8"},
    {"path": "/faq", "template": "faq.html", "priority": "0.7"},
    {"path": "/how-to-use", "template": "how_to_use.html", "priority": "0.7"},
    {"path": "/blog/cannot-wake-up", "template": "blog_cannot_wake_up.html", "priority": "0.7"},
    {"path": "/blog/prevent-oversleeping", "template": "blog_prevent_oversleeping.html", "priority": "0.7"},
    {"path": "/blog/weather-alarm", "template": "blog_weather_alarm.html", "priority": "0.7"},
    {"path": "/about", "template": "about.html", "priority": "0.5"},
    {"path": "/privacy", "template": "privacy.html", "priority": "0.5"},
    {"path": "/terms", "template": "terms.html", "priority": "0.5"},
    {"path": "/advertising", "template": "advertising.html", "priority": "0.5"},
    {"path": "/contact", "template": "contact.html", "priority": "0.5"},
]


def _template_lastmod(template_name):
    template_path = os.path.join(app.root_path, "templates", template_name)
    if not os.path.exists(template_path):
        return datetime.now(JST).date().isoformat()
    return datetime.fromtimestamp(os.path.getmtime(template_path), JST).date().isoformat()


@app.context_processor
def inject_static_version():
    def static_version(filename):
        path = os.path.join(app.static_folder, filename)
        try:
            return str(int(os.path.getmtime(path)))
        except OSError:
            return "1"
    return {"static_version": static_version}


# 4. ルート定義
@app.route('/')
def index():
    return render_template('landing.html')

@app.route('/app')
def alarm_app():
    initial_target = random.choice(ITEMS)
    response = make_response(render_template(
        'index.html',
        target=initial_target,
        adsense_demo_enabled=ADSENSE_DEMO_ENABLED,
    ))
    response.headers["Cache-Control"] = "no-store, max-age=0"
    return response

# メール確認・パスワードリセットのカスタム画面（アプリと同じデザイン・日本語）
@app.route('/auth/action')
def auth_action():
    response = make_response(render_template('auth_action.html'))
    response.headers["Cache-Control"] = "no-store, max-age=0"
    return response


def proxy_firebase_helper(path):
    query = request.query_string.decode("utf-8")
    target_url = f"https://{FIREBASE_AUTH_DOMAIN}/{path}"
    if query:
        target_url = f"{target_url}?{query}"

    headers = {
        key: value for key, value in request.headers
        if key.lower() not in {"host", "content-length", "connection", "accept-encoding"}
    }
    body = request.get_data() if request.method not in {"GET", "HEAD"} else None
    upstream_request = urllib.request.Request(
        target_url,
        data=body,
        headers=headers,
        method=request.method,
    )

    try:
        with urllib.request.urlopen(upstream_request, timeout=15) as upstream:
            response_body = upstream.read()
            status = upstream.status
            upstream_headers = upstream.headers
    except urllib.error.HTTPError as exc:
        response_body = exc.read()
        status = exc.code
        upstream_headers = exc.headers
    except urllib.error.URLError as exc:
        return Response(
            f"Firebase auth helper proxy failed: {exc}",
            status=502,
            mimetype="text/plain",
        )

    response = Response(response_body, status=status)
    for key, value in upstream_headers.items():
        if key.lower() not in {"connection", "transfer-encoding", "content-encoding", "content-length"}:
            response.headers[key] = value
    return response


@app.route("/__/auth/<path:auth_path>", methods=["GET", "POST", "HEAD", "OPTIONS"])
def firebase_auth_helper(auth_path):
    return proxy_firebase_helper(f"__/auth/{auth_path}")

# SEO: 検索流入向けの公開ページ
@app.route("/ai-alarm")
def ai_alarm():
    return render_template("ai_alarm.html")

@app.route("/mission-alarm")
def mission_alarm():
    return render_template("mission_alarm.html")

@app.route("/faq")
def faq():
    return render_template("faq.html")

@app.route("/how-to-use")
def how_to_use():
    return render_template("how_to_use.html")

@app.route("/blog/cannot-wake-up")
def blog_cannot_wake_up():
    return render_template("blog_cannot_wake_up.html")

@app.route("/blog/prevent-oversleeping")
def blog_prevent_oversleeping():
    return render_template("blog_prevent_oversleeping.html")

@app.route("/blog/weather-alarm")
def blog_weather_alarm():
    return render_template("blog_weather_alarm.html")

@app.route("/about")
def about():
    return render_template("about.html")

@app.route("/privacy")
def privacy():
    return render_template("privacy.html")

@app.route("/terms")
def terms():
    return render_template("terms.html")

@app.route("/contact")
def contact():
    return render_template("contact.html")

@app.route("/advertising")
def advertising():
    return render_template("advertising.html")

@app.route("/operator")
def operator():
    return render_template("about.html")

@app.route("/ads.txt")
def ads_txt():
    return app.send_static_file("ads.txt")

# SEO: クローラー向け robots.txt
@app.route("/robots.txt")
def robots_txt():
    return """User-agent: *
Allow: /

Sitemap: https://hayo.webtool-labs.com/sitemap.xml
""", 200, {"Content-Type": "text/plain; charset=utf-8"}

# SEO: サイトマップ（公開ページのみ。ログイン後・APIは含めない）
@app.route("/sitemap.xml")
def sitemap_xml():
    rows = ['<?xml version="1.0" encoding="UTF-8"?>']
    rows.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    for page in PUBLIC_SITEMAP_PAGES:
        loc = f"{SITE_URL}{page['path']}"
        rows.extend([
            "  <url>",
            f"    <loc>{xml_escape(loc)}</loc>",
            f"    <lastmod>{_template_lastmod(page['template'])}</lastmod>",
            f"    <priority>{page['priority']}</priority>",
            "  </url>",
        ])
    rows.append("</urlset>")
    return "\n".join(rows) + "\n", 200, {"Content-Type": "application/xml; charset=utf-8"}

@app.route('/get_target')
def get_target():
    return jsonify({"target": random.choice(ITEMS)})

@app.route('/check_camera', methods=['POST'])
def check_camera():
    try:
        data = request.json['image']
        img_data = base64.b64decode(data.split(',')[1])
        nparr = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        results = model(img)
        detected_objects = [model.names[int(box.cls[0])] for result in results for box in result.boxes]
        return jsonify({"status": "success", "detected": detected_objects})
    except Exception as e:
        print("カメラ解析エラー:", e)
        return jsonify({"status": "error", "detected": []})
    
# 💡 【重要】開発中はここを True にしてください。
# 本実装（課金後）の時は False に書き換えるだけです！
DEBUG_MODE = False

@app.route('/generate_excuse', methods=['POST'])
def generate_excuse():
    lang = 'ja'
    try:
        data = request.get_json() or {}
        target = data.get('target', 'boss')
        tone = data.get('tone', 'sincere')
        situation = data.get('situation', '').strip()
        lang = data.get('lang', 'ja')
        if lang not in ('ja', 'en'):
            lang = 'ja'

        realistic_excuse_focus_ja = random.choice([
            '電車やバスの遅延・運転見合わせ',
            '道路渋滞や乗り換えミス',
            '家族の急な用事や送迎対応',
            '自宅設備のトラブル（水漏れ・鍵・ブレーカーなど）',
            '管理会社や近隣への急な対応',
            '忘れ物や持ち物の再確認に伴う遅れ',
        ])
        realistic_excuse_focus_en = random.choice([
            'a train or bus delay',
            'traffic congestion or a missed transfer',
            'an urgent family errand or pickup/drop-off',
            'a home issue such as a leak, lock, or breaker problem',
            'an urgent matter with building management or a neighbor',
            'a delay caused by checking or retrieving an essential item',
        ])

        if DEBUG_MODE:
            if lang == 'ja':
                if tone == 'sincere':
                    excuse = "【テスト中】寝坊してしまい、本当に申し訳ございません。自分の管理不足でご迷惑をおかけしたことを深く反省しております。"
                elif tone == 'simple':
                    excuse = f"【テスト中】申し訳ありません。{realistic_excuse_focus_ja}があり、到着が遅れそうです。急いで向かっております。"
                else:
                    excuse = "【テスト中】寝坊しました、すみません！電車が遅れたので、次の駅でダッシュします！"
            else:
                if tone == 'sincere':
                    excuse = "[Test] I overslept, and I am truly sorry. I take full responsibility for the inconvenience my lack of preparation caused."
                elif tone == 'simple':
                    excuse = f"[Test] I'm sorry, but {realistic_excuse_focus_en} is delaying me. I'm heading over as quickly as I can."
                else:
                    excuse = "[Test] I'm sorry I'm late. My train was delayed, so I'll hurry from the next station."
            return jsonify({"status": "success", "excuse": excuse})

        if lang == 'ja':
            target_map = {
                'boss': '会社の上司', 'part_time': 'バイト先の店長', 'teacher': '学校の先生',
                'friend': '仲の良い友達', 'lover': '恋人', 'family': '家族'
            }
            tone_map = {
                'simple': (
                    '誠実な謝罪をベースにしつつ、現実的な言い訳を自然に添えたメッセージ。'
                    '体調不良・病気・発熱・頭痛・腹痛・吐き気・めまい・通院など健康理由は絶対に使わない。'
                    '電車やバスの遅延、交通トラブル、家庭の急用、自宅設備のトラブル、管理会社対応、忘れ物対応など、'
                    '日常で起こり得る理由を1つだけ具体的に説明する。'
                    '深い反省と申し訳なさが伝わる丁寧な言葉を使い、ユーモアは一切使わない。'
                ),
                'sincere': (
                    '寝坊してしまった事実を真摯に受け止める、深い反省と誠実さが伝わる謝罪メッセージ。'
                    '体調不良・交通機関の遅延・家庭の事情などの言い訳は一切せず、自分の管理不足として責任を認める。'
                    '「本当に申し訳ございません」「深く反省しております」など誠実な言葉を使う。'
                    'ユーモアや言い訳は絶対に入れない。相手への敬意を忘れずに。'
                ),
                'funny': (
                    'クスっと笑えるユーモアたっぷりの言い訳メッセージ。'
                    '現実ではあり得ないような突拍子もない面白い理由を使う。'
                    'シリアスな謝罪や普通の言い訳は一切入れない。読んだ相手が思わず笑ってしまうような内容にすること。'
                ),
                'sick': (
                    '体調不良を強くアピールして同情を引くメッセージ。'
                    '頭痛・吐き気・発熱・めまいなど具体的な症状を詳しく描写し、いかに辛い状況かを切実に訴える。'
                    'ユーモアは一切使わず、リアルで深刻な体調不良感を出す。'
                    '相手が「それは仕方ない」と思うほど説得力のある内容にすること。'
                ),
            }
            target_name = target_map.get(target, '会社の上司')
            if tone == 'sincere':
                situation_instruction = (
                    f"- 状況: {situation}（参考にしてよいが、体調不良・交通機関の遅延・家庭の事情などの言い訳に置き換えず、寝坊した事実への謝罪を中心にすること）"
                    if situation
                    else "- 理由・状況: 寝坊してしまったこと。体調不良・交通機関の遅延・家庭の事情などの別理由は創作しないこと"
                )
            elif tone == 'simple':
                situation_instruction = (
                    f"- 状況: {situation}（参考にしてよいが、体調不良・病気・症状・通院などの健康理由にはしないこと。現実的な言い訳として自然に整えること）"
                    if situation
                    else f"- 理由の方向性: {realistic_excuse_focus_ja}（かぶりを減らすため、この方向性を中心に具体化すること。体調不良は使わないこと）"
                )
            else:
                situation_instruction = f"- 理由・状況: {situation}（この状況を必ず反映すること）" if situation else "- 理由・状況: 上記のトーンに合った自然な理由を創作すること"
            system_prompt = (
                "あなたは指示に100%厳密に従うメッセージ生成AIです。"
                "指定されたトーン・文体を絶対に守り、日本語のメッセージ本文のみを出力してください。"
                "前置き・説明・「はい」「わかりました」などの返事は一切不要です。"
                "メッセージ以外の文字を出力することは禁止です。"
            )
            prompt = f"""以下の条件で遅刻・欠席の連絡メッセージを1つ作成してください。

【条件】
- 送る相手: {target_name}
- 文体・トーン: {tone_map.get(tone, tone_map['simple'])}
{situation_instruction}
- 文の数: 3〜5文（短すぎず、かつ冗長にならない自然な長さ。合計150〜300文字程度）
- 出力はメッセージ本文のみ（説明・前置き・「はい」などの返事不要）
- 日本語で出力すること
"""
        else:
            target_map = {
                'boss': 'a workplace boss', 'part_time': 'a part-time job manager', 'teacher': 'a teacher',
                'friend': 'a close friend', 'lover': 'a partner', 'family': 'a family member'
            }
            tone_map = {
                'simple': (
                    'A sincere late-arrival message that naturally includes a realistic excuse. '
                    'Never use illness, symptoms, feeling unwell, medical appointments, or any health-related reason. '
                    'Use exactly one realistic everyday reason, such as a train or bus delay, traffic trouble, an urgent family errand, '
                    'a home issue, building-management matter, or checking/retrieving an essential item. '
                    'Use polite, apologetic language. Do not add jokes.'
                ),
                'sincere': (
                    'A deeply sincere apology for oversleeping. State that you overslept and take responsibility. '
                    'Do not mention illness, train delays, family issues, or any invented excuse. '
                    'Clearly express regret and respect for the recipient.'
                ),
                'funny': (
                    'A playful, funny excuse message. Use an exaggerated, lighthearted reason. '
                    'Keep it amusing and avoid a heavy formal apology.'
                ),
                'sick': (
                    'A convincing message focused on feeling unwell. Mention realistic symptoms and sound genuinely apologetic. '
                    'Do not use humor.'
                ),
            }
            target_name = target_map.get(target, 'a workplace boss')
            if tone == 'sincere':
                situation_instruction = (
                    f"- Situation: {situation} (you may use this as context, but do not turn it into an excuse. Keep the message centered on apologizing for oversleeping.)"
                    if situation
                    else "- Reason / situation: you overslept. Do not invent illness, train delays, family issues, or any other excuse."
                )
            elif tone == 'simple':
                situation_instruction = (
                    f"- Situation: {situation} (you may use this as context, but do not use illness, symptoms, medical appointments, or any health-related reason. Shape it into a realistic excuse.)"
                    if situation
                    else f"- Reason direction: {realistic_excuse_focus_en} (use this focus to reduce repetition. Do not use illness or any health-related reason.)"
                )
            else:
                situation_instruction = f"- Reason / situation: {situation} (must be reflected)" if situation else "- Reason / situation: create a natural reason that matches the selected tone"
            system_prompt = (
                "You are a message generator that follows instructions exactly. "
                "Output only the final English message body. "
                "Do not include explanations, greetings like 'Sure', labels, or comments. "
                "Never output Japanese."
            )
            prompt = f"""
Create one late-arrival message with the conditions below.

[Conditions]
- Recipient: {target_name}
- Tone: {tone_map.get(tone, tone_map['simple'])}
{situation_instruction}
- Length: 3 to 5 sentences (natural length, not too short or too long. Around 80-150 words total.)
- Output only the message body. No explanation, preface, or comments.
- Output in English only.
"""

        # トーンごとにtemperatureを最適化
        temperature_map = {
            'simple': 0.75,
            'sincere': 0.4,
            'funny': 1.1,
            'sick': 0.6,
        }
        temperature = temperature_map.get(tone, 0.7)

        excuse_text = generate_with_gemini(prompt, system_prompt=system_prompt, temperature=temperature, max_tokens=500)
        return jsonify({"status": "success", "excuse": excuse_text})
    
    except Exception as e:
        app.logger.exception("generate_excuse エラー")
        excuse = "AIが休息中です。自力で謝りましょう！🙏" if lang == 'ja' else "AI is taking a break. Time for a sincere apology!"
        return jsonify({
            "status": "error",
            "excuse": excuse,
            "error": str(e)
        })


# ==========================================
# 🌅 朝のはじまり（今日はどんな日・服装・星座占い）
# ==========================================
ZODIAC_NAMES = {
    'aries':       {'ja': 'おひつじ座', 'en': 'Aries'},
    'taurus':      {'ja': 'おうし座',   'en': 'Taurus'},
    'gemini':      {'ja': 'ふたご座',   'en': 'Gemini'},
    'cancer':      {'ja': 'かに座',     'en': 'Cancer'},
    'leo':         {'ja': 'しし座',     'en': 'Leo'},
    'virgo':       {'ja': 'おとめ座',   'en': 'Virgo'},
    'libra':       {'ja': 'てんびん座', 'en': 'Libra'},
    'scorpio':     {'ja': 'さそり座',   'en': 'Scorpio'},
    'sagittarius': {'ja': 'いて座',     'en': 'Sagittarius'},
    'capricorn':   {'ja': 'やぎ座',     'en': 'Capricorn'},
    'aquarius':    {'ja': 'みずがめ座', 'en': 'Aquarius'},
    'pisces':      {'ja': 'うお座',     'en': 'Pisces'},
}
ZODIAC_ORDER = tuple(ZODIAC_NAMES.keys())


def get_daily_zodiac_rank(sign_key, now):
    """日付ごとに12星座へ1〜12位を重複なしで割り当てる。日付が変わるとリセットされる。"""
    signs = list(ZODIAC_ORDER)
    rng = random.Random(f"zodiac-rank:{now.strftime('%Y-%m-%d')}")
    rng.shuffle(signs)
    ranks = {sign: idx + 1 for idx, sign in enumerate(signs)}
    return ranks.get(sign_key, ranks['aries'])


def _ensure_morning_rank(text, sign_name, rank, lang='ja'):
    """AIが順位を書き換えても、サーバーで決めた日替わり順位へ補正する。"""
    if not text:
        return text

    if lang == 'ja':
        required = f"今日の{sign_name}の運勢は{rank}位です！"
        pattern = rf'今日の{re.escape(sign_name)}の運勢は[0-9０-９]+位です[!！]?'
        if re.search(pattern, text):
            return re.sub(pattern, required, text, count=1)
        heading = f"🔮 {sign_name}の運勢\n"
        return text.replace(heading, f"{heading}{required}", 1)

    required = f"Your {sign_name} luck today ranks #{rank}!"
    pattern = rf'Your {re.escape(sign_name)} luck today ranks #?[0-9]+(?:st|nd|rd|th)?[.!]?'
    if re.search(pattern, text, flags=re.IGNORECASE):
        return re.sub(pattern, required, text, count=1, flags=re.IGNORECASE)
    heading = f"🔮 {sign_name} fortune\n"
    return text.replace(heading, f"{heading}{required} ", 1)


def _ensure_morning_lucky_item(text, sign_name, lucky_item, lang='ja'):
    """AIが省略しても、ラッキーアイテムだけは必ず本文に入れる。"""
    if not text or not lucky_item:
        return text

    if lang == 'ja':
        required = f"ラッキーアイテムは{lucky_item}です。"
        if 'ラッキーアイテム' in text and lucky_item in text:
            return text

        rank_pattern = rf'(今日の{re.escape(sign_name)}の運勢は[0-9０-９]+位です[!！]?)'
        if re.search(rank_pattern, text):
            return re.sub(rank_pattern, lambda match: f"{match.group(1)}{required}", text, count=1)

        heading = f"🔮 {sign_name}の運勢\n"
        if heading in text:
            return text.replace(heading, f"{heading}{required}", 1)
        return f"{text}\n\n{required}"

    required = f"Lucky item: {lucky_item}."
    if 'lucky item' in text.lower() and lucky_item.lower() in text.lower():
        return text

    rank_pattern = rf'(Your {re.escape(sign_name)} luck today ranks #?[0-9]+(?:st|nd|rd|th)?[.!])'
    if re.search(rank_pattern, text, flags=re.IGNORECASE):
        return re.sub(
            rank_pattern,
            lambda match: f"{match.group(1)} {required}",
            text,
            count=1,
            flags=re.IGNORECASE,
        )

    heading = f"🔮 {sign_name} fortune\n"
    if heading in text:
        return text.replace(heading, f"{heading}{required} ", 1)
    return f"{text}\n\n{required}"


def _split_morning_heading(line):
    """朝メッセージの見出しと本文を分ける。本文まで同じ行に出た場合も吸収する。"""
    patterns = (
        r"^(🌅\s*(?:今日はどんな日|Today's vibe))\s*(.*)$",
        r'^(👕\s*(?:おすすめの服装|What to wear))\s*(.*)$',
        r"^(💬\s*(?:今日のひとこと|Today's message))\s*(.*)$",
        r'^(🔮\s*(?:.+?(?:の運勢|fortune)))\s*(.*)$',
    )
    for pattern in patterns:
        match = re.match(pattern, line)
        if match:
            return match.group(1).strip(), match.group(2).strip()
    return None, line


def _clean_morning_text(text, lang='ja'):
    """AI出力を、見出しごとの読みやすい段落に整える。"""
    if not text:
        return ""

    sections = []
    current_heading = None
    current_lines = []

    def flush_section():
        nonlocal current_heading, current_lines
        if current_heading is None and not current_lines:
            return
        if lang == 'ja':
            body = ''.join(current_lines)
            body = re.sub(r'\s+([、。！？!?｡])', r'\1', body)
            body = re.sub(r'([、。！？!?｡])\s+', r'\1', body)
        else:
            body = ' '.join(current_lines)
            body = re.sub(r'\s+', ' ', body)
        body = body.strip()
        sections.append((current_heading, body))
        current_heading = None
        current_lines = []

    for raw_line in text.strip().splitlines():
        line = raw_line.strip()
        if not line:
            continue
        line = re.sub(r'^[\-・*]\s*', '', line)
        heading, rest = _split_morning_heading(line)
        if heading:
            flush_section()
            current_heading = heading
            if rest:
                current_lines.append(rest)
            continue
        current_lines.append(rest)

    flush_section()

    parts = []
    for heading, body in sections:
        if heading and body:
            parts.append(f"{heading}\n{body}")
        elif heading:
            parts.append(heading)
        elif body:
            parts.append(body)

    out = "\n\n".join(parts)
    out = re.sub(r'\n{3,}', '\n\n', out)
    return out.strip()


LUCKY_COLORS = {
    'ja': ['赤', '青', '黄色', '緑', '紫', 'オレンジ', 'ピンク', '水色', '白', '金色',
           '銀色', '茶色', '黄緑', '紺色', '桜色', '藍色', 'ターコイズブルー', 'ラベンダー',
           'ベージュ', 'クリーム色', '若草色', 'えんじ色', '空色', '山吹色'],
    'en': ['red', 'blue', 'yellow', 'green', 'purple', 'orange', 'pink', 'light blue',
           'white', 'gold', 'silver', 'brown', 'lime green', 'navy', 'coral', 'indigo',
           'turquoise', 'lavender', 'beige', 'cream', 'mint green', 'maroon', 'sky blue', 'amber'],
}
LUCKY_ITEMS = {
    'ja': ['ハンカチ', '鍵', 'ペン', '手帳', '腕時計', 'マグカップ', '観葉植物', '本',
           'イヤホン', 'リップクリーム', '手鏡', '折りたたみ傘', '財布', '付箋', 'クリップ',
           '靴下', '帽子', 'スカーフ', 'キーホルダー', '水筒', '緑茶', 'コーヒー',
           'チョコレート', 'あめ', 'りんご', '花', 'カレンダー', 'クッション', 'マフラー', 'メモ帳',
           'ノート', 'ボールペン', 'タオル', 'マスク', 'ハンドクリーム', '絆創膏'],
    'en': ['a handkerchief', 'your keys', 'a pen', 'a notebook', 'a watch', 'a mug',
           'a small plant', 'a book', 'earphones', 'lip balm', 'a hand mirror',
           'a folding umbrella', 'a wallet', 'sticky notes', 'a paper clip', 'socks',
           'a hat', 'a scarf', 'a keychain', 'a water bottle', 'green tea', 'coffee',
           'chocolate', 'candy', 'an apple', 'a flower', 'a calendar', 'a cushion',
           'a memo pad', 'a ballpoint pen', 'a towel', 'a face mask', 'hand cream', 'a bandage'],
}

FORTUNE_VARIATIONS = {
    'ja': {
        'theme': [
            '人との距離感', '仕事や勉強の集中', '小さな挑戦', '予定の整え方', '気分転換',
            '連絡や会話', 'お金や持ち物の管理', '体調の整え方', '新しい情報', '片づけや準備',
            '直感を信じる場面', '頼みごとの伝え方', '朝のスタート', '午後の巻き返し',
        ],
        'scene': [
            '朝の移動中', '午前中の最初の作業', '昼前のひと区切り', '午後の連絡',
            '人に会う前の準備', '予定を確認するタイミング', '休憩に入る直前',
            '帰る前の見直し', '買い物や支払いの前', 'メッセージを送る前',
        ],
        'action': [
            '最初にやることを一つだけ決める', '気になる相手へ短く丁寧に返事をする',
            '机やバッグの中を三分だけ整える', '迷った予定は午前中に確認する',
            '一度深呼吸してから返事をする', '必要な物を出発前に一つ確認する',
            'いつもより早めに小休憩を入れる', 'メモを一行だけ残してから動く',
            '頼まれごとは期限を添えて返す', '気になった情報を後で見返せる形に残す',
        ],
        'caution': [
            '返事を急ぎすぎること', '予定を詰め込みすぎること', '小さな違和感を流すこと',
            '持ち物の確認を後回しにすること', '曖昧なまま引き受けること',
            '気分だけで買い足すこと', '疲れを我慢し続けること', '人のペースに合わせすぎること',
            '一度決めたことを何度も悩み直すこと', '細かい通知に集中を切られること',
        ],
    },
    'en': {
        'theme': [
            'personal boundaries', 'focused work or study', 'a small challenge',
            'planning the day', 'a mental reset', 'messages and conversations',
            'money or belongings', 'taking care of your body', 'new information',
            'tidying and preparation', 'trusting your instincts', 'asking clearly',
            'starting the morning well', 'recovering momentum in the afternoon',
        ],
        'scene': [
            'during your morning commute', 'when you start your first task',
            'right before lunch', 'when replying in the afternoon',
            'before meeting someone', 'when checking your schedule',
            'just before a break', 'before wrapping up for the day',
            'before a purchase or payment', 'before sending a message',
        ],
        'action': [
            'choose just one first task', 'send a short, thoughtful reply',
            'tidy your desk or bag for three minutes', 'confirm an uncertain plan early',
            'take one breath before answering', 'check one essential item before leaving',
            'take a small break earlier than usual', 'write one useful note before moving on',
            'reply to requests with a clear deadline', 'save useful information where you can find it later',
        ],
        'caution': [
            'answering too quickly', 'overpacking your schedule', 'brushing off a small concern',
            'leaving belongings unchecked', 'accepting something before it is clear',
            'buying extra things on impulse', 'pushing through fatigue', 'matching someone else\'s pace too much',
            'reopening a decision too many times', 'letting small notifications break your focus',
        ],
    },
}


def _pick_lucky_value(options, category, sign_key, lang, now):
    """候補を日替わりサイクルで巡回し、短期間の同じ値の再出現を避ける。"""
    if not options:
        return ''
    if len(options) == 1:
        return options[0]

    rng = random.Random(f"lucky-sequence:{category}:{lang}:{sign_key}")
    steps = [step for step in range(1, len(options)) if math.gcd(step, len(options)) == 1]
    step = rng.choice(steps)
    offset = rng.randrange(len(options))
    index = (now.date().toordinal() * step + offset) % len(options)
    return options[index]


def _pick_daily_fortune_context(sign_key, lang, now):
    """Geminiの占い本文が毎日似すぎないよう、日替わりの具体素材を渡す。"""
    variations = FORTUNE_VARIATIONS.get(lang, FORTUNE_VARIATIONS['ja'])
    return {
        key: _pick_lucky_value(options, f"fortune-{key}", sign_key, lang, now)
        for key, options in variations.items()
    }


def fetch_today_facts(now):
    """日本語版Wikipediaの「M月D日」記事から、その日の記念日（〇〇の日）を取得する。
    日付（now）はJSTで渡される前提。失敗時は空リスト（AI側で季節の話題にフォールバック）。"""
    title = f"{now.month}月{now.day}日"
    url = (f"https://ja.wikipedia.org/w/api.php?action=parse"
           f"&page={urllib.parse.quote(title)}&prop=wikitext&format=json&formatversion=2")
    # 朝に不向きな暗い語を含む記念日は除外
    negative = ('戦争', '虐殺', '殺害', '死去', '災害', '地震', '津波', '事件', '事故',
                '爆撃', '空襲', '原爆', 'テロ', '犠牲', '被害', '惨事')
    try:
        # SSL証明書の検証（certifiがあればそのCAを使う。無ければ検証を緩める）
        try:
            import certifi
            ctx = ssl.create_default_context(cafile=certifi.where())
        except Exception:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(url, headers={'User-Agent': 'mezamasi-morning/1.0'})
        with urllib.request.urlopen(req, timeout=6, context=ctx) as res:
            data = json.loads(res.read().decode('utf-8'))
        wikitext = (data.get('parse', {}) or {}).get('wikitext', '') or ''

        # 「記念日・年中行事」セクションを抽出
        m = re.search(r'==\s*記念日・年中行事\s*==(.*?)(?:\n==[^=]|\Z)', wikitext, re.DOTALL)
        if not m:
            return []
        section = m.group(1)

        facts = []
        for line in section.splitlines():
            s = line.strip()
            # トップレベルの「* 記念日名」だけ。説明文（「*:」「**」）は除外
            if not s.startswith('*') or s.startswith('**') or s.startswith('*:'):
                continue
            t = s.lstrip('*').strip()
            t = re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]*)\]\]', r'\1', t)   # [[a|b]]→b, [[a]]→a
            t = re.sub(r'\{\{[^}]*\}\}', '', t)                        # {{...}} 除去
            t = re.sub(r'<ref.*?(?:/>|</ref>)', '', t, flags=re.DOTALL)  # <ref> 除去
            t = re.sub(r'<[^>]+>', '', t)                              # その他タグ
            t = re.sub(r"'''?", '', t)                                # 太字
            t = t.replace('（）', '').replace('()', '').strip(' 　。-—–:：、')
            # 記念日名は短い。長すぎる行・暗い語を含む行は除外
            if t and len(t) <= 30 and not any(kw in t for kw in negative):
                facts.append(t)
        return facts[:15]
    except Exception as ex:
        print("記念日取得エラー:", ex)
        return []


def _pick_today_fact(facts, now):
    """日付をシードに1つの記念日を決定論的に選ぶ。同じ日なら何度呼んでも同じ結果を返す。"""
    if not facts:
        return None
    rng = random.Random(f"today-fact:{now.strftime('%Y-%m-%d')}")
    return rng.choice(facts)


@app.route('/generate_morning', methods=['POST'])
def generate_morning():
    try:
        data = request.get_json() or {}
        sign_key = data.get('sign', 'aries')
        weather = data.get('weather', {}) or {}
        lang = data.get('lang', 'ja')
        if lang not in ('ja', 'en'):
            lang = 'ja'
        if sign_key not in ZODIAC_NAMES:
            sign_key = 'aries'
        app.logger.info("generate_morning 呼び出し: sign=%s, lang=%s, model=%s", sign_key, lang, _GEMINI_MODEL)

        sign_name = ZODIAC_NAMES[sign_key][lang]
        now = datetime.now(JST)
        fortune_rank = get_daily_zodiac_rank(sign_key, now)

        # 🌐 Wikipediaの「今日は何の日」から実在する記念日を取得し、日付シードで1件に固定
        facts = fetch_today_facts(now)
        chosen_fact = _pick_today_fact(facts, now)
        if chosen_fact:
            facts_text = chosen_fact          # 1件のみ渡す（AIに選ばせない）
        elif lang == 'ja':
            facts_text = None                 # フォールバック：季節の話題へ
        else:
            facts_text = None

        # 🎲 ラッキーカラー・アイテムは星座ごとの日替わりサイクルで選び、短期間の重複を避ける
        lucky_color = _pick_lucky_value(
            LUCKY_COLORS.get(lang, LUCKY_COLORS['ja']),
            'color',
            sign_key,
            lang,
            now,
        )
        lucky_item = _pick_lucky_value(
            LUCKY_ITEMS.get(lang, LUCKY_ITEMS['ja']),
            'item',
            sign_key,
            lang,
            now,
        )
        fortune_context = _pick_daily_fortune_context(sign_key, lang, now)

        if lang == 'ja':
            days = ['月', '火', '水', '木', '金', '土', '日']
            date_str = f"{now.year}年{now.month}月{now.day}日（{days[now.weekday()]}曜日）"
            if weather:
                weather_text = (f"{weather.get('cond','不明')}、"
                                f"現在{weather.get('temp','?')}℃"
                                f"（最高{weather.get('max','?')}℃ / 最低{weather.get('min','?')}℃）、"
                                f"降水確率{weather.get('pop','?')}%")
            else:
                weather_text = "天気情報なし"

            system_prompt = (
                "あなたは朝の前向きなコンシェルジュです。"
                "自然で丁寧な日本語のみで出力してください。前置き・挨拶・締めの言葉は不要です。"
            )

            if facts_text:
                fact_instruction = (
                    f"「今日は{facts_text}です。」で始め、この記念日の由来や背景を2〜3文で詳しく説明してください。"
                    f"「◯◯デーの日」のように重複しないこと。"
                )
            else:
                fact_instruction = "季節や時期にちなんだ前向きな話題を「今日は〇〇の季節です。」などで2〜3文紹介してください。"

            prompt = f"""以下の情報をもとに、今日の朝のメッセージを必ず下記の3つの見出しをすべて含めて出力してください。各項目は2〜3文でしっかり書いてください。合計200〜400文字程度の充実した内容にしてください。見出しはそのまま使い、見出しの直後で改行して本文を書いてください。

【今日】{date_str}
【天気】{weather_text}
【星座】{sign_name}
【占い素材】
テーマ: {fortune_context['theme']}
場面: {fortune_context['scene']}
開運アクション: {fortune_context['action']}
気をつけたいこと: {fortune_context['caution']}

🌅 今日はどんな日
{fact_instruction}

👕 おすすめの服装
天気をもとに、通勤・通学に適した服装を2〜3文で詳しくアドバイスしてください。（水着・パジャマ・部屋着などは提案しないこと）

🔮 {sign_name}の運勢
今日の{sign_name}の運勢は{fortune_rank}位です！ラッキーカラーは{lucky_color}、ラッキーアイテムは{lucky_item}です。占い素材を必ず1つ以上使い、具体的な場面や行動が浮かぶ占い文を毎日違う言い回しで1〜2文作ってください。「無理せず」「自分らしく」「一歩ずつ」だけで終わる定型的な助言にしないでください。"""

        else:
            days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
            date_str = f"{now.strftime('%B')} {now.day}, {now.year} ({days[now.weekday()]})"
            if weather:
                weather_text = (f"{weather.get('cond','unknown')}, "
                                f"now {weather.get('temp','?')}C "
                                f"(high {weather.get('max','?')}C / low {weather.get('min','?')}C), "
                                f"rain {weather.get('pop','?')}%")
            else:
                weather_text = "no weather data"

            system_prompt = (
                "You are a cheerful morning concierge. "
                "Output natural English only. No preamble or closing remarks."
            )

            if facts_text:
                fact_instruction = (
                    f"Translate \"{facts_text}\" naturally into English, then start with \"Today is ___.\" "
                    f"Add 2-3 sentences about its origin or meaning."
                )
            else:
                fact_instruction = "Pick a seasonal topic and introduce it in 2-3 sentences."

            prompt = f"""Create today's morning message. Output ALL THREE sections below with their exact headings. Write 2-3 sentences per section with enough detail. Aim for 100-200 words total.

[Today] {date_str}
[Weather] {weather_text}
[Zodiac] {sign_name}
[Fortune material]
Theme: {fortune_context['theme']}
Moment: {fortune_context['scene']}
Lucky action: {fortune_context['action']}
Watch out for: {fortune_context['caution']}

🌅 Today's vibe
{fact_instruction}

👕 What to wear
Based on the weather, recommend everyday clothing for commuting or school in 2-3 sentences. (Never suggest swimwear, pajamas, or loungewear.)

🔮 {sign_name} fortune
Your {sign_name} luck today ranks #{fortune_rank}! Lucky color: {lucky_color}. Lucky item: {lucky_item}. Use at least one fortune material above and write 1-2 fresh, concrete sentences about today's energy or a helpful action with varied phrasing. Do not end with only generic advice such as be yourself, take it easy, or one step at a time."""

        raw = generate_with_gemini(prompt, system_prompt=system_prompt, temperature=0.85, max_tokens=1200)
        message = _clean_morning_text(raw, lang)
        message = _ensure_morning_rank(message, sign_name, fortune_rank, lang)
        message = _ensure_morning_lucky_item(message, sign_name, lucky_item, lang)
        return jsonify({"status": "success", "message": message})

    except Exception as e:
        app.logger.exception("generate_morning エラー")
        lang = 'ja'
        try:
            data = request.get_json(silent=True) or {}
            lang = data.get('lang', 'ja')
        except Exception:
            pass
        if lang not in ('ja', 'en'):
            lang = 'ja'
        return jsonify({
            "status": "error",
            "message": (
                "AIが寝坊中です…！でも、あなたの一日が素敵になりますように☀️"
                if lang == 'ja'
                else "AI is still waking up... but I hope your day is a good one!"
            ),
            "error": str(e)
        }), 500


@app.route('/generate_wake_comment', methods=['POST'])
def generate_wake_comment():
    """ミッションクリア後に表示する短い起床応援コメントを生成する。"""
    try:
        data = request.get_json() or {}
        lang = data.get('lang', 'ja')
        if lang not in ('ja', 'en'):
            lang = 'ja'

        if lang == 'en':
            system_prompt = (
                "You are a warm morning coach. Reply with one short encouraging "
                "English sentence for someone who just woke up by clearing an alarm mission. "
                "No preamble, no labels, no emoji spam."
            )
            user_prompt = "Write one short wake-up encouragement sentence."
        else:
            system_prompt = (
                "あなたは朝の応援コーチです。アラームのミッションをクリアして起きた人へ、"
                "短くて前向きな日本語の応援メッセージを1文だけ返してください。"
                "前置き、ラベル、絵文字の羅列は不要です。"
            )
            user_prompt = "朝の短い応援メッセージを1文ください。"

        comment = generate_with_gemini(user_prompt, system_prompt=system_prompt, temperature=0.8, max_tokens=80)
        return jsonify({"status": "success", "comment": comment})
    except Exception as e:
        app.logger.exception("generate_wake_comment エラー")
        return jsonify({"status": "error", "comment": "", "error": str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8004))
    app.run(host='0.0.0.0', debug=True, port=port)
