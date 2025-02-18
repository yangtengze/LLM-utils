@echo off
REM 检查名为"llm-utils"的conda环境是否存在
conda env list | find "llm-utils" > nul

REM 如果上一步的命令返回错误，则创建环境
if errorlevel 1 (
    echo 创建conda环境 "llm-utils"...
    conda create -n llm-utils python=3.10
    REM 如果创建成功，则激活环境并安装依赖
    if errorlevel 0 (
        echo 激活conda环境 "llm-utils"...
        conda activate llm-utils
        echo 使用pip安装依赖...
        pip install -r ../requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
        REM 运行你的Python脚本
        python ../run_webui.py
    ) else (
        echo 创建conda环境失败，请检查conda命令是否可用以及网络连接。
        pause
        exit /b 1
    )
) else (
    echo conda环境 "llm-utils" 已存在，激活环境...
    conda activate llm-utils
    REM 运行你的Python脚本
    python ../run_webui.py
)
