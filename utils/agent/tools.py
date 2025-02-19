from typing import Callable, Dict, Any, List
from dataclasses import dataclass
import socket
from ..rag.rag import Rag
import yaml
from pathlib import Path


@dataclass
class Tool:
    name: str
    description: str
    func: Callable
    parameters: Dict[str, Dict[str, Any]] = None  # 添加参数描述
    
    def get_parameters_description(self) -> str:
        """获取参数描述"""
        if not self.parameters:
            return "无需参数"
        
        params_desc = []
        for param_name, param_info in self.parameters.items():
            desc = f"- {param_name}: {param_info.get('description', '')}"
            if param_info.get('required', False):
                desc += " (必填)"
            if 'default' in param_info:
                desc += f" (默认值: {param_info['default']})"
            params_desc.append(desc)
        
        return "\n".join(params_desc)

class ToolRegistry:
    """工具注册表，管理所有可用的工具"""
    
    def __init__(self):
        self.tools: Dict[str, Tool] = {}
    
    def register(self, tool: Tool):
        """注册新工具"""
        self.tools[tool.name] = tool
    
    def get_tool(self, name: str) -> Tool:
        """获取工具"""
        return self.tools.get(name)
    
    def list_tools(self) -> List[Dict[str, str]]:
        """列出所有可用工具"""
        return [
            {"name": name, "description": tool.description}
            for name, tool in self.tools.items()
        ]

    def validate_parameters(self, tool: Tool, params: Dict[str, Any]) -> Dict[str, Any]:
        """验证并处理工具参数"""
        if not tool.parameters:
            return {}
            
        validated_params = {}
        for param_name, param_info in tool.parameters.items():
            # 检查必填参数
            if param_info.get('required', False) and param_name not in params:
                raise ValueError(f"缺少必填参数: {param_name}")
            
            # 使用默认值
            if param_name not in params and 'default' in param_info:
                validated_params[param_name] = param_info['default']
            else:
                validated_params[param_name] = params.get(param_name)
                
        return validated_params

def load_config(config_name: str):
    config_path = Path("configs") / f"{config_name}.yaml"
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


# 创建一些示例工具
def search_documents(query: str, top_k: int = 3) -> List[Dict]:
    """搜索文档的工具"""
    rag = Rag()
    return rag.retrieve_documents(query, top_k=top_k)

def get_local_ip() -> Dict[str, str]:
    """获取本机IP地址的工具"""
    try:
        # 获取主机名
        hostname = socket.gethostname()
        # 获取本地IP地址
        local_ip = socket.gethostbyname(hostname)
        # 尝试获取公网IP（通过连接外部服务器）
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        public_ip = s.getsockname()[0]
        s.close()
        
        return {
            "hostname": hostname,
            "local_ip": local_ip,
            "public_ip": public_ip
        }
    except Exception as e:
        return {
            "error": f"获取IP地址失败: {str(e)}"
        }

# # 注册工具示例
# registry = ToolRegistry()
# registry.register(Tool(
#     name="search_documents",
#     description="搜索文档库中的相关内容",
#     func=search_documents
# ))

# # 注册IP地址工具
# registry.register(Tool(
#     name="get_local_ip",
#     description="获取本机的IP地址信息，包括主机名、本地IP和公网IP",
#     func=get_local_ip
# ))

