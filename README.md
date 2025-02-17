# LLM-Utils

一个模块化的 LLM 工具集合，提供了文档处理、RAG、Agent 等功能。

还尚未完成！！！(not success yet)

## 项目结构

This is an utils based on LLMs such as RAG、Agent tools、WebUI etc. 

```dir 
LLM-utils/
├── bin/                    # 启动和停止脚本
│   ├── start-llm-utils.bat
│   ├── start-llm-utils.sh
│   ├── stop-llm-utils.bat
│   └── stop-llm-utils.sh
├── configs/                # 配置文件目录
│   ├── ollama.yaml        # Ollama LLM 配置
│   ├── ragconfig.yaml     # RAG 系统配置
│   └── webuisettings.yaml # Web UI 配置
├── utils/                  # 核心功能模块
│   ├── agent/             # Agent 系统
│   │   ├── base_agent.py  # Agent 基类
│   │   ├── rag_agent.py   # RAG Agent 实现
│   │   ├── test_agent.py  # 测试用 Agent
│   │   ├── tools.py       # 工具管理
│   │   └── __init__.py
│   ├── document_loader/   # 文档加载器
│   │   ├── csvLoader.py   # CSV 文件加载器
│   │   ├── docxLoader.py  # Word 文档加载器
│   │   ├── mdLoader.py    # Markdown 加载器
│   │   ├── pdfLoader.py   # PDF 加载器
│   │   ├── txtLoader.py   # 文本文件加载器
│   │   └── __init__.py
│   ├── rag/               # RAG 实现
│   │   ├── rag.py        # RAG 核心功能
│   │   └── __init__.py
│   └── web-ui/            # Web 界面
│       ├── app.py         # Web 应用入口
│       ├── routes/        # 路由定义
│       ├── static/        # 静态资源
│       └── templates/     # 页面模板
├── data/                  # 数据目录
│   ├── documents/         # 文档存储
│   └── vec_db_store/     # 向量数据库存储
├── server/                # 服务器相关
├── tests/                 # 测试目录
├── logs/                  # 日志目录
├── Dockerfile            # Docker 配置
└── requirements.txt      # 项目依赖
```

## 联系方式

如果您对这个项目感兴趣，欢迎联系：
- Email: yangtengze@163.com
