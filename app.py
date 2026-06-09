from flask import Flask, render_template, request, jsonify, send_from_directory
import base64
import numpy as np
import cv2
import random
import os
from groq import Groq
from ultralytics import YOLO
from dotenv import load_dotenv
from datetime import datetime, timezone, timedelta

# 日本標準時（サーバがUTCでも「今日」を日本時間で判定するため）
JST = timezone(timedelta(hours=9))
import json
import urllib.request
import urllib.parse
import ssl
import re
load_dotenv()

# 1. アプリケーションの初期化
app = Flask(__name__)

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
            return jsonify({"report": msg})

        recent_logs = _localize_sleep_logs(logs[-7:], lang)

        if lang == 'ja':
            prompt = f"""
        あなたは優秀な生活習慣アドバイザーです。以下のユーザーの起床ログを分析し、
        週間の振り返りと、来週に向けた温かいアドバイスを300文字以内で作成してください。
        必ず自然な日本語だけで出力してください。

        【データの見方】
        - duration: アラームが鳴ってから完全に起きる（ミッションクリア）までの秒数。短いほど寝起きが良い。
        - wake_time: 起床の設定時刻
        - mission: 起床に使ったゲームの種類
        - day_of_week: 曜日（英語表記）

        【ユーザーの起床ログ】{recent_logs}
        """
        else:
            prompt = f"""
        You are an excellent lifestyle habit coach. Analyze the user's wake-up logs and write
        a warm weekly reflection plus practical advice for next week in 120 words or less.
        Output natural English only.

        [How to read the data]
        - duration: seconds from alarm ringing to fully waking up and clearing the mission. Shorter is better.
        - wake_time: the alarm's target wake-up time
        - mission: the mission used to wake up
        - day_of_week: weekday

        [Wake-up logs] {recent_logs}
        """

        chat_completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.1-8b-instant",
        )

        return jsonify({"report": chat_completion.choices[0].message.content})

    except Exception as e:
        print("レポート生成エラー:", str(e))
        msg = "レポートの生成に失敗しました（エラー）。" if lang == 'ja' else "Failed to generate the report."
        return jsonify({"report": msg})
        
# ==========================================
# Groq APIの設定
# ==========================================
api_key = os.environ.get("GROQ_API_KEY")
if not api_key:
    print("⚠️ 警告: GROQ_API_KEY が設定されていません")
    api_key = "YOUR_API_KEY_HERE"

groq_client = Groq(api_key=api_key)

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

# 4. ルート定義
@app.route('/')
def index():
    initial_target = random.choice(ITEMS)
    return render_template('index.html', target=initial_target)

# メール確認・パスワードリセットのカスタム画面（アプリと同じデザイン・日本語）
@app.route('/auth/action')
def auth_action():
    return render_template('auth_action.html')

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

@app.route("/blog/cannot-wake-up")
def blog_cannot_wake_up():
    return render_template("blog_cannot_wake_up.html")

@app.route("/blog/prevent-oversleeping")
def blog_prevent_oversleeping():
    return render_template("blog_prevent_oversleeping.html")

@app.route("/blog/weather-alarm")
def blog_weather_alarm():
    return render_template("blog_weather_alarm.html")

# SEO: クローラー向け robots.txt
@app.route("/robots.txt")
def robots_txt():
    return """User-agent: *
Allow: /

Sitemap: https://hayo.webtool-labs.com/sitemap.xml
""", 200, {"Content-Type": "text/plain; charset=utf-8"}

