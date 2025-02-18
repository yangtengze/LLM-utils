from utils.agent.base_agent import BaseAgent
from utils.agent.tools import Tool, get_local_ip, search_documents

# 配置
config = {
    'max_history_length': 100,
    'state_path': 'data/agent_state.json',
    'log_path': 'logs',
    'llm': {
        'endpoint': 'http://localhost:11434',
        'model': 'deepseek-r1:1.5b',
        'temperature': 0.7,
        'stream': False
    }
}

# 创建测试agent
agent = BaseAgent(config)

# 注册工具
agent.register_tool(Tool(
    name="get_local_ip",
    description="获取本机的IP地址信息",
    func=get_local_ip
))
# 注册带参数的工具
agent.register_tool(Tool(
    name="search_documents",
    description="搜索文档库中的相关内容",
    func=search_documents,
    parameters={
        "query": {
            "description": "搜索查询文本",
            "type": "string",
            "required": True
        },
        "top_k": {
            "description": "返回的最大结果数量",
            "type": "integer",
            "default": 3,
            "required": False
        }
    }
)) 

# 测试对话
queries = [
    "你好，你是谁？",
    "帮我查看一下本机的IP地址",
    "刚才的IP地址是什么？"
]
# 背景颜色
BG_BLACK = '\033[40m'
BG_RED = '\033[41m'
BG_GREEN = '\033[42m'
BG_YELLOW = '\033[43m'
BG_BLUE = '\033[44m'
BG_MAGENTA = '\033[45m'
BG_CYAN = '\033[46m'
BG_WHITE = '\033[47m'

# 重置颜色
RESET = '\033[0m'

for query in queries:
    print(BG_GREEN + f"\n用户: {query}" + RESET)
    response = agent.run(query)
    print(BG_BLUE + f"助手: {response}" + RESET)

# # 测试历史记录
# print("\n最近的对话历史:")
# history = agent.get_history(last_n=3)
# for h in history:
#     print(f"类型: {h['type']}")
#     print(f"内容: {h['content']}")
#     print(f"响应: {h.get('response', '无响应')}\n")

# # 测试工具使用
# print("\n测试工具使用:")
# result = agent.use_tool("get_local_ip")
# print(f"IP信息: {result}")

# # 测试记忆功能
# agent.set_memory("test_key", "test_value")
# value = agent.get_memory("test_key")
# print(f"\n记忆测试: {value}")
