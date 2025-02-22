import json

def parse_response(response: bytes, stream: bool) -> str:
    """
    解析 LLM 的响应
    :param response: LLM返回的原始响应
    :return: 解析后的文本内容
    """
    try:
        # 如果是非流式响应
        if not stream:
            json_data = json.loads(response.content.decode('utf-8'))
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
                content += chunk.get('response', '')
            except json.JSONDecodeError:
                continue
        
        return content
        
    except Exception as e:
        print(f"解析响应失败: {str(e)}")
        return str(response.content)