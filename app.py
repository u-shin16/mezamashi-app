from flask import Flask, render_template, request, jsonify, send_from_directory
import base64
import numpy as np
import cv2
import random
import os
from groq import Groq
from ultralytics import YOLO
import json
from datetime import datetime
from dotenv import load_dotenv
load_dotenv()

# 1. アプリケーションの初期化
app = Flask(__name__)

# ログを記録する関数
def save_wake_up_log(duration_seconds, success):
    log_data = {
        "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "day_of_week": datetime.now().strftime("%A"), # 月曜, 火曜などを判定用
        "duration": duration_seconds, # 目覚めにかかった秒数
        "success": success
    }
    
    # ファイルがあれば読み込んで追記、なければ新規作成
    logs = []
    if os.path.exists("sleep_logs.json"):
        with open("sleep_logs.json", "r", encoding="utf-8") as f:
            try: logs = json.load(f)
            except: logs = []
            
    logs.append(log_data)
    
    with open("sleep_logs.json", "w", encoding="utf-8") as f:
        json.dump(logs, f, indent=4, ensure_ascii=False)
        
@app.route('/generate_report', methods=['GET'])
def generate_report():
    # 💡 開発モードならAPIを呼ばずにダミーを返す
    if DEBUG_MODE:
        return jsonify({
            "report": "【デバッグ中】今週は月曜と火曜に少し苦戦しましたね。夜更かし気味かもしれません！早寝を心がけましょう！"
        })

    # --- 本番環境（課金後）はここから下が動く ---
    try:
        if not os.path.exists("sleep_logs.json"):
            return jsonify({"report": "まだデータがありません。明日から頑張りましょう！"})

        with open("sleep_logs.json", "r", encoding="utf-8") as f:
            logs = json.load(f)
        
        recent_logs = logs[-7:] 

        prompt = f"""
        あなたは優秀な生活習慣アドバイザーです。以下のユーザーの起床ログを分析し、
        週間の振り返りと、来週に向けた温かいアドバイスを300文字以内で作成してください。
        【ユーザーの起床ログ】{recent_logs}
        """
        
        chat_completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.1-8b-instant",
        )

        return jsonify({"report": chat_completion.choices[0].message.content})

    except Exception as e:
        print("レポート生成エラー:", str(e))
        return jsonify({"report": "レポートの生成に失敗しました（エラー）。"})
        
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
    # --- 開発テスト用のダミー応答 ---
    if DEBUG_MODE:
        return jsonify({
            "status": "success", 
            "excuse": "【テスト中】寝坊しました、すみません！電車が遅れたので、次の駅でダッシュします！"
        })

    # --- 本番環境用のAI呼び出し処理 ---
    try:
        data = request.get_json() or {}
        target = data.get('target', 'boss')
        tone = data.get('tone', 'sincere')
        situation = data.get('situation', '').strip()
        
        target_map = {
            'boss': '会社の上司', 'part_time': 'バイト先の店長', 'teacher': '学校の先生',
            'friend': '仲の良い友達', 'lover': '恋人', 'family': '家族'
        }
        target_name = target_map.get(target, '会社の上司')

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
                '現実ではあり得ないような突拍子もない面白い理由（例：猫に全力で邪魔された、布団に吸い込まれて脱出できなかった等）を使う。'
                'シリアスな謝罪や普通の言い訳は一切入れない。読んだ相手が思わず笑ってしまうような内容にすること。'
            ),
            'sick': (
                '体調不良を強くアピールして同情を引くメッセージ。'
                '頭痛・吐き気・発熱・めまいなど具体的な症状を詳しく描写し、いかに辛い状況かを切実に訴える。'
                'ユーモアは一切使わず、リアルで深刻な体調不良感を出す。'
                '相手が「それは仕方ない」と思うほど説得力のある内容にすること。'
            ),
        }

        situation_instruction = f"- 理由・状況: {situation}（この状況を必ず反映すること）" if situation else "- 理由・状況: 上記のトーンに合った自然な理由を創作すること"

        # トーンごとにtemperatureを最適化
        temperature_map = {
            'simple': 0.6,
            'sincere': 0.4,
            'funny': 1.1,
            'sick': 0.6,
        }
        temperature = temperature_map.get(tone, 0.7)

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
        return jsonify({
            "status": "error", 
            "excuse": "AIが休息中です。自力で謝りましょう！🙏"
        })


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8000))
    app.run(host='0.0.0.0', debug=True, port=port)