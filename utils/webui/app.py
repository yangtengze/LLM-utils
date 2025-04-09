from flask import Flask, render_template
from flask_cors import CORS
from .routes.api_routes import api, rag
from .routes.chat_routes import chat
from utils.load_config import configs
from utils.ocr_manager import initialize_ocr

app = Flask(__name__)
CORS(app)

# 初始化 OCR 引擎
initialize_ocr()

# 注册蓝图
app.register_blueprint(api, url_prefix='/api')
app.register_blueprint(chat, url_prefix='/chat')

@app.route('/')
def index():
    """主页"""
    return render_template('index.html')