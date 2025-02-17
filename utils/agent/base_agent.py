from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Union
from .tools import Tool, ToolRegistry
import logging
from pathlib import Path
import time
import requests
import json

class BaseAgent(ABC):
    """
    基础Agent类，提供了Agent的核心功能框架
    - 工具管理
    - 状态管理
    - 记忆管理
    - 执行历史
    - 日志系统
    - LLM调用
    - Prompt管理
    """
    
    DEFAULT_PROMPT_TEMPLATE = """你是一个智能助手，配备了以下工具：
    {tools_description}

    历史对话记录：
    {chat_history}

    当前用户问题：{query}

    请按照以下步骤思考并回答：
    1. 理解用户问题
    2. 确定是否需要使用工具
    3. 如果需要使用工具，选择合适的工具并执行
    4. 根据工具执行结果或已有知识生成回答

    请用markdown格式回复。
    """

    def __init__(self, config: Dict[str, Any]):
        """
        初始化Agent
        :param config: 配置字典，包含：
            - max_history_length: 历史记录最大长度
            - state_path: 状态保存路径
            - log_path: 日志保存路径
            - prompt_template: 自定义prompt模板
            - llm: LLM配置
                - endpoint: API端点
                - model: 模型名称
                - temperature: 温度参数
                - stream: 是否流式响应
        """
        self.config = config
        self.tool_registry = ToolRegistry()
        self.history: List[Dict[str, Any]] = []  # 执行历史
        self.memory: Dict[str, Any] = {}  # 代理记忆/状态存储
        self.max_history_length = config.get('max_history_length', 100)
        self.llm_config = config.get('llm', {
            'endpoint': 'http://localhost:11434',
            'model': 'llama2',
            'temperature': 0.7,
            'stream': False
        })
        
        # 设置日志
        self._setup_logging()
        
        # 加载已保存的状态
        self._load_initial_state()
        
        # 初始化prompt模板
        self.prompt_template = config.get('prompt_template', self.DEFAULT_PROMPT_TEMPLATE)
    
    def _setup_logging(self) -> None:
        """配置日志系统"""
        log_path = Path(self.config.get('log_path', 'logs'))
        log_path.mkdir(parents=True, exist_ok=True)
        
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(log_path / f'agent_{time.strftime("%Y%m%d")}.log'),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(self.__class__.__name__)
    
    def _load_initial_state(self) -> None:
        """加载初始状态"""
        state_path = self.config.get('state_path')
        if state_path:
            self.load_state(state_path)
    
    def register_tool(self, tool: Union[Tool, List[Tool]]) -> None:
        """
        注册新工具到代理
        :param tool: 单个工具或工具列表
        """
        if isinstance(tool, list):
            for t in tool:
                self.tool_registry.register(t)
                self.logger.info(f"Registered tool: {t.name}")
        else:
            self.tool_registry.register(tool)
            self.logger.info(f"Registered tool: {tool.name}")
    
    def use_tool(self, tool_name: str, **kwargs) -> Any:
        """
        使用指定的工具
        :param tool_name: 工具名称
        :param kwargs: 工具参数
        :return: 工具执行结果
        """
        tool = self.tool_registry.get_tool(tool_name)
        if not tool:
            self.logger.error(f"Tool not found: {tool_name}")
            raise ValueError(f"Tool not found: {tool_name}")
        
        try:
            self.logger.info(f"Using tool: {tool_name} with params: {kwargs}")
            result = tool.func(**kwargs)
            
            # 记录工具使用历史
            self.add_to_history({
                'timestamp': time.time(),
                'type': 'tool_use',
                'tool': tool_name,
                'parameters': kwargs,
                'result': result,
                'status': 'success'
            })
            
            return result
        except Exception as e:
            self.logger.error(f"Tool execution failed: {str(e)}")
            # 记录失败历史
            self.add_to_history({
                'timestamp': time.time(),
                'type': 'tool_use',
                'tool': tool_name,
                'parameters': kwargs,
                'error': str(e),
                'status': 'failed'
            })
            raise
    
    def add_to_history(self, entry: Dict[str, Any]) -> None:
        """
        添加执行记录到历史
        :param entry: 历史记录条目
        """
        if 'timestamp' not in entry:
            entry['timestamp'] = time.time()
            
        # 如果是查询类型，确保包含响应
        if entry.get('type') == 'query' and 'response' not in entry:
            entry['response'] = None
            
        self.history.append(entry)
        if len(self.history) > self.max_history_length:
            self.history = self.history[-self.max_history_length:]
        
        self._auto_save_state()
    
    def _auto_save_state(self) -> None:
        """自动保存状态"""
        state_path = self.config.get('state_path')
        if state_path:
            self.save_state(state_path)
    
    def get_history(self, 
                   last_n: Optional[int] = None, 
                   filter_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        获取执行历史
        :param last_n: 获取最后n条记录，None表示获取全部
        :param filter_type: 按类型筛选历史记录
        :return: 历史记录列表
        """
        history = self.history
        if filter_type:
            history = [h for h in history if h.get('type') == filter_type]
        if last_n is not None:
            history = history[-last_n:]
        return history
    
    def clear_history(self, before_timestamp: Optional[float] = None) -> None:
        """
        清除历史记录
        :param before_timestamp: 清除此时间戳之前的记录，None表示清除所有
        """
        if before_timestamp is None:
            self.history = []
        else:
            self.history = [h for h in self.history 
                          if h.get('timestamp', 0) >= before_timestamp]
        self.logger.info(f"Cleared history before {before_timestamp}")
    
    def generate_prompt(self, query: str, include_history: bool = True) -> str:
        """
        生成完整的prompt
        :param query: 用户查询
        :param include_history: 是否包含历史记录
        :return: 格式化后的prompt
        """
        # 获取可用工具描述
        tools = self.get_available_tools()
        tools_description = "\n".join([
            f"- {tool['name']}: {tool['description']}"
            for tool in tools
        ])
        
        # 获取历史对话记录
        chat_history = ""
        if include_history:
            history = self.get_history(last_n=5, filter_type='query')  # 最近5条查询历史
            if history:
                chat_history = "\n".join([
                    f"用户: {h['content']}\n"
                    f"助手: {h.get('response', '(无响应)')}\n"
                    for h in history
                ])
        
        # 格式化prompt
        prompt = self.prompt_template.format(
            tools_description=tools_description,
            chat_history=chat_history,
            query=query
        )
        
        return prompt
    
    def update_last_response(self, response: str) -> None:
        """
        更新最后一条查询的响应
        :param response: 响应内容
        """
        for entry in reversed(self.history):
            if entry.get('type') == 'query':
                entry['response'] = response
                break
    
    def _call_llm(self, prompt: str) -> str:
        """
        调用LLM模型
        :param prompt: 提示文本
        :return: 模型响应
        """
        data = {
            "model": self.llm_config.get('model', 'llama2'),
            "prompt": prompt,
            "stream": self.llm_config.get('stream', False),
            "options": {
                "temperature": self.llm_config.get('temperature', 0.7)
            }
        }
        
        url = f"{self.llm_config.get('endpoint', 'http://localhost:11434')}/api/generate"
        
        try:
            self.logger.debug(f"Calling LLM with prompt: {prompt}")
            response = requests.post(url, json=data)
            
            if response.status_code == 200:
                result = response.json().get('response', '')
                self.logger.debug(f"LLM response: {result}")
                return result
            else:
                error_msg = f"LLM调用失败: HTTP {response.status_code} - {response.text}"
                self.logger.error(error_msg)
                raise Exception(error_msg)
                
        except Exception as e:
            self.logger.error(f"LLM调用出错: {str(e)}")
            raise

    def run(self, query: str) -> Any:
        """
        运行agent处理查询
        :param query: 用户查询
        :return: 处理结果
        """
        # 记录查询
        self.add_to_history({
            'type': 'query',
            'content': query,
            'timestamp': time.time()
        })
        
        try:
            # 生成prompt
            prompt = self.generate_prompt(query)
            self.logger.debug(f"Generated prompt: {prompt}")
            
            # 调用LLM获取响应
            response = self._call_llm(prompt)
            
            # 更新历史记录
            self.update_last_response(response)
            
            return response
            
        except Exception as e:
            error_msg = f"查询处理失败: {str(e)}"
            self.logger.error(error_msg)
            self.update_last_response(error_msg)
            raise
    
    def reset(self) -> None:
        """
        重置agent状态
        - 清空历史记录
        - 清空记忆
        - 保留工具注册
        """
        self.history = []
        self.memory = {}
        self.logger.info("Agent state reset")
    
    def get_available_tools(self) -> List[Dict[str, str]]:
        """获取所有可用工具列表"""
        return self.tool_registry.list_tools()
    
    def set_memory(self, key: str, value: Any) -> None:
        """
        存储信息到代理记忆中
        :param key: 键
        :param value: 值
        """
        self.memory[key] = value
    
    def get_memory(self, key: str, default: Any = None) -> Any:
        """
        从代理记忆中获取信息
        :param key: 键
        :param default: 默认值
        :return: 存储的值
        """
        return self.memory.get(key, default)
    
    def save_state(self, path: str) -> None:
        """
        保存代理状态到文件
        :param path: 保存路径
        """
        import json
        state = {
            'history': self.history,
            'memory': self.memory
        }
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
    
    def load_state(self, path: str) -> None:
        """
        从文件加载代理状态
        :param path: 状态文件路径
        """
        import json
        try:
            with open(path, 'r', encoding='utf-8') as f:
                state = json.load(f)
                self.history = state.get('history', [])
                self.memory = state.get('memory', {})
        except FileNotFoundError:
            print(f"State file not found: {path}") 