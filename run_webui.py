import os
import sys

# 添加项目根目录到 Python 路径
project_root = os.path.dirname(os.path.abspath(__file__))
sys.path.append(project_root)
from utils.webui.app import app
from utils.load_config import configs

if __name__ == '__main__':
    # 启动应用
    app.run(host=configs['webui']['server']['host'], port=configs['webui']['server']['port'], debug=configs['webui']['server']['debug'])
