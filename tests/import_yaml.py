import yaml
from pathlib import Path

def load_config(config_name: str):
    config_path = Path("configs") / f"{config_name}.yaml"
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)

# 示例：加载 Ollama 配置
ollama_config = load_config("ollama")
print(ollama_config["ollama"]["default_model"])