# SEO: サイトマップ（公開トップページのみ。ログイン後・APIは含めない）
@app.route("/sitemap.xml")
def sitemap_xml():
    return """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://hayo.webtool-labs.com/</loc>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://hayo.webtool-labs.com/ai-alarm</loc>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://hayo.webtool-labs.com/mission-alarm</loc>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://hayo.webtool-labs.com/faq</loc>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://hayo.webtool-labs.com/blog/cannot-wake-up</loc>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://hayo.webtool-labs.com/blog/prevent-oversleeping</loc>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://hayo.webtool-labs.com/blog/weather-alarm</loc>
    <priority>0.7</priority>
  </url>
</urlset>
""", 200, {"Content-Type": "application/xml; charset=utf-8"}

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

        if DEBUG_MODE:
            excuse = (
                "【テスト中】寝坊しました、すみません！電車が遅れたので、次の駅でダッシュします！"
                if lang == 'ja'
                else "[Test] I'm sorry I'm late. My train was delayed, so I'll hurry from the next station."
            )
            return jsonify({"status": "success", "excuse": excuse})

        if lang == 'ja':
            target_map = {
                'boss': '会社の上司', 'part_time': 'バイト先の店長', 'teacher': '学校の先生',
                'friend': '仲の良い友達', 'lover': '恋人', 'family': '家族'
            }
            tone_map = {
                'simple': (
                    '誠実な謝罪をベースにしつつ、遅刻の理由・言い訳を自然に添えたメッセージ。'
                    '深い反省と申し訳なさが伝わる丁寧な言葉を使いながら、'
                    '「〜という事情がありまして」のように自然な理由も説明する。'
                    'ユーモアは一切使わず、誠実さの中に理由が自然に溶け込んでいること。'
                ),
                'sincere': (
                    '深い反省と誠実さが伝わる謝罪メッセージ。'
                    '言い訳は一切せず、ひたすら申し訳ない気持ちと反省を伝える。'
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
            situation_instruction = f"- 理由・状況: {situation}（この状況を必ず反映すること）" if situation else "- 理由・状況: 上記のトーンに合った自然な理由を創作すること"
            system_prompt = (
                "あなたは指示に100%厳密に従うメッセージ生成AIです。"
                "指定されたトーン・文体を絶対に守り、日本語のメッセージ本文のみを出力してください。"
                "前置き・説明・「はい」「わかりました」などの返事は一切不要です。"
                "メッセージ以外の文字を出力することは禁止です。"
            )
            prompt = f"""
以下の条件で遅刻の連絡メッセージを1つ作成してください。

【条件】
- 送る相手: {target_name}
- 文体・トーン: {tone_map.get(tone, tone_map['simple'])}
{situation_instruction}
- 文字数: 80〜120文字
- 出力はメッセージ本文のみ（説明・前置き・コメント不要）
- 日本語で出力すること
"""
        else:
            target_map = {
                'boss': 'a workplace boss', 'part_time': 'a part-time job manager', 'teacher': 'a teacher',
                'friend': 'a close friend', 'lover': 'a partner', 'family': 'a family member'
            }
            tone_map = {
                'simple': (
                    'A sincere late-arrival message that naturally includes a believable reason. '
                    'Use polite, apologetic language. Do not add jokes.'
                ),
                'sincere': (
                    'A deeply sincere apology message. Do not make excuses. '
                    'Clearly express regret, responsibility, and respect for the recipient.'
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
- Length: 40 to 80 English words
- Output only the message body. No explanation, preface, or comments.
- Output in English only.
"""

        # トーンごとにtemperatureを最適化
        temperature_map = {
            'simple': 0.6,
            'sincere': 0.4,
            'funny': 1.1,
            'sick': 0.6,
        }
        temperature = temperature_map.get(tone, 0.7)

        chat_completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            model="llama-3.1-8b-instant",
            temperature=temperature,
        )

        return jsonify({"status": "success", "excuse": chat_completion.choices[0].message.content.strip()})
    
    except Exception as e:
        print("AI生成エラー:", str(e))
        excuse = "AIが休息中です。自力で謝りましょう！🙏" if lang == 'ja' else "AI is taking a break. Time for a sincere apology!"
        return jsonify({
            "status": "error", 
            "excuse": excuse
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

def _split_morning_heading(line):
    """朝メッセージの見出しと本文を分ける。本文まで同じ行に出た場合も吸収する。"""
    patterns = (
        r"^(🌅\s*(?:今日はどんな日|Today's vibe))\s*(.*)$",
        r'^(👕\s*(?:おすすめの服装|What to wear))\s*(.*)$',
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

        sign_name = ZODIAC_NAMES[sign_key][lang]
        now = datetime.now(JST)
        fortune_rank = get_daily_zodiac_rank(sign_key, now)

        # 🌐 Wikipediaの「今日は何の日」から実在する記念日・出来事を取得
        facts = fetch_today_facts(now)
        if facts:
            facts_text = "\n".join(f"- {f}" for f in facts)
        elif lang == 'ja':
            facts_text = "（記念日情報を取得できませんでした。季節や時期にちなんだ前向きな話題にしてください）"
        else:
            facts_text = "(No anniversary data available. Use a seasonal topic instead.)"

        # 🎲 ラッキーカラー・アイテムを多数の候補からランダムに選ぶ（毎回違う組み合わせにして被りを防ぐ）
        lucky_color = random.choice(LUCKY_COLORS.get(lang, LUCKY_COLORS['ja']))
        lucky_item = random.choice(LUCKY_ITEMS.get(lang, LUCKY_ITEMS['ja']))

        if lang == 'ja':
            days = ['月', '火', '水', '木', '金', '土', '日']
            date_str = f"{now.year}年{now.month}月{now.day}日（{days[now.weekday()]}曜日）"
            if weather:
                weather_text = (f"天気は{weather.get('cond','不明')}、"
                                f"現在気温{weather.get('temp','?')}℃"
                                f"（最高{weather.get('max','?')}℃ / 最低{weather.get('min','?')}℃）、"
                                f"降水確率{weather.get('pop','?')}%。")
            else:
                weather_text = "天気情報は取得できていません。一般的な服装アドバイスをしてください。"

            system_prompt = (
                "あなたは朝の前向きなコンシェルジュです。"
                "文法的に正しく、自然で丁寧な日本語だけを使ってください。不自然な言い回しや誤った敬語は避けること。"
                "一文一文をできるだけ短く区切り、一つの文を長くしないでください。だらだら続く文は避け、簡潔に言い切ること。前置きや締めの挨拶は不要です。"
            )
            prompt = f"""以下の情報をもとに、今日の朝のメッセージを作成してください。

【今日】{date_str}
【天気】{weather_text}
【星座】{sign_name}
【今日の星座順位】{fortune_rank}位

【今日の記念日（参考・日本語版Wikipediaより）】
{facts_text}

下の3項目を、指定の書き出しで始めてください。各項目は3〜4文で書いてください。ただし【一文一文は短く】区切り、一つの文を長くしないこと。短い文をテンポよく重ねてください。見出し（絵文字付き）はそのまま使ってください。本文では「。」のたびに改行しないでください。見出しの直後だけ改行し、各項目の本文はひとまとまりの段落にしてください。

🌅 今日はどんな日
上の【今日の記念日】の中から、明るく親しみやすい記念日を1つ選んでください。書き出しは「今日は◯◯です。」とし、◯◯には選んだ記念日の名前をそのまま入れてください（例：「今日はロックの日です。」）。「◯◯デーの日」のように『デー』と『の日』を重ねないこと。続けて、その記念日の意味や由来を、短い文でわかりやすく説明してください。
※この項目は星座とは関係ありません。「星座の日」とは書かないでください。

👕 おすすめの服装
上の【天気】を踏まえ、「今日の天気は〇〇なので、〇〇がおすすめです。」と始めてください。気温差・雨への備え・暑さや寒さ対策などのアドバイスを、短い文で続けてください。提案するのは、外出や通勤・通学にふさわしい一般的な普段着にすること。水着・パジャマ・部屋着・入浴着・下着などの特殊な服装は絶対に提案しないでください。

🔮 {sign_name}の運勢
「今日の{sign_name}の運勢は{fortune_rank}位です！」で必ず始めてください。順位はサーバー側で12星座に1〜12位を重複なく割り当てた今日の順位です。絶対に別の順位へ変えないでください。今日の過ごし方のアドバイスを短い文で添えてください。今日のラッキーカラーは「{lucky_color}」、ラッキーアイテムは「{lucky_item}」です。この2つを必ずそのまま使い、運勢の文に自然に取り入れてください。別のラッキーカラーやラッキーアイテムを勝手に作らないこと。

「◯◯」「〇〇」は実際の内容に置き換えてください。記念日名なども含め、すべて日本語で書き、英単語をそのまま残さないこと。矢印や丸括弧の記号は使わないでください。前置きや締めの挨拶は不要。一文は短く言い切ること！"""
        else:
            days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
            date_str = f"{now.strftime('%B')} {now.day}, {now.year} ({days[now.weekday()]})"
            if weather:
                weather_text = (f"Weather: {weather.get('cond','unknown')}, "
                                f"now {weather.get('temp','?')}C "
                                f"(high {weather.get('max','?')}C / low {weather.get('min','?')}C), "
                                f"rain chance {weather.get('pop','?')}%.")
            else:
                weather_text = "Weather data is unavailable. Give general clothing advice."

            system_prompt = (
                "You are a cheerful morning concierge. "
                "Use natural, grammatically correct English only. "
                "Keep each individual sentence short; do not write long, run-on sentences. No preamble or closing remarks."
            )
            prompt = f"""Create today's morning message based on the info below.

[Today] {date_str}
[Weather] {weather_text}
[Zodiac] {sign_name}
[Today's zodiac rank] #{fortune_rank}

[Today's anniversaries (reference, from Japanese Wikipedia)]
{facts_text}

Write the 3 sections below, each starting with the given sentence. Use 3-4 sentences per section, but keep EACH sentence short and punchy — avoid long, run-on sentences. Keep the emoji headings as they are.

🌅 Today's vibe
The [Today's anniversaries] above are written in Japanese. Pick ONE bright, friendly anniversary, translate its name into natural English, then start with "Today is ___." Do not double words like "Day Day". Add a few short notes about it.
NOTE: This has nothing to do with the zodiac. Never write a "zodiac day".

👕 What to wear
Using the [Weather] above, start with "Today's weather is ___, so ___ is recommended." Add a few short tips (an umbrella, a layer, heat/cold care). Recommend normal everyday clothing suitable for going outside, commuting, or school. Never suggest swimwear, pajamas, loungewear, underwear, or bathing clothes.

🔮 {sign_name} fortune
Start exactly with "Your {sign_name} luck today ranks #{fortune_rank}!" This rank is assigned by the server for today's 12-sign ranking with no duplicates. Never change it to a different rank. Add a few short lines of advice for today. Today's lucky color is "{lucky_color}" and lucky item is "{lucky_item}" — use exactly these two and weave them in naturally. Do not invent any other lucky color or item.

Replace ___ with real content. No arrows or parentheses. No preamble or closing. Keep each sentence short!"""

        chat_completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            model="llama-3.1-8b-instant",
            temperature=0.85,
            max_tokens=430,
        )
        message = _clean_morning_text(chat_completion.choices[0].message.content, lang)
        message = _ensure_morning_rank(message, sign_name, fortune_rank, lang)
        return jsonify({"status": "success", "message": message})

    except Exception as e:
        print("朝メッセージ生成エラー:", str(e))
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
            )
        })


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8000))
    app.run(host='0.0.0.0', debug=True, port=port)
