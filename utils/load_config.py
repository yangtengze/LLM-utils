import yaml
from pathlib import Path

def load_config(config_name: str):
    config_path = Path("configs") / f"{config_name}.yaml"
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)

configs = load_config("configs")
