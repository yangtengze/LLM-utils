#!/bin/bash

# 检查名为"llm-utils"的conda环境是否存在
if conda env list | grep -q "llm-utils"; then
    echo "conda环境 'llm-utils' 已存在，激活环境..."
    conda activate llm-utils
else
    echo "创建conda环境 'llm-utils'..."
    conda create -n llm-utils python=3.10
    if [ $? -eq 0 ]; then
        echo "激活conda环境 'llm-utils'..."
        conda activate llm-utils
        echo "使用pip安装依赖..."
        pip install -r ../requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
    else
        echo "创建conda环境失败，请检查conda命令是否可用以及网络连接。"
        exit 1
    fi
fi

# 运行你的Python脚本
python ../run_webui.py
