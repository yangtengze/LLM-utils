from flask import Flask, render_template, redirect, url_for
from flask_cors import CORS
from .routes.api_routes import api
from .routes.chat_routes import chat
from utils.load_config import configs
app = Flask(__name__)
CORS(app)

# 注册蓝图
app.register_blueprint(api, url_prefix='/api')
app.register_blueprint(chat, url_prefix='/chat')

@app.route('/')
def index():
    """主页"""
    return render_template('index.html')

if __name__ == '__main__':
    app.run(host=configs['webui']['server']['host'], port=configs['webui']['server']['port'], debug=configs['webui']['server']['debug'])