from utils.load_config import configs
from .parse_response import parse_response
import requests
import json

def call_language_model(prompt: str, system_prompt: str = None) -> str:
        """
        调用语言模型生成响应
        :param prompt: 提示文本
        :param system_prompt: 系统提示（可选）
        :return: 生成的响应
        """
        ragllm_model = configs['ollama']['default_model']
        stream = configs['ollama']['stream']
        # 使用chat接口
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        data = {
            "model": ragllm_model,
            "messages": messages,
            "stream": stream,
            "options": {
                "temperature": configs['ollama']['temperature']
            },
        }
        
        url = configs['ollama']['endpoint'] + '/api/chat'
        
        try:
            response = requests.post(url, data=json.dumps(data))
            if response.status_code == 200:
                if stream:
                    return parse_response(response, stream)
                else:
                    resp_json = response.json()
                    return resp_json.get('message', {}).get('content', '')
            else:
                error_msg = f"LLM调用失败: HTTP {response.status_code}"
                print(error_msg)
                return error_msg
        except Exception as e:
            error_msg = f"LLM调用出错: {str(e)}"
            print(error_msg)
            return error_msg
