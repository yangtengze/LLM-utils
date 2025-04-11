# [【A15】基于RAG和大模型的算术与数学问题解答【万维艾斯】](http://www.fwwb.org.cn/topic/show/27bf442b-f30a-436a-8895-964c8802f1ca)

## 项目成员
|  队伍名称 |
|--------|
|混分大队 |

| 姓名  |  性别    |  队伍角色 |
|--------|--------|-------------|
| *宋锋* | 男  | *指导老师* |
| 杨腾泽 | 男  | *队长* |
| 董函铄 | 女  | 队员 |
| 刘彩月 | 女  | 队员 |

## 项目更新日志


| 日期和时间       | 版本   | 更新内容                  |
|----------------|-------|-------------------------|
| 2025/2/20  0:08 | 0.1   | LLM-utils 上线|
| 2025/2/22  23:48 | 0.1.1   | WebUI 优化|
| 2025/2/27  18:41 | 0.1.2  | code 优化|
| 2025/3/24  22:30 | 0.1.3  | rag file preview 功能|
| 2025/3/27  22:30 | 0.1.4  | 历史对话信息功能|
| 2025/4/10  22:28 | 0.1.5  | 代码可读性优化|
| 2025/4/11  11:51 | 0.1.6  | 知识库内容修改功能 |
| 2025/4/11  14:15 | 0.1.7  | 支持上传图片进行对话，并修复了一些bug |


**附上ollama快速下载 LLM-utils/download_model.ps1**
*使用方法*
```bash
./download_model.ps1 -model "deepseek-r1:1.5b"
```
## 项目结构

```dir 
LLM-UTILS/
├── Dockerfile
├── dockerfile.backup
├── download_model.ps1
├── README.md
├── requirements.txt
├── run_webui.py
├── .vscode/
├── bin/
│   ├── start-llm-utils.bat
│   ├── start-llm-utils.sh
│   ├── stop-llm-utils.bat
│   └── stop-llm-utils.sh
├── configs/
│   └── configs.yaml
├── data/
│   ├── documents/
│   │   ├── 1.docx
│   │   ├── 222.pdf
│   │   ├── conda.txt
│   │   ├── data.csv
│   │   ├── data.txt
│   │   ├── README.md
│   │   ├── test.txt
│   │   ├── tmp_store
│   │   ├── competition_data/
│   │   │   └── data.html
│   │   └── llama2/
│   │       └── llama2.pdf
│   └── vec_db_store/
├── tests/
│   ├── import_yaml.py
│   ├── test_agent.py
│   ├── test_rag.py
│   ├── test_raw.py
│   ├── loaders/
│   │   ├── csv.py
│   │   ├── index.html
│   │   ├── pdf.py
│   │   └── txt.py
│   └── test_files/
│       ├── test.py
│       └── ppstructure/
│           ├── 1.png
│           └── layout.jpg
└── utils/
    ├── load_config.py
    ├── ocr_manager.py
    ├── __init__.py
    ├── base_func/
    │   ├── call_model.py
    │   └── parse_response.py
    ├── documents_preview/
    │   ├── preview_csv.py
    │   ├── preview_docx.py
    │   ├── preview_html.py
    │   ├── preview_markdown.py
    │   └── preview_pdf.py
    ├── document_loader/
    │   ├── csvLoader.py
    │   ├── docxLoader.py
    │   ├── htmlLoader.py
    │   ├── mdLoader.py
    │   ├── pdfLoader.py
    │   └── txtLoader.py
    ├── rag/
    │   └── rag.py
    └── webui/
        ├── app.py
        ├── routes/
        │   ├── api_routes.py
        │   └── chat_routes.py
        ├── static/
        │   ├── css/
        │   │   └── style.css
        │   ├── images/
        │   │   ├── 1.jpg
        │   │   ├── 2.jpg
        │   │   ├── 3.jpg
        │   │   └── 4.jpg
        │   └── js/
        │       ├── chat-func.js
        │       ├── rag-chat.js
        │       └── raw-chat.js
        └── templates/
            ├── base.html
            ├── index.html
            ├── rag_chat.html
            └── raw_chat.html
```

## 功能特性

### 1. RAG 系统
- 支持多种文档格式（PDF、TXT、CSV、DOCX、MD）
- 文档向量化和存储
- 相似度检索（支持 cosine 和 l2）
- 增量更新支持
- 向量数据持久化

### 2. Web 界面
- 多种聊天模式
  - 基础对话
  - RAG 增强对话
  - Agent 对话
  - 多模态对话（持续更新中）
- 文档上传

## 快速开始
1. **配置**


**编辑 `configs/configs.yaml` 的相关配置文件：**
    
    - `ollama`: LLM 服务配置
    - `rag`: RAG 系统配置
    - `webui`: Web UI 配置
```yaml
  embedding_model:                    # 嵌入模型配置
    path: "/local/path/to/bge-large-zh-v1.5"         # HuggingFace 模型名称
    # path: "quentinz/bge-large-zh-v1.5"         # HuggingFace 模型名称
    device: ["cuda"]                  # 运行设备（cpu/cuda）
    normalize_embeddings: True        # 是否归一化嵌入向量 True/False
```
**这里要先`path`替换为本地embedding模型路径**

2. **方法一 安装依赖**

**确保conda环境有torch(cpu/gpu)**

```bash
pip install -r requirements.txt
```

```bash
python run_webui.py
```

3. **方法二 脚本直接启动（从头下载依赖gpu版）**

`Windows:`
```bash
bin/start-llm-utils.bat
```

`Linux/Mac:`
```bash
./bin/start-llm-utils.sh
```

**若启动过前面的脚本并无报错、后续启动就是**
```bash
python ./run_webui.py
```

## 4. 使用示例
### 4.1 raw对话
```python
from utils.load_config import configs
from utils.base_func import parse_response
import requests
import json
prompt = '你好啊，你是谁？'
llm_model = configs['ollama']['default_model']
data = {
    "model": llm_model,
    "prompt": prompt,
    "stream": configs['ollama']['stream'],
    "options": {
        "temperature": configs['ollama']['temperature']
    },
}
url = configs['ollama']['endpoint'] + '/api/generate'
try:
    response = requests.post(url, data=json.dumps(data))
    if response.status_code == 200:
        result = parse_response(response, data['stream'])
        print(result)
    else:
        error_msg = f"LLM调用失败: HTTP {response.status_code}"
        print(error_msg)
except Exception as e:
    error_msg = f"LLM调用出错: {str(e)}"
    print(error_msg)
```
### 4.2 rag 对话
```python
from utils.rag.rag import Rag
from utils.base_func import call_language_model
# 创建 Rag
rag = Rag()
rag.load_documents(rag.files)
query = "你是谁啊？你叫什么？"
try:
    system_prompt = rag.generate_prompt(query)
    response = call_language_model(query, system_prompt)
    print(response)
except Exception as e:
    error_msg = f"LLM调用出错: {str(e)}"
    print(error_msg)
```

## 开发说明

### 添加新的文档加载器
1. 在 `utils/document_loader/` 下创建新的加载器类
2. 实现必要的接口方法
3. 在 `__init__.py` 中注册

## 注意事项

- 确保 Ollama 服务已启动
- 检查配置文件正确性
- 注意文档和向量数据的存储路径
- 大规模文档处理时注意内存使用

## 联系方式

如果您对这个项目感兴趣，欢迎联系：
- Email: yangtengze@163.com
