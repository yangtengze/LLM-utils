import json
import re
def parse_response(response, stream: bool) -> str:
    """
    解析 LLM 的响应
    :param response: LLM返回的原始响应
    :param stream: 是否是流式响应
    :return: 解析后的文本内容
    """
    try:
        # 如果是非流式响应
        if not stream:
            json_data = json.loads(response.content.decode('utf-8'))
            # 检查是否是chat接口的响应格式
            if 'message' in json_data and 'content' in json_data['message']:
                return json_data['message']['content']
            return json_data.get('response', '')
        
        # 如果是流式响应
        content = ''
        string_data = response.content.decode('utf-8')
        json_strings = string_data.split('\n')
        
        for json_str in json_strings:
            if not json_str.strip():
                continue
            try:
                chunk = json.loads(json_str)
                # 检查是否是chat接口的响应格式
                if 'message' in chunk and 'content' in chunk['message']:
                    content += chunk['message']['content']
                else:
                    content += chunk.get('response', '')
            except json.JSONDecodeError:
                continue
        
        return content
        
    except Exception as e:
        print(f"解析响应失败: {str(e)}")
        return str(response.content)
    
def remove_think_tag(text: str) -> str:
    """
    移除文本中的<think>标签及其内容
    """
    return re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()