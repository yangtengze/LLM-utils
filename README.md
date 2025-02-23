# LLM-Utils

一个模块化的 LLM 工具集合，提供了文档处理、RAG、Agent 等功能。


| 日期和时间       | 版本   | 更新内容                  |
|----------------|-------|-------------------------|
| 2025/2/20  0:08 | 0.1   | LLM-utils 上线|
| 2025/2/22  23:48 | 0.1.1   | WebUI 优化|


**附上ollama快速下载 LLM-utils/download_model.ps1**
*使用方法*
```bash
./download_model.ps1 -model "deepseek-r1:1.5b"
```
## 项目结构

This is an utils based on LLMs such as RAG、Agent tools、WebUI etc. 

```dir 
LLM-UTILS/
├── bin/
│   ├── start-llm-utils.bat
│   ├── start-llm-utils.sh
│   ├── stop-llm-utils.bat
│   └── stop-llm-utils.sh
├── configs/
│   └── configs.yaml
├── data/
│   ├── agent_state.json
│   ├── documents/
│   │   ├── data.csv
│   │   └── test.txt
│   ├── tmp/
│   │   ├── README.md
│   │   ├── llama2/
│   │   │   ├──llama2.pdf
│   │   ├── 1.docx
│   │   └── tmp_store
│   └── vec_db_store/
│       ├── doc_vectors.npy
│       └── metadata.json
├── logs/
│   └── log-20250218.log
├── server/
├── tests/
│   ├── import_yaml.py
│   ├── test_agent.py
│   ├── test_raw.py
│   └── loaders/
│       ├── csv.py
│       ├── pdf.py
│       └── txt.py
├── utils/
│   ├── load_config.py
│   ├── base_func/
│   │   ├── parse_response.py
│   ├── agent/
│   │   ├── base_agent.py
│   │   └── tools.py
│   ├── document_loader/
│   │   ├── csvLoader.py
│   │   ├── docxLoader.py
│   │   ├── mdLoader.py
│   │   ├── pdfLoader.py
│   │   └── txtLoader.py
│   ├── rag/
│   │   └── rag.py
│   └── webui/
│       ├── app.py
│       └── routes/
│           ├── api_routes.py
│           ├── chat_routes.py
│           └── templates/
│               ├── agent_chat.html
│               ├── base.html
│               ├── index.html
│               ├── multimodal_chat.html
│               ├── rag_chat.html
│               └── raw_chat.html
├── Dockerfile
├── README.md
└── requirements.txt
```

## 功能特性

### 1. RAG 系统
- 支持多种文档格式（PDF、TXT、CSV、DOCX、MD）
- 文档向量化和存储
- 相似度检索（支持 cosine 和 l2）
- 增量更新支持
- 向量数据持久化

### 2. Agent 系统
- 基础 Agent 框架
  - 工具管理和调用
  - 对话历史记录
  - 状态管理
  - LLM 集成
  - Prompt 管理
- RAG Agent 实现
  - 文档智能检索
  - 上下文感知

### 3. Web 界面
- 多种聊天模式
  - 基础对话
  - RAG 增强对话
  - Agent 对话
  - 多模态对话
- 文档管理
- 系统配置

## 快速开始
1. **配置**
编辑 configs/configs.yaml 的相关配置文件：
- ollama: LLM 服务配置
- rag.yaml: RAG 系统配置
- webui.yaml: Web UI 配置

2. **方法一 安装依赖**

> 确保conda环境有torch(cpu/gpu)

```bash
pip install -r requirements.txt
```

```bash
python run_webui.py
```

3. **方法二 脚本直接启动（从头下载依赖gpu版）**
Windows:
```bash
bin/start-llm-utils.bat
```

Linux/Mac:
```bash
./bin/start-llm-utils.sh
```

启动过一次后面就是

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
# 创建 Rag
rag = Rag()
rag.load_documents(rag.files)
query = "你是谁啊？你叫什么？"
try:
    response = rag.generate_response(query)
    print(response)
except Exception as e:
    error_msg = f"LLM调用出错: {str(e)}"
    print(error_msg)
```
### 4.3 agent对话
```python
from utils.agent import BaseAgent
from utils.agent.tools import *
# 创建 Agent
agent = BaseAgent()
# 注册工具
agent.register_tool(Tool(
    name="get_local_ip",
    description="获取本机的IP地址信息",
    func=get_local_ip
))
query = "你好，请帮我查看本机IP地址"
# 运行对话
try:
    response = agent.run(query)
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

### 扩展 Agent 功能
1. 继承 `BaseAgent` 类
2. 自定义 prompt 模板
3. 实现特定功能

### 添加新工具
1. 在 `utils/agent/tools.py` 中定义工具函数
2. 使用 `Tool` 类封装
3. 通过 `register_tool` 注册

## 注意事项

- 确保 Ollama 服务已启动
- 检查配置文件正确性
- 注意文档和向量数据的存储路径
- 大规模文档处理时注意内存使用

## 联系方式

如果您对这个项目感兴趣，欢迎联系：
- Email: yangtengze@163.com
