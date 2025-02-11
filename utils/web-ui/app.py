from flask import Flask, render_template
from routes.chat_routes import chat_bp
from routes.api_routes import api_bp

app = Flask(__name__)

# 注册蓝图
app.register_blueprint(chat_bp)
app.register_blueprint(api_bp)

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=True)