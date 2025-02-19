@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM 检查名为"llm-utils"的conda环境是否存在
call conda deactivate
call conda env list | find "llm-utils" > nul

REM 如果上一步的命令返回错误，则创建环境
if errorlevel 1 (
    echo 创建conda环境 "llm-utils"...
    call conda create -n llm-utils python=3.10 -y
    REM 如果创建成功，则激活环境并安装依赖
    if errorlevel 0 (
        echo 激活conda环境 "llm-utils"...
        call conda activate llm-utils
        echo 安装 PyTorch CUDA 版本...
        call conda install pytorch torchvision torchaudio pytorch-cuda=11.8 -c pytorch -c nvidia -y
        echo 安装其他依赖...
        pip install -r ./requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
    ) else (
        echo 创建conda环境失败，请检查conda命令是否可用以及网络连接。
        pause
        exit /b 1
    )
) else (
    echo conda环境 "llm-utils" 已存在，激活环境...
    call conda activate llm-utils
)

REM 检测 PyTorch 是否能够使用 CUDA
echo 检测 PyTorch 是否能够使用 CUDA...
python -c "import torch; print('CUDA available:', torch.cuda.is_available())"

REM 根据检测结果决定是否继续
set CUDA_AVAILABLE=0
for /f "tokens=*" %%i in ('python -c "import torch; print(int(torch.cuda.is_available()))"') do set CUDA_AVAILABLE=%%i

if %CUDA_AVAILABLE%==1 (
    echo CUDA 可用，运行 Python 脚本...
    python ./run_webui.py
) else (
    echo CUDA 不可用，无法运行依赖 CUDA 的脚本。
    pause
    exit /b 1
)

pause
pip3 install torch torchvision torchaudio -f https://mirrors.aliyun.com/pytorch-wheels/cu118