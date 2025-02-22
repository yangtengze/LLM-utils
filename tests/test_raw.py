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