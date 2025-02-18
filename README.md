# LLM-Utils

一个模块化的 LLM 工具集合，提供了文档处理、RAG、Agent 等功能。

还尚未完成！！！(not success yet)

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
│   └── loaders/
│       ├── csv.py
│       ├── pdf.py
│       └── txt.py
├── utils/
│   ├── agent/
│   │   ├── base_agent.py
│   │   ├── rag_agent.py
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

1. 安装依赖
```bash
pip install -r requirements.txt
```

2. 配置
编辑 configs 目录下的相关配置文件：
- ollama.yaml: LLM 服务配置
- ragconfig.yaml: RAG 系统配置
- webuisettings.yaml: Web UI 配置

3. 启动服务
Windows:
```bash
bin/start-llm-utils.bat
```

Linux/Mac:
```bash
./bin/start-llm-utils.sh
```

4. 使用示例
```python
from utils.agent import TestAgent
from utils.agent.tools import Tool, get_local_ip

# 配置
config = {
    'max_history_length': 100,
    'state_path': 'data/agent_state.json',
    'log_path': 'logs',
    'llm': {
        'endpoint': 'http://localhost:11434',
        'model': 'llama2',
        'temperature': 0.7,
        'stream': False
    }
}

# 创建 Agent
agent = TestAgent(config)

# 注册工具
agent.register_tool(Tool(
    name="get_local_ip",
    description="获取本机的IP地址信息",
    func=get_local_ip
))

# 运行对话
response = agent.run("你好，请帮我查看本机IP地址")
print(response)
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
