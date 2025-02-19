#!/bin/bash

# 检查conda是否可用
if ! command -v conda &> /dev/null; then
    echo "conda 未找到，请确保conda已安装并配置正确。"
    exit 1
fi

# 检查名为 'llm-utils' 的conda环境是否存在
if conda env list | grep -q "llm-utils"; then
    echo "conda环境 'llm-utils' 已存在，激活环境..."
    source activate llm-utils || conda activate llm-utils
else
    echo "创建conda环境 'llm-utils'..."
    conda create -n llm-utils python=3.10 -y
    if [ $? -eq 0 ]; then
        echo "激活conda环境 'llm-utils'..."
        source activate llm-utils || conda activate llm-utils
        echo "安装PyTorch及相关依赖..."
        conda install pytorch torchvision torchaudio pytorch-cuda=11.8 -c pytorch -c nvidia -y
        if [ $? -ne 0 ]; then
            echo "安装PyTorch失败，请检查网络连接或conda配置。"
            exit 1
        fi
        echo "使用pip安装其他依赖..."
        pip install -r ./requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
        if [ $? -ne 0 ]; then
            echo "pip安装依赖失败，请检查网络连接或requirements.txt文件。"
            exit 1
        fi
    else
        echo "创建conda环境失败，请检查conda命令是否可用以及网络连接。"
        exit 1
    fi
fi

# 运行Python脚本
echo "运行Python脚本..."
python ./run_webui.py
if [ $? -ne 0 ]; then
    echo "运行Python脚本失败，请检查脚本路径或代码。"
    exit 1
fi