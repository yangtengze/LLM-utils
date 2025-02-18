import os
import sys

# 添加项目根目录到 Python 路径
project_root = os.path.dirname(os.path.abspath(__file__))
sys.path.append(project_root)

from utils.webui.app import app

if __name__ == '__main__':
    # 启动应用
    app.run(host='0.0.0.0', port=5000, debug=True) 