from flask import Flask, render_template, send_from_directory
from flask_cors import CORS
from .routes.api_routes import api, rag
from .routes.chat_routes import chat
from utils.load_config import configs
from utils.ocr_manager import initialize_ocr
import os

app = Flask(__name__)
CORS(app)

# 初始化 OCR 引擎
initialize_ocr()

# 注册蓝图
app.register_blueprint(api, url_prefix='/api')
app.register_blueprint(chat, url_prefix='/chat')

# 添加静态路由以提供data/documents目录中的文件
@app.route('/data/documents/<path:filename>')
def serve_document(filename):
    """直接提供文档文件"""
    documents_dir = os.path.join(os.getcwd(), 'data', 'documents')
    return send_from_directory(documents_dir, filename)

@app.route('/')
def index():
    """主页"""
    return render_template('index.html')