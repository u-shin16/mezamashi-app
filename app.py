from flask import Flask, render_template, request, jsonify, send_from_directory
import base64
import numpy as np
import cv2
import random
import os
from ultralytics import YOLO

# 1. アプリケーションの初期化
app = Flask(__name__)

# 2. iOS Safari対策: ルートパスでのfavicon返却設定
# これにより、/static/favicon.ico ではなく /favicon.ico へのアクセスにも対応します
@app.route('/favicon.ico')
def favicon():
    return send_from_directory(
        os.path.join(app.root_path, 'static'),
        'favicon.ico', 
        mimetype='image/vnd.microsoft.icon'
    )

# 3. AIモデルの読み込み
# 起動時に一度だけ読み込みます
model = YOLO('yolov8n.pt') 

# AIが認識しやすく、かつ一般家庭に必ずある15個のターゲット
ITEMS = [
    'cup', 'bottle', 'toothbrush', 'spoon', 'fork', 
    'chair', 'apple', 'banana', 'remote', 'book',
    'scissors', 'clock', 'umbrella', 'backpack', 'keyboard'
]

# 4. ルート定義
@app.route('/')
def index():
    # 起動時に15個の中からランダムでお題を1つ選ぶ
    initial_target = random.choice(ITEMS)
    return render_template('index.html', target=initial_target)

@app.route('/get_target')
def get_target():
    # お題をランダムに再抽選して返す
    new_target = random.choice(ITEMS)
    return jsonify({"target": new_target})

@app.route('/check_camera', methods=['POST'])
def check_camera():
    try:
        # Base64形式の画像データを受け取り、OpenCV形式に変換
        data = request.json['image']
        img_data = base64.b64decode(data.split(',')[1])
        nparr = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        # YOLOv8による物体検出
        results = model(img)
        detected_objects = []
        for result in results:
            for box in result.boxes:
                class_id = int(box.cls[0])
                class_name = model.names[class_id]
                detected_objects.append(class_name)

        return jsonify({"status": "success", "detected": detected_objects})
    except Exception as e:
        print("エラーが発生しました:", e)
        return jsonify({"status": "error", "detected": []})

# 5. 実行設定
if __name__ == '__main__':
    # Render等の環境では PORT 環境変数を優先し、なければ 8000 を使用
    port = int(os.environ.get("PORT", 8000))
    
    # ローカル開発環境でのiPhoneカメラテストには ssl_context='adhoc' が便利です
    # デプロイ済みの環境（Render等）ではSSLは自動付与されるため、基本的には不要です
    app.run(host='0.0.0.0', debug=True, port=port)